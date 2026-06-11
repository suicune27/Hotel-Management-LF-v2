import { Activity, Building, BookOpen, UserCheck, Users, Package, Bell, Clock, MessageSquareText, Mail, Grid3X3, Layers, Settings, ChevronLeft, Percent, SprayCan, FileSpreadsheet, Wrench, Search } from 'lucide-react';
import { motion } from 'motion/react';

export type AdminTab = 'insights' | 'rooms' | 'bookings' | 'workforce' | 'guests' | 'audit_logs' | 'inventory' | 'staff_calls' | 'stay_extensions' | 'front_desk_chat' | 'messages' | 'qr_codes' | 'settings' | 'promotions' | 'housekeeping' | 'reports' | 'maintenance' | 'lost_found';

interface AdminSidebarProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  badges: Record<string, number>;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const PRIMARY_TABS: { id: AdminTab; label: string; icon: any }[] = [
  { id: 'insights', label: 'Overview', icon: Activity },
  { id: 'rooms', label: 'Rooms', icon: Building },
  { id: 'bookings', label: 'Bookings', icon: BookOpen },
  { id: 'workforce', label: 'Staff', icon: UserCheck },
  { id: 'guests', label: 'Guests', icon: Users },
  { id: 'inventory', label: 'Kitchen', icon: Package },
  { id: 'staff_calls', label: 'Calls', icon: Bell },
  { id: 'stay_extensions', label: 'Extend', icon: Clock },
  { id: 'front_desk_chat', label: 'Chat', icon: MessageSquareText },
  { id: 'messages', label: 'Inbox', icon: Mail },
  { id: 'qr_codes', label: 'QR Codes', icon: Grid3X3 },
  { id: 'housekeeping', label: 'Housekeeping', icon: SprayCan },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  { id: 'lost_found', label: 'Lost & Found', icon: Search },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
  { id: 'audit_logs', label: 'Logs', icon: Layers },
  { id: 'promotions', label: 'Promos', icon: Percent },
];

const BOTTOM_TABS: { id: AdminTab; label: string; icon: any }[] = [
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function AdminSidebar({ activeTab, onTabChange, badges, collapsed, onToggleCollapse }: AdminSidebarProps) {
  return (
    <nav className={`bg-white border-r border-surface-150 flex flex-col transition-all duration-300 ease-out ${collapsed ? 'w-16' : 'w-56'} flex-shrink-0 select-none`}>
      <div className="p-3.5 border-b border-surface-100 flex items-center justify-between min-h-[57px]">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-tr from-brand-600 to-indigo-500 text-white rounded-xl flex items-center justify-center text-xs font-bold font-mono shadow-md shadow-brand-500/10">GH</div>
            <div>
              <span className="text-xs font-extrabold text-surface-900 block tracking-tight leading-none">Admin Portal</span>
              <span className="text-[9px] font-bold text-brand-500 uppercase tracking-widest block mt-0.5">Control Center</span>
            </div>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className={`p-1.5 text-surface-400 hover:text-surface-700 hover:bg-surface-50 rounded-xl transition-all cursor-pointer ${collapsed ? 'mx-auto' : 'ml-auto'}`}
        >
          <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div className="flex-1 py-4 space-y-1 px-2.5 overflow-y-auto">
        {PRIMARY_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badge = badges[tab.id] || 0;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer outline-none ${
                isActive
                  ? 'text-white'
                  : 'text-surface-500 hover:text-surface-800'
              }`}
              title={collapsed ? tab.label : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="activeAdminTab"
                  className="absolute inset-0 bg-surface-900 rounded-xl shadow-md"
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                  style={{ zIndex: 0 }}
                />
              )}
              
              <div className="relative flex-shrink-0 z-10 flex items-center justify-center">
                <Icon className={`w-4 h-4 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
                {badge > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-[16px] h-4 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center px-1 border border-white shadow-sm leading-none z-20">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              {!collapsed && <span className="truncate relative z-10">{tab.label}</span>}
            </button>
          );
        })}
      </div>

      <div className="p-2.5 border-t border-surface-100">
        {BOTTOM_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer outline-none ${
                isActive
                  ? 'text-white'
                  : 'text-surface-500 hover:text-surface-800'
              }`}
              title={collapsed ? tab.label : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="activeAdminTab"
                  className="absolute inset-0 bg-surface-900 rounded-xl shadow-md"
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                  style={{ zIndex: 0 }}
                />
              )}
              <Icon className="w-4 h-4 flex-shrink-0 relative z-10" />
              {!collapsed && <span className="relative z-10">{tab.label}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
