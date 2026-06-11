import { Building, UtensilsCrossed, MessageSquareText, Bell, Settings, Clock, BarChart3, Sparkles } from 'lucide-react';
import type { DeskTab } from './constants';

interface SidebarProps {
  activeTab: DeskTab;
  onTabChange: (tab: DeskTab) => void;
  badges: Record<string, number>;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const TABS: { id: DeskTab; label: string; icon: any }[] = [
  { id: 'rooms', label: 'Rooms', icon: Building },
  { id: 'orders', label: 'Orders', icon: UtensilsCrossed },
  { id: 'chat', label: 'Chat', icon: MessageSquareText },
  { id: 'requests', label: 'Requests', icon: Bell },
  { id: 'housekeeping', label: 'Housekeeping', icon: Sparkles },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'attendance', label: 'Attendance', icon: Clock },
];

export function Sidebar({ activeTab, onTabChange, badges, collapsed, onToggleCollapse }: SidebarProps) {
  return (
    <nav className={`bg-white border-r border-surface-100 flex flex-col transition-all duration-200 ${collapsed ? 'w-14' : 'w-52'}`}>
      <div className="p-2.5 border-b border-surface-100 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-lg flex items-center justify-center text-[9px] font-bold font-mono">FD</div>
            <span className="text-[11px] font-bold text-surface-800">Front Desk</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1.5 text-surface-300 hover:text-surface-500 hover:bg-surface-50 rounded-lg transition-all cursor-pointer"
        >
          <Building className={`w-3.5 h-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div className="flex-1 py-2 space-y-0.5 px-1.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badge = badges[tab.id] || 0;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'text-surface-400 hover:bg-surface-50 hover:text-surface-600'
              }`}
              title={collapsed ? tab.label : undefined}
            >
              <div className="relative flex-shrink-0">
                <Icon className="w-3.5 h-3.5" />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-rose-500 text-white text-[7px] font-bold rounded-full flex items-center justify-center leading-none">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              {!collapsed && <span className="truncate">{tab.label}</span>}
            </button>
          );
        })}
      </div>

      <div className="p-1.5 border-t border-surface-100">
        <button
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[11px] font-semibold text-surface-400 hover:bg-surface-50 hover:text-surface-600 transition-all cursor-pointer"
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings className="w-3.5 h-3.5 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </nav>
  );
}
