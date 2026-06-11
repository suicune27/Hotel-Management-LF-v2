import { STATUS_CONFIG } from './constants';

interface StatusChipProps {
  status: string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  pulse?: boolean;
}

export function StatusChip({ status, size = 'sm', showIcon = true, pulse }: StatusChipProps) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.available;
  const Icon = cfg.icon;
  const s = size === 'sm' ? 'text-[9px] px-2 py-0.5' : 'text-[10px] px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wide ${cfg.bg} ${cfg.color} ${s} ${pulse ? 'animate-pulse' : ''} shadow-xs`}>
      {showIcon && <Icon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />}
      <span>{cfg.label}</span>
    </span>
  );
}
