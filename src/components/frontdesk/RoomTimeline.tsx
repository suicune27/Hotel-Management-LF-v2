import { Clock, CheckCircle2, Circle, ArrowRight } from 'lucide-react';

export interface TimelineEvent {
  label: string;
  date?: string;
  time?: string;
  done: boolean;
  active?: boolean;
}

interface RoomTimelineProps {
  events: TimelineEvent[];
  className?: string;
}

export function RoomTimeline({ events, className = '' }: RoomTimelineProps) {
  if (events.length === 0) return null;

  return (
    <div className={`space-y-0 ${className}`}>
      {events.map((event, i) => {
        const isLast = i === events.length - 1;
        return (
          <div key={event.label} className="relative flex items-start gap-3">
            {!isLast && (
              <div className="absolute left-[11px] top-7 bottom-0 w-0.5 bg-surface-200" />
            )}
            <div className="relative z-10 flex-shrink-0 mt-1">
              {event.done ? (
                <CheckCircle2 className={`w-5 h-5 ${event.active ? 'text-emerald-500' : 'text-emerald-400'}`} />
              ) : event.active ? (
                <div className="relative">
                  <Circle className="w-5 h-5 text-blue-400" />
                  <span className="absolute inset-1 rounded-full bg-blue-500 animate-pulse" />
                </div>
              ) : (
                <Circle className="w-5 h-5 text-surface-300" />
              )}
            </div>
            <div className={`flex-1 pb-5 ${isLast ? 'pb-0' : ''}`}>
              <p className={`text-sm font-semibold ${event.done ? 'text-surface-700' : event.active ? 'text-blue-700' : 'text-surface-400'}`}>
                {event.label}
              </p>
              {(event.date || event.time) && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-3 h-3 text-surface-400" />
                  <p className="text-[11px] text-surface-500 font-medium tabular-nums">
                    {event.date}{event.date && event.time ? ' · ' : ''}{event.time || ''}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface StayProgressBarProps {
  elapsedHours: number;
  totalHours: number;
  checkIn: string;
  checkOut: string;
  currencySymbol: string;
  ratePerHour: number;
}

export function StayProgressBar({ elapsedHours, totalHours, checkIn, checkOut, currencySymbol, ratePerHour }: StayProgressBarProps) {
  const safeElapsed = isNaN(elapsedHours) ? 0 : elapsedHours;
  const pct = totalHours > 0 ? Math.min((safeElapsed / totalHours) * 100, 100) : 0;
  const remaining = Math.max(totalHours - safeElapsed, 0);
  const accrued = safeElapsed * ratePerHour;

  const getBarColor = () => {
    if (pct > 90) return 'from-amber-500 via-orange-500 to-rose-500';
    if (pct > 75) return 'from-emerald-400 via-emerald-500 to-amber-500';
    return 'from-emerald-400 via-emerald-500 to-emerald-600';
  };

  const getGlowColor = () => {
    if (pct > 90) return 'shadow-rose-500/40';
    if (pct > 75) return 'shadow-amber-500/30';
    return 'shadow-emerald-500/30';
  };

  const getStatusLabel = () => {
    if (pct >= 100) return { text: 'Check-out overdue', color: 'text-rose-300' };
    if (pct > 90) return { text: 'Approaching check-out', color: 'text-amber-300' };
    if (pct > 75) return { text: 'Stay winding down', color: 'text-amber-200' };
    if (pct > 50) return { text: 'More than halfway', color: 'text-emerald-200' };
    return { text: 'Stay in progress', color: 'text-emerald-200' };
  };

  const status = getStatusLabel();

  return (
    <div className="space-y-3">
      {/* Progress bar with glow and segmented effect */}
      <div className="relative">
        {/* Outer track with subtle inner shadow */}
        <div className="relative h-3.5 bg-white/15 rounded-full overflow-hidden shadow-inner">
          {/* Animated fill bar */}
          <div
            className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${getBarColor()} transition-all duration-1000 ease-out shadow-lg ${getGlowColor()}`}
            style={{
              width: `${Math.max(pct, 0.5)}%`,
            }}
          >
            {/* Shimmer overlay for depth */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-t from-white/10 via-transparent to-white/20" />
            {/* Stripe texture */}
            <div
              className="absolute inset-0 rounded-full opacity-20"
              style={{
                background: `repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(255,255,255,0.25) 4px, rgba(255,255,255,0.25) 8px)`,
              }}
            />
          </div>
        </div>
        {/* Small time markers below the bar */}
        <div className="flex justify-between mt-1.5 text-[9px] text-white/50 font-medium">
          <span>0%</span>
          <span className="hidden sm:block">25%</span>
          <span>50%</span>
          <span className="hidden sm:block">75%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Status + accrued amount row */}
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-semibold tracking-wide ${status.color}`}>
          {pct >= 100 ? (
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />{status.text}</span>
          ) : (
            status.text
          )}
        </span>
        <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-lg px-2.5 py-1 border border-white/10">
          <span className="text-[9px] text-white/60 font-medium">Accrued</span>
          <span className="text-xs font-black text-white tabular-nums">{currencySymbol}{accrued.toLocaleString()}</span>
        </div>
      </div>

      {/* Elapsed / remaining duration cards */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-emerald-300" />
            <span className="text-[9px] text-white/60 font-medium uppercase tracking-wider">Elapsed</span>
          </div>
          <p className="text-sm font-bold text-white tabular-nums mt-0.5">{elapsedHours.toFixed(1)}<span className="text-[10px] font-medium text-white/60 ml-0.5">hours</span></p>
        </div>
        <div className="flex items-center justify-center flex-shrink-0">
          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
            <ArrowRight className="w-3 h-3 text-white/60" />
          </div>
        </div>
        <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-amber-300" />
            <span className="text-[9px] text-white/60 font-medium uppercase tracking-wider">Remaining</span>
          </div>
          <p className="text-sm font-bold text-white tabular-nums mt-0.5">{remaining.toFixed(1)}<span className="text-[10px] font-medium text-white/60 ml-0.5">hours</span></p>
        </div>
      </div>

      {/* Check-in / Check-out timeline */}
      <div className="flex items-center justify-between text-[10px] text-white/60 pt-1.5 border-t border-white/10">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>{checkIn}</span>
        </div>
        <div className="flex items-center gap-1.5 text-white/40">
          <ArrowRight className="w-2.5 h-2.5" />
          <span className="font-semibold text-white/80 tabular-nums">{totalHours.toFixed(1)}h stay</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span>{checkOut}</span>
        </div>
      </div>
    </div>
  );
}
