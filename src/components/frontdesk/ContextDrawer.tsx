import { useEffect, useState } from 'react';
import { X, Building, BedDouble, LogOut, Clock, DollarSign, User, Calendar, ChevronRight } from 'lucide-react';
import { Room, Booking } from '../../types';
import { StatusChip } from './StatusChip';
import { supabase } from '../../lib/supabase';
import { diffHours, todayStr, nowTime, STATUS_CONFIG, toIso, dt } from './constants';

interface ContextDrawerProps {
  room: Room;
  currencySymbol: string;
  onClose: () => void;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onStatusChange: (status: string) => void;
  onShowHistory: () => void;
  onEditBooking?: (booking: Booking) => void;
  onCancelBooking?: (booking: Booking) => void;
}

export function ContextDrawer({ room, currencySymbol, onClose, onCheckIn, onCheckOut, onStatusChange, onShowHistory, onEditBooking, onCancelBooking }: ContextDrawerProps) {
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [liveHours, setLiveHours] = useState(0);

  useEffect(() => {
    if (room.status !== 'booked') { setActiveBooking(null); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('bookings')
        .select('*, customers(*)')
        .eq('room_id', room.id)
        .eq('status', 'checked-in')
        .order('check_in_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setActiveBooking(data as any);
    };
    load();
    return () => { cancelled = true; };
  }, [room.id, room.status]);

  // Live stay timer
  useEffect(() => {
    if (!activeBooking?.check_in_date) return;
    const interval = setInterval(() => {
      const ci = new Date(dt(activeBooking.check_in_date, activeBooking.check_in_time || '00:00'));
      const diff = (Date.now() - ci.getTime()) / 3600000;
      setLiveHours(Math.max(0, diff));
    }, 30000);
    setLiveHours(0);
    return () => clearInterval(interval);
  }, [activeBooking?.check_in_date, activeBooking?.check_in_time]);

  return (
    <div className="w-80 bg-white border-l border-surface-100 overflow-y-auto flex-shrink-0 hidden lg:block">
      <div className="p-3.5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Room Details</h2>
          <button onClick={onClose} className="p-1 text-surface-300 hover:text-surface-500 hover:bg-surface-0 rounded-md transition-all cursor-pointer"><X className="w-3.5 h-3.5" /></button>
        </div>

        <div className="space-y-2">
          <div className="h-36 bg-surface-50 rounded-xl overflow-hidden">
            {room.image_url ? <img src={room.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Building className="w-8 h-8 text-surface-300" /></div>}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-surface-900">#{room.room_number}</p>
              <p className="text-xs text-surface-500 capitalize">{room.type}</p>
            </div>
            <StatusChip status={room.status} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-center text-sm">
          <div className="bg-surface-0 rounded-xl p-2.5">
            <DollarSign className="w-3.5 h-3.5 text-surface-400 mx-auto mb-0.5" />
            <p className="font-bold text-surface-900 text-sm">{currencySymbol}{Number(room.price_per_hour).toLocaleString()}</p>
            <p className="text-surface-400 text-[9px]">/hr</p>
          </div>
          <div className="bg-surface-0 rounded-xl p-2.5">
            <User className="w-3.5 h-3.5 text-surface-400 mx-auto mb-0.5" />
            <p className="font-bold text-surface-900 text-sm">{room.max_occupancy}</p>
            <p className="text-surface-400 text-[9px]">Guests</p>
          </div>
          <div className="bg-surface-0 rounded-xl p-2.5">
            <Building className="w-3.5 h-3.5 text-surface-400 mx-auto mb-0.5" />
            <p className="font-bold text-surface-900 text-sm capitalize">{room.status}</p>
            <p className="text-surface-400 text-[9px]">Status</p>
          </div>
        </div>

        {activeBooking && (
          <div className="bg-blue-50 rounded-xl p-3.5 space-y-2.5 border border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs font-bold text-blue-900">{(activeBooking as any).customers?.full_name || 'Guest'}</span>
              </div>
              <div className="flex gap-1.5">
                {onEditBooking && activeBooking && (
                  <button onClick={() => onEditBooking(activeBooking)} className="text-[9px] font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer">Edit</button>
                )}
                {onCancelBooking && activeBooking && (
                  <button onClick={() => onCancelBooking(activeBooking)} className="text-[9px] font-semibold text-rose-600 hover:text-rose-800 underline cursor-pointer">Cancel</button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-blue-600">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold">Stay: {liveHours.toFixed(1)} hours</span>
            </div>
            <div className="flex items-center gap-1.5 text-blue-600">
              <DollarSign className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold">{currencySymbol}{(liveHours * Number(room.price_per_hour)).toLocaleString()}</span>
            </div>
          </div>
        )}

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400 mb-1.5">Quick Actions</p>
          <div className="grid grid-cols-2 gap-1.5">
            {room.status === 'available' && (
              <button onClick={onCheckIn} className="col-span-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-all active:scale-[0.98] flex items-center justify-center gap-1.5">
                <BedDouble className="w-3.5 h-3.5" /> Check In
              </button>
            )}
            {room.status === 'booked' && (
              <button onClick={onCheckOut} className="col-span-2 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-all active:scale-[0.98] flex items-center justify-center gap-1.5">
                <LogOut className="w-3.5 h-3.5" /> Check Out
              </button>
            )}
            <button onClick={() => onStatusChange('available')} className="px-2.5 py-2 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-lg text-[10px] font-semibold cursor-pointer transition-all active:scale-[0.98]">Available</button>
            <button onClick={() => onStatusChange('reserved')} className="px-2.5 py-2 border border-purple-200 text-purple-700 hover:bg-purple-50 rounded-lg text-[10px] font-semibold cursor-pointer transition-all active:scale-[0.98]">Reserved</button>
            <button onClick={() => onStatusChange('cleaning')} className="px-2.5 py-2 border border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg text-[10px] font-semibold cursor-pointer transition-all active:scale-[0.98]">Cleaning</button>
            <button onClick={() => onStatusChange('maintenance')} className="px-2.5 py-2 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg text-[10px] font-semibold cursor-pointer transition-all active:scale-[0.98]">Maint.</button>
          </div>
        </div>

        <button onClick={onShowHistory} className="w-full flex items-center justify-between px-3 py-2.5 bg-surface-0 hover:bg-surface-50 rounded-lg text-[11px] font-semibold text-surface-500 cursor-pointer transition-all group">
          <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Booking History</span>
          <ChevronRight className="w-3 h-3 text-surface-300 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {room.description && (
          <div className="pt-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400 mb-0.5">Description</p>
            <p className="text-[11px] text-surface-500 leading-relaxed">{room.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
