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

  const bentoStyle = useMemo(() => {
    switch (room.status) {
      case 'booked':
        return {
          border: 'border-l-emerald-500/60',
          badgeColor: 'text-emerald-700',
        };
      case 'reserved':
        return {
          border: 'border-l-sky-500/60',
          badgeColor: 'text-sky-700',
        };
      case 'cleaning':
        return {
          border: 'border-l-amber-500/60',
          badgeColor: 'text-amber-700',
        };
      case 'maintenance':
        return {
          border: 'border-l-rose-500/60',
          badgeColor: 'text-rose-800',
        };
      case 'available':
      default:
        return {
          border: 'border-l-surface-300/50',
          badgeColor: 'text-surface-600',
        };
    }
  }, [room.status]);

  return (
    <div
      className={`relative rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer flex flex-col bg-white ${
        isSelected
          ? 'ring-2 ring-brand-500/30 border-brand-400 shadow-[0_4px_12px_rgba(79,70,229,0.08)]'
          : `${bentoStyle.border} border-surface-200/70 hover:border-surface-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]`
      } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
      onClick={onSelect}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 rounded-xl">
          <Loader2 className="w-5 h-5 text-surface-400 animate-spin" />
        </div>
      )}

      <div className="aspect-[16/9] bg-surface-50/80 relative overflow-hidden flex-shrink-0">
        {room.image_url ? (
          <img src={room.image_url} alt={`Suite #${room.room_number}`} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building className="w-8 h-8 text-surface-250" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        <div className="absolute top-2.5 right-2.5 z-10 flex gap-1">
          {isOverstayed && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-600 text-white rounded-md text-[7px] font-bold shadow-sm animate-pulse">
              <Clock className="w-2 h-2" /> OVERSTAY
            </span>
          )}
          <StatusChip status={room.status} />
        </div>
        {guestName && (
          <div className="absolute bottom-2 left-2 right-2 z-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-black/60 backdrop-blur-md rounded-lg border border-white/10">
              <User className="w-3 h-3 text-brand-300" />
              <span className="text-[10px] font-semibold text-white truncate max-w-[130px]">{guestName}</span>
              {isOverstayed && <Clock className="w-2.5 h-2.5 text-rose-400 flex-shrink-0 animate-pulse" />}
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-surface-900 tracking-tight">#{room.room_number}</p>
            <span className="text-[9px] font-medium text-surface-400 uppercase tracking-wider">{room.type}</span>
          </div>
          <span className={`text-[10px] font-bold ${bentoStyle.badgeColor} tabular-nums`}>
            {currencySymbol}{Number(room.price_per_hour).toLocaleString()}
            <span className="text-surface-350 font-normal text-[9px]">/h</span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-surface-400 font-medium">Max {room.max_occupancy} guests</span>
          {room.min_stay_hours && (
            <span className="text-[8px] text-surface-350 font-medium">Min {room.min_stay_hours}h</span>
          )}
        </div>
      </div>

      {actions.length > 0 && (
        <div className="px-3 pb-3 pt-0 flex gap-1.5">
          {actions.slice(0, 2).map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={(e) => { e.stopPropagation(); onQuickAction(action.label.toLowerCase().replace(' ', '-')); }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-[10px] font-semibold cursor-pointer transition-all active:scale-[0.97] ${action.bg} ${action.color} shadow-[0_1px_2px_rgba(0,0,0,0.03)]`}
              >
                <Icon className="w-3 h-3" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
