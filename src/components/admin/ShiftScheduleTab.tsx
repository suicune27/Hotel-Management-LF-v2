import { useState, useEffect, useMemo } from 'react';
import { Calendar, RefreshCw, UserCheck, CheckCircle2, AlertCircle, Plus, ArrowRightLeft, User, Grid3X3, Clock, HelpCircle, ShieldCheck } from 'lucide-react';
import type { Profile } from '../../types';
import { supabase } from '../../lib/supabase';

interface Shift {
  id: string;
  day: string;
  timeLabel: string;
  assignedUserId: string;
  role: string;
  status: 'active' | 'swap_pending' | 'swapped';
}

interface SwapRequest {
  id: string;
  sourceShiftId: string;
  requestingUserId: string;
  targetUserId: string | null;
  notes: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

interface ShiftScheduleTabProps {
  employees: Profile[];
  currencySymbol: string;
  userProfile: Profile | null;
  logActivity: (action: string, details: string) => Promise<void>;
  showSuccess: (msg: string) => void;
  showError: (title: string, msg: string) => void;
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHIFT_TIMES = [
  "Morning (7 AM - 3 PM)",
  "Swing (3 PM - 11 PM)",
  "Night (11 PM - 7 AM)"
];

export default function ShiftScheduleTab({
  employees,
  currencySymbol,
  userProfile,
  logActivity,
  showSuccess,
  showError,
}: ShiftScheduleTabProps) {
  const staff = useMemo(() => employees.filter(e => e.role !== 'guest'), [employees]);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [selectedDayTab, setSelectedDayTab] = useState<string>('all');
  const [selectedShiftToSwap, setSelectedShiftToSwap] = useState<string>('');
  const [targetSwapUser, setTargetSwapUser] = useState<string>('');
  const [swapNotes, setSwapNotes] = useState<string>('');
  const [isPostingSwap, setIsPostingSwap] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [overrideUser, setOverrideUser] = useState<string>('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: shiftData, error: shiftError } = await supabase.from('shift_schedules').select('*');
        if (shiftError) throw shiftError;

        let loadedShifts: Shift[] = [];
        if (shiftData && shiftData.length > 0) {
          loadedShifts = shiftData.map((s: any) => ({
            id: s.id,
            day: s.day,
            timeLabel: s.time_label,
            assignedUserId: s.assigned_user_id,
            role: s.role,
            status: s.status,
          }));
        } else {
          const seededShifts: Shift[] = [];
          let idCounter = 1;
          DAYS_OF_WEEK.forEach(day => {
            seededShifts.push({
              id: `sh-${idCounter++}`,
              day,
              timeLabel: "Morning (7 AM - 3 PM)",
              assignedUserId: staff[0]?.id || 'fallback-1',
              role: "Housekeeping",
              status: 'active'
            });
            seededShifts.push({
              id: `sh-${idCounter++}`,
              day,
              timeLabel: "Swing (3 PM - 11 PM)",
              assignedUserId: staff[1]?.id || staff[0]?.id || 'fallback-2',
              role: "Front Desk",
              status: 'active'
            });
            seededShifts.push({
              id: `sh-${idCounter++}`,
              day,
              timeLabel: "Night (11 PM - 7 AM)",
              assignedUserId: staff[2]?.id || staff[0]?.id || 'fallback-3',
              role: "Maintenance",
              status: 'active'
            });
          });
          const seedRecords = seededShifts.map(s => ({
            id: s.id,
            day: s.day,
            time_label: s.timeLabel,
            assigned_user_id: s.assignedUserId,
            role: s.role,
            status: s.status,
          }));
          const { error: insertError } = await supabase.from('shift_schedules').insert(seedRecords);
          if (insertError) throw insertError;
          loadedShifts = seededShifts;
        }

        const { data: swapData, error: swapError } = await supabase.from('shift_swaps').select('*');
        if (swapError) throw swapError;

        const loadedSwaps: SwapRequest[] = (swapData || []).map((s: any) => ({
          id: s.id,
          sourceShiftId: s.source_shift_id,
          requestingUserId: s.requesting_user_id,
          targetUserId: s.target_user_id,
          notes: s.notes,
          status: s.status,
          created_at: s.created_at,
        }));

        setShifts(loadedShifts);
        setSwaps(loadedSwaps);
      } catch (err) {
        // console.error('Failed to load shift data:', err);
        showError('Data Load Error', 'Could not load shift schedules from database.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const syncShifts = async (newShifts: Shift[]) => {
    setShifts(newShifts);
    try {
      const records = newShifts.map(s => ({
        id: s.id,
        day: s.day,
        time_label: s.timeLabel,
        assigned_user_id: s.assignedUserId,
        role: s.role,
        status: s.status,
      }));
      const { error } = await supabase.from('shift_schedules').upsert(records, { onConflict: 'id' });
      if (error) throw error;
    } catch (err) {
      // console.error('Failed to sync shifts:', err);
      showError('Sync Error', 'Could not save shift changes to database.');
    }
  };

  const syncSwaps = async (newSwaps: SwapRequest[]) => {
    setSwaps(newSwaps);
    try {
      const records = newSwaps.map(s => ({
        id: s.id,
        source_shift_id: s.sourceShiftId,
        requesting_user_id: s.requestingUserId,
        target_user_id: s.targetUserId,
        notes: s.notes,
        status: s.status,
        created_at: s.created_at,
      }));
      const { error } = await supabase.from('shift_swaps').upsert(records, { onConflict: 'id' });
      if (error) throw error;
    } catch (err) {
      // console.error('Failed to sync swaps:', err);
      showError('Sync Error', 'Could not save swap changes to database.');
    }
  };

  const getUserName = (id: string) => {
    if (id === 'fallback-1') return 'Maria Corazon (Housekeeper)';
    if (id === 'fallback-2') return 'Arnel Santos (Front Desk)';
    if (id === 'fallback-3') return 'Ramon Valdes (Maintenance)';
    const found = staff.find(e => e.id === id);
    return found ? found.full_name : 'Unassigned';
  };

  const getShiftLabelDetails = (shiftId: string) => {
    const s = shifts.find(item => item.id === shiftId);
    if (!s) return 'Unknown shift';
    return `${s.day} — ${s.timeLabel} (${s.role})`;
  };

  const handlePostSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShiftToSwap) {
      showError('Form Incomplete', 'Please select a scheduled shift to swap.');
      return;
    }

    const matchedShift = shifts.find(s => s.id === selectedShiftToSwap);
    if (!matchedShift) return;

    if (matchedShift.status === 'swap_pending') {
      showError('Already Listed', 'This shift is already listed on the swap board.');
      return;
    }

    const newRequest: SwapRequest = {
      id: `swap-${Date.now()}`,
      sourceShiftId: selectedShiftToSwap,
      requestingUserId: matchedShift.assignedUserId,
      targetUserId: targetSwapUser ? targetSwapUser : null,
      notes: swapNotes || 'Requesting coverage/swap',
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const updatedShifts = shifts.map(s => s.id === selectedShiftToSwap ? { ...s, status: 'swap_pending' as const } : s);
    await syncShifts(updatedShifts);
    await syncSwaps([newRequest, ...swaps]);

    setSelectedShiftToSwap('');
    setTargetSwapUser('');
    setSwapNotes('');
    setIsPostingSwap(false);

    await logActivity('Shift Swap Posted', `Shift swap request was published for ${getShiftLabelDetails(selectedShiftToSwap)}.`);
    showSuccess('Shift swap request published successfully!');
  };

  const handleAcceptSwap = async (request: SwapRequest, approvingEmployeeId: string) => {
    const shift = shifts.find(s => s.id === request.sourceShiftId);
    if (!shift) return;

    const approverShiftOnSameDay = shifts.find(s => s.day === shift.day && s.assignedUserId === approvingEmployeeId);

    const updatedShifts = shifts.map(s => {
      if (s.id === shift.id) {
        return { ...s, assignedUserId: approvingEmployeeId, status: 'swapped' as const };
      }
      if (approverShiftOnSameDay && s.id === approverShiftOnSameDay.id) {
        return { ...s, assignedUserId: request.requestingUserId, status: 'swapped' as const };
      }
      return s;
    });

    const updatedSwaps = swaps.map(req => req.id === request.id ? { ...req, status: 'accepted' as const } : req);
    await syncShifts(updatedShifts);
    await syncSwaps(updatedSwaps);

    await logActivity(
      'Shift Swap Approved', 
      `${getUserName(approvingEmployeeId)} accepted shift swap with ${getUserName(request.requestingUserId)} for ${shift.day} (${shift.role}).`
    );
    showSuccess('Shift swap accepted and roster has been updated!');
  };

  const handleDeclineSwap = async (requestId: string) => {
    const req = swaps.find(r => r.id === requestId);
    if (!req) return;

    const updatedSwaps = swaps.map(item => item.id === requestId ? { ...item, status: 'declined' as const } : item);
    const updatedShifts = shifts.map(s => s.id === req.sourceShiftId ? { ...s, status: 'active' as const } : s);
    await syncSwaps(updatedSwaps);
    await syncShifts(updatedShifts);

    showSuccess('Swap request declined.');
  };

  const handleOverrideSchedule = async () => {
    if (!editingShift || !overrideUser) return;

    const updatedShifts = shifts.map(s => s.id === editingShift.id ? { ...s, assignedUserId: overrideUser, status: 'active' as const } : s);
    await syncShifts(updatedShifts);

    await logActivity(
      'Schedule Override',
      `Admin changed ${editingShift.day} ${editingShift.timeLabel} shift assignment to ${getUserName(overrideUser)}.`
    );

    showSuccess('Roster modified successfully!');
    setEditingShift(null);
    setOverrideUser('');
  };

  const gridShifts = useMemo(() => {
    return shifts.filter(s => {
      const matchRole = selectedRoleFilter === 'all' || s.role.toLowerCase() === selectedRoleFilter.toLowerCase();
      const matchDay = selectedDayTab === 'all' || s.day.toLowerCase() === selectedDayTab.toLowerCase();
      return matchRole && matchDay;
    });
  }, [shifts, selectedRoleFilter, selectedDayTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 text-brand-600 animate-spin" />
          <p className="text-xs text-surface-500">Loading shift schedules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in font-sans">

      {/* HEADER CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-surface-100 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-surface-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand-600" />
            Dynamic Shift Schedules & Interactive Swap Board
          </h2>
          <p className="text-[10px] text-surface-500 mt-0.5">Manage weekly hospitality rosters and authorize shift trades in real-time.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <select 
            value={selectedRoleFilter} 
            onChange={(e) => setSelectedRoleFilter(e.target.value)} 
            className="px-2.5 py-1.5 border border-surface-200 rounded-lg bg-surface-0 font-semibold"
          >
            <option value="all">All Departments</option>
            <option value="housekeeping">Housekeeping</option>
            <option value="front desk">Front Desk</option>
            <option value="maintenance">Maintenance</option>
          </select>

          <button 
            onClick={() => setIsPostingSwap(true)}
            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Post Swap Request
          </button>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {["all", ...DAYS_OF_WEEK].map(day => (
          <button
            key={day}
            onClick={() => setSelectedDayTab(day)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize border transition-all cursor-pointer ${
              selectedDayTab === day 
                ? 'bg-indigo-600 border-indigo-600 text-white font-bold' 
                : 'bg-white border-surface-200 text-surface-600 hover:bg-surface-50'
            }`}
          >
            {day}
          </button>
        ))}
      </div>

      {/* ROSTER GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {gridShifts.map((shift) => {
          const isPending = shift.status === 'swap_pending';
          const isSwapped = shift.status === 'swapped';
          return (
            <div 
              key={shift.id} 
              className={`bg-white rounded-xl border p-3.5 flex flex-col justify-between gap-3 shadow-xs relative transition-all ${
                isPending ? 'border-amber-300 bg-amber-50/20' : isSwapped ? 'border-emerald-300 bg-emerald-50/10' : 'border-surface-150'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-extrabold uppercase Tracking-wider text-surface-400 bg-surface-100 px-2 py-0.5 rounded">
                  {shift.role}
                </span>
                {isPending && (
                  <span className="text-[8px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex items-center gap-0.5 animate-pulse">
                    <Grid3X3 className="w-2.5 h-2.5" /> Swap Pending
                  </span>
                )}
                {isSwapped && (
                  <span className="text-[8px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Swapped
                  </span>
                )}
              </div>

              <div>
                <p className="text-xs font-black text-surface-800">{shift.day}</p>
                <div className="flex items-center gap-1 text-[10px] text-surface-500 mt-1">
                  <Clock className="w-3 h-3 text-surface-400" />
                  <span>{shift.timeLabel}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-surface-50">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-600 font-bold">
                    {getUserName(shift.assignedUserId).charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-surface-800 truncate">{getUserName(shift.assignedUserId)}</p>
                    <p className="text-[9px] text-surface-400">Roster Assignment</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditingShift(shift);
                    setOverrideUser(shift.assignedUserId);
                  }}
                  className="px-2 py-1 text-[9px] font-bold text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded cursor-pointer"
                >
                  Admin Reassign
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* SWAP BOARD VIEW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* SWAP LIST BOARD */}
        <div className="bg-white rounded-2xl border border-surface-100 p-4 shadow-sm lg:col-span-2 space-y-4">
          <div>
            <h3 className="text-sm font-black text-surface-800 flex items-center gap-1.5">
              <ArrowRightLeft className="w-4 h-4 text-brand-600" />
              Active Shift Swap Requests
            </h3>
            <p className="text-[10px] text-surface-400 mt-0.5">Employees posting their shifts for swapping or coverage. Accept to update rosters.</p>
          </div>

          <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
            {swaps.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-surface-200 rounded-xl">
                <p className="text-xs text-surface-400">No shift swap requests listed on the board currently.</p>
              </div>
            ) : (
              swaps.map((item) => {
                const shift = shifts.find(s => s.id === item.sourceShiftId);
                const requestingMe = userProfile?.id === item.requestingUserId;
                const isResolved = item.status !== 'pending';

                return (
                  <div 
                    key={item.id} 
                    className={`border rounded-xl p-3.5 space-y-3 ${
                      item.status === 'accepted' 
                        ? 'border-emerald-250 bg-emerald-50/10' 
                        : item.status === 'declined' 
                        ? 'border-surface-200 bg-surface-50/50 opacity-70' 
                        : 'border-surface-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-bold">
                          {getUserName(item.requestingUserId).charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-surface-800 truncate">
                            {getUserName(item.requestingUserId)}
                          </p>
                          <p className="text-[10px] text-surface-400 font-mono">Posted: {new Date(item.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                        item.status === 'accepted' ? 'bg-emerald-100 text-emerald-850' : item.status === 'declined' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.status}
                      </span>
                    </div>

                    <div className="bg-surface-50 p-2.5 rounded-lg text-xs space-y-1">
                      <div className="flex justify-between font-semibold text-surface-700 text-[11px]">
                        <span>Shift To Swap:</span>
                        <span className="text-indigo-650">{getShiftLabelDetails(item.sourceShiftId)}</span>
                      </div>
                      {item.notes && (
                        <p className="text-[11px] text-surface-500 pt-1 leading-snug"><span className="font-bold text-surface-700">Remarks:</span> "{item.notes}"</p>
                      )}
                    </div>

                    {!isResolved && (
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-surface-50">
                        <div className="flex items-center gap-1.5 text-[10px] text-surface-400">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {item.targetUserId ? `Direct Swap Offer` : `Public Cover Board`}
                        </div>

                        <div className="flex gap-1.5">
                          {userProfile && !requestingMe && (
                            <button
                              onClick={() => handleAcceptSwap(item, userProfile.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded cursor-pointer transition-colors shadow-xs"
                            >
                              Accept trade
                            </button>
                          )}
                          <button
                            onClick={() => handleDeclineSwap(item.id)}
                            className="px-2.5 py-1 bg-surface-100 hover:bg-rose-50 hover:text-rose-600 text-surface-600 text-[10px] font-bold rounded cursor-pointer transition-colors border border-surface-200"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* SWAP POST FORM */}
        <div className="bg-white rounded-2xl border border-surface-100 p-4 shadow-sm h-fit space-y-4">
          <div>
            <h3 className="text-sm font-black text-surface-800 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-brand-600" />
              Post Roster Shift Swaps
            </h3>
            <p className="text-[10px] text-surface-400 mt-0.5">List your personal shift slot or select standard coverages to submit a trade request.</p>
          </div>

          <form onSubmit={handlePostSwap} className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wide mb-1">1. Select Your Scheduled Shift *</label>
              <select 
                value={selectedShiftToSwap} 
                onChange={(e) => setSelectedShiftToSwap(e.target.value)}
                className="w-full text-xs border border-surface-200 rounded-lg p-2 bg-white"
                required
              >
                <option value="">-- Choose Your Shift Slot --</option>
                {shifts.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.day} : {s.timeLabel} ({s.role} - {getUserName(s.assignedUserId)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wide mb-1">2. Target Employee Trade <span className="text-surface-300 font-normal">(optional)</span></label>
              <select 
                value={targetSwapUser} 
                onChange={(e) => setTargetSwapUser(e.target.value)}
                className="w-full text-xs border border-surface-200 rounded-lg p-2 bg-white"
              >
                <option value="">-- Public Board (Anyone Can Cover) --</option>
                {staff.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wide mb-1">3. Reason & Swap Details</label>
              <textarea 
                value={swapNotes} 
                onChange={(e) => setSwapNotes(e.target.value)} 
                placeholder="Briefly state why you need a shift trade (e.g., family commitment, travel, trade with Arnel)"
                className="w-full text-xs border border-surface-200 rounded-lg p-2 h-20"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-lg cursor-pointer transition-colors shadow-xs active:scale-95"
            >
              Publish Trade Offer
            </button>
          </form>
        </div>
      </div>

      {/* QUICK ASSIGNMENT DIALOG OVERLAY */}
      {editingShift && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg border border-surface-150 p-4 w-full max-w-sm space-y-4 animate-scale-in">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-surface-400">Roster Assignment override</h4>
              <p className="text-sm font-bold text-surface-900 mt-1">{editingShift.day} — {editingShift.timeLabel}</p>
              <p className="text-[10px] text-surface-500">Current assigned: {getUserName(editingShift.assignedUserId)}</p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-surface-500 uppercase">Select Replacement Staff Member</label>
              <select 
                value={overrideUser} 
                onChange={(e) => setOverrideUser(e.target.value)}
                className="w-full text-xs border border-surface-200 rounded-lg p-2 bg-white"
              >
                {staff.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 text-xs font-bold pt-1">
              <button 
                onClick={() => setEditingShift(null)} 
                className="px-3 py-1.5 bg-surface-100 hover:bg-surface-200 text-surface-600 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleOverrideSchedule} 
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg cursor-pointer"
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
