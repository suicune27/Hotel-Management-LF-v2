import React, { useState, useMemo, useEffect } from 'react';
import { Booking, Room, Customer, GuestOrder, HousekeepingTask, Incident } from '../../types';
import { AppSettings } from '../../lib/settings';
import { supabase } from '../../lib/supabase';
import { exportToCSV, exportRevenueToPDF, exportBookingsToPDF, exportRoomsToPDF, exportOrdersToPDF } from '../../lib/exportUtils';
import { Download, BarChart3, Calendar, Utensils, TrendingUp, DollarSign, Building2, ShoppingCart } from 'lucide-react';

interface Payment {
  id: string;
  booking_id: string;
  amount: number;
  method: string;
  reference: string;
  created_at: string;
}

interface AdminReportsTabProps {
  bookings: Booking[];
  rooms: Room[];
  customers: Customer[];
  orders: GuestOrder[];
  payments: Payment[];
  housekeepingTasks: HousekeepingTask[];
  incidents: Incident[];
  settings: AppSettings;
  addToast: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
}

interface DailyRevenueRow {
  date: string;
  roomRevenue: number;
  ordersRevenue: number;
  extraCharges: number;
  total: number;
}

interface OccupancyDay {
  date: string;
  label: string;
  booked: number;
  total: number;
  percentage: number;
}

interface TopItem {
  name: string;
  category: string;
  qtySold: number;
  totalRevenue: number;
}

