import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Room } from '../types';
import { Calendar, Clock, User, Mail, Phone, Check, CreditCard, ArrowLeft, Loader2, Building } from 'lucide-react';
import { getSettings } from '../lib/settings';

interface KioskModeProps {
  onNavigate: (screen: string) => void;
}

type KioskStep = 'select-room' | 'guest-details' | 'confirm' | 'success';

export default function KioskMode({ onNavigate }: KioskModeProps) {
  const [step, setStep] = useState<KioskStep>('select-room');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successRoom, setSuccessRoom] = useState('');
  const settings = getSettings();

  useEffect(() => {
    fetchAvailableRooms();
  }, []);

  const fetchAvailableRooms = async () => {
    setLoading(true);
    const { data } = await supabase.from('rooms').select('*').eq('status', 'available').order('room_number', { ascending: true });
    if (data) setRooms(data);
    setLoading(false);
  };

  const handleSelectRoom = (room: Room) => {
    setSelectedRoom(room);
    setStep('guest-details');
  };

  const handleSubmitDetails = () => {
    if (!guestName.trim()) { setError('Please enter your full name'); return; }
    if (!guestEmail.trim()) { setError('Please enter your email'); return; }
    if (!guestPhone.trim()) { setError('Please enter your phone number'); return; }
    setError(null);
    setStep('confirm');
  };

  const handleConfirmBooking = async () => {
    if (!selectedRoom) return;
    setLoading(true);
    setError(null);
    try {
      const { data: existingCustomer } = await supabase.from('customers').select('id').eq('email', guestEmail.trim().toLowerCase()).maybeSingle();
      let customerId = existingCustomer?.id;
      if (!customerId) {
        const { data: newCust, error: custErr } = await supabase.from('customers').insert({
          full_name: guestName.trim(), email: guestEmail.trim().toLowerCase(), phone: guestPhone.trim()
        }).select().single();
        if (custErr) throw custErr;
        customerId = newCust.id;
      }
      const now = new Date();
      const checkIn = now.toISOString().split('T')[0];
      const checkOut = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { error: bookErr } = await supabase.from('bookings').insert({
        room_id: selectedRoom.id, customer_id: customerId,
        check_in_date: checkIn, check_out_date: checkOut,
        check_in_time: '', check_out_time: '',
        total_price: Number(selectedRoom.price_per_hour) * 24,
        status: 'pending'
      });
      if (bookErr) throw bookErr;
      setSuccessRoom(selectedRoom.room_number);
      setStep('success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep('select-room');
    setSelectedRoom(null);
    setGuestName('');
    setGuestEmail('');
    setGuestPhone('');
    setError(null);
    setSuccessRoom('');
    fetchAvailableRooms();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-600 to-brand-900 flex items-center justify-center p-4 font-sans tracking-tight">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-surface-900 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center text-white font-bold text-lg">
              {settings.brand.hotelName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-white text-lg font-bold">{settings.brand.hotelName}</h1>
              <p className="text-brand-300 text-[10px] font-medium">Self Check-in Kiosk</p>
            </div>
          </div>
          {step !== 'select-room' && (
            <button onClick={step === 'success' ? resetForm : () => setStep('select-room')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer">
              <ArrowLeft className="w-3.5 h-3.5" /> {step === 'success' ? 'New Booking' : 'Back'}
            </button>
          )}
        </div>

        <div className="p-6 md:p-8">
          {step === 'select-room' && (
            <div>
              <h2 className="text-xl font-bold text-surface-900 mb-1">Select Your Room</h2>
              <p className="text-sm text-surface-400 mb-6">Choose an available room for your stay</p>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                </div>
              ) : rooms.length === 0 ? (
                <div className="text-center py-12 bg-surface-50 rounded-2xl border border-surface-100">
                  <Building className="w-12 h-12 text-surface-300 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-surface-600">No Rooms Available</h3>
                  <p className="text-sm text-surface-400 mt-1">Please check back later or contact the front desk.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {rooms.map(room => (
                    <button key={room.id} onClick={() => handleSelectRoom(room)}
                      className="bg-white border-2 border-surface-200 hover:border-brand-500 rounded-2xl p-5 text-left transition-all cursor-pointer hover:shadow-lg hover:shadow-brand-500/10 group">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="text-2xl font-bold text-surface-900 group-hover:text-brand-600 transition-colors">Suite {room.room_number}</span>
                          <p className="text-xs text-surface-400 mt-0.5">{room.type}</p>
                        </div>
                        <span className="text-lg font-bold text-brand-600">{settings.currencySymbol}{Number(room.price_per_hour).toFixed(0)}<span className="text-xs text-surface-400 font-normal">/hr</span></span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-surface-500">
                        <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> Up to {room.max_occupancy}</span>
                        {room.min_stay_hours && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Min {room.min_stay_hours}h</span>}
                      </div>
                      {room.description && <p className="text-xs text-surface-400 mt-2 line-clamp-2">{room.description}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'guest-details' && selectedRoom && (
            <div>
              <h2 className="text-xl font-bold text-surface-900 mb-1">Your Details</h2>
              <p className="text-sm text-surface-400 mb-6">Suite {selectedRoom.room_number} &middot; {selectedRoom.type}</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-1.5 flex items-center gap-1.5"><User className="w-4 h-4 text-brand-600" /> Full Name</label>
                  <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Jane Doe"
                    className="w-full bg-surface-50 border-2 border-surface-200 focus:border-brand-500 rounded-xl px-4 py-3 text-base focus:outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-1.5 flex items-center gap-1.5"><Mail className="w-4 h-4 text-brand-600" /> Email</label>
                  <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="e.g. jane@example.com"
                    className="w-full bg-surface-50 border-2 border-surface-200 focus:border-brand-500 rounded-xl px-4 py-3 text-base focus:outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-1.5 flex items-center gap-1.5"><Phone className="w-4 h-4 text-brand-600" /> Phone</label>
                  <input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="e.g. +1 234 567 890"
                    className="w-full bg-surface-50 border-2 border-surface-200 focus:border-brand-500 rounded-xl px-4 py-3 text-base focus:outline-none transition-colors" />
                </div>
                {error && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">{error}</div>}
                <button onClick={handleSubmitDetails}
                  className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white font-bold text-base rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-brand-600/25">
                  Continue to Review <ArrowLeft className="w-5 h-5 rotate-180" />
                </button>
              </div>
            </div>
          )}

          {step === 'confirm' && selectedRoom && (
            <div>
              <h2 className="text-xl font-bold text-surface-900 mb-1">Confirm Booking</h2>
              <p className="text-sm text-surface-400 mb-6">Please review your details below</p>
              <div className="bg-surface-50 rounded-2xl p-6 space-y-4 border border-surface-100 mb-6">
                <div className="flex items-center justify-between pb-3 border-b border-surface-200">
                  <span className="text-sm text-surface-500">Room</span>
                  <span className="text-base font-bold text-surface-900">Suite {selectedRoom.room_number} &middot; {selectedRoom.type}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-500">Guest</span>
                  <span className="text-base font-semibold text-surface-900">{guestName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-500">Email</span>
                  <span className="text-base font-semibold text-surface-900">{guestEmail}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-500">Phone</span>
                  <span className="text-base font-semibold text-surface-900">{guestPhone}</span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-surface-200">
                  <span className="text-base font-bold text-surface-900">Total</span>
                  <span className="text-2xl font-bold text-brand-600">{settings.currencySymbol}{(Number(selectedRoom.price_per_hour) * 24).toLocaleString()}</span>
                </div>
                <p className="text-[11px] text-surface-400 text-center">Rate based on 24-hour stay at {settings.currencySymbol}{Number(selectedRoom.price_per_hour).toFixed(0)}/hour</p>
              </div>
              {error && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm mb-4">{error}</div>}
              <button onClick={handleConfirmBooking} disabled={loading}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-surface-300 text-white font-bold text-base rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25">
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</> : <><CreditCard className="w-5 h-5" /> Confirm &amp; Book</>}
              </button>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-6">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-surface-900 mb-2">Booking Confirmed!</h2>
              <p className="text-base text-surface-500 mb-2">Your room is ready when you are.</p>
              <div className="bg-brand-50 rounded-2xl border-2 border-brand-200 p-6 max-w-xs mx-auto mb-6">
                <p className="text-sm text-brand-600 font-semibold mb-1">Your Suite Number</p>
                <p className="text-5xl font-bold text-brand-700">{successRoom}</p>
              </div>
              <p className="text-sm text-surface-400 mb-6">Please proceed to your room. The front desk will follow up to complete your check-in.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={resetForm}
                  className="px-6 py-3 bg-surface-900 text-white hover:bg-surface-800 rounded-xl font-semibold transition-all cursor-pointer text-sm">
                  <Building className="w-4 h-4 inline mr-1.5" /> New Booking
                </button>
                <button onClick={() => onNavigate('login')}
                  className="px-6 py-3 bg-surface-100 text-surface-600 hover:bg-surface-200 rounded-xl font-semibold transition-all cursor-pointer text-sm">
                  Staff Login
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}