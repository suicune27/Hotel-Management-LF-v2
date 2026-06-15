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
    { key: 'arrivals', label: 'Today In', value: expectedToday },
    { key: 'revenue', label: 'Revenue Ø', value: `${currencySymbol}${dailyRevenue.toLocaleString()}`, isString: true },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
      {items.map((item) => {
        const cfg = item.key !== 'arrivals' && item.key !== 'revenue' ? STATUS_CONFIG[item.key] : null;
        const isActive = activeFilter === item.key;
        const bgColor = cfg?.bg || (item.key === 'arrivals' ? 'bg-emerald-50' : 'bg-brand-50');
        const borderColor = cfg ? 'border-transparent' : (item.key === 'arrivals' ? 'border-emerald-200/50' : 'border-brand-200/50');
        const countColor = cfg?.color || (item.key === 'arrivals' ? 'text-emerald-700' : 'text-brand-700');

        const inner = (
          <>
            <p className={`text-lg font-bold leading-none ${countColor}`}>{item.isString ? item.value : item.value}</p>
            <p className="text-[9px] font-medium text-surface-400 mt-1">{item.label}</p>
          </>
        );

        if (item.key === 'arrivals' || item.key === 'revenue') {
          return (
            <div key={item.key} className={`${bgColor} ${borderColor} rounded-xl p-2.5 text-center border`}>
              {inner}
            </div>
          );
        }

        return (
          <button
            key={item.key}
            onClick={() => onFilterChange(isActive ? null : item.key)}
            className={`rounded-xl p-2.5 text-center border transition-all cursor-pointer active:scale-[0.97] ${
              isActive
                ? 'ring-2 ring-brand-500/20 border-brand-300 bg-brand-50 shadow-xs'
                : `${bgColor} ${borderColor} hover:shadow-sm hover:-translate-y-0.5`
            }`}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
