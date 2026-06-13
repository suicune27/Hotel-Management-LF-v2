import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { ShiftTemplate } from '../../types';
import { Clock, Plus, Save, X, Edit3, Trash2, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

interface AdminShiftManagementProps {
  addToast: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => Promise<void>, isDestructive?: boolean, confirmLabel?: string) => void;
  triggerAlert: (title: string, message: string) => void;
}

export default function AdminShiftManagement({ addToast, triggerConfirm, triggerAlert }: AdminShiftManagementProps) {
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingShift, setEditingShift] = useState<ShiftTemplate | null>(null);
  const [form, setForm] = useState({ name: '', start_time: '07:00', end_time: '15:00', break_duration: 30, description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadShifts(); }, []);

  const loadShifts = async () => {
    setLoading(true);
    const { data } = await supabase.from('shift_templates').select('*').order('name');
    if (data) setShifts(data);
    setLoading(false);
  };

  const openCreate = () => {
    setEditingShift(null);
    setForm({ name: '', start_time: '07:00', end_time: '15:00', break_duration: 30, description: '' });
  };

  const openEdit = (s: ShiftTemplate) => {
    setEditingShift(s);
    setForm({ name: s.name, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5), break_duration: s.break_duration, description: s.description });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { triggerAlert('Validation Error', 'Shift name is required.'); return; }
    setSaving(true);
    try {
      if (editingShift) {
        const { error } = await supabase.from('shift_templates').update({
          name: form.name.trim(), start_time: form.start_time + ':00', end_time: form.end_time + ':00',
          break_duration: form.break_duration, description: form.description.trim(),
        }).eq('id', editingShift.id);
        if (error) throw error;
        addToast('success', 'Updated', `Shift "${form.name}" updated.`);
      } else {
        const { error } = await supabase.from('shift_templates').insert({
          name: form.name.trim(), start_time: form.start_time + ':00', end_time: form.end_time + ':00',
          break_duration: form.break_duration, description: form.description.trim(),
        });
        if (error) throw error;
        addToast('success', 'Created', `Shift "${form.name}" created.`);
      }
      setEditingShift(null);
      loadShifts();
    } catch (err: any) {
      triggerAlert('Save Error', err.message);
    } finally { setSaving(false); }
  };

  const handleDelete = (s: ShiftTemplate) => {
    triggerConfirm('Delete Shift', `Delete shift "${s.name}"? Employees assigned to this shift will keep their current schedule but the template will be removed.`, async () => {
      const { error } = await supabase.from('shift_templates').delete().eq('id', s.id);
      if (error) throw error;
      addToast('success', 'Deleted', `Shift "${s.name}" removed.`);
      loadShifts();
    }, true, 'Delete');
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-surface-400 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-surface-600" />
          <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider">Shift Templates</h3>
        </div>
        <button onClick={openCreate} className="px-3 py-1.5 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors">
          <Plus className="w-3 h-3" /> New Shift
        </button>
      </div>

      {/* Edit/Create Modal */}
      {editingShift !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl border border-surface-200 p-5 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-surface-900">{editingShift ? 'Edit Shift' : 'New Shift'}</h3>
              <button onClick={() => setEditingShift(null)} className="p-1 text-surface-400 hover:text-surface-600 cursor-pointer rounded-lg hover:bg-surface-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-[10px] text-surface-500 font-semibold mb-1">Shift Name</label>
                <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Morning Shift"
                  autoFocus
                  className="w-full bg-white border border-surface-200 rounded-lg py-2 px-3 text-xs text-surface-800 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-surface-500 font-semibold mb-1">Start Time</label>
                  <input type="time" required value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2 px-3 text-xs text-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-surface-500 font-semibold mb-1">End Time</label>
                  <input type="time" required value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2 px-3 text-xs text-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-surface-500 font-semibold mb-1">Break Duration (min)</label>
                  <input type="number" min={0} step={5} value={form.break_duration} onChange={e => setForm({ ...form, break_duration: parseInt(e.target.value) || 0 })}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2 px-3 text-xs text-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-surface-500 font-semibold mb-1">Status</label>
                  <div className="flex items-center gap-2 h-full pt-1">
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">Active</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-surface-500 font-semibold mb-1">Description (optional)</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Notes about this shift..."
                  rows={2}
                  className="w-full bg-white border border-surface-200 rounded-lg py-2 px-3 text-xs text-surface-800 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditingShift(null)} className="px-3 py-1.5 border border-surface-200 text-surface-600 rounded-lg text-[10px] font-semibold cursor-pointer hover:bg-surface-50 flex items-center gap-1">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-3 py-1.5 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-[10px] font-semibold cursor-pointer transition-colors disabled:opacity-50 flex items-center gap-1">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  {editingShift ? 'Update Shift' : 'Create Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {shifts.length === 0 && !editingShift && (
        <div className="text-center py-8 text-surface-400 text-xs">
          <Clock className="w-8 h-8 mx-auto mb-2 text-surface-300" />
          <p>No shift templates yet. Create your first shift to get started.</p>
        </div>
      )}

      {shifts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {shifts.map(s => {
            const start = s.start_time.slice(0, 5);
            const end = s.end_time.slice(0, 5);
            const startH = parseInt(s.start_time.slice(0, 2));
            const endH = parseInt(s.end_time.slice(0, 2));
            let totalHours = endH >= startH ? endH - startH : (24 - startH) + endH;
            const breakH = (s.break_duration || 0) / 60;
            const workHours = totalHours - breakH;
            const isNight = startH >= 22 || startH < 6;
            const isMorning = startH >= 6 && startH < 12;
            return (
              <div key={s.id} className="bg-white rounded-xl border border-surface-200 p-4 hover:border-surface-300 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isNight ? 'bg-indigo-100 text-indigo-700' : isMorning ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-surface-900">{s.name}</h4>
                      <p className="text-[10px] text-surface-400">{start} — {end}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(s)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer transition-colors" title="Edit shift">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(s)} className="p-1.5 text-surface-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors" title="Delete shift">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-surface-500">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {workHours.toFixed(1)}h work</span>
                  {s.break_duration > 0 && <span className="flex items-center gap-1">Break: {s.break_duration}min</span>}
                </div>
                {s.description && <p className="text-[10px] text-surface-400 mt-2 line-clamp-2">{s.description}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
