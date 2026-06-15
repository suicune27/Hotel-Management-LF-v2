import React from 'react';
import { Building, LogOut, User, Clock } from 'lucide-react';
import { AppSettings } from '../lib/settings';
import { motion } from 'motion/react';

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
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-surface-150 select-none"
    >
      <div className="flex items-center justify-between px-4 lg:px-5 py-2">
        <div className="flex items-center gap-2.5">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={brand.hotelName} className="h-8 w-auto rounded-lg" />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-extrabold text-[11px] font-mono bg-gradient-to-br from-surface-900 to-surface-700">
              {initials}
            </div>
          )}
          <div>
            <h1 className="text-sm font-bold text-surface-900 leading-tight tracking-tight">
              {brand.hotelName}
            </h1>
            <p className="text-[9px] font-semibold text-surface-400 leading-none mt-0.5">{brand.hotelSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {extraActions && (
            <div className="flex items-center gap-2">
              {extraActions}
            </div>
          )}

          {onClockInOut && (
            <button
              onClick={onClockInOut}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer border ${
                clockedIn
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-surface-50 text-surface-600 border-surface-200 hover:bg-surface-100'
              }`}
            >
              <div className="relative">
                <Clock className="w-3 h-3" />
                {clockedIn && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                )}
              </div>
              {clockedIn ? 'On' : 'In'}
            </button>
          )}

          <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-50 border border-surface-200/40 rounded-lg">
            <div className="w-4 h-4 rounded-md bg-surface-200/80 flex items-center justify-center text-surface-500">
              <User className="w-2.5 h-2.5" />
            </div>
            <span className="text-[10px] font-semibold text-surface-700 leading-none">{userFullName}</span>
            <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-brand-50 text-brand-700 uppercase font-semibold leading-none">
              {userRole.replace('_', ' ')}
            </span>
          </div>

          <button
            onClick={onLogout}
            className="p-1.5 rounded-lg text-surface-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
