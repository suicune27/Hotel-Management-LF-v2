import { Room } from '../../types';
import type { AppSettings } from '../../lib/settings';
import { Grid3X3, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface AdminQRCodesTabProps {
  rooms: Room[];
  settings: AppSettings;
  onNavigate: () => void;
}

export default function AdminQRCodesTab({ rooms, settings, onNavigate }: AdminQRCodesTabProps) {
  const baseUrl = settings.localServerUrl || `${window.location.protocol}//${window.location.hostname}:${window.location.port || 5173}`;

  const printableRooms = rooms.filter(r => r.status === 'available' || r.status === 'booked');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-surface-900 tracking-tight">Room QR Codes</h2>
          <p className="text-xs text-surface-400 mt-0.5">Print these QR codes for in-room guest portal access.</p>
        </div>
        {rooms.length > 0 && (
          <button
            onClick={() => window.print()}
            className="px-3 py-2 bg-surface-900 text-white hover:bg-surface-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print All
          </button>
        )}
      </div>

      {!settings.localServerUrl && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2">
          <span>⚠️ Local Server URL not set in Settings. Using auto-detected hostname and port.</span>
          <button
            onClick={onNavigate}
            className="px-2 py-1 bg-amber-200 hover:bg-amber-300 rounded-lg text-[10px] font-semibold cursor-pointer ml-auto whitespace-nowrap"
          >
            Open Settings
          </button>
        </div>
      )}

      {printableRooms.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center shadow-sm">
          <Grid3X3 className="w-10 h-10 text-surface-200 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-surface-700">No rooms found</h3>
          <p className="text-xs text-surface-400 mt-1">Add rooms in the Rooms tab to generate QR codes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 print:grid-cols-4">
          {printableRooms.map((room) => {
            const roomUrl = `${baseUrl}/guest-access/${room.room_number}`;
            return (
              <div
                key={room.id}
                className="bg-white rounded-2xl border border-surface-100 shadow-sm p-4 text-center print:border-2 print:border-black print:shadow-none"
              >
                <div className="flex items-center justify-between mb-2 print:hidden">
                  <span className="font-bold text-surface-900 text-sm">Suite #{room.room_number}</span>
                  <span className="text-[10px] text-surface-400 uppercase">{room.type}</span>
                </div>
                <div className="hidden print:block text-xs font-bold mb-1">Suite #{room.room_number}</div>
                <div className="flex justify-center my-2">
                  <QRCodeSVG value={roomUrl} size={100} level="M" />
                </div>
                <p className="text-[8px] text-surface-400 mt-2 break-all print:text-[6px]">{roomUrl}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
