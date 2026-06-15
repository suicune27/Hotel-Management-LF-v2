import { useState, useEffect } from 'react';
import { BedDouble, Check, Loader2, Search, ChevronRight, ChevronLeft, User, Calendar, AlertTriangle } from 'lucide-react';

import { TimePicker } from './TimePicker';
import { Room, Booking } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  diffHours, todayStr, tomorrowStr, nowTime, toIso, to24h, timeToMin, minToTime12,
  snapToNearest, dt, BookingConflict,
} from './constants';

interface CheckInWizardProps {
  room: Room;
  mode?: 'checkin' | 'reservation';
  booking?: Booking;
  currencySymbol: string;
  onClose: () => void;
  onBack?: () => void;
  onComplete: () => Promise<void>;
  showError: (title: string, msg: string) => void;
  showSuccess: (msg: string) => void;
  userProfileId: string;
  logActivity: (action: string, details: string) => Promise<void>;
}

type Step = 'guest' | 'schedule' | 'confirm';

function fmtDate(iso: string): string {
  if (!iso) return todayStr();
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

export function CheckInWizard({ room, mode = 'checkin', booking, currencySymbol, onClose, onBack, onComplete, showError, showSuccess, userProfileId, logActivity }: CheckInWizardProps) {
  const [step, setStep] = useState<Step>(booking ? 'confirm' : 'guest');
  const [guestName, setGuestName] = useState(() => booking?.customers?.full_name || '');
  const [guestEmail, setGuestEmail] = useState(() => booking?.customers?.email || '');
  const [checkInDate, setCheckInDate] = useState(() => booking ? fmtDate(booking.check_in_date) : todayStr());
  const [checkOutDate, setCheckOutDate] = useState(() => booking ? fmtDate(booking.check_out_date) : tomorrowStr());
  const [checkInTime, setCheckInTime] = useState(() => booking?.check_in_time || nowTime());
  const [checkOutTime, setCheckOutTime] = useState(() => booking?.check_out_time || '12:00 PM');
  const [roomBookings, setRoomBookings] = useState<BookingConflict[]>([]);
  const [bookingCheckLoading, setBookingCheckLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Group Booking Variables
  const [isGroupBooking, setIsGroupBooking] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [selectedGroupRoomIds, setSelectedGroupRoomIds] = useState<string[]>([]);

  useEffect(() => {
    if (!booking) {
      const hrs = room.min_stay_hours || 3;
      const ciOpts = (room.check_in_times || []).map(timeToMin);
      const coOpts = (room.check_out_times || []).map(timeToMin);
      const nowM = new Date().getHours() * 60 + new Date().getMinutes();
      const snapCiM = snapToNearest(nowM, ciOpts);
      setCheckInTime(minToTime12(snapCiM));
      const minCoM = snapCiM + hrs * 60;
      let coDays = Math.floor(minCoM / 1440);
      let coM = minCoM % 1440;
      const sorted = [...coOpts].sort((a, b) => a - b);
      let snapCoM = sorted.find((t) => t >= coM);
      if (snapCoM === undefined) { coDays += 1; snapCoM = sorted.length > 0 ? sorted[0] : coM; }
      setCheckOutTime(minToTime12(snapCoM));
      if (coDays > 0) {
        const d = new Date(); d.setDate(d.getDate() + coDays);
        setCheckOutDate(`${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`);
      }

      // Load other available rooms for group booking linkage
      supabase.from('rooms').select('*').eq('status', 'available').neq('id', room.id).then(({ data }) => {
        if (data) setAvailableRooms(data);
      });
    }
    loadBookings();
  }, []);

  const loadBookings = async () => {
    setBookingCheckLoading(true);
      const { data } = await supabase
        .from('bookings')
        .select('check_in_date, check_out_date, check_in_time, check_out_time, status')
        .eq('room_id', room.id)
        .filter('status', 'not.in', '(completed,cancelled)')
        .order('check_in_date', { ascending: true });
      const active = (data || []) as BookingConflict[];
    // Latest first
    active.sort((a, b) => {
      const d = new Date(dt(b.check_in_date, b.check_in_time)).getTime() - new Date(dt(a.check_in_date, a.check_in_time)).getTime();
      if (d !== 0) return d;
      return new Date(dt(b.check_out_date, b.check_out_time)).getTime() - new Date(dt(a.check_out_date, a.check_out_time)).getTime();
    });
    setRoomBookings(active);
    setBookingCheckLoading(false);
  };

  const getConflicts = (from: string, to: string, fromTime?: string, toTime?: string) => {
    return roomBookings.filter((b) => {
      const bFrom = dt(b.check_in_date, b.check_in_time);
      const bTo = dt(b.check_out_date, b.check_out_time);
      const newFrom = dt(from, fromTime || '00:00');
      const newTo = dt(to, toTime || '23:59');
      // No overlap if new booking is entirely after existing ends
      if (newFrom >= bTo) return false;
      // No overlap if new booking is entirely before existing starts
      if (newTo <= bFrom) return false;
      return true;
    });
  };

  const ciDate = toIso(checkInDate || todayStr());
  const coDate = toIso(checkOutDate || tomorrowStr());
  const ciTime = to24h(checkInTime || '00:00');
  const coTime = to24h(checkOutTime || '23:59');
  const stayHrs = booking
    ? diffHours(booking.check_in_date, booking.check_in_time, booking.check_out_date, booking.check_out_time)
    : diffHours(ciDate, ciTime, coDate, coTime);
  const totalPrice = booking ? Number(booking.total_price) : Math.round(Number(room.price_per_hour) * stayHrs * 100) / 100;
  const minStay = room.min_stay_hours || 3;
  const rawConflicts = booking ? [] : getConflicts(checkInDate, checkOutDate, checkInTime, checkOutTime);
  // For walk-in, allow booking if guest arrival is > minStay hours from now (future walk-in)
  const hoursUntilCheckIn = (new Date(dt(ciDate, ciTime)).getTime() - Date.now()) / 3600000;
  const isFutureWalkin = mode !== 'reservation' && hoursUntilCheckIn > minStay;
  const conflicts = isFutureWalkin ? [] : rawConflicts;
  const isValid = guestName.trim().length > 0 && stayHrs >= minStay && conflicts.length === 0 && dt(ciDate, ciTime) < dt(coDate, coTime);

  const handleConfirm = async () => {
    if (!isValid) return;
    setActionLoading(true);
    try {
      if (booking) {
        const { error: bookErr } = await supabase.from('bookings').update({
          status: 'checked-in',
          assigned_employee_id: userProfileId || null,
        }).eq('id', booking.id);
        if (bookErr) { showError('Check In Failed', `Booking error: ${bookErr.message}`); setActionLoading(false); return; }

        const { error: roomErr } = await supabase.from('rooms').update({ status: 'booked' }).eq('id', room.id);
        if (roomErr) {
          const hint = roomErr.message.includes('rooms_status_check')
            ? ' The database CHECK constraint may be out of sync with schema.sql.'
            : '';
          showError('Check In Failed', `Room status error: ${roomErr.message}.${hint}`);
          setActionLoading(false); return;
        }

        await logActivity('Check In', `${(booking.customers as any)?.full_name || guestName} checked into Suite #${room.room_number} (existing booking)`);
        await onComplete();
        showSuccess(`Guest checked in to Suite #${room.room_number}`);
        onClose();
        return;
      }

      const isReservation = mode === 'reservation';
      // Use user-specified time for reservations and future walk-ins, otherwise force now
      const actualCiDate = isReservation || isFutureWalkin ? ciDate : toIso(todayStr());
      const actualCiTime = isReservation || isFutureWalkin ? ciTime : to24h(nowTime());
      const actualStayHrs = diffHours(actualCiDate, actualCiTime, coDate, coTime);
      const actualTotal = Math.round(Number(room.price_per_hour) * Math.max(actualStayHrs, 0.5) * 100) / 100;

      let customerId: string | null = null;
      const customerEmail = guestEmail.trim() || `guest-${Date.now()}@temp.local`;
      const { data: existing } = await supabase.from('customers').select('id').eq('email', customerEmail).maybeSingle();
      if (existing) { customerId = existing.id; }
      else {
        const { data: newC } = await supabase.from('customers').insert({
          full_name: guestName.trim(), email: customerEmail, phone: '',
        }).select('id').single();
        if (newC) customerId = newC.id;
      }

      let groupId: string | null = null;
      if (isGroupBooking) {
        const { data: groupData, error: groupErr } = await supabase.from('booking_groups').insert({
          name: groupName.trim() || `${guestName.trim()} Group`,
          contact_name: guestName.trim(),
          contact_email: customerEmail,
          contact_phone: '',
          total_rooms: 1 + selectedGroupRoomIds.length,
          status: isReservation ? 'confirmed' : 'checked-in',
          notes: 'Unified Corporate booking created directly from Check-In wizard.',
        }).select('id').single();

        if (groupErr) {
          showError('Group Account Creation Failed', `Group error: ${groupErr.message}`);
          setActionLoading(false);
          return;
        }
        if (groupData) {
          groupId = groupData.id;
        }
      }

      const { error: bookingError } = await supabase.from('bookings').insert({
        room_id: room.id,
        customer_id: customerId,
        check_in_date: actualCiDate,
        check_out_date: coDate,
        check_in_time: actualCiTime,
        check_out_time: coTime,
        total_price: actualTotal,
        group_id: groupId,
        status: isReservation ? 'confirmed' : 'checked-in',
        assigned_employee_id: userProfileId || null,
      });
      if (bookingError) { showError('Check In Failed', `Booking error: ${bookingError.message}`); setActionLoading(false); return; }

      const nextRoomStatus = isReservation ? 'reserved' : 'booked';
      const VALID_STATUSES = ['available', 'booked', 'reserved', 'cleaning', 'maintenance'];
      if (!VALID_STATUSES.includes(nextRoomStatus)) {
        showError(`${isReservation ? 'Reservation' : 'Check In'} Failed`, `Invalid room status "${nextRoomStatus}" — contact support.`);
        setActionLoading(false); return;
      }
      const { error: roomErr } = await supabase.from('rooms').update({ status: nextRoomStatus }).eq('id', room.id);
      if (roomErr) {
        const hint = roomErr.message.includes('rooms_status_check') && VALID_STATUSES.includes(nextRoomStatus)
          ? ` Status "${nextRoomStatus}" is valid in code but rejected by DB — the database CHECK constraint may be out of sync with schema.sql.`
          : '';
        showError(`${isReservation ? 'Reservation' : 'Check In'} Failed`, `Room status error: ${roomErr.message}.${hint}`);
        setActionLoading(false); return;
      }

      // Link any selected additional rooms under this transaction
      if (isGroupBooking && selectedGroupRoomIds.length > 0) {
        for (const targetId of selectedGroupRoomIds) {
          const matchedRoom = availableRooms.find(r => r.id === targetId);
          if (!matchedRoom) continue;
          
          const targetTotal = Math.round(Number(matchedRoom.price_per_hour) * Math.max(actualStayHrs, 0.5) * 100) / 100;
          await supabase.from('bookings').insert({
            room_id: matchedRoom.id,
            customer_id: customerId,
            check_in_date: actualCiDate,
            check_out_date: coDate,
            check_in_time: actualCiTime,
            check_out_time: coTime,
            total_price: targetTotal,
            group_id: groupId,
            status: isReservation ? 'confirmed' : 'checked-in',
            assigned_employee_id: userProfileId || null,
          });

          await supabase.from('rooms').update({ status: nextRoomStatus }).eq('id', matchedRoom.id);
        }
      }

      const { data: verify } = await supabase.from('rooms').select('status').eq('id', room.id).single();
      if ((verify as any)?.status !== nextRoomStatus) {
        showError(`${isReservation ? 'Reservation' : 'Check In'} Blocked`, 'Room status update was silently rejected.');
        setActionLoading(false);
        return;
      }

      await logActivity(
        isReservation ? 'Create Reservation' : 'Check In',
        isReservation
          ? `${guestName.trim()} reserved Suite #${room.room_number}${isGroupBooking ? ` (+ ${selectedGroupRoomIds.length} linked rooms)` : ''} (${checkInDate} ${checkInTime} to ${checkOutDate} ${checkOutTime}) — ${currencySymbol}${actualTotal.toLocaleString()}`
          : `${guestName.trim()} checked into Suite #${room.room_number}${isGroupBooking ? ` (+ ${selectedGroupRoomIds.length} linked rooms)` : ''} (${Math.round(actualStayHrs * 10) / 10}h @ ${currencySymbol}${Number(room.price_per_hour).toLocaleString()}/hr — ${currencySymbol}${actualTotal.toLocaleString()})`
      );
      await onComplete();
      showSuccess(isReservation 
        ? `Reservation created for Suite #${room.room_number}${isGroupBooking ? ` and ${selectedGroupRoomIds.length} linked rooms under "${groupName}"` : ''}` 
        : `Guest checked in to Suite #${room.room_number}${isGroupBooking ? ` and ${selectedGroupRoomIds.length} linked rooms under "${groupName}"` : ''}`
      );
      onClose();
    } catch (err: any) {
      showError(mode === 'reservation' ? 'Reservation Failed' : 'Check In Failed', err.message || 'Unexpected error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-elevated max-w-lg w-full overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3.5 border-b border-surface-100">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button onClick={onBack} className="p-1 hover:bg-surface-0 rounded-md cursor-pointer flex items-center gap-1 text-[11px] text-surface-500 font-medium flex-shrink-0 transition-colors"><ChevronLeft className="w-3.5 h-3.5" /> Back</button>
            )}
            <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0"><BedDouble className="w-4 h-4 text-emerald-600" /></div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-surface-900 truncate">
                {booking ? 'Check In' : mode === 'reservation' ? 'Create Reservation' : 'Check In'} — Suite #{room.room_number}
              </h2>
              <p className="text-[10px] text-surface-400 truncate">{room.type} · Min {minStay}h stay · {currencySymbol}{Number(room.price_per_hour).toLocaleString()}/hr</p>
            </div>
          </div>
          {!booking && (
            <div className="flex items-center gap-2 mt-2.5">
              {(['guest', 'schedule', 'confirm'] as Step[]).map((s, i) => (
                <div key={s} className={`flex items-center gap-1.5 ${i < 2 ? 'flex-1' : ''}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors ${
                    step === s ? 'bg-brand-600 text-white' : 'bg-surface-100 text-surface-400'
                  }`}>
                    {step === s ? <ChevronRight className="w-2.5 h-2.5" /> : i + 1}
                  </div>
                  <span className={`text-[9px] font-semibold capitalize transition-colors ${step === s ? 'text-brand-700' : 'text-surface-400'}`}>{s === 'guest' ? 'Guest' : s === 'schedule' ? 'Schedule' : 'Confirm'}</span>
                  {i < 2 && <div className="flex-1 h-px bg-surface-100" />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 space-y-3.5 max-h-[50vh] overflow-y-auto">
          {!booking && step === 'guest' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-surface-500 mb-1">Guest Name *</label>
                <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. John Smith"
                  className="input-field" autoFocus />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-surface-500 mb-1">Guest Email <span className="text-surface-300 font-normal">(optional)</span></label>
                <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="e.g. john@example.com"
                  className="input-field" />
              </div>
              <div className="bg-surface-0 rounded-xl p-2.5 flex items-center gap-2 text-[11px] text-surface-500">
                <Search className="w-3 h-3 text-surface-400" />
                Existing guest? Search will auto-link by email.
              </div>

              {/* Group Booking & Corporate Account Linkage */}
              <div className="border border-surface-150 rounded-xl p-3 bg-surface-50/50 space-y-2.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-surface-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isGroupBooking}
                    onChange={(e) => {
                      setIsGroupBooking(e.target.checked);
                      if (e.target.checked && !groupName) {
                        setGroupName(guestName ? `${guestName.trim()} Group` : '');
                      }
                    }}
                    className="rounded text-brand-600 focus:ring-brand-500 w-3.5 h-3.5"
                  />
                  <span>Create Multi-Room Group Booking</span>
                </label>

                {isGroupBooking && (
                  <div className="space-y-2.5 pt-1 border-t border-surface-100 mt-2">
                    <div>
                      <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wide mb-1">Group / Corporate Name *</label>
                      <input
                        type="text"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="e.g. Acme Corp Travel"
                        className="input-field py-1 px-2.5 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wide mb-1">
                        Select Rooms to Link ({selectedGroupRoomIds.length} linked)
                      </label>
                      {availableRooms.length === 0 ? (
                        <p className="text-[10px] text-surface-400 italic">No other available rooms in service.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto border border-surface-100 rounded-lg p-2 bg-white">
                          {availableRooms.map((r) => {
                            const isSelected = selectedGroupRoomIds.includes(r.id);
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedGroupRoomIds(selectedGroupRoomIds.filter(id => id !== r.id));
                                  } else {
                                    setSelectedGroupRoomIds([...selectedGroupRoomIds, r.id]);
                                  }
                                }}
                                className={`flex items-center justify-between text-left px-2 py-1 rounded border text-[10px] transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-brand-50 border-brand-200 text-brand-700 font-bold'
                                    : 'bg-surface-0 border-surface-100 text-surface-600 hover:bg-surface-50'
                                }`}
                              >
                                <span className="truncate">Suite #{r.room_number} ({r.type})</span>
                                <span className="font-mono font-medium text-surface-400 ml-1 flex-shrink-0">{currencySymbol}{Number(r.price_per_hour)}/h</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!booking && step === 'schedule' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-surface-500">Check In</label>
                  <input type="text" inputMode="numeric" value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)} placeholder="mm/dd/yyyy"
                    className="input-field" />
                  <TimePicker value={checkInTime} onChange={setCheckInTime} options={room.check_in_times || []} placeholder="e.g. 2:00 PM" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-surface-500">Check Out</label>
                  <input type="text" inputMode="numeric" value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)} placeholder="mm/dd/yyyy"
                    className="input-field" />
                  <TimePicker value={checkOutTime} onChange={setCheckOutTime} options={room.check_out_times || []} placeholder="e.g. 12:00 PM" />
                </div>
              </div>

              <div className="bg-surface-0 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-surface-400">Availability</span>
                  {bookingCheckLoading && <Loader2 className="w-2.5 h-2.5 animate-spin text-surface-400" />}
                </div>
                {(() => {
                  const visibleBookings = roomBookings.filter(b => b.status !== 'cancelled' && b.status !== 'Cancelled' && b.status !== 'CANCELLED');
                  if (visibleBookings.length === 0 && !bookingCheckLoading) {
                    return <p className="text-[11px] text-surface-400">No existing bookings — room is free.</p>;
                  }
                  if (visibleBookings.length === 0) return null;
                  return (
                    <div className="space-y-1 max-h-28 overflow-y-auto -mx-1 px-1">
                      {visibleBookings.map((b, i) => {
                      const isOccupied = b.status === 'checked-in';
                      const isConfirmed = b.status === 'confirmed';
                      const isPending = b.status === 'pending';
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                            isOccupied
                              ? 'bg-rose-50 text-rose-700 font-semibold'
                              : isConfirmed
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-surface-50 text-surface-600'
                          }`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            isOccupied ? 'bg-rose-500 animate-pulse' : isConfirmed ? 'bg-emerald-500' : 'bg-surface-300'
                          }`} />
                          <span className="truncate font-medium">
                            {b.check_in_date} {b.check_in_time} → {b.check_out_date} {b.check_out_time}
                          </span>
                          <span className={`text-[7px] font-bold uppercase tracking-wider ml-auto flex-shrink-0 ${
                            isOccupied ? 'text-rose-600' : isConfirmed ? 'text-emerald-600' : 'text-surface-400'
                          }`}>
                            {isOccupied ? '● NOW' : isConfirmed ? 'Reserved' : isPending ? 'Pending' : b.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  );
                })()}
                {conflicts.length > 0 ? (
                  <div className="mt-2 px-2 py-1.5 bg-rose-50 rounded-lg text-[10px] text-rose-600 font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    Time range overlaps with an existing booking
                  </div>
                ) : roomBookings.length > 0 && !isFutureWalkin ? (
                  <div className="mt-2 px-2 py-1.5 bg-emerald-50 rounded-lg text-[10px] text-emerald-600 font-semibold flex items-center gap-1.5">
                    <Check className="w-3 h-3 flex-shrink-0" />
                    Room available for selected time
                  </div>
                ) : null}
              </div>

              <div className="space-y-1 text-[11px]">
                {stayHrs < minStay && <p className="text-rose-500 flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> Minimum stay: {minStay}h (selected: {Math.round(stayHrs * 10) / 10}h)</p>}
                {dt(ciDate, ciTime) >= dt(coDate, coTime) && <p className="text-rose-500 flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> Check-out must be after check-in</p>}
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-3">
              <div className="bg-surface-0 rounded-xl divide-y divide-surface-100">
                <div className="p-2.5 flex items-center gap-2.5">
                  <User className="w-3.5 h-3.5 text-surface-400" />
                  <div><p className="text-[11px] font-semibold text-surface-900">{guestName || 'Guest'}</p>{guestEmail && <p className="text-[9px] text-surface-400">{guestEmail}</p>}</div>
                </div>
                <div className="p-2.5 flex items-center gap-2.5">
                  <Calendar className="w-3.5 h-3.5 text-surface-400" />
                  <div><p className="text-[11px] text-surface-700">{checkInDate} {checkInTime} → {checkOutDate} {checkOutTime}</p><p className="text-[9px] text-surface-400">{Math.round(stayHrs * 10) / 10} hours</p></div>
                </div>
              </div>

              <div className="bg-brand-50 rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-surface-500">Duration</span><span className="font-semibold text-surface-800">{Math.round(stayHrs * 10) / 10} hours</span></div>
                <div className="flex justify-between text-sm"><span className="text-surface-500">Rate</span><span className="font-semibold text-surface-800">{currencySymbol}{Number(room.price_per_hour).toLocaleString()}/hr</span></div>
                <div className="border-t border-brand-200 pt-2 flex justify-between text-sm"><span className="font-bold text-surface-600">Estimated Total</span><span className="font-bold text-surface-900 text-base">{currencySymbol}{totalPrice.toLocaleString()}</span></div>
                {booking && (
                  <div className="text-[9px] text-surface-400 text-center pt-1">This booking was pre-reserved. Check-in will activate the existing reservation.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-surface-100 flex gap-2.5">
          {!booking && step !== 'guest' ? (
            <button onClick={() => setStep(step === 'schedule' ? 'guest' : 'schedule')} className="btn-secondary !px-3.5">
              <ChevronLeft className="w-3 h-3" /> Back
            </button>
          ) : (
            <button onClick={onClose} className="btn-secondary !px-3.5">Cancel</button>
          )}

          <div className="flex-1" />

          {!booking && step === 'guest' && (
            <button onClick={() => setStep('schedule')} disabled={!guestName.trim()} className="btn-primary !px-4">
              Next <ChevronRight className="w-3 h-3" />
            </button>
          )}
          {!booking && step === 'schedule' && (
            <button onClick={() => setStep('confirm')} disabled={stayHrs < minStay || conflicts.length > 0 || dt(ciDate, ciTime) >= dt(coDate, coTime)} className="btn-primary !px-4">
              Review <ChevronRight className="w-3 h-3" />
            </button>
          )}
          {step === 'confirm' && (
            <button onClick={handleConfirm} disabled={!isValid || actionLoading} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none">
              {actionLoading ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> {mode === 'reservation' ? 'Saving...' : 'Checking in...'}</>
              ) : (
                <><Check className="w-3 h-3" /> {booking ? 'Confirm Check In' : mode === 'reservation' ? 'Confirm Reservation' : 'Confirm Check In'}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
