import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Room, Profile, HousekeepingTask } from '../../types';
import type { AppSettings } from '../../lib/settings';
import { Wrench, Hammer, Calendar, Clock, User, CheckCircle, AlertTriangle, Plus, X, Search, Filter, RefreshCw, Loader2 } from 'lucide-react';

interface AdminMaintenanceTabProps {
  rooms: Room[];
  employees: Profile[];
  housekeepingTasks: HousekeepingTask[];
  userProfile: Profile | null;
  settings: AppSettings;
  addToast: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
  refreshTable: (table: string) => Promise<void>;
  triggerConfirm: (title: string, message: string, onConfirm: () => Promise<void>, isDestructive?: boolean, confirmLabel?: string) => void;
  triggerAlert: (title: string, message: string) => void;
}

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700 border-gray-200',
  normal: 'bg-sky-50 text-sky-700 border-sky-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  urgent: 'bg-rose-50 text-rose-700 border-rose-200',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-surface-100 text-surface-500 border-surface-200',
};

const ROOM_STATUS_STYLES: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  booked: 'bg-blue-100 text-blue-700 border-blue-200',
  maintenance: 'bg-amber-100 text-amber-700 border-amber-200',
  cleaning: 'bg-purple-100 text-purple-700 border-purple-200',
  reserved: 'bg-sky-100 text-sky-700 border-sky-200',
};

const defaultNewTask = {
  room_id: '',
  priority: 'normal' as HousekeepingTask['priority'],
  assigned_to: '',
  notes: '',
  scheduled_date: '',
};

