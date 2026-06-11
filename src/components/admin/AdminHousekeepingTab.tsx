import { useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { HousekeepingTask, Room, Profile } from '../../types';
import type { AppSettings } from '../../lib/settings';
import { Plus, X, Search } from 'lucide-react';

interface AdminHousekeepingTabProps {
  housekeepingTasks: HousekeepingTask[];
  rooms: Room[];
  employees: Profile[];
  userProfile: Profile | null;
  settings: AppSettings;
  addToast: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
  refreshTable: (table: string) => Promise<void>;
  triggerConfirm: (title: string, message: string, onConfirm: () => Promise<void>, isDestructive?: boolean, confirmLabel?: string) => void;
  triggerAlert: (title: string, message: string) => void;
}

const TASK_TYPE_LABELS: Record<string, string> = {
  cleaning: 'Cleaning',
  turnover: 'Turnover',
  deep_clean: 'Deep Clean',
  maintenance_check: 'Maintenance Check',
  supply_restock: 'Supply Restock',
  inspection: 'Inspection',
};

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700 border-gray-200',
  normal: 'bg-sky-50 text-sky-700 border-sky-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  urgent: 'bg-rose-50 text-rose-700 border-rose-200',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'border-amber-200',
  in_progress: 'border-sky-200',
  completed: 'border-emerald-200',
  cancelled: 'border-surface-200',
};

const defaultNewTask = {
  room_id: '',
  task_type: 'cleaning' as HousekeepingTask['task_type'],
  priority: 'normal' as HousekeepingTask['priority'],
  assigned_to: '',
  notes: '',
};

