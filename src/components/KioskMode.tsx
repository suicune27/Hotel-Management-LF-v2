import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Room } from '../types';
import {
  QrCode, ChevronRight, Check, Clock, User, Mail, Phone,
  Sun, Moon, CreditCard, ArrowLeft, Loader2, Building, Wifi, RefreshCw
} from 'lucide-react';
import { getSettings, type AppSettings } from '../lib/settings';

interface KioskModeProps {
  onNavigate: (screen: 'login' | 'guest-dashboard') => void;
}

type KioskStep = 'welcome' | 'select-room' | 'guest-details' | 'review' | 'success';

const ROOM_COLORS: Record<string, string> = {
  Standard: 'border-blue-500 bg-blue-50 hover:shadow-blue-200/50',
  Deluxe: 'border-emerald-500 bg-emerald-50 hover:shadow-emerald-200/50',
  Suite: 'border-purple-500 bg-purple-50 hover:shadow-purple-200/50',
  Penthouse: 'border-amber-500 bg-amber-50 hover:shadow-amber-200/50',
};

const ROOM_BADGE_COLORS: Record<string, string> = {
  Standard: 'bg-blue-100 text-blue-700',
  Deluxe: 'bg-emerald-100 text-emerald-700',
  Suite: 'bg-purple-100 text-purple-700',
  Penthouse: 'bg-amber-100 text-amber-700',
};

const DURATION_QUICKS = [3, 6, 12, 24];

