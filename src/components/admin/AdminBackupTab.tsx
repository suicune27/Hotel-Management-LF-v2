import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { AppSettings } from '../../lib/settings';
import { exportToCSV } from '../../lib/exportUtils';
import * as XLSX from 'xlsx';
import { Download, Upload, Database, FileJson, FileSpreadsheet, Archive, Clock, CheckCircle, AlertTriangle, Loader2, Trash2, FileText, ChevronRight } from 'lucide-react';

const ALL_TABLES = [
  'hotels', 'rooms', 'bookings', 'customers', 'guest_orders',
  'booking_charges', 'payments', 'housekeeping_tasks', 'incidents',
  'parking_spots', 'contact_messages', 'staff_calls', 'stay_extensions',
  'inventory_items', 'menu_categories', 'promo_codes', 'rate_plans',
  'waitlist', 'lost_found_items', 'activity_logs', 'users',
  'employee_payroll', 'time_entries', 'payroll_periods', 'payroll_entries',
  'chat_messages', 'booking_groups'
] as const;

interface AdminBackupTabProps {
  settings: AppSettings;
  addToast: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => Promise<void>, isDestructive?: boolean, confirmLabel?: string) => void;
  triggerAlert: (title: string, message: string) => void;
}

type ImportStatus = 'idle' | 'validating' | 'preview' | 'restoring' | 'done' | 'error';

