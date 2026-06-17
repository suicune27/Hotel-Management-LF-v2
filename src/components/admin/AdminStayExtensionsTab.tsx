import { supabase } from '../../lib/supabase';
import { StayExtension } from '../../types';
import { Clock, Check, X } from 'lucide-react';
import type { AppSettings } from '../../lib/settings';
import type { Profile } from '../../types';
import type { ToastMessage } from '../Toast';

interface AdminStayExtensionsTabProps {
  stayExtensions: StayExtension[];
  settings: AppSettings;
  userProfile: Profile | null;
  addToast: (type: ToastMessage['type'], title: string, message: string, action?: { label: string; onClick: () => void }) => void;
  refreshTable: (table: string) => Promise<void>;
  loadDatabase: () => Promise<void>;
}

export default function AdminStayExtensionsTab({
  stayExtensions,
  settings,
  userProfile,
  addToast,
  refreshTable,
  loadDatabase,
}: AdminStayExtensionsTabProps) {
  const pendingExtensions = stayExtensions.filter(e => e.status === 'pending');
  const historyExtensions = stayExtensions.filter(e => e.status !== 'pending');

  const handleApproveExtension = async (ext: StayExtension) => {
    try {
      await supabase.from('stay_extensions').update({ status: 'approved', reviewed_by: userProfile?.id }).eq('id', ext.id);
      if (ext.requested_check_out_date) {
        const update: any = { check_out_date: ext.requested_check_out_date };
        if (ext.requested_check_out_time) {
          update.check_out_time = ext.requested_check_out_time;
        }
        await supabase.from('bookings').update(update).eq('id', ext.booking_id);
      }
      addToast('success', 'Approved', 'Stay extension approved');
      await refreshTable('stay_extensions');
      await loadDatabase();
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Failed to approve');
    }
  };

  const handleRejectExtension = async (ext: StayExtension) => {
    try {
      await supabase.from('stay_extensions').update({ status: 'rejected', reviewed_by: userProfile?.id }).eq('id', ext.id);
      addToast('success', 'Rejected', 'Stay extension rejected');
      await refreshTable('stay_extensions');
      await loadDatabase();
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Failed to reject');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-surface-900 tracking-tight">Stay Extension Requests</h2>
        <p className="text-xs text-surface-400 mt-0.5">
          {pendingExtensions.length} pending extension{pendingExtensions.length !== 1 ? 's' : ''} from guests
        </p>
      </div>

      {stayExtensions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto shadow-sm">
          <Clock className="w-10 h-10 text-surface-200 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-surface-700">No extension requests</h3>
          <p className="text-xs text-surface-400 mt-1">Guest extension requests will appear here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* PENDING */}
          {pendingExtensions.length > 0 && (
            <div className="space-y-2">
              {pendingExtensions.map(ext => (
                <div key={ext.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-bold text-surface-900">
                        {ext.bookings?.customers?.full_name || 'Guest'} — Suite {ext.bookings?.rooms?.room_number || 'N/A'}
                      </p>
                      <p className="text-xs text-surface-500 mt-0.5">
                        Requested until {ext.requested_check_out_date}
                        {ext.extend_type === 'hour' && ext.requested_hours && (
                          <span> (+{ext.requested_hours}h)</span>
                        )}
                      </p>
                      {ext.reason && (
                        <p className="text-[11px] text-surface-400 italic mt-1">"{ext.reason}"</p>
                      )}
                    </div>
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[9px] font-bold uppercase rounded-full border border-amber-100 whitespace-nowrap">
                      Pending
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveExtension(ext)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => handleRejectExtension(ext)}
                      className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* HISTORY */}
          {historyExtensions.length > 0 && (
            <details className="bg-white rounded-2xl border border-surface-100 shadow-sm">
              <summary className="px-4 py-3 text-xs font-bold text-surface-600 cursor-pointer hover:bg-surface-50 rounded-2xl transition-colors">
                History — {historyExtensions.length} processed request{historyExtensions.length !== 1 ? 's' : ''}
              </summary>
              <div className="divide-y divide-surface-100 px-4 pb-3">
                {historyExtensions.map(ext => (
                  <div key={ext.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-surface-700 truncate">
                        {ext.bookings?.customers?.full_name || 'Guest'} — Requested until {ext.requested_check_out_date}
                      </p>
                      {ext.reason && <p className="text-[10px] text-surface-400 truncate">{ext.reason}</p>}
                    </div>
                    <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ml-2 whitespace-nowrap ${
                      ext.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {ext.status}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
