import { useState, useRef, useEffect } from 'react';
import { Bell, X, Check, UtensilsCrossed, MessageSquareText, Calendar, Clock, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface AppNotification {
  id: string;
  type: 'booking' | 'order' | 'chat' | 'extension' | 'call' | 'message' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  action?: () => void;
}

interface NotificationBellProps {
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClear: (id: string) => void;
  onClearAll: () => void;
}

const typeConfig: Record<string, { color: string; bg: string; icon: any }> = {
  booking: { color: 'text-brand-700', bg: 'bg-brand-50', icon: Calendar },
  order: { color: 'text-emerald-700', bg: 'bg-emerald-50', icon: UtensilsCrossed },
  chat: { color: 'text-sky-700', bg: 'bg-sky-50', icon: MessageSquareText },
  extension: { color: 'text-amber-700', bg: 'bg-amber-50', icon: Clock },
  call: { color: 'text-rose-700', bg: 'bg-rose-50', icon: Bell },
  message: { color: 'text-violet-700', bg: 'bg-violet-50', icon: MessageSquareText },
  info: { color: 'text-surface-700', bg: 'bg-surface-100', icon: AlertTriangle },
};

function NotificationItem({ notif, onMarkRead, onClear }: {
  notif: AppNotification;
  onMarkRead: (id: string) => void;
  onClear: (id: string) => void;
}) {
  const cfg = typeConfig[notif.type] || typeConfig.info;
  const Icon = cfg.icon;

  return (
    <div
      className={`group flex items-start gap-3 px-4 py-3 border-b border-surface-100 transition-colors ${
        notif.read ? 'opacity-70 hover:opacity-100' : 'bg-surface-50/50'
      } ${notif.action ? 'cursor-pointer hover:bg-surface-800' : ''}`}
      onClick={() => {
        if (!notif.read) onMarkRead(notif.id);
        if (notif.action) notif.action();
      }}
    >
      <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-4 h-4 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs font-semibold truncate ${notif.read ? 'text-surface-600' : 'text-surface-900'}`}>
            {notif.title}
          </p>
          <span className="text-[9px] text-surface-400 whitespace-nowrap">
            {formatTimeAgo(notif.timestamp)}
          </span>
        </div>
        <p className="text-[10px] text-surface-500 mt-0.5 leading-relaxed line-clamp-2">{notif.message}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onClear(notif.id); }}
        className="p-0.5 text-surface-300 hover:text-surface-500:text-surface-300 rounded hover:bg-surface-100:bg-surface-800 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function NotificationBell({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onClear,
  onClearAll,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className="relative p-2 text-surface-400 hover:text-surface-800 hover:bg-surface-100 rounded-lg transition-all cursor-pointer"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-surface-200 shadow-xl z-50 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between bg-white">
              <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider">
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-rose-50 text-rose-700 rounded-full text-[9px] font-bold">
                    {unreadCount} new
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllRead}
                    className="text-[10px] text-brand-600 hover:text-brand-800 font-semibold px-2 py-1 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-surface-50">
              {notifications.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <Bell className="w-8 h-8 text-surface-200 mx-auto mb-2" />
                  <p className="text-xs text-surface-400">No notifications yet</p>
                  <p className="text-[10px] text-surface-300 mt-0.5">Booking updates, new orders, and requests will appear here.</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <NotificationItem
                    key={notif.id}
                    notif={notif}
                    onMarkRead={onMarkRead}
                    onClear={onClear}
                  />
                ))
              )}
            </div>

            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-surface-100 bg-surface-50/50">
                <button
                  onClick={onClearAll}
                  className="w-full text-[10px] text-surface-500 hover:text-surface-700 font-semibold py-1.5 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer"
                >
                  Clear all notifications
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
