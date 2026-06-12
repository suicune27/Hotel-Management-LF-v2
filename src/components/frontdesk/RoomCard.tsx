import { useMemo } from 'react';
import { Building, BedDouble, Loader2, LogOut, Check, Search, User, Clock } from 'lucide-react';
import { Room } from '../../types';
import { StatusChip } from './StatusChip';

interface RoomCardProps {
  room: Room;
  isSelected: boolean;
  isLoading: boolean;
  guestName?: string;
  isOverstayed?: boolean;
  currencySymbol: string;
  onSelect: () => void;
  onQuickAction: (action: string) => void;
}

const QUICK_ACTIONS: Record<string, { label: string; icon: any; color: string; bg: string }[]> = {
  available: [
    { label: 'Check In', icon: BedDouble, color: 'text-white', bg: 'bg-emerald-600 hover:bg-emerald-700' },
    { label: 'View', icon: Search, color: 'text-white', bg: 'bg-surface-800 hover:bg-surface-700' },
  ],
  booked: [
    { label: 'Check Out', icon: LogOut, color: 'text-white', bg: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Billing', icon: Building, color: 'text-white', bg: 'bg-surface-800 hover:bg-surface-700' },
  ],
  cleaning: [
    { label: 'Mark Available', icon: Check, color: 'text-white', bg: 'bg-emerald-600 hover:bg-emerald-700' },
    { label: 'View', icon: Search, color: 'text-white', bg: 'bg-surface-800 hover:bg-surface-700' },
  ],
  maintenance: [
    { label: 'Mark Available', icon: Check, color: 'text-white', bg: 'bg-emerald-600 hover:bg-emerald-700' },
    { label: 'View', icon: Search, color: 'text-white', bg: 'bg-surface-800 hover:bg-surface-700' },
  ],
  reserved: [
    { label: 'Check In', icon: BedDouble, color: 'text-white', bg: 'bg-emerald-600 hover:bg-emerald-700' },
    { label: 'View', icon: Search, color: 'text-white', bg: 'bg-surface-800 hover:bg-surface-700' },
  ],
};

export function RoomCard({ room, isSelected, isLoading, guestName, isOverstayed, currencySymbol, onSelect, onQuickAction }: RoomCardProps) {
  const actions = QUICK_ACTIONS[room.status] || [];

  // Determine elegant Bento styles based on room status
  const bentoStyle = useMemo(() => {
    switch (room.status) {
      case 'booked': // Occupied
        return {
          bg: 'bg-emerald-50/50 border-emerald-300 hover:border-emerald-500',
          numberColor: 'text-emerald-900',
          badgeColor: 'text-emerald-700',
          accentBorder: 'border-emerald-200',
        };
      case 'reserved':
        return {
          bg: 'bg-sky-50/60 border-sky-300 hover:border-sky-500',
          numberColor: 'text-sky-900',
          badgeColor: 'text-sky-700',
          accentBorder: 'border-sky-200',
        };
      case 'cleaning':
        return {
          bg: 'bg-amber-50/60 border-amber-300 hover:border-amber-500',
          numberColor: 'text-amber-900',
          badgeColor: 'text-amber-700',
          accentBorder: 'border-amber-200',
        };
      case 'maintenance':
        return {
          bg: 'bg-rose-50/50 border-rose-200 hover:border-rose-400',
          numberColor: 'text-rose-950',
          badgeColor: 'text-rose-800',
          accentBorder: 'border-rose-100',
        };
      case 'available':
      default:
        return {
          bg: 'bg-white border-surface-200 hover:border-brand-400 hover:shadow-card-hover',
          numberColor: 'text-surface-900',
          badgeColor: 'text-surface-500',
          accentBorder: 'border-surface-100',
        };
    }
  }, [room.status]);

  return (
    <div
      className={`relative rounded-2xl border transition-all duration-200 overflow-hidden cursor-pointer flex flex-col ${
        isSelected
          ? 'ring-2 ring-brand-500/20 border-brand-500 shadow-card-hover bg-white'
          : bentoStyle.bg
      } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
      onClick={onSelect}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 rounded-2xl">
          <Loader2 className="w-5 h-5 text-surface-400 animate-spin" />
        </div>
      )}

      {/* Larger image area with aspect ratio */}
      <div className="aspect-[16/10] bg-surface-50 relative overflow-hidden flex-shrink-0">
        {room.image_url ? (
          <img src={room.image_url} alt={`Suite #${room.room_number}`} className="w-full h-full object-cover transition-transform duration-300 hover:scale-105" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-50">
            <Building className="w-8 h-8 text-surface-300" />
          </div>
        )}
        {/* Gradient overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
        
        {/* Status badge + Overstay warning */}
        <div className="absolute top-2.5 right-2.5 z-10 flex gap-1">
          {isOverstayed && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-600 text-white rounded-lg text-[8px] font-bold shadow-sm animate-pulse">
              <Clock className="w-2.5 h-2.5" /> OVERSTAY
            </span>
          )}
          <StatusChip status={room.status} />
        </div>
        
        {/* Guest name badge */}
        {guestName && (
          <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900/80 backdrop-blur-md rounded-xl shadow-sm border border-white/10">
              <User className="w-3.5 h-3.5 text-brand-300" />
              <span className="text-[10px] font-bold text-white truncate max-w-[150px]">{guestName}</span>
              {isOverstayed && <Clock className="w-3 h-3 text-rose-400 flex-shrink-0 animate-pulse" />}
            </div>
          </div>
        )}
      </div>

      {/* Room info - always visible */}
      <div className="p-3.5 flex-1 flex flex-col justify-between gap-2 bg-white/40">
        <div>
          <div className="flex items-center justify-between gap-1">
            <p className={`text-base font-black tracking-tight ${bentoStyle.numberColor}`}>Suite #{room.room_number}</p>
            <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest truncate">{room.type}</p>
          </div>
          <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-dashed border-surface-100">
            <span className="text-xs text-surface-600 font-bold">
              {currencySymbol}{Number(room.price_per_hour).toLocaleString()}
              <span className="text-surface-400 font-medium text-[10px]">/hr</span>
            </span>
            <span className="text-[9px] font-bold text-surface-400 uppercase tracking-wider bg-surface-100/80 px-1.5 py-0.5 rounded">Max {room.max_occupancy}</span>
          </div>
        </div>
      </div>

      {/* Action buttons - always visible in dedicated area, no hover overlap */}
      {actions.length > 0 && (
        <div className="px-3.5 pb-3.5 pt-0 flex gap-2 bg-white/40">
          {actions.slice(0, 2).map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={(e) => { e.stopPropagation(); onQuickAction(action.label.toLowerCase().replace(' ', '-')); }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[10px] font-bold cursor-pointer transition-all active:scale-95 ${action.bg} ${action.color} shadow-xs`}
              >
                <Icon className="w-3.5 h-3.5" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