function formatCurrency(amount: number, symbol: string): string {
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function getToday(): string {
  return formatDate(new Date());
}

export default function AdminReportsTab({
  bookings,
  rooms,
  customers,
  orders,
  payments,
  housekeepingTasks,
  incidents,
  settings,
  addToast,
}: AdminReportsTabProps) {
  const [dateFrom, setDateFrom] = useState(getMonthStart());
  const [dateTo, setDateTo] = useState(getToday());
  const [extraCharges, setExtraCharges] = useState<Record<string, number>>({});
  const [loadingCharges, setLoadingCharges] = useState(false);

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => b.check_in_date >= dateFrom && b.check_in_date <= dateTo);
  }, [bookings, dateFrom, dateTo]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const d = o.created_at?.split('T')[0];
      return d >= dateFrom && d <= dateTo;
    });
  }, [orders, dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCharges(true);
    (async () => {
      const { data } = await supabase
        .from('booking_charges')
        .select('amount, created_at')
        .gte('created_at', dateFrom + 'T00:00:00')
        .lte('created_at', dateTo + 'T23:59:59');
      if (cancelled) return;
      const grouped: Record<string, number> = {};
      if (data) {
        for (const row of data) {
          const day = row.created_at?.split('T')[0];
          if (day) grouped[day] = (grouped[day] || 0) + Number(row.amount);
        }
      }
      setExtraCharges(grouped);
      setLoadingCharges(false);
    })();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo]);

  const dailyRevenue = useMemo((): DailyRevenueRow[] => {
    const rows: DailyRevenueRow[] = [];
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayStr = formatDate(d);
      const roomRevenue = filteredBookings
        .filter(b => b.check_in_date === dayStr && (b.status === 'checked-in' || b.status === 'completed'))
        .reduce((s, b) => s + Number(b.total_price), 0);
      const ordersRevenue = filteredOrders
        .filter(o => o.created_at?.split('T')[0] === dayStr)
        .reduce((s, o) => s + Number(o.total_price), 0);
      const extra = extraCharges[dayStr] || 0;
      const total = roomRevenue + ordersRevenue + extra;
      if (roomRevenue > 0 || ordersRevenue > 0 || extra > 0) {
        rows.push({ date: dayStr, roomRevenue, ordersRevenue, extraCharges: extra, total });
      }
    }
    return rows;
  }, [filteredBookings, filteredOrders, extraCharges, dateFrom, dateTo]);

  const occupancyForecast = useMemo((): OccupancyDay[] => {
    const days: OccupancyDay[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dayStr = formatDate(d);
      const booked = rooms.filter(r => {
        return bookings.some(b => {
          if (b.room_id !== r.id) return false;
          if (b.status === 'cancelled') return false;
          return dayStr >= b.check_in_date && dayStr <= b.check_out_date;
        });
      }).length;
      const total = rooms.length;
      const pct = total > 0 ? Math.round((booked / total) * 100) : 0;
      const label = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
      days.push({ date: dayStr, label, booked, total, percentage: pct });
    }
    return days;
  }, [bookings, rooms]);

  const topSellingItems = useMemo((): TopItem[] => {
    const grouped = new Map<string, { category: string; qty: number; revenue: number }>();
    for (const o of orders) {
      const name = o.inventory_items?.name || 'Unknown';
      const category = o.inventory_items?.menu_categories?.name || 'Uncategorized';
      const existing = grouped.get(name);
      if (existing) {
        existing.qty += o.quantity;
        existing.revenue += Number(o.total_price);
      } else {
        grouped.set(name, { category, qty: o.quantity, revenue: Number(o.total_price) });
      }
    }
    return Array.from(grouped.entries())
      .map(([name, data]) => ({ name, category: data.category, qtySold: data.qty, totalRevenue: data.revenue }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);
  }, [orders]);

  const handleExportBookings = () => {
    const data = filteredBookings.map(b => ({
      ID: b.id.slice(0, 8),
      Guest: b.customers?.full_name || 'N/A',
      Room: b.rooms?.room_number || '—',
      'Check In': b.check_in_date,
      'Check Out': b.check_out_date,
      Status: b.status,
      Total: Number(b.total_price).toFixed(2),
    }));
    exportToCSV(data, 'bookings-export');
    addToast('success', 'Exported', 'Bookings CSV exported successfully.');
  };

  const handleExportRevenue = () => {
    exportRevenueToPDF(bookings, customers.length, settings.currencySymbol);
    addToast('success', 'Exported', 'Revenue PDF exported successfully.');
  };

  const handleExportOccupancy = () => {
    const data = rooms.map(r => {
      const roomBookings = bookings.filter(b => b.room_id === r.id && b.status !== 'cancelled');
      const occupied = roomBookings.some(b => b.status === 'checked-in');
      return {
        'Room Number': r.room_number,
        Type: r.type,
        Status: r.status,
        Occupied: occupied ? 'Yes' : 'No',
        'Current Guest': roomBookings.find(b => b.status === 'checked-in')?.customers?.full_name || '—',
        'Next Booking': roomBookings.find(b => b.status === 'confirmed')?.customers?.full_name || '—',
      };
    });
    exportToCSV(data, 'occupancy-report');
    addToast('success', 'Exported', 'Occupancy report exported successfully.');
  };

  const handleExportFullReport = () => {
    const data = filteredBookings.map(b => ({
      Date: b.check_in_date,
      Guest: b.customers?.full_name || 'N/A',
      Room: b.rooms?.room_number || '—',
      'Room Revenue': Number(b.total_price).toFixed(2),
      Status: b.status,
    }));
    exportToCSV(data, 'full-report');
    addToast('success', 'Exported', 'Full report CSV exported successfully.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-surface-900 tracking-tight">Reports &amp; Data Export</h2>
        <p className="text-xs text-surface-400 mt-0.5">Export data, view revenue summaries, occupancy trends, and top-selling items.</p>
      </div>

      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-surface-400" />
            <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-surface-50 border border-surface-200 rounded-lg px-2.5 py-1.5 text-xs text-surface-800 focus:outline-none focus:border-brand-500" />
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-surface-400" />
            <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-surface-50 border border-surface-200 rounded-lg px-2.5 py-1.5 text-xs text-surface-800 focus:outline-none focus:border-brand-500" />
          </div>
          <div className="text-[10px] text-surface-400 font-medium ml-auto">
            {filteredBookings.length} bookings · {filteredOrders.length} orders
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button onClick={handleExportBookings}
          className="bg-white rounded-2xl border border-surface-100 shadow-sm p-4 hover:border-brand-300 hover:shadow-md transition-all cursor-pointer text-left group">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Download className="w-5 h-5 text-blue-600" />
          </div>
          <span className="text-xs font-bold text-surface-900 block">Export Bookings (CSV)</span>
          <span className="text-[10px] text-surface-400 mt-0.5 block">{filteredBookings.length} records</span>
        </button>
        <button onClick={handleExportRevenue}
          className="bg-white rounded-2xl border border-surface-100 shadow-sm p-4 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer text-left group">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <DollarSign className="w-5 h-5 text-emerald-600" />
          </div>
          <span className="text-xs font-bold text-surface-900 block">Export Revenue (PDF)</span>
          <span className="text-[10px] text-surface-400 mt-0.5 block">{settings.currencySymbol}{(bookings.reduce((s, b) => s + Number(b.total_price), 0)).toLocaleString()}</span>
        </button>
        <button onClick={handleExportOccupancy}
          className="bg-white rounded-2xl border border-surface-100 shadow-sm p-4 hover:border-amber-300 hover:shadow-md transition-all cursor-pointer text-left group">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Building2 className="w-5 h-5 text-amber-600" />
          </div>
          <span className="text-xs font-bold text-surface-900 block">Export Occupancy</span>
          <span className="text-[10px] text-surface-400 mt-0.5 block">{rooms.length} rooms</span>
        </button>
        <button onClick={handleExportFullReport}
          className="bg-white rounded-2xl border border-surface-100 shadow-sm p-4 hover:border-violet-300 hover:shadow-md transition-all cursor-pointer text-left group">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <BarChart3 className="w-5 h-5 text-violet-600" />
          </div>
          <span className="text-xs font-bold text-surface-900 block">Export Full Report (CSV)</span>
          <span className="text-[10px] text-surface-400 mt-0.5 block">Combined data</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-600" />
            <h3 className="text-xs font-bold text-surface-900">Daily Revenue Summary</h3>
          </div>
          <span className="text-[10px] text-surface-400">
            {loadingCharges ? 'Loading charges...' : `${dailyRevenue.length} days`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-50/80 border-b border-surface-100">
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Date</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Room Revenue</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Orders Revenue</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Extra Charges</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {dailyRevenue.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-surface-400 text-xs">No revenue data for the selected period.</td>
                </tr>
              )}
              {dailyRevenue.map(row => (
                <tr key={row.date} className="hover:bg-surface-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-surface-800">{new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-surface-700">{formatCurrency(row.roomRevenue, settings.currencySymbol)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-surface-700">{formatCurrency(row.ordersRevenue, settings.currencySymbol)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-surface-700">{formatCurrency(row.extraCharges, settings.currencySymbol)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-surface-900">{formatCurrency(row.total, settings.currencySymbol)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-50/80 border-t border-surface-100">
                <td className="px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Totals</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-surface-900">{formatCurrency(dailyRevenue.reduce((s, r) => s + r.roomRevenue, 0), settings.currencySymbol)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-surface-900">{formatCurrency(dailyRevenue.reduce((s, r) => s + r.ordersRevenue, 0), settings.currencySymbol)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-surface-900">{formatCurrency(dailyRevenue.reduce((s, r) => s + r.extraCharges, 0), settings.currencySymbol)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-surface-900">{formatCurrency(dailyRevenue.reduce((s, r) => s + r.total, 0), settings.currencySymbol)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-brand-600" />
          <h3 className="text-xs font-bold text-surface-900">7-Day Occupancy Forecast</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {occupancyForecast.map(day => {
            const color = day.percentage >= 75 ? 'bg-emerald-500' : day.percentage >= 50 ? 'bg-amber-400' : 'bg-rose-400';
            return (
              <div key={day.date} className="bg-surface-50 rounded-2xl p-4 border border-surface-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-surface-500 uppercase tracking-wider">{day.label}</span>
                  <span className="text-[10px] text-surface-400 font-mono">{day.date.slice(5)}</span>
                </div>
                <div className="h-24 flex items-end justify-center">
                  <div className="w-full max-w-[32px] rounded-t-lg relative" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <div
                      className={`w-full rounded-t-lg transition-all duration-500 ${color}`}
                      style={{ height: `${Math.max(day.percentage, 4)}%` }}
                    />
                  </div>
                </div>
                <div className="text-center mt-3">
                  <span className="text-lg font-bold text-surface-900">{day.percentage}%</span>
                  <span className="block text-[10px] text-surface-400">{day.booked}/{day.total} rooms</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
          <Utensils className="w-4 h-4 text-brand-600" />
          <h3 className="text-xs font-bold text-surface-900">Top-Selling Items</h3>
          <span className="text-[10px] text-surface-400 ml-auto">{topSellingItems.length} items</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-50/80 border-b border-surface-100">
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Item Name</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Category</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Qty Sold</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-wider">Total Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {topSellingItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-surface-400 text-xs">No order data available.</td>
                </tr>
              )}
              {topSellingItems.map((item, idx) => (
                <tr key={item.name} className="hover:bg-surface-50/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-surface-100 text-surface-500 text-[9px] font-bold flex items-center justify-center">{idx + 1}</span>
                      <span className="font-medium text-surface-800">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-surface-500">{item.category}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-surface-800">{item.qtySold}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-surface-900">{formatCurrency(item.totalRevenue, settings.currencySymbol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