export default function KioskMode({ onNavigate }: KioskModeProps) {
  const [step, setStep] = useState<KioskStep>('welcome');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [stayHours, setStayHours] = useState(3);
  const [customHours, setCustomHours] = useState('');
  const [isNightStay, setIsNightStay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingRooms, setFetchingRooms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  const now = new Date();
  const currentTimeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const checkOutDate = new Date(now.getTime() + stayHours * 3600000);
  const checkOutTimeFormatted = checkOutDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const checkOutDateFormatted = checkOutDate.toISOString().split('T')[0];

  useEffect(() => {
    fetchAvailableRooms();
    const handleSettingsUpdate = () => {
      setSettings(getSettings());
    };
    window.addEventListener('hotel-settings-updated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('hotel-settings-updated', handleSettingsUpdate);
    };
  }, []);

  const fetchAvailableRooms = async () => {
    setFetchingRooms(true);
    const { data } = await supabase.from('rooms').select('*').eq('status', 'available').order('room_number', { ascending: true });
    if (data) setRooms(data);
    setFetchingRooms(false);
  };

  const handleSelectRoom = (room: Room) => {
    setSelectedRoom(room);
    setStep('guest-details');
  };

  const handleStart = () => {
    setStep('select-room');
  };

  const handleDurationQuick = (h: number) => {
    setStayHours(h);
    setCustomHours('');
  };

  const handleDurationCustom = (val: string) => {
    const n = parseInt(val);
    if (!isNaN(n) && n > 0) {
      setStayHours(n);
      setCustomHours(val);
    } else {
      setCustomHours(val);
    }
  };

  const handleSubmitDetails = () => {
    if (!guestName.trim()) { setError('Please enter your full name'); return; }
    if (!guestEmail.trim()) { setError('Please enter your email'); return; }
    if (!guestPhone.trim() || !/^[\d\s\-\+\(\)]{7,20}$/.test(guestPhone.trim())) {
      setError('Please enter a valid phone number');
      return;
    }
    if (!customHours && !DURATION_QUICKS.includes(stayHours)) { setError('Please select a duration'); return; }
    setError(null);
    setStep('review');
  };

  const handleConfirmBooking = async () => {
    if (!selectedRoom) return;
    setLoading(true);
    setError(null);
    try {
      const email = guestEmail.trim().toLowerCase();
      const { data: existing } = await supabase.from('customers').select('id').eq('email', email).maybeSingle();
      let customerId: string;
      if (existing) {
        customerId = existing.id;
      } else {
        const { data: newC, error: custErr } = await supabase.from('customers').insert({
          full_name: guestName.trim(), email, phone: guestPhone.trim() || ''
        }).select('id').single();
        if (custErr || !newC) throw new Error('Failed to create customer');
        customerId = newC.id;
      }

      const ciDate = now.toISOString().split('T')[0];
      const ciTime = currentTimeFormatted;
      const coDate = isNightStay ? new Date(now.getTime() + 24 * 3600000 * stayHours).toISOString().split('T')[0] : checkOutDateFormatted;
      const coTime = checkOutTimeFormatted;
      const totalPrice = Number(selectedRoom.price_per_hour) * stayHours;

      const { error: bookErr } = await supabase.from('bookings').insert({
        room_id: selectedRoom.id, customer_id: customerId,
        check_in_date: ciDate, check_out_date: coDate,
        check_in_time: ciTime, check_out_time: coTime,
        total_price: totalPrice, status: 'checked-in'
      });
      if (bookErr) throw bookErr;

      await supabase.from('rooms').update({ status: 'booked' }).eq('id', selectedRoom.id);
      setStep('success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep('welcome');
    setSelectedRoom(null);
    setGuestName('');
    setGuestEmail('');
    setGuestPhone('');
    setStayHours(3);
    setCustomHours('');
    setIsNightStay(false);
    setError(null);
    fetchAvailableRooms();
  };

  const getTypeColor = (type: string) => {
    const key = Object.keys(ROOM_COLORS).find(k => type.toLowerCase().includes(k.toLowerCase()));
    return key ? ROOM_COLORS[key] : 'border-surface-200 bg-white hover:shadow-surface-200/50';
  };

  const getTypeBadge = (type: string) => {
    const key = Object.keys(ROOM_BADGE_COLORS).find(k => type.toLowerCase().includes(k.toLowerCase()));
    return key ? ROOM_BADGE_COLORS[key] : 'bg-surface-100 text-surface-600';
  };

  const totalPrice = selectedRoom ? Number(selectedRoom.price_per_hour) * stayHours : 0;

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
          {step !== 'welcome' && step !== 'success' && (
            <button
              onClick={() => {
                if (step === 'select-room') setStep('welcome');
                else if (step === 'guest-details') setStep('select-room');
                else if (step === 'review') setStep('guest-details');
                else resetForm();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}
        </div>

        <div className="p-6 md:p-8">
          {step === 'welcome' && (
            <div className="text-center py-6">
              <div className="w-24 h-24 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                <QrCode className="w-12 h-12 text-brand-600" />
              </div>
              <h2 className="text-3xl font-bold text-surface-900 mb-2">Self Check-In</h2>
              <p className="text-surface-400 text-sm mb-2">Welcome to {settings.brand.hotelName}</p>
              <p className="text-surface-400 text-xs mb-8">Scan your QR code or tap start to check in</p>
              <button
                onClick={handleStart}
                className="inline-flex items-center gap-3 px-10 py-4 bg-brand-600 hover:bg-brand-700 text-white font-bold text-lg rounded-2xl transition-all cursor-pointer shadow-lg shadow-brand-600/30 hover:shadow-xl hover:shadow-brand-600/40"
              >
                <QrCode className="w-6 h-6" /> Start <ChevronRight className="w-5 h-5" />
              </button>
              <div className="mt-8 flex items-center justify-center gap-1 text-xs text-surface-400">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Scanning for nearby devices...
              </div>
            </div>
          )}

          {step === 'select-room' && (
            <div>
              <h2 className="text-xl font-bold text-surface-900 mb-1">Select Your Room</h2>
              <p className="text-sm text-surface-400 mb-6">Choose an available room for your stay</p>
              {fetchingRooms ? (
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
                    <button
                      key={room.id}
                      onClick={() => handleSelectRoom(room)}
                      className={`relative bg-white border-2 rounded-2xl p-5 text-left transition-all cursor-pointer hover:shadow-lg group ${getTypeColor(room.type)}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="text-2xl font-bold text-surface-900">Room {room.room_number}</span>
                          <p className="text-xs text-surface-400 mt-0.5">{room.type}</p>
                        </div>
                        <span className="text-lg font-bold text-brand-600">{settings.currencySymbol}{Number(room.price_per_hour).toFixed(0)}<span className="text-xs text-surface-400 font-normal">/hr</span></span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-surface-500 mb-3">
                        <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> Up to {room.max_occupancy}</span>
                        {room.min_stay_hours && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Min {room.min_stay_hours}h</span>}
                      </div>
                      {room.description && <p className="text-xs text-surface-400 mb-3 line-clamp-2">{room.description}</p>}
                      <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full ${getTypeBadge(room.type)}`}>
                        {room.type}
                      </span>
                      <div className="mt-3 w-full py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl text-center transition-colors">
                        Select Room
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'guest-details' && selectedRoom && (
            <div>
              <h2 className="text-xl font-bold text-surface-900 mb-1">Guest Details</h2>
              <p className="text-sm text-surface-400 mb-4">Room {selectedRoom.room_number} &middot; {selectedRoom.type}</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-1.5 flex items-center gap-1.5"><User className="w-4 h-4 text-brand-600" /> Full Name <span className="text-rose-500">*</span></label>
                  <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Jane Doe"
                    className="w-full bg-surface-50 border-2 border-surface-200 focus:border-brand-500 rounded-xl px-4 py-3 text-base focus:outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-1.5 flex items-center gap-1.5"><Mail className="w-4 h-4 text-brand-600" /> Email <span className="text-rose-500">*</span></label>
                  <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="e.g. jane@example.com"
                    className="w-full bg-surface-50 border-2 border-surface-200 focus:border-brand-500 rounded-xl px-4 py-3 text-base focus:outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-1.5 flex items-center gap-1.5"><Phone className="w-4 h-4 text-brand-600" /> Phone <span className="text-rose-500">*</span></label>
                  <input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="e.g. +1 234 567 890"
                    className="w-full bg-surface-50 border-2 border-surface-200 focus:border-brand-500 rounded-xl px-4 py-3 text-base focus:outline-none transition-colors" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-1.5 flex items-center gap-1.5"><Clock className="w-4 h-4 text-brand-600" /> Duration</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {DURATION_QUICKS.map(h => (
                      <button key={h} onClick={() => handleDurationQuick(h)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${stayHours === h && !customHours ? 'bg-brand-600 text-white shadow-md' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>
                        {h}h
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-surface-400 font-medium">Custom:</span>
                    <input type="number" min="1" value={customHours} onChange={(e) => handleDurationCustom(e.target.value)} placeholder="Hours"
                      className="w-24 bg-surface-50 border-2 border-surface-200 focus:border-brand-500 rounded-xl px-3 py-2 text-sm focus:outline-none transition-colors" />
                    <span className="text-xs text-surface-400">hours</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-surface-50 rounded-2xl border border-surface-100">
                  <div className="flex items-center gap-2 text-xs">
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span className="text-surface-600">Check-in: <strong className="text-surface-800">{currentTimeFormatted}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Moon className="w-4 h-4 text-indigo-500" />
                    <span className="text-surface-600">Check-out: <strong className="text-surface-800">{checkOutTimeFormatted}</strong></span>
                  </div>
                </div>

                <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-surface-200 hover:border-brand-500 cursor-pointer transition-colors">
                  <input type="checkbox" checked={isNightStay} onChange={(e) => setIsNightStay(e.target.checked)}
                    className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500" />
                  <div className="text-sm">
                    <span className="font-semibold text-surface-800">Night Stay (Overnight)</span>
                    <p className="text-xs text-surface-400">Use hotel check-in/check-out times instead of hourly billing</p>
                  </div>
                </label>

                {error && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">{error}</div>}
                <button onClick={handleSubmitDetails}
                  className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white font-bold text-base rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-brand-600/25">
                  Continue to Review <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {step === 'review' && selectedRoom && (
            <div>
              <h2 className="text-xl font-bold text-surface-900 mb-1">Review & Confirm</h2>
              <p className="text-sm text-surface-400 mb-6">Please review your booking details below</p>
              <div className="bg-surface-50 rounded-2xl p-6 border border-surface-100 mb-6 space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">Room Details</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-surface-500">Room</span>
                    <span className="text-base font-bold text-surface-900">Room {selectedRoom.room_number} &middot; {selectedRoom.type}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm text-surface-500">Max Occupancy</span>
                    <span className="text-sm font-semibold text-surface-900">{selectedRoom.max_occupancy} guests</span>
                  </div>
                  {selectedRoom.description && (
                    <p className="text-xs text-surface-400 mt-2 italic">{selectedRoom.description}</p>
                  )}
                </div>
                <div className="border-t border-surface-200 pt-4">
                  <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">Guest</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-surface-500">Name</span>
                    <span className="text-base font-semibold text-surface-900">{guestName}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm text-surface-500">Email</span>
                    <span className="text-base font-semibold text-surface-900">{guestEmail}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm text-surface-500">Phone</span>
                    <span className="text-base font-semibold text-surface-900">{guestPhone}</span>
                  </div>
                </div>
                <div className="border-t border-surface-200 pt-4">
                  <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">Duration</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-surface-500">Stay</span>
                    <span className="text-base font-semibold text-surface-900">
                      {isNightStay ? `${stayHours} night${stayHours > 1 ? 's' : ''} (overnight)` : `${stayHours} hour${stayHours > 1 ? 's' : ''}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm text-surface-500">Check-in</span>
                    <span className="text-sm font-semibold text-surface-800">{currentTimeFormatted}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm text-surface-500">Check-out</span>
                    <span className="text-sm font-semibold text-surface-800">{checkOutTimeFormatted}</span>
                  </div>
                </div>
                <div className="border-t border-surface-200 pt-4 space-y-2">
                  <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">Price Breakdown</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-surface-500">Room rate ({settings.currencySymbol}{Number(selectedRoom.price_per_hour).toFixed(0)} &times; {stayHours})</span>
                    <span className="text-sm font-semibold text-surface-900">{settings.currencySymbol}{totalPrice.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-surface-200">
                    <span className="text-base font-bold text-surface-900">Total</span>
                    <span className="text-2xl font-bold text-brand-600">{settings.currencySymbol}{totalPrice.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              {error && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm mb-4">{error}</div>}
              <button onClick={handleConfirmBooking} disabled={loading}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-surface-300 text-white font-bold text-base rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25">
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</> : <><CreditCard className="w-5 h-5" /> Confirm Check-In</>}
              </button>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-6">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-surface-900 mb-1">Welcome, {guestName}!</h2>
              <p className="text-sm text-surface-500 mb-4">Your check-in is confirmed</p>
              <div className="bg-brand-50 rounded-2xl border-2 border-brand-200 p-6 max-w-xs mx-auto mb-6">
                <p className="text-sm text-brand-600 font-semibold mb-1">Your Room Number</p>
                <p className="text-5xl font-bold text-brand-700">{selectedRoom?.room_number}</p>
              </div>
              <div className="flex items-center justify-center gap-6 mb-4 text-sm">
                <div className="flex items-center gap-1.5 text-surface-500">
                  <Clock className="w-4 h-4" />
                  <span>Check-in: <strong className="text-surface-700">{currentTimeFormatted}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-surface-500">
                  <Clock className="w-4 h-4" />
                  <span>Check-out: <strong className="text-surface-700">{checkOutTimeFormatted}</strong></span>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 max-w-xs mx-auto mb-8">
                <div className="flex items-center gap-2 text-xs text-amber-800">
                  <Wifi className="w-4 h-4 flex-shrink-0" />
                  <span><strong>WiFi:</strong> Hotel-Guest / <strong>Password:</strong> welcome2024</span>
                </div>
              </div>
              <div className="flex gap-3 justify-center">
                <button onClick={() => onNavigate('guest-dashboard')}
                  className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold transition-all cursor-pointer text-sm shadow-lg shadow-brand-600/25">
                  Open Guest Portal
                </button>
                <button onClick={resetForm}
                  className="px-6 py-3 bg-surface-100 text-surface-600 hover:bg-surface-200 rounded-xl font-semibold transition-all cursor-pointer text-sm flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4" /> Start Over
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
