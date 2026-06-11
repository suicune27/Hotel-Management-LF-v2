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
      className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-surface-150 shadow-[0_2px_12px_rgba(0,0,0,0.02)] select-none"
    >
      <div className="flex items-center justify-between px-5 lg:px-8 py-3">
        <div className="flex items-center gap-3.5">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={brand.hotelName} className="h-9 w-auto rounded-xl shadow-xs transition-hover hover:scale-103 duration-300" />
          ) : (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-extrabold text-sm font-mono shadow-md shadow-brand-500/10 transition-transform active:scale-95 cursor-pointer bg-gradient-to-tr from-brand-600 to-indigo-500"
            >
              {initials}
            </div>
          )}
          <div>
            <h1 className="text-sm font-black text-surface-900 leading-tight tracking-tight flex items-center gap-1">
              {brand.hotelName}
            </h1>
            <p className="text-[10px] font-mono font-bold text-brand-500 uppercase tracking-widest leading-none mt-0.5">{brand.hotelSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {extraActions && (
            <div className="flex items-center gap-2">
              {extraActions}
            </div>
          )}

          {onClockInOut && (
            <motion.button
              whileHover={{ scale: 1.02, y: -0.5 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClockInOut}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border outline-none shadow-xs ${
                clockedIn
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200/60 shadow-emerald-100/10'
                  : 'bg-surface-50 text-surface-600 border-surface-200 hover:bg-surface-100'
              }`}
            >
              <div className="relative">
                <Clock className="w-3.5 h-3.5" />
                {clockedIn && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                )}
              </div>
              {clockedIn ? 'Clocked In' : 'Clock In'}
            </motion.button>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-50 border border-surface-200/40 rounded-xl">
            <div className="w-5 h-5 rounded-lg bg-surface-200/80 flex items-center justify-center text-surface-500">
              <User className="w-3 h-3" />
            </div>
            <span className="text-xs font-bold text-surface-800 leading-none">{userFullName}</span>
            <span className="text-[9px] px-2 py-0.5 rounded-lg bg-brand-50 border border-brand-100/40 text-brand-700 uppercase font-mono font-black tracking-wider leading-none">
              {userRole.replace('_', ' ')}
            </span>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onLogout}
            className="p-2 rounded-xl text-surface-450 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer border border-transparent hover:border-rose-100 bg-surface-50"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
