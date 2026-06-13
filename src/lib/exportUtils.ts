import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
applyPlugin(jsPDF);
import { Booking, Customer, ActivityLog, Room, GuestOrder } from '../types';

// Extend jsPDF with autotable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

// ===== CSV EXPORT =====

export function exportToCSV(data: Record<string, any>[], filename: string) {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h] ?? '';
        const str = String(val);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    )
  ];

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ===== PDF EXPORT =====

export function exportBookingsToPDF(bookings: Booking[], currencySymbol: string) {
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Link Fortress IT Solutions - Bookings Report', 14, 20);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);
  doc.text(`Total Bookings: ${bookings.length}`, 14, 32);

  // Summary stats
  const completed = bookings.filter(b => b.status === 'completed').length;
  const active = bookings.filter(b => b.status === 'checked-in').length;
  const confirmed = bookings.filter(b => b.status === 'confirmed').length;
  const pending = bookings.filter(b => b.status === 'pending').length;
  const cancelled = bookings.filter(b => b.status === 'cancelled').length;
  const totalRevenue = bookings
    .filter(b => ['confirmed', 'checked-in', 'completed'].includes(b.status))
    .reduce((s, b) => s + Number(b.total_price), 0);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Revenue: ${currencySymbol}${totalRevenue.toLocaleString()}  |  Active: ${active}  |  Confirmed: ${confirmed}  |  Completed: ${completed}  |  Pending: ${pending}  |  Cancelled: ${cancelled}`, 14, 39);

  // Table
  const tableData = bookings.map(b => [
    b.id.slice(0, 8),
    b.customers?.full_name || 'N/A',
    b.rooms?.room_number || '—',
    b.check_in_date,
    b.check_in_time,
    b.check_out_date,
    b.check_out_time,
    b.status,
    `${currencySymbol}${Number(b.total_price).toLocaleString()}`
  ]);

  doc.autoTable({
    startY: 45,
    head: [['ID', 'Guest', 'Room', 'Check In', 'Time', 'Check Out', 'Time', 'Status', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    styles: { cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 30 },
      2: { cellWidth: 12 },
      3: { cellWidth: 20 },
      4: { cellWidth: 16 },
      5: { cellWidth: 20 },
      6: { cellWidth: 16 },
      7: { cellWidth: 18 },
      8: { cellWidth: 20 },
    },
  });

  doc.save(`bookings-report-${new Date().toISOString().split('T')[0]}.pdf`);
}

export function exportRevenueToPDF(bookings: Booking[], customerCount: number, currencySymbol: string) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Link Fortress IT Solutions - Revenue Report', 14, 20);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);

  const totalRevenue = bookings
    .filter(b => ['confirmed', 'checked-in', 'completed'].includes(b.status))
    .reduce((s, b) => s + Number(b.total_price), 0);
  const activeRevenue = bookings
    .filter(b => b.status === 'checked-in')
    .reduce((s, b) => s + Number(b.total_price), 0);
  const pendingRevenue = bookings
    .filter(b => b.status === 'pending')
    .reduce((s, b) => s + Number(b.total_price), 0);

  // Summary box
  const summaryY = 35;
  doc.setFillColor(248, 250, 252);
  doc.rect(14, summaryY, 182, 50, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(14, summaryY, 182, 50, 'S');

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Revenue Summary', 20, summaryY + 10);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Gross Revenue:`, 20, summaryY + 22);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.text(`${currencySymbol}${totalRevenue.toLocaleString()}`, 120, summaryY + 22);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Active (checked-in):`, 20, summaryY + 32);
  doc.setTextColor(15, 23, 42);
  doc.text(`${currencySymbol}${activeRevenue.toLocaleString()}`, 120, summaryY + 32);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Pending Revenue:`, 20, summaryY + 42);
  doc.setTextColor(15, 23, 42);
  doc.text(`${currencySymbol}${pendingRevenue.toLocaleString()}`, 120, summaryY + 42);

  // Key metrics
  const metricsY = summaryY + 65;
  doc.setFillColor(248, 250, 252);
  doc.rect(14, metricsY, 182, 40, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(14, metricsY, 182, 40, 'S');

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Total Bookings:`, 20, metricsY + 12);
  doc.setTextColor(15, 23, 42);
  doc.text(`${bookings.length}`, 120, metricsY + 12);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Registered Guests:`, 20, metricsY + 22);
  doc.setTextColor(15, 23, 42);
  doc.text(`${customerCount}`, 120, metricsY + 22);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Average Booking Value:`, 20, metricsY + 32);
  doc.setTextColor(15, 23, 42);
  const avg = bookings.length > 0 ? Math.round(totalRevenue / bookings.length) : 0;
  doc.text(`${currencySymbol}${avg.toLocaleString()}`, 120, metricsY + 32);

  // Recent bookings table
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const tableY = metricsY + 55;
  doc.text('Recent Bookings', 14, tableY);

  const recent = bookings.slice(0, 20);
  const tableData = recent.map(b => [
    b.id.slice(0, 6),
    b.customers?.full_name || 'N/A',
    b.rooms?.room_number || '—',
    b.status,
    `${currencySymbol}${Number(b.total_price).toLocaleString()}`
  ]);

  doc.autoTable({
    startY: tableY + 3,
    head: [['ID', 'Guest', 'Room', 'Status', 'Amount']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    styles: { cellPadding: 2 },
  });

  doc.save(`revenue-report-${new Date().toISOString().split('T')[0]}.pdf`);
}

export function exportLogsToPDF(logs: ActivityLog[]) {
  const doc = new jsPDF('landscape', 'mm', 'a4');

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Link Fortress IT Solutions - Activity Logs', 14, 20);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);
  doc.text(`Total Entries: ${logs.length}`, 14, 32);

  const tableData = logs.slice(0, 100).map(l => [
    new Date(l.created_at).toLocaleString(),
    l.user_name || 'System',
    l.action,
    l.details
  ]);

  doc.autoTable({
    startY: 38,
    head: [['Timestamp', 'User', 'Action', 'Details']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    styles: { cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 25 },
      2: { cellWidth: 30 },
      3: { cellWidth: 'auto' },
    },
  });

  doc.save(`activity-logs-${new Date().toISOString().split('T')[0]}.pdf`);
}

export function exportRoomsToPDF(rooms: Room[], bookings: Booking[], currencySymbol: string) {
  const doc = new jsPDF('landscape', 'mm', 'a4');

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Link Fortress IT Solutions - Rooms Report', 14, 20);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);

  const available = rooms.filter(r => r.status === 'available').length;
  const booked = rooms.filter(r => r.status === 'booked').length;
  const cleaning = rooms.filter(r => r.status === 'cleaning').length;
  const maintenance = rooms.filter(r => r.status === 'maintenance').length;
  const occupancyRate = rooms.length > 0 ? Math.round((booked / rooms.length) * 100) : 0;

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Total Rooms: ${rooms.length}  |  Available: ${available}  |  Booked: ${booked}  |  Cleaning: ${cleaning}  |  Maintenance: ${maintenance}  |  Occupancy: ${occupancyRate}%`, 14, 35);

  const tableData = rooms.map(r => {
    const roomBookings = bookings.filter(b => b.room_id === r.id);
    const revenue = roomBookings.reduce((s, b) => s + Number(b.total_price), 0);
    return [
      r.room_number,
      r.type,
      r.status,
      `${r.max_occupancy}`,
      `${currencySymbol}${Number(r.price_per_hour).toLocaleString()}`,
      `${roomBookings.length}`,
      `${currencySymbol}${revenue.toLocaleString()}`
    ];
  });

  doc.autoTable({
    startY: 42,
    head: [['Room #', 'Type', 'Status', 'Max', 'Rate/hr', 'Bookings', 'Revenue']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    styles: { cellPadding: 2 },
  });

  doc.save(`rooms-report-${new Date().toISOString().split('T')[0]}.pdf`);
}

