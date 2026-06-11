import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, BedDouble, X } from 'lucide-react';
import { Room } from '../../types';
import { STATUS_CONFIG } from './constants';

interface SearchCommandProps {
  rooms: Room[];
  currencySymbol: string;
  onSelectRoom: (room: Room) => void;
  onOpenCheckIn: (room: Room) => void;
}

type SearchMode = 'rooms' | 'guests' | 'reservations';

export function SearchCommand({ rooms, currencySymbol, onSelectRoom, onOpenCheckIn }: SearchCommandProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<SearchMode>('rooms');
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredRooms = rooms.filter((r) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return r.room_number.toLowerCase().includes(q) || r.type.toLowerCase().includes(q);
  });

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
    if (e.key === 'Escape') setOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-elevated border border-surface-100 w-full max-w-lg overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-surface-100">
          <Search className="w-4 h-4 text-surface-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
            placeholder="Search rooms..."
            className="flex-1 outline-none text-sm text-surface-900 placeholder:text-surface-400"
          />
          <div className="flex items-center gap-1">
            {(['rooms', 'guests', 'reservations'] as SearchMode[]).map((m) => (
              <button key={m} onClick={() => { setMode(m); setSelectedIdx(0); }} className={`px-2 py-1 rounded-md text-[9px] font-semibold uppercase cursor-pointer transition-all ${mode === m ? 'bg-surface-900 text-white' : 'text-surface-400 hover:text-surface-600 hover:bg-surface-0'}`}>{m}</button>
            ))}
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-50 transition-all cursor-pointer flex-shrink-0" title="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
          {filteredRooms.length === 0 ? (
            <div className="p-6 text-center text-xs text-surface-400">No rooms match your search</div>
          ) : (
            filteredRooms.map((room, i) => {
              const cfg = STATUS_CONFIG[room.status];
              const Icon = cfg?.icon || BedDouble;
              return (
                <div key={room.id} className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all ${i === selectedIdx ? 'bg-brand-50' : 'hover:bg-surface-0'}`}
                  onMouseEnter={() => setSelectedIdx(i)}
                  onClick={() => { onSelectRoom(room); setOpen(false); }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-surface-900">#{room.room_number}</p>
                      <p className="text-[10px] text-surface-500 capitalize">{room.type} · {currencySymbol}{Number(room.price_per_hour).toLocaleString()}/hr</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 text-[8px] font-bold uppercase rounded-full border ${cfg ? `${cfg.color} ${cfg.bg}` : 'bg-surface-50 text-surface-500 border-surface-100'}`}>{cfg?.label || room.status}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
