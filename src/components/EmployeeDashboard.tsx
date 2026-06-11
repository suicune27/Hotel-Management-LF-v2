import { motion } from 'motion/react';
import React, { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Booking, Task, Profile, TimeEntry, EmployeePayroll, PayrollPeriod, PayrollEntry } from '../types';
import { AlertDialog } from './AlertDialog';
import BrandBar from './BrandBar';
import { useAppSettings } from '../lib/useAppSettings';
import {
  CheckCircle, Calendar, RefreshCw, User, Mail, Award, CheckSquare,
  Play, Loader2, Building, ChevronRight, Check, Clock, LogOut,
  TrendingUp, DollarSign, History, Timer, X, Eye, Printer, FileText, Bell,
  Sparkles, UtensilsCrossed, MessageSquareText, Send, ChevronDown,
  AlertTriangle, Download, Camera
} from 'lucide-react';

interface EmployeeDashboardProps {
  onNavigate: (screen: 'login' | 'admin-dashboard' | 'employee-dashboard') => void;
  userSession: Session | null;
  userProfile: Profile | null;
  onLogout: () => void;
  onProfileUpdate: (updatedProfile: Profile) => void;
}

type StaffTab = 'duties' | 'tasks' | 'time' | 'payroll' | 'profile' | 'cleaning' | 'kitchen' | 'leave' | 'announcements';

// --- HELPERS FOR HOLIDAYS AND ATTENDANCE ---
export function detectHoliday(date: Date, holidaysList: any[]) {
  if (!holidaysList || !Array.isArray(holidaysList)) return null;
  const yyyymmdd = date.toISOString().slice(0, 10);
  const mmdd = yyyymmdd.slice(5, 10); // e.g. "06-12"
  const found = holidaysList.find(h => h.date === yyyymmdd || h.date.slice(5, 10) === mmdd);
  return found || null;
}

export function calculateAttendanceStatus(clockInStr: string, clockOutStr: string | null, shiftStartStr: string = '09:00') {
  const clockIn = new Date(clockInStr);
  const [startHour, startMinute] = shiftStartStr.split(':').map(Number);
  const clockInHour = clockIn.getHours();
  const clockInMinute = clockIn.getMinutes();

  let isLate = false;
  if (clockInHour > startHour || (clockInHour === startHour && clockInMinute > startMinute)) {
    isLate = true;
  }

  if (!clockOutStr) {
    return isLate ? 'Late' : 'Present';
  }

  const clockOut = new Date(clockOutStr);
  const durationHours = (clockOut.getTime() - clockIn.getTime()) / 3600000;

  if (durationHours > 0 && durationHours < 5) {
    return 'Half-Day';
  }
  return isLate ? 'Late' : 'Present';
}

export function isDateInPreset(dateStr: string, preset: 'all' | 'today' | 'week' | 'month' | 'custom', startDateStr?: string, endDateStr?: string) {
  if (preset === 'all') return true;

  const date = new Date(dateStr);
  const now = new Date();

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (preset === 'today') {
    return date >= startOfDay && date <= endOfDay;
  }

  if (preset === 'week') {
    const currentDay = now.getDay();
    const firstDayOfWeek = new Date(startOfDay);
    firstDayOfWeek.setDate(now.getDate() - currentDay);

    const lastDayOfWeek = new Date(endOfDay);
    lastDayOfWeek.setDate(now.getDate() + (6 - currentDay));

    return date >= firstDayOfWeek && date <= lastDayOfWeek;
  }

  if (preset === 'month') {
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return date >= firstDayOfMonth && date <= lastDayOfMonth;
  }

  if (preset === 'custom' && startDateStr && endDateStr) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    return date >= start && date <= end;
  }

  return true;
}