export function exportOrdersToPDF(orders: GuestOrder[], currencySymbol: string) {
  const doc = new jsPDF('landscape', 'mm', 'a4');

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Link Fortress IT Solutions - Orders Report', 14, 20);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);
  doc.text(`Total Orders: ${orders.length}`, 14, 32);

  const totalOrderRevenue = orders.reduce((s, o) => s + Number(o.total_price), 0);
  const pending = orders.filter(o => o.status === 'pending').length;
  const preparing = orders.filter(o => o.status === 'preparing').length;
  const served = orders.filter(o => o.status === 'served').length;

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Revenue: ${currencySymbol}${totalOrderRevenue.toLocaleString()}  |  Pending: ${pending}  |  Preparing: ${preparing}  |  Served: ${served}`, 14, 39);

  const tableData = orders.slice(0, 100).map(o => [
    o.id.slice(0, 6),
    (o as any).bookings?.rooms?.room_number || '—',
    (o as any).bookings?.customers?.full_name || 'Guest',
    (o.inventory_items as any)?.name || 'Item',
    `x${o.quantity}`,
    o.status,
    `${currencySymbol}${Number(o.total_price).toLocaleString()}`
  ]);

  doc.autoTable({
    startY: 45,
    head: [['ID', 'Room', 'Guest', 'Item', 'Qty', 'Status', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    styles: { cellPadding: 2 },
  });

  doc.save(`orders-report-${new Date().toISOString().split('T')[0]}.pdf`);
}

export function exportAttendanceToPDF(entries: any[], currencySymbol: string) {
  const doc = new jsPDF('landscape', 'mm', 'a4');

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Link Fortress IT Solutions - Employee Attendance Ledger', 14, 20);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);
  doc.text(`Total Attendance Logs: ${entries.length}`, 14, 32);

  const tableData = entries.map(entry => {
    const empName = entry.users?.full_name || entry.users?.email || 'N/A';
    const role = entry.users?.role || 'staff';
    
    // Parse JSON notes
    let remarks = entry.notes || '';
    let status = 'Present';
    let holiday = 'No';
    
    try {
      if (entry.notes?.trim().startsWith('{')) {
        const p = JSON.parse(entry.notes);
        if (p?.is_attendance_meta) {
          status = p.status || 'Present';
          holiday = p.is_holiday ? (p.holiday_name || 'Yes') : 'No';
          remarks = p.remarks || '';
        }
      }
    } catch (e) {}

    const clockInStr = new Date(entry.clock_in).toLocaleString();
    const clockOutStr = entry.clock_out ? new Date(entry.clock_out).toLocaleString() : 'Active';
    const hours = entry.total_hours ? `${Number(entry.total_hours).toFixed(2)}h` : '—';

    return [
      empName,
      role.toUpperCase(),
      clockInStr,
      clockOutStr,
      hours,
      status,
      holiday,
      remarks
    ];
  });

  doc.autoTable({
    startY: 38,
    head: [['Employee', 'Role', 'Clock In', 'Clock Out', 'Hours', 'Status', 'Holiday', 'Remarks']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5 },
    styles: { cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 20 },
      2: { cellWidth: 40 },
      3: { cellWidth: 40 },
      4: { cellWidth: 15 },
      5: { cellWidth: 20 },
      6: { cellWidth: 30 },
      7: { cellWidth: 'auto' },
    },
  });

  doc.save(`attendance-report-${new Date().toISOString().split('T')[0]}.pdf`);
}

