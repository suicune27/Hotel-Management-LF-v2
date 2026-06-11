import React from 'react';
import { Building, LogOut, User, Clock } from 'lucide-react';
import { AppSettings } from '../lib/settings';

interface BrandBarProps {
  settings: AppSettings;
  userFullName: string;
  userRole: string;
  onLogout: () => void;
  onClockInOut?: () => void;
  clockedIn?: boolean;
  extraActions?: React.ReactNode;
}

export default function BrandBar({
  settings, userFullName, userRole, onLogout,
  onClockInOut, clockedIn, extraActions
}: BrandBarProps) {
  const brand = settings.brand;
  const initials = brand.hotelName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-surface-200">
      <div className="flex items-center justify-between px-4 lg:px-6 py-2.5">
        <div className="flex items-center gap-3">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={brand.hotelName} className="h-9 w-auto rounded-lg" />
          ) : (
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm font-mono"
              style={{ backgroundColor: brand.brandColor }}
            >
              {initials}
            </div>
          )}
          <div>
            <h1 className="text-sm font-bold text-surface-900 leading-tight">{brand.hotelName}</h1>
            <p className="text-[10px] font-mono text-surface-500 uppercase tracking-wider leading-tight">{brand.hotelSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {extraActions}

          {onClockInOut && (
            <button
              onClick={onClockInOut}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                clockedIn
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-surface-100 text-surface-600 border border-surface-200 hover:bg-surface-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {clockedIn ? 'Clocked In' : 'Clock In'}
            </button>
          )}

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-100 rounded-lg">
            <User className="w-3.5 h-3.5 text-surface-400" />
            <span className="text-xs font-medium text-surface-700">{userFullName}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-200 text-surface-500 uppercase font-mono font-semibold">{userRole.replace('_', ' ')}</span>
          </div>

          <button
            onClick={onLogout}
            className="p-2 rounded-lg text-surface-500 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