export default function AdminHousekeepingTab({
  housekeepingTasks,
  rooms,
  employees,
  userProfile,
  addToast,
  refreshTable,
  triggerAlert,
}: AdminHousekeepingTabProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterRoom, setFilterRoom] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState(defaultNewTask);
  const [creating, setCreating] = useState(false);

  const totalTasks = housekeepingTasks.length;
  const pendingCount = housekeepingTasks.filter(t => t.status === 'pending').length;
  const inProgressCount = housekeepingTasks.filter(t => t.status === 'in_progress').length;
  const completedToday = housekeepingTasks.filter(t => {
    if (t.status !== 'completed' || !t.completed_at) return false;
    const today = new Date();
    const d = new Date(t.completed_at);
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }).length;

  const filteredTasks = useMemo(() => {
    return housekeepingTasks.filter(task => {
      if (filterRoom && !task.rooms?.room_number?.toLowerCase().includes(filterRoom.toLowerCase())) return false;
      if (filterPriority && task.priority !== filterPriority) return false;
      if (filterStatus && task.status !== filterStatus) return false;
      if (filterType && task.task_type !== filterType) return false;
      return true;
    });
  }, [housekeepingTasks, filterRoom, filterPriority, filterStatus, filterType]);

  const pendingTasks = filteredTasks.filter(t => t.status === 'pending');
  const inProgressTasks = filteredTasks.filter(t => t.status === 'in_progress');
  const completedTasks = filteredTasks.filter(t => t.status === 'completed');

  const handleStatusChange = async (task: HousekeepingTask, newStatus: string) => {
    setUpdatingId(task.id);
    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'completed') {
        updates.completed_at = new Date().toISOString();
      }
      const { error } = await supabase.from('housekeeping_tasks').update(updates).eq('id', task.id);
      if (error) throw error;

      if (newStatus === 'completed' && (task.task_type === 'cleaning' || task.task_type === 'turnover')) {
        await supabase.from('rooms').update({ status: 'available' }).eq('id', task.room_id);
      }

      addToast('success', 'Updated', `Task marked as ${newStatus.replace(/_/g, ' ')}`);
      await refreshTable('housekeeping_tasks');

      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id || '',
        user_name: userProfile?.full_name || 'Admin',
        action: `Housekeeping ${newStatus}`,
        details: `Room ${task.rooms?.room_number || 'N/A'} — ${TASK_TYPE_LABELS[task.task_type] || task.task_type}`,
      });
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Failed to update');
    } finally {
      setUpdatingId(null);
    }
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
        task_type: newTask.task_type,
        notes: newTask.notes,
        photos: [],
        completed_at: null,
      });
      if (error) throw error;

      if (newTask.task_type === 'cleaning' || newTask.task_type === 'turnover') {
        await supabase.from('rooms').update({ status: 'cleaning' }).eq('id', newTask.room_id);
      }

      addToast('success', 'Created', 'Housekeeping task created successfully');
      await refreshTable('housekeeping_tasks');

      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id || '',
        user_name: userProfile?.full_name || 'Admin',
        action: 'Housekeeping Created',
        details: `Room ${rooms.find(r => r.id === newTask.room_id)?.room_number || 'N/A'} — ${TASK_TYPE_LABELS[newTask.task_type]}`,
      });

      setShowCreateModal(false);
      setNewTask(defaultNewTask);
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const availableRooms = rooms.filter(r => r.status !== 'maintenance');

  const hasFilters = filterRoom || filterPriority || filterStatus || filterType;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-surface-900 tracking-tight">Housekeeping Management</h2>
          <p className="text-xs text-surface-400 mt-0.5">Manage cleaning tasks, inspections, and room upkeep.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-2 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Task
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-surface-900">{totalTasks}</p>
          <p className="text-[10px] text-surface-400 font-semibold uppercase tracking-wider mt-0.5">Total Tasks</p>
        </div>
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          <p className="text-[10px] text-amber-500 font-semibold uppercase tracking-wider mt-0.5">Pending</p>
        </div>
        <div className="bg-white rounded-2xl border border-sky-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-sky-600">{inProgressCount}</p>
          <p className="text-[10px] text-sky-500 font-semibold uppercase tracking-wider mt-0.5">In Progress</p>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-emerald-600">{completedToday}</p>
          <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wider mt-0.5">Completed Today</p>
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
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-1.5 bg-surface-50 border border-surface-100 rounded-lg text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-surface-200"
        >
          <option value="">All Types</option>
          <option value="cleaning">Cleaning</option>
          <option value="turnover">Turnover</option>
          <option value="deep_clean">Deep Clean</option>
          <option value="maintenance_check">Maintenance Check</option>
          <option value="supply_restock">Supply Restock</option>
          <option value="inspection">Inspection</option>
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterRoom(''); setFilterPriority(''); setFilterStatus(''); setFilterType(''); }}
            className="px-2 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-bold cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {housekeepingTasks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto shadow-sm">
          <svg className="w-10 h-10 text-surface-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          <h3 className="text-sm font-semibold text-surface-700">No housekeeping tasks yet</h3>
          <p className="text-xs text-surface-400 mt-1">Create a new task to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 items-start">
          <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full" />
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Pending</span>
              <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{pendingTasks.length}</span>
            </div>
            <div className="p-3 space-y-3 min-h-[200px]">
              {pendingTasks.length === 0 ? (
                <p className="text-xs text-surface-400 text-center py-8">No pending tasks</p>
              ) : pendingTasks.map(task => (
                <TaskCard key={task.id} task={task} updatingId={updatingId} onStatusChange={handleStatusChange} />
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-sky-50 border-b border-sky-100 flex items-center gap-2">
              <span className="w-2 h-2 bg-sky-500 rounded-full" />
              <span className="text-xs font-bold text-sky-800 uppercase tracking-wider">In Progress</span>
              <span className="ml-auto text-[10px] font-bold text-sky-600 bg-sky-100 px-2 py-0.5 rounded-full">{inProgressTasks.length}</span>
            </div>
            <div className="p-3 space-y-3 min-h-[200px]">
              {inProgressTasks.length === 0 ? (
                <p className="text-xs text-surface-400 text-center py-8">No tasks in progress</p>
              ) : inProgressTasks.map(task => (
                <TaskCard key={task.id} task={task} updatingId={updatingId} onStatusChange={handleStatusChange} />
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Completed</span>
              <span className="ml-auto text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">{completedTasks.length}</span>
            </div>
            <div className="p-3 space-y-3 min-h-[200px]">
              {completedTasks.length === 0 ? (
                <p className="text-xs text-surface-400 text-center py-8">No completed tasks</p>
              ) : completedTasks.map(task => (
                <TaskCard key={task.id} task={task} updatingId={updatingId} onStatusChange={handleStatusChange} />
              ))}
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-surface-100 w-full max-w-md p-6 m-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-surface-900">New Housekeeping Task</h3>
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
                  {availableRooms.map(room => (
                    <option key={room.id} value={room.id}>
                      Room {room.room_number} ({room.type}) — {room.status}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-surface-600 uppercase tracking-wider mb-1.5">Task Type</label>
                <select
                  value={newTask.task_type}
                  onChange={e => setNewTask(prev => ({ ...prev, task_type: e.target.value as HousekeepingTask['task_type'] }))}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-100 rounded-xl text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-surface-200"
                >
                  <option value="cleaning">Cleaning</option>
                  <option value="turnover">Turnover</option>
                  <option value="deep_clean">Deep Clean</option>
                  <option value="maintenance_check">Maintenance Check</option>
                  <option value="supply_restock">Supply Restock</option>
                  <option value="inspection">Inspection</option>
                </select>
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
                <label className="block text-[11px] font-bold text-surface-600 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea
                  value={newTask.notes}
                  onChange={e => setNewTask(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  placeholder="Optional notes about this task..."
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

function TaskCard({
  task,
  updatingId,
  onStatusChange,
}: {
  task: HousekeepingTask;
  updatingId: string | null;
  onStatusChange: (task: HousekeepingTask, newStatus: string) => void;
}) {
  const isUpdating = updatingId === task.id;

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-3 space-y-2.5 transition-all ${STATUS_STYLES[task.status] || 'border-surface-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-bold text-surface-900">Room {task.rooms?.room_number || 'N/A'}</span>
        <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full border ${PRIORITY_STYLES[task.priority] || 'bg-surface-100 text-surface-600'}`}>
          {task.priority}
        </span>
      </div>
      <span className="inline-block px-2 py-0.5 bg-surface-100 text-surface-600 text-[9px] font-bold uppercase rounded-full">
        {TASK_TYPE_LABELS[task.task_type] || task.task_type}
      </span>
      {task.users?.full_name && (
        <p className="text-[10px] text-surface-500 font-medium truncate">{task.users.full_name}</p>
      )}
      {task.notes && (
        <p className="text-[10px] text-surface-400 line-clamp-2">{task.notes}</p>
      )}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[9px] text-surface-400">{new Date(task.created_at).toLocaleDateString()}</span>
        <div className="flex items-center gap-1">
          {task.status === 'pending' && (
            <button
              onClick={() => onStatusChange(task, 'in_progress')}
              disabled={isUpdating}
              className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[9px] font-bold cursor-pointer disabled:opacity-50 transition-colors"
            >
              Start
            </button>
          )}
          {task.status === 'in_progress' && (
            <button
              onClick={() => onStatusChange(task, 'completed')}
              disabled={isUpdating}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-bold cursor-pointer disabled:opacity-50 transition-colors"
            >
              Complete
            </button>
          )}
          {isUpdating && (
            <span className="text-[9px] text-surface-400 animate-pulse">...</span>
          )}
        </div>
      </div>
    </div>
  );
}
