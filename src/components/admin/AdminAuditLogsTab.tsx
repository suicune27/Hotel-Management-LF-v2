import { ActivityLog } from '../../types';
import { FileText } from 'lucide-react';

interface AdminAuditLogsTabProps {
  logs: ActivityLog[];
  logHasMore: boolean;
  loadMoreLogs: () => void;
  exportLogsToPDF: (logs: ActivityLog[]) => void;
}

export default function AdminAuditLogsTab({
  logs,
  logHasMore,
  loadMoreLogs,
  exportLogsToPDF,
}: AdminAuditLogsTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-surface-900 tracking-tight">Administrative Activity Ledger</h2>
          <p className="text-xs text-surface-400 mt-0.5">Chronological system events and logging entries tracked from hotel adjustments.</p>
        </div>
        <button
          onClick={() => exportLogsToPDF(logs)}
          className="flex-shrink-0 px-3 py-2 bg-surface-900 text-white hover:bg-surface-800 transition-all text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5" /> Export PDF
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden text-xs">
        <div className="p-4 bg-surface-50/80 border-b border-surface-100 text-[10px] font-bold text-surface-400 uppercase tracking-wider flex justify-between">
          <span>Action Statement</span>
          <span>Recorded Time</span>
        </div>
        <div className="divide-y divide-surface-100 max-h-120 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="p-4 hover:bg-surface-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-surface-900">{log.action}</span>
                  <span className="px-1.5 py-0.5 bg-surface-100 text-surface-500 rounded text-[9px] font-mono uppercase">{log.user_name}</span>
                </div>
                <p className="text-[11px] text-surface-400 font-mono mt-1 leading-relaxed">{log.details}</p>
              </div>
              <span className="text-[10px] text-surface-400 font-mono whitespace-nowrap">
                {new Date(log.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
        {logHasMore && (
          <div className="p-4 border-t border-surface-100 text-center">
            <button
              type="button"
              onClick={loadMoreLogs}
              className="px-4 py-2 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            >
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