export default function EmployeeDashboard({ onNavigate, userSession, userProfile, onLogout, onProfileUpdate }: EmployeeDashboardProps) {
  const { settings } = useAppSettings();
  const [activeTab, setActiveTab] = useState<StaffTab>('duties');
  const [loading, setLoading] = useState(true);

  const [assignedBookings, setAssignedBookings] = useState<Booking[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskNotification, setNewTaskNotification] = useState<{ task: Task; visible: boolean } | null>(null);
  const [alertState, setAlertState] = useState<{ title: string; message: string } | null>(null);
  const prevTaskCount = useRef(0);

  // Time tracking
  const [activeTimeEntry, setActiveTimeEntry] = useState<TimeEntry | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [clockLoading, setClockLoading] = useState(false);
  const [clockElapsed, setClockElapsed] = useState('');
  const [clockOutNotes, setClockOutNotes] = useState('');
  const [mealBreakTaken, setMealBreakTaken] = useState(true);
  const [mealBreakDuration, setMealBreakDuration] = useState(60);

  // New Attendance states
  const [holidays, setHolidays] = useState<any[]>([]);
  const [timeFilterPreset, setTimeFilterPreset] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [timeFilterStartDate, setTimeFilterStartDate] = useState('');
  const [timeFilterEndDate, setTimeFilterEndDate] = useState('');
  const [shiftStartTime, setShiftStartTime] = useState('09:00');

  // Payroll
  const [payrollInfo, setPayrollInfo] = useState<EmployeePayroll | null>(null);
  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([]);
  const [viewPayslip, setViewPayslip] = useState<PayrollEntry | null>(null);

  // Profile
  const [newName, setNewName] = useState(userProfile?.full_name || '');
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Leave requests
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [leaveType, setLeaveType] = useState<'sick' | 'vacation' | 'emergency' | 'other'>('sick');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);

  // Kitchen orders (cook role)
  const [kitchenOrders, setKitchenOrders] = useState<any[]>([]);

  // Cleaning tasks (cleaner role)
  const [cleaningTasks, setCleaningTasks] = useState<any[]>([]);

  // Task completion notes
  const [taskNotesMap, setTaskNotesMap] = useState<Record<string, string>>({});
  const [taskCompletingId, setTaskCompletingId] = useState<string | null>(null);

  // Announcements
  const [announcements, setAnnouncements] = useState<any[]>([]);

  // Time tracking elapsed timer
  useEffect(() => {
    if (!activeTimeEntry?.clock_in) {
      setClockElapsed('');
      return;
    }
    const update = () => {
      const diff = Date.now() - new Date(activeTimeEntry.clock_in).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setClockElapsed(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeTimeEntry?.clock_in]);

  const loadStaffDuties = async () => {
    setLoading(true);
    try {
      const staffId = userProfile?.id;
      if (!staffId) return;

      // Load holidays and shift settings
      const [bookingsRes, tasksRes, timeRes, payrollRes, payEntriesRes, holidaysRes, shiftRes] = await Promise.all([
        supabase.from('bookings').select('*, rooms(*), customers(*)').eq('assigned_employee_id', staffId).order('check_in_date', { ascending: true }),
        supabase.from('tasks').select('*, bookings(*, rooms(*))').eq('assigned_employee_id', staffId).order('status', { ascending: true }),
        supabase.from('time_entries').select('*, users!time_entries_user_id_fkey(*)').eq('user_id', staffId).order('clock_in', { ascending: false }).limit(100),
        supabase.from('employee_payroll').select('*, users(*)').eq('user_id', staffId).maybeSingle(),
        supabase.from('payroll_entries').select('*, payroll_periods(*), users(*)').eq('user_id', staffId).order('created_at', { ascending: false }).limit(20),
        supabase.from('hotel_settings').select('value').eq('key', 'holidays_list').maybeSingle(),
        supabase.from('hotel_settings').select('value').eq('key', 'shift_settings').maybeSingle()
      ]);

      if (bookingsRes.data) setAssignedBookings(bookingsRes.data);
      if (tasksRes.data) {
        setTasks(tasksRes.data);
        prevTaskCount.current = tasksRes.data.length;
      }

      if (timeRes.data) {
        setTimeEntries(timeRes.data);
        const active = timeRes.data.find(e => !e.clock_out);
        setActiveTimeEntry(active || null);
      }
      if (payrollRes.data) setPayrollInfo(payrollRes.data);
      if (payEntriesRes.data) setPayrollEntries(payEntriesRes.data);

      if (holidaysRes.data && Array.isArray(holidaysRes.data.value)) {
        setHolidays(holidaysRes.data.value);
      } else {
        // Seed fallback standard Philippine holidays
        const initialHolidays = [
          { date: '2026-01-01', name: "New Year's Day", type: 'regular' },
          { date: '2026-04-09', name: 'Araw ng Kagitingan', type: 'regular' },
          { date: '2026-05-01', name: 'Labor Day', type: 'regular' },
          { date: '2026-06-12', name: 'Independence Day', type: 'regular' },
          { date: '2026-08-31', name: 'National Heroes Day', type: 'regular' },
          { date: '2026-11-01', name: 'All Saints Day', type: 'special' },
          { date: '2026-11-30', name: 'Bonifacio Day', type: 'regular' },
          { date: '2026-12-25', name: 'Christmas Day', type: 'regular' },
          { date: '2026-12-30', name: 'Rizal Day', type: 'regular' },
        ];
        setHolidays(initialHolidays);
      }

      if (shiftRes.data && (shiftRes.data.value as any)?.startTime) {
        setShiftStartTime((shiftRes.data.value as any).startTime);
      } else {
        setShiftStartTime('09:00');
      }

      // Role-specific data loading
      const role = userProfile?.role;
      if (role === 'cleaner' || role === 'staff') {
        const { data: cTasks } = await supabase
          .from('tasks')
          .select('*, bookings(*, rooms(*))')
          .eq('assigned_employee_id', staffId)
          .in('status', ['pending', 'in-progress'])
          .order('created_at', { ascending: true });
        setCleaningTasks(cTasks || []);
      }
      if (role === 'cook' || role === 'waiter') {
        const { data: orders } = await supabase
          .from('guest_orders')
          .select('*, inventory_items(*), bookings(*, rooms(*))')
          .in('status', ['pending', 'preparing'])
          .order('created_at', { ascending: true });
        setKitchenOrders(orders || []);
      }

      // Leave requests
      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('*, leave_types(*)')
        .eq('user_id', staffId)
        .order('created_at', { ascending: false })
        .limit(30);
      setLeaveRequests(leaves || []);

      // Announcements: read from activity_logs where action = 'Announcement'
      const { data: ann } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('action', 'Announcement')
        .order('created_at', { ascending: false })
        .limit(20);
      setAnnouncements(ann || []);
    } catch (err) {
      // console.error("Error retrieving colleague workspace:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaffDuties();
  }, [userProfile?.id]);

  // Real-time subscription
  useEffect(() => {
    const staffId = userProfile?.id;
    if (!staffId) return;

    const staffChannel = supabase
      .channel('staff-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `assigned_employee_id=eq.${staffId}` }, async () => {
        const { data } = await supabase.from('bookings').select('*, rooms(*), customers(*)').eq('assigned_employee_id', staffId).order('check_in_date', { ascending: true });
        if (data) setAssignedBookings(data);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assigned_employee_id=eq.${staffId}` }, async (payload) => {
        const { data } = await supabase.from('tasks').select('*, bookings(*, rooms(*))').eq('assigned_employee_id', staffId).order('status', { ascending: true });
        if (data) {
          const oldCount = prevTaskCount.current;
          setTasks(data);
          if (data.length > oldCount) {
            const newTask = data.find(t => t.id === (payload.new as any)?.id) || data[0];
            if (newTask) setNewTaskNotification({ task: newTask, visible: true });
          }
          prevTaskCount.current = data.length;
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(staffChannel); };
  }, [userProfile?.id]);

  // Realtime kitchen orders for cook/waiter roles
  useEffect(() => {
    const role = userProfile?.role;
    if (role !== 'cook' && role !== 'waiter') return;

    const kitchenChannel = supabase
      .channel('staff-kitchen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guest_orders', filter: 'status=in.(pending,preparing)' }, async () => {
        const staffId = userProfile?.id;
        if (!staffId) return;
        const { data: orders } = await supabase
          .from('guest_orders')
          .select('*, inventory_items(*), bookings(*, rooms(*))')
          .in('status', ['pending', 'preparing'])
          .order('created_at', { ascending: true });
        if (orders) setKitchenOrders(orders);
      })
      .subscribe();

    return () => { supabase.removeChannel(kitchenChannel); };
  }, [userProfile?.role]);

  const handleClockInOut = async () => {
    const staffId = userProfile?.id;
    if (!staffId) return;
    setClockLoading(true);

    try {
      if (activeTimeEntry) {
        const clockOut = new Date().toISOString();
        const clockInVal = new Date(activeTimeEntry.clock_in).getTime();
        const totalHours = Math.max(0, (Date.now() - clockInVal) / 3600000);

        // recalculate final metadata
        const hol = detectHoliday(new Date(activeTimeEntry.clock_in), holidays);
        const finalStatus = calculateAttendanceStatus(activeTimeEntry.clock_in, clockOut, shiftStartTime);
        const updatedMeta = {
          is_attendance_meta: true,
          status: finalStatus,
          is_holiday: !!hol,
          holiday_name: hol ? hol.name : null,
          remarks: clockOutNotes.trim() || 'Completed shift',
          meal_break_taken: mealBreakTaken,
          meal_break_duration: mealBreakTaken ? mealBreakDuration : 0
        };

        const netHours = Math.max(0, totalHours - (mealBreakTaken ? mealBreakDuration / 60 : 0));

        await supabase.from('time_entries').update({
          clock_out: clockOut,
          total_hours: Math.round(netHours * 100) / 100,
          is_overtime: netHours > 8,
          notes: JSON.stringify(updatedMeta)
        }).eq('id', activeTimeEntry.id);

        await supabase.from('activity_logs').insert({
          user_id: staffId,
          user_name: userProfile?.full_name || 'Staff',
          action: 'Clock Out',
          details: `Clocked out after ${netHours.toFixed(2)} net hours (Break: ${mealBreakTaken ? mealBreakDuration + 'm' : 'none'})`
        });

        setActiveTimeEntry(null);
        setClockElapsed('');
        setClockOutNotes('');
      } else {
        // Prevent multiple active checkins
        const { data: recentChecks } = await supabase
          .from('time_entries')
          .select('*')
          .eq('user_id', staffId)
          .order('clock_in', { ascending: false })
          .limit(10);

        const activeChecks = (recentChecks || []).filter(e => !e.clock_out);

        if (activeChecks && activeChecks.length > 0) {
          setAlertState({
            title: 'Multiple Active Shifts Forbidden',
            message: 'You have an active shift that was not clocked out. Please clock out first or contact administration to adjust your clock logs.'
          });
          setActiveTimeEntry(activeChecks[0] as TimeEntry);
          setClockLoading(false);
          return;
        }

        // Guard against accidental double-tap after clock out causing near-duplicate shifts.
        const latestCompleted = (recentChecks || []).find(e => !!e.clock_out);
        if (latestCompleted?.clock_out) {
          const minsSinceClockOut = (Date.now() - new Date(latestCompleted.clock_out).getTime()) / 60000;
          if (minsSinceClockOut >= 0 && minsSinceClockOut < 2) {
            setAlertState({
              title: 'Recent Clock-Out Detected',
              message: 'You clocked out a moment ago. Please wait at least 2 minutes before starting a new shift to avoid duplicate records.'
            });
            setClockLoading(false);
            return;
          }
        }

        const now = new Date();
        const hol = detectHoliday(now, holidays);
        const status = calculateAttendanceStatus(now.toISOString(), null, shiftStartTime);
        
        const initialMeta = {
          is_attendance_meta: true,
          status: status,
          is_holiday: !!hol,
          holiday_name: hol ? hol.name : null,
          remarks: 'Present shift record auto-logged'
        };

        const { data, error } = await supabase.from('time_entries').insert({
          user_id: staffId,
          clock_in: now.toISOString(),
          notes: JSON.stringify(initialMeta)
        }).select().single();

        if (error) {
          const code = (error as any)?.code;
          if (code === '23505') {
            setAlertState({
              title: 'Active Shift Already Exists',
              message: 'An active shift already exists for your account. Refresh and clock out that active shift first.'
            });
            return;
          }
          throw error;
        }

        if (data) {
          setActiveTimeEntry(data as TimeEntry);
          await supabase.from('activity_logs').insert({
            user_id: staffId,
            user_name: userProfile?.full_name || 'Staff',
            action: 'Clock In',
            details: `Clocked in for shift on ${now.toLocaleDateString()}`
          });
        }
      }

      const { data } = await supabase.from('time_entries').select('*, users!time_entries_user_id_fkey(*)').eq('user_id', staffId).order('clock_in', { ascending: false }).limit(100);
      if (data) setTimeEntries(data);
    } catch (err: any) {
      setAlertState({ title: 'Clock Error', message: err.message || 'Failed to clock in/out' });
    } finally {
      setClockLoading(false);
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, roomId: string, newStatus: 'checked-in' | 'completed' | 'cancelled') => {
    try {
      await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId);

      let roomStatusTarget = 'available';
      if (newStatus === 'checked-in') roomStatusTarget = 'booked';
      else if (newStatus === 'completed') roomStatusTarget = 'cleaning';
      await supabase.from('rooms').update({ status: roomStatusTarget }).eq('id', roomId);

      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id,
        user_name: userProfile?.full_name || 'Staff',
        action: 'Duty Status Updated',
        details: `Booking ${bookingId.substring(0, 8)}... toggled to ${newStatus}`
      });
      loadStaffDuties();
    } catch (err: any) {
      setAlertState({ title: 'Status Update Failed', message: err.message || 'An unexpected error occurred.' });
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: 'in-progress' | 'completed') => {
    try {
      await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id,
        user_name: userProfile?.full_name || 'Staff',
        action: 'Task Adjusted',
        details: `Task ticket ${taskId.substring(0, 8)}... set to ${newStatus}`
      });
      loadStaffDuties();
    } catch (err: any) {
      setAlertState({ title: 'Task Update Failed', message: err.message || 'An unexpected error occurred.' });
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingProfile(true);
    setProfileMsg('');
    try {
      await supabase.from('users').update({ full_name: newName.trim() }).eq('id', userProfile?.id);
      if (userProfile) onProfileUpdate({ ...userProfile, full_name: newName.trim() });
      setProfileMsg("Display name saved successfully to active employee rosters!");
    } catch (err: any) {
      setProfileMsg("Error saving updates: " + err.message);
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleCompleteTaskWithNotes = async (taskId: string) => {
    const notes = taskNotesMap[taskId] || '';
    try {
      await supabase.from('tasks').update({ status: 'completed', description: notes || undefined }).eq('id', taskId);
      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id || '',
        user_name: userProfile?.full_name || 'Staff',
        action: 'Task Completed',
        details: `Task ${taskId.slice(0, 8)} completed${notes ? `: ${notes.slice(0, 80)}` : ''}`
      });
      const task = cleaningTasks.find(t => t.id === taskId);
      const roomId = task?.bookings?.rooms?.id;
      if (roomId) {
        await supabase.from('rooms').update({ status: 'available' }).eq('id', roomId);
      }
      setTaskCompletingId(null);
      setTaskNotesMap(prev => { const n = { ...prev }; delete n[taskId]; return n; });
      loadStaffDuties();
    } catch (err: any) {
      setAlertState({ title: 'Task Update Failed', message: err.message });
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveStartDate || !leaveEndDate) return;
    setLeaveSubmitting(true);
    try {
      const start = new Date(leaveStartDate);
      const end = new Date(leaveEndDate);
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
      // Find or create a leave type
      const { data: types } = await supabase.from('leave_types').select('id').eq('code', leaveType).maybeSingle();
      let typeId = (types as any)?.id;
      if (!typeId) {
        const { data: newType } = await supabase.from('leave_types').insert({ code: leaveType, name: leaveType.charAt(0).toUpperCase() + leaveType.slice(1), is_paid: leaveType !== 'other' }).select('id').single();
        typeId = (newType as any)?.id;
      }
      await supabase.from('leave_requests').insert({
        user_id: userProfile?.id,
        leave_type_id: typeId,
        start_date: leaveStartDate,
        end_date: leaveEndDate,
        days,
        reason: leaveReason.trim(),
        status: 'pending',
      });
      setLeaveReason('');
      setLeaveStartDate('');
      setLeaveEndDate('');
      await loadStaffDuties();
      setAlertState({ title: 'Leave Filed', message: `Your ${leaveType} leave request for ${days} day(s) has been submitted for approval.` });
    } catch (err: any) {
      setAlertState({ title: 'Leave Request Failed', message: err.message });
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const role = userProfile?.role || 'staff';
  const tabs: { id: StaffTab; label: string; icon: any }[] = [
    ...(role === 'cleaner' ? [{ id: 'cleaning' as StaffTab, label: 'Cleaning Queue', icon: Sparkles }] : []),
    ...(role === 'cook' || role === 'waiter' ? [{ id: 'kitchen' as StaffTab, label: 'Kitchen Orders', icon: UtensilsCrossed }] : []),
    ...(role !== 'cleaner' && role !== 'cook' && role !== 'waiter' ? [{ id: 'duties' as StaffTab, label: 'Guest Duties', icon: Calendar }] : []),
    { id: 'tasks' as StaffTab, label: 'Tasks', icon: CheckSquare },
    { id: 'time' as StaffTab, label: 'Time Tracking', icon: Clock },
    { id: 'payroll' as StaffTab, label: 'Payroll', icon: DollarSign },
    { id: 'leave' as StaffTab, label: 'Leave', icon: Calendar },
    { id: 'announcements' as StaffTab, label: 'Notices', icon: Bell },
    { id: 'profile' as StaffTab, label: 'Profile', icon: User },
  ];

  const liveGrossHours = activeTimeEntry ? Math.max(0, (Date.now() - new Date(activeTimeEntry.clock_in).getTime()) / 3600000) : 0;
  const liveNetHours = activeTimeEntry ? Math.max(0, liveGrossHours - (mealBreakTaken ? mealBreakDuration / 60 : 0)) : 0;
  const isOvertimeActive = liveNetHours > 8;
  const overtimeLiveAmount = isOvertimeActive ? liveNetHours - 8 : 0;

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="min-h-screen bg-surface-50 text-surface-800 font-sans tracking-tight flex flex-col">
      <BrandBar
        settings={settings}
        userFullName={userProfile?.full_name || 'Staff'}
        userRole={userProfile?.role || 'staff'}
        onLogout={onLogout}
        onClockInOut={handleClockInOut}
        clockedIn={!!activeTimeEntry}
        extraActions={
          activeTimeEntry ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
              <Timer className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-mono font-bold text-emerald-700 tabular-nums">{clockElapsed}</span>
            </div>
          ) : null
        }
      />

      <div className="flex-1">
        {/* Tabs */}
        <div className="bg-white border-b border-surface-150 shadow-xs select-none">
          <div className="max-w-7xl mx-auto px-4 lg:px-6 flex gap-1 sm:gap-2 text-xs font-semibold py-2.5 overflow-x-auto">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl cursor-pointer transition-colors whitespace-nowrap outline-none ${
                    isActive
                      ? 'text-white font-bold'
                      : 'text-surface-500 hover:text-surface-850 hover:bg-surface-50'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeStaffTab"
                      className="absolute inset-0 bg-surface-900 rounded-xl shadow-md"
                      transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                      style={{ zIndex: 0 }}
                    />
                  )}
                  <TabIcon className="w-3.5 h-3.5 relative z-10" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6">
          {loading ? (
            <div className="text-center py-20 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
              <p className="text-xs text-surface-500 font-mono">Synchronizing workspace...</p>
            </div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* DUTIES TAB */}
              {activeTab === 'duties' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-surface-900 tracking-tight">My Guest Assignments</h2>
                    <p className="text-xs text-surface-400 mt-0.5">Assigned reservations. Perform check-ins or prompt suite transitions.</p>
                  </div>
                  {assignedBookings.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-surface-200 p-12 text-center max-w-sm mx-auto">
                      <Calendar className="w-10 h-10 text-surface-300 mx-auto mb-4" />
                      <h3 className="text-base font-semibold text-surface-800">No bookings scheduled</h3>
                      <p className="text-xs text-surface-400 mt-1">An administrator will delegate reservations to your profile.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden text-xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-surface-50 border-b border-surface-200 text-[10px] text-surface-400 font-bold uppercase tracking-wider">
                              <th className="p-4">Room</th>
                              <th className="p-4">Guest</th>
                              <th className="p-4">Dates</th>
                              <th className="p-4">Status</th>
                              <th className="p-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-200 text-surface-700">
                            {assignedBookings.map((booking) => (
                              <tr key={booking.id} className="hover:bg-surface-50:bg-surface-800/50">
                                <td className="p-4 font-semibold text-surface-900">Suite {booking.rooms?.room_number}
                                  <div className="text-[10px] text-surface-400 font-normal">{booking.rooms?.type}</div>
                                </td>
                                <td className="p-4">
                                  <div className="font-semibold">{booking.customers?.full_name}</div>
                                  <div className="text-[10px] text-surface-400">{booking.customers?.phone}</div>
                                </td>
                                <td className="p-4 font-mono text-surface-800">
                                  <div>{booking.check_in_date} <span className="text-[10px] font-sans font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">{booking.check_in_time}</span></div>
                                  <div className="text-surface-400">→</div>
                                  <div>{booking.check_out_date} <span className="text-[10px] font-sans font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">{booking.check_out_time}</span></div>
                                </td>
                                <td className="p-4">
                                  <span className={`px-2 py-0.5 font-bold uppercase text-[9px] rounded-full ${
                                    booking.status === 'checked-in' ? 'bg-sky-50 text-sky-700'
                                    : booking.status === 'completed' ? 'bg-surface-100 text-surface-500'
                                    : 'bg-blue-50 text-blue-700'
                                  }`}>{booking.status}</span>
                                </td>
                                <td className="p-4 text-right space-x-1.5">
                                  {booking.status === 'pending' && (
                                    <button onClick={() => handleUpdateBookingStatus(booking.id, booking.room_id, 'checked-in')}
                                      className="px-3 py-1.5 bg-surface-900 hover:bg-surface-800:bg-brand-700 text-white font-medium rounded-lg text-[10px] cursor-pointer">Check In</button>
                                  )}
                                  {booking.status === 'checked-in' && (
                                    <button onClick={() => handleUpdateBookingStatus(booking.id, booking.room_id, 'completed')}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-[10px] cursor-pointer">Check Out</button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TASKS TAB */}
              {activeTab === 'tasks' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-surface-900 tracking-tight">Assigned Tasks</h2>
                    <p className="text-xs text-surface-400 mt-0.5">Maintenance and cleaning tasks delegated by management.</p>
                  </div>
                  {tasks.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-surface-200 p-12 text-center max-w-sm mx-auto">
                      <CheckSquare className="w-10 h-10 text-surface-300 mx-auto mb-4" />
                      <h3 className="text-base font-semibold text-surface-800">Clean slate!</h3>
                      <p className="text-xs text-surface-400 mt-1">No tasks assigned today.</p>
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {tasks.map((task) => (
                        <div key={task.id} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <span className={`px-2 py-0.5 text-[8px] tracking-wider uppercase font-extrabold rounded-full ${
                                task.priority === 'high' ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                : task.priority === 'medium' ? 'bg-amber-50 text-amber-700'
                                : 'bg-surface-100 text-surface-600'
                              }`}>{task.priority}</span>
                              <span className={`px-2 py-0.5 text-[8px] tracking-wider uppercase font-bold rounded-full ${
                                task.status === 'completed' ? 'bg-emerald-50 text-emerald-700'
                                : task.status === 'in-progress' ? 'bg-amber-50 text-amber-700'
                                : 'bg-surface-100 text-surface-600'
                              }`}>{task.status}</span>
                            </div>
                            <h3 className="text-sm font-semibold text-surface-900">{task.title}</h3>
                            <p className="text-xs text-surface-500 mt-1.5">{task.description}</p>
                            {task.bookings?.rooms && (
                              <div className="mt-3 bg-surface-50 rounded-lg p-2.5 border border-surface-100 font-mono text-[10px] text-surface-600">
                                <div>Room {task.bookings.rooms.room_number} · {task.bookings.rooms.type}</div>
                              </div>
                            )}
                          </div>
                          <div className="mt-4 pt-3 border-t border-surface-100 flex flex-col gap-2">
                            {task.status === 'pending' && (
                              <button onClick={() => handleUpdateTaskStatus(task.id, 'in-progress')}
                                className="px-3 py-1.5 bg-surface-900 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer">
                                <Play className="w-3 h-3 fill-white" /> Start
                              </button>
                            )}
                            {task.status === 'in-progress' && (
                              taskCompletingId === task.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={taskNotesMap[task.id] || ''}
                                    onChange={(e) => setTaskNotesMap(prev => ({ ...prev, [task.id]: e.target.value }))}
                                    placeholder="Completion notes (optional)…"
                                    rows={2}
                                    className="w-full text-xs p-2 border border-surface-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                  <div className="flex gap-2">
                                    <button onClick={() => handleCompleteTaskWithNotes(task.id)}
                                      className="flex-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-semibold cursor-pointer">
                                      <Check className="w-3 h-3 inline mr-1" /> Confirm Done
                                    </button>
                                    <button onClick={() => setTaskCompletingId(null)}
                                      className="px-2 py-1.5 border border-surface-200 rounded-lg text-[10px] cursor-pointer">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button onClick={() => setTaskCompletingId(task.id)}
                                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer">
                                  <Check className="w-3 h-3" /> Complete
                                </button>
                              )
                            )}
                            {task.status === 'completed' && (
                              <span className="text-emerald-600 font-bold text-[10px] font-mono flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" /> Done
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TIME & ATTENDANCE TRACKING TAB */}
              {activeTab === 'time' && (() => {
                // Filter time entries
                const filteredEntries = timeEntries.filter(entry => {
                  return isDateInPreset(entry.clock_in, timeFilterPreset, timeFilterStartDate, timeFilterEndDate);
                });

                // Unique days
                const uniqueDays = new Set(
                  filteredEntries
                    .filter(e => e.clock_out)
                    .map(e => new Date(e.clock_in).toDateString())
                ).size;

                // Sum of hours
                const totalHoursSum = filteredEntries
                  .filter(e => e.clock_out)
                  .reduce((sum, e) => sum + (e.total_hours ? Number(e.total_hours) : 0), 0);

                // Counts
                let lates = 0;
                let holidaysWorked = 0;

                filteredEntries.forEach(entry => {
                  let status = 'Present';
                  let isHol = false;
                  if (entry.notes?.trim().startsWith('{')) {
                    try {
                      const p = JSON.parse(entry.notes);
                      if (p?.is_attendance_meta) {
                        status = p.status || 'Present';
                        isHol = !!p.is_holiday;
                      }
                    } catch (e) {}
                  } else {
                    const hr = new Date(entry.clock_in).getHours();
                    const min = new Date(entry.clock_in).getMinutes();
                    const [sh, sm] = shiftStartTime.split(':').map(Number);
                    if (hr > sh || (hr === sh && min > sm)) {
                      status = 'Late';
                    }
                  }
                  if (status === 'Late') lates++;
                  if (isHol) holidaysWorked++;
                });

                // Detect today holiday
                const todayHoliday = detectHoliday(new Date(), holidays);

                return (
                  <div className="space-y-6">
                    {/* Header with quick indicators */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-surface-900 tracking-tight">Colleague Attendance Center</h2>
                        <p className="text-xs text-surface-400 mt-0.5">Log arrival times, check holiday indicators, and view your filtered timesheet logs.</p>
                      </div>
                      
                      {/* Clock button */}
                      <button
                        onClick={handleClockInOut}
                        disabled={clockLoading}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                          activeTimeEntry
                            ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20'
                        }`}
                      >
                        {clockLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                        {activeTimeEntry ? 'Check Out / Clock Off' : 'Check In / Clock On'}
                      </button>
                    </div>

                    {/* Today Holiday Badge */}
                    {todayHoliday && (
                      <div className="bg-amber-500/10 border border-amber-500/20 text-amber-800 rounded-xl px-4 py-3 text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🎉</span>
                          <div>
                            <span className="font-bold">Today is {todayHoliday.name}</span>
                            <span className="text-[10px] text-amber-600 uppercase ml-2 font-semibold">({todayHoliday.type === 'regular' ? 'Regular Holiday' : 'Special Non-Working Day'})</span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-amber-500 text-white text-[9px] uppercase font-mono font-bold rounded-lg leading-tight">Holiday Rates Active</span>
                      </div>
                    )}

                    {/* METRIC OVERVIEW CARDS */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                        <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Total Days Worked</p>
                        <p className="text-2xl font-bold text-surface-900">{uniqueDays}</p>
                        <p className="text-[9px] text-surface-400 mt-0.5">Unique active workdays logged</p>
                      </div>
                      <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                        <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Total Hours Worked</p>
                        <p className="text-2xl font-bold text-emerald-600 font-mono">{totalHoursSum.toFixed(1)}h</p>
                        <p className="text-[9px] text-surface-400 mt-0.5">Cumulative shift duration</p>
                      </div>
                      <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                        <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Late Count</p>
                        <p className="text-2xl font-bold text-amber-500">{lates}</p>
                        <p className="text-[9px] text-surface-400 mt-0.5">Clock-in after {shiftStartTime}</p>
                      </div>
                      <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                        <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Holiday Work Count</p>
                        <p className="text-2xl font-bold text-indigo-600">{holidaysWorked}</p>
                        <p className="text-[9px] text-surface-400 mt-0.5">Shifts completed on holidays</p>
                      </div>
                    </div>

                    {/* ACTIVE SHIFT STATUS SCREEN */}
                    {activeTimeEntry && (
                      <div className="bg-gradient-to-br from-emerald-550/5 to-emerald-550/10 border border-emerald-500/20 rounded-2xl p-6 text-center space-y-4 shadow-sm">
                        <div>
                          <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">Current Active Shift</p>
                          <p className="text-xs text-surface-500 mb-3">Started check-in at: <span className="font-mono font-semibold">{new Date(activeTimeEntry.clock_in).toLocaleString()}</span></p>
                          
                          {/* Live Timer */}
                          <div className="flex items-center justify-center gap-2 bg-white px-4 py-2 rounded-xl border border-emerald-200 w-fit mx-auto mb-2 shadow-inner">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-4xl font-mono font-bold text-emerald-700 tabular-nums leading-none">{clockElapsed}</span>
                          </div>
                        </div>

                        {/* Live Break and Threshold Tracker */}
                        <div className="bg-white border border-emerald-500/10 rounded-2xl p-4 text-left max-w-md mx-auto space-y-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-surface-500 uppercase tracking-wide">Break & Overtime Engine</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${isOvertimeActive ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                              {isOvertimeActive ? '⚡ Overtime Period' : '✨ Standard Shift'}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 border-b border-surface-100 pb-3">
                            <div>
                              <p className="text-[10px] text-surface-400 font-semibold uppercase">Gross Duration</p>
                              <p className="text-sm font-bold text-surface-800 font-mono">{liveGrossHours.toFixed(2)} hrs</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-surface-400 font-semibold uppercase">Net Productive</p>
                              <p className="text-sm font-bold text-emerald-600 font-mono">{liveNetHours.toFixed(2)} hrs</p>
                            </div>
                          </div>

                          {/* Break input */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="emp-meal-break-taken"
                                checked={mealBreakTaken}
                                onChange={(e) => setMealBreakTaken(e.target.checked)}
                                className="w-4 h-4 rounded text-emerald-600 border-surface-300 focus:ring-emerald-500 cursor-pointer"
                              />
                              <label htmlFor="emp-meal-break-taken" className="text-xs font-bold text-surface-700 cursor-pointer select-none">
                                Mandatory Meal Break Taken
                              </label>
                            </div>
                            
                            {mealBreakTaken && (
                              <div className="flex items-center gap-2 pl-6">
                                <span className="text-[10px] text-surface-400 font-semibold uppercase">Duration:</span>
                                {[30, 45, 60].map((dur) => (
                                  <button
                                    key={dur}
                                    type="button"
                                    onClick={() => setMealBreakDuration(dur)}
                                    className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-all ${
                                      mealBreakDuration === dur
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                                    }`}
                                  >
                                    {dur} mins
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Progress threshold indicators */}
                          <div className="space-y-1.5 pt-1">
                            <div className="flex justify-between text-[10px] font-bold text-surface-500 uppercase">
                              <span>Standard limit: 8.0 hrs</span>
                              <span>{Math.min(100, Math.round((liveNetHours / 8) * 100))}%</span>
                            </div>
                            <div className="w-full bg-surface-100 h-2.5 rounded-full overflow-hidden flex">
                              <div
                                className="bg-emerald-500 h-full transition-all duration-300"
                                style={{ width: `${Math.min(100, (liveNetHours / 8) * 100)}%` }}
                              />
                              {isOvertimeActive && (
                                <div
                                  className="bg-amber-500 h-full transition-all duration-300 animate-pulse"
                                  style={{ width: `${Math.min(100, ((liveNetHours - 8) / 8) * 100)}%` }}
                                />
                              )}
                            </div>
                            
                            {isOvertimeActive && (
                              <p className="text-[10px] font-bold text-amber-600 flex items-center gap-1 leading-normal">
                                ⚠️ Standard limit met! Dynamic overtime engine is now active: logging +{overtimeLiveAmount.toFixed(2)} hrs overtime.
                              </p>
                            )}
                            {!isOvertimeActive && liveNetHours > 0 && (
                              <p className="text-[10px] font-semibold text-surface-400">
                                {(8 - liveNetHours).toFixed(2)} hrs remaining before standard overtime threshold.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="text-left max-w-md mx-auto">
                          <label className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1.5">Remarks / Shift Notes upon checkout</label>
                          <textarea
                            value={clockOutNotes}
                            onChange={(e) => setClockOutNotes(e.target.value)}
                            placeholder="Describe any accomplishments or work issues discovered..."
                            rows={2}
                            className="w-full text-xs p-2.5 rounded-xl border border-emerald-300 focus:ring-1 focus:ring-emerald-500 bg-white text-emerald-950 resize-none transition-all shadow-sm"
                          />
                        </div>
                      </div>
                    )}

                    {/* DATE FILTERS BAR */}
                    <div className="bg-white border border-surface-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          onClick={() => setTimeFilterPreset('all')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${timeFilterPreset === 'all' ? 'bg-surface-900 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
                        >
                          All Logs
                        </button>
                        <button
                          onClick={() => setTimeFilterPreset('today')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${timeFilterPreset === 'today' ? 'bg-surface-900 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
                        >
                          Today
                        </button>
                        <button
                          onClick={() => setTimeFilterPreset('week')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${timeFilterPreset === 'week' ? 'bg-surface-900 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
                        >
                          This Week
                        </button>
                        <button
                          onClick={() => setTimeFilterPreset('month')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${timeFilterPreset === 'month' ? 'bg-surface-900 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
                        >
                          This Month
                        </button>
                        <button
                          onClick={() => setTimeFilterPreset('custom')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${timeFilterPreset === 'custom' ? 'bg-surface-900 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
                        >
                          Custom Range
                        </button>
                      </div>

                      {timeFilterPreset === 'custom' && (
                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <input
                            type="date"
                            value={timeFilterStartDate}
                            onChange={(e) => setTimeFilterStartDate(e.target.value)}
                            className="text-xs p-1.5 border border-surface-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 w-full"
                          />
                          <span className="text-surface-400 text-xs">to</span>
                          <input
                            type="date"
                            value={timeFilterEndDate}
                            onChange={(e) => setTimeFilterEndDate(e.target.value)}
                            className="text-xs p-1.5 border border-surface-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 w-full"
                          />
                        </div>
                      )}
                    </div>

                    {/* HISTORY TIMELINE */}
                    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3.5 border-b border-surface-200 flex items-center justify-between bg-surface-50">
                        <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Attendance Ledger</h3>
                        <History className="w-3.5 h-3.5 text-surface-400" />
                      </div>
                      {filteredEntries.length === 0 ? (
                        <div className="p-12 text-center text-xs text-surface-400 flex flex-col items-center gap-2">
                          <Clock className="w-8 h-8 text-surface-300" />
                          <span>No attendance logs found in this date range.</span>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                             <thead>
                              <tr className="bg-surface-100/50 text-[10px] text-surface-400 font-bold uppercase tracking-wider border-b border-surface-200">
                                <th className="p-4">Date</th>
                                <th className="p-4">Day</th>
                                <th className="p-4">Check In</th>
                                <th className="p-4">Check Out</th>
                                <th className="p-4">Total Hours</th>
                                <th className="p-4">Holiday</th>
                                <th className="p-4">Attendance Status</th>
                                <th className="p-4">Remarks</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-100 font-sans">
                              {filteredEntries.map((entry) => {
                                // Day of week calculation
                                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                const entryDate = new Date(entry.clock_in);
                                const dayOfWeek = days[entryDate.getDay()];
                                const formattedDate = entryDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

                                // Parse JSON notes
                                let remarks = entry.notes || '';
                                let status = 'Present';
                                let holidayName = '';
                                let isHoliday = false;

                                if (entry.notes?.trim().startsWith('{')) {
                                  try {
                                    const p = JSON.parse(entry.notes);
                                    if (p?.is_attendance_meta) {
                                      status = p.status || 'Present';
                                      isHoliday = !!p.is_holiday;
                                      holidayName = p.holiday_name || '';
                                      remarks = p.remarks || '';
                                    }
                                  } catch (e) {}
                                } else {
                                  // Fallback checking
                                  const hr = entryDate.getHours();
                                  const min = entryDate.getMinutes();
                                  const [sh, sm] = shiftStartTime.split(':').map(Number);
                                  if (hr > sh || (hr === sh && min > sm)) {
                                    status = 'Late';
                                  }
                                }

                                return (
                                  <tr key={entry.id} className="text-surface-700 hover:bg-surface-50/50">
                                    <td className="p-4 font-semibold text-surface-900">{formattedDate}</td>
                                    <td className="p-4 text-surface-500">{dayOfWeek}</td>
                                    <td className="p-4 font-mono">{entryDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })}</td>
                                    <td className="p-4 font-mono">
                                      {entry.clock_out ? (
                                        new Date(entry.clock_out).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })
                                      ) : (
                                        <span className="text-rose-500 font-bold uppercase text-[9px] animate-pulse">Running Shift</span>
                                      )}
                                    </td>
                                    <td className="p-4 font-mono font-bold text-surface-900">
                                      {entry.total_hours ? `${Number(entry.total_hours).toFixed(2)}h` : '—'}
                                    </td>
                                    <td className="p-4">
                                      {isHoliday ? (
                                        <div className="flex flex-col">
                                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold text-[9px] rounded-full w-fit leading-none">
                                            Holiday Working
                                          </span>
                                          {holidayName && <span className="text-[9px] text-indigo-900 font-semibold mt-0.5">{holidayName}</span>}
                                        </div>
                                      ) : (
                                        <span className="text-surface-400 text-[10px]">No</span>
                                      )}
                                    </td>
                                    <td className="p-4">
                                      <span className={`px-2 py-0.5 text-[9px] leading-tight font-extrabold rounded-full border ${
                                        status === 'Present' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                        status === 'Late' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                        status === 'Half-Day' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                        'bg-red-50 text-red-700 border-red-100'
                                      }`}>
                                        {status}
                                      </span>
                                    </td>
                                    <td className="p-4 text-surface-500 max-w-xs truncate" title={remarks}>
                                      {remarks || <span className="text-surface-300 italic">No remarks</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* PAYROLL TAB */}
              {activeTab === 'payroll' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-surface-900 tracking-tight">Payroll</h2>
                    <p className="text-xs text-surface-400 mt-0.5">Your compensation details and payment history.</p>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-2xl border border-surface-200 p-5">
                      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Hourly Rate</p>
                      <p className="text-2xl font-bold text-surface-900">{settings.currencySymbol}{(payrollInfo?.hourly_rate || 0).toFixed(2)}</p>
                      <p className="text-[10px] text-surface-400 mt-1">{payrollInfo?.pay_frequency || '—'} · {payrollInfo?.employment_type || '—'}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-surface-200 p-5">
                      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Overtime Rate</p>
                      <p className="text-2xl font-bold text-surface-900">{settings.currencySymbol}{(payrollInfo?.overtime_rate || 0).toFixed(2)}</p>
                      <p className="text-[10px] text-surface-400 mt-1">Per hour (after 8h)</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-surface-200 p-5">
                      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Total Periods</p>
                      <p className="text-2xl font-bold text-surface-900">{payrollEntries.length}</p>
                      <p className="text-[10px] text-surface-400 mt-1">Completed pay cycles</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-surface-200">
                      <h3 className="text-sm font-bold text-surface-900">Payment History</h3>
                    </div>
                    {payrollEntries.length === 0 ? (
                      <div className="p-8 text-center text-xs text-surface-400">No payroll entries yet.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-surface-50 text-[10px] text-surface-400 font-bold uppercase tracking-wider">
                              <th className="p-3">Period</th>
                              <th className="p-3">Regular Hrs</th>
                              <th className="p-3">OT Hrs</th>
                              <th className="p-3">Gross Pay</th>
                              <th className="p-3">Deductions</th>
                              <th className="p-3">Net Pay</th>
                              <th className="p-3">Status</th>
                              <th className="p-3"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-100 text-surface-700">
                            {payrollEntries.map((entry) => (
                              <tr key={entry.id} className="hover:bg-surface-50 cursor-pointer" onClick={() => setViewPayslip(entry)}>
                                <td className="p-3 font-semibold text-surface-900">{entry.payroll_periods?.name || '—'}</td>
                                <td className="p-3 font-mono">{entry.total_regular_hours}h</td>
                                <td className="p-3 font-mono">{entry.total_overtime_hours}h</td>
                                <td className="p-3 font-mono font-semibold">{settings.currencySymbol}{entry.gross_pay.toLocaleString()}</td>
                                <td className="p-3 font-mono text-rose-600">{settings.currencySymbol}{entry.deductions.toLocaleString()}</td>
                                <td className="p-3 font-mono font-bold text-surface-900">{settings.currencySymbol}{entry.net_pay.toLocaleString()}</td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${
                                    entry.status === 'paid' ? 'bg-emerald-50 text-emerald-700'
                                    : entry.status === 'approved' ? 'bg-blue-50 text-blue-700'
                                    : 'bg-amber-50 text-amber-700'
                                  }`}>{entry.status}</span>
                                </td>
                                <td className="p-3">
                                  <button onClick={(e) => { e.stopPropagation(); setViewPayslip(entry); }}
                                    className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer">
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PROFILE TAB */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-surface-900 tracking-tight">Colleague Profile</h2>
                    <p className="text-xs text-surface-400 mt-0.5">Manage your details shown in staff timetables.</p>
                  </div>
                  <div className="max-w-lg">
                    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 bg-gradient-to-r from-surface-50 to-brand-50/30 border-b border-surface-200 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-surface-900 flex items-center justify-center">
                          <User className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-surface-900">{userProfile?.full_name || 'Staff Member'}</h3>
                          <p className="text-[10px] text-surface-400">{userProfile?.email} · {userProfile?.role}</p>
                        </div>
                      </div>
                      <form onSubmit={handleProfileSave} className="p-6 space-y-4 text-xs">
                        <div>
                          <label className="block text-surface-500 font-semibold mb-1.5">Display Name</label>
                          <input type="text" required value={newName} onChange={(e) => setNewName(e.target.value)}
                            className="w-full bg-surface-50 border border-surface-200 rounded-lg p-3 text-surface-800 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all" />
                        </div>
                        <div>
                          <label className="block text-surface-500 font-semibold mb-1.5">Email</label>
                          <div className="w-full bg-surface-100 border border-surface-200 rounded-lg p-3 text-surface-500 flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5" />
                            <span>{userProfile?.email || '—'}</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-surface-500 font-semibold mb-1.5">Role</label>
                          <div className="w-full bg-surface-100 border border-surface-200 rounded-lg p-3 text-surface-500 flex items-center gap-2">
                            <Award className="w-3.5 h-3.5" />
                            <span className="capitalize">{userProfile?.role || 'staff'}</span>
                          </div>
                        </div>
                        {profileMsg && (
                          <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                            profileMsg.startsWith('Error') ? 'bg-rose-50 border border-rose-100 text-rose-700'
                            : 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                          }`}>{profileMsg}</div>
                        )}
                        <button type="submit" disabled={updatingProfile}
                          className="w-full py-3 bg-surface-900 hover:bg-surface-800:bg-brand-700 disabled:bg-surface-300:bg-surface-700 text-white font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm">
                          {updatingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          {updatingProfile ? 'Saving...' : 'Update Profile'}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )}

              {/* CLEANING QUEUE TAB */}
              {activeTab === 'cleaning' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-surface-900 tracking-tight">My Cleaning Queue</h2>
                      <p className="text-xs text-surface-400 mt-0.5">Rooms assigned for cleaning. Mark complete when done.</p>
                    </div>
                    <button onClick={loadStaffDuties} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-surface-200 rounded-xl text-xs font-semibold cursor-pointer hover:bg-surface-50"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
                  </div>
                  {cleaningTasks.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-surface-200 p-12 text-center">
                      <Sparkles className="w-10 h-10 text-amber-300 mx-auto mb-3" />
                      <h3 className="text-sm font-semibold text-surface-700">All clear — no rooms assigned!</h3>
                      <p className="text-xs text-surface-400 mt-1">New cleaning assignments will appear here.</p>
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {cleaningTasks.map((task: any) => (
                        <div key={task.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full border ${task.priority === 'high' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>{task.priority}</span>
                            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${task.status === 'in-progress' ? 'bg-blue-50 text-blue-700' : 'bg-surface-100 text-surface-500'}`}>{task.status}</span>
                          </div>
                          {task.bookings?.rooms && (
                            <div className="flex items-center gap-3 bg-amber-50 rounded-xl p-3 border border-amber-100">
                              <Sparkles className="w-6 h-6 text-amber-500 flex-shrink-0" />
                              <div>
                                <p className="font-bold text-surface-900 text-sm">Suite #{task.bookings.rooms.room_number}</p>
                                <p className="text-[10px] text-surface-500">{task.bookings.rooms.type}</p>
                              </div>
                            </div>
                          )}
                          <p className="text-xs text-surface-600">{task.title}</p>
                          {task.description && <p className="text-[11px] text-surface-400">{task.description}</p>}
                          <div className="flex flex-col gap-2 pt-2 border-t border-surface-100">
                            {task.status === 'pending' && (
                              <button onClick={() => handleUpdateTaskStatus(task.id, 'in-progress')} className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center justify-center gap-1"><Play className="w-3 h-3 fill-white" /> Start Cleaning</button>
                            )}
                            {task.status === 'in-progress' && (
                              taskCompletingId === task.id ? (
                                <div className="space-y-2">
                                  <textarea value={taskNotesMap[task.id] || ''} onChange={(e) => setTaskNotesMap(prev => ({ ...prev, [task.id]: e.target.value }))} placeholder="Note any issues found\u2026" rows={2} className="w-full text-xs p-2 border border-surface-200 rounded-lg resize-none" />
                                  <div className="flex gap-2">
                                    <button onClick={() => handleCompleteTaskWithNotes(task.id)} className="flex-1 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold cursor-pointer">Mark Clean</button>
                                    <button onClick={() => setTaskCompletingId(null)} className="px-3 border border-surface-200 rounded-lg text-xs cursor-pointer">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <button onClick={() => setTaskCompletingId(task.id)} className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center justify-center gap-1"><Check className="w-3 h-3" /> Mark Cleaned</button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* KITCHEN ORDERS TAB */}
              {activeTab === 'kitchen' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-surface-900 tracking-tight">Kitchen Order Queue</h2>
                      <p className="text-xs text-surface-400 mt-0.5">Active food and beverage orders to be prepared.</p>
                    </div>
                    <button onClick={loadStaffDuties} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-surface-200 rounded-xl text-xs font-semibold cursor-pointer hover:bg-surface-50"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
                  </div>
                  {kitchenOrders.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-surface-200 p-12 text-center">
                      <UtensilsCrossed className="w-10 h-10 text-surface-300 mx-auto mb-3" />
                      <h3 className="text-sm font-semibold text-surface-700">No pending orders</h3>
                      <p className="text-xs text-surface-400 mt-1">New food orders from guests will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {kitchenOrders.map((order: any) => (
                        <div key={order.id} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0"><UtensilsCrossed className="w-5 h-5 text-amber-600" /></div>
                            <div className="min-w-0">
                              <p className="font-bold text-surface-900 text-sm">{order.inventory_items?.name || 'Item'}</p>
                              <p className="text-xs text-surface-500">x{order.quantity} · Suite #{order.bookings?.rooms?.room_number || '?'} · <span className="font-mono text-[10px]">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span></p>
                              {order.notes && <p className="text-[11px] text-surface-400 italic">{order.notes}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full border ${order.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{order.status}</span>
                            {order.status === 'pending' && (
                              <button onClick={async () => { await supabase.from('guest_orders').update({ status: 'preparing' }).eq('id', order.id); loadStaffDuties(); }} className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-[10px] font-bold cursor-pointer">Start</button>
                            )}
                            {order.status === 'preparing' && (
                              <button onClick={async () => { await supabase.from('guest_orders').update({ status: 'served' }).eq('id', order.id); loadStaffDuties(); }} className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-[10px] font-bold cursor-pointer">Served</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* LEAVE REQUEST TAB */}
              {activeTab === 'leave' && (
                <div className="space-y-6 max-w-2xl">
                  <div>
                    <h2 className="text-lg font-bold text-surface-900 tracking-tight">Leave Requests</h2>
                    <p className="text-xs text-surface-400 mt-0.5">File a leave and track approval status.</p>
                  </div>
                  <form onSubmit={handleSubmitLeave} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 space-y-4">
                    <h3 className="text-sm font-bold text-surface-800">File New Leave</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-surface-500 mb-1.5">Leave Type</label>
                        <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as any)} className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-surface-900">
                          <option value="sick">Sick Leave</option>
                          <option value="vacation">Vacation Leave</option>
                          <option value="emergency">Emergency Leave</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div />
                      <div>
                        <label className="block text-xs font-semibold text-surface-500 mb-1.5">Start Date</label>
                        <input type="date" required value={leaveStartDate} onChange={(e) => setLeaveStartDate(e.target.value)} className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-surface-900" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-surface-500 mb-1.5">End Date</label>
                        <input type="date" required value={leaveEndDate} onChange={(e) => setLeaveEndDate(e.target.value)} className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-surface-900" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-surface-500 mb-1.5">Reason</label>
                      <textarea value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} placeholder="Brief reason for leave..." rows={3} className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-surface-900 resize-none" />
                    </div>
                    <button type="submit" disabled={leaveSubmitting} className="w-full py-3 bg-surface-900 hover:bg-surface-800 text-white rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                      {leaveSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : 'Submit Leave Request'}
                    </button>
                  </form>

                  {leaveRequests.length > 0 && (
                    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-surface-200 bg-surface-50">
                        <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">My Leave History</h3>
                      </div>
                      <div className="divide-y divide-surface-100">
                        {leaveRequests.map((lr: any) => (
                          <div key={lr.id} className="px-4 py-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-surface-900">{(lr.leave_types as any)?.name || lr.leave_type_id}</p>
                              <p className="text-xs text-surface-500">{lr.start_date} → {lr.end_date} · {lr.days} day(s)</p>
                              {lr.reason && <p className="text-[11px] text-surface-400 italic mt-0.5">{lr.reason}</p>}
                            </div>
                            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full flex-shrink-0 ${lr.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : lr.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{lr.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ANNOUNCEMENTS TAB */}
              {activeTab === 'announcements' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-surface-900 tracking-tight">Hotel Notices</h2>
                    <p className="text-xs text-surface-400 mt-0.5">Management announcements and operational updates.</p>
                  </div>
                  {announcements.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-surface-200 p-12 text-center">
                      <Bell className="w-10 h-10 text-surface-300 mx-auto mb-3" />
                      <h3 className="text-sm font-semibold text-surface-700">No announcements yet</h3>
                      <p className="text-xs text-surface-400 mt-1">Management notices will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {announcements.map((ann: any) => (
                        <div key={ann.id} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"><Bell className="w-4 h-4 text-blue-600" /></div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-surface-900">{ann.user_name || 'Management'}</p>
                              <p className="text-sm text-surface-700 mt-1">{ann.details}</p>
                              <p className="text-[10px] text-surface-400 mt-2">{new Date(ann.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </main>
      </div>

      <footer className="bg-white border-t border-surface-200 py-4 px-6 text-center text-[10px] text-surface-400 font-mono">
        {settings.brand.hotelName} WORKFORCE · CONNECTED TO SUPABASE
      </footer>

      {/* New Task Notification Modal */}
      {newTaskNotification?.visible && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setNewTaskNotification(null)}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 space-y-5 animate-in zoom-in-105" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center animate-bounce">
                <Bell className="w-8 h-8 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-surface-900">New Task Assigned!</h2>
                <p className="text-xs text-surface-400 mt-1">A new task has been assigned to you.</p>
              </div>
            </div>
            <div className="bg-amber-50 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 text-[9px] tracking-wider uppercase font-extrabold rounded-full ${
                  newTaskNotification.task.priority === 'high' ? 'bg-rose-50 text-rose-700 border border-rose-100'
                  : newTaskNotification.task.priority === 'medium' ? 'bg-amber-50 text-amber-700'
                  : 'bg-surface-100 text-surface-600'
                }`}>{newTaskNotification.task.priority}</span>
                <span className="text-[9px] text-surface-400 font-mono">pending</span>
              </div>
              <h3 className="text-base font-bold text-surface-900">{newTaskNotification.task.title}</h3>
              {newTaskNotification.task.description && (
                <p className="text-sm text-surface-600">{newTaskNotification.task.description}</p>
              )}
              {newTaskNotification.task.bookings?.rooms && (
                <div className="bg-white rounded-xl p-3 border border-amber-100 flex items-center gap-3">
                  <Building className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="text-xs font-semibold text-surface-900">Suite #{newTaskNotification.task.bookings.rooms.room_number}</p>
                    <p className="text-[10px] text-surface-400">{newTaskNotification.task.bookings.rooms.type}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setActiveTab('tasks'); setNewTaskNotification(null); }}
                className="flex-1 py-3 bg-surface-900 hover:bg-surface-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-all">
                View Task
              </button>
              <button onClick={() => setNewTaskNotification(null)}
                className="flex-1 py-3 border border-surface-200 text-surface-600 rounded-xl text-xs font-semibold cursor-pointer hover:bg-surface-50 transition-all">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog isOpen={!!alertState} title={alertState?.title || ''} message={alertState?.message || ''} onDismiss={() => setAlertState(null)} />

      {/* PAYSLIP MODAL */}
      {viewPayslip && (() => {
        const e = viewPayslip;
        let pNotes: any = null;
        try {
          if (e.notes && e.notes.trim().startsWith('{')) {
            pNotes = JSON.parse(e.notes);
          }
        } catch (err) {
          // Not JSON, fall back
        }

        const period = e.payroll_periods;
        const empName = userProfile?.full_name || userProfile?.email || 'You';
        
        // Compute base items if not itemized
        const regPay = Number(e.total_regular_hours || 0) * Number(e.hourly_rate || 0);
        const otPay = Number(e.total_overtime_hours || 0) * Number(e.overtime_rate || 0);

        const handleTriggerPrint = () => {
          window.print();
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm print:bg-white print:fixed print:inset-0 print:z-[99999] print:p-0 print:m-0 print:block">
            <div className="bg-white rounded-2xl shadow-2xl border border-surface-100 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none print:border-none print:w-full print:max-w-none print:p-6 print:m-0 print:block print:relative" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="sticky top-0 bg-white z-10 px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between rounded-t-2xl print:relative print:border-none print:pt-2 print:px-2 print:sticky-none print:shadow-none">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-brand-500 print:text-black" />
                  <div>
                    <h3 className="text-base font-bold text-surface-900 print:text-lg">Payslip Voucher</h3>
                    <p className="text-[10px] text-surface-400 mt-0.5 print:text-[11px] print:text-black">
                      {settings.brand.hotelName} · {period?.name || '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 print:hidden">
                  <button
                    onClick={handleTriggerPrint}
                    className="p-2 text-surface-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 text-xs font-semibold"
                    title="Print Payslip"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print</span>
                  </button>
                  <button onClick={() => setViewPayslip(null)}
                    className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5 text-xs print:p-2 print:space-y-4">
                {/* Print Corporate Header */}
                <div className="hidden print:block text-center border-b pb-4 mb-4">
                  <h1 className="text-xl font-bold tracking-tight uppercase text-black">{settings.brand.hotelName}</h1>
                  <p className="text-xs text-stone-600">Employee Official Payroll Remittance Record</p>
                  <p className="text-[9px] text-stone-500">Date Generated: {new Date().toLocaleDateString()}</p>
                </div>

                {/* Employee Info Grid */}
                <div className="bg-gradient-to-br from-brand-50/50 to-surface-50 rounded-xl p-4 border border-brand-100/50 print:bg-white print:border-stone-300 print:rounded-none">
                  <h4 className="text-[9px] font-bold uppercase tracking-wider text-brand-600 mb-3 print:text-black print:border-b print:pb-1">Employee & Summary Information</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-surface-400 block text-[9px] uppercase font-bold print:text-stone-500">Staff Name</span>
                      <span className="font-bold text-surface-900 pr-1 truncate block print:text-black">{empName}</span>
                    </div>
                    <div>
                      <span className="text-surface-400 block text-[9px] uppercase font-bold print:text-stone-500">Pay Period</span>
                      <span className="font-semibold text-surface-800 block print:text-black">
                        {period ? `${new Date(period.start_date).toLocaleDateString()} — ${new Date(period.end_date).toLocaleDateString()}` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-surface-400 block text-[9px] uppercase font-bold print:text-stone-500">Role & Code</span>
                      <span className="font-mono text-surface-700 block uppercase print:text-black">{userProfile?.role || 'staff'}</span>
                    </div>
                    <div>
                      <span className="text-surface-400 block text-[9px] uppercase font-bold print:text-stone-500">Status</span>
                      <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full inline-block print:text-black print:p-0 print:normal-case ${
                        e.status === 'paid' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
                        e.status === 'approved' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' :
                        'bg-surface-50 text-surface-500 ring-1 ring-surface-200'
                      }`}>{e.status}</span>
                    </div>
                  </div>
                </div>

                {/* Interactive Ledger Structure */}
                <div className="grid md:grid-cols-2 gap-4 print:grid-cols-2">
                  {/* Earnings column */}
                  <div className="bg-white rounded-xl border border-surface-150 p-4 print:rounded-none print:border-stone-300">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-surface-800 mb-3 border-b pb-1 text-emerald-700 print:text-black">Earnings Breakdown</h4>
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-surface-800 print:text-black">Regular Hours Base Pay</p>
                          <p className="text-[10px] text-surface-400 font-mono print:text-stone-500">
                            {Number(e.total_regular_hours || 0).toFixed(1)}h @ {settings.currencySymbol}{Number(e.hourly_rate || 0).toFixed(2)}/hr
                          </p>
                        </div>
                        <span className="font-mono font-semibold text-surface-900 print:text-black">{settings.currencySymbol}{regPay.toFixed(2)}</span>
                      </div>

                      {Number(e.total_overtime_hours || 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-semibold text-surface-800 print:text-black">Overtime Premium Pay</p>
                            <p className="text-[10px] text-surface-400 font-mono print:text-stone-500">
                              {Number(e.total_overtime_hours || 0).toFixed(1)}h @ {settings.currencySymbol}{Number(e.overtime_rate || 0).toFixed(2)}/hr
                            </p>
                          </div>
                          <span className="font-mono font-semibold text-surface-900 print:text-black">{settings.currencySymbol}{otPay.toFixed(2)}</span>
                        </div>
                      )}

                      {/* Render Itemized Allowances/Bonuses if JSON exists */}
                      {pNotes?.itemized && pNotes.allowances && (
                        <>
                          {Object.entries(pNotes.allowances).map(([label, val]) => {
                            const numericVal = Number(val || 0);
                            if (numericVal <= 0) return null;
                            return (
                              <div key={label} className="flex justify-between items-center border-t border-surface-50 pt-2 print:border-stone-200">
                                <span className="text-surface-700 capitalize print:text-black">{label.replace(/_/g, ' ')}</span>
                                <span className="font-mono font-semibold text-surface-900 print:text-black">{settings.currencySymbol}{numericVal.toFixed(2)}</span>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Deductions column */}
                  <div className="bg-white rounded-xl border border-surface-150 p-4 print:rounded-none print:border-stone-300">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-surface-800 mb-3 border-b pb-1 text-rose-700 print:text-black">Withholding & Deductions</h4>
                    <div className="space-y-2.5">
                      {/* Detailed deductions from JSON */}
                      {pNotes?.itemized && pNotes.deductions ? (
                        <div className="space-y-2.5">
                          {Object.entries(pNotes.deductions).map(([label, val]) => {
                            const numericVal = Number(val || 0);
                            if (numericVal <= 0) return null;
                            return (
                              <div key={label} className="flex justify-between items-center">
                                <span className="text-surface-700 uppercase font-medium text-[10px] print:text-black">{label.replace(/_/g, ' ')} Contribution</span>
                                <span className="font-mono font-semibold text-rose-600 print:text-black">{settings.currencySymbol}{numericVal.toFixed(2)}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex justify-between items-center py-2">
                          <span className="text-surface-500 font-semibold print:text-black">Standard Deductions</span>
                          <span className="font-mono font-bold text-rose-600 print:text-black">{settings.currencySymbol}{Number(e.deductions || 0).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Main Payslip Calculation Summary */}
                <div className="bg-surface-900 rounded-xl p-5 text-white/90 print:bg-white print:border print:border-stone-300 print:text-black">
                  <h4 className="text-[9px] font-bold uppercase tracking-wider text-white/50 mb-3 border-b border-white/10 pb-1.5 print:text-black print:border-stone-300">Net Remittance Summary</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-white/70 print:text-stone-500">Gross Remittance Pay</span>
                      <span className="font-mono font-semibold text-white print:text-black">{settings.currencySymbol}{Number(e.gross_pay || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/70 print:text-stone-500">Total Approved Withholding Deductions</span>
                      <span className="font-mono font-semibold text-rose-300 print:text-black">-{settings.currencySymbol}{Number(e.deductions || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-2.5 border-t border-white/20 print:border-stone-300 items-center">
                      <span className="font-bold text-white text-sm print:text-black">NET REMITTANCE AMOUNT</span>
                      <span className="font-mono font-black text-emerald-400 text-lg print:text-black">{settings.currencySymbol}{Number(e.net_pay || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Remarks Block */}
                {(pNotes?.customNotes || (!pNotes?.itemized && e.notes)) && (
                  <div className="bg-surface-50 rounded-xl p-4 border border-surface-150 print:bg-white print:border-stone-300 print:rounded-none">
                    <h5 className="font-bold text-[9px] text-surface-500 uppercase tracking-wider mb-1.5 print:text-black">Administrative Remarks</h5>
                    <p className="text-xs text-surface-700 italic block leading-relaxed print:text-black">
                      {pNotes?.customNotes || e.notes}
                    </p>
                  </div>
                )}

                {/* Print Only Signature Lines */}
                <div className="hidden print:grid grid-cols-2 gap-12 pt-14 text-center mt-8 text-black">
                  <div className="border-t border-stone-400 pt-1.5">
                    <p className="text-[10px] font-bold block">{empName}</p>
                    <p className="text-[8px] text-stone-500">Employee Signature & Date</p>
                  </div>
                  <div className="border-t border-stone-400 pt-1.5">
                    <p className="text-[10px] font-bold block">Grand Horizon Management</p>
                    <p className="text-[8px] text-stone-500">Disbursing Officer Signature</p>
                  </div>
                </div>

                {e.created_at && (
                  <div className="text-[9px] text-surface-400 text-center uppercase tracking-widest font-mono print:text-stone-400 print:mt-6">
                    Transaction ID: {e.id.substring(0, 8).toUpperCase()} · Generated {new Date(e.created_at).toLocaleDateString()}
                    {e.paid_at && <> · Paid Date: {new Date(e.paid_at).toLocaleDateString()}</>}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-surface-100 flex justify-end print:hidden">
                <button onClick={() => setViewPayslip(null)}
                  className="px-4 py-2 text-xs font-semibold bg-surface-100 text-surface-600 hover:bg-surface-200 rounded-lg cursor-pointer transition-colors">
                  Close Window
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
