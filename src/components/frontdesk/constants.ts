import { Check, BedDouble, Calendar, Sparkles, Wrench } from 'lucide-react';
import type { Room, GuestOrder, Booking, ChatMessage, StaffCall } from '../../types';

export type DeskTab = 'rooms' | 'orders' | 'chat' | 'requests' | 'attendance' | 'reports' | 'housekeeping';

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  available: { label: 'Available', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: Check },
  booked: { label: 'Occupied', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: BedDouble },
  reserved: { label: 'Reserved', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', icon: Calendar },
  cleaning: { label: 'Cleaning', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Sparkles },
  maintenance: { label: 'Maintenance', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200', icon: Wrench },
};

export const ORDER_STATUS_FLOW: Record<string, string[]> = {
  pending: ['preparing'],
  preparing: ['served'],
  served: [],
  cancelled: [],
};

export const diffHours = (ciDate: string, ciTime: string, coDate: string, coTime: string): number => {
  const from = new Date(`${toIso(ciDate)}T${to24h(ciTime)}`);
  const to = new Date(`${toIso(coDate)}T${to24h(coTime)}`);
  const ms = to.getTime() - from.getTime();
  let hours = ms / (1000 * 60 * 60);
  if (hours <= 0) hours += 24;
  return Math.max(0, hours);
};

export const to24h = (t: string) => {
  // Try 12h format: "5:42 PM" or "5:42:23 PM" (with optional seconds)
  const m12 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1]);
    if (m12[4].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m12[4].toUpperCase() === 'AM' && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${m12[2]}`;
  }
  // Try 24h format: "17:42"
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Math.min(23, Math.max(0, parseInt(m24[1])));
    return `${h.toString().padStart(2, '0')}:${m24[2]}`;
  }
  return '00:00';
};

export const to12h = (t: string) => {
  const clean = t.trim();

  const m12 = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const suffix = m12[4].toUpperCase();
    const isPM = suffix === 'PM';
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    const h12 = h % 12 || 12;
    return `${h12}:${m12[2]} ${suffix}`;
  }

  const m24 = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    const hNum = parseInt(m24[1], 10);
    const ampm = hNum >= 12 ? 'PM' : 'AM';
    const h12 = hNum % 12 || 12;
    return `${h12}:${m24[2]} ${ampm}`;
  }

  return clean;
};

/** Formats a date string to locale date. If the date has no timezone info and
 *  the given time crosses midnight (time < ciTime on same date), bump by 1 day. */
export const displayDate = (date: string, time: string, ciDate: string, ciTime: string) => {
  const d = new Date(`${toIso(date)}T${to24h(time)}`);
  const ci = new Date(`${toIso(ciDate)}T${to24h(ciTime)}`);
  if (d <= ci) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString();
};

export const toIso = (s: string) => {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : s;
};

export const todayStr = () => {
  const d = new Date();
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
};

export const tomorrowStr = () => {
  const d = new Date(Date.now() + 86400000);
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
};

export const nowTime = () => {
  const raw = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  // Strip seconds if locale adds them (e.g. "5:42:23 PM" → "5:42 PM")
  return raw.replace(/^(\d{1,2}:\d{2})(:\d{2})?\s*(AM|PM)$/i, '$1 $3');
};

export const timeToMin = (t: string) => {
  const m12 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1]);
    if (m12[4].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m12[4].toUpperCase() === 'AM' && h === 12) h = 0;
    return h * 60 + parseInt(m12[2]);
  }
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return Math.min(23, Math.max(0, parseInt(m24[1]))) * 60 + parseInt(m24[2]);
  return 0;
};

export const minToTime12 = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${min.toString().padStart(2, '0')} ${ampm}`;
};

export const snapToNearest = (minutes: number, options: number[]) => {
  if (options.length === 0) return minutes;
  return options.reduce((prev, curr) => Math.abs(curr - minutes) < Math.abs(prev - minutes) ? curr : prev);
};

export const dt = (date: string, time: string) => `${toIso(date)}T${to24h(time)}`;

export interface InvoiceData {
  booking: Booking;
  room: Room;
  guestName: string;
  hours: number;
  roomCharge: number;
  extras: { item: string; amount: number }[];
  discount: number;
  total: number;
}

export interface BookingConflict {
  check_in_date: string;
  check_out_date: string;
  check_in_time: string;
  check_out_time: string;
  status: string;
}
