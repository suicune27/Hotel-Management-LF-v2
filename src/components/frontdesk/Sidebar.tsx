import { Building, UtensilsCrossed, MessageSquareText, Bell, Sparkles, BarChart3, Clock, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
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
    <nav
      className={`bg-white border-r border-surface-150/80 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] select-none ${
        collapsed ? 'w-[52px]' : 'w-[200px]'
      } flex-shrink-0`}
    >
      {/* Header */}
      <div className="px-3 h-[52px] flex items-center border-b border-surface-100/60">
        {!collapsed && (
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-indigo-500 text-white flex items-center justify-center text-[10px] font-bold font-mono shadow-sm flex-shrink-0">
              FD
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-surface-900 leading-tight tracking-tight truncate">Front Desk</p>
              <p className="text-[7px] font-semibold text-brand-500 uppercase tracking-[0.15em]">Concierge</p>
            </div>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className={`p-1.5 rounded-lg text-surface-350 hover:text-surface-600 hover:bg-surface-50 transition-all duration-200 cursor-pointer ${
            collapsed ? 'mx-auto' : 'ml-auto flex-shrink-0'
          }`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-2.5 space-y-0.5 px-2 overflow-y-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badge = badges[tab.id] || 0;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[11px] font-semibold transition-all duration-150 cursor-pointer outline-none ${
                isActive
                  ? 'text-white'
                  : 'text-surface-400 hover:text-surface-700 hover:bg-surface-50'
              }`}
              title={collapsed ? tab.label : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="fd-active-tab"
                  className="absolute inset-0 bg-surface-900 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  style={{ zIndex: 0 }}
                />
              )}
              <div className="relative flex-shrink-0 z-10 flex items-center justify-center">
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'scale-110' : ''}`} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-rose-500 text-white text-[7px] font-black rounded-full flex items-center justify-center px-0.5 border border-white/80 shadow-sm leading-none z-20">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              {!collapsed && <span className="truncate relative z-10">{tab.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Settings */}
      <div className="px-2 py-2 border-t border-surface-100/60">
        <button
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[11px] font-semibold text-surface-350 hover:bg-surface-50 hover:text-surface-600 transition-all duration-150 cursor-pointer outline-none"
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings className="w-3.5 h-3.5 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </nav>
  );
}