export default function AdminBackupTab({ settings, addToast, triggerConfirm, triggerAlert }: AdminBackupTabProps) {
  const [exporting, setExporting] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importData, setImportData] = useState<any>(null);
  const [tableProgress, setTableProgress] = useState<Record<string, { status: 'pending' | 'done' | 'error'; count?: number }>>({});
  const [dragging, setDragging] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lastExport = localStorage.getItem('hotel-last-backup-timestamp');
  const lastExportData = localStorage.getItem('hotel-last-backup-data');

  const handleExportJSON = async () => {
    setExporting(true);
    try {
      const data: Record<string, any[]> = {};
      for (const table of ALL_TABLES) {
        try {
          const { data: rows, error } = await supabase.from(table).select('*');
          if (error) {
            addToast('error', 'Export Error', `Failed to fetch ${table}: ${error.message}`);
            continue;
          }
          data[table] = rows || [];
        } catch (err: any) {
          addToast('error', 'Export Error', `Failed to fetch ${table}: ${err.message}`);
        }
      }

      const backup = {
        exported_at: new Date().toISOString(),
        version: 1,
        data,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hotel-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      localStorage.setItem('hotel-last-backup-timestamp', new Date().toISOString());
      localStorage.setItem('hotel-last-backup-data', JSON.stringify(backup));

      addToast('success', 'Exported', `Full backup downloaded successfully.`);
    } catch (err: any) {
      addToast('error', 'Export Error', err.message || 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const handleExportBookingsCSV = () => {
    const fetchAndExport = async () => {
      try {
        const { data: bookings, error } = await supabase
          .from('bookings')
          .select('*, customers(full_name, email, phone), rooms(room_number, type)');
        if (error) throw error;
        if (!bookings || bookings.length === 0) {
          triggerAlert('No Data', 'No bookings found to export.');
          return;
        }
        const flat = bookings.map((b: any) => ({
          'Booking ID': b.id,
          'Guest Name': b.customers?.full_name || 'N/A',
          'Guest Email': b.customers?.email || '',
          'Guest Phone': b.customers?.phone || '',
          'Room Number': b.rooms?.room_number || '',
          'Room Type': b.rooms?.type || '',
          'Check In Date': b.check_in_date,
          'Check In Time': b.check_in_time,
          'Check Out Date': b.check_out_date,
          'Check Out Time': b.check_out_time,
          'Status': b.status,
          'Total Price': b.total_price,
          'Total Hours': b.total_hours,
          'Created At': b.created_at,
        }));
        exportToCSV(flat, 'bookings');
        addToast('success', 'Exported', 'Bookings CSV downloaded.');
      } catch (err: any) {
        addToast('error', 'Export Error', err.message || 'Failed to export bookings');
      }
    };
    fetchAndExport();
  };

  const handleExportRoomsCSV = () => {
    const fetchAndExport = async () => {
      try {
        const { data: rooms, error } = await supabase
          .from('rooms')
          .select('*');
        if (error) throw error;
        if (!rooms || rooms.length === 0) {
          triggerAlert('No Data', 'No rooms found to export.');
          return;
        }
        const flat = rooms.map((r: any) => ({
          'Room ID': r.id,
          'Room Number': r.room_number,
          'Type': r.type,
          'Status': r.status,
          'Max Occupancy': r.max_occupancy,
          'Price Per Hour': r.price_per_hour,
          'Price Per Night': r.price_per_night,
          'Min Stay Hours': r.min_stay_hours,
          'Created At': r.created_at,
        }));
        exportToCSV(flat, 'rooms');
        addToast('success', 'Exported', 'Rooms CSV downloaded.');
      } catch (err: any) {
        addToast('error', 'Export Error', err.message || 'Failed to export rooms');
      }
    };
    fetchAndExport();
  };

  const handleExportGuestsCSV = () => {
    const fetchAndExport = async () => {
      try {
        const { data: guests, error } = await supabase
          .from('customers')
          .select('*');
        if (error) throw error;
        if (!guests || guests.length === 0) {
          triggerAlert('No Data', 'No guests found to export.');
          return;
        }
        const flat = guests.map((g: any) => ({
          'Customer ID': g.id,
          'Full Name': g.full_name,
          'Email': g.email || '',
          'Phone': g.phone || '',
          'Total Visits': g.total_visits ?? 0,
          'Total Spent': g.total_spent ?? 0,
          'Notes': g.notes || '',
          'Created At': g.created_at,
        }));
        exportToCSV(flat, 'guests');
        addToast('success', 'Exported', 'Guests CSV downloaded.');
      } catch (err: any) {
        addToast('error', 'Export Error', err.message || 'Failed to export guests');
      }
    };
    fetchAndExport();
  };

  const handleExportLogsCSV = () => {
    const fetchAndExport = async () => {
      try {
        const { data: logs, error } = await supabase
          .from('activity_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10000);
        if (error) throw error;
        if (!logs || logs.length === 0) {
          triggerAlert('No Data', 'No activity logs found to export.');
          return;
        }
        const flat = logs.map((l: any) => ({
          'Log ID': l.id,
          'User': l.user_name,
          'Action': l.action,
          'Details': l.details,
          'Created At': l.created_at,
        }));
        exportToCSV(flat, 'activity_logs');
        addToast('success', 'Exported', `Activity logs CSV downloaded (${flat.length} entries).`);
      } catch (err: any) {
        addToast('error', 'Export Error', err.message || 'Failed to export logs');
      }
    };
    fetchAndExport();
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      for (const table of ALL_TABLES) {
        try {
          const { data: rows, error } = await supabase.from(table).select('*');
          if (error || !rows) continue;
          if (rows.length === 0) continue;
          const ws = XLSX.utils.json_to_sheet(rows as any[]);
          XLSX.utils.book_append_sheet(wb, ws, table);
        } catch {
          // skip tables that fail
        }
      }
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hotel-backup-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      addToast('success', 'Exported', 'Excel workbook downloaded successfully.');
    } catch (err: any) {
      addToast('error', 'Export Error', err.message || 'Failed to export Excel');
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = (file: File) => {
    const isJSON = file.name.endsWith('.json');
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (!isJSON && !isExcel) {
      triggerAlert('Invalid File', 'Please select a .json or .xlsx backup file.');
      return;
    }
    setImportStatus('validating');
    setPreviewExpanded(new Set());

    if (isJSON) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const parsed = JSON.parse(text);
          if (!parsed.version || !parsed.data || !parsed.exported_at) {
            triggerAlert('Invalid Format', 'The file does not have the expected backup structure (version, data, exported_at).');
            setImportStatus('idle');
            return;
          }
          setImportData(parsed);
          setImportStatus('preview');
        } catch {
          triggerAlert('Parse Error', 'Failed to parse the JSON file.');
          setImportStatus('idle');
        }
      };
      reader.onerror = () => {
        triggerAlert('Read Error', 'Failed to read the file.');
        setImportStatus('idle');
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const backup: Record<string, any[]> = {};
          for (const sheetName of wb.SheetNames) {
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json<any>(ws);
            if (rows.length > 0) {
              backup[sheetName] = rows;
            }
          }
          const parsed = {
            version: 1,
            exported_at: new Date().toISOString(),
            data: backup,
            _source: 'excel',
          };
          setImportData(parsed);
          setImportStatus('preview');
        } catch {
          triggerAlert('Parse Error', 'Failed to parse the Excel file.');
          setImportStatus('idle');
        }
      };
      reader.onerror = () => {
        triggerAlert('Read Error', 'Failed to read the file.');
        setImportStatus('idle');
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleRestore = () => {
    triggerConfirm(
      'Restore Backup',
      `This will upsert ${(Object.values(importData.data) as any[][]).reduce((s, r) => s + r.length, 0)} rows across ${Object.keys(importData.data).length} tables. Existing records with matching IDs will be overwritten. Continue?`,
      async () => {
        setImportStatus('restoring');
        const progress: Record<string, { status: 'pending' | 'done' | 'error'; count?: number }> = {};
        for (const table of Object.keys(importData.data)) {
          progress[table] = { status: 'pending' };
        }
        setTableProgress(progress);

        for (const [table, rows] of Object.entries(importData.data) as [string, any[]][]) {
          if (rows.length === 0) {
            setTableProgress(prev => ({ ...prev, [table]: { status: 'done', count: 0 } }));
            continue;
          }
          try {
            const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
            if (error) throw error;
            setTableProgress(prev => ({ ...prev, [table]: { status: 'done', count: rows.length } }));
          } catch (err: any) {
            addToast('error', 'Restore Error', `Failed to restore ${table}: ${err.message}`);
            setTableProgress(prev => ({ ...prev, [table]: { status: 'error', count: rows.length } }));
          }
        }

        setImportStatus('done');
        addToast('success', 'Restore Complete', 'Data has been restored from the backup file.');
      },
      true,
      'Restore'
    );
  };

  const handleClearImport = () => {
    setImportData(null);
    setImportStatus('idle');
    setTableProgress({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-surface-900 tracking-tight">Data Backup & Restore</h2>
          <p className="text-xs text-surface-400 mt-0.5">Export your data for safekeeping or restore from a previous backup.</p>
        </div>
      </div>

      {/* Export Section */}
      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-surface-600" />
          <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider">Export Data</h3>
        </div>
        <p className="text-xs text-surface-400">Download a complete JSON backup of all hotel data, or export bookings as CSV.</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportJSON}
            disabled={exporting}
            className="px-4 py-2.5 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileJson className="w-3.5 h-3.5" />}
            {exporting ? 'Exporting...' : 'Full Backup (JSON)'}
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            {exporting ? 'Exporting...' : 'Full Backup (Excel)'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportBookingsCSV}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors">
            <FileSpreadsheet className="w-3 h-3" /> Bookings
          </button>
          <button onClick={handleExportRoomsCSV}
            className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors">
            <FileSpreadsheet className="w-3 h-3" /> Rooms
          </button>
          <button onClick={handleExportGuestsCSV}
            className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors">
            <FileSpreadsheet className="w-3 h-3" /> Guests
          </button>
          <button onClick={handleExportLogsCSV}
            className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors">
            <FileSpreadsheet className="w-3 h-3" /> Logs
          </button>
        </div>
      </div>

      {/* Import Section */}
      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-surface-600" />
          <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider">Restore Data</h3>
        </div>

        {importStatus === 'idle' && (
          <>
            <p className="text-xs text-surface-400">Upload a previously exported JSON or Excel backup file to restore data.</p>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragging ? 'border-brand-500 bg-brand-50' : 'border-surface-200 hover:border-surface-300 bg-surface-50'
              }`}
            >
              <Upload className="w-8 h-8 text-surface-300 mx-auto mb-2" />
              <p className="text-xs text-surface-500 font-semibold">Drop a .json or .xlsx backup file here or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.xlsx,.xls"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
              />
            </div>
          </>
        )}

        {importStatus === 'validating' && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-surface-400 animate-spin" />
          </div>
        )}

        {importStatus === 'preview' && importData && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-surface-500">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>Backup from <strong className="text-surface-700">{new Date(importData.exported_at).toLocaleString()}</strong>
                {importData._source === 'excel' && <span className="ml-1.5 px-1.5 py-0.5 bg-sky-100 text-sky-700 rounded text-[9px] font-semibold">Excel</span>}
              </span>
            </div>
            <div className="bg-surface-50 rounded-xl p-4 max-h-96 overflow-y-auto space-y-1.5">
              {Object.entries(importData.data as Record<string, any[]>).map(([table, rows]) => {
                const expanded = previewExpanded.has(table);
                const sample = rows.slice(0, 5);
                const cols = sample.length > 0 ? Object.keys(sample[0]).slice(0, 6) : [];
                return (
                  <div key={table}>
                    <button
                      onClick={() => {
                        const next = new Set(previewExpanded);
                        if (next.has(table)) next.delete(table); else next.add(table);
                        setPreviewExpanded(next);
                      }}
                      className="w-full flex items-center justify-between text-xs hover:bg-white/60 rounded-lg px-2 py-1.5 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`w-3 h-3 text-surface-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        <span className="text-surface-700 font-mono font-semibold">{table}</span>
                      </div>
                      <span className="text-surface-400 font-medium">{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
                    </button>
                    {expanded && sample.length > 0 && (
                      <div className="ml-5 mb-1.5 bg-white rounded-lg border border-surface-200 overflow-x-auto">
                        <table className="w-full text-[9px]">
                          <thead>
                            <tr className="bg-surface-50 border-b border-surface-200">
                              {cols.map(c => <th key={c} className="px-2 py-1 text-left font-bold text-surface-500 uppercase tracking-wider whitespace-nowrap">{c}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {sample.map((row, ri) => (
                              <tr key={ri} className="border-b border-surface-100 last:border-0">
                                {cols.map(c => <td key={c} className="px-2 py-1 text-surface-700 font-mono truncate max-w-[120px]">{String(row[c] ?? '')}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {rows.length > 5 && <div className="px-2 py-1 text-[9px] text-surface-400 border-t border-surface-100 italic">... and {rows.length - 5} more rows</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClearImport}
                className="px-4 py-2 border border-surface-200 text-surface-600 rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-50 bg-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Restore
              </button>
            </div>
          </div>
        )}

        {importStatus === 'restoring' && (
          <div className="space-y-2">
            <p className="text-xs text-surface-500 mb-2 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Restoring data...
            </p>
            <div className="bg-surface-50 rounded-xl p-4 max-h-64 overflow-y-auto space-y-1">
              {Object.entries(tableProgress).map(([table, prog]) => (
                <div key={table} className="flex items-center justify-between text-xs">
                  <span className="text-surface-600 font-mono">{table}</span>
                  <span className="flex items-center gap-1.5">
                    {prog.status === 'pending' && <Loader2 className="w-3 h-3 text-surface-400 animate-spin" />}
                    {prog.status === 'done' && <><CheckCircle className="w-3 h-3 text-emerald-500" /> <span className="text-surface-400">{prog.count} rows</span></>}
                    {prog.status === 'error' && <><AlertTriangle className="w-3 h-3 text-rose-500" /> <span className="text-rose-500">Error</span></>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {importStatus === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl p-4">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">Restore completed successfully.</span>
            </div>
            <div className="bg-surface-50 rounded-xl p-4 max-h-48 overflow-y-auto space-y-1">
              {Object.entries(tableProgress).map(([table, prog]) => (
                <div key={table} className="flex items-center justify-between text-xs">
                  <span className="text-surface-600 font-mono">{table}</span>
                  <span className="text-surface-400">{prog.status === 'done' ? `${prog.count} rows` : 'Error'}</span>
                </div>
              ))}
            </div>
            <button
              onClick={handleClearImport}
              className="px-4 py-2 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {importStatus === 'error' && (
          <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-semibold">Restore failed. Check the console for details.</span>
          </div>
        )}
      </div>

      {/* Backup History */}
      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-surface-600" />
          <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider">Backup History</h3>
        </div>
        {lastExport ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-surface-600">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span>Last export: <strong className="text-surface-800">{new Date(lastExport).toLocaleString()}</strong></span>
            </div>
            {lastExportData && (
              <button
                onClick={() => {
                  try {
                    const parsed = JSON.parse(lastExportData);
                    const totalRows = Object.values(parsed.data as Record<string, any[]>).reduce((s: number, r: any[]) => s + r.length, 0);
                    const blob = new Blob([lastExportData], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `hotel-backup-${new Date(parsed.exported_at).toISOString().split('T')[0]}.json`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    addToast('info', 'Downloaded', `Re-downloaded backup from ${new Date(parsed.exported_at).toLocaleString()} (${totalRows} rows).`);
                  } catch {
                    triggerAlert('Error', 'Could not re-download the last backup.');
                  }
                }}
                className="px-3 py-1.5 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-3 h-3" /> Download Last Export
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-surface-400">
            <Database className="w-3.5 h-3.5" />
            <span>No backups have been exported yet.</span>
          </div>
        )}
      </div>

      {/* Schedule Section */}
      <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4 text-amber-600" />
          <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider">Schedule Automated Backups</h3>
        </div>
        <p className="text-xs text-surface-500">
          To automate backups, set up a cron job or Supabase scheduled function that calls the export endpoint periodically.
          This ensures your data is backed up regularly without manual intervention.
        </p>
        <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>For production environments, configure a daily or weekly automated backup through your hosting provider or a scheduled cloud function.</span>
        </div>
      </div>
    </div>
  );
}
