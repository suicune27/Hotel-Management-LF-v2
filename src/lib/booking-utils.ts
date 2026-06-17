import { toIso, to24h, minToTime12, todayStr, tomorrowStr } from '../components/frontdesk/constants';

const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

export interface DurationPreset {
  label: string;
  hours: number;
}

export const DURATION_PRESETS: DurationPreset[] = [
  { label: '3 Hours', hours: 3 },
  { label: '6 Hours', hours: 6 },
  { label: '12 Hours', hours: 12 },
  { label: '24 Hours', hours: 24 },
];

export const EXTEND_PRESETS: DurationPreset[] = [
  { label: '+3 Hours', hours: 3 },
  { label: '+6 Hours', hours: 6 },
  { label: '+12 Hours', hours: 12 },
  { label: '+24 Hours', hours: 24 },
];

export function combineDateAndTime(isoDate: string, time12: string): Date {
  const [year, month, day] = toIso(isoDate).split('-').map(Number);
  const [hours, minutes] = to24h(time12).split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function hoursBetween(ciDate: string, ciTime: string, coDate: string, coTime: string): number {
  const ms = combineDateAndTime(coDate, coTime).getTime() - combineDateAndTime(ciDate, ciTime).getTime();
  let hours = ms / MS_PER_HOUR;
  if (hours <= 0) hours += 24;
  return Math.max(0, hours);
}

export function addHoursToDate(isoDate: string, time12: string, hours: number): { date: string; time: string } {
  const d = combineDateAndTime(isoDate, time12);
  d.setTime(d.getTime() + hours * MS_PER_HOUR);
  const m = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
  return { date: m, time: minToTime12(d.getHours() * 60 + d.getMinutes()) };
}

export function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function getMinStay(room: { min_stay_hours?: number | null }): number {
  return room.min_stay_hours || 3;
}

export function calcRoomCharge(pricePerHour: number, hours: number): number {
  return Math.round(pricePerHour * Math.max(hours, 0.5) * 100) / 100;
}

export function isCheckOutBeforeCheckIn(ciDate: string, ciTime: string, coDate: string, coTime: string): boolean {
  return combineDateAndTime(ciDate, ciTime) >= combineDateAndTime(coDate, coTime);
}

export function formatDateDisplay(isoDate: string): string {
  if (!isoDate) return todayStr();
  const [y, m, d] = isoDate.split('-');
  return `${m}/${d}/${y}`;
}
