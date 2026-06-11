import { useState } from 'react';
import { Search, Building, LayoutGrid, List, BedDouble, User, Clock } from 'lucide-react';
import { Room } from '../../types';
import { RoomCard } from './RoomCard';
import { RoomGridSkeleton } from './Skeleton';
import { STATUS_CONFIG } from './constants';

interface RoomGridProps {
  rooms: Room[];
  loading: boolean;
  searchQuery: string;
  statusFilter: string | null;
  selectedRoomId: string | null;
  actionLoading: string | null;
  statCounts: Record<string, number>;
  activeGuests: Map<string, string>;
  currencySymbol: string;
  onSearchChange: (q: string) => void;
  onFilterChange: (key: string | null) => void;
  onSelectRoom: (room: Room) => void;
  onQuickAction: (room: Room, action: string) => void;
}

const FILTERS = ['available', 'booked', 'reserved', 'cleaning', 'maintenance'];

export function RoomGrid({
  rooms, loading, searchQuery, statusFilter, selectedRoomId, actionLoading, statCounts, activeGuests, currencySymbol,
  onSearchChange, onFilterChange, onSelectRoom, onQuickAction,
}: RoomGridProps) {
  const [listView, setListView] = useState(false);

  const filteredRooms = rooms.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return r.room_number.toLowerCase().includes(q) || r.type.toLowerCase().includes(q);
    }
    return true;
  });

  const cfgFromStatus = (status: string) => STATUS_CONFIG[status] || { label: status, icon: BedDouble, color: '', bg: '' };

  return (
    <div className="space-y-2">
      <div className="card p-2.5">
        <div className="flex flex-col xl:flex-row xl:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-surface-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search rooms..."
            className="w-full pl-8 pr-2.5 py-2 bg-surface-0 border border-surface-200 rounded-lg text-xs outline-none transition-all placeholder:text-surface-400 focus:border-brand-400 focus:bg-white focus:shadow-[0_0_0_2px_rgb(var(--brand-500)/0.1)]"
          />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-px">
            {FILTERS.map((k) => {
              const cfg = STATUS_CONFIG[k];
              const isActive = statusFilter === k;
              const Icon = cfg.icon;
              return (
                <button
                  key={k}
                  onClick={() => onFilterChange(isActive ? null : k)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                    isActive ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-0 border border-surface-200 text-surface-400 hover:border-surface-300 hover:bg-white hover:text-surface-600'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{cfg.label}</span>
                  <span className={`text-[9px] ml-0.5 ${isActive ? 'text-white/70' : 'text-surface-300'}`}>{statCounts[k]}</span>
                </button>
              );
            })}
            <div className="w-px h-5 bg-surface-200 mx-1" />
            <div className="flex items-center bg-surface-0 border border-surface-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setListView(false)}
                className={`p-1.5 transition-all cursor-pointer ${listView ? 'text-surface-300' : 'bg-white text-brand-600 shadow-xs'}`}
                title="Grid view"
              ><LayoutGrid className="w-3.5 h-3.5" /></button>
              <button
                onClick={() => setListView(true)}
                className={`p-1.5 transition-all cursor-pointer ${listView ? 'bg-white text-brand-600 shadow-xs' : 'text-surface-300'}`}
                title="List view"
              ><List className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <RoomGridSkeleton />
      ) : filteredRooms.length === 0 ? (
        <div className="text-center py-12 card">
          <Building className="w-10 h-10 text-surface-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-surface-500">No rooms found</h3>
          <p className="text-[11px] text-surface-400 mt-1">
            {statusFilter ? 'No rooms match the selected filter.' : 'Add rooms in the admin panel first.'}
          </p>
        </div>
      ) : listView ? (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-100">
                <th className="text-left text-[9px] font-bold uppercase tracking-wider text-surface-400 px-3 py-2">Room</th>
                <th className="text-left text-[9px] font-bold uppercase tracking-wider text-surface-400 px-3 py-2 hidden sm:table-cell">Type</th>
                <th className="text-left text-[9px] font-bold uppercase tracking-wider text-surface-400 px-3 py-2">Status</th>
                <th className="text-left text-[9px] font-bold uppercase tracking-wider text-surface-400 px-3 py-2 hidden md:table-cell">Guest</th>
                <th className="text-right text-[9px] font-bold uppercase tracking-wider text-surface-400 px-3 py-2 hidden sm:table-cell">Rate</th>
                <th className="text-right text-[9px] font-bold uppercase tracking-wider text-surface-400 px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {filteredRooms.map((room) => {
                const cfg = cfgFromStatus(room.status);
                const Icon = cfg.icon;
                const guest = activeGuests.get(room.id);
                return (
                  <tr
                    key={room.id}
                    className={`text-xs transition-colors cursor-pointer ${selectedRoomId === room.id ? 'bg-brand-50' : 'hover:bg-surface-0'}`}
                    onClick={() => onSelectRoom(room)}
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-bold text-surface-900">#{room.room_number}</span>
                    </td>
                    <td className="px-3 py-2.5 text-surface-500 capitalize hidden sm:table-cell">{room.type}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider border ${cfg.color} ${cfg.bg}`}>
                        <Icon className="w-2.5 h-2.5" />
                        {cfg.label || room.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-surface-500 hidden md:table-cell">
                      {guest ? <span className="flex items-center gap-1"><User className="w-3 h-3 text-blue-400" />{guest}</span> : <span className="text-surface-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-surface-700 font-semibold text-right hidden sm:table-cell">{currencySymbol}{Number(room.price_per_hour).toLocaleString()}<span className="text-surface-300 font-normal">/hr</span></td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); onQuickAction(room, 'view'); }}
                        className="px-2 py-1 rounded-md text-[9px] font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 transition-all cursor-pointer"
                      >View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
          {filteredRooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              isSelected={selectedRoomId === room.id}
              isLoading={actionLoading === room.id}
              guestName={activeGuests.get(room.id)}
              currencySymbol={currencySymbol}
              onSelect={() => onSelectRoom(room)}
              onQuickAction={(action) => onQuickAction(room, action)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
