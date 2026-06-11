import { supabase } from '../../lib/supabase';
import { StaffCall } from '../../types';
import { Bell, Phone } from 'lucide-react';
import type { AppSettings } from '../../lib/settings';
import type { Profile } from '../../types';
import type { ToastMessage } from '../Toast';

interface AdminStaffCallsTabProps {
  staffCalls: StaffCall[];
  settings: AppSettings;
  userProfile: Profile | null;
  addToast: (type: ToastMessage['type'], title: string, message: string) => void;
  refreshTable: (table: string) => Promise<void>;
}

export default function AdminStaffCallsTab({
  staffCalls,
  settings,
  userProfile,
  addToast,
  refreshTable,
}: AdminStaffCallsTabProps) {
  const pendingCalls = staffCalls.filter(c => c.status === 'pending');
  const respondedCalls = staffCalls.filter(c => c.status === 'responded');
  const historyCalls = staffCalls.filter(c => c.status === 'completed' || c.status === 'cancelled');

  const handleUpdateCallStatus = async (call: StaffCall, newStatus: string) => {
    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'responded' || newStatus === 'completed') {
        updates.responded_at = new Date().toISOString();
      }
      const { error } = await supabase.from('staff_calls').update(updates).eq('id', call.id);
      if (error) throw error;
      addToast('success', 'Updated', `Staff call updated to ${newStatus}`);
      await refreshTable('staff_calls');

      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id || '',
        user_name: userProfile?.full_name || 'Admin',
        action: `Staff Call ${newStatus}`,
        details: `${call.guest_name} — ${call.reason}`,
      });
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Failed to update');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-surface-900 tracking-tight">Guest Assistance Requests</h2>
        <p className="text-xs text-surface-400 mt-0.5">
          {pendingCalls.length} pending — {staffCalls.filter(c => c.status === 'responded').length} being handled
        </p>
      </div>

      {staffCalls.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto shadow-sm">
          <Bell className="w-10 h-10 text-surface-200 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-surface-700">No staff calls yet</h3>
          <p className="text-xs text-surface-400 mt-1">Guest requests will appear here in real time.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* PENDING CALLS */}
          {pendingCalls.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                Pending — {pendingCalls.length}
              </h3>
              <div className="space-y-2">
                {pendingCalls.map(call => (
                  <div key={call.id} className="bg-white rounded-2xl border border-rose-200 shadow-sm p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 bg-rose-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Bell className="w-4 h-4 text-rose-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-surface-900 truncate">
                          {call.guest_name} — {call.reason}
                        </p>
                        <p className="text-[10px] text-surface-400">
                          Suite {call.bookings?.rooms?.room_number || 'N/A'} — {new Date(call.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[9px] font-bold uppercase rounded-full border border-rose-100">New</span>
                      <button
                        onClick={() => handleUpdateCallStatus(call, 'responded')}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        Mark Responding
                      </button>
                      <button
                        onClick={() => handleUpdateCallStatus(call, 'completed')}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RESPONDED CALLS */}
          {respondedCalls.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-sky-500 rounded-full" />
                Responded — {respondedCalls.length}
              </h3>
              <div className="space-y-2">
                {respondedCalls.map(call => (
                  <div key={call.id} className="bg-white rounded-2xl border border-sky-200 shadow-sm p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 bg-sky-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Phone className="w-4 h-4 text-sky-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-surface-900">{call.guest_name} — {call.reason}</p>
                        <p className="text-[10px] text-surface-400">Suite {call.bookings?.rooms?.room_number || 'N/A'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUpdateCallStatus(call, 'completed')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold cursor-pointer whitespace-nowrap"
                    >
                      Mark Complete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HISTORY */}
          {historyCalls.length > 0 && (
            <details className="bg-white rounded-2xl border border-surface-100 shadow-sm">
              <summary className="px-4 py-3 text-xs font-bold text-surface-600 cursor-pointer hover:bg-surface-50 rounded-2xl transition-colors">
                History — {historyCalls.length} calls
              </summary>
              <div className="divide-y divide-surface-100 px-4 pb-3">
                {historyCalls.map(call => (
                  <div key={call.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-surface-700">{call.guest_name} — {call.reason}</p>
                      <p className="text-[10px] text-surface-400">{new Date(call.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ml-2 ${
                      call.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-100 text-surface-500'
                    }`}>
                      {call.status}
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
