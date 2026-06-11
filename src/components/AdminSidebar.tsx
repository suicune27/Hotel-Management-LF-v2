import { Activity, Building, BookOpen, UserCheck, Users, Package, Bell, Clock, MessageSquareText, Mail, Grid3X3, Layers, Settings, ChevronLeft } from 'lucide-react';

export type AdminTab = 'insights' | 'rooms' | 'bookings' | 'workforce' | 'guests' | 'audit_logs' | 'inventory' | 'staff_calls' | 'stay_extensions' | 'front_desk_chat' | 'messages' | 'qr_codes' | 'settings';

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
  { id: 'audit_logs', label: 'Logs', icon: Layers },
];

const BOTTOM_TABS: { id: AdminTab; label: string; icon: any }[] = [
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function AdminSidebar({ activeTab, onTabChange, badges, collapsed, onToggleCollapse }: AdminSidebarProps) {
  return (
    <nav className={`bg-white border-r border-surface-200 flex flex-col transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'} flex-shrink-0`}>
      <div className="p-3 border-b border-surface-100 flex items-center justify-between min-h-[53px]">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-lg flex items-center justify-center text-xs font-bold font-mono">GH</div>
            <span className="text-xs font-bold text-surface-900">Admin Panel</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer ml-auto"
        >
          <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div className="flex-1 py-3 space-y-1 px-2 overflow-y-auto">
        {PRIMARY_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badge = badges[tab.id] || 0;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-surface-900 text-white shadow-sm'
                  : 'text-surface-500 hover:bg-surface-100 hover:text-surface-700'
              }`}
              title={collapsed ? tab.label : undefined}
            >
              <div className="relative flex-shrink-0">
                <Icon className="w-4 h-4" />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              {!collapsed && <span className="truncate">{tab.label}</span>}
            </button>
          );
        })}
      </div>

      <div className="p-2 border-t border-surface-100">
        {BOTTOM_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-surface-900 text-white shadow-sm'
                  : 'text-surface-400 hover:bg-surface-100 hover:text-surface-600'
              }`}
              title={collapsed ? tab.label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{tab.label}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
