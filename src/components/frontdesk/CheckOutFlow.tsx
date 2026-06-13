import { useState, useEffect } from 'react';
import { LogOut, Check, Loader2, Clock, User, DollarSign, X, CreditCard, ChevronLeft, ChevronRight } from 'lucide-react';
import { Room, GuestOrder } from '../../types';
import { supabase } from '../../lib/supabase';
import { diffHours, todayStr, nowTime, toIso } from './constants';

const DEFAULT_PAYMENT_OPTIONS = ['Cash', 'Credit Card', 'Debit Card', 'GCash', 'Bank Transfer'];

type Step = 'review' | 'payment';

interface CheckOutFlowProps {
  room: Room;
  currencySymbol: string;
  onClose: () => void;
  onBack?: () => void;
  onComplete: () => Promise<void>;
  showError: (title: string, msg: string) => void;
  showSuccess: (msg: string) => void;
  logActivity: (action: string, details: string, bookingId?: string) => Promise<void>;
  paymentOptions?: string[];
}

export function CheckOutFlow({ room, currencySymbol, onClose, onBack, onComplete, showError, showSuccess, logActivity, paymentOptions }: CheckOutFlowProps) {
  const [step, setStep] = useState<Step>('review');
  const [invoice, setInvoice] = useState<{ booking: any; orders: GuestOrder[]; charges: any[]; guestName: string; stayHours: number; bookedHours: number; minHours: number; checkIn: string; checkOut: string; roomCharge: number } | null>(null);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [discountDescription, setDiscountDescription] = useState('');
  const [chargeFullStay, setChargeFullStay] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [loading, setLoading] = useState(false);
  const opts = paymentOptions || DEFAULT_PAYMENT_OPTIONS;

  useEffect(() => {
    const load = async () => {
      const { data: booking } = await supabase
        .from('bookings')
        .select('*, customers(*)')
        .eq('room_id', room.id)
        .eq('status', 'checked-in')
        .order('check_in_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!booking) { showError('No Active Booking', `Suite #${room.room_number} has no checked-in booking.`); onClose(); return; }

      const { data: orders } = await supabase
        .from('guest_orders')
        .select('*, inventory_items(*)')
        .eq('booking_id', booking.id)
        .neq('status', 'cancelled');

      const { data: charges } = await supabase
        .from('booking_charges')
        .select('*')
        .eq('booking_id', booking.id);

      const bk = booking as any;
      const ci = bk.check_in_date;
      const ciTime = bk.check_in_time || '00:00';
      const co = todayStr();
      const coTime = nowTime();
      const hours = diffHours(ci, ciTime, co, coTime);
      const bookedHours = diffHours(ci, ciTime, bk.check_out_date, bk.check_out_time);
      const minHours = Math.max(bookedHours, room.min_stay_hours || bookedHours);
      const roomCharge = Math.round(Number(room.price_per_hour) * Math.max(hours, 0.5) * 100) / 100;
      const ordersTotal = (orders || []).reduce((s: number, o: GuestOrder) => s + Number(o.total_price), 0);
      const chargesTotal = (charges || []).reduce((s: number, c: any) => s + Number(c.amount), 0);

      setInvoice({
        booking: bk,
        orders: orders || [],
        charges: charges || [],
        guestName: bk.customers?.full_name || 'Guest',
        stayHours: hours,
        bookedHours,
        minHours,
        checkIn: `${bk.check_in_date} ${bk.check_in_time || ''}`,
        checkOut: `${todayStr()} ${nowTime()}`,
        roomCharge,
      });
    };
    load();
  }, [room.id]);

  const handleCheckOut = async () => {
    if (!invoice) return;
    setLoading(true);
    try {
      const effectiveRoomCharge = chargeFullStay
        ? Math.round(Number(room.price_per_hour) * invoice.bookedHours * 100) / 100
        : invoice.roomCharge;
      const totalBeforeDiscount = effectiveRoomCharge + invoice.orders.reduce((s: number, o: GuestOrder) => s + Number(o.total_price), 0) + invoice.charges.reduce((s: number, c: any) => s + Number(c.amount), 0);
      const discountAmount = discountType === 'percent' ? totalBeforeDiscount * (discount / 100) : discount;
      const totalWithDiscount = Math.max(0, totalBeforeDiscount - discountAmount);

      if (!paymentMethod) { showError('Payment Required', 'Select a payment method before checking out.'); setLoading(false); return; }

      const bookingUpdate: any = { status: 'completed' };
      if (discount > 0) {
        bookingUpdate.discount_amount = discountType === 'percent' ? discountAmount : discount;
        bookingUpdate.discount_description = discountDescription.trim() || null;
      }
      const { error: bookingErr } = await supabase.from('bookings').update(bookingUpdate).eq('id', invoice.booking.id);
      if (bookingErr) { showError('Check Out Failed', `Booking update error: ${bookingErr.message}`); setLoading(false); return; }

      const { error: roomErr } = await supabase.from('rooms').update({ status: 'cleaning' }).eq('id', room.id);
      if (roomErr) { showError('Check Out Failed', `Room update error: ${roomErr.message}`); setLoading(false); return; }

      const { error: paymentErr } = await supabase.from('payments').insert({
        booking_id: invoice.booking.id,
        amount: totalWithDiscount,
        method: paymentMethod,
        reference: paymentReference.trim() || `checkout-${invoice.booking.id.slice(0, 8)}`,
      });
      if (paymentErr) { showError('Payment Failed', paymentErr.message); setLoading(false); return; }

      const discountDesc = discount > 0 ? ` (discount: ${discountDescription.trim() || (discountType === 'percent' ? `${discount}% off` : `${currencySymbol}${discount} off`)} — ${currencySymbol}${discountAmount.toLocaleString()})` : '';
      await logActivity('Check Out', `${invoice.guestName} checked out of Suite #${room.room_number}. Total bill: ${currencySymbol}${totalWithDiscount.toLocaleString()} (paid via ${paymentMethod})${discountDesc}`, invoice.booking.id);
      await onComplete();
      showSuccess(`Guest checked out of Suite #${room.room_number}. Payment: ${currencySymbol}${totalWithDiscount.toLocaleString()} via ${paymentMethod}`);
      onClose();
    } catch (err: any) {
      showError('Check Out Failed', err.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  if (!invoice) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-elevated p-6 animate-scale-in"><Loader2 className="w-5 h-5 animate-spin mx-auto text-surface-400" /></div>
      </div>
    );
  }

  const ordersTotal = invoice.orders.reduce((s: number, o: GuestOrder) => s + Number(o.total_price), 0);
  const chargesTotal = invoice.charges.reduce((s: number, c: any) => s + Number(c.amount), 0);
  const effectiveHours = chargeFullStay ? invoice.bookedHours : invoice.stayHours;
  const effectiveRoomCharge = chargeFullStay
    ? Math.round(Number(room.price_per_hour) * invoice.bookedHours * 100) / 100
    : invoice.roomCharge;
  const totalBeforeDiscount = effectiveRoomCharge + ordersTotal + chargesTotal;
  const discountAmount = discountType === 'percent' ? totalBeforeDiscount * (discount / 100) : discount;
  const totalWithDiscount = Math.max(0, totalBeforeDiscount - discountAmount);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-elevated max-w-lg w-full overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>

        {/* Header with step indicators */}
        <div className="px-5 pt-5 pb-3.5 border-b border-surface-100">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button onClick={onBack} className="p-1 hover:bg-surface-0 rounded-md cursor-pointer flex items-center gap-1 text-[11px] text-surface-500 font-medium flex-shrink-0 transition-colors"><ChevronLeft className="w-3.5 h-3.5" /> Back</button>
            )}
            <div className="w-9 h-9 bg-rose-100 rounded-lg flex items-center justify-center flex-shrink-0"><LogOut className="w-4 h-4 text-rose-600" /></div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-surface-900 truncate">Check Out</h2>
              <p className="text-[10px] text-surface-400 truncate">Suite #{room.room_number} · {room.type}</p>
            </div>
            <button onClick={onClose} className="p-1 text-surface-300 hover:text-surface-500 hover:bg-surface-0 rounded-md cursor-pointer flex-shrink-0 transition-colors"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex items-center gap-2 mt-2.5">
            {(['review', 'payment'] as Step[]).map((s, i) => (
              <div key={s} className={`flex items-center gap-1.5 ${i < 1 ? 'flex-1' : ''}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors ${
                  step === s ? 'bg-rose-600 text-white' : 'bg-surface-100 text-surface-400'
                }`}>
                  {step === s ? <ChevronRight className="w-2.5 h-2.5" /> : i + 1}
                </div>
                <span className={`text-[9px] font-semibold capitalize transition-colors ${step === s ? 'text-rose-700' : 'text-surface-400'}`}>{s === 'review' ? 'Review' : 'Payment'}</span>
                {i < 1 && <div className="flex-1 h-px bg-surface-100" />}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Review */}
        {step === 'review' && (
          <div key="review" className="p-5 space-y-4 max-h-[55vh] overflow-y-auto animate-slide-up">
            <div className="space-y-2.5 bg-surface-0 rounded-xl p-3.5">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-surface-400" />
                <span className="text-xs font-semibold text-surface-900">{invoice.guestName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-surface-400" />
                <div className="text-[11px] text-surface-500">
                  <span className="font-semibold">{effectiveHours.toFixed(1)} hours</span>
                  {chargeFullStay && invoice.stayHours < invoice.bookedHours && (
                    <span className="text-amber-600 ml-1">(full {invoice.bookedHours.toFixed(1)}h booking)</span>
                  )}
                  <span className="text-surface-400 ml-2">{invoice.checkIn} → {invoice.checkOut}</span>
                </div>
              </div>
            </div>

            {/* Charge full booking toggle */}
            {invoice.stayHours < invoice.bookedHours && (
              <div className="bg-blue-50 rounded-xl p-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-blue-800">Charge Full Booking Hours</p>
                  <p className="text-[9px] text-blue-600 mt-0.5">Guest stayed {invoice.stayHours.toFixed(1)}h · Booking is {invoice.bookedHours.toFixed(1)}h ({Number(room.price_per_hour) * invoice.bookedHours - invoice.roomCharge > 0 ? `+${currencySymbol}${(Number(room.price_per_hour) * invoice.bookedHours - invoice.roomCharge).toFixed(2)}` : ''})</p>
                </div>
                <button
                  onClick={() => setChargeFullStay(!chargeFullStay)}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer ${chargeFullStay ? 'bg-blue-600' : 'bg-surface-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-xs transition-transform ${chargeFullStay ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            )}

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between py-1"><span className="text-surface-500 text-xs">Room Rate</span><span className="font-semibold text-surface-800 text-xs">{currencySymbol}{Number(room.price_per_hour).toLocaleString()}/hr</span></div>
              <div className="flex justify-between py-1"><span className="text-surface-500 text-xs">Room Charges</span><span className="font-semibold text-surface-800 text-xs">{currencySymbol}{effectiveRoomCharge.toLocaleString()}</span></div>
              {invoice.orders.length > 0 && (
                <div className="pt-1.5 border-t border-surface-100 space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-surface-400">F&B Orders</p>
                  {invoice.orders.map((o, i) => (
                    <div key={i} className="flex justify-between text-[11px]"><span className="text-surface-500">{o.inventory_items?.name || 'Item'} x{o.quantity}</span><span className="font-semibold text-surface-600">{currencySymbol}{Number(o.total_price).toLocaleString()}</span></div>
                  ))}
                </div>
              )}
              {invoice.charges.length > 0 && (
                <div className="pt-1.5 border-t border-surface-100 space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-surface-400">Additional Charges</p>
                  {invoice.charges.map((c: any, i: number) => (
                    <div key={i} className="flex justify-between text-[11px]"><span className="text-surface-500">{c.description}</span><span className="font-semibold text-surface-600">{currencySymbol}{Number(c.amount).toLocaleString()}</span></div>
                  ))}
                </div>
              )}
            </div>

            {(invoice.orders.length > 0 || invoice.charges.length > 0) && (
              <div className="bg-amber-50 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3 h-3 text-amber-600" />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700">Discount</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={0} max={discountType === 'percent' ? 100 : totalBeforeDiscount} step={1} value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="w-full bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 text-[11px] font-mono outline-none focus:border-amber-500 transition-colors" />
                  <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'amount' | 'percent')}
                    className="bg-white border border-amber-200 rounded-lg px-2 py-1.5 text-[11px] cursor-pointer outline-none">
                    <option value="amount">Amount</option>
                    <option value="percent">%</option>
                  </select>
                </div>
                <input type="text" value={discountDescription} onChange={(e) => setDiscountDescription(e.target.value)}
                  placeholder="Reason for discount"
                  className="w-full bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:border-amber-500 transition-colors" />
              </div>
            )}

            <div className="border-t border-surface-100 pt-2.5 space-y-1">
              <div className="flex justify-between text-xs"><span className="text-surface-500">Subtotal</span><span className="font-semibold text-surface-800">{currencySymbol}{totalBeforeDiscount.toLocaleString()}</span></div>
              {discount > 0 && <div className="flex justify-between text-xs"><span className="text-surface-500">Discount</span><span className="font-semibold text-rose-600">-{currencySymbol}{discountAmount.toLocaleString()}</span></div>}
              <div className="flex justify-between text-xs pt-2 border-t border-surface-100"><span className="font-bold text-surface-700">Total</span><span className="font-bold text-surface-900 text-base">{currencySymbol}{totalWithDiscount.toLocaleString()}</span></div>
            </div>
          </div>
        )}

        {/* Step 2: Payment */}
        {step === 'payment' && (
          <div key="payment" className="p-5 space-y-4 max-h-[55vh] overflow-y-auto animate-slide-up">
            {/* Brief summary */}
            <div className="bg-surface-0 rounded-xl p-3.5 space-y-1.5">
              <div className="flex justify-between text-xs"><span className="text-surface-500">Guest</span><span className="font-semibold text-surface-800">{invoice.guestName}</span></div>
              <div className="flex justify-between text-xs"><span className="text-surface-500">Room</span><span className="font-semibold text-surface-800">Suite #{room.room_number}</span></div>
              {discount > 0 && <div className="flex justify-between text-xs"><span className="text-surface-500">Discount</span><span className="font-semibold text-rose-600">-{currencySymbol}{discountAmount.toLocaleString()}</span></div>}
              <div className="flex justify-between text-xs pt-2 border-t border-surface-100"><span className="font-bold text-surface-700">Total Due</span><span className="font-bold text-rose-700 text-base">{currencySymbol}{totalWithDiscount.toLocaleString()}</span></div>
            </div>

            {/* Payment Method */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-surface-400 flex items-center gap-1 mb-2"><CreditCard className="w-3 h-3" /> Payment Method</p>
              <div className="grid grid-cols-2 gap-1.5">
                {opts.map((opt) => (
                  <button key={opt} onClick={() => setPaymentMethod(opt)}
                    className={`px-2.5 py-2.5 rounded-lg text-[11px] font-semibold cursor-pointer border transition-all ${
                      paymentMethod === opt
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-surface-500 border-surface-200 hover:border-rose-300 hover:text-rose-600'
                    }`}
                  >{opt}</button>
                ))}
              </div>
            </div>

            {/* Reference */}
            <div>
              <label className="block text-[9px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Reference <span className="font-normal normal-case">(optional)</span></label>
              <input type="text" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="e.g. OR #12345"
                className="input-field" />
            </div>
          </div>
        )}

        {/* Footer navigation */}
        <div className="px-5 py-3.5 border-t border-surface-100 flex gap-2.5">
          {step === 'payment' ? (
            <button onClick={() => setStep('review')} className="btn-secondary !px-3.5">
              <ChevronLeft className="w-3 h-3" /> Back
            </button>
          ) : (
            <button onClick={onClose} className="btn-secondary !px-3.5">Cancel</button>
          )}

          <div className="flex-1" />

          {step === 'review' && (
            <button onClick={() => setStep('payment')} className="btn-primary !px-4">
              Next: Payment <ChevronRight className="w-3 h-3" />
            </button>
          )}
          {step === 'payment' && (
            <button onClick={handleCheckOut} disabled={loading || !paymentMethod} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none">
              {loading ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Processing...</>
              ) : (
                <><Check className="w-3 h-3" /> Confirm & Pay {currencySymbol}{totalWithDiscount.toLocaleString()}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
