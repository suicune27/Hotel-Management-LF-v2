import { STATUS_CONFIG } from './constants';

interface StatCardsProps {
  counts: Record<string, number>;
  expectedToday: number;
  dailyRevenue: number;
  activeFilter: string | null;
  currencySymbol: string;
  onFilterChange: (key: string | null) => void;
}

export function StatCards({ counts, expectedToday, dailyRevenue, activeFilter, currencySymbol, onFilterChange }: StatCardsProps) {
  const items = [
    { key: 'available', label: 'Available', value: counts.available },
    { key: 'booked', label: 'Occupied', value: counts.booked },
    { key: 'cleaning', label: 'Cleaning', value: counts.cleaning },
    { key: 'maintenance', label: 'Maintenance', value: counts.maintenance },
    { key: 'arrivals', label: 'Arrivals', value: expectedToday },
    { key: 'revenue', label: 'Revenue', value: `${currencySymbol}${dailyRevenue.toLocaleString()}`, isString: true },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
      {items.map((item) => {
        const cfg = item.key !== 'arrivals' && item.key !== 'revenue' ? STATUS_CONFIG[item.key] : null;
        const isActive = activeFilter === item.key;
        const bgColor = cfg?.bg || (item.key === 'arrivals' ? 'bg-emerald-50/70 border-emerald-200/70' : 'bg-brand-50/70 border-brand-200/70');

        const inner = (
          <div className="flex items-baseline gap-1.5">
            <p className={`text-lg font-bold leading-none tabular-nums ${isActive ? 'text-white' : cfg?.color || (item.key === 'arrivals' ? 'text-emerald-700' : 'text-brand-700')}`}>
              {item.isString ? item.value : item.value}
            </p>
            {!item.isString && (
              <span className={`text-[9px] font-medium uppercase tracking-wide ${isActive ? 'text-white/70' : 'text-surface-400'}`}>
                {item.label}
              </span>
            )}
            {item.isString && (
              <span className={`text-[9px] font-medium uppercase tracking-wide ${isActive ? 'text-white/70' : 'text-surface-400'}`}>
                {item.label}
              </span>
            )}
          </div>
        );

        if (item.key === 'arrivals' || item.key === 'revenue') {
          return (
            <div key={item.key} className={`${bgColor} rounded-xl px-3 py-2.5 border transition-all duration-200`}>
              {inner}
            </div>
          );
        }

        return (
          <button
            key={item.key}
            onClick={() => onFilterChange(isActive ? null : item.key)}
            className={`rounded-xl px-3 py-2.5 border transition-all duration-200 cursor-pointer active:scale-[0.98] ${
              isActive
                ? 'bg-surface-900 border-surface-900 shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                : `${bgColor} hover:bg-white hover:border-surface-300 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]`
            }`}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
