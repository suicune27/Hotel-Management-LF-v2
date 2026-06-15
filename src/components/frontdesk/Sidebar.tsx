import { Building, UtensilsCrossed, MessageSquareText, Bell, Settings, Clock, BarChart3, Sparkles } from 'lucide-react';
import type { DeskTab } from './constants';
import { motion } from 'motion/react';

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
    <nav className={`bg-white border-r border-surface-150 flex flex-col transition-all duration-300 ease-out select-none ${collapsed ? 'w-14' : 'w-48'} flex-shrink-0`}>
      <div className="p-2.5 border-b border-surface-100 flex items-center justify-between min-h-[44px]">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-gradient-to-br from-surface-900 to-surface-700 text-white rounded-lg flex items-center justify-center text-[8px] font-bold font-mono">FD</div>
            <span className="text-[11px] font-bold text-surface-900 tracking-tight">Front Desk</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className={`p-1 text-surface-300 hover:text-surface-600 hover:bg-surface-50 rounded-lg transition-all cursor-pointer ${collapsed ? 'mx-auto' : 'ml-auto'}`}
        >
          <Building className={`w-3 h-3 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div className="flex-1 py-2 space-y-0.5 px-1.5 overflow-y-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badge = badges[tab.id] || 0;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer outline-none ${
                isActive
                  ? 'text-white'
                  : 'text-surface-500 hover:text-surface-800 hover:bg-surface-50'
              }`}
              title={collapsed ? tab.label : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="activeDeskTab"
                  className="absolute inset-0 bg-surface-900 rounded-lg shadow-sm"
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  style={{ zIndex: 0 }}
                />
              )}
              
              <div className="relative flex-shrink-0 z-10 flex items-center justify-center">
                <Icon className={`w-3.5 h-3.5 ${isActive ? '' : ''}`} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[13px] h-3 bg-rose-500 text-white text-[7px] font-bold rounded-full flex items-center justify-center px-0.5 border border-white shadow-xs leading-none z-20">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              {!collapsed && <span className="truncate relative z-10">{tab.label}</span>}
            </button>
          );
        })}
      </div>

      <div className="p-1.5 border-t border-surface-100">
        <button
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] font-semibold text-surface-400 hover:bg-surface-50 hover:text-surface-700 transition-colors cursor-pointer outline-none"
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings className="w-3.5 h-3.5 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </nav>
  );
}