export default function AdminMaintenanceTab({
  rooms,
  employees,
  housekeepingTasks,
  userProfile,
  addToast,
  refreshTable,
  triggerConfirm,
  triggerAlert,
}: AdminMaintenanceTabProps) {
  const [maintenanceTasks, setMaintenanceTasks] = useState<HousekeepingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterRoom, setFilterRoom] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [newTask, setNewTask] = useState(defaultNewTask);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    loadMaintenanceTasks();
  }, []);

  const loadMaintenanceTasks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .select('*, rooms(*), users(*)')
        .in('task_type', ['maintenance_check'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMaintenanceTasks(data || []);
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Failed to load maintenance tasks');
    } finally {
      setLoading(false);
    }
  };

  const tasks = useMemo(() => {
    const propTasks = housekeepingTasks.filter(t => t.task_type === 'maintenance_check');
    const merged = [...maintenanceTasks];
    for (const t of propTasks) {
      if (!merged.find(m => m.id === t.id)) {
        merged.push(t);
      }
    }
    return merged;
  }, [maintenanceTasks, housekeepingTasks]);

  const totalCount = tasks.length;
  const activeCount = tasks.filter(t => t.status === 'in_progress').length;
  const completedThisMonth = tasks.filter(t => {
    if (t.status !== 'completed' || !t.completed_at) return false;
    const now = new Date();
    const d = new Date(t.completed_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const roomsInMaintenance = rooms.filter(r => r.status === 'maintenance').length;

  const maintenanceRoomIds = new Set(tasks.filter(t => t.status === 'in_progress' || t.status === 'pending').map(t => t.room_id));

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filterRoom && !task.rooms?.room_number?.toLowerCase().includes(filterRoom.toLowerCase())) return false;
      if (filterPriority && task.priority !== filterPriority) return false;
      if (filterStatus && task.status !== filterStatus) return false;
      return true;
    });
  }, [tasks, filterRoom, filterPriority, filterStatus]);

  const handleStatusChange = async (task: HousekeepingTask, newStatus: string) => {
    setUpdatingId(task.id);
    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'completed') {
        updates.completed_at = new Date().toISOString();
      }
      const { error } = await supabase.from('housekeeping_tasks').update(updates).eq('id', task.id);
      if (error) throw error;

      if (newStatus === 'in_progress') {
        await supabase.from('rooms').update({ status: 'maintenance' }).eq('id', task.room_id);
      }

      if (newStatus === 'completed') {
        const { data: activeForRoom, error: activeErr } = await supabase
          .from('housekeeping_tasks')
          .select('id')
          .eq('room_id', task.room_id)
          .in('status', ['pending', 'in_progress'])
          .neq('id', task.id);
        if (!activeErr && (!activeForRoom || activeForRoom.length === 0)) {
          await supabase.from('rooms').update({ status: 'available' }).eq('id', task.room_id);
        }
      }

      if (newStatus === 'cancelled') {
        const { data: activeForRoom, error: activeErr } = await supabase
          .from('housekeeping_tasks')
          .select('id')
          .eq('room_id', task.room_id)
          .in('status', ['pending', 'in_progress'])
          .neq('id', task.id);
        if (!activeErr && (!activeForRoom || activeForRoom.length === 0)) {
          await supabase.from('rooms').update({ status: 'available' }).eq('id', task.room_id);
        }
      }

      addToast('success', 'Updated', `Task marked as ${newStatus.replace(/_/g, ' ')}`);
      await loadMaintenanceTasks();
      await refreshTable('housekeeping_tasks');

      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id || '',
        user_name: userProfile?.full_name || 'Admin',
        action: `Maintenance ${newStatus}`,
        details: `Room ${task.rooms?.room_number || 'N/A'} — ${task.priority} priority`,
      });
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Failed to update');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancelTask = (task: HousekeepingTask) => {
    triggerConfirm(
      'Cancel Maintenance Task',
      `Are you sure you want to cancel the maintenance task for Room ${task.rooms?.room_number || 'N/A'}?`,
      async () => {
        await handleStatusChange(task, 'cancelled');
      },
      true,
      'Cancel Task'
    );
  };

  const handleCreateTask = async () => {
    if (!newTask.room_id) {
      triggerAlert('Validation Error', 'Please select a room.');
      return;
    }
    setCreating(true);
    try {
      const { error } = await supabase.from('housekeeping_tasks').insert({
        room_id: newTask.room_id,
        assigned_to: newTask.assigned_to || null,
        priority: newTask.priority,
        status: 'pending',
        task_type: 'maintenance_check',
        notes: newTask.notes,
        photos: [],
        completed_at: null,
        scheduled_date: newTask.scheduled_date || null,
      });
      if (error) throw error;

      await supabase.from('rooms').update({ status: 'maintenance' }).eq('id', newTask.room_id);

      addToast('success', 'Created', 'Maintenance task created successfully');
      await loadMaintenanceTasks();
      await refreshTable('housekeeping_tasks');

      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id || '',
        user_name: userProfile?.full_name || 'Admin',
        action: 'Maintenance Created',
        details: `Room ${rooms.find(r => r.id === newTask.room_id)?.room_number || 'N/A'} — ${newTask.priority}`,
      });

      setShowCreateModal(false);
      setNewTask(defaultNewTask);
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const scrollToTask = (roomId: string) => {
    const el = document.getElementById(`maintenance-task-${roomId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const hasFilters = filterRoom || filterPriority || filterStatus;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-surface-900 tracking-tight">Maintenance Management</h2>
          <p className="text-xs text-surface-400 mt-0.5">Track repairs, preventive maintenance, and vendor work orders.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadMaintenanceTasks}
            className="px-3 py-2 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-2 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Maintenance Task
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-surface-900">{totalCount}</p>
          <p className="text-[10px] text-surface-400 font-semibold uppercase tracking-wider mt-0.5">Total Tasks</p>
        </div>
        <div className="bg-white rounded-2xl border border-sky-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-sky-600">{activeCount}</p>
          <p className="text-[10px] text-sky-500 font-semibold uppercase tracking-wider mt-0.5">Active</p>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-emerald-600">{completedThisMonth}</p>
          <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wider mt-0.5">Completed This Month</p>
        </div>
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-amber-600">{roomsInMaintenance}</p>
          <p className="text-[10px] text-amber-500 font-semibold uppercase tracking-wider mt-0.5">Rooms in Maintenance</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-3">
        <p className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Room Status Overview</p>
        <div className="flex flex-wrap gap-1.5">
          {rooms.map(room => (
            <button
              key={room.id}
              onClick={() => maintenanceRoomIds.has(room.id) && scrollToTask(room.id)}
              className={`px-2 py-1 text-[10px] font-semibold rounded-lg border cursor-pointer transition-all ${
                ROOM_STATUS_STYLES[room.status] || 'bg-surface-50 text-surface-600 border-surface-200'
              } ${maintenanceRoomIds.has(room.id) ? 'ring-2 ring-amber-400 ring-offset-1' : 'opacity-80 hover:opacity-100'}`}
              title={`Room ${room.room_number} — ${room.status}`}
            >
              {room.room_number}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[140px] max-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
          <input
            type="text"
            placeholder="Search room..."
            value={filterRoom}
            onChange={e => setFilterRoom(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-surface-50 border border-surface-100 rounded-lg text-xs text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-surface-200"
          />
        </div>
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="px-3 py-1.5 bg-surface-50 border border-surface-100 rounded-lg text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-surface-200"
        >
          <option value="">All Priorities</option>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 bg-surface-50 border border-surface-100 rounded-lg text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-surface-200"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterRoom(''); setFilterPriority(''); setFilterStatus(''); }}
            className="px-2 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-bold cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center shadow-sm">
          <Loader2 className="w-8 h-8 text-surface-300 mx-auto mb-3 animate-spin" />
          <p className="text-xs text-surface-400">Loading maintenance tasks...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto shadow-sm">
          <Wrench className="w-10 h-10 text-surface-200 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-surface-700">No maintenance tasks found</h3>
          <p className="text-xs text-surface-400 mt-1">
            {hasFilters ? 'Try adjusting your filters.' : 'Create a new maintenance task to get started.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-100">
                  <th className="text-left px-4 py-3 font-bold text-surface-600 uppercase tracking-wider">Room #</th>
                  <th className="text-left px-4 py-3 font-bold text-surface-600 uppercase tracking-wider">Priority</th>
                  <th className="text-left px-4 py-3 font-bold text-surface-600 uppercase tracking-wider">Assigned To</th>
                  <th className="text-left px-4 py-3 font-bold text-surface-600 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 font-bold text-surface-600 uppercase tracking-wider">Notes</th>
                  <th className="text-left px-4 py-3 font-bold text-surface-600 uppercase tracking-wider">Created</th>
                  <th className="text-right px-4 py-3 font-bold text-surface-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filteredTasks.map(task => (
                  <tr
                    key={task.id}
                    id={`maintenance-task-${task.room_id}`}
                    className="hover:bg-surface-50/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Hammer className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
                        <span className="font-bold text-surface-900">Room {task.rooms?.room_number || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded-full border ${PRIORITY_STYLES[task.priority] || 'bg-surface-100 text-surface-600'}`}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3 h-3 text-surface-400" />
                        <span className="text-surface-700">{task.users?.full_name || 'Unassigned'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded-full border ${STATUS_STYLES[task.status] || 'bg-surface-100 text-surface-600'}`}>
                        {task.status === 'in_progress' ? 'In Progress' : task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[160px]">
                      <span className="text-surface-500 truncate block">{task.notes || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-surface-500 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-surface-400" />
                        {new Date(task.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {task.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleStatusChange(task, 'in_progress')}
                              disabled={updatingId === task.id}
                              className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[9px] font-bold cursor-pointer disabled:opacity-50 transition-colors flex items-center gap-1"
                            >
                              {updatingId === task.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <PlayIcon />}
                              Start
                            </button>
                            <button
                              onClick={() => handleCancelTask(task)}
                              disabled={updatingId === task.id}
                              className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-[9px] font-bold cursor-pointer disabled:opacity-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {task.status === 'in_progress' && (
                          <>
                            <button
                              onClick={() => handleStatusChange(task, 'completed')}
                              disabled={updatingId === task.id}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-bold cursor-pointer disabled:opacity-50 transition-colors flex items-center gap-1"
                            >
                              {updatingId === task.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <CheckCircle className="w-2.5 h-2.5" />}
                              Complete
                            </button>
                            <button
                              onClick={() => handleCancelTask(task)}
                              disabled={updatingId === task.id}
                              className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-[9px] font-bold cursor-pointer disabled:opacity-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {task.status === 'completed' && (
                          <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-1">
                            <CheckCircle className="w-2.5 h-2.5" />
                            Done
                          </span>
                        )}
                        {task.status === 'cancelled' && (
                          <span className="text-[9px] text-surface-400 font-semibold flex items-center gap-1">
                            <X className="w-2.5 h-2.5" />
                            Cancelled
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-surface-100 w-full max-w-md p-6 m-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-surface-900">New Maintenance Task</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-surface-100 rounded-lg cursor-pointer">
                <X className="w-4 h-4 text-surface-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-surface-600 uppercase tracking-wider mb-1.5">Room</label>
                <select
                  value={newTask.room_id}
                  onChange={e => setNewTask(prev => ({ ...prev, room_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-100 rounded-xl text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-surface-200"
                >
                  <option value="">Select a room...</option>
                  {rooms.map(room => (
                    <option key={room.id} value={room.id}>
                      Room {room.room_number} ({room.type}) — {room.status}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-surface-600 uppercase tracking-wider mb-1.5">Task Type</label>
                <div className="px-3 py-2 bg-surface-50 border border-surface-100 rounded-xl text-xs text-surface-500 flex items-center gap-2">
                  <Wrench className="w-3.5 h-3.5" />
                  Maintenance Check
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-surface-600 uppercase tracking-wider mb-1.5">Priority</label>
                <select
                  value={newTask.priority}
                  onChange={e => setNewTask(prev => ({ ...prev, priority: e.target.value as HousekeepingTask['priority'] }))}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-100 rounded-xl text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-surface-200"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-surface-600 uppercase tracking-wider mb-1.5">Assign To</label>
                <select
                  value={newTask.assigned_to}
                  onChange={e => setNewTask(prev => ({ ...prev, assigned_to: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-100 rounded-xl text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-surface-200"
                >
                  <option value="">Unassigned</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-surface-600 uppercase tracking-wider mb-1.5">Scheduled Date</label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                  <input
                    type="date"
                    value={newTask.scheduled_date}
                    onChange={e => setNewTask(prev => ({ ...prev, scheduled_date: e.target.value }))}
                    className="w-full pl-8 pr-3 py-2 bg-surface-50 border border-surface-100 rounded-xl text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-surface-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-surface-600 uppercase tracking-wider mb-1.5">Description / Notes</label>
                <textarea
                  value={newTask.notes}
                  onChange={e => setNewTask(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  placeholder="Describe the maintenance issue..."
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-100 rounded-xl text-xs text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-surface-200 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTask}
                  disabled={creating}
                  className="px-4 py-2 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="currentColor">
      <path d="M3.5 1.5v9l7-4.5z" />
    </svg>
  );
}
