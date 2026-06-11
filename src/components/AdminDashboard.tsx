import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { Room, Booking, Profile, Customer, ActivityLog, MenuCategory, InventoryItem, GuestOrder, StaffCall, StayExtension, ChatMessage, ChatTyping, ContactMessage, EmployeePayroll, TimeEntry, PayrollPeriod, PayrollEntry, HousekeepingTask, PromoCode, RatePlan, WaitlistEntry, Incident, ParkingSpot, BookingGroup } from '../types';
import { AlertDialog, ConfirmDialog } from './AlertDialog';
import { ToastContainer } from './Toast';
import type { ToastMessage } from './Toast';
import { createDebouncedSync } from '../lib/debounce';
import { QRCodeSVG } from 'qrcode.react';
import NotificationBell, { type AppNotification } from './NotificationBell';
import { exportToCSV, exportBookingsToPDF, exportRevenueToPDF, exportLogsToPDF, exportRoomsToPDF, exportOrdersToPDF, exportAttendanceToPDF } from '../lib/exportUtils';
import { fileToBase64, isValidImageType } from '../lib/imageUpload';
import { 
  BarChart3, Building, BookOpen, UserCheck, Users, Activity, Sparkles, DollarSign, CreditCard,
  Plus, Trash2, Check, X, Calendar, Edit3, Key, LogOut, Loader2, RefreshCw, Layers, Settings, AlertTriangle, Clock,
  Package, ShoppingCart, AlertCircle, Minus, Bell, MessageSquareText, Send, ChevronDown, ChevronUp, Mail, Search, ChevronLeft, ChevronRight, Phone, Eye, Filter, UserPlus, Tag, TrendingUp, Grid3X3, FileText, Download, ImageUp, ListChecks, Percent, ClipboardList,
  Printer, FileSpreadsheet, SprayCan, Utensils, Zap
} from 'lucide-react';
import { getSettings, saveSettings, fetchSettingsFromSupabase, AppSettings } from '../lib/settings';
import BrandBar from './BrandBar';
import AdminSidebar from './AdminSidebar';
import PayrollCenter from './payroll/PayrollCenter';
import ShiftScheduleTab from './admin/ShiftScheduleTab';
import AdminStaffCallsTab from './admin/AdminStaffCallsTab';
import AdminStayExtensionsTab from './admin/AdminStayExtensionsTab';
import AdminAuditLogsTab from './admin/AdminAuditLogsTab';
import AdminMessagesTab from './admin/AdminMessagesTab';
import AdminQRCodesTab from './admin/AdminQRCodesTab';
import AdminSettingsTab from './admin/AdminSettingsTab';
import AdminPromotionsTab from './admin/AdminPromotionsTab';
import AdminHousekeepingTab from './admin/AdminHousekeepingTab';
import AdminReportsTab from './admin/AdminReportsTab';
import AdminMaintenanceTab from './admin/AdminMaintenanceTab';
import AdminLostFoundTab from './admin/AdminLostFoundTab';

interface AdminDashboardProps {
  onNavigate: (screen: 'login' | 'admin-dashboard' | 'employee-dashboard') => void;
  userSession: Session | null;
  userProfile: Profile | null;
  onLogout: () => void;
}

type AdminTab = 'insights' | 'rooms' | 'bookings' | 'workforce' | 'guests' | 'audit_logs' | 'inventory' | 'staff_calls' | 'stay_extensions' | 'front_desk_chat' | 'messages' | 'qr_codes' | 'settings' | 'promotions' | 'housekeeping' | 'reports' | 'maintenance' | 'lost_found';

function generateAllDaySlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? 'AM' : 'PM';
      slots.push(`${hour12}:${m.toString().padStart(2, '0')} ${ampm}`);
    }
  }
  return slots;
}

/** Returns the validation status of the configured check-in/check-out time slots against the minimum stay hours */
function validateTimeSlotMinimumStay(checkInTimes: string[], checkOutTimes: string[], minStayHours: number): { valid: boolean; message: string | null } {
  if (checkInTimes.length === 0 || checkOutTimes.length === 0 || minStayHours <= 0) {
    return { valid: true, message: null };
  }

  const toMinutes = (t: string): number => {
    const [time, ampm] = t.split(' ');
    let [h, m] = time.split(':').map(Number);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  };

  const formatMinutes = (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const latestCheckIn = Math.max(...checkInTimes.map(toMinutes));
  const earliestCheckOut = Math.min(...checkOutTimes.map(toMinutes));

  // Calculate gap, handling overnight crossover
  let gap = earliestCheckOut - latestCheckIn;
  if (gap < 0) gap += 24 * 60; // check-out is next day

  if (gap < minStayHours * 60) {
    const latestCheckInFormatted = formatMinutes(latestCheckIn);
    const earliestCheckOutFormatted = formatMinutes(earliestCheckOut);
    const gapHours = Math.round((gap / 60) * 10) / 10;

    return {
      valid: false,
      message: `Minimum stay is ${minStayHours}h but the gap between the latest check-in (${latestCheckInFormatted}) and earliest check-out (${earliestCheckOutFormatted}) is only ${gapHours}h. Either add earlier check-in times, later check-out times, or lower the minimum stay hours to ${Math.floor(gapHours)}h or less.`
    };
  }

  return { valid: true, message: null };
}

function compareTimes(a: string, b: string): number {
  const pt = (t: string) => {
    const [time, ampm] = t.split(' ');
    let [h, m] = time.split(':').map(Number);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  };
  return pt(a) - pt(b);
}

export default function AdminDashboard({ onNavigate, userSession, userProfile, onLogout }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('insights');
  const activeTabRef = useRef(activeTab);
  const realtimeEventKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  const [loading, setLoading] = useState(true);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Database Arrays
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [employeePayrolls, setEmployeePayrolls] = useState<EmployeePayroll[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([]);
  const [wfSubTab, setWfSubTab] = useState<'directory' | 'time' | 'payroll' | 'shifts'>('directory');
  const [payrollModal, setPayrollModal] = useState<null | 'payroll' | 'time' | 'period' | 'run'>(null);
  const [selectedPayrollEmp, setSelectedPayrollEmp] = useState<string | null>(null);
  const [payrollRateForm, setPayrollRateForm] = useState({ hourly_rate: 0, overtime_rate: 0, pay_frequency: 'weekly' as 'weekly' | 'bi-weekly' | 'monthly', employment_type: 'regular' as 'regular' | 'probationary' | 'contractual' | 'seasonal' | 'part-time' | 'casual', hire_date: '', tax_id: '', bank_account: '', remarks: '' });
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [periodForm, setPeriodForm] = useState({ name: '', start_date: '', end_date: '', cutoff_type: 'semi-monthly-first' as 'semi-monthly-first' | 'semi-monthly-second' | 'custom' });
  const [viewPayslipEntry, setViewPayslipEntry] = useState<PayrollEntry | null>(null);
  const [viewConsolidatedPeriod, setViewConsolidatedPeriod] = useState<PayrollPeriod | null>(null);
  const [timeFilterUser, setTimeFilterUser] = useState<string>('all');
  const [workforceAccomplishments, setWorkforceAccomplishments] = useState<any[]>([]);
  const [isEditingPayslipEntry, setIsEditingPayslipEntry] = useState(false);
  const [payslipForm, setPayslipForm] = useState({
    regHours: 0,
    otHours: 0,
    hrRate: 0,
    otRate: 0,
    sss: 0,
    philhealth: 0,
    pagibig: 0,
    tax: 0,
    otherDeductions: 0,
    allowance: 0,
    bonus: 0,
    customNotes: ''
  });

  // Timesheet Correction states
  const [timeEntryModalOpen, setTimeEntryModalOpen] = useState(false);
  const [manualTimeForm, setManualTimeForm] = useState({
    userId: '',
    clockIn: '',
    clockOut: '',
    notes: '',
    status: 'Present',
    isHoliday: false,
    holidayName: '',
    remarks: '',
    mealBreakTaken: true,
    mealBreakDuration: 60
  });
  const [editingTimeEntry, setEditingTimeEntry] = useState<TimeEntry | null>(null);

  // Attendance & Holiday Configurations
  const [holidays, setHolidays] = useState<any[]>([]);
  const [shiftStartTime, setShiftStartTime] = useState('09:00');
  const [holidayFormOpen, setHolidayFormOpen] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '', type: 'regular' });
  const [timeFilterPreset, setTimeFilterPreset] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [timeFilterStartDate, setTimeFilterStartDate] = useState('');
  const [timeFilterEndDate, setTimeFilterEndDate] = useState('');

  // --- HELPERS FOR HOLIDAYS AND ATTENDANCE ---
  const detectHoliday = (date: Date) => {
    if (!holidays || !Array.isArray(holidays)) return null;
    const yyyymmdd = date.toISOString().slice(0, 10);
    const mmdd = yyyymmdd.slice(5, 10); // e.g. "06-12"
    const found = holidays.find(h => h.date === yyyymmdd || h.date.slice(5, 10) === mmdd);
    return found || null;
  };

  const calculateAttendanceStatus = (clockInStr: string, clockOutStr: string | null) => {
    const clockIn = new Date(clockInStr);
    const [startHour, startMinute] = shiftStartTime.split(':').map(Number);
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
  };

  const isDateInPreset = (dateStr: string) => {
    if (timeFilterPreset === 'all') return true;

    const date = new Date(dateStr);
    const now = new Date();

    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (timeFilterPreset === 'today') {
      return date >= startOfDay && date <= endOfDay;
    }

    if (timeFilterPreset === 'week') {
      const currentDay = now.getDay();
      const firstDayOfWeek = new Date(startOfDay);
      firstDayOfWeek.setDate(now.getDate() - currentDay);

      const lastDayOfWeek = new Date(endOfDay);
      lastDayOfWeek.setDate(now.getDate() + (6 - currentDay));

      return date >= firstDayOfWeek && date <= lastDayOfWeek;
    }

    if (timeFilterPreset === 'month') {
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return date >= firstDayOfMonth && date <= lastDayOfMonth;
    }

    if (timeFilterPreset === 'custom' && timeFilterStartDate && timeFilterEndDate) {
      const start = new Date(timeFilterStartDate);
      const end = new Date(timeFilterEndDate);
      end.setHours(23, 59, 59, 999);
      return date >= start && date <= end;
    }

    return true;
  };


  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [expandedRoomBookings, setExpandedRoomBookings] = useState<Set<string>>(new Set());
  const [guestShowAll, setGuestShowAll] = useState(false);
  const [guestDateFrom, setGuestDateFrom] = useState('');
  const [guestDateTo, setGuestDateTo] = useState('');
  const [guestSearchQuery, setGuestSearchQuery] = useState('');
  const [reportDateFrom, setReportDateFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; });
  const [reportDateTo, setReportDateTo] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [bookingGroups, setBookingGroups] = useState<BookingGroup[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', contact_name: '', contact_phone: '', contact_email: '', total_rooms: 1, total_guests: 0, notes: '', status: 'pending' as BookingGroup['status'] });
  const [selectedGroup, setSelectedGroup] = useState<BookingGroup | null>(null);

  // Hotel ID (fetched dynamically, falls back to seed)
  const [hotelId, setHotelId] = useState<string>('');

  // Log Pagination
  const [logPage, setLogPage] = useState(0);
  const [logHasMore, setLogHasMore] = useState(true);
  const LOG_PAGE_SIZE = 20;

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (type: ToastMessage['type'], title: string, message: string, action?: ToastMessage['action']) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, title, message, action }]);
  };
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // Dynamic Settings States
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newPaymentOption, setNewPaymentOption] = useState('');

  useEffect(() => {
    const handleSettingsUpdate = () => {
      setSettings(getSettings());
    };
    window.addEventListener('hotel-settings-updated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('hotel-settings-updated', handleSettingsUpdate);
    };
  }, []);
  
  // In-app notification center state
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const addNotification = (notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const id = Math.random().toString(36).slice(2, 10);
    setNotifications(prev => [{ ...notif, id, timestamp: new Date(), read: false }, ...prev].slice(0, 100));
  };
  const markNotifRead = (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllNotifRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const clearNotif = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));
  const clearAllNotif = () => setNotifications([]);

  const shouldProcessRealtimeEvent = (key: string) => {
    const seen = realtimeEventKeysRef.current;
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > 300) {
      const items = Array.from(seen);
      realtimeEventKeysRef.current = new Set(items.slice(items.length - 200));
    }
    return true;
  };
  
  // Safe Dialog Overrides
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    isDangerous?: boolean;
    confirmText?: string;
  } | null>(null);

  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  const triggerConfirm = (title: string, message: string, onConfirm: () => void | Promise<void>, isDangerous = false, confirmText = 'Confirm') => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: async () => {
        await onConfirm();
        setConfirmDialog(null);
      },
      isDangerous,
      confirmText
    });
  };

  const triggerAlert = (title: string, message: string) => {
    setAlertDialog({
      isOpen: true,
      title,
      message
    });
  };

  // New data states for Housekeeping, Promos, Rate Plans, Waitlist
  const [housekeepingTasks, setHousekeepingTasks] = useState<HousekeepingTask[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState({ room_id: '', incident_type: 'damage' as Incident['incident_type'], description: '', cost: 0, billed_to_guest: false });
  const [parkingSpots, setParkingSpots] = useState<ParkingSpot[]>([]);
  const [showParkingModal, setShowParkingModal] = useState(false);
  const [parkingSelectedSpot, setParkingSelectedSpot] = useState<ParkingSpot | null>(null);
  const [parkingAssignBookingId, setParkingAssignBookingId] = useState('');
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(new Set());
  const [showRatePlanModal, setShowRatePlanModal] = useState(false);
  const [ratePlanForm, setRatePlanForm] = useState({ name: '', room_type: '', date_from: '', date_to: '', base_price: 0, min_stay_hours: 3, is_peak: false });
  const [selectedRatePlan, setSelectedRatePlan] = useState<RatePlan | null>(null);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState<PromoCode | null>(null);
  const [promoForm, setPromoForm] = useState({ code: '', description: '', discount_type: 'percentage' as 'percentage' | 'fixed', discount_value: 0, valid_from: '', valid_to: '', usage_limit: 0, min_spend: 0, is_active: true });
  const [guestNotesModal, setGuestNotesModal] = useState<Customer | null>(null);
  const [guestNotesForm, setGuestNotesForm] = useState({ notes: '', preferences: '' });
  const [quickBookRoom, setQuickBookRoom] = useState<Room | null>(null);
  const [quickBookForm, setQuickBookForm] = useState({ guest_name: '', guest_email: '', guest_phone: '', check_in: '', check_out: '', check_in_time: '', check_out_time: '' });
  const [quickBookPromos, setQuickBookPromos] = useState<PromoCode[]>([]);
  const [quickBookSelectedPromo, setQuickBookSelectedPromo] = useState<PromoCode | null>(null);

  // Subscriptions Logs Captured Live
  const [liveChanges, setLiveChanges] = useState<{ id: string; time: string; text: string }[]>([]);

  // CRUD Form States
  const [roomModal, setRoomModal] = useState<'create' | 'edit' | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomForm, setRoomForm] = useState({
    room_number: '',
    type: 'Standard Room',
    description: '',
    price_per_hour: 250,
    max_occupancy: 2,
    min_stay_hours: 3,
    status: 'available' as 'available' | 'booked' | 'reserved' | 'cleaning' | 'maintenance',
    image_url: '',
    check_in_times: [] as string[],
    check_out_times: [] as string[]
  });
  // Booking Edit Status State
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [bookingStatusEdit, setBookingStatusEdit] = useState('');
  const [bookingStaffEdit, setBookingStaffEdit] = useState('');
  // Booking Detail Modal
  const [selectedBookingDetail, setSelectedBookingDetail] = useState<Booking | null>(null);
  const [bookingFilter, setBookingFilter] = useState<string>('all');
  const [bookingSearch, setBookingSearch] = useState('');

  // Employee CRUD states
  const [employeeModal, setEmployeeModal] = useState<'create' | 'edit' | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Profile | null>(null);
  const [employeeForm, setEmployeeForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'staff' as 'admin' | 'front_desk' | 'cook' | 'cleaner' | 'staff' | 'waiter'
  });

  // Inventory CRUD states
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [guestOrders, setGuestOrders] = useState<GuestOrder[]>([]);
  const [staffCalls, setStaffCalls] = useState<StaffCall[]>([]);
  const [stayExtensions, setStayExtensions] = useState<StayExtension[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([]);
  const [selectedChatBooking, setSelectedChatBooking] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [chatSidebarCollapsed, setChatSidebarCollapsed] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, selectedChatBooking]);

  // Typing indicator state
  const [typingUsers, setTypingUsers] = useState<ChatTyping[]>([]);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mark messages as seen when admin opens a conversation (only while on the chat tab)
  useEffect(() => {
    if (!selectedChatBooking || activeTab !== 'front_desk_chat') return;
    const unreadGuestMsgs = chatMessages.filter(
      m => m.booking_id === selectedChatBooking && m.sender_role === 'guest' && !m.seen_at
    );
    if (unreadGuestMsgs.length === 0) return;
    
    const now = new Date().toISOString();
    setChatMessages(prev => prev.map(m => 
      (m.booking_id === selectedChatBooking && m.sender_role === 'guest' && !m.seen_at)
        ? { ...m, seen_at: now }
        : m
    ));

    (async () => {
      for (const msg of unreadGuestMsgs) {
        const { error } = await supabase.from('chat_messages').update({ seen_at: now }).eq('id', msg.id);
        if (error) {
          // console.error('Failed to mark message as seen:', error);
          setChatMessages(prev => prev.map(m => m.id === msg.id ? { ...m, seen_at: null as any } : m));
        }
      }
    })();
  }, [selectedChatBooking, chatMessages, activeTab]);

  // Refresh chat messages when admin navigates to the chat tab
  useEffect(() => {
    if (activeTab === 'front_desk_chat') {
      refreshTable('chat_messages');
    }
  }, [activeTab]);

  // Auto-mark guest messages as read when admin opens the messages tab
  useEffect(() => {
    if (activeTab !== 'messages') return;
    const unread = contactMessages.filter(m => !m.read_at);
    if (unread.length === 0) return;

    const now = new Date().toISOString();
    setContactMessages(prev => prev.map(m => m.read_at ? m : { ...m, read_at: now }));

    (async () => {
      for (const msg of unread) {
        const { error } = await supabase.from('contact_messages').update({ read_at: now }).eq('id', msg.id);
        if (error) {
          // console.error('Failed to mark message as read:', error);
          setContactMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read_at: null as any } : m));
        }
      }
    })();
  }, [activeTab]);

  // Polling fallback for chat messages and contact messages (in case Realtime is not enabled)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshTable('chat_messages');
      refreshTable('contact_messages');
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Real-time subscription for typing indicators
  useEffect(() => {
    const typingChannel = supabase
      .channel('admin-typing-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_typing'
      }, (payload) => {
        const typingData = payload.new as ChatTyping;
        if (typingData.user_role === 'guest') {
          setTypingUsers(prev => {
            const filtered = prev.filter(t => t.user_id !== typingData.user_id);
            if (typingData.is_typing) {
              return [...filtered, typingData];
            }
            return filtered;
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(typingChannel); };
  }, []);

  const [inventoryModal, setInventoryModal] = useState<'category' | 'item' | 'stock' | 'order' | null>(null);
  const [roomOrdersModal, setRoomOrdersModal] = useState<{ roomNumber: string; guestName: string; orders: GuestOrder[] } | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [menuModal, setMenuModal] = useState(false);
  const [menuModalCategory, setMenuModalCategory] = useState('all');
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [newExtensionCount, setNewExtensionCount] = useState(0);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [newMenuCatName, setNewMenuCatName] = useState('');
  const [itemForm, setItemForm] = useState({
    category_id: '',
    name: '',
    description: '',
    price: 0,
    stock_quantity: 0,
    unit: 'piece',
    low_stock_threshold: 5,
    image_url: ''
  });
  const [stockForm, setStockForm] = useState({ quantity: 0, action: 'add' as 'add' | 'remove' });
  const [orderForm, setOrderForm] = useState({ item_id: '', quantity: 1, notes: '' });
  const [itemCategoryFilter, setItemCategoryFilter] = useState('all');
  const [itemSearch, setItemSearch] = useState('');

  // Memoized conversation grouping from chat messages
  const chatConversations = useMemo(() => {
    const convMap = new Map<string, { bookingId: string; lastMsg: ChatMessage; msgCount: number; guestName: string; roomNumber: string; unreadCount: number }>();
    chatMessages.forEach(msg => {
      const bid = msg.booking_id;
      if (!convMap.has(bid)) {
        convMap.set(bid, {
          bookingId: bid,
          lastMsg: msg,
          msgCount: 0,
          unreadCount: 0,
          guestName: msg.bookings?.customers?.full_name || 'Unknown Guest',
          roomNumber: msg.bookings?.rooms?.room_number || 'N/A'
        });
      }
      const entry = convMap.get(bid)!;
      if (new Date(msg.created_at) > new Date(entry.lastMsg.created_at)) {
        entry.lastMsg = msg;
      }
      entry.msgCount++;
      if (msg.sender_role === 'guest' && !msg.seen_at) {
        entry.unreadCount++;
      }
    });
    return Array.from(convMap.values()).sort((a, b) => new Date(b.lastMsg.created_at).getTime() - new Date(a.lastMsg.created_at).getTime());
  }, [chatMessages]);

  // Debounced refetch to avoid excessive database writes
  const debouncedLoadDb = useCallback(
    createDebouncedSync(async () => {
      await loadDatabase();
    }, 2000),
    []
  );

  // Targeted table refresh helpers
  const refreshTable = async (table: string) => {
    try {
      switch (table) {
        case 'rooms':
          const { data: roomsD } = await supabase.from('rooms').select('*, hotels(*)').order('room_number', { ascending: true });
          if (roomsD) setRooms(roomsD);
          break;
        case 'bookings':
          const { data: bookingsD } = await supabase.from('bookings').select('*, rooms(*), customers(*), profiles:users(*)').order('created_at', { ascending: false });
          if (bookingsD) setBookings(bookingsD);
          break;
        case 'users':
          const { data: staffD } = await supabase.from('users').select('*').order('full_name', { ascending: true });
          if (staffD) setEmployees(staffD.filter(p => p.role === 'admin' || p.role === 'front_desk' || p.role === 'cook' || p.role === 'cleaner' || p.role === 'staff' || p.role === 'waiter' || p.role === 'employee'));
          break;
        case 'customers':
          const { data: customersD } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
          if (customersD) setCustomers(customersD);
          break;
        case 'menu_categories':
          const { data: catsD } = await supabase.from('menu_categories').select('*').order('name', { ascending: true });
          if (catsD) setMenuCategories(catsD);
          break;
        case 'inventory_items':
          const { data: itemsD } = await supabase.from('inventory_items').select('*, menu_categories(*)').order('name', { ascending: true });
          if (itemsD) setInventoryItems(itemsD);
          break;
        case 'guest_orders':
          const { data: ordersD } = await supabase.from('guest_orders').select('*, inventory_items(*), bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false });
          if (ordersD) setGuestOrders(ordersD);
          break;
        case 'staff_calls':
          const { data: callsD } = await supabase.from('staff_calls').select('*, bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false });
          if (callsD) setStaffCalls(callsD);
          break;
        case 'stay_extensions':
          const { data: extsD } = await supabase.from('stay_extensions').select('*, bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false });
          if (extsD) setStayExtensions(extsD);
          break;
        case 'chat_messages':
          const { data: chatsD, error: chatsE } = await supabase.from('chat_messages').select('*, bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false });
          if (chatsE) // console.error('chat_messages refresh error:', chatsE);
          if (chatsD) setChatMessages(chatsD);
          break;
        case 'employee_payroll':
          const { data: epD } = await supabase.from('employee_payroll').select('*, users(*)').order('users(full_name)');
          if (epD) setEmployeePayrolls(epD);
          break;
        case 'time_entries':
          const { data: teD } = await supabase.from('time_entries').select('*, users!time_entries_user_id_fkey(*)').order('clock_in', { ascending: false });
          if (teD) setTimeEntries(teD);
          break;
        case 'payroll_periods':
          const { data: ppD } = await supabase.from('payroll_periods').select('*').order('start_date', { ascending: false });
          if (ppD) setPayrollPeriods(ppD);
          break;
        case 'payroll_entries':
          const { data: peD } = await supabase.from('payroll_entries').select('*, payroll_periods(*), users(*)').order('created_at', { ascending: false });
          if (peD) setPayrollEntries(peD);
          break;
        case 'contact_messages':
          const { data: contactsD } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false });
          if (contactsD) setContactMessages(contactsD);
          break;
        case 'activity_logs':
          const { data: logsD } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(LOG_PAGE_SIZE);
          if (logsD) { setLogs(logsD); setLogPage(0); setLogHasMore(logsD.length >= LOG_PAGE_SIZE); }
          break;
        case 'housekeeping_tasks':
          const { data: hkD } = await supabase.from('housekeeping_tasks').select('*, rooms(*), users(*)').order('created_at', { ascending: false });
          if (hkD) setHousekeepingTasks(hkD);
          break;
        case 'promo_codes':
          const { data: pcD } = await supabase.from('promo_codes').select('*').order('created_at', { ascending: false });
          if (pcD) setPromoCodes(pcD);
          break;
        case 'rate_plans':
          const { data: rpD } = await supabase.from('rate_plans').select('*').order('created_at', { ascending: false });
          if (rpD) setRatePlans(rpD);
          break;
        case 'waitlist':
          const { data: wlD } = await supabase.from('waitlist').select('*').order('created_at', { ascending: false });
          if (wlD) setWaitlist(wlD);
          break;
        case 'incidents':
          const { data: incD } = await supabase.from('incidents').select('*, rooms(*)').order('created_at', { ascending: false });
          if (incD) setIncidents(incD);
          break;
        case 'parking_spots':
          const { data: pkD } = await supabase.from('parking_spots').select('*, bookings(*)').order('spot_number', { ascending: true });
          if (pkD) setParkingSpots(pkD);
          break;
    }
    } catch (err: any) {
      // console.error("refreshTable error:", err);
    }
  };

  // Initial Fetcher
  const loadDatabase = async () => {
    setLoading(true);
    try {
      // 0. Fetch hotel ID dynamically
      if (!hotelId) {
        const { data: hotelsD } = await supabase.from('hotels').select('id').limit(1).maybeSingle();
        if (hotelsD) setHotelId(hotelsD.id);
      }

      // Hydrate settings from Supabase (not localStorage)
      const dbSettings = await fetchSettingsFromSupabase();
      const allSlots = generateAllDaySlots();
      if (!dbSettings.checkInTimes?.length) dbSettings.checkInTimes = [...allSlots];
      if (!dbSettings.checkOutTimes?.length) dbSettings.checkOutTimes = [...allSlots];
      setSettings(dbSettings);

      // Hydrate custom holiday calendar configurations
      if (dbSettings.holidays && Array.isArray(dbSettings.holidays)) {
        setHolidays(dbSettings.holidays);
      } else {
        // Default standard regional/hotel holidays
        setHolidays([
          { date: '2026-01-01', name: "New Year's Day", type: 'regular' },
          { date: '2026-05-01', name: "Labor Day", type: 'regular' },
          { date: '2026-06-12', name: "Independence Day", type: 'regular' },
          { date: '2026-11-30', name: "Bonifacio Day", type: 'regular' },
          { date: '2026-12-25', name: "Christmas Day", type: 'regular' },
          { date: '2026-12-30', name: "Rizal Day", type: 'regular' }
        ]);
      }

      if (dbSettings.shiftStartTime) {
        setShiftStartTime(dbSettings.shiftStartTime);
      }

      const [roomsD, bookingsD, staffD, customersD, logsD, categoriesD, itemsD, ordersD, callsD, extsD, chatsD, contactsD, empPayrollsD, timeEntsD, payrollPerD, payrollEntsD, housekeepingTasksD, promoCodesD, ratePlansD, waitlistD, incidentsD, parkingSpotsD] = await Promise.all([
        supabase.from('rooms').select('*, hotels(*)').order('room_number', { ascending: true }),
        supabase.from('bookings').select('*, rooms(*), customers(*), profiles:users(*)').order('created_at', { ascending: false }),
        supabase.from('users').select('*').order('full_name', { ascending: true }),
        supabase.from('customers').select('*').order('created_at', { ascending: false }),
        supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(LOG_PAGE_SIZE),
        supabase.from('menu_categories').select('*').order('name', { ascending: true }),
        supabase.from('inventory_items').select('*, menu_categories(*)').order('name', { ascending: true }),
        supabase.from('guest_orders').select('*, inventory_items(*), bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false }),
        supabase.from('staff_calls').select('*, bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false }),
        supabase.from('stay_extensions').select('*, bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false }),
        supabase.from('chat_messages').select('*, bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false }),
        supabase.from('contact_messages').select('*').order('created_at', { ascending: false }),
        supabase.from('employee_payroll').select('*, users(*)'),
        supabase.from('time_entries').select('*, users!time_entries_user_id_fkey(*)').order('clock_in', { ascending: false }),
        supabase.from('payroll_periods').select('*').order('start_date', { ascending: false }),
        supabase.from('payroll_entries').select('*, payroll_periods(*), users(*)').order('created_at', { ascending: false }),
        supabase.from('housekeeping_tasks').select('*, rooms(*), users(*)').order('created_at', { ascending: false }),
        supabase.from('promo_codes').select('*').order('created_at', { ascending: false }),
        supabase.from('rate_plans').select('*').order('created_at', { ascending: false }),
        supabase.from('waitlist').select('*').order('created_at', { ascending: false }),
        supabase.from('incidents').select('*, rooms(*)').order('created_at', { ascending: false }),
        supabase.from('parking_spots').select('*, bookings(*)').order('spot_number', { ascending: true }),
      ]);

      if (chatsD.error) // console.error('chat_messages initial load error:', chatsD.error);

      if (roomsD.data) setRooms(roomsD.data);
      if (bookingsD.data) setBookings(bookingsD.data);
      if (staffD.data) setEmployees(staffD.data.filter((p: Profile) => p.role === 'admin' || p.role === 'front_desk' || p.role === 'cook' || p.role === 'cleaner' || p.role === 'staff' || p.role === 'waiter' || p.role === 'employee'));
      if (customersD.data) setCustomers(customersD.data);
      if (logsD.data) { setLogs(logsD.data); setLogPage(0); setLogHasMore(logsD.data.length >= LOG_PAGE_SIZE); }
      if (categoriesD.data) setMenuCategories(categoriesD.data);
      if (itemsD.data) setInventoryItems(itemsD.data);
      if (ordersD.data) setGuestOrders(ordersD.data);
      if (callsD.data) setStaffCalls(callsD.data);
      if (extsD.data) setStayExtensions(extsD.data);
      if (chatsD.data) setChatMessages(chatsD.data);
      if (contactsD.data) setContactMessages(contactsD.data);
      if (empPayrollsD.data) setEmployeePayrolls(empPayrollsD.data);
      if (timeEntsD.data) setTimeEntries(timeEntsD.data);
      if (payrollPerD.data) setPayrollPeriods(payrollPerD.data);
      if (payrollEntsD.data) setPayrollEntries(payrollEntsD.data);
      if (empPayrollsD.data) setEmployeePayrolls(empPayrollsD.data);
      if (timeEntsD.data) setTimeEntries(timeEntsD.data);
      if (payrollPerD.data) setPayrollPeriods(payrollPerD.data);
      if (payrollEntsD.data) setPayrollEntries(payrollEntsD.data);
      if (housekeepingTasksD.data) setHousekeepingTasks(housekeepingTasksD.data);
      if (promoCodesD.data) setPromoCodes(promoCodesD.data);
      if (ratePlansD.data) setRatePlans(ratePlansD.data);
      if (waitlistD.data) setWaitlist(waitlistD.data);
      if (incidentsD.data) setIncidents(incidentsD.data);
      if (parkingSpotsD.data) setParkingSpots(parkingSpotsD.data);
      const { data: bookingGroupsD } = await supabase.from('booking_groups').select('*').order('created_at', { ascending: false });
      if (bookingGroupsD) setBookingGroups(bookingGroupsD);
    } catch (err) {
      // console.error("Error loading administrative matrices:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreLogs = async () => {
    const nextPage = logPage + 1;
    const { data: logsD } = await supabase
      .from('activity_logs').select('*')
      .order('created_at', { ascending: false })
      .range(nextPage * LOG_PAGE_SIZE, (nextPage + 1) * LOG_PAGE_SIZE - 1);
    if (logsD) {
      setLogs(prev => [...prev, ...logsD]);
      setLogPage(nextPage);
      setLogHasMore(logsD.length >= LOG_PAGE_SIZE);
    }
  };

  useEffect(() => {
    loadDatabase();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchAccomplishments = async () => {
      try {
        let query = supabase.from('activity_logs').select('*').order('created_at', { ascending: false });
        if (timeFilterUser && timeFilterUser !== 'all') {
          query = query.eq('user_id', timeFilterUser);
        }
        const { data } = await query.limit(500);
        if (data) {
          setWorkforceAccomplishments(data);
        }
      } catch (err) {
        // console.error("fetchAccomplishments error:", err);
      }
    };
    fetchAccomplishments();
  }, [timeFilterUser, activeTab, wfSubTab]);

  useEffect(() => {
    if (!hotelId) return;

    // Polling fallback for staff calls (in case Realtime replication is not enabled for this table)
    const staffCallInterval = setInterval(async () => {
      const { data } = await supabase
        .from('staff_calls')
        .select('*, bookings(*, customers(*), rooms(*))')
        .order('created_at', { ascending: false });
      if (data) setStaffCalls(data);
    }, 30000);

    // Targeted realtime subscriptions per table (avoids single overloaded wildcard on schema)
    const channel = supabase
      .channel('admin-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, async (payload) => {
        setLiveChanges(prev => [{ id: Math.random().toString(), time: new Date().toLocaleTimeString(), text: `BOOKINGS ${payload.eventType}d` }, ...prev].slice(0, 5));
        refreshTable('bookings');
        if (payload.eventType === 'INSERT' && payload.new) {
          try {
            const [custRes, roomRes] = await Promise.all([
              supabase.from('customers').select('full_name').eq('id', (payload.new as any).customer_id).single(),
              supabase.from('rooms').select('room_number').eq('id', (payload.new as any).room_id).single()
            ]);
            addToast('info', 'New Booking', `${custRes.data?.full_name || 'A guest'} booked Suite ${roomRes.data?.room_number || 'unknown'}`);
            addNotification({ type: 'booking', title: 'New Booking', message: `${custRes.data?.full_name || 'A guest'} booked Suite ${roomRes.data?.room_number || 'unknown'}` });
          } catch (_) { /* silent */ }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stay_extensions' }, (payload) => {
        refreshTable('stay_extensions');
        if (payload.eventType === 'INSERT' && payload.new) {
          const ext = payload.new as any;
          setNewExtensionCount(prev => prev + 1);
          supabase.from('bookings').select('*, rooms(room_number), customers(full_name)').eq('id', ext.booking_id).single()
            .then(({ data: b }) => {
              const roomNum = (b as any)?.rooms?.room_number || '?';
              const guestName = (b as any)?.customers?.full_name || 'Guest';
              addToast('info', 'Extension Request', `${guestName} in #${roomNum}${ext.reason ? `: "${ext.reason}"` : ''}`, { label: 'View', onClick: () => setActiveTab('stay_extensions') });
              addNotification({ type: 'extension', title: 'Extension Request', message: `${guestName} in #${roomNum}${ext.reason ? `: "${ext.reason}"` : ''}` });
            });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages' }, (payload) => {
        refreshTable('contact_messages');
        if (payload.eventType === 'INSERT' && payload.new) {
          const msg = payload.new as any;
          addToast('info', 'New Guest Message', `${msg.name} sent a message${msg.subject ? `: ${msg.subject}` : ''}`);
          addNotification({ type: 'message', title: 'New Guest Message', message: `${msg.name} sent a message${msg.subject ? `: ${msg.subject}` : ''}` });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guest_orders' }, (payload) => {
        refreshTable('guest_orders');
        if (payload.eventType === 'INSERT' && payload.new) {
          const order = payload.new as any;
          setNewOrderCount(prev => prev + 1);
          Promise.all([
            supabase.from('inventory_items').select('name').eq('id', order.item_id).single(),
            supabase.from('bookings').select('*, rooms(room_number), customers(full_name)').eq('id', order.booking_id).single()
          ]).then(([itemRes, bookingRes]) => {
            const itemName = (itemRes.data as any)?.name || 'Item';
            const roomNum = (bookingRes.data as any)?.rooms?.room_number || '?';
            const guestName = (bookingRes.data as any)?.customers?.full_name || 'Guest';
            addToast('success', `New Order: ${itemName} x${order.quantity || 1}`, `Room #${roomNum} · ${guestName}`, {
              label: 'View Orders', onClick: async () => {
                addNotification({ type: 'order', title: `New Order: ${itemName}`, message: `x${order.quantity || 1} — Room #${roomNum} · ${guestName}` });
                setActiveTab('inventory');
                const { data: freshOrders } = await supabase.from('guest_orders').select('*, inventory_items(*), bookings(*, customers(*), rooms(*))').eq('booking_id', order.booking_id).order('created_at', { ascending: false });
                if (freshOrders?.length) setRoomOrdersModal({ roomNumber: `Suite ${roomNum}`, guestName, orders: freshOrders as GuestOrder[] });
              }
            });
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_calls' }, (payload) => {
        refreshTable('staff_calls');
        if (payload.eventType === 'INSERT' && payload.new) {
          const call = payload.new as any;
          addToast('info', 'Staff Call', `${call.guest_name || 'A guest'} needs assistance: ${call.reason || 'Help requested'}`);
          addNotification({ type: 'call', title: 'Staff Call', message: `${call.guest_name || 'A guest'} needs assistance${call.reason ? `: ${call.reason}` : ''}` });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries' }, (payload) => {
        refreshTable('time_entries');
        const newEntry = (payload.new || {}) as any;
        const oldEntry = (payload.old || {}) as any;
        const entryId = newEntry.id || oldEntry.id || 'unknown';
        if (payload.eventType === 'INSERT' && newEntry.user_id) {
          if (shouldProcessRealtimeEvent(`attendance:insert:${entryId}`)) {
            supabase.from('users').select('full_name').eq('id', newEntry.user_id).maybeSingle().then(({ data: u }) => {
              const who = u?.full_name || 'A staff member';
              const when = newEntry.clock_in ? new Date(newEntry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : 'now';
              addToast('info', 'Attendance: Clock In', `${who} clocked in at ${when}.`, { label: 'Open Time Tracking', onClick: () => { setActiveTab('workforce'); setWfSubTab('time'); } });
              addNotification({ type: 'info', title: 'Attendance: Clock In', message: `${who} clocked in at ${when}.`, action: () => { setActiveTab('workforce'); setWfSubTab('time'); } });
            });
          }
        }
        if (payload.eventType === 'UPDATE' && newEntry.clock_out && !oldEntry.clock_out) {
          if (shouldProcessRealtimeEvent(`attendance:clockout:${entryId}:${newEntry.clock_out}`)) {
            supabase.from('users').select('full_name').eq('id', newEntry.user_id).maybeSingle().then(({ data: u }) => {
              const who = u?.full_name || 'A staff member';
              const when = newEntry.clock_out ? new Date(newEntry.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : 'now';
              addToast('info', 'Attendance: Clock Out', `${who} clocked out at ${when}.`, { label: 'Open Time Tracking', onClick: () => { setActiveTab('workforce'); setWfSubTab('time'); } });
              addNotification({ type: 'info', title: 'Attendance: Clock Out', message: `${who} clocked out at ${when}.`, action: () => { setActiveTab('workforce'); setWfSubTab('time'); } });
            });
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          const logEntry = payload.new as any;
          const action = (logEntry.action || '').toLowerCase();
          if (shouldProcessRealtimeEvent(`activity:${logEntry.id || ''}`)) {
            if (['login', 'signed in'].includes(action) || ['logout', 'signed out'].includes(action)) {
              const userLabel = logEntry.user_name || 'A user';
              const title = ['login', 'signed in'].includes(action) ? 'Staff Login' : 'Staff Logout';
              addToast('info', title, `${userLabel} ${action}.`, { label: 'Open Audit Logs', onClick: () => setActiveTab('audit_logs') });
              addNotification({ type: 'info', title, message: `${userLabel} ${action}.`, action: () => setActiveTab('audit_logs') });
            }
            if (timeFilterUser === 'all' || logEntry.user_id === timeFilterUser) {
              setWorkforceAccomplishments(prev => [logEntry, ...prev].slice(0, 500));
            }
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const chatMsg = payload.new as any;
        if (chatMsg.sender_role === 'guest') {
          addNotification({ type: 'chat', title: 'New Guest Message', message: `${chatMsg.sender_name || 'Guest'}: ${chatMsg.message?.slice(0, 80)}` });
        }
        if (chatMsg.id) {
          const { data } = await supabase.from('chat_messages').select('*, bookings(*, customers(*), rooms(*))').eq('id', chatMsg.id).maybeSingle();
          if (data) setChatMessages(prev => prev.some(c => c.id === data.id) ? prev : [...prev, data as any]);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
        const updated = payload.new as any;
        setChatMessages(prev => prev.map(m => m.id === updated.id ? { ...m, seen_at: updated.seen_at } : m));
      })
      .subscribe();

    // Guest orders polling fallback (every 3s) when on the Kitchen tab
    const orderPolling = setInterval(() => {
      if (activeTabRef.current === 'inventory') {
        refreshTable('guest_orders');
      }
    }, 15000);

    // Stay extensions polling fallback when on the Extend tab
    const extensionPolling = setInterval(() => {
      if (activeTabRef.current === 'stay_extensions') {
        refreshTable('stay_extensions');
      }
    }, 15000);

    return () => {
      clearInterval(staffCallInterval);
      clearInterval(orderPolling);
      clearInterval(extensionPolling);
      supabase.removeChannel(channel);
    };
  }, [hotelId]);

  // Reset new extension badge and refresh data when admin navigates to Extend tab
  useEffect(() => {
    if (activeTab === 'stay_extensions') {
      setNewExtensionCount(0);
      refreshTable('stay_extensions');
    }
  }, [activeTab]);

  // Reset new order badge when admin navigates to Kitchen tab
  useEffect(() => {
    if (activeTab === 'inventory') {
      setNewOrderCount(0);
    }
  }, [activeTab]);

  // Compute Live Metrics
  const totalRevenue = bookings
    .filter(b => b.status === 'confirmed' || b.status === 'checked-in' || b.status === 'completed')
    .reduce((temp, b) => temp + Number(b.total_price), 0);

  const activeReservations = bookings.filter(b => b.status === 'confirmed').length;
  
  const occupiedCount = rooms.filter(r => r.status === 'booked' || r.status === 'cleaning').length;
  const occupancyPercentage = rooms.length > 0 ? Math.round((occupiedCount / rooms.length) * 100) : 0;

  const reportBookingsFiltered = useMemo(() => {
    if (!reportDateFrom && !reportDateTo) return bookings;
    return bookings.filter(b => {
      const checkIn = new Date(b.check_in_date);
      const from = reportDateFrom ? new Date(reportDateFrom) : new Date(0);
      const to = reportDateTo ? new Date(reportDateTo) : new Date('2099-12-31');
      return checkIn >= from && checkIn <= to;
    });
  }, [bookings, reportDateFrom, reportDateTo]);

  const weeklyOccupancy = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
      const bookedToday = bookings.filter(b =>
        b.check_in_date <= dateStr && b.check_out_date >= dateStr &&
        (b.status === 'checked-in' || b.status === 'confirmed')
      ).length;
      const pct = rooms.length > 0 ? (bookedToday / rooms.length) * 100 : 0;
      days.push({ label: dayLabel, date: dateStr, booked: bookedToday, total: rooms.length, percentage: pct });
    }
    return days;
  }, [bookings, rooms]);

  const averageOccupancy = useMemo(() => {
    if (weeklyOccupancy.length === 0) return 0;
    return weeklyOccupancy.reduce((s, d) => s + d.percentage, 0) / weeklyOccupancy.length;
  }, [weeklyOccupancy]);

  const topSellingItems = useMemo(() => {
    const map = new Map<string, { name: string; category: string; qty: number; revenue: number }>();
    guestOrders.forEach(o => {
      const item = o.inventory_items;
      const name = item?.name || 'Unknown';
      const category = item?.menu_categories?.name || '';
      const existing = map.get(name);
      if (existing) {
        existing.qty += o.quantity || 1;
        existing.revenue += Number(o.total_price);
      } else {
        map.set(name, { name, category, qty: o.quantity || 1, revenue: Number(o.total_price) });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [guestOrders]);

  // Rooms CRUD Handles
  const handleOpenRoomCreate = () => {
    setSelectedRoom(null);
    setRoomForm({
      room_number: '',
      type: settings.layoutCategories[0] || 'Standard Room',
      description: '',
      price_per_hour: 250,
      max_occupancy: 2,
      min_stay_hours: 3,
      status: 'available',
      image_url: '',
      check_in_times: [...(settings.checkInTimes.length > 0 ? settings.checkInTimes : [])] as string[],
      check_out_times: [...(settings.checkOutTimes.length > 0 ? settings.checkOutTimes : [])] as string[]
    });
    setRoomModal('create');
  };

  const handleOpenRoomEdit = (room: Room) => {
    setSelectedRoom(room);
    setRoomForm({
      room_number: room.room_number,
      type: room.type,
      description: room.description,
      price_per_hour: (room as any).price_per_hour ?? (room as any).price_per_night ?? 250,
      max_occupancy: room.max_occupancy,
      min_stay_hours: room.min_stay_hours ?? 3,
      status: room.status,
      image_url: room.image_url || '',
      check_in_times: room.check_in_times || [...(settings.checkInTimes.length > 0 ? settings.checkInTimes : [])],
      check_out_times: room.check_out_times || [...(settings.checkOutTimes.length > 0 ? settings.checkOutTimes : [])]
    });
    setRoomModal('edit');
  };

  const handleRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Validate time slots are configured
      const { check_in_times, check_out_times } = roomForm;
      if (check_in_times.length === 0 || check_out_times.length === 0) {
        triggerAlert('Missing Time Slots', 'Please configure at least one check-in AND one check-out time for this room before saving. Set available times in Room Settings above.');
        return;
      }

      if (!hotelId) {
        triggerAlert('Missing Hotel Record', 'No hotel found in the database. Please run the schema migration first or create a hotel record via the database before adding rooms.');
        return;
      }

      const payload = {
        hotel_id: hotelId,
        room_number: roomForm.room_number.trim(),
        type: roomForm.type,
        description: roomForm.description.trim(),
        price_per_hour: Number(roomForm.price_per_hour),
        max_occupancy: Number(roomForm.max_occupancy),
        min_stay_hours: Number(roomForm.min_stay_hours) || 3,
        status: roomForm.status,
        image_url: roomForm.image_url.trim() || '',
        check_in_times: check_in_times,
        check_out_times: check_out_times
      };

      if (roomModal === 'create') {
        const { data: existing } = await supabase.from('rooms').select('id').eq('room_number', payload.room_number).maybeSingle();
        if (existing) throw new Error(`Room ${payload.room_number} already exists. Please use a different room number.`);

        const { error } = await supabase.from('rooms').insert(payload);
        if (error) throw error;
        
        await supabase.from('activity_logs').insert({
          user_id: userProfile?.id,
          user_name: userProfile?.full_name || 'Admin Specialist',
          action: 'Room Created',
          details: `Room ${payload.room_number} added to portfolio`
        });
        addToast('success', 'Room Created', `Suite ${payload.room_number} added to portfolio.`);
      } else if (roomModal === 'edit' && selectedRoom) {
        const { data: existing } = await supabase.from('rooms').select('id').eq('room_number', payload.room_number).neq('id', selectedRoom.id).maybeSingle();
        if (existing) throw new Error(`Room ${payload.room_number} already exists. Please use a different room number.`);

        const { data: updated, error } = await supabase.from('rooms').update(payload).eq('id', selectedRoom.id).select();
        if (error) throw error;
        if (!updated || updated.length === 0) throw new Error('Save appeared to succeed but no rows were updated —” likely an RLS permissions issue. Try signing out and back in, or re-run the schema migration.');

        await supabase.from('activity_logs').insert({
          user_id: userProfile?.id,
          user_name: userProfile?.full_name || 'Admin Specialist',
          action: 'Room Updated',
          details: `Room ${payload.room_number} updated`
        });
        addToast('success', 'Room Updated', `Suite ${payload.room_number} details saved.`);
      }

      setRoomModal(null);
      await loadDatabase();
    } catch (err: any) {
      triggerAlert("Room Action Failure", err.message);
    }
  };

  const handleRoomDelete = (roomId: string, rNum: string) => {
    triggerConfirm(
      'Delete Room',
      `Are you certain you wish to delete Room ${rNum}? Outstanding bookings linked here might lose references.`,
      async () => {
        try {
          const { data: deleted, error } = await supabase.from('rooms').delete().eq('id', roomId).select();
          if (error) throw error;
          if (!deleted || deleted.length === 0) throw new Error('Room could not be deleted —” either it does not exist or your session lacks permission. Check that your user has a row in public.users with role=admin.');

          await supabase.from('activity_logs').insert({
            user_id: userProfile?.id,
            user_name: userProfile?.full_name || 'Admin Specialist',
            action: 'Room Deleted',
            details: `Room ${rNum} deleted`
          });
          addToast('success', 'Room Deleted', `Suite ${rNum} removed from portfolio.`);

          await loadDatabase();
        } catch (err: any) {
          triggerAlert("Delete Room Error", err.message);
        }
      },
      true,
      'Delete'
    );
  };

  // Suite layout category add with confirmation
  const handleAddCategory = () => {
    const cleanName = newCategoryName.trim();
    if (!cleanName) return;
    if (settings.layoutCategories.includes(cleanName)) {
      triggerAlert('Duplicate Category', 'This category already exists.');
      return;
    }
    triggerConfirm(
      'Add Layout Category',
      `Add "${cleanName}" to suite layout categories? Existing room filters and creation dropdowns will be updated immediately.`,
      async () => {
        const updatedCats = [...settings.layoutCategories, cleanName];
        const updated = { ...settings, layoutCategories: updatedCats };
        setSettings(updated);
        setNewCategoryName('');
        await saveSettings(updated);
        addToast('success', 'Category Added', `"${cleanName}" added to suite layout categories.`);

        try {
          await supabase.from('activity_logs').insert({
            user_id: userProfile?.id,
            user_name: userProfile?.full_name || 'Admin Specialist',
            action: 'Category Added',
            details: `New suite layout category "${cleanName}" was created and registered`
          });
        } catch (logErr) {
          // console.warn('Logging category addition failed:', logErr);
        }
      }
    );
  };

  // Assign staff & modify bookings status
  const handleOpenBookingEdit = (booking: Booking) => {
    setEditingBookingId(booking.id);
    setBookingStatusEdit(booking.status);
    setBookingStaffEdit(booking.assigned_employee_id || '');
    setSelectedBookingDetail(booking);
  };

  const handleBookingUpdateSave = async (booking: Booking) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          status: bookingStatusEdit,
          assigned_employee_id: bookingStaffEdit || null
        })
        .eq('id', booking.id);

      if (error) throw error;

      // Log assignment and status change
      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id,
        user_name: userProfile?.full_name || 'Admin Specialist',
        action: 'Booking Reallocated',
        details: `Booking for ${booking.customers?.full_name} status switched to ${bookingStatusEdit}`
      });

      // Synchronize also linked room status if booking is checked-in or completed!
      if (bookingStatusEdit === 'checked-in') {
        await supabase.from('rooms').update({ status: 'booked' }).eq('id', booking.room_id);
      } else if (bookingStatusEdit === 'completed') {
        await supabase.from('rooms').update({ status: 'cleaning' }).eq('id', booking.room_id);
      } else if (bookingStatusEdit === 'cancelled') {
        await supabase.from('rooms').update({ status: 'available' }).eq('id', booking.room_id);
      }

      setEditingBookingId(null);
      setSelectedBookingDetail(null);
      addToast('success', 'Booking Saved', `Booking for ${booking.customers?.full_name} updated to ${bookingStatusEdit}`);
      await loadDatabase();
    } catch (err: any) {
      triggerAlert("Booking Save Error", err.message);
    }
  };

  // Quick check-in/occupancy toggle for the booking detail modal
  const handleQuickCheckIn = async (booking: Booking) => {
    try {
      const newStatus = booking.status === 'checked-in' ? 'confirmed' : 'checked-in';
      const { error } = await supabase
        .from('bookings')
        .update({ status: newStatus })
        .eq('id', booking.id);

      if (error) throw error;

      // Sync room status
      if (newStatus === 'checked-in') {
        await supabase.from('rooms').update({ status: 'booked' }).eq('id', booking.room_id);
      } else {
        // Reverting —” only set room available if no other checked-in bookings exist for this room
        const otherActive = bookings.filter(b => b.room_id === booking.room_id && b.id !== booking.id && b.status === 'checked-in');
        if (otherActive.length === 0 && booking.rooms?.status !== 'maintenance') {
          await supabase.from('rooms').update({ status: 'available' }).eq('id', booking.room_id);
        }
      }

      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id,
        user_name: userProfile?.full_name || 'Admin Specialist',
        action: newStatus === 'checked-in' ? 'Guest Checked In' : 'Check-In Reverted',
        details: `${booking.customers?.full_name} ${newStatus === 'checked-in' ? 'checked into' : 'reverted check-in for'} Suite ${booking.rooms?.room_number}`
      });

      if (newStatus === 'checked-in') {
        addToast('success', 'Guest Checked In', `${booking.customers?.full_name} is now occupying Suite ${booking.rooms?.room_number}`);
      } else {
        addToast('info', 'Check-In Reverted', `${booking.customers?.full_name} is no longer marked as occupying the room`);
      }

      setSelectedBookingDetail(null);
      await loadDatabase();
    } catch (err: any) {
      triggerAlert("Check-In Error", err.message);
    }
  };

  // Employee CRUD Handles
  const handleOpenEmployeeCreate = () => {
    setSelectedEmployee(null);
    setEmployeeForm({ full_name: '', email: '', password: '', role: 'staff' });
    setEmployeeModal('create');
  };

  const handleOpenEmployeeEdit = (emp: Profile) => {
    setSelectedEmployee(emp);
    setEmployeeForm({ full_name: emp.full_name, email: emp.email, password: '', role: emp.role as 'admin' | 'front_desk' | 'cook' | 'cleaner' | 'staff' | 'waiter' });
    setEmployeeModal('edit');
  };

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (employeeModal === 'create') {
        // Check for existing user by email
        const { data: existing } = await supabase.from('users').select('id').eq('email', employeeForm.email.trim().toLowerCase()).maybeSingle();
        if (existing) throw new Error('A user with this email already exists in the system.');

        if (!employeeForm.password || employeeForm.password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }

        (window as any).__opencode_suppressAuthRedirect = true;
        try {
          // Save the current admin session BEFORE signUp replaces it
          const { data: { session: adminSession } } = await supabase.auth.getSession();
          const adminTokens = adminSession ? { access_token: adminSession.access_token, refresh_token: adminSession.refresh_token } : null;

          // Create the auth user the DB trigger will auto-create the public.users record
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: employeeForm.email.trim().toLowerCase(),
            password: employeeForm.password,
            options: {
              data: {
                full_name: employeeForm.full_name.trim(),
                role: employeeForm.role
              }
            }
          });

          if (authError) throw authError;
          if (!authData.user) throw new Error('Failed to create user account.');

          // Directly insert/upsert the public.users record.
          const { error: upsertError } = await supabase
            .from('users')
            .upsert({
              id: authData.user.id,
              email: employeeForm.email.trim().toLowerCase(),
              full_name: employeeForm.full_name.trim(),
              role: employeeForm.role
            }, { onConflict: 'id' });

          if (upsertError) throw upsertError;

          // Restore the admin session  signUp() auto-switches the session to the new user
          if (adminTokens) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: adminTokens.access_token,
              refresh_token: adminTokens.refresh_token
            });
            if (sessionError) { /* session restore warning suppressed */ }
          }
        } finally {
          (window as any).__opencode_suppressAuthRedirect = false;
        }

        await supabase.from('activity_logs').insert({
          user_id: userProfile?.id,
          user_name: userProfile?.full_name || 'Admin Specialist',
          action: 'Employee Created',
          details: `${employeeForm.full_name} (${employeeForm.role}) added to workforce`
        });

        addToast('success', 'Employee Created', `${employeeForm.full_name} added as ${employeeForm.role}.`);
      } else if (employeeModal === 'edit' && selectedEmployee) {
        const { error } = await supabase
          .from('users')
          .update({ full_name: employeeForm.full_name.trim(), role: employeeForm.role })
          .eq('id', selectedEmployee.id);

        if (error) throw error;

        await supabase.from('activity_logs').insert({
          user_id: userProfile?.id,
          user_name: userProfile?.full_name || 'Admin Specialist',
          action: 'Employee Updated',
          details: `${selectedEmployee.full_name} role changed to ${employeeForm.role}`
        });

        addToast('success', 'Employee Updated', `${employeeForm.full_name} role updated to ${employeeForm.role}.`);
      }

      setEmployeeModal(null);
      await loadDatabase();
    } catch (err: any) {
      triggerAlert("Employee Action Error", err.message);
    }
  };

  const handleEmployeeDelete = (emp: Profile) => {
    triggerConfirm(
      'Remove Employee',
      `Are you sure you want to remove ${emp.full_name} (${emp.role}) from the workforce? This will revoke their portal access. Their existing booking assignments will be unlinked.`,
      async () => {
        try {
          await supabase.from('bookings').update({ assigned_employee_id: null }).eq('assigned_employee_id', emp.id);
          const { error } = await supabase.from('users').delete().eq('id', emp.id);
          if (error) throw error;
          await supabase.from('activity_logs').insert({
            user_id: userProfile?.id,
            user_name: userProfile?.full_name || 'Admin Specialist',
            action: 'Employee Removed',
            details: `${emp.full_name} (${emp.role}) removed from workforce`
          });
          addToast('success', 'Employee Removed', `${emp.full_name} has been removed.`);
          await loadDatabase();
        } catch (err: any) {
          triggerAlert("Delete Error", err.message);
        }
      },
      true,
      'Remove'
    );
  };

  // ===== INVENTORY CRUD HANDLERS =====
  const handleAddMenuCategory = async () => {
    const name = newMenuCatName.trim();
    if (!name) return;
    if (menuCategories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      triggerAlert('Duplicate Category', 'This menu category already exists.');
      return;
    }
    try {
      const { error } = await supabase.from('menu_categories').insert({ name });
      if (error) throw error;
      addToast('success', 'Category Added', `"${name}" menu category created.`);
      setNewMenuCatName('');
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Error', err.message);
    }
  };

  const handleDeleteMenuCategory = (cat: MenuCategory) => {
    triggerConfirm('Delete Category', `Remove "${cat.name}" category? Items in this category will be unlinked.`, async () => {
      try {
        await supabase.from('menu_categories').delete().eq('id', cat.id);
        addToast('success', 'Category Deleted', `"${cat.name}" removed.`);
        await loadDatabase();
      } catch (err: any) {
        triggerAlert('Error', err.message);
      }
    }, true, 'Delete');
  };

  const handleOpenItemCreate = () => {
    setSelectedItem(null);
    setItemForm({ category_id: menuCategories[0]?.id || '', name: '', description: '', price: 0, stock_quantity: 0, unit: 'piece', low_stock_threshold: 5, image_url: '' });
    setInventoryModal('item');
  };

  const handleOpenItemEdit = (item: InventoryItem) => {
    setSelectedItem(item);
    setItemForm({ category_id: item.category_id, name: item.name, description: item.description, price: Number(item.price), stock_quantity: Number(item.stock_quantity), unit: item.unit, low_stock_threshold: Number(item.low_stock_threshold), image_url: item.image_url });
    setInventoryModal('item');
  };

  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        category_id: itemForm.category_id || null,
        name: itemForm.name.trim(),
        description: itemForm.description.trim(),
        price: Number(itemForm.price),
        stock_quantity: Number(itemForm.stock_quantity),
        unit: itemForm.unit.trim() || 'piece',
        low_stock_threshold: Number(itemForm.low_stock_threshold),
        image_url: itemForm.image_url.trim()
      };

      if (selectedItem) {
        const { error } = await supabase.from('inventory_items').update(payload).eq('id', selectedItem.id);
        if (error) throw error;
        addToast('success', 'Item Updated', `${payload.name} updated.`);
      } else {
        const { error } = await supabase.from('inventory_items').insert(payload);
        if (error) throw error;
        addToast('success', 'Item Created', `${payload.name} added to inventory.`);
      }

      setInventoryModal(null);
      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id,
        user_name: userProfile?.full_name || 'Admin',
        action: selectedItem ? 'Inventory Updated' : 'Inventory Created',
        details: `${payload.name} ${selectedItem ? 'updated' : 'added'}`
      });
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Error', err.message);
    }
  };

  const handleDeleteInventoryItem = (item: InventoryItem) => {
    triggerConfirm('Delete Item', `Remove "${item.name}" from inventory?`, async () => {
      try {
        await supabase.from('inventory_items').delete().eq('id', item.id);
        addToast('success', 'Item Deleted', `${item.name} removed.`);
        await loadDatabase();
      } catch (err: any) {
        triggerAlert('Error', err.message);
      }
    }, true, 'Delete');
  };

  const handleOpenStockAdjust = (item: InventoryItem) => {
    setSelectedItem(item);
    setStockForm({ quantity: 0, action: 'add' });
    setInventoryModal('stock');
  };

  const handleStockAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || stockForm.quantity <= 0) return;
    try {
      const delta = stockForm.action === 'add' ? stockForm.quantity : -stockForm.quantity;
      const newQty = Number(selectedItem.stock_quantity) + delta;
      if (newQty < 0) throw new Error('Stock cannot go below 0.');

      const { error } = await supabase.from('inventory_items').update({ stock_quantity: newQty }).eq('id', selectedItem.id);
      if (error) throw error;

      addToast('success', 'Stock Updated', `${selectedItem.name} stock ${stockForm.action === 'add' ? 'increased' : 'reduced'} by ${stockForm.quantity}.`);
      setInventoryModal(null);
      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id,
        user_name: userProfile?.full_name || 'Admin',
        action: 'Stock Adjusted',
        details: `${selectedItem.name}: ${stockForm.action === 'add' ? '+' : '-'}${stockForm.quantity} (now ${newQty})`
      });
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Stock Error', err.message);
    }
  };

  // Guest order placement
  const handleOpenOrderCreate = (booking: Booking) => {
    setSelectedBookingDetail(booking);
    setOrderForm({ item_id: inventoryItems[0]?.id || '', quantity: 1, notes: '' });
    setInventoryModal('order');
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookingDetail) return;
    try {
      const item = inventoryItems.find(i => i.id === orderForm.item_id);
      if (!item) throw new Error('Select a menu item.');
      if (Number(item.stock_quantity) < orderForm.quantity) {
        throw new Error(`Insufficient stock: only ${item.stock_quantity} ${item.unit}(s) available.`);
      }
      const totalPrice = Number(item.price) * orderForm.quantity;

      const { error } = await supabase.from('guest_orders').insert({
        booking_id: selectedBookingDetail.id,
        item_id: orderForm.item_id,
        quantity: orderForm.quantity,
        unit_price: Number(item.price),
        total_price: totalPrice,
        status: 'pending',
        notes: orderForm.notes.trim()
      });
      if (error) throw error;

      // Deduct stock
      const newQty = Number(item.stock_quantity) - orderForm.quantity;
      await supabase.from('inventory_items').update({ stock_quantity: newQty }).eq('id', item.id);

      addToast('success', 'Order Placed', `${item.name} x${orderForm.quantity} added to booking.`);
      setInventoryModal(null);
      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id,
        user_name: userProfile?.full_name || 'Admin',
        action: 'Guest Order Placed',
        details: `${item.name} x${orderForm.quantity} for ${selectedBookingDetail.customers?.full_name}`
      });
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Order Error', err.message);
    }
  };

  const handleUpdateOrderStatus = async (order: GuestOrder, newStatus: string) => {
    // Show confirmation with old vs new status
    triggerConfirm(
      'Update Order Status',
      `Item: ${order.inventory_items?.name || 'Unknown'} x${order.quantity} | ${settings.currencySymbol}${Number(order.total_price).toFixed(2)}
Current status: ${order.status}
New status: ${newStatus}

Confirm this change?`,
      async () => {
        try {
          const { error } = await supabase.from('guest_orders').update({ status: newStatus }).eq('id', order.id);
          if (error) throw error;
          addToast('success', 'Order Updated', `Order status changed from ${order.status} to ${newStatus}.`);

          // Send chat notification to guest about order status update
          const statusMessages: Record<string, string> = {
            'preparing': 'Your order is being prepared! ðŸ”ª',
            'served': 'Your order has been served! Enjoy! 🍽️',
            'cancelled': 'Your order has been cancelled. —Œ',
            'pending': 'Your order is pending. —³'
          };
          const chatMsg = statusMessages[newStatus] || `Your order status updated to: ${newStatus}`;
          try {
            await supabase.from('chat_messages').insert({
              booking_id: order.booking_id,
              sender_id: userProfile?.id,
              sender_name: userProfile?.full_name || 'Front Desk',
              sender_role: 'staff',
              message: `${chatMsg} —” ${order.inventory_items?.name || 'Item'} x${order.quantity}`
            });
          } catch (chatErr) {
            // console.warn('Failed to send order status chat:', chatErr);
          }

          await loadDatabase();
        } catch (err: any) {
          triggerAlert('Error', err.message);
        }
      },
      false,
      'Confirm Update'
    );
  };

  // Payroll CRUD Handlers
  const handleOpenEmployeePayroll = (empId: string) => {
    setSelectedPayrollEmp(empId);
    const existing = employeePayrolls.find(ep => ep.user_id === empId);
    if (existing) {
      setPayrollRateForm({
        hourly_rate: Number(existing.hourly_rate),
        overtime_rate: Number(existing.overtime_rate),
        pay_frequency: existing.pay_frequency,
        employment_type: existing.employment_type,
        hire_date: existing.hire_date || '',
        tax_id: existing.tax_id,
        bank_account: existing.bank_account,
        remarks: existing.remarks
      });
    } else {
      setPayrollRateForm({ hourly_rate: 0, overtime_rate: 0, pay_frequency: 'weekly', employment_type: 'regular', hire_date: new Date().toISOString().slice(0, 10), tax_id: '', bank_account: '', remarks: '' });
    }
    setPayrollModal('payroll');
  };

  const handleSaveEmployeePayroll = async () => {
    if (!selectedPayrollEmp) return;
    try {
      const { error } = await supabase.from('employee_payroll').upsert({
        user_id: selectedPayrollEmp,
        hourly_rate: Number(payrollRateForm.hourly_rate),
        overtime_rate: Number(payrollRateForm.overtime_rate),
        pay_frequency: payrollRateForm.pay_frequency,
        employment_type: payrollRateForm.employment_type,
        hire_date: payrollRateForm.hire_date || null,
        tax_id: payrollRateForm.tax_id,
        bank_account: payrollRateForm.bank_account,
        remarks: payrollRateForm.remarks
      }, { onConflict: 'user_id' });
      if (error) throw error;
      addToast('success', 'Payroll Saved', 'Employee payroll settings updated.');
      setPayrollModal(null);
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Payroll Error', err.message);
    }
  };

  const openPeriodModal = (cutoff: 'semi-monthly-first' | 'semi-monthly-second') => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthName = now.toLocaleString('default', { month: 'long' });
    if (cutoff === 'semi-monthly-first') {
      setPeriodForm({
        cutoff_type: 'semi-monthly-first',
        name: `1st Half - ${monthName} ${year}`,
        start_date: `${year}-${String(month + 1).padStart(2, '0')}-01`,
        end_date: `${year}-${String(month + 1).padStart(2, '0')}-15`,
      });
    } else {
      const lastDay = new Date(year, month + 1, 0).getDate();
      setPeriodForm({
        cutoff_type: 'semi-monthly-second',
        name: `2nd Half - ${monthName} ${year}`,
        start_date: `${year}-${String(month + 1).padStart(2, '0')}-16`,
        end_date: `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      });
    }
    setPeriodModalOpen(true);
  };

  const handleCreatePayrollPeriod = async () => {
    if (!periodForm.name || !periodForm.start_date || !periodForm.end_date) {
      triggerAlert('Validation Error', 'Please fill in all fields.');
      return;
    }
    const overlap = payrollPeriods.find(p =>
      (periodForm.start_date >= p.start_date && periodForm.start_date <= p.end_date) ||
      (periodForm.end_date >= p.start_date && periodForm.end_date <= p.end_date) ||
      (periodForm.start_date <= p.start_date && periodForm.end_date >= p.end_date)
    );
    if (overlap) {
      triggerAlert('Overlap Detected', `This period overlaps with "${overlap.name}" (${new Date(overlap.start_date).toLocaleDateString()} - ${new Date(overlap.end_date).toLocaleDateString()}).`);
      return;
    }
    try {
      const { error } = await supabase.from('payroll_periods').insert({
        name: periodForm.name, start_date: periodForm.start_date, end_date: periodForm.end_date, status: 'pending'
      });
      if (error) throw error;
      addToast('success', 'Period Created', `Payroll period "${periodForm.name}" created.`);
      setPeriodModalOpen(false);
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Period Error', err.message);
    }
  };

  const handleProcessPayrollPeriod = async (periodId: string) => {
    // Math helper to compute Philippine statutory deductions for semi-monthly pay periods
    const calculateAutomaticDeductions = (gross: number) => {
      const sssVal = Math.round(Math.min(675, gross * 0.045) * 100) / 100;
      const philhealthVal = Math.round(Math.min(500, gross * 0.025) * 100) / 100;
      const pagibigVal = Math.round(Math.min(100, gross * 0.02) * 100) / 100;

      // Withholding Tax simplified bracket for semi-monthly payouts (exemption <= 10,417 PHP)
      let taxVal = 0;
      if (gross > 33333) {
        taxVal = 4270.83 + (gross - 33333) * 0.25;
      } else if (gross > 16667) {
        taxVal = 937.50 + (gross - 16667) * 0.20;
      } else if (gross > 10417) {
        taxVal = (gross - 10417) * 0.15;
      }
      taxVal = Math.round(taxVal * 100) / 100;

      const totalD = Math.round((sssVal + philhealthVal + pagibigVal + taxVal) * 100) / 100;
      const netP = Math.round(Math.max(0, gross - totalD) * 100) / 100;

      return { sss: sssVal, philhealth: philhealthVal, pagibig: pagibigVal, tax: taxVal, total: totalD, net: netP };
    };

    triggerConfirm('Process Payroll', 'This will calculate Gross Pay and Automatic Statutory Deductions (SSS, PhilHealth, Pag-IBIG, and withholding Tax) for all employees with timesheets in this period. Continue?', async () => {
      try {
        await supabase.from('payroll_periods').update({ status: 'processing' }).eq('id', periodId);
        const period = payrollPeriods.find(p => p.id === periodId);
        if (!period) throw new Error('Period not found.');
        const { data: entries } = await supabase
          .from('time_entries')
          .select('*, users(*)')
          .gte('clock_in', period.start_date)
          .lte('clock_in', period.end_date + 'T23:59:59');
        if (entries) {
          const userHours: Record<string, { regular: number; overtime: number }> = {};
          for (const entry of entries) {
            if (!entry.total_hours) continue;
            if (!userHours[entry.user_id]) userHours[entry.user_id] = { regular: 0, overtime: 0 };
            
            // Accurately split hours on a daily/shift basis
            const shiftTotal = Number(entry.total_hours || 0);
            const shiftRegular = Math.min(8, shiftTotal);
            const shiftOvertime = Math.max(0, shiftTotal - 8);

            userHours[entry.user_id].regular += shiftRegular;
            userHours[entry.user_id].overtime += shiftOvertime;
          }
          for (const [userId, hours] of Object.entries(userHours)) {
            const payroll = employeePayrolls.find(ep => ep.user_id === userId);
            const hrRate = payroll ? Number(payroll.hourly_rate) : 0;
            const otRate = payroll ? Number(payroll.overtime_rate) : 0;
            const grossPay = Math.round(((hours.regular * hrRate) + (hours.overtime * otRate)) * 100) / 100;

            const stats = calculateAutomaticDeductions(grossPay);

            const initialNotesPayload = {
              itemized: true,
              allowances: {
                allowance: 0,
                bonus: 0
              },
              deductions: {
                sss: stats.sss,
                philhealth: stats.philhealth,
                pagibig: stats.pagibig,
                tax: stats.tax,
                other: 0
              },
              customNotes: "Automatically processed with standard statutory ranges."
            };

            await supabase.from('payroll_entries').upsert({
              period_id: periodId, user_id: userId,
              total_regular_hours: hours.regular, total_overtime_hours: hours.overtime,
              hourly_rate: hrRate, overtime_rate: otRate,
              gross_pay: grossPay, deductions: stats.total, net_pay: stats.net,
              notes: JSON.stringify(initialNotesPayload),
              status: 'pending'
            }, { onConflict: 'period_id,user_id' });
          }
        }
        await supabase.from('payroll_periods').update({
          status: 'completed', processed_at: new Date().toISOString(), processed_by: userProfile?.id
        }).eq('id', periodId);
        addToast('success', 'Payroll Processed', 'Payroll period calculated successfully.');
        await loadDatabase();
      } catch (err: any) {
        triggerAlert('Processing Error', err.message);
      }
    }, false, 'Process');
  };

  const handleUpdatePayrollEntryStatus = async (entryId: string, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'paid') updateData.paid_at = new Date().toISOString();
      const { error } = await supabase.from('payroll_entries').update(updateData).eq('id', entryId);
      if (error) throw error;
      addToast('success', 'Entry Updated', 'Payroll entry status changed to ' + newStatus + '.');
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Update Error', err.message);
    }
  };

  const handleOpenPayslip = (entry: PayrollEntry) => {
    let pNotes: any = null;
    try {
      if (entry.notes && entry.notes.trim().startsWith('{')) {
        pNotes = JSON.parse(entry.notes);
      }
    } catch (err) {}

    setPayslipForm({
      regHours: Number(entry.total_regular_hours || 0),
      otHours: Number(entry.total_overtime_hours || 0),
      hrRate: Number(entry.hourly_rate || 0),
      otRate: Number(entry.overtime_rate || 0),
      sss: pNotes?.deductions?.sss || 0,
      philhealth: pNotes?.deductions?.philhealth || 0,
      pagibig: pNotes?.deductions?.pagibig || 0,
      tax: pNotes?.deductions?.tax || 0,
      otherDeductions: pNotes?.deductions?.other || 0,
      allowance: pNotes?.allowances?.allowance || 0,
      bonus: pNotes?.allowances?.bonus || 0,
      customNotes: pNotes?.customNotes || (entry.notes && !entry.notes.trim().startsWith('{') ? entry.notes : '')
    });
    setIsEditingPayslipEntry(false);
    setViewPayslipEntry(entry);
  };

  const handleSavePayslipAdjustments = async () => {
    if (!viewPayslipEntry) return;

    try {
      const baseEarnings = Number(payslipForm.regHours) * Number(payslipForm.hrRate);
      const otEarnings = Number(payslipForm.otHours) * Number(payslipForm.otRate);
      const otherEarnings = Number(payslipForm.allowance) + Number(payslipForm.bonus);
      const calculatedGross = baseEarnings + otEarnings + otherEarnings;

      const totalDeductions = Number(payslipForm.sss) + Number(payslipForm.philhealth) + Number(payslipForm.pagibig) + Number(payslipForm.tax) + Number(payslipForm.otherDeductions);
      const calculatedNet = Math.max(0, calculatedGross - totalDeductions);

      const breakdownPayload = {
        itemized: true,
        allowances: {
          allowance: Number(payslipForm.allowance),
          bonus: Number(payslipForm.bonus)
        },
        deductions: {
          sss: Number(payslipForm.sss),
          philhealth: Number(payslipForm.philhealth),
          pagibig: Number(payslipForm.pagibig),
          tax: Number(payslipForm.tax),
          other: Number(payslipForm.otherDeductions)
        },
        customNotes: payslipForm.customNotes.trim()
      };

      const { data, error } = await supabase.from('payroll_entries').update({
        total_regular_hours: Number(payslipForm.regHours),
        total_overtime_hours: Number(payslipForm.otHours),
        hourly_rate: Number(payslipForm.hrRate),
        overtime_rate: Number(payslipForm.otRate),
        gross_pay: Math.round(calculatedGross * 100) / 100,
        deductions: Math.round(totalDeductions * 100) / 100,
        net_pay: Math.round(calculatedNet * 100) / 100,
        notes: JSON.stringify(breakdownPayload)
      }).eq('id', viewPayslipEntry.id).select().single();

      if (error) throw error;

      addToast('success', 'Payroll Entry Updated', 'Direct adjustments saved successfully.');
      setIsEditingPayslipEntry(false);
      
      // Update local view item
      if (data) setViewPayslipEntry(data as PayrollEntry);
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Save Error', err.message || 'Failed to save updates');
    }
  };

  const handleSaveTimeEntry = async () => {
    if (!manualTimeForm.userId || !manualTimeForm.clockIn) {
      triggerAlert('Validation Error', 'Employee staff and a valid Clock In datetime are required.');
      return;
    }

    try {
      const inDate = new Date(manualTimeForm.clockIn);
      let outIsoStr: string | null = null;
      let computedHours = 0;

      if (manualTimeForm.clockOut) {
        const outDate = new Date(manualTimeForm.clockOut);
        if (outDate < inDate) {
          triggerAlert('Validation Error', 'Clock Out cannot be earlier than Clock In.');
          return;
        }
        outIsoStr = outDate.toISOString();
        const diffMs = outDate.getTime() - inDate.getTime();
        const grossHrs = diffMs / (1000 * 60 * 60);
        const deductionHrs = (manualTimeForm as any).mealBreakTaken ? (Number((manualTimeForm as any).mealBreakDuration || 0) / 60) : 0;
        computedHours = Math.max(0, grossHrs - deductionHrs);
        computedHours = Math.round(computedHours * 10) / 10;
      }

      // Pack structured attendance specifications into metadata JSON block within the notes field
      const meta = {
        is_attendance_meta: true,
        status: manualTimeForm.status,
        is_holiday: manualTimeForm.isHoliday,
        holiday_name: manualTimeForm.holidayName,
        remarks: manualTimeForm.remarks,
        meal_break_taken: !!(manualTimeForm as any).mealBreakTaken,
        meal_break_duration: (manualTimeForm as any).mealBreakTaken ? Number((manualTimeForm as any).mealBreakDuration || 0) : 0
      };

      const payload = {
        user_id: manualTimeForm.userId,
        clock_in: inDate.toISOString(),
        clock_out: outIsoStr,
        total_hours: computedHours > 0 ? computedHours : null,
        is_overtime: computedHours > 8,
        notes: JSON.stringify(meta)
      };

      if (editingTimeEntry) {
        // Update existing log
        const { error } = await supabase.from('time_entries').update(payload).eq('id', editingTimeEntry.id);
        if (error) throw error;
        addToast('success', 'Timesheet Updated', 'Clock record corrected successfully.');
      } else {
        // Create new log
        const { error } = await supabase.from('time_entries').insert(payload);
        if (error) throw error;
        addToast('success', 'Timesheet Created', 'Manual check-in record registered.');
      }

      setTimeEntryModalOpen(false);
      setEditingTimeEntry(null);
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Execution Database Error', err.message);
    }
  };

  const handleDeleteTimeEntry = async (entryId: string) => {
    triggerConfirm('Delete Entry', 'This will permanently remove this clocking log. Continue?', async () => {
      try {
        const { error } = await supabase.from('time_entries').delete().eq('id', entryId);
        if (error) throw error;
        addToast('success', 'Entry Deleted', 'Record removed.');
        setTimeEntryModalOpen(false);
        setEditingTimeEntry(null);
        await loadDatabase();
      } catch (err: any) {
        triggerAlert('Error', err.message);
      }
    });
  };

  // Low-stock check helper
  const lowStockItems = inventoryItems.filter(i => Number(i.stock_quantity) <= Number(i.low_stock_threshold));

  // Export orders helper

  const handleExportOrders = () => {
    exportOrdersToPDF(guestOrders, settings.currencySymbol);
  };

  const handleExportAttendancePDF = (entries: any[]) => {
    try {
      exportAttendanceToPDF(entries, settings.currencySymbol);
      addToast('success', 'PDF Generated', 'Attendance PDF report downloaded successfully.');
    } catch (e: any) {
      triggerAlert('Export Error', e.message);
    }
  };

  const handleExportAttendanceCSV = (entries: any[]) => {
    try {
      const data = entries.map(e => {
        let status = 'Present';
        let isHoliday = 'No';
        let holidayName = '';
        let remarks = '';
        if (e.notes?.trim().startsWith('{')) {
          try {
            const p = JSON.parse(e.notes);
            if (p?.is_attendance_meta) {
              status = p.status || 'Present';
              isHoliday = p.is_holiday ? 'Yes' : 'No';
              holidayName = p.holiday_name || '';
              remarks = p.remarks || '';
            }
          } catch (err) {}
        } else {
          remarks = e.notes || '';
        }
        return {
          'Employee Name': e.users?.full_name || e.users?.email || 'Unknown',
          'Role': e.users?.role || '',
          'Clock In': new Date(e.clock_in).toLocaleString(),
          'Clock Out': e.clock_out ? new Date(e.clock_out).toLocaleString() : 'Active',
          'Worked Hours': e.total_hours ? Number(e.total_hours).toFixed(2) : '—',
          'Attendance Status': status,
          'Is Holiday': isHoliday,
          'Holiday Name': holidayName,
          'Remarks / Notes': remarks
        };
      });
      exportToCSV(data, `workforce_attendance_${new Date().toISOString().slice(0, 10)}.csv`);
      addToast('success', 'CSV Exported', 'Attendance spreadsheet downloaded.');
    } catch (e: any) {
      triggerAlert('Export Error', e.message);
    }
  };

  const handleSaveAttendanceSettings = async (updatedHolidays: any[], updatedShiftIn: string) => {
    try {
      const up = {
        ...settings,
        holidays: updatedHolidays,
        shiftStartTime: updatedShiftIn
      };
      await saveSettings(up);
      setSettings(up);
      setHolidays(updatedHolidays);
      setShiftStartTime(updatedShiftIn);
      addToast('success', 'Configurations Persistent', 'Hotel holiday schedule and shift starting boundaries set successfully.');
    } catch (e: any) {
      triggerAlert('Setting Error', e.message);
    }
  };

  const sidebarBadges: Record<string, number> = {
    inventory: newOrderCount,
    staff_calls: staffCalls.filter(c => c.status === 'pending').length,
    stay_extensions: stayExtensions.filter(e => e.status === 'pending').length + newExtensionCount,
    front_desk_chat: chatMessages.filter(m => m.sender_role === 'guest' && !m.seen_at).length,
    messages: contactMessages.filter(m => !m.read_at).length,
  };

  return (
    <div className="min-h-screen bg-surface-50 text-surface-800 font-sans tracking-tight flex flex-col">

      <BrandBar
        settings={settings}
        userFullName={userProfile?.full_name || 'Admin'}
        userRole={userProfile?.role || 'admin'}

        onLogout={onLogout}
        extraActions={
          <>
            <NotificationBell
              notifications={notifications}
              onMarkRead={markNotifRead}
              onMarkAllRead={markAllNotifRead}
              onClear={clearNotif}
              onClearAll={clearAllNotif}
            />
            <button
              onClick={loadDatabase}
              className="p-2 text-surface-400 hover:text-surface-800:text-surface-200 hover:bg-surface-50:bg-surface-800 rounded-lg transition-colors cursor-pointer"
              title="Refresh data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          badges={sidebarBadges}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(p => !p)}
        />

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="space-y-6 animate-pulse">
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl p-5 border border-surface-100 shadow-sm">
                    <div className="h-4 bg-surface-200 rounded w-1/2 mb-3" />
                    <div className="h-8 bg-surface-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-surface-100 rounded w-1/3" />
                  </div>
                ))}
              </div>
              <div className="grid md:grid-cols-3 gap-8">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-surface-100 shadow-sm p-6">
                    <div className="h-4 bg-surface-200 rounded w-1/3 mb-4" />
                    <div className="space-y-3">{[...Array(4)].map((_, j) => (<div key={j} className="h-3 bg-surface-100 rounded w-full" />))}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* TABS 1: INSIGHTS OVERVIEW */}
              {activeTab === 'insights' && (
                <div className="space-y-6">
                  {/* BENTO GRID CONTAINER */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5 auto-rows-auto">
                    
                    {/* BENTO CARD 1: MAIN REVENUE METRIC */}
                    <div className="col-span-1 md:col-span-4 bg-white rounded-3xl p-6 border border-surface-200/60 shadow-xs flex flex-col justify-between hover:shadow-card-hover hover:border-brand-300 transition-all duration-300 group">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                            <DollarSign className="w-5 h-5 animate-pulse" />
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">+12% MoM</span>
                        </div>
                        <span className="text-[11px] text-surface-400 font-bold uppercase tracking-wider block">Gross Revenue</span>
                        <h3 className="text-3xl font-black text-surface-900 mt-1 tracking-tight">
                          {settings.currencySymbol}{totalRevenue.toLocaleString()} <span className="text-xs text-surface-400 font-bold tracking-normal">{settings.currencyCode}</span>
                        </h3>
                      </div>
                      <div className="mt-5">
                        <div className="flex justify-between text-[10px] text-surface-400 mb-1 font-bold uppercase tracking-wider">
                          <span>Progress Target</span>
                          <span>{Math.round(Math.min(100, (totalRevenue / 100000) * 100))}%</span>
                        </div>
                        <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (totalRevenue / 100000) * 100)}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* BENTO CARD 2: ACTIVE RESERVATIONS & BOOKINGS LIST */}
                    <div className="col-span-1 md:col-span-4 bg-white rounded-3xl p-6 border border-surface-200/60 shadow-xs flex flex-col justify-between hover:shadow-card-hover hover:border-brand-300 transition-all duration-300 group">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="p-3 bg-brand-50 text-brand-600 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-100">{bookings.length} total</span>
                        </div>
                        <span className="text-[11px] text-surface-400 font-bold uppercase tracking-wider block">Active Reservations</span>
                        <h3 className="text-3xl font-black text-surface-900 mt-1 tracking-tight">{activeReservations}</h3>
                      </div>
                      
                      {/* RECENT BOOKINGS LIST COMPATIBLE WITH BENTO STYLE */}
                      <div className="mt-4 pt-4 border-t border-surface-100 space-y-2">
                        <span className="text-[9px] font-bold text-surface-400 uppercase tracking-widest block">Recent Stays</span>
                        {bookings.slice(0, 3).map((b, i) => (
                          <div key={b.id || i} className="flex items-center justify-between gap-2 p-1.5 hover:bg-surface-50 rounded-xl transition-all">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center font-bold text-[10px] text-surface-600 uppercase">
                                {(b.customers?.full_name || 'G')[0]}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-black text-surface-880 truncate">{b.customers?.full_name || 'Guest'}</p>
                                <p className="text-[8px] text-surface-400 font-medium font-mono">Room {b.rooms?.room_number}</p>
                              </div>
                            </div>
                            <span className="text-[8px] font-bold uppercase py-0.5 px-1.5 rounded-md bg-brand-50 text-brand-700">{b.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* BENTO CARD 3: OCCUPANCY RATE PROGRESS WITH ROOM COUNTERS */}
                    <div className="col-span-1 md:col-span-4 bg-white rounded-3xl p-6 border border-surface-200/60 shadow-xs flex flex-col justify-between hover:shadow-card-hover hover:border-brand-300 transition-all duration-300 group">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                            <Building className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full border border-sky-100">{rooms.length} total</span>
                        </div>
                        <span className="text-[11px] text-surface-400 font-bold uppercase tracking-wider block">Occupancy Rate</span>
                        <h3 className="text-3xl font-black text-surface-900 mt-1 tracking-tight">{occupancyPercentage}%</h3>
                      </div>
                      
                      <div className="mt-5">
                        <div className="flex justify-between text-[10px] font-bold mb-1">
                          <span className="text-surface-400 uppercase tracking-wider">Occupied Rooms</span>
                          <span className="text-surface-600">{occupiedCount} / {rooms.length}</span>
                        </div>
                        <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${occupancyPercentage > 80 ? 'bg-rose-500' : occupancyPercentage > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${occupancyPercentage}%` }} />
                        </div>
                        <p className="text-[9px] text-surface-400 mt-2 font-medium">Auto-calculated live according to check-in/room rosters</p>
                      </div>
                    </div>

                    {/* BENTO CARD 4: ACTIONS AND SYSTEM ALERTS PANEL */}
                    <div className="col-span-1 md:col-span-8 bg-white rounded-3xl p-6 border border-surface-200/60 shadow-xs hover:shadow-card-hover transition-all duration-300 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-4 border-b border-surface-100 pb-3">
                          <div>
                            <h3 className="text-sm font-black text-surface-900 tracking-tight">Control Panel & Workspace Alerts</h3>
                            <p className="text-[10px] text-surface-400 font-semibold uppercase tracking-wider">PMS Quick Operations hub</p>
                          </div>
                          
                          {/* SYSTEM ALERTS */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {staffCalls.filter(c => c.status === 'pending').length > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 border border-rose-200 rounded-full text-[10px] font-black text-rose-700 animate-pulse">
                                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                                {staffCalls.filter(c => c.status === 'pending').length} Call Alerts
                              </span>
                            )}
                            {stayExtensions.filter(e => e.status === 'pending').length > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-black text-amber-700">
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                                {stayExtensions.filter(e => e.status === 'pending').length} Stay Extensions
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <button onClick={() => setActiveTab('rooms')} className="p-3 bg-surface-50 hover:bg-surface-100 text-surface-700 hover:text-surface-900 border border-surface-200/50 rounded-2xl text-[11px] font-bold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer">
                            <Plus className="w-4 h-4 text-surface-500" />
                            <span>Add New Room</span>
                          </button>
                          <button onClick={() => setActiveTab('bookings')} className="p-3 bg-surface-50 hover:bg-surface-100 text-surface-700 hover:text-surface-900 border border-surface-200/50 rounded-2xl text-[11px] font-bold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer">
                            <BookOpen className="w-4 h-4 text-brand-500" />
                            <span>View Bookings</span>
                          </button>
                          <button onClick={() => setActiveTab('staff_calls')} className="p-3 bg-surface-50 hover:bg-surface-100 text-surface-700 hover:text-surface-900 border border-surface-200/50 rounded-2xl text-[11px] font-bold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer relative">
                            <Bell className="w-4 h-4 text-amber-500" />
                            <span>Staff Assistance</span>
                            {staffCalls.filter(c => c.status === 'pending').length > 0 && (
                              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full" />
                            )}
                          </button>
                          <button onClick={() => setActiveTab('messages')} className="p-3 bg-surface-50 hover:bg-surface-100 text-surface-700 hover:text-surface-900 border border-surface-200/50 rounded-2xl text-[11px] font-bold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer flex-row gap-2">
                            <Mail className="w-4 h-4 text-violet-500" />
                            <span>Guest Messages</span>
                          </button>
                          <button onClick={() => setActiveTab('workforce')} className="p-3 bg-surface-50 hover:bg-surface-100 text-surface-700 hover:text-surface-900 border border-surface-200/50 rounded-2xl text-[11px] font-bold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer">
                            <UserCheck className="w-4 h-4 text-teal-500" />
                            <span>Workforce Portal</span>
                          </button>
                          <button onClick={() => setActiveTab('inventory')} className="p-3 bg-surface-50 hover:bg-surface-100 text-surface-700 hover:text-surface-900 border border-surface-200/50 rounded-2xl text-[11px] font-bold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer">
                            <Package className="w-4 h-4 text-rose-500" />
                            <span>Inventory Index</span>
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-surface-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button onClick={loadDatabase} className="p-2 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-[10px] font-bold">
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Sync Database</span>
                          </button>
                          <button onClick={() => exportRevenueToPDF(bookings, customers.length, settings.currencySymbol)} className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-[10px] font-bold">
                            <Printer className="w-3.5 h-3.5" />
                            <span>Export Sheets</span>
                          </button>
                        </div>
                        <span className="text-[10px] text-surface-400 font-bold tracking-wider uppercase font-mono">Last updated: Just now</span>
                      </div>
                    </div>

                    {/* BENTO CARD 5: LIVE EVENT STREAM */}
                    <div className="col-span-1 md:col-span-4 bg-white rounded-3xl p-6 border border-surface-200/60 shadow-xs hover:shadow-card-hover transition-all duration-300 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xs font-black text-surface-900 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            Live WebSocket Bus
                          </h3>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-surface-400 bg-surface-50 px-2 py-0.5 rounded border">Realtime Sync</span>
                        </div>
                        
                        {liveChanges.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 text-center bg-surface-50/55 border border-dashed border-surface-200 rounded-2xl">
                            <RefreshCw className="w-5 h-5 text-surface-300 animate-spin" />
                            <p className="text-[10px] text-surface-400 font-bold mt-2 uppercase tracking-wide">Listening for PMS actions...</p>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                            {liveChanges.map((lc) => (
                              <div key={lc.id} className="text-[9px] bg-slate-50 border border-surface-200/60 rounded-xl p-2.5 font-mono shadow-2xs hover:border-brand-250 transition-all">
                                <div className="flex justify-between font-bold text-brand-600">
                                  <span>SOCKET_IN</span>
                                  <span>{lc.time}</span>
                                </div>
                                <p className="text-surface-700 text-[10px] mt-1 leading-relaxed font-sans">{lc.text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-[9px] text-surface-400 font-medium mt-3 border-t border-surface-100 pt-2 font-mono">Listening on hotel_booking channel</p>
                    </div>

                    {/* BENTO CARD 6: BOOKING STATUS DISTRIBUTION */}
                    <div className="col-span-1 md:col-span-4 bg-white rounded-3xl p-6 border border-surface-200/60 shadow-xs hover:shadow-card-hover transition-all duration-300">
                      <h3 className="text-xs font-black text-surface-900 uppercase tracking-widest mb-4">Room Alloc Dist</h3>
                      <div className="space-y-3">
                        {[
                          { label: 'Pending Bookings', count: bookings.filter(b => b.status === 'pending').length, color: 'bg-amber-500', bg: 'bg-amber-50' },
                          { label: 'Confirmed Checks', count: bookings.filter(b => b.status === 'confirmed').length, color: 'bg-emerald-500', bg: 'bg-emerald-50' },
                          { label: 'In-House Guests', count: bookings.filter(b => b.status === 'checked-in').length, color: 'bg-brand-500', bg: 'bg-brand-50' },
                          { label: 'Checked Out', count: bookings.filter(b => b.status === 'completed').length, color: 'bg-slate-400', bg: 'bg-slate-50' },
                          { label: 'Annulled Room', count: bookings.filter(b => b.status === 'cancelled').length, color: 'bg-rose-500', bg: 'bg-rose-50' },
                        ].map(s => {
                          const pct = bookings.length > 0 ? Math.round((s.count / bookings.length) * 100) : 0;
                          return (
                            <div key={s.label} className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-2.5 h-2.5 rounded-full ${s.color} shrink-0`} />
                                  <span className="text-surface-700 font-bold truncate">{s.label}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-extrabold text-surface-900">{s.count}</span>
                                  <span className="text-[9px] text-surface-400 w-8 text-right font-bold">{pct}%</span>
                                </div>
                              </div>
                              <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                                <div className={`h-full ${s.color} rounded-full`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* BENTO CARD 7: CONVENIENT ACTIVITY AUDIT */}
                    <div className="col-span-1 md:col-span-4 bg-white rounded-3xl p-6 border border-surface-200/60 shadow-xs hover:shadow-card-hover transition-all duration-300">
                      <div className="flex items-center justify-between mb-4 border-b border-surface-100 pb-2">
                        <h3 className="text-xs font-black text-surface-900 uppercase tracking-widest flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-surface-500" /> Administrative Audit
                        </h3>
                        <span className="text-[8px] font-bold text-surface-400 uppercase tracking-widest">Logs</span>
                      </div>
                      
                      {logs.length === 0 ? (
                        <p className="text-xs text-surface-400 py-6 italic text-center">No trace activities recorded yet.</p>
                      ) : (
                        <div className="space-y-3.5 max-h-56 overflow-y-auto pr-1">
                          {logs.slice(0, 5).map((log) => (
                            <div key={log.id} className="text-[10px] border-l-2 border-brand-300 pl-3.5 py-0.5 relative group/item">
                              <span className="font-extrabold text-surface-850 block leading-tight">{log.action}</span>
                              <span className="text-surface-400 block text-[9px] mt-0.5 font-medium">{log.user_name || 'System Operator'} · {new Date(log.created_at || Date.now()).toLocaleDateString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* BENTO CARD 8: PERIOD OVERVIEW / ENHANCED REPORTING WIDGET */}
                    <div className="col-span-1 md:col-span-12 bg-white rounded-3xl p-6 border border-surface-200/60 shadow-xs hover:shadow-card-hover transition-all duration-300">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5 border-b border-surface-100 pb-3">
                        <div>
                          <h3 className="text-sm font-black text-surface-900 uppercase tracking-widest">Consolidated Financial Roster</h3>
                          <p className="text-[10px] text-surface-400 font-bold uppercase tracking-wider">Dynamic Revenue and Yield metrics across targeted windows</p>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2">
                          <input type="date" value={reportDateFrom} onChange={(e) => setReportDateFrom(e.target.value)}
                            className="bg-surface-50 border border-surface-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-brand-500 text-surface-700" />
                          <span className="text-surface-400 text-xs font-bold font-mono">to</span>
                          <input type="date" value={reportDateTo} onChange={(e) => setReportDateTo(e.target.value)}
                            className="bg-surface-50 border border-surface-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-brand-500 text-surface-700" />
                          <button onClick={loadDatabase} className="p-2 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase hover:bg-slate-800 cursor-pointer flex items-center gap-1.5 transition-colors">
                            <RefreshCw className="w-3.5 h-3.5" /> Refresh
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-surface-50/70 border border-surface-200/40 rounded-2xl p-5 flex flex-col justify-between">
                          <div>
                            <span className="text-[10px] text-surface-400 font-black uppercase tracking-widest block">Averaged Occupancy</span>
                            <h3 className="text-3xl font-black text-slate-800 mt-2 tracking-tight">{occupancyPercentage}%</h3>
                          </div>
                          <div className="mt-4">
                            <div className="h-2 bg-white/80 border border-surface-200/30 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${occupancyPercentage > 80 ? 'bg-rose-500' : occupancyPercentage > 50 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${occupancyPercentage}%` }} />
                            </div>
                            <span className="text-[9px] text-surface-400 font-semibold block mt-1.5">{occupiedCount} rooms currently allocated for stay guests</span>
                          </div>
                        </div>

                        <div className="bg-surface-50/70 border border-surface-200/40 rounded-2xl p-5 md:col-span-2">
                          <span className="text-[10px] text-surface-400 font-black uppercase tracking-widest block mb-3.5">Fulfillment Financial Roster</span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                              { label: 'Confirmed Yield', value: reportBookingsFiltered.filter(b => b.status === 'confirmed').reduce((s, b) => s + Number(b.total_price), 0), color: 'emerald', bg: 'bg-emerald-100/50' },
                              { label: 'Checked-In Yield', value: reportBookingsFiltered.filter(b => b.status === 'checked-in').reduce((s, b) => s + Number(b.total_price), 0), color: 'sky', bg: 'bg-sky-100/50' },
                              { label: 'Completed Gross', value: reportBookingsFiltered.filter(b => b.status === 'completed').reduce((s, b) => s + Number(b.total_price), 0), color: 'slate', bg: 'bg-slate-100/55' },
                              { label: 'Annulled Loss', value: reportBookingsFiltered.filter(b => b.status === 'cancelled').reduce((s, b) => s + Number(b.total_price), 0), color: 'rose', bg: 'bg-rose-100/50' },
                            ].map(r => (
                              <div key={r.label} className="p-3 bg-white border border-surface-200/20 rounded-xl flex flex-col justify-between">
                                <span className="text-[9px] text-surface-400 font-bold block leading-tight">{r.label}</span>
                                <span className="text-[14px] font-black block mt-2 text-surface-850 font-mono tracking-tight">{settings.currencySymbol}{r.value.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Weekly Occupancy */}
                  <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-brand-600" />
                        <h3 className="text-xs font-bold text-surface-900">7-Day Occupancy</h3>
                      </div>
                      <span className="text-[10px] text-surface-400">{Math.round(averageOccupancy)}% avg</span>
                    </div>
                    <div className="flex items-end gap-2 h-24">
                      {weeklyOccupancy.map((day, i) => {
                        const height = Math.max(4, day.percentage);
                        const color = day.percentage >= 75 ? 'bg-emerald-400' : day.percentage >= 50 ? 'bg-amber-400' : 'bg-rose-400';
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[8px] text-surface-400 font-medium">{Math.round(day.percentage)}%</span>
                            <div className="w-full rounded-md relative" style={{ height: `${height}%`, maxHeight: '100%' }}>
                              <div className={`absolute bottom-0 w-full rounded-md ${color} transition-all duration-500`} style={{ height: `${height}%` }} />
                            </div>
                            <span className="text-[7px] text-surface-400 font-medium">{day.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Top Selling Items */}
                  <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-brand-600" />
                        <h3 className="text-xs font-bold text-surface-900">Top Selling Items</h3>
                      </div>
                      <Utensils className="w-3.5 h-3.5 text-surface-300" />
                    </div>
                    {topSellingItems.length === 0 ? (
                      <p className="text-[11px] text-surface-400 text-center py-6">No orders yet</p>
                    ) : (
                      <div className="space-y-2">
                        {topSellingItems.slice(0, 5).map((item, i) => (
                          <div key={item.name || i} className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-surface-800 truncate">{item.name}</span>
                                <span className="text-[10px] text-surface-500 font-medium">x{item.qty}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] text-surface-400">{item.category || '—'}</span>
                                <span className="text-[10px] font-bold text-surface-600">{settings.currencySymbol}{item.revenue.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-4 h-4 text-brand-600" />
                      <h3 className="text-xs font-bold text-surface-900">Quick Actions</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <button onClick={() => setActiveTab('bookings')} className="p-3 bg-surface-50 hover:bg-surface-100 text-surface-700 rounded-xl text-[11px] font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer">
                        <Calendar className="w-5 h-5" />
                        <span>New Booking</span>
                      </button>
                      <button onClick={() => setActiveTab('housekeeping')} className="p-3 bg-surface-50 hover:bg-surface-100 text-surface-700 rounded-xl text-[11px] font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer">
                        <SprayCan className="w-5 h-5" />
                        <span>Housekeeping</span>
                      </button>
                      <button onClick={() => setActiveTab('reports')} className="p-3 bg-surface-50 hover:bg-surface-100 text-surface-700 rounded-xl text-[11px] font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer">
                        <FileSpreadsheet className="w-5 h-5" />
                        <span>Reports</span>
                      </button>
                      <button onClick={() => setActiveTab('inventory')} className="p-3 bg-surface-50 hover:bg-surface-100 text-surface-700 rounded-xl text-[11px] font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer">
                        <Package className="w-5 h-5" />
                        <span>Inventory</span>
                      </button>
                    </div>
                  </div>

                </div>
              )}

              {/* TABS 2: ROOMS ROSTER CRUD */}
              {activeTab === 'rooms' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-bold text-surface-900 tracking-tight">Active Room Listing</h2>
                      <p className="text-xs text-surface-400 mt-0.5">Create, update and prune luxury coastal rooms available for reservation.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleOpenRoomCreate}
                        className="px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 transition-all text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add New Room</span>
                      </button>
                      <button onClick={() => exportRoomsToPDF(rooms, bookings, settings.currencySymbol)} className="px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700 transition-all text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"><FileText className="w-3.5 h-3.5" /> Export PDF</button>
                    </div>
                  </div>

                  {/* Room Status Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Available', count: rooms.filter(r => r.status === 'available').length, color: 'bg-emerald-500', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50' },
                      { label: 'Booked', count: rooms.filter(r => r.status === 'booked').length, color: 'bg-amber-500', textColor: 'text-amber-700', bgColor: 'bg-amber-50' },
                      { label: 'Cleaning', count: rooms.filter(r => r.status === 'cleaning').length, color: 'bg-sky-500', textColor: 'text-sky-700', bgColor: 'bg-sky-50' },
                      { label: 'Maintenance', count: rooms.filter(r => r.status === 'maintenance').length, color: 'bg-rose-500', textColor: 'text-rose-700', bgColor: 'bg-rose-50' },
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-xl border border-surface-100 p-4 flex items-center gap-3 shadow-sm">
                        <div className={`w-10 h-10 ${s.bgColor} rounded-xl flex items-center justify-center flex-shrink-0`}>
                          <Building className={`w-4 h-4 ${s.textColor}`} />
                        </div>
                        <div>
                          <span className="text-[9px] text-surface-400 font-bold uppercase tracking-wider block">{s.label}</span>
                          <span className="text-lg font-bold text-surface-900">{s.count}</span>
                        </div>
                        <div className="ml-auto w-12 h-1.5 bg-surface-100 rounded-full overflow-hidden">
                          <div className={`h-full ${s.color} rounded-full`} style={{ width: `${rooms.length > 0 ? (s.count / rooms.length) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {rooms.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-surface-100 p-8 max-w-sm mx-auto">
                      <Building className="w-10 h-10 text-surface-300 mx-auto mb-4" />
                      <h3 className="text-base font-semibold text-surface-800">Your room catalog is empty</h3>
                      <p className="text-xs text-surface-400 mt-1 text-center">Add standard, deluxe or presidential layouts to allow live checkout.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden text-xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-surface-50/80 border-b border-surface-150 text-[10px] text-surface-400 font-bold uppercase tracking-wider">
                              <th className="p-4">Room Suite ID</th>
                              <th className="p-4">Category Type</th>
                              <th className="p-4">Rate / hour</th>
                              <th className="p-4">Max Occupancy</th>
                              <th className="p-4">Min Stay</th>
                               <th className="p-4">Roster Status</th>
                              <th className="p-4">Bookings</th>
                              <th className="p-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-100 font-sans tracking-tight text-surface-700">
                            {rooms.map((room) => {
                              const roomBookings = bookings.filter(b => b.room_id === room.id);
                              const isExpanded = expandedRoomBookings.has(room.id);
                              return (
                                <React.Fragment key={room.id}>
                                  <tr
                                    onClick={() => {
                                      const next = new Set(expandedRoomBookings);
                                      if (isExpanded) next.delete(room.id);
                                      else next.add(room.id);
                                      setExpandedRoomBookings(next);
                                    }}
                                    className={`hover:bg-surface-50/50 cursor-pointer transition-colors ${isExpanded ? 'bg-brand-50/30' : ''}`}
                                  >
                                    <td className="p-4 font-mono font-bold text-surface-900 flex items-center gap-2">
                                      <ChevronRight className={`w-3.5 h-3.5 text-surface-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                      Suite {room.room_number}
                                    </td>
                                    <td className="p-4 font-medium text-surface-900">
                                      {room.type}
                                    </td>
                                    <td className="p-4 font-mono font-semibold text-surface-900">
                                      {settings.currencySymbol}{(room as any).price_per_hour ?? (room as any).price_per_night ?? 0}
                                    </td>
                                    <td className="p-4">
                                      {room.max_occupancy} Guests
                                    </td>
                                    <td className="p-4 font-mono text-xs text-surface-500">
                                      {room.min_stay_hours || settings.minStayHours || 3}h
                                    </td>
                                    <td className="p-4">
                                      <select
                                        value={room.status}
                                        onChange={async (e) => {
                                          e.stopPropagation();
                                          const newStatus = e.target.value;
                                          const validStatuses = ['available', 'booked', 'cleaning', 'maintenance'];
                                          if (!validStatuses.includes(newStatus)) {
                                            triggerAlert('Invalid Status', `"${newStatus}" is not a valid room status.`);
                                            return;
                                          }
                                          try {
                                            const { error } = await supabase.from('rooms').update({ status: newStatus }).eq('id', room.id);
                                            if (error) throw error;
                                            addToast('success', 'Status Updated', `Suite ${room.room_number} is now ${newStatus}`);
                                            loadDatabase();
                                          } catch (err: any) {
                                            triggerAlert('Update Error', err.message);
                                          }
                                        }}
                                        onClick={e => e.stopPropagation()}
                                        className={`px-2 py-1 text-[9px] font-bold uppercase rounded-full border-0 cursor-pointer appearance-none text-center ${
                                          room.status === 'available' ? 'bg-emerald-50 text-emerald-700' :
                                          room.status === 'booked' ? 'bg-amber-50 text-amber-700' :
                                          room.status === 'cleaning' ? 'bg-sky-50 text-sky-700' :
                                          'bg-rose-50 text-rose-700'
                                        }`}
                                      >
                                        <option value="available">Available</option>
                                        <option value="booked">Booked</option>
                                        <option value="cleaning">Cleaning</option>
                                        <option value="maintenance">Maintenance</option>
                                      </select>
                                    </td>
                                    <td className="p-4">
                                      <span className="flex items-center gap-1.5 text-surface-500 font-semibold">
                                        <BookOpen className="w-3.5 h-3.5" />
                                        <span>{roomBookings.length} booking{roomBookings.length !== 1 ? 's' : ''}</span>
                                      </span>
                                    </td>
                                    <td className="p-4 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            setQuickBookRoom(room);
                                            setQuickBookSelectedPromo(null);
                                            setQuickBookForm({
                                              guest_name: '', guest_email: '', guest_phone: '',
                                              check_in: new Date().toISOString().split('T')[0],
                                              check_out: new Date(Date.now() + 86400000).toISOString().split('T')[0],
                                              check_in_time: settings.checkInTimes?.[0] || '2:00 PM',
                                              check_out_time: settings.checkOutTimes?.[0] || '11:00 AM',
                                            });
                                            const today = new Date().toISOString().split('T')[0];
                                            const { data: promos } = await supabase.from('promo_codes').select('*').lte('valid_from', today).gte('valid_to', today).eq('is_active', true);
                                            setQuickBookPromos(promos?.filter(p => !p.usage_limit || p.used_count < p.usage_limit) || []);
                                          }}
                                          className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg cursor-pointer transition-colors"
                                          title="Book this room"
                                        >
                                          <Calendar className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleOpenRoomEdit(room); }}
                                          className="p-2 bg-surface-100 hover:bg-surface-200 text-surface-600 rounded-lg cursor-pointer transition-colors"
                                          title="Edit room"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleRoomDelete(room.id, room.room_number); }}
                                          className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer transition-colors"
                                          title="Delete room"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                  {isExpanded && (
                                    <tr>
                                      <td colSpan={7} className="p-0">
                                        <div className="bg-surface-50/50 px-6 py-4 border-b border-surface-100">
                                          {roomBookings.length === 0 ? (
                                            <p className="text-xs text-surface-400 py-2">No bookings linked to this room.</p>
                                          ) : (
                                            <div className="space-y-2">
                                              <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400 mb-2">Reservation History</p>
                                              {roomBookings.map((b) => (
                                                <button
                                                  key={b.id}
                                                  onClick={(e) => { e.stopPropagation(); setSelectedBookingDetail(b); }}
                                                  className="w-full flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-surface-100 text-xs hover:border-brand-200 hover:shadow-sm transition-all text-left cursor-pointer">
                                                  <div className="flex items-center gap-3 flex-1">
                                                    <span className="font-semibold text-surface-900 min-w-[110px]">{b.customers?.full_name || 'Unknown Guest'}</span>
                                                    <span className="text-surface-400 text-[10px]">
                                                      {b.check_in_date} —†’ {b.check_out_date}
                                                    </span>
                                                    <span className="font-mono font-semibold text-surface-900">
                                                      {settings.currencySymbol}{b.total_price}
                                                    </span>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    {(() => {
                                                      const orderCount = guestOrders.filter(o => o.booking_id === b.id).length;
                                                      if (orderCount > 0) return <span className="px-1.5 py-0.5 bg-sky-50 text-sky-700 rounded text-[8px] font-bold">{orderCount} order{orderCount > 1 ? 's' : ''}</span>;
                                                      return null;
                                                    })()}
                                                    <span className={`px-2 py-0.5 font-bold uppercase text-[9px] rounded-full ${
                                                      b.status === 'confirmed' || b.status === 'checked-in'
                                                        ? 'bg-emerald-50 text-emerald-700'
                                                        : b.status === 'cancelled'
                                                        ? 'bg-rose-50 text-rose-700'
                                                        : 'bg-amber-50 text-amber-700'
                                                    }`}>
                                                      {b.status}
                                                    </span>
                                                  </div>
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Parking Management */}
              {activeTab === 'rooms' && (
              <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-brand-600" />
                    <h3 className="text-xs font-bold text-surface-900">Parking Management</h3>
                    <span className="px-2 py-0.5 bg-surface-100 text-surface-500 rounded-full text-[9px] font-medium">{parkingSpots.length} spots</span>
                  </div>
                  <button onClick={() => refreshTable('parking_spots')} className="p-1.5 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-50 cursor-pointer" title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
                </div>
                <div className="p-4">
                  {parkingSpots.length === 0 ? (
                    <div className="text-center py-8 text-surface-400 text-xs">
                      <Layers className="w-8 h-8 mx-auto mb-2 text-surface-300" />
                      <p>No parking spots configured.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                      {parkingSpots.map(spot => {
                        const spotColors: Record<string, string> = {
                          available: 'border-emerald-400 bg-emerald-50 text-emerald-800',
                          occupied: 'border-rose-400 bg-rose-50 text-rose-800',
                          reserved: 'border-blue-400 bg-blue-50 text-blue-800',
                          maintenance: 'border-gray-400 bg-gray-50 text-gray-800'
                        };
                        const labelColors: Record<string, string> = {
                          available: 'bg-emerald-100 text-emerald-700',
                          occupied: 'bg-rose-100 text-rose-700',
                          reserved: 'bg-blue-100 text-blue-700',
                          maintenance: 'bg-gray-100 text-gray-600'
                        };
                        return (
                          <button
                            key={spot.id}
                            onClick={() => {
                              if (spot.status === 'available') {
                                setParkingSelectedSpot(spot);
                                setParkingAssignBookingId('');
                                setShowParkingModal(true);
                              } else if (spot.status === 'occupied') {
                                triggerConfirm(
                                  'Vacate Parking Spot',
                                  `Release spot ${spot.spot_number} (${spot.vehicle_plate || 'no plate'})?`,
                                  async () => {
                                    await supabase.from('parking_spots').update({ status: 'available', assigned_booking_id: null, vehicle_plate: '', vehicle_model: '' }).eq('id', spot.id);
                                    await supabase.from('activity_logs').insert({ user_id: userProfile?.id, user_name: userProfile?.full_name || 'Admin', action: 'Parking Vacated', details: `Spot ${spot.spot_number} vacated` });
                                    addToast('success', 'Vacated', `Parking spot ${spot.spot_number} is now available.`);
                                    refreshTable('parking_spots');
                                  },
                                  true, 'Vacate'
                                );
                              }
                            }}
                            className={`p-2 rounded-lg border-2 text-left transition-all hover:shadow-sm cursor-pointer ${spotColors[spot.status] || 'border-surface-200'}`}
                          >
                            <div className="text-[9px] font-bold uppercase tracking-wider">{spot.spot_number}</div>
                            <div className="text-[8px] mt-1 opacity-75">{spot.level}</div>
                            {spot.status === 'occupied' && (
                              <div className="mt-1 text-[8px] font-semibold truncate">{spot.vehicle_plate || 'No plate'}</div>
                            )}
                            <div className={`mt-1.5 px-1 py-0.5 text-[7px] font-bold uppercase rounded text-center ${labelColors[spot.status] || 'bg-surface-100 text-surface-500'}`}>{spot.status}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* Parking Assignment Modal */}
              {showParkingModal && parkingSelectedSpot && (
                <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-surface-900">Assign Parking Spot {parkingSelectedSpot.spot_number}</h3>
                        <p className="text-[11px] text-surface-400 mt-0.5">Select a booking to assign this spot to</p>
                      </div>
                      <button onClick={() => setShowParkingModal(false)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="p-6 space-y-4 text-xs">
                      <div>
                        <label className="block text-surface-500 font-medium mb-1.5">Booking</label>
                        <select value={parkingAssignBookingId} onChange={(e) => setParkingAssignBookingId(e.target.value)}
                          className="w-full bg-surface-50 border border-surface-200 rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-brand-500 cursor-pointer">
                          <option value="">Select a booking...</option>
                          {bookings.filter(b => b.status === 'checked-in' || b.status === 'confirmed').map(b => (
                            <option key={b.id} value={b.id}>{b.customers?.full_name || 'Guest'} - Suite {b.rooms?.room_number}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
                        <button onClick={() => setShowParkingModal(false)} className="px-4 py-2 border border-surface-200 text-surface-600 hover:bg-surface-50 rounded-lg font-medium cursor-pointer text-xs">Cancel</button>
                        <button onClick={async () => {
                          if (!parkingAssignBookingId) { triggerAlert('Error', 'Please select a booking.'); return; }
                          try {
                            await supabase.from('parking_spots').update({ status: 'occupied', assigned_booking_id: parkingAssignBookingId }).eq('id', parkingSelectedSpot.id);
                            await supabase.from('activity_logs').insert({ user_id: userProfile?.id, user_name: userProfile?.full_name || 'Admin', action: 'Parking Assigned', details: `Spot ${parkingSelectedSpot.spot_number} assigned to booking` });
                            addToast('success', 'Assigned', `Parking spot ${parkingSelectedSpot.spot_number} assigned.`);
                            setShowParkingModal(false);
                            refreshTable('parking_spots');
                          } catch (err: any) { triggerAlert('Error', err.message); }
                        }} className="px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 rounded-lg font-semibold cursor-pointer text-xs flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Assign</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Incidents Section */}
              {activeTab === 'rooms' && (
              <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <h3 className="text-xs font-bold text-surface-900">Incidents</h3>
                    <span className="px-2 py-0.5 bg-surface-100 text-surface-500 rounded-full text-[9px] font-medium">{incidents.length} reports</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => refreshTable('incidents')} className="p-1.5 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-50 cursor-pointer" title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { setIncidentForm({ room_id: '', incident_type: 'damage', description: '', cost: 0, billed_to_guest: false }); setShowIncidentModal(true); }} className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[9px] font-semibold hover:bg-amber-100 cursor-pointer flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Report Incident</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  {incidents.length === 0 ? (
                    <div className="text-center py-8 text-surface-400 text-xs">
                      <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-surface-300" />
                      <p>No incidents reported.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-surface-50/80 border-b border-surface-150 text-[10px] text-surface-400 font-bold uppercase tracking-wider">
                          <th className="p-3">Room</th>
                          <th className="p-3">Type</th>
                          <th className="p-3">Description</th>
                          <th className="p-3">Cost</th>
                          <th className="p-3">Billed?</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Date</th>
                          <th className="p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-100 text-surface-700">
                        {incidents.map(inc => {
                          const statusColors: Record<string, string> = {
                            reported: 'bg-amber-50 text-amber-700 border-amber-200',
                            investigating: 'bg-blue-50 text-blue-700 border-blue-200',
                            resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                            billed: 'bg-rose-50 text-rose-700 border-rose-200',
                            closed: 'bg-gray-50 text-gray-600 border-gray-200'
                          };
                          const nextStatus = (s: string) => {
                            const flow: Record<string, string> = { reported: 'investigating', investigating: 'resolved', resolved: 'billed', billed: 'closed' };
                            return flow[s] || null;
                          };
                          return (
                            <tr key={inc.id} className="hover:bg-surface-50/50">
                              <td className="p-3 font-semibold text-surface-900 font-mono">{inc.rooms?.room_number || 'N/A'}</td>
                              <td className="p-3 capitalize">{inc.incident_type}</td>
                              <td className="p-3 max-w-[200px] truncate">{inc.description}</td>
                              <td className="p-3 font-mono font-semibold">{settings.currencySymbol}{inc.cost}</td>
                              <td className="p-3">{inc.billed_to_guest ? <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 rounded text-[8px] font-bold">Yes</span> : <span className="text-surface-400">No</span>}</td>
                              <td className="p-3"><span className={`px-2 py-0.5 text-[8px] font-bold uppercase rounded-full border ${statusColors[inc.status] || 'bg-surface-50 text-surface-500'}`}>{inc.status}</span></td>
                              <td className="p-3 text-surface-400 text-[10px]">{new Date(inc.created_at).toLocaleDateString()}</td>
                              <td className="p-3">
                                <div className="flex items-center gap-1">
                                  {nextStatus(inc.status) && (
                                    <button onClick={async () => {
                                      try {
                                        const newStatus = nextStatus(inc.status);
                                        if (!newStatus) return;
                                        const { data: fullInc } = await supabase.from('incidents').select('*').eq('id', inc.id).single();
                                        await supabase.from('incidents').update({
                                          status: newStatus,
                                          resolved_at: newStatus === 'closed' ? new Date().toISOString() : null
                                        }).eq('id', inc.id);
                                        if (newStatus === 'billed' && fullInc?.billed_to_guest && fullInc?.booking_id) {
                                          await supabase.from('booking_charges').insert({
                                            booking_id: fullInc.booking_id,
                                            description: `Incident: ${fullInc.incident_type} - ${fullInc.description.slice(0, 100)}`,
                                            amount: fullInc.cost
                                          });
                                          await supabase.from('activity_logs').insert({
                                            user_id: userProfile?.id,
                                            user_name: userProfile?.full_name || 'Admin',
                                            action: 'Incident Billed',
                                            details: `${settings.currencySymbol}${fullInc.cost} charge created for ${fullInc.incident_type} incident`
                                          });
                                        }
                                        refreshTable('incidents');
                                        addToast('success', 'Status Updated', `Incident moved to "${newStatus}".`);
                                      } catch (err: any) { triggerAlert('Error', err.message); }
                                    }} className="px-1.5 py-0.5 bg-surface-100 hover:bg-surface-200 text-surface-600 rounded text-[8px] font-bold cursor-pointer whitespace-nowrap">{nextStatus(inc.status)}</button>
                                  )}
                                  {inc.status !== 'closed' && (
                                    <button onClick={() => triggerConfirm('Close Incident', 'Close this incident without further action?', async () => { try { await supabase.from('incidents').update({ status: 'closed', resolved_at: new Date().toISOString() }).eq('id', inc.id); refreshTable('incidents'); } catch (err: any) { triggerAlert('Error', err.message); } })} className="px-1.5 py-0.5 text-surface-400 hover:text-rose-600 rounded text-[8px] font-bold cursor-pointer">Close</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              )}

              {/* Incident Report Modal */}
              {showIncidentModal && (
                <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-surface-900">Report Incident</h3>
                        <p className="text-[11px] text-surface-400 mt-0.5">Log a new incident report</p>
                      </div>
                      <button onClick={() => setShowIncidentModal(false)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="p-6 space-y-4 text-xs">
                      <div>
                        <label className="block text-surface-500 font-medium mb-1.5">Room</label>
                        <select value={incidentForm.room_id} onChange={(e) => setIncidentForm({...incidentForm, room_id: e.target.value})}
                          className="w-full bg-surface-50 border border-surface-200 rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-brand-500 cursor-pointer">
                          <option value="">Select a room...</option>
                          {rooms.map(r => <option key={r.id} value={r.id}>Suite {r.room_number} - {r.type}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-surface-500 font-medium mb-1.5">Incident Type</label>
                        <select value={incidentForm.incident_type} onChange={(e) => setIncidentForm({...incidentForm, incident_type: e.target.value as any})}
                          className="w-full bg-surface-50 border border-surface-200 rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-brand-500 cursor-pointer">
                          {(['damage', 'theft', 'disturbance', 'injury', 'fire', 'flood', 'other'] as const).map(t => (
                            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-surface-500 font-medium mb-1.5">Description</label>
                        <textarea rows={3} value={incidentForm.description} onChange={(e) => setIncidentForm({...incidentForm, description: e.target.value})}
                          placeholder="Describe what happened..."
                          className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-surface-500 font-medium mb-1.5">Cost ({settings.currencyCode})</label>
                          <input type="number" min={0} step="0.01" value={incidentForm.cost} onChange={(e) => setIncidentForm({...incidentForm, cost: Number(e.target.value)})}
                            className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 font-mono" />
                        </div>
                        <div className="flex items-end pb-2.5">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={incidentForm.billed_to_guest} onChange={(e) => setIncidentForm({...incidentForm, billed_to_guest: e.target.checked})}
                              className="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer" />
                            <span className="text-xs text-surface-700 font-medium">Bill to guest</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
                        <button onClick={() => setShowIncidentModal(false)} className="px-4 py-2 border border-surface-200 text-surface-600 hover:bg-surface-50 rounded-lg font-medium cursor-pointer text-xs">Cancel</button>
                        <button onClick={async () => {
                          if (!incidentForm.room_id) { triggerAlert('Error', 'Please select a room.'); return; }
                          if (!incidentForm.description.trim()) { triggerAlert('Error', 'Please enter a description.'); return; }
                          try {
                            const { error } = await supabase.from('incidents').insert({
                              room_id: incidentForm.room_id,
                              incident_type: incidentForm.incident_type,
                              description: incidentForm.description,
                              cost: incidentForm.cost,
                              billed_to_guest: incidentForm.billed_to_guest,
                              status: 'reported'
                            });
                            if (error) throw error;
                            await supabase.from('activity_logs').insert({ user_id: userProfile?.id, user_name: userProfile?.full_name || 'Admin', action: 'Incident Reported', details: `${incidentForm.incident_type} incident reported for room` });
                            addToast('success', 'Incident Reported', 'The incident has been logged.');
                            setShowIncidentModal(false);
                            refreshTable('incidents');
                          } catch (err: any) { triggerAlert('Error', err.message); }
                        }} className="px-4 py-2 bg-amber-600 text-white hover:bg-amber-700 rounded-lg font-semibold cursor-pointer text-xs flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Report</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TABS 3: BOOKINGS RETAIN */}
              {activeTab === 'bookings' && (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-surface-900 tracking-tight">Roster Booking Ledger</h2>
                      <p className="text-xs text-surface-400 mt-0.5">Monitor, manage, and process all guest reservations in real time.</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5 bg-white border border-surface-100 rounded-lg px-3 py-1.5 shadow-sm">
                        <DollarSign className="w-3 h-3 text-emerald-500" />
                        <span className="text-surface-400">Revenue:</span>
                        <span className="font-bold text-surface-900">{settings.currencySymbol}{(bookings.filter(b => b.status === 'confirmed' || b.status === 'checked-in' || b.status === 'completed').reduce((s, b) => s + Number(b.total_price), 0)).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-white border border-surface-100 rounded-lg px-3 py-1.5 shadow-sm">
                        <BookOpen className="w-3 h-3 text-brand-500" />
                        <span className="font-bold text-surface-900">{bookings.length}</span>
                        <span className="text-surface-400">total</span>
                      </div>
                      <button onClick={() => exportBookingsToPDF(bookings, settings.currencySymbol)} className="px-3 py-1.5 bg-surface-900 text-white hover:bg-surface-800 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 cursor-pointer transition-all"><FileText className="w-3.5 h-3.5" /> PDF</button>
                      <button onClick={() => setShowGroupModal(true)} className="px-3 py-1.5 bg-brand-600 text-white hover:bg-brand-700 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 cursor-pointer transition-all"><Users className="w-3.5 h-3.5" /> Groups ({bookingGroups.length})</button>
                    </div>
                  </div>

                  {/* FEATURE 12: GROUP BOOKINGS MODAL */}
                  {showGroupModal && (
                    <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                      <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
                          <div>
                            <h3 className="text-base font-bold text-surface-900">Group Bookings</h3>
                            <p className="text-[11px] text-surface-400 mt-0.5">{bookingGroups.length} group{bookingGroups.length !== 1 ? 's' : ''} registered</p>
                          </div>
                          <button onClick={() => setShowGroupModal(false)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-6">
                          {/* Create Group Form */}
                          <div className="bg-surface-50 rounded-xl border border-surface-100 p-5">
                            <h4 className="text-xs font-bold text-surface-900 mb-4 flex items-center gap-1.5"><Users className="w-4 h-4 text-brand-600" /> {selectedGroup ? 'Edit Group' : 'Create New Group'}</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              <div>
                                <label className="block text-surface-500 font-medium mb-1">Group Name</label>
                                <input type="text" value={groupForm.name} onChange={(e) => setGroupForm({...groupForm, name: e.target.value})} placeholder="e.g. Smith Wedding"
                                  className="w-full bg-white border border-surface-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500" />
                              </div>
                              <div>
                                <label className="block text-surface-500 font-medium mb-1">Contact Name</label>
                                <input type="text" value={groupForm.contact_name} onChange={(e) => setGroupForm({...groupForm, contact_name: e.target.value})} placeholder="e.g. John Smith"
                                  className="w-full bg-white border border-surface-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500" />
                              </div>
                              <div>
                                <label className="block text-surface-500 font-medium mb-1">Contact Phone</label>
                                <input type="text" value={groupForm.contact_phone} onChange={(e) => setGroupForm({...groupForm, contact_phone: e.target.value})} placeholder="e.g. +1234567890"
                                  className="w-full bg-white border border-surface-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500" />
                              </div>
                              <div>
                                <label className="block text-surface-500 font-medium mb-1">Contact Email</label>
                                <input type="email" value={groupForm.contact_email} onChange={(e) => setGroupForm({...groupForm, contact_email: e.target.value})} placeholder="e.g. john@example.com"
                                  className="w-full bg-white border border-surface-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500" />
                              </div>
                              <div>
                                <label className="block text-surface-500 font-medium mb-1">Total Rooms</label>
                                <input type="number" min={1} value={groupForm.total_rooms} onChange={(e) => setGroupForm({...groupForm, total_rooms: Number(e.target.value)})}
                                  className="w-full bg-white border border-surface-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500" />
                              </div>
                              <div>
                                <label className="block text-surface-500 font-medium mb-1">Total Guests</label>
                                <input type="number" min={0} value={groupForm.total_guests} onChange={(e) => setGroupForm({...groupForm, total_guests: Number(e.target.value)})}
                                  className="w-full bg-white border border-surface-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500" />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="block text-surface-500 font-medium mb-1">Notes</label>
                                <textarea rows={2} value={groupForm.notes} onChange={(e) => setGroupForm({...groupForm, notes: e.target.value})} placeholder="Any special requirements..."
                                  className="w-full bg-white border border-surface-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500" />
                              </div>
                              <div>
                                <label className="block text-surface-500 font-medium mb-1">Status</label>
                                <select value={groupForm.status} onChange={(e) => setGroupForm({...groupForm, status: e.target.value as BookingGroup['status']})}
                                  className="w-full bg-white border border-surface-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500">
                                  <option value="pending">Pending</option>
                                  <option value="confirmed">Confirmed</option>
                                  <option value="checked-in">Checked In</option>
                                  <option value="completed">Completed</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                              </div>
                            </div>
                            <div className="flex justify-end mt-3">
                              <button onClick={async () => {
                                if (!groupForm.name.trim() || !groupForm.contact_name.trim()) { triggerAlert('Error', 'Group name and contact name are required.'); return; }
                                try {
                                  if (selectedGroup) {
                                    const { error } = await supabase.from('booking_groups').update({
                                      name: groupForm.name.trim(), contact_name: groupForm.contact_name.trim(),
                                      contact_phone: groupForm.contact_phone.trim(), contact_email: groupForm.contact_email.trim(),
                                      total_rooms: groupForm.total_rooms, total_guests: groupForm.total_guests, notes: groupForm.notes.trim(),
                                      status: groupForm.status
                                    }).eq('id', selectedGroup.id);
                                    if (error) throw error;
                                    addToast('success', 'Group Updated', `Group "${groupForm.name}" updated.`);
                                  } else {
                                    const { error } = await supabase.from('booking_groups').insert({
                                      name: groupForm.name.trim(), contact_name: groupForm.contact_name.trim(),
                                      contact_phone: groupForm.contact_phone.trim(), contact_email: groupForm.contact_email.trim(),
                                      total_rooms: groupForm.total_rooms, total_guests: groupForm.total_guests, notes: groupForm.notes.trim(),
                                      status: groupForm.status
                                    });
                                    if (error) throw error;
                                    addToast('success', 'Group Created', `Group "${groupForm.name}" has been created.`);
                                  }
                                  setSelectedGroup(null);
                                  setGroupForm({ name: '', contact_name: '', contact_phone: '', contact_email: '', total_rooms: 1, total_guests: 0, notes: '', status: 'pending' });
                                  const { data: freshGroups } = await supabase.from('booking_groups').select('*').order('created_at', { ascending: false });
                                  if (freshGroups) setBookingGroups(freshGroups);
                                } catch (err: any) { triggerAlert('Error', err.message); }
                              }} className="px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5">{selectedGroup ? <><Edit3 className="w-3.5 h-3.5" /> Update Group</> : <><Plus className="w-3.5 h-3.5" /> Create Group</>}</button>
                            </div>
                          </div>

                          {/* Groups Table */}
                          {bookingGroups.length === 0 ? (
                            <div className="text-center py-8 text-surface-400 text-xs">
                              <Users className="w-8 h-8 mx-auto mb-2 text-surface-300" />
                              <p>No booking groups yet. Create your first group above.</p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="bg-surface-50/80 border-b border-surface-150 text-[10px] text-surface-400 font-bold uppercase tracking-wider">
                                    <th className="p-3">Name</th>
                                    <th className="p-3">Contact</th>
                                    <th className="p-3">Rooms</th>
                                    <th className="p-3">Guests</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3">Created</th>
                                    <th className="p-3">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-100 text-surface-700">
                                  {bookingGroups.map(g => (
                                    <tr key={g.id} className="hover:bg-surface-50/50">
                                      <td className="p-3 font-semibold text-surface-900">{g.name}</td>
                                      <td className="p-3">
                                        <span className="block">{g.contact_name}</span>
                                        <span className="text-[9px] text-surface-400">{g.contact_phone || g.contact_email}</span>
                                      </td>
                                      <td className="p-3 font-mono font-bold">{g.total_rooms}</td>
                                      <td className="p-3 font-mono">{g.total_guests || '-'}</td>
                                      <td className="p-3">
                                        <span className={`px-2 py-0.5 text-[8px] font-bold uppercase rounded-full ${
                                          g.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' :
                                          g.status === 'checked-in' ? 'bg-sky-50 text-sky-700' :
                                          g.status === 'completed' ? 'bg-slate-50 text-slate-500' :
                                          g.status === 'cancelled' ? 'bg-rose-50 text-rose-700' :
                                          'bg-amber-50 text-amber-700'
                                        }`}>{g.status}</span>
                                      </td>
                                      <td className="p-3 text-[10px] text-surface-400">{new Date(g.created_at).toLocaleDateString()}</td>
                                      <td className="p-3">
                                        <div className="flex items-center gap-1">
                                          <button onClick={() => { setSelectedGroup(g); setGroupForm({ name: g.name, contact_name: g.contact_name, contact_phone: g.contact_phone || '', contact_email: g.contact_email || '', total_rooms: g.total_rooms, total_guests: g.total_guests || 0, notes: g.notes || '', status: g.status }); }} className="p-1 text-surface-400 hover:text-brand-600 rounded cursor-pointer" title="Edit"><Edit3 className="w-3 h-3" /></button>
                                          <button onClick={() => triggerConfirm('Delete Group', `Are you sure you want to delete "${g.name}"?`, async () => { try { await supabase.from('booking_groups').delete().eq('id', g.id); addToast('success', 'Group Deleted', `"${g.name}" removed.`); const { data: freshGroups } = await supabase.from('booking_groups').select('*').order('created_at', { ascending: false }); if (freshGroups) setBookingGroups(freshGroups); } catch (err: any) { triggerAlert('Error', err.message); } }, true, 'Delete')} className="p-1 text-surface-400 hover:text-rose-600 rounded cursor-pointer" title="Delete"><Trash2 className="w-3 h-3" /></button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Booking Status Pipeline */}
                  <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-5">
                    <div className="flex items-stretch gap-0">
                      {([
                        { label: 'Pending', key: 'pending', color: 'bg-amber-500', textColor: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
                        { label: 'Confirmed', key: 'confirmed', color: 'bg-emerald-500', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
                        { label: 'Checked-in', key: 'checked-in', color: 'bg-brand-500', textColor: 'text-brand-700', bgColor: 'bg-brand-50', borderColor: 'border-brand-200' },
                        { label: 'Completed', key: 'completed', color: 'bg-slate-500', textColor: 'text-slate-700', bgColor: 'bg-slate-50', borderColor: 'border-slate-200' },
                        { label: 'Cancelled', key: 'cancelled', color: 'bg-rose-500', textColor: 'text-rose-700', bgColor: 'bg-rose-50', borderColor: 'border-rose-200' },
                      ] as const).map((s, i) => {
                        const count = bookings.filter(b => b.status === s.key).length;
                        const pct = bookings.length > 0 ? (count / bookings.length) * 100 : 0;
                        return (
                          <button key={s.key} onClick={() => setBookingFilter(bookingFilter === s.key ? 'all' : s.key)}
                            className={`flex-1 flex flex-col items-center gap-1.5 relative p-2.5 transition-all cursor-pointer ${bookingFilter === s.key ? `${s.bgColor} ${s.borderColor} border-2` : 'border-2 border-transparent hover:border-surface-100'} ${i === 0 ? 'rounded-l-xl' : i === 4 ? 'rounded-r-xl' : ''}`}
                          >
                            <div className="w-full h-2 bg-surface-100 rounded-full overflow-hidden">
                              <div className={`h-full ${s.color} rounded-full transition-all duration-500`} style={{ width: `${Math.max(1, pct)}%` }} />
                            </div>
                            <div className="text-center">
                              <span className={`text-sm font-bold ${s.textColor} block leading-none`}>{count}</span>
                              <span className="text-[8px] text-surface-400 uppercase tracking-wider font-semibold mt-0.5 block">{s.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Waitlist Quick-View Card */}
                  {waitlist.filter(w => w.status === 'waiting').length > 0 && (
                    <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="w-4 h-4 text-brand-600" />
                          <h3 className="text-xs font-bold text-surface-900">Waitlist</h3>
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[9px] font-bold">{waitlist.filter(w => w.status === 'waiting').length} waiting</span>
                        </div>
                      </div>
                      <div className="grid gap-2 max-h-48 overflow-y-auto">
                        {waitlist.filter(w => w.status === 'waiting').slice(0, 5).map(entry => (
                          <div key={entry.id} className="flex items-center justify-between bg-surface-50 rounded-lg px-3 py-2 border border-surface-100">
                            <div>
                              <p className="text-xs font-semibold text-surface-900">{entry.guest_name}</p>
                              <p className="text-[10px] text-surface-400">{entry.room_type}{entry.party_size > 1 ? ` · ${entry.party_size} guests` : ''}</p>
                            </div>
                            <span className="text-[9px] text-surface-400">{entry.check_in ? new Date(entry.check_in).toLocaleDateString() : 'Flexible'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Filter & Search Bar */}
                  {bookings.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1.5 text-[10px] text-surface-500 cursor-pointer">
                        <input type="checkbox" checked={selectedBookingIds.size > 0 && bookings.filter(b => bookingFilter === 'all' || b.status === bookingFilter).every(b => selectedBookingIds.has(b.id))}
                          onChange={(e) => {
                            const filtered = bookings.filter(b => bookingFilter === 'all' || b.status === bookingFilter);
                            if (e.target.checked) {
                              setSelectedBookingIds(new Set(filtered.map(b => b.id)));
                            } else {
                              setSelectedBookingIds(new Set());
                            }
                          }}
                          className="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer" />
                        <span className="font-semibold">Select All</span>
                      </label>
                      <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                        <input
                          type="text"
                          value={bookingSearch}
                          onChange={(e) => setBookingSearch(e.target.value)}
                          placeholder="Search guest or room..."
                          className="w-full bg-white border border-surface-200 rounded-xl pl-9 pr-4 py-2 text-xs text-surface-800 placeholder:text-surface-400 focus:outline-none focus:border-brand-500 shadow-sm"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-surface-400">
                        <Filter className="w-3 h-3" />
                        <span className="font-medium">
                          {(() => {
                            let filtered = bookings;
                            if (bookingFilter !== 'all') filtered = filtered.filter(b => b.status === bookingFilter);
                            if (bookingSearch.trim()) {
                              const q = bookingSearch.toLowerCase();
                              filtered = filtered.filter(b =>
                                (b.customers?.full_name || '').toLowerCase().includes(q) ||
                                (b.rooms?.room_number || '').toLowerCase().includes(q)
                              );
                            }
                            return filtered.length;
                          })()} results
                        </span>
                        {bookingFilter !== 'all' && (
                          <button onClick={() => setBookingFilter('all')} className="ml-1 text-brand-600 hover:text-brand-700 font-semibold cursor-pointer">
                            Clear filter
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bulk Selection Toolbar */}
                  {selectedBookingIds.size > 0 && (
                    <div className="bg-surface-50 border border-surface-200 rounded-xl px-4 py-3 flex items-center gap-3">
                      <span className="text-xs font-semibold text-surface-700">{selectedBookingIds.size} selected</span>
                      <div className="flex gap-2">
                        <button onClick={async () => {
                          const toCheckIn = bookings.filter(b => selectedBookingIds.has(b.id) && b.status === 'confirmed');
                          for (const b of toCheckIn) {
                            await supabase.from('bookings').update({ status: 'checked-in' }).eq('id', b.id);
                            await supabase.from('rooms').update({ status: 'booked' }).eq('id', b.room_id);
                          }
                          await supabase.from('activity_logs').insert({ user_id: userProfile?.id, user_name: userProfile?.full_name || 'Admin', action: 'Bulk Check-In', details: `Checked in ${toCheckIn.length} guests` });
                          addToast('success', 'Bulk Check-In', `Checked in ${toCheckIn.length} booking(s).`);
                          setSelectedBookingIds(new Set());
                          refreshTable('bookings');
                        }} className="px-3 py-1.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg text-[9px] font-semibold hover:bg-sky-100 cursor-pointer flex items-center gap-1"><Key className="w-3 h-3" /> Check In Selected</button>
                        <button onClick={async () => {
                          const toCheckOut = bookings.filter(b => selectedBookingIds.has(b.id) && b.status === 'checked-in');
                          for (const b of toCheckOut) {
                            await supabase.from('bookings').update({ status: 'completed' }).eq('id', b.id);
                            await supabase.from('rooms').update({ status: 'cleaning' }).eq('id', b.room_id);
                          }
                          await supabase.from('activity_logs').insert({ user_id: userProfile?.id, user_name: userProfile?.full_name || 'Admin', action: 'Bulk Check-Out', details: `Checked out ${toCheckOut.length} guests` });
                          addToast('success', 'Bulk Check-Out', `Checked out ${toCheckOut.length} booking(s).`);
                          setSelectedBookingIds(new Set());
                          refreshTable('bookings');
                        }} className="px-3 py-1.5 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-[9px] font-semibold hover:bg-slate-100 cursor-pointer flex items-center gap-1"><LogOut className="w-3 h-3" /> Check Out Selected</button>
                        <button onClick={async () => {
                          const toCancel = bookings.filter(b => selectedBookingIds.has(b.id) && (b.status === 'pending' || b.status === 'confirmed'));
                          for (const b of toCancel) {
                            await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', b.id);
                            if (b.rooms) await supabase.from('rooms').update({ status: 'available' }).eq('id', b.room_id);
                          }
                          await supabase.from('activity_logs').insert({ user_id: userProfile?.id, user_name: userProfile?.full_name || 'Admin', action: 'Bulk Cancel', details: `Cancelled ${toCancel.length} bookings` });
                          addToast('info', 'Bulk Cancel', `Cancelled ${toCancel.length} booking(s).`);
                          setSelectedBookingIds(new Set());
                          refreshTable('bookings');
                        }} className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[9px] font-semibold hover:bg-rose-100 cursor-pointer flex items-center gap-1"><X className="w-3 h-3" /> Cancel Selected</button>
                        <button onClick={() => {
                          const selected = bookings.filter(b => selectedBookingIds.has(b.id));
                          exportToCSV(selected.map(b => ({
                            Guest: b.customers?.full_name || '', Email: b.customers?.email || '', Room: b.rooms?.room_number || '',
                            CheckIn: b.check_in_date, CheckOut: b.check_out_date, Status: b.status, Total: b.total_price
                          })), 'selected-bookings');
                          addToast('success', 'Exported', `Exported ${selected.length} booking(s) to CSV.`);
                          setSelectedBookingIds(new Set());
                        }} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[9px] font-semibold hover:bg-emerald-100 cursor-pointer flex items-center gap-1"><Download className="w-3 h-3" /> Export Selected CSV</button>
                      </div>
                      <button onClick={() => setSelectedBookingIds(new Set())} className="ml-auto p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  )}

                  {/* Empty state */}
                  {bookings.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto">
                      <BookOpen className="w-10 h-10 text-surface-300 mx-auto mb-4" />
                      <h3 className="text-base font-semibold text-surface-800">No active bookings filed</h3>
                      <p className="text-xs text-surface-400 mt-1">Make a booking on the public landing page to populate this panel dynamically!</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {bookings
                        .filter(b => bookingFilter === 'all' || b.status === bookingFilter)
                        .filter(b => {
                          if (!bookingSearch.trim()) return true;
                          const q = bookingSearch.toLowerCase();
                          return (b.customers?.full_name || '').toLowerCase().includes(q) ||
                            (b.rooms?.room_number || '').toLowerCase().includes(q);
                        })
                        .length === 0 ? (
                        <div className="bg-white rounded-2xl border border-surface-100 p-10 text-center">
                          <Search className="w-8 h-8 text-surface-300 mx-auto mb-2" />
                          <p className="text-sm font-semibold text-surface-500">No matching bookings</p>
                          <p className="text-xs text-surface-400 mt-1">Try adjusting your filter or search.</p>
                        </div>
                      ) : (
                        bookings
                          .filter(b => bookingFilter === 'all' || b.status === bookingFilter)
                          .filter(b => {
                            if (!bookingSearch.trim()) return true;
                            const q = bookingSearch.toLowerCase();
                            return (b.customers?.full_name || '').toLowerCase().includes(q) ||
                              (b.rooms?.room_number || '').toLowerCase().includes(q);
                          })
                          .map((booking) => {
                            const isExpanded = booking.id === selectedBookingDetail?.id;
                            const isEditing = editingBookingId === booking.id;
                            const hasTimeIn = !!booking.check_in_time;
                            const hasTimeOut = !!booking.check_out_time;

                            // Duration calculation
                            const checkInDate = new Date(booking.check_in_date);
                            const checkOutDate = new Date(booking.check_out_date);
                            const diffDays = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
                            const diffHours = Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60));
                            const durationLabel = diffDays >= 1 ? `${diffDays} night${diffDays > 1 ? 's' : ''}` : `${diffHours} hour${diffHours > 1 ? 's' : ''}`;

                            return (
                              <div key={booking.id} className={`bg-white rounded-2xl border shadow-sm transition-all ${isExpanded ? 'border-brand-200 shadow-md' : 'border-surface-100'}`}>
                                {/* Card Header */}
                                <div className="p-5">
                                  <div className="flex items-start justify-between gap-4">
                                    {/* Checkbox */}
                                    <div className="flex items-center pt-1">
                                      <input type="checkbox" checked={selectedBookingIds.has(booking.id)}
                                        onChange={(e) => {
                                          const next = new Set(selectedBookingIds);
                                          if (e.target.checked) next.add(booking.id);
                                          else next.delete(booking.id);
                                          setSelectedBookingIds(next);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer" />
                                    </div>
                                    {/* Guest Info */}
                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                      <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 font-bold text-sm flex-shrink-0">
                                        {(booking.customers?.full_name || 'G').charAt(0).toUpperCase()}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-bold text-surface-900 truncate">{booking.customers?.full_name || 'Guest'}</span>
                                          <span className={`px-2 py-0.5 text-[8px] font-bold uppercase rounded-full ${
                                            booking.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                            booking.status === 'checked-in' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
                                            booking.status === 'completed' ? 'bg-slate-50 text-slate-500 border border-slate-200' :
                                            booking.status === 'cancelled' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                            'bg-amber-50 text-amber-700 border border-amber-200'
                                          }`}>{booking.status}</span>
                                        </div>
                                        <p className="text-[10px] text-surface-400 mt-0.5 truncate">{booking.customers?.email}</p>
                                        <div className="flex items-center gap-2 mt-1.5">
                                          <span className="text-[10px] font-semibold text-surface-700">Suite {booking.rooms?.room_number}</span>
                                          <span className="text-[8px] text-surface-400 bg-surface-50 px-1.5 py-0.5 rounded font-medium">{booking.rooms?.type}</span>
                                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${diffDays >= 1 ? 'bg-brand-50 text-brand-700' : 'bg-violet-50 text-violet-700'}`}>
                                            {durationLabel}
                                          </span>
                                        </div>
                                        </div>
                                    </div>

                                    {/* Price & Quick Actions */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <div className="text-right">
                                        <span className="text-lg font-bold text-surface-900 font-mono">{settings.currencySymbol}{booking.total_price}</span>
                                        <span className="text-[9px] text-surface-400 block">{diffDays >= 1 ? `${settings.currencySymbol}${(Number(booking.total_price) / Math.max(1, diffDays)).toFixed(0)}/night` : `${settings.currencySymbol}${(Number(booking.total_price) / Math.max(1, diffHours)).toFixed(0)}/hr`}</span>
                                      </div>
                                      <button
                                        onClick={() => {
                                          if (isExpanded) {
                                            setSelectedBookingDetail(null);
                                            setEditingBookingId(null);
                                          } else {
                                            setSelectedBookingDetail(booking);
                                          }
                                        }}
                                        className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-50 rounded-lg transition-colors cursor-pointer"
                                        title={isExpanded ? 'Collapse' : 'Expand details'}
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Date Row */}
                                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-surface-50">
                                    <div className="flex items-center gap-1.5">
                                      <Calendar className="w-3 h-3 text-surface-400" />
                                      <span className="text-[11px] text-surface-600 font-medium">{booking.check_in_date}</span>
                                      {hasTimeIn && <span className="text-[10px] font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">{booking.check_in_time}</span>}
                                    </div>
                                    <span className="text-surface-300 text-[10px]">—†’</span>
                                    <div className="flex items-center gap-1.5">
                                      <Calendar className="w-3 h-3 text-surface-400" />
                                      <span className="text-[11px] text-surface-600 font-medium">{booking.check_out_date}</span>
                                      {hasTimeOut && <span className="text-[10px] font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">{booking.check_out_time}</span>}
                                    </div>
                                    <div className="ml-auto flex items-center gap-1.5">
                                      <UserCheck className="w-3 h-3 text-surface-400" />
                                      <span className="text-[10px] text-surface-500">{booking.profiles?.full_name || 'Unassigned'}</span>
                                    </div>
                                  </div>

                                  {/* Quick Action Buttons (always visible) */}
                                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-surface-50">
                                    {booking.status === 'pending' && (
                                      <button onClick={async () => {
                                        try {
                                          await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', booking.id);
                                          await supabase.from('activity_logs').insert({
                                            user_id: userProfile?.id, user_name: userProfile?.full_name || 'Admin',
                                            action: 'Booking Confirmed', details: `${booking.customers?.full_name} booking confirmed`
                                          });
                                          addToast('success', 'Confirmed', `${booking.customers?.full_name}'s booking is now confirmed.`);
                                          await refreshTable('bookings');
                                        } catch (err: any) { triggerAlert('Error', err.message); }
                                      }} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[9px] font-semibold hover:bg-emerald-100 cursor-pointer flex items-center gap-1"><Check className="w-3 h-3" /> Confirm</button>
                                    )}
                                    {(booking.status === 'confirmed' || booking.status === 'pending') && (
                                      <button onClick={async () => {
                                        try {
                                          await supabase.from('bookings').update({ status: 'checked-in' }).eq('id', booking.id);
                                          await supabase.from('rooms').update({ status: 'booked' }).eq('id', booking.room_id);
                                          await supabase.from('activity_logs').insert({
                                            user_id: userProfile?.id, user_name: userProfile?.full_name || 'Admin',
                                            action: 'Guest Checked In', details: `${booking.customers?.full_name} checked into Suite ${booking.rooms?.room_number}`
                                          });
                                          addToast('success', 'Checked In', `${booking.customers?.full_name} is now occupying the suite.`);
                                          await refreshTable('bookings');
                                        } catch (err: any) { triggerAlert('Error', err.message); }
                                      }} className="px-3 py-1.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg text-[9px] font-semibold hover:bg-sky-100 cursor-pointer flex items-center gap-1"><Key className="w-3 h-3" /> Check In</button>
                                    )}
                                    {booking.status === 'checked-in' && (
                                      <button onClick={async () => {
                                        try {
                                          await supabase.from('bookings').update({ status: 'completed' }).eq('id', booking.id);
                                          await supabase.from('rooms').update({ status: 'cleaning' }).eq('id', booking.room_id);
                                          await supabase.from('activity_logs').insert({
                                            user_id: userProfile?.id, user_name: userProfile?.full_name || 'Admin',
                                            action: 'Booking Completed', details: `${booking.customers?.full_name} checked out of Suite ${booking.rooms?.room_number}`
                                          });
                                          addToast('success', 'Completed', `${booking.customers?.full_name} has checked out.`);
                                          await refreshTable('bookings');
                                        } catch (err: any) { triggerAlert('Error', err.message); }
                                      }} className="px-3 py-1.5 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-[9px] font-semibold hover:bg-slate-100 cursor-pointer flex items-center gap-1"><Check className="w-3 h-3" /> Complete</button>
                                    )}
                                    {booking.status !== 'cancelled' && booking.status !== 'completed' && (() => {
                                      // Show Order Food for checked-in and confirmed bookings
                                      const canOrder = booking.status === 'checked-in' || booking.status === 'confirmed';
                                      return (
                                        <>
                                          {canOrder && (
                                            <button onClick={() => handleOpenOrderCreate(booking)}
                                              className="px-3 py-1.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-[9px] font-semibold hover:bg-orange-100 cursor-pointer flex items-center gap-1"><ShoppingCart className="w-3 h-3" /> Order Food</button>
                                          )}
                                          <button onClick={async () => {
                                            try {
                                              await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id);
                                              if (booking.rooms) {
                                                await supabase.from('rooms').update({ status: 'available' }).eq('id', booking.room_id);
                                              }
                                              await supabase.from('activity_logs').insert({
                                                user_id: userProfile?.id, user_name: userProfile?.full_name || 'Admin',
                                                action: 'Booking Cancelled', details: `${booking.customers?.full_name} booking cancelled`
                                              });
                                              addToast('info', 'Cancelled', `${booking.customers?.full_name}'s booking was cancelled.`);
                                              await refreshTable('bookings');
                                            } catch (err: any) { triggerAlert('Error', err.message); }
                                          }} className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[9px] font-semibold hover:bg-rose-100 cursor-pointer flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
                                        </>
                                      );
                                    })()}
                                    <button onClick={() => handleOpenBookingEdit(booking)}
                                      className="px-3 py-1.5 bg-surface-50 text-surface-600 border border-surface-200 rounded-lg text-[9px] font-semibold hover:bg-surface-100 cursor-pointer flex items-center gap-1"><Edit3 className="w-3 h-3" /> Edit</button>
                                  </div>
                                </div>

                                {/* Expanded Detail Panel */}
                                {isExpanded && (
                                  <div className="border-t border-surface-100 bg-surface-50/50 p-5 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      {/* Status Editor */}
                                      <div className="bg-white rounded-xl border border-surface-100 p-4 shadow-sm">
                                        <span className="text-[9px] text-surface-400 font-bold uppercase tracking-wider flex items-center gap-1.5 mb-3"><Activity className="w-3 h-3" /> Booking Status</span>
                                        <select
                                          value={isEditing ? bookingStatusEdit : booking.status}
                                          onChange={(e) => { setBookingStatusEdit(e.target.value); if (!isEditing) { setEditingBookingId(booking.id); setBookingStatusEdit(e.target.value); setBookingStaffEdit(booking.assigned_employee_id || ''); } }}
                                          className="w-full bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 text-xs text-surface-800 focus:outline-none focus:border-brand-500 cursor-pointer"
                                        >
                                          <option value="pending">Pending</option>
                                          <option value="confirmed">Confirmed</option>
                                          <option value="checked-in">Checked-In</option>
                                          <option value="completed">Completed</option>
                                          <option value="cancelled">Cancelled</option>
                                        </select>
                                      </div>

                                      {/* Staff Assignment */}
                                      <div className="bg-white rounded-xl border border-surface-100 p-4 shadow-sm">
                                        <span className="text-[9px] text-surface-400 font-bold uppercase tracking-wider flex items-center gap-1.5 mb-3"><UserPlus className="w-3 h-3" /> Staff Assignment</span>
                                        <select
                                          value={isEditing ? bookingStaffEdit : (booking.assigned_employee_id || '')}
                                          onChange={(e) => { setBookingStaffEdit(e.target.value); if (!isEditing) { setEditingBookingId(booking.id); setBookingStatusEdit(booking.status); setBookingStaffEdit(e.target.value); } }}
                                          className="w-full bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 text-xs text-surface-800 focus:outline-none focus:border-brand-500 cursor-pointer"
                                        >
                                          <option value="">Unassigned</option>
                                          {employees.map(emp => (
                                            <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.role})</option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Orders Summary */}
                                      <div className="bg-white rounded-xl border border-surface-100 p-4 shadow-sm">
                                        <span className="text-[9px] text-surface-400 font-bold uppercase tracking-wider flex items-center gap-1.5 mb-3"><ShoppingCart className="w-3 h-3" /> Room Orders</span>
                                        {(() => {
                                          const roomOrders = guestOrders.filter(o => o.booking_id === booking.id);
                                          if (roomOrders.length === 0) return <p className="text-xs text-surface-400 italic">No orders placed.</p>;
                                          return (
                                            <div className="space-y-1 max-h-[80px] overflow-y-auto">
                                              {roomOrders.slice(0, 5).map(o => (
                                                <div key={o.id} className="flex items-center justify-between text-[10px]">
                                                  <span className="text-surface-700">{o.inventory_items?.name || 'Item'} x{o.quantity}</span>
                                                  <span className={`px-1 py-0.5 text-[7px] font-bold uppercase rounded-full ${
                                                    o.status === 'served' ? 'bg-emerald-50 text-emerald-700' :
                                                    o.status === 'preparing' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'
                                                  }`}>{o.status}</span>
                                                </div>
                                              ))}
                                              {roomOrders.length > 5 && <span className="text-[8px] text-surface-400">+{roomOrders.length - 5} more</span>}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>

                                    {/* Save/Cancel Buttons (only when editing) */}
                                    {isEditing && (
                                      <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
                                        <button onClick={() => { setEditingBookingId(null); setSelectedBookingDetail(null); }}
                                          className="px-4 py-2 border border-surface-200 text-surface-600 hover:bg-surface-100 rounded-lg text-xs font-medium cursor-pointer">Cancel</button>
                                        <button onClick={() => handleBookingUpdateSave(booking)}
                                          className="px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Save Changes</button>
                                      </div>
                                    )}

                                    {/* Created At */}
                                    <div className="text-[9px] text-surface-400 text-right">
                                      Booked {new Date(booking.created_at).toLocaleString()}
                                      <span className="mx-1.5">·</span>
                                      ID: {booking.id.slice(0, 8)}...
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TABS 4: WORKFORCE */}
              {activeTab === 'workforce' && (
                <div className="space-y-6">

                  {/* Workforce Sub-tabs */}
                  <div className="flex items-center gap-2 border-b border-surface-100 pb-3">
                    {[
                      { id: 'directory', label: 'Staff Directory', icon: 'UserCheck' },
                      { id: 'time', label: 'Time Tracking', icon: 'Clock' },
                      { id: 'payroll', label: 'Payroll', icon: 'DollarSign' },
                      { id: 'shifts', label: 'Schedules & Swap Board', icon: 'Calendar' }
                    ].map(sub => {
                      const Icon = sub.id === 'directory' ? UserCheck : sub.id === 'time' ? Clock : sub.id === 'shifts' ? Calendar : DollarSign;
                      const isActive = wfSubTab === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => setWfSubTab(sub.id as any)}
                          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all cursor-pointer ${
                            isActive
                              ? 'border-brand-500 text-brand-600 bg-brand-50/30'
                              : 'border-transparent text-surface-400 hover:text-surface-600 hover:border-surface-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* === STAFF DIRECTORY SUB-TAB === */}
                  {wfSubTab === 'directory' && (
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-bold text-surface-900 tracking-tight">Staff Directory</h2>
                          <p className="text-xs text-surface-400 mt-0.5">Manage employee accounts and role-based access.</p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            onClick={handleOpenEmployeeCreate}
                            className="px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 transition-all text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Add Employee</span>
                          </button>
                          <button onClick={() => exportToCSV(employees.map(e => ({ Name: e.full_name, Email: e.email, Role: e.role, Joined: new Date(e.created_at).toLocaleDateString() })), "staff")} className="px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700 transition-all text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5" /> Export CSV</button>
                        </div>
                      </div>

                      {/* Staff Role Summary */}
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                        {[
                          { role: 'admin', label: 'Admin', color: 'bg-brand-500' },
                          { role: 'front_desk', label: 'Front Desk', color: 'bg-sky-500' },
                          { role: 'staff', label: 'Staff', color: 'bg-emerald-500' },
                          { role: 'cook', label: 'Cook', color: 'bg-amber-500' },
                          { role: 'cleaner', label: 'Cleaner', color: 'bg-teal-500' },
                          { role: 'waiter', label: 'Waiter', color: 'bg-rose-500' },
                          { role: 'employee', label: 'Employee', color: 'bg-violet-500' },
                        ].map(s => {
                          const count = employees.filter(e => e.role === s.role).length;
                          return (
                            <div key={s.role} className="bg-white rounded-xl border border-surface-100 p-3 text-center shadow-sm">
                              <div className={`w-2 h-2 rounded-full ${s.color} mx-auto mb-1`} />
                              <span className="text-lg font-bold text-surface-900 block">{count}</span>
                              <span className="text-[8px] text-surface-400 uppercase tracking-wider font-semibold">{s.label}</span>
                            </div>
                          );
                        })}
                      </div>

                      {employees.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto">
                          <UserCheck className="w-10 h-10 text-surface-300 mx-auto mb-4" />
                          <h3 className="text-base font-semibold text-surface-800">No staff on roster</h3>
                          <p className="text-xs text-surface-400 mt-1">Add employees and admins to manage hotel operations and bookings.</p>
                        </div>
                      ) : (
                        <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden text-xs">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-surface-50/80 border-b border-surface-150 text-[10px] text-surface-400 font-bold uppercase tracking-wider">
                                  <th className="p-4">Full Name</th>
                                  <th className="p-4">Email</th>
                                  <th className="p-4">Role</th>
                                  <th className="p-4">Hourly Rate</th>
                                  <th className="p-4">Type</th>
                                  <th className="p-4">Joined</th>
                                  <th className="p-4 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-surface-100 text-surface-700 font-sans tracking-tight">
                                {employees.map((emp) => {
                                  const payroll = employeePayrolls.find(ep => ep.user_id === emp.id);
                                  return (
                                    <tr key={emp.id} className="hover:bg-surface-50/50">
                                      <td className="p-4 font-semibold text-surface-900">{emp.full_name}</td>
                                      <td className="p-4 font-mono font-medium text-surface-650">{emp.email}</td>
                                      <td className="p-4">
                                        <span className={`px-2 py-0.5 font-bold uppercase text-[9px] rounded-full ${
                                          emp.role === 'admin'
                                            ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                                            : emp.role === 'front_desk'
                                            ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                                            : emp.role === 'cook'
                                            ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                                            : emp.role === 'cleaner'
                                            ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'
                                            : emp.role === 'waiter'
                                            ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                                            : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                        }`}>
                                        {emp.role === 'front_desk' ? 'Front Desk' : emp.role === 'staff' ? 'Staff' : emp.role.charAt(0).toUpperCase() + emp.role.slice(1)}
                                      </span>
                                    </td>
                                    <td className="p-4">
                                      {payroll ? (
                                        <span className='font-mono font-bold text-emerald-600'>{settings.currencySymbol}{Number(payroll.hourly_rate).toFixed(2)}/hr</span>
                                      ) : (
                                        <span className='text-surface-300 italic'>Not set</span>
                                      )}
                                    </td>
                                    <td className="p-4">
                                      {payroll ? (
                                        <span className='text-[10px] font-semibold text-surface-500 uppercase'>{payroll.employment_type}</span>
                                      ) : (
                                        <span className='text-surface-300 italic text-[10px]'>-</span>
                                      )}
                                    </td>
                                    <td className="p-4 text-surface-400 text-[10px]">{new Date(emp.created_at).toLocaleDateString()}</td>
                                    <td className="p-4 text-right space-x-1.5">
                                      <button
                                        onClick={() => handleOpenEmployeePayroll(emp.id)}
                                        className='px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold cursor-pointer transition-colors'
                                      >
                                        {payroll ? 'Edit Rate' : 'Set Rate'}
                                      </button>
                                      <button
                                        onClick={() => handleOpenEmployeeEdit(emp)}
                                        className='px-2.5 py-1 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-[10px] font-bold cursor-pointer transition-colors'
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => handleEmployeeDelete(emp)}
                                        className='px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold cursor-pointer transition-colors'
                                      >
                                        Delete
                                      </button>
                                    </td>
                                  </tr>
                                );})}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* === TIME TRACKING SUB-TAB === */}
                  {wfSubTab === 'time' && (() => {
                    const filteredTimeEntries = timeEntries
                      .filter(t => timeFilterUser === 'all' || t.user_id === timeFilterUser)
                      .filter(t => isDateInPreset(t.clock_in));

                    const totalHours = filteredTimeEntries.reduce((acc, t) => acc + Number(t.total_hours || 0), 0);
                    const regularHours = filteredTimeEntries.reduce((acc, t) => acc + Math.min(8, Number(t.total_hours || 0)), 0);
                    const overtimeHours = filteredTimeEntries.reduce((acc, t) => acc + Math.max(0, Number(t.total_hours || 0) - 8), 0);
                    const activeShiftsCount = filteredTimeEntries.filter(t => !t.clock_out).length;

                    let adminLates = 0;
                    let adminHolidaysWorked = 0;

                    filteredTimeEntries.forEach(t => {
                      let status = 'Present';
                      let isHoliday = false;
                      if (t.notes?.trim().startsWith('{')) {
                        try {
                          const p = JSON.parse(t.notes);
                          if (p?.is_attendance_meta) {
                            status = p.status || 'Present';
                            isHoliday = !!p.is_holiday;
                          }
                        } catch (e) {}
                      } else {
                        // Fallback
                        const entryDate = new Date(t.clock_in);
                        const hr = entryDate.getHours();
                        const min = entryDate.getMinutes();
                        const [sh, sm] = shiftStartTime.split(':').map(Number);
                        if (hr > sh || (hr === sh && min > sm)) {
                          status = 'Late';
                        }
                      }
                      if (status === 'Late') adminLates++;
                      if (isHoliday) adminHolidaysWorked++;
                    });

                    return (
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                          <div>
                            <h2 className="text-lg font-bold text-surface-900 tracking-tight">Active Workforce Timesheets & Attendance</h2>
                            <p className="text-xs text-surface-400 mt-0.5 font-medium">Verify employee arrival status, modify timesheet logs, configure hotel holidays, or perform bulk exports.</p>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
                            <button
                              onClick={() => setHolidayFormOpen(!holidayFormOpen)}
                              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-lg flex items-center gap-1.5 text-xs cursor-pointer transition-colors"
                            >
                              <Settings className="w-3.5 h-3.5" />
                              <span>{holidayFormOpen ? 'Close Settings' : 'Configure Holidays & Hours'}</span>
                            </button>
                            
                            <button
                              onClick={() => {
                                setEditingTimeEntry(null);
                                setManualTimeForm({
                                  userId: '',
                                  clockIn: new Date().toISOString().slice(0, 16),
                                  clockOut: '',
                                  notes: '',
                                  status: 'Present',
                                  isHoliday: false,
                                  holidayName: '',
                                  remarks: '',
                                  mealBreakTaken: true,
                                  mealBreakDuration: 60
                                });
                                setTimeEntryModalOpen(true);
                              }}
                              className="px-3.5 py-1.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-lg flex items-center gap-1.5 text-xs cursor-pointer shadow-sm shadow-brand-500/10 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Manual Entry / Override</span>
                            </button>
                          </div>
                        </div>

                        {/* HOLIDAY CONFIGURATION PANEL */}
                        {holidayFormOpen && (
                          <div className="bg-gradient-to-br from-indigo-50/50 to-indigo-100/20 border border-indigo-150 p-5 rounded-2xl space-y-4">
                            <div className="flex flex-col md:flex-row gap-4 justify-between md:items-start">
                              <div className="space-y-3 max-w-sm w-full">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900">Define Hotel Policy Limits</h3>
                                <div>
                                  <label className="text-[10px] font-bold text-surface-500 block mb-1">Standard Shift Start Time</label>
                                  <div className="flex gap-2">
                                    <input
                                      type="time"
                                      value={shiftStartTime}
                                      onChange={(e) => setShiftStartTime(e.target.value)}
                                      className="text-xs p-1.5 bg-white border border-surface-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                                    />
                                    <button
                                      onClick={() => handleSaveAttendanceSettings(holidays, shiftStartTime)}
                                      className="px-3 py-1 bg-indigo-600 text-white font-bold text-[11px] rounded transition-colors hover:bg-indigo-700"
                                    >
                                      Update Start Boundary
                                    </button>
                                  </div>
                                  <p className="text-[9px] text-surface-400 mt-1">Clock-ins after this threshold count as Late arrival.</p>
                                </div>

                                <div className="border-t border-indigo-100 pt-3 space-y-2">
                                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-indigo-900">Add New Calendar Holiday</h4>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[8px] font-bold text-surface-400 uppercase">Holiday Date</label>
                                      <input
                                        type="date"
                                        value={newHoliday.date}
                                        onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                                        className="w-full text-xs p-1.5 bg-white border border-surface-200 rounded-lg"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[8px] font-bold text-surface-400 uppercase">Holiday Type</label>
                                      <select
                                        value={newHoliday.type}
                                        onChange={(e) => setNewHoliday({ ...newHoliday, type: e.target.value })}
                                        className="w-full text-xs p-1.5 bg-white border border-surface-200 rounded-lg cursor-pointer"
                                      >
                                        <option value="regular">Regular Holiday</option>
                                        <option value="special">Special Non-Working</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[8px] font-bold text-surface-400 uppercase">Holiday Name</label>
                                    <input
                                      type="text"
                                      value={newHoliday.name}
                                      onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                                      placeholder="e.g. Independence Day"
                                      className="w-full text-xs p-1.5 bg-white border border-surface-200 rounded-lg mb-1.5"
                                    />
                                  </div>
                                  <button
                                    onClick={() => {
                                      if (!newHoliday.date || !newHoliday.name) {
                                        triggerAlert('Validation Error', ' Holiday date and descriptive name are required.');
                                        return;
                                      }
                                      const updated = [...holidays, newHoliday];
                                      handleSaveAttendanceSettings(updated, shiftStartTime);
                                      setNewHoliday({ date: '', name: '', type: 'regular' });
                                    }}
                                    className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded transition-colors"
                                  >
                                    Register Calendar Holiday
                                  </button>
                                </div>
                              </div>

                              {/* Holidays Table */}
                              <div className="flex-1 bg-white border border-indigo-100 rounded-xl max-h-[250px] overflow-y-auto">
                                <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100 text-[10px] text-indigo-900 font-extrabold uppercase">
                                  Current Configured Holiday Database ({holidays.length})
                                </div>
                                {holidays.length === 0 ? (
                                  <p className="p-4 text-xs text-surface-400 italic text-center">No holidays saved.</p>
                                ) : (
                                  <table className="w-full text-left text-xs divide-y divide-surface-150">
                                    <thead>
                                      <tr className="bg-surface-50 text-[9px] uppercase font-bold text-surface-400">
                                        <th className="p-2">Date</th>
                                        <th className="p-2">Name</th>
                                        <th className="p-2">Type</th>
                                        <th className="p-2 text-right">Delete</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-surface-100">
                                      {holidays.map((hol, idx) => (
                                        <tr key={idx} className="hover:bg-surface-50/50">
                                          <td className="p-2 font-mono">{hol.date}</td>
                                          <td className="p-2 font-semibold text-surface-800">{hol.name}</td>
                                          <td className="p-2">
                                            <span className={`text-[9px] font-bold ${hol.type === 'regular' ? 'text-red-600' : 'text-amber-600'}`}>
                                              {hol.type === 'regular' ? 'Regular' : 'Special'}
                                            </span>
                                          </td>
                                          <td className="p-2 text-right">
                                            <button
                                              onClick={() => {
                                                const updated = holidays.filter((_, i) => i !== idx);
                                                handleSaveAttendanceSettings(updated, shiftStartTime);
                                              }}
                                              className="p-1 hover:bg-rose-50 text-rose-600 rounded transition-colors"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* METRICS & EXPORTS HEADER BAR */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-surface-150 shadow-sm">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-surface-500">Staff Filter:</span>
                              <select
                                value={timeFilterUser}
                                onChange={(e) => setTimeFilterUser(e.target.value)}
                                className="text-xs p-2 px-3 focus:ring-1 focus:ring-brand-500 rounded-lg border border-surface-200 bg-white focus:outline-none cursor-pointer font-bold text-surface-700 hover:bg-surface-50"
                              >
                                <option value="all">All Employees</option>
                                {employees.map(emp => (
                                  <option key={emp.id} value={emp.id}>{emp.full_name || emp.email} ({emp.role})</option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-center gap-1 border-l border-surface-150 pl-3">
                              <button
                                onClick={() => setTimeFilterPreset('all')}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${timeFilterPreset === 'all' ? 'bg-surface-900 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
                              >
                                All Logs
                              </button>
                              <button
                                onClick={() => setTimeFilterPreset('today')}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${timeFilterPreset === 'today' ? 'bg-surface-900 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
                              >
                                Today
                              </button>
                              <button
                                onClick={() => setTimeFilterPreset('week')}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${timeFilterPreset === 'week' ? 'bg-surface-900 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
                              >
                                Week
                              </button>
                              <button
                                onClick={() => setTimeFilterPreset('month')}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${timeFilterPreset === 'month' ? 'bg-surface-900 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
                              >
                                Month
                              </button>
                              <button
                                onClick={() => setTimeFilterPreset('custom')}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${timeFilterPreset === 'custom' ? 'bg-surface-900 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
                              >
                                Custom Dates
                              </button>
                            </div>

                            {timeFilterPreset === 'custom' && (
                              <div className="flex items-center gap-1 border-l border-surface-150 pl-3">
                                <input
                                  type="date"
                                  value={timeFilterStartDate}
                                  onChange={(e) => setTimeFilterStartDate(e.target.value)}
                                  className="text-xs p-1 border border-surface-200 rounded-md"
                                />
                                <span className="text-surface-400 text-[10px]">to</span>
                                <input
                                  type="date"
                                  value={timeFilterEndDate}
                                  onChange={(e) => setTimeFilterEndDate(e.target.value)}
                                  className="text-xs p-1 border border-surface-200 rounded-md"
                                />
                              </div>
                            )}
                          </div>

                          {/* Export buttons row */}
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleExportAttendanceCSV(filteredTimeEntries)}
                              title="Export to Excel / CSV"
                              className="px-3 py-1.5 bg-surface-50 hover:bg-surface-100 border border-surface-200 text-surface-700 font-bold rounded-lg flex items-center gap-1 text-[11px] cursor-pointer transition-colors"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Export CSV</span>
                            </button>
                            <button
                              onClick={() => handleExportAttendancePDF(filteredTimeEntries)}
                              title="Export PDF Report"
                              className="px-3 py-1.5 bg-surface-50 hover:bg-surface-100 border border-surface-200 text-surface-700 font-bold rounded-lg flex items-center gap-1 text-[11px] cursor-pointer transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5 text-rose-600" />
                              <span>Export PDF</span>
                            </button>
                          </div>
                        </div>

                        {/* CUMULATIVE SUMMARY METRIC CARDS */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div className="bg-white border border-surface-200 p-4 rounded-2xl shadow-sm">
                            <span className="text-[10px] text-surface-400 font-bold uppercase tracking-wider block">Logged Shifts</span>
                            <span className="font-extrabold text-surface-800 text-lg">{filteredTimeEntries.length} entries</span>
                          </div>
                          <div className="bg-white border border-surface-200 p-4 rounded-2xl shadow-sm">
                            <span className="text-[10px] text-surface-400 font-bold uppercase tracking-wider block">Total Hours Logged</span>
                            <span className="font-mono font-extrabold text-emerald-600 text-lg">{totalHours.toFixed(1)}h</span>
                          </div>
                          <div className="bg-white border border-surface-200 p-4 rounded-2xl shadow-sm">
                            <span className="text-[10px] text-surface-400 font-bold uppercase tracking-wider block">Arrival Lates</span>
                            <span className="font-extrabold text-amber-500 text-lg">{adminLates} count</span>
                          </div>
                          <div className="bg-white border border-surface-200 p-4 rounded-2xl shadow-sm">
                            <span className="text-[10px] text-surface-400 font-bold uppercase tracking-wider block">Holiday Shift Credits</span>
                            <span className="font-extrabold text-indigo-600 text-lg">{adminHolidaysWorked} shifts</span>
                          </div>
                        </div>

                        {filteredTimeEntries.length === 0 ? (
                          <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto">
                            <Clock className="w-10 h-10 text-surface-300 mx-auto mb-4" />
                            <h3 className="text-base font-semibold text-surface-800">No matching attendance records</h3>
                            <p className="text-xs text-surface-400 mt-1">Try relaxing the configured date interval or staff filter criteria.</p>
                          </div>
                        ) : (
                          <div className="bg-white rounded-2xl border border-surface-150 shadow-sm overflow-hidden text-xs">
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-surface-50 border-b border-surface-150 text-[10px] text-surface-400 font-bold uppercase tracking-wider">
                                    <th className="p-3">Employee</th>
                                    <th className="p-3">Clock In</th>
                                    <th className="p-3">Clock Out</th>
                                    <th className="p-3">Hours</th>
                                    <th className="p-3">Is Holiday</th>
                                    <th className="p-3">Arrival Status</th>
                                    <th className="p-3">Remarks / Administrative Remarks</th>
                                    <th className="p-3 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-100 font-sans">
                                  {filteredTimeEntries.slice(0, 80).map((entry) => {
                                    let status = 'Present';
                                    let isHoliday = false;
                                    let holidayName = '';
                                    let remarks = '';
                                    let mealBreakTaken = false;
                                    let mealBreakDuration = 0;
                                    if (entry.notes?.trim().startsWith('{')) {
                                      try {
                                        const p = JSON.parse(entry.notes);
                                        if (p?.is_attendance_meta) {
                                          status = p.status || 'Present';
                                          isHoliday = !!p.is_holiday;
                                          holidayName = p.holiday_name || '';
                                          remarks = p.remarks || '';
                                          mealBreakTaken = !!p.meal_break_taken;
                                          mealBreakDuration = Number(p.meal_break_duration) || 0;
                                        }
                                      } catch (e) {}
                                    } else {
                                      // Fallback checking
                                      remarks = entry.notes || '';
                                      const entryDate = new Date(entry.clock_in);
                                      const hr = entryDate.getHours();
                                      const min = entryDate.getMinutes();
                                      const [sh, sm] = shiftStartTime.split(':').map(Number);
                                      if (hr > sh || (hr === sh && min > sm)) {
                                        status = 'Late';
                                      }
                                    }

                                    return (
                                      <tr key={entry.id} className="hover:bg-surface-50/50 text-surface-700">
                                        <td className="p-3 font-semibold text-surface-900">
                                          <div>{(entry as any).users?.full_name || (entry as any).users?.email || 'Unknown'}</div>
                                          <div className="text-[10px] text-surface-400 font-normal">{(entry as any).users?.role || 'staff'}</div>
                                        </td>
                                        <td className="p-3 font-mono">{new Date(entry.clock_in).toLocaleString()}</td>
                                        <td className="p-3 font-mono">
                                          {entry.clock_out ? (
                                            new Date(entry.clock_out).toLocaleString()
                                          ) : (
                                            <span className="text-rose-500 font-bold uppercase text-[9px] animate-pulse">Running Shift</span>
                                          )}
                                        </td>
                                        <td className="p-3 font-mono font-bold">
                                          <div className="flex flex-col gap-1">
                                            <span>{entry.total_hours ? `${Number(entry.total_hours).toFixed(1)}h` : '—'}</span>
                                            {mealBreakTaken && (
                                              <span className="text-[9px] text-indigo-650 bg-indigo-50 border border-indigo-100 px-1 py-0.5 rounded w-fit font-bold flex items-center gap-0.5" title={`${mealBreakDuration} minutes unpaid meal break subtracted`}>
                                                🍴 {mealBreakDuration}m break
                                              </span>
                                            )}
                                            {entry.total_hours && Number(entry.total_hours) > 8 && (
                                              <span className="text-[9px] text-amber-800 bg-amber-55/10 border border-amber-200 px-1 py-0.5 rounded w-fit uppercase font-semibold" title="Standard 8-hour shift crossed. Overtime calculated.">
                                                ⚡ Overtime
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="p-3">
                                          {isHoliday ? (
                                            <div className="flex flex-col">
                                              <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[8px] font-extrabold uppercase rounded-full w-fit">
                                                Holiday Work
                                              </span>
                                              {holidayName && <span className="text-[9px] font-semibold text-indigo-600 mt-0.5 max-w-[120px] truncate">{holidayName}</span>}
                                            </div>
                                          ) : (
                                            <span className="text-surface-400">-</span>
                                          )}
                                        </td>
                                        <td className="p-3">
                                          <span className={`px-2 py-0.5 text-[9px] font-extrabold border rounded-full ${
                                            status === 'Present' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                            status === 'Late' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                            status === 'Half-Day' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                            'bg-red-50 text-red-700 border-red-100'
                                          }`}>
                                            {status}
                                          </span>
                                        </td>
                                        <td className="p-3 text-surface-500 max-w-[160px] truncate" title={remarks}>
                                          {remarks || <span className="text-surface-300 italic">No notes</span>}
                                        </td>
                                        <td className="p-3 text-right space-x-1">
                                          <button
                                            onClick={() => {
                                              let rems = '';
                                              let stat = 'Present';
                                              let isHol = false;
                                              let holName = '';
                                              let breakTaken = true;
                                              let breakDuration = 60;
                                              if (entry.notes?.trim().startsWith('{')) {
                                                try {
                                                  const p = JSON.parse(entry.notes);
                                                  if (p?.is_attendance_meta) {
                                                    stat = p.status || 'Present';
                                                    isHol = !!p.is_holiday;
                                                    holName = p.holiday_name || '';
                                                    rems = p.remarks || '';
                                                    if (p.hasOwnProperty('meal_break_taken')) {
                                                      breakTaken = !!p.meal_break_taken;
                                                    }
                                                    if (p.hasOwnProperty('meal_break_duration')) {
                                                      breakDuration = Number(p.meal_break_duration) || 0;
                                                    }
                                                  }
                                                } catch (e) {}
                                              } else {
                                                rems = entry.notes || '';
                                              }

                                              setEditingTimeEntry(entry);
                                              setManualTimeForm({
                                                userId: entry.user_id,
                                                clockIn: entry.clock_in ? new Date(entry.clock_in).toISOString().slice(0, 16) : '',
                                                clockOut: entry.clock_out ? new Date(entry.clock_out).toISOString().slice(0, 16) : '',
                                                notes: entry.notes || '',
                                                status: stat,
                                                isHoliday: isHol,
                                                holidayName: holName,
                                                remarks: rems,
                                                mealBreakTaken: breakTaken,
                                                mealBreakDuration: breakDuration
                                              });
                                              setTimeEntryModalOpen(true);
                                            }}
                                            className="px-2.5 py-1 bg-surface-100 hover:bg-surface-200 text-surface-700 font-bold text-[10px] rounded cursor-pointer transition-colors"
                                            title="Edit / Correct Record"
                                          >
                                            Edit
                                          </button>
                                          <button
                                            onClick={() => handleDeleteTimeEntry(entry.id)}
                                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-[10px] rounded cursor-pointer transition-colors"
                                            title="Permanently Delete Entry"
                                          >
                                            Delete
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* ===== WORKFORCE OPERATIONAL ACCOMPLISHMENTS LEDGER ===== */}
                        <div className="bg-white rounded-2xl border border-surface-150 shadow-sm overflow-hidden mt-6">
                          <div className="px-5 py-4 border-b border-surface-150 bg-surface-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <h3 className="text-xs font-extrabold text-surface-800 uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles className="w-4 h-4 text-brand-600 animate-pulse" />
                                <span>Workforce Operational Accomplishments Ledger</span>
                              </h3>
                              <p className="text-[10px] text-surface-400 mt-0.5">Chronological record of bookings processed, guest transactions, support chat tickets, and checkout tasks performed.</p>
                            </div>

                            <span className="text-[10px] font-bold text-surface-600 bg-surface-100 px-2.5 py-1 rounded-lg">
                              Total Logged: {workforceAccomplishments.filter(acc => isDateInPreset(acc.created_at)).length} actions
                            </span>
                          </div>

                          {(() => {
                            const filteredAcc = workforceAccomplishments.filter(acc => isDateInPreset(acc.created_at));

                            const checkInsCount = filteredAcc.filter(a => a.action === 'Check In').length;
                            const checkOutsCount = filteredAcc.filter(a => a.action === 'Check Out').length;
                            const chatRepliesCount = filteredAcc.filter(a => a.action === 'Chat Reply' || a.action === 'Chat Response').length;
                            const orderUpdatesCount = filteredAcc.filter(a => a.action === 'Order Update' || a.action === 'Order Processed').length;
                            const serviceRequestsCount = filteredAcc.filter(a => a.action === 'Service Request Update').length;
                            const cancellationsCount = filteredAcc.filter(a => a.action === 'Cancelled').length;

                            return (
                              <div className="p-5 space-y-5 text-xs">
                                {/* Stats breakdown row */}
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                  <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3 text-center">
                                    <p className="text-[9px] font-bold text-emerald-800 uppercase tracking-wider">Bookings & Check-In</p>
                                    <p className="text-lg font-extrabold text-emerald-700 mt-0.5">{checkInsCount}</p>
                                  </div>
                                  <div className="bg-sky-50/40 border border-sky-100 rounded-xl p-3 text-center">
                                    <p className="text-[9px] font-bold text-sky-800 uppercase tracking-wider">Completed Check-Out</p>
                                    <p className="text-lg font-extrabold text-sky-700 mt-0.5">{checkOutsCount}</p>
                                  </div>
                                  <div className="bg-purple-50/40 border border-purple-100 rounded-xl p-3 text-center">
                                    <p className="text-[9px] font-bold text-purple-800 uppercase tracking-wider">Chats Responded</p>
                                    <p className="text-lg font-extrabold text-purple-700 mt-0.5">{chatRepliesCount}</p>
                                  </div>
                                  <div className="bg-amber-50/40 border border-amber-100 rounded-xl p-3 text-center">
                                    <p className="text-[9px] font-bold text-amber-800 uppercase tracking-wider">Orders Handled</p>
                                    <p className="text-lg font-extrabold text-amber-700 mt-0.5">{orderUpdatesCount}</p>
                                  </div>
                                  <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3 text-center">
                                    <p className="text-[9px] font-bold text-indigo-800 uppercase tracking-wider">Service Requests</p>
                                    <p className="text-lg font-extrabold text-indigo-700 mt-0.5">{serviceRequestsCount}</p>
                                  </div>
                                  <div className="bg-rose-50/40 border border-rose-100 rounded-xl p-3 text-center">
                                    <p className="text-[9px] font-bold text-rose-800 uppercase tracking-wider">Cancelled Bookings</p>
                                    <p className="text-lg font-extrabold text-rose-700 mt-0.5">{cancellationsCount}</p>
                                  </div>
                                </div>

                                {filteredAcc.length === 0 ? (
                                  <div className="py-10 text-center text-surface-400">
                                    <span>No recorded accomplishments found for the selected filter set.</span>
                                  </div>
                                ) : (
                                  <div className="border border-surface-200 rounded-xl overflow-hidden shadow-sm bg-white">
                                    <div className="overflow-y-auto max-h-80 divide-y divide-surface-100">
                                      {filteredAcc.map((item) => {
                                        let actionBadgeStyle = 'bg-surface-50 text-surface-700 border-surface-150';
                                        if (item.action === 'Check In') actionBadgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-150';
                                        else if (item.action === 'Check Out') actionBadgeStyle = 'bg-sky-50 text-sky-700 border-sky-150';
                                        else if (item.action === 'Chat Reply' || item.action === 'Chat Response') actionBadgeStyle = 'bg-purple-50 text-purple-700 border-purple-150';
                                        else if (item.action === 'Order Update') actionBadgeStyle = 'bg-amber-50 text-amber-700 border-amber-150';
                                        else if (item.action === 'Service Request Update') actionBadgeStyle = 'bg-indigo-50 text-indigo-700 border-indigo-150';
                                        else if (item.action === 'Cancelled') actionBadgeStyle = 'bg-rose-50 text-rose-700 border-rose-150';
                                        else if (item.action === 'Clock In' || item.action === 'Clock Out') actionBadgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';

                                        return (
                                          <div key={item.id} className="p-3 hover:bg-surface-50/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                                            <div className="flex items-center gap-3 flex-wrap">
                                              <span className={`px-2 py-0.5 border text-[8px] font-extrabold uppercase rounded-md tracking-wider leading-none ${actionBadgeStyle}`}>
                                                {item.action}
                                              </span>
                                              <div>
                                                <p className="font-semibold text-surface-850">{item.details}</p>
                                                <p className="text-[10px] text-surface-400">By user: <span className="font-bold text-surface-600">{item.user_name || 'Staff Member'}</span></p>
                                              </div>
                                            </div>
                                            <span className="text-[10px] font-mono text-surface-400 whitespace-nowrap self-start sm:self-center">
                                              {new Date(item.created_at).toLocaleString()}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })()}

                  {/* === PAYROLL SUB-TAB === */}
                  {wfSubTab === 'payroll' && (
                    <PayrollCenter
                      employees={employees}
                      employeePayrolls={employeePayrolls}
                      timeEntries={timeEntries}
                      payrollPeriods={payrollPeriods}
                      payrollEntries={payrollEntries}
                      currencySymbol={settings.currencySymbol}
                      onProcessPeriod={handleProcessPayrollPeriod}
                      onOpenPayslip={handleOpenPayslip}
                      onUpdateEntryStatus={handleUpdatePayrollEntryStatus}
                    />
                  )}

                  {/* === SCHEDULES & SWAP BOARD SUB-TAB === */}
                  {wfSubTab === 'shifts' && (
                    <ShiftScheduleTab
                      employees={employees}
                      currencySymbol={settings.currencySymbol}
                      userProfile={userProfile as any}
                      logActivity={async (action, details) => {
                        await supabase.from('activity_logs').insert({
                          user_id: userProfile?.id,
                          user_name: userProfile?.full_name || 'Admin',
                          action,
                          details
                        });
                      }}
                      showSuccess={(msg) => addToast('success', 'Schedule', msg)}
                      showError={(title, msg) => triggerAlert(title, msg)}
                    />
                  )}


                </div>
              )}
              {activeTab === 'guests' && (() => {
                const activeBookingIds = new Set(bookings.filter(b => b.status === 'checked-in').map(b => b.customer_id));
                const allActive = customers.filter(c => activeBookingIds.has(c.id));
                const inactive = customers.filter(c => !activeBookingIds.has(c.id));

                const showAll = guestShowAll;
                const setShowAll = setGuestShowAll;
                const dateFrom = guestDateFrom;
                const setDateFrom = setGuestDateFrom;
                const dateTo = guestDateTo;
                const setDateTo = setGuestDateTo;
                const searchQuery = guestSearchQuery;
                const setSearchQuery = setGuestSearchQuery;

                const visible = showAll ? customers : allActive;

                const filtered = visible.filter(c => {
                  const custBookings = bookings.filter(b => b.customer_id === c.id);
                  if (dateFrom || dateTo) {
                    const inRange = custBookings.some(b => {
                      const ci = b.check_in_date;
                      const co = b.check_out_date;
                      if (dateFrom && ci && ci < dateFrom) return false;
                      if (dateTo && ci && ci > dateTo) return false;
                      if (dateFrom && co && co < dateFrom) return false;
                      if (dateTo && co && co > dateTo) return false;
                      return true;
                    });
                    if (!inRange) return false;
                  }
                  if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    const matchName = c.full_name?.toLowerCase().includes(q);
                    const matchEmail = c.email?.toLowerCase().includes(q);
                    const matchPhone = c.phone?.toLowerCase().includes(q);
                    const matchRoom = custBookings.some(b => (b.rooms as any)?.room_number?.toLowerCase().includes(q));
                    if (!matchName && !matchEmail && !matchPhone && !matchRoom) return false;
                  }
                  return true;
                });

                const summaryActive = allActive.length;
                return (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-surface-900 tracking-tight">Guest Registry</h2>
                      <p className="text-xs text-surface-400 mt-0.5">
                        {summaryActive} guest{summaryActive !== 1 ? 's' : ''} currently checked in
                        {inactive.length > 0 && ` · ${inactive.length} past`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setShowAll(!showAll)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border cursor-pointer transition-all ${
                          showAll
                            ? 'bg-surface-900 text-white border-surface-900'
                            : 'bg-white text-surface-600 border-surface-200 hover:border-surface-400'
                        }`}
                      >
                        {showAll ? 'Active Only' : 'Show All'}
                      </button>
                      <button onClick={() => exportToCSV(customers.map(c => ({ Name: c.full_name, Email: c.email, Phone: c.phone || '', Created: new Date(c.created_at).toLocaleDateString() })), "guests")} className="px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 transition-all text-[10px] font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"><Download className="w-3 h-3" /> CSV</button>
                      <span className="text-xs text-surface-400 font-mono">{filtered.length}</span>
                    </div>
                  </div>

                  {/* Filter Bar */}
                  <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-3 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                      <input
                        type="text"
                        placeholder="Search guest name, email, phone, room..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-surface-50 border border-surface-200 rounded-lg pl-9 pr-3 py-2 text-xs text-surface-800 placeholder:text-surface-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 text-xs text-surface-700 focus:outline-none focus:border-brand-500 transition-all"
                        title="From date"
                      />
                      <span className="text-[10px] text-surface-400">—”</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 text-xs text-surface-700 focus:outline-none focus:border-brand-500 transition-all"
                        title="To date"
                      />
                      {(dateFrom || dateTo || searchQuery) && (
                        <button
                          onClick={() => { setDateFrom(''); setDateTo(''); setSearchQuery(''); }}
                          className="px-2.5 py-2 text-[10px] text-surface-500 hover:text-surface-800 font-semibold cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto">
                      <Users className="w-10 h-10 text-surface-300 mx-auto mb-4" />
                      <h3 className="text-base font-semibold text-surface-800">
                        {showAll ? 'Guest registry is empty' : 'No active guests'}
                      </h3>
                      <p className="text-xs text-surface-400 mt-1">
                        {showAll
                          ? 'Guest contacts will be filed when checking out on room reservations.'
                          : 'Guests currently checked into a room will appear here.'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                      {filtered.map((cust) => {
                        const custBookings = bookings.filter(b => b.customer_id === cust.id);
                        const custBookingIds = custBookings.map(b => b.id);
                        const custOrders = guestOrders.filter(o => custBookingIds.includes(o.booking_id));
                        const active = custBookings.find(b => b.status === 'checked-in');
                        const bookingRevenue = custBookings.reduce((s, b) => s + Number(b.total_price), 0);
                        const ordersRevenue = custOrders.reduce((s, o) => s + Number(o.total_price), 0);
                        const totalSpent = bookingRevenue + ordersRevenue;

                        let stayDuration = '';
                        if (active && active.check_in_date) {
                          const parseTime12to24 = (t: string) => {
                            if (!t) return 0;
                            const [time, ampm] = t.split(' ');
                            let [h, m] = time.split(':').map(Number);
                            if (ampm === 'PM' && h !== 12) h += 12;
                            if (ampm === 'AM' && h === 12) h = 0;
                            return h * 60 + m;
                          };
                          const ciDate = new Date(active.check_in_date);
                          const ciMinutes = parseTime12to24(active.check_in_time || '');
                          ciDate.setHours(Math.floor(ciMinutes / 60), ciMinutes % 60, 0, 0);
                          const now = new Date();
                          const diffMs = now.getTime() - ciDate.getTime();
                          if (diffMs > 0) {
                            const hrs = Math.floor(diffMs / 3600000);
                            const mins = Math.floor((diffMs % 3600000) / 60000);
                            if (hrs >= 24) {
                              const days = Math.floor(hrs / 24);
                              const remainingHrs = hrs % 24;
                              stayDuration = `${days}d ${remainingHrs}h ${mins}m`;
                            } else {
                              stayDuration = `${hrs}h ${mins}m`;
                            }
                          }
                        }

                        const roomNumber = active ? (active.rooms as any)?.room_number || 'N/A' : null;

                        return (
                          <div key={cust.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-all ${active ? 'border-emerald-200 ring-1 ring-emerald-100/50' : 'border-surface-100 opacity-70 hover:opacity-100'}`}>
                            <div className={`px-4 sm:px-5 py-4 ${active ? 'bg-gradient-to-r from-emerald-50/80 to-white border-b border-emerald-100/50' : 'bg-surface-50/50 border-b border-surface-100'}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${active ? 'bg-emerald-50 text-emerald-600 ring-2 ring-emerald-200/50' : 'bg-brand-50 text-brand-600'}`}>
                                    {cust.full_name?.charAt(0)?.toUpperCase() || '?'}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-bold text-surface-900 truncate leading-tight">{cust.full_name}</p>
                                      <button onClick={() => { setGuestNotesForm({ notes: cust.notes || '', preferences: cust.preferences ? JSON.stringify(cust.preferences, null, 2) : '{}' }); setGuestNotesModal(cust); }} className="p-0.5 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors cursor-pointer flex-shrink-0" title="Edit notes &amp; preferences"><Edit3 className="w-3 h-3" /></button>
                                    </div>
                                    <p className="text-[10px] text-surface-400 truncate">{cust.email}</p>
                                    {cust.preferences && typeof cust.preferences === 'object' && Object.keys(cust.preferences).length > 0 && (
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {Object.entries(cust.preferences).slice(0, 3).map(([key, val]) => (
                                          <span key={key} className="px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded text-[8px] font-medium">{key}: {String(val)}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {active ? (
                                  <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[8px] font-bold uppercase flex items-center gap-1 flex-shrink-0 leading-none">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                    Active
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 bg-surface-100 text-surface-400 rounded-full text-[8px] font-medium flex-shrink-0 leading-none">
                                    Checked Out
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="px-4 sm:px-5 py-3 space-y-3">
                              <div className="flex items-center gap-3 text-[10px] text-surface-500">
                                <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{cust.phone || 'N/A'}</span>
                                {roomNumber && (
                                  <span className="flex items-center gap-1 ml-auto"><Building className="w-3 h-3" />Room {roomNumber}</span>
                                )}
                              </div>

                              <div className="grid grid-cols-3 gap-2 py-2 border-y border-surface-100">
                                <div className="text-center">
                                  <span className="text-sm font-bold text-surface-900 block leading-tight">{custBookings.length}</span>
                                  <span className="text-[8px] text-surface-400 uppercase tracking-wider">Stays</span>
                                </div>
                                <div className="text-center">
                                  <span className="text-sm font-bold text-surface-900 block leading-tight">{settings.currencySymbol}{totalSpent.toLocaleString()}</span>
                                  <span className="text-[8px] text-surface-400 uppercase tracking-wider">Spent</span>
                                </div>
                                <div className="text-center">
                                  <span className="text-sm font-bold text-surface-900 block leading-tight">{custOrders.length}</span>
                                  <span className="text-[8px] text-surface-400 uppercase tracking-wider">Orders</span>
                                </div>
                              </div>

                              <div className="bg-surface-50 rounded-lg p-2.5 border border-surface-100 space-y-1">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-surface-500">Room revenue</span>
                                  <span className="font-semibold text-surface-800">{settings.currencySymbol}{bookingRevenue.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-surface-500">F&B orders</span>
                                  <span className="font-semibold text-surface-800">{settings.currencySymbol}{ordersRevenue.toLocaleString()}</span>
                                </div>
                              </div>

                              {active && (() => {
                                const coDate = active.check_out_date ? new Date(active.check_out_date) : null;
                                const coTime = active.check_out_time || '';
                                const isOverdue = coDate && coDate <= new Date();
                                return (
                                <div className={`rounded-xl border p-3 ${isOverdue ? 'bg-amber-50/70 border-amber-200' : 'bg-emerald-50/50 border-emerald-200'}`}>
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <Building className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="text-xs font-bold text-emerald-800">Room {roomNumber}</span>
                                    <span className="text-[9px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded font-medium ml-auto">{active.rooms?.type}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                                    <div>
                                      <span className="text-emerald-600 block">Check-in</span>
                                      <span className="text-emerald-900 font-semibold">{new Date(active.check_in_date).toLocaleDateString()} {active.check_in_time}</span>
                                    </div>
                                    <div>
                                      <span className={isOverdue ? 'text-amber-600 block' : 'text-emerald-600 block'}>Check-out</span>
                                      <span className={`font-semibold ${isOverdue ? 'text-amber-900' : 'text-emerald-900'}`}>
                                        {coDate ? coDate.toLocaleDateString() : '—”'} {coTime}
                                        {isOverdue && <span className="ml-1 text-[8px] text-amber-600">(overdue)</span>}
                                      </span>
                                    </div>
                                  </div>
                                  {stayDuration && (
                                    <div className="mt-2 pt-2 border-t border-emerald-200 flex items-center gap-1.5">
                                      <Clock className="w-3 h-3 text-emerald-500" />
                                      <span className="text-[10px] text-emerald-700">
                                        Staying <strong>{stayDuration}</strong>
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )})()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })()}

              {/* TABS 6b: STAFF CALLS */}
                            {activeTab === 'staff_calls' && (
                <AdminStaffCallsTab
                              staffCalls={staffCalls}
                              settings={settings}
                              userProfile={userProfile}
                              addToast={addToast}
                              refreshTable={refreshTable}
                            />
              )}

              {/* TABS 6a: STAY EXTENSIONS */}
                            {activeTab === 'stay_extensions' && (
                <AdminStayExtensionsTab
                              stayExtensions={stayExtensions}
                              settings={settings}
                              userProfile={userProfile}
                              addToast={addToast}
                              refreshTable={refreshTable}
                              loadDatabase={loadDatabase}
                            />
              )}

              {/* TABS 6b: FRONT DESK CHAT */}
                            {activeTab === 'front_desk_chat' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-surface-900 tracking-tight">Front Desk Chat</h2>
                    <p className="text-xs text-surface-400 mt-0.5">View and reply to messages from guests.</p>
                  </div>

                  <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden flex flex-col lg:flex-row" style={{ minHeight: '500px' }}>
                    {/* Conversation List */}
                    <div className={`${chatSidebarCollapsed ? 'lg:w-12' : 'lg:w-80'} border-b lg:border-b-0 lg:border-r border-surface-100 bg-surface-50/50 transition-all duration-200 relative`}>
                      <div className="p-3 border-b border-surface-100 bg-white flex items-center justify-between gap-2">
                        {!chatSidebarCollapsed && <h3 className="text-[10px] font-bold uppercase tracking-wider text-surface-500">Conversations</h3>}
                        <button
                          onClick={() => setChatSidebarCollapsed(p => !p)}
                          className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                          title={chatSidebarCollapsed ? 'Expand' : 'Collapse'}
                        >
                          {chatSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                        </button>
                      </div>
                      {!chatSidebarCollapsed && (
                      <>
                      <div className="p-3 border-b border-surface-100 bg-white space-y-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                          <input
                            type="text"
                            value={chatSearch}
                            onChange={(e) => setChatSearch(e.target.value)}
                            placeholder="Search by guest or unit..."
                            className="w-full bg-surface-50 border border-surface-200 rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-surface-800 placeholder:text-surface-400 focus:outline-none focus:border-brand-500 font-sans"
                          />
                        </div>
                      </div>
                      <div className="overflow-y-auto" style={{ maxHeight: '360px' }}>
                        {chatConversations.filter(c => {
                          if (!chatSearch.trim()) return true;
                          const q = chatSearch.toLowerCase();
                          return c.guestName.toLowerCase().includes(q) || c.roomNumber.toLowerCase().includes(q);
                        }).length === 0 ? (
                          <div className="text-center py-12 px-4">
                            <MessageSquareText className="w-8 h-8 text-surface-300 mx-auto mb-2" />
                            <p className="text-xs text-surface-400">
                              {chatSearch.trim() ? 'No conversations match your search.' : 'No conversations yet.'}
                            </p>
                          </div>
                        ) : (
                          chatConversations.filter(c => {
                            if (!chatSearch.trim()) return true;
                            const q = chatSearch.toLowerCase();
                            return c.guestName.toLowerCase().includes(q) || c.roomNumber.toLowerCase().includes(q);
                          }).map((conv: { bookingId: string; lastMsg: ChatMessage; msgCount: number; guestName: string; roomNumber: string; unreadCount: number }) => (
                            <button
                              key={conv.bookingId}
                              onClick={() => setSelectedChatBooking(conv.bookingId)}
                              className={`w-full text-left px-4 py-3 border-b border-surface-100 hover:bg-surface-800 transition-colors cursor-pointer ${selectedChatBooking === conv.bookingId ? 'bg-white border-l-2 border-l-emerald-500' : ''}`}
                            >
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-surface-900 truncate max-w-[140px]">{conv.guestName}</span>
                                <span className="text-[9px] text-surface-400 whitespace-nowrap ml-2">
                                  {new Date(conv.lastMsg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                              <p className="text-[10px] text-surface-500">Suite {conv.roomNumber}</p>
                              <div className="flex justify-between items-center mt-1">
                                <p className="text-[10px] text-surface-400 truncate max-w-[160px]">{conv.lastMsg.message}</p>
                                <span className="text-[9px] text-surface-400">{conv.msgCount} msgs</span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                      </>
                      )}
                    </div>

                    {/* Chat View */}
                    <div className="flex-1 flex flex-col">
                      {!selectedChatBooking ? (
                        <div className="flex-1 flex items-center justify-center text-center p-8">
                          <div>
                            <MessageSquareText className="w-12 h-12 text-surface-200 mx-auto mb-3" />
                            <p className="text-sm font-semibold text-surface-500">Select a conversation</p>
                            <p className="text-xs text-surface-400 mt-1">Choose a guest conversation from the list to view and reply.</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Chat Header */}
                          <div className="px-5 py-3 border-b border-surface-100 bg-white flex items-center gap-3">
                            <button
                              onClick={() => setSelectedChatBooking(null)}
                              className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                              title="Close conversation"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                            <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0">
                              <MessageSquareText className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-surface-900 truncate">
                                {chatMessages.find(m => m.booking_id === selectedChatBooking)?.bookings?.customers?.full_name || 'Guest'}
                              </p>
                              <p className="text-[10px] text-surface-400">
                                Suite {chatMessages.find(m => m.booking_id === selectedChatBooking)?.bookings?.rooms?.room_number || 'N/A'}
                              </p>
                            </div>
                          </div>

                          {/* Messages */}
                          <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-surface-50/50" style={{ maxHeight: '360px' }}>
                            {chatMessages.filter(m => m.booking_id === selectedChatBooking).length === 0 ? (
                              <div className="text-center py-8">
                                <p className="text-xs text-surface-400">No messages in this conversation.</p>
                              </div>
                            ) : (
                              chatMessages
                                .filter(m => m.booking_id === selectedChatBooking)
                                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                                .map(msg => (
                                  <div key={msg.id} className={`flex ${msg.sender_role === 'staff' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${msg.sender_role === 'staff' ? 'bg-brand-600 text-white rounded-br-md' : 'bg-white border border-surface-200 text-surface-800 rounded-bl-md shadow-sm'}`}>
                                      <p className="text-[10px] font-semibold mb-0.5 opacity-80">
                                        {msg.sender_role === 'staff' ? `You (${msg.sender_name})` : msg.sender_name}
                                      </p>
                                      <p className="text-sm leading-relaxed">{msg.message}</p>
                                      <p className={`text-[9px] mt-1 ${msg.sender_role === 'staff' ? 'text-brand-200' : 'text-surface-400'}`}>
                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                                      </p>
                                      {msg.sender_role === 'guest' && msg.message.includes('🍽️') && selectedChatBooking && (
                                        <button
                                          onClick={async () => {
                                            setActiveTab('inventory');
                                            const { data: freshOrders } = await supabase
                                              .from('guest_orders')
                                              .select('*, inventory_items(*), bookings(*, customers(*), rooms(*))')
                                              .eq('booking_id', selectedChatBooking)
                                              .order('created_at', { ascending: false });
                                            if (freshOrders && freshOrders.length > 0) {
                                              const b = freshOrders[0].bookings;
                                              const guestName = (b as any)?.customers?.full_name || 'Guest';
                                              const roomNum = (b as any)?.rooms?.room_number || '?';
                                              setRoomOrdersModal({ roomNumber: `Suite ${roomNum}`, guestName, orders: freshOrders as GuestOrder[] });
                                            }
                                          }}
                                          className="mt-2 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[9px] font-bold hover:bg-emerald-100 transition-colors cursor-pointer flex items-center gap-1"
                                        >
                                          View Orders —†’
                                        </button>
                                      )}
                                      {msg.sender_role === 'guest' && msg.message.includes('🕐') && selectedChatBooking && (
                                        <button
                                          onClick={() => {
                                            setActiveTab('stay_extensions');
                                          }}
                                          className="mt-2 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[9px] font-bold hover:bg-amber-100 transition-colors cursor-pointer flex items-center gap-1"
                                        >
                                          View Extension —†’
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))
                            )}
                            {/* Typing indicator */}
                            {selectedChatBooking && typingUsers.filter(t => t.booking_id === selectedChatBooking).length > 0 && (
                              <div className="flex justify-start">
                                <div className="bg-white border border-surface-200 rounded-2xl rounded-bl-md px-4 py-2 shadow-sm">
                                  <p className="text-[10px] text-surface-400">
                                    <span className="animate-pulse">Guest is typing</span>
                                    <span className="inline-flex ml-1">
                                      <span className="w-1 h-1 bg-surface-400 rounded-full animate-bounce mx-[1px]" style={{ animationDelay: '0ms' }} />
                                      <span className="w-1 h-1 bg-surface-400 rounded-full animate-bounce mx-[1px]" style={{ animationDelay: '150ms' }} />
                                      <span className="w-1 h-1 bg-surface-400 rounded-full animate-bounce mx-[1px]" style={{ animationDelay: '300ms' }} />
                                    </span>
                                  </p>
                                </div>
                              </div>
                            )}
                            <div ref={chatEndRef} />
                          </div>

                          {/* Reply Input */}
                          <div className="border-t border-surface-100 p-4 bg-white">
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                if (!chatInput.trim() || !selectedChatBooking) return;
                                try {
                                  const { data: newMsgData, error } = await supabase.from('chat_messages').insert({
                                    booking_id: selectedChatBooking,
                                    sender_id: userProfile?.id,
                                    sender_name: userProfile?.full_name || 'Front Desk',
                                    sender_role: 'staff',
                                    message: chatInput.trim()
                                  }).select();
                                  if (error) throw error;
                                  if (newMsgData?.[0]) {
                                    setChatMessages(prev => [newMsgData[0] as ChatMessage, ...prev]);
                                  }
                                  setChatInput('');
                                  // Clear typing status after sending
                                  if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                                  typingTimerRef.current = null;
                                  if (userProfile?.id) {
                                    supabase.from('chat_typing').upsert({
                                      booking_id: selectedChatBooking,
                                      user_id: userProfile.id,
                                      user_name: userProfile.full_name || 'Front Desk',
                                      user_role: 'staff',
                                      is_typing: false
                                    }, { onConflict: 'booking_id, user_id' }).then(() => {});
                                  }
                                  await refreshTable('chat_messages');
                                } catch (err: any) {
                                  triggerAlert('Error', err.message);
                                }
                              }}
                              className="flex gap-2"
                            >
                              <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => {
                                  setChatInput(e.target.value);
                                  // Update typing indicator
                                  if (!selectedChatBooking || !userProfile?.id) return;
                                  if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                                  typingTimerRef.current = setTimeout(() => {
                                    supabase.from('chat_typing').upsert({
                                      booking_id: selectedChatBooking,
                                      user_id: userProfile.id,
                                      user_name: userProfile.full_name || 'Front Desk',
                                      user_role: 'staff',
                                      is_typing: false
                                    }, { onConflict: 'booking_id, user_id' }).then(() => {});
                                    typingTimerRef.current = null;
                                  }, 2000);
                                  if (e.target.value.trim()) {
                                    supabase.from('chat_typing').upsert({
                                      booking_id: selectedChatBooking,
                                      user_id: userProfile.id,
                                      user_name: userProfile.full_name || 'Front Desk',
                                      user_role: 'staff',
                                      is_typing: true
                                    }, { onConflict: 'booking_id, user_id' }).then(() => {});
                                  }
                                }}
                                placeholder="Type your reply..."
                                className="flex-1 bg-surface-50 border border-surface-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                              />
                              <button
                                type="submit"
                                disabled={!chatInput.trim() || !selectedChatBooking}
                                className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-surface-200 text-white rounded-xl cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
                              >
                                <Send className="w-4 h-4" />
                                <span className="text-xs font-semibold hidden sm:inline">Send</span>
                              </button>
                            </form>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

{/* TABS 6: AUDIT LOGS FULL */}
                            {activeTab === 'audit_logs' && (
                <AdminAuditLogsTab
                              logs={logs}
                              logHasMore={logHasMore}
                              loadMoreLogs={loadMoreLogs}
                              exportLogsToPDF={exportLogsToPDF}
                            />
              )}

              {/* TABS 7: KITCHEN INVENTORY */}
              {activeTab === 'inventory' && (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-surface-900 tracking-tight">Kitchen Menu &amp; Inventory</h2>
                      <p className="text-xs text-surface-400 mt-0.5">Manage menu categories, stock levels, and track guest orders.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleOpenItemCreate}
                        className="px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 transition-all text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Menu Item</span>
                      </button>
                      <button onClick={() => exportToCSV(inventoryItems.map(i => ({ Name: i.name, Category: i.menu_categories?.name || '', Price: i.price, Stock: i.stock_quantity, Unit: i.unit })), "inventory")} className="px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700 transition-all text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5" /> Export CSV</button>
                    </div>
                  </div>

                  {/* Inventory Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl border border-surface-100 p-4 shadow-sm flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Package className="w-5 h-5 text-brand-600" />
                      </div>
                      <div>
                        <span className="text-[9px] text-surface-400 font-bold uppercase tracking-wider block">Total Items</span>
                        <span className="text-xl font-bold text-surface-900">{inventoryItems.length}</span>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-surface-100 p-4 shadow-sm flex items-center gap-3">
                      <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Tag className="w-5 h-5 text-violet-600" />
                      </div>
                      <div>
                        <span className="text-[9px] text-surface-400 font-bold uppercase tracking-wider block">Categories</span>
                        <span className="text-xl font-bold text-surface-900">{menuCategories.length}</span>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-surface-100 p-4 shadow-sm flex items-center gap-3">
                      <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="w-5 h-5 text-rose-600" />
                      </div>
                      <div>
                        <span className="text-[9px] text-surface-400 font-bold uppercase tracking-wider block">Low Stock</span>
                        <span className="text-xl font-bold text-rose-600">{lowStockItems.length}</span>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-surface-100 p-4 shadow-sm flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <span className="text-[9px] text-surface-400 font-bold uppercase tracking-wider block">Total Orders</span>
                        <span className="text-xl font-bold text-surface-900">{guestOrders.length}</span>
                      </div>
                    </div>
                  </div>

                  {/* Low Stock Alert Banner */}
                  {lowStockItems.length > 0 && (
                    <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-start gap-3 mb-4">
                        <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-rose-800 text-sm block">Low Stock Alert —” {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} running low</span>
                          <span className="text-xs text-rose-600 mt-0.5 block">Items below their configured threshold need to be restocked.</span>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        {lowStockItems.slice(0, 8).map(item => {
                          const stock = Number(item.stock_quantity);
                          const threshold = Number(item.low_stock_threshold);
                          const pct = threshold > 0 ? Math.min(100, (stock / threshold) * 100) : 0;
                          return (
                            <div key={item.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-rose-100">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-xs font-semibold text-surface-800 truncate">{item.name}</span>
                                  <span className="text-[10px] font-mono font-bold text-rose-700 flex-shrink-0 ml-2">{stock} / {threshold} {item.unit}</span>
                                </div>
                                <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-rose-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                              <button onClick={() => handleOpenStockAdjust(item)} className="px-2 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[9px] font-semibold hover:bg-rose-100 cursor-pointer flex-shrink-0">Restock</button>
                            </div>
                          );
                        })}
                        {lowStockItems.length > 8 && (
                          <div className="text-center pt-1">
                            <span className="text-[10px] text-rose-600 font-medium">+{lowStockItems.length - 8} more low-stock items</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Menu Categories Bar + Item Search + Filter */}
                  <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-surface-400" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-surface-500">Categories</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input type="text" value={newMenuCatName} onChange={(e) => setNewMenuCatName(e.target.value)}
                          placeholder="New category..." className="w-32 bg-surface-50 border border-surface-200 rounded-lg px-2.5 py-1 text-[10px] focus:outline-none focus:border-brand-500"
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddMenuCategory(); } }} />
                        <button onClick={handleAddMenuCategory} className="px-2.5 py-1 bg-brand-600 text-white rounded-lg text-[9px] font-semibold hover:bg-brand-700 cursor-pointer">Add</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button onClick={() => setItemCategoryFilter('all')}
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider cursor-pointer transition-all ${itemCategoryFilter === 'all' ? 'bg-surface-900 text-white' : 'bg-surface-50 text-surface-500 hover:bg-surface-100'}`}>All</button>
                      {menuCategories.map(cat => (
                        <div key={cat.id} className="flex items-center gap-0">
                          <button onClick={() => setItemCategoryFilter(cat.id)}
                            className={`px-2.5 py-1 rounded-l-lg text-[9px] font-bold uppercase tracking-wider cursor-pointer transition-all ${itemCategoryFilter === cat.id ? 'bg-brand-600 text-white' : 'bg-surface-50 text-surface-500 hover:bg-surface-100'}`}>{cat.name}</button>
                          <button onClick={() => handleDeleteMenuCategory(cat)}
                            className={`px-1.5 py-1 rounded-r-lg text-[8px] cursor-pointer transition-all ${itemCategoryFilter === cat.id ? 'bg-brand-700 text-white hover:bg-brand-800' : 'bg-surface-50 text-surface-400 hover:bg-surface-100 hover:text-surface-600'}`}>Ã—</button>
                        </div>
                      ))}
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                      <input type="text" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)}
                        placeholder="Search menu items..." className="w-full bg-surface-50 border border-surface-200 rounded-xl pl-9 pr-4 py-2 text-xs text-surface-800 placeholder:text-surface-400 focus:outline-none focus:border-brand-500" />
                    </div>
                  </div>

                  {/* Browse Menu Button */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-surface-400 font-medium">{inventoryItems.length} item{inventoryItems.length > 1 ? 's' : ''} in menu</span>
                      {itemCategoryFilter !== 'all' && <span className="text-[10px] text-surface-300">· filtered by category</span>}
                    </div>
                    <button onClick={() => setMenuModal(true)} className="px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm">
                      <Package className="w-4 h-4" />
                      <span>Browse Menu</span>
                    </button>
                  </div>

                  {/* Guest Orders Pipeline —” grouped by room, active (checked-in) guests only */}
                  {(() => {
                    const activeOrders = guestOrders.filter(o => o.bookings?.status === 'checked-in');
                    if (activeOrders.length === 0) return null;
                    const roomGroups = activeOrders.reduce<Record<string, { guestName: string; orders: GuestOrder[] }>>((acc, o) => {
                      const roomKey = `Suite ${o.bookings?.rooms?.room_number || '?'}`;
                      if (!acc[roomKey]) acc[roomKey] = { guestName: o.bookings?.customers?.full_name || 'N/A', orders: [] };
                      acc[roomKey].orders.push(o);
                      return acc;
                    }, {});
                    const totalPending = activeOrders.filter(o => o.status === 'pending').length;
                    const totalPreparing = activeOrders.filter(o => o.status === 'preparing').length;
                    return (
                    <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShoppingCart className="w-4 h-4 text-emerald-600" />
                          <h3 className="text-xs font-bold text-surface-900">Live Guest Orders</h3>
                          <span className="text-[10px] text-surface-400">({Object.keys(roomGroups).length} rooms</span>
                          <span className="text-[10px] text-surface-300">· {activeOrders.length} items)</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px]">
                          {totalPending > 0 && (
                            <span className="flex items-center gap-1 text-sky-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />{totalPending} new
                            </span>
                          )}
                          {totalPreparing > 0 && (
                            <span className="flex items-center gap-1 text-amber-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{totalPreparing} cooking
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                        {Object.entries(roomGroups).map(([roomKey, group]) => {
                          const pendingCount = group.orders.filter(o => o.status === 'pending').length;
                          const preparingCount = group.orders.filter(o => o.status === 'preparing').length;
                          const servedCount = group.orders.filter(o => o.status === 'served').length;
                          const totalSpend = group.orders.reduce((s, o) => s + Number(o.total_price), 0);
                          return (
                            <button
                              key={roomKey}
                              onClick={() => setRoomOrdersModal({ roomNumber: roomKey, guestName: group.guestName, orders: group.orders })}
                              className="bg-white border border-surface-200 rounded-xl p-4 text-left hover:border-emerald-600 hover:shadow-md transition-all cursor-pointer group"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-sm font-mono">
                                    {roomKey.replace('Suite ', '')}
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-surface-900">{roomKey}</p>
                                    <p className="text-[10px] text-surface-400 truncate max-w-[120px]">{group.guestName}</p>
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-surface-300 group-hover:text-emerald-500 transition-colors" />
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {pendingCount > 0 && (
                                  <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-full text-[9px] font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />{pendingCount} new
                                  </span>
                                )}
                                {preparingCount > 0 && (
                                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[9px] font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{preparingCount} cooking
                                  </span>
                                )}
                                {servedCount > 0 && (
                                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[9px] font-bold">
                                    {servedCount} served
                                  </span>
                                )}
                                <span className="text-[9px] text-surface-400 font-medium ml-auto">{settings.currencySymbol}{totalSpend.toFixed(2)}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })()}
                </div>
              )}

              {/* TABS 11: GUEST MESSAGES INBOX */}
                            {activeTab === 'messages' && (
                <AdminMessagesTab
                              contactMessages={contactMessages}
                              setContactMessages={setContactMessages}
                              loadDatabase={loadDatabase}
                              addToast={addToast}
                              triggerAlert={triggerAlert}
                            />
              )}

              {/* TABS 12: ROOM QR CODES */}
                            {activeTab === 'qr_codes' && (
                <AdminQRCodesTab
                              rooms={rooms}
                              settings={settings}
                              onNavigate={() => setActiveTab('settings')}
                            />
              )}

              {/* TABS 13: PROMOTIONS (Promo Codes, Rate Plans, Waitlist) */}
                            {activeTab === 'promotions' && (
                <AdminPromotionsTab
                  promoCodes={promoCodes}
                  ratePlans={ratePlans}
                  waitlist={waitlist}
                  rooms={rooms}
                  bookings={bookings}
                  userProfile={userProfile}
                  settings={settings}
                  addToast={addToast}
                  refreshTable={refreshTable}
                  triggerConfirm={triggerConfirm}
                  triggerAlert={triggerAlert}
                />
              )}

              {/* TABS 14: HOUSEKEEPING MANAGEMENT */}
              {activeTab === 'housekeeping' && (
                <AdminHousekeepingTab
                  housekeepingTasks={housekeepingTasks}
                  rooms={rooms}
                  employees={employees}
                  userProfile={userProfile}
                  settings={settings}
                  addToast={addToast}
                  refreshTable={refreshTable}
                  triggerConfirm={triggerConfirm}
                  triggerAlert={triggerAlert}
                />
              )}

              {/* TABS 15: ENHANCED REPORTS & EXPORT */}
              {activeTab === 'reports' && (
                <AdminReportsTab
                  bookings={bookings}
                  rooms={rooms}
                  customers={customers}
                  orders={guestOrders}
                  payments={[]}
                  housekeepingTasks={housekeepingTasks}
                  incidents={incidents}
                  settings={settings}
                  addToast={addToast}
                />
              )}

              {/* TABS 16: MAINTENANCE MANAGEMENT */}
              {activeTab === 'maintenance' && (
                <AdminMaintenanceTab
                  rooms={rooms}
                  employees={employees}
                  housekeepingTasks={housekeepingTasks}
                  userProfile={userProfile}
                  settings={settings}
                  addToast={addToast}
                  refreshTable={refreshTable}
                  triggerConfirm={triggerConfirm}
                  triggerAlert={triggerAlert}
                />
              )}

              {/* TABS 17: LOST & FOUND */}
              {activeTab === 'lost_found' && (
                <AdminLostFoundTab
                  settings={settings}
                  addToast={addToast}
                  refreshTable={refreshTable}
                  triggerConfirm={triggerConfirm}
                  triggerAlert={triggerAlert}
                />
              )}

              {/* TABS 18: RESORT SETTINGS SETUP */}
                            {activeTab === 'settings' && (
                <AdminSettingsTab
                              settings={settings}
                              setSettings={setSettings}
                              userProfile={userProfile}
                              addToast={addToast}
                              triggerAlert={triggerAlert}
                              triggerConfirm={triggerConfirm}
                              loadDatabase={loadDatabase}
                              promoCodes={promoCodes}
                              setPromoCodes={setPromoCodes}
                              showPromoModal={showPromoModal}
                              setShowPromoModal={setShowPromoModal}
                              selectedPromo={selectedPromo}
                              setSelectedPromo={setSelectedPromo}
                              promoForm={promoForm}
                              setPromoForm={setPromoForm}
                            />
              )}
            </motion.div>
          )}
        </main>
      </div>

      {/* INVENTORY ITEM CREATE/EDIT MODAL */}
      {inventoryModal === 'item' && (
        <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-surface-900">{selectedItem ? 'Edit Menu Item' : 'Add Menu Item'}</h3>
                <p className="text-[11px] text-surface-400 mt-0.5">{selectedItem ? 'Update item details and pricing' : 'Add a new item to the kitchen menu'}</p>
              </div>
              <button onClick={() => setInventoryModal(null)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleItemSubmit} className="p-6 space-y-4 text-xs font-sans tracking-tight">
              <div>
                <label className="block text-surface-500 font-medium mb-1">Item Name</label>
                <input type="text" required value={itemForm.name} onChange={(e) => setItemForm({...itemForm, name: e.target.value})}
                  placeholder="e.g. Caprese Salad" className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-surface-500 font-medium mb-1">Category</label>
                  <select value={itemForm.category_id} onChange={(e) => setItemForm({...itemForm, category_id: e.target.value})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 cursor-pointer">
                    <option value="">No category</option>
                    {menuCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-surface-500 font-medium mb-1">Price ({settings.currencyCode})</label>
                  <input type="number" required min={0} step="0.01" value={itemForm.price} onChange={(e) => setItemForm({...itemForm, price: Number(e.target.value)})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-surface-500 font-medium mb-1">Stock Qty</label>
                  <input type="number" required min={0} value={itemForm.stock_quantity} onChange={(e) => setItemForm({...itemForm, stock_quantity: Number(e.target.value)})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 font-mono" />
                </div>
                <div>
                  <label className="block text-surface-500 font-medium mb-1">Unit</label>
                  <select value={itemForm.unit} onChange={(e) => setItemForm({...itemForm, unit: e.target.value})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 cursor-pointer">
                    <option value="piece">piece</option>
                    <option value="serving">serving</option>
                    <option value="plate">plate</option>
                    <option value="glass">glass</option>
                    <option value="bottle">bottle</option>
                    <option value="bowl">bowl</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                  </select>
                </div>
                <div>
                  <label className="block text-surface-500 font-medium mb-1">Low Alert</label>
                  <input type="number" required min={0} value={itemForm.low_stock_threshold} onChange={(e) => setItemForm({...itemForm, low_stock_threshold: Number(e.target.value)})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-surface-500 font-medium mb-1">Description</label>
                <textarea rows={2} value={itemForm.description} onChange={(e) => setItemForm({...itemForm, description: e.target.value})}
                  className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-medium mb-1">Image URL</label>
                <div className="flex gap-2">
                  <input type="url" value={itemForm.image_url}
                    onChange={(e) => setItemForm({...itemForm, image_url: e.target.value})}
                    placeholder="https://example.com/image.jpg"
                    className="flex-1 w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
                  <label className="flex-shrink-0 px-3 py-2.5 bg-brand-50 text-brand-700 hover:bg-brand-100 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors">
                    <ImageUp className="w-3.5 h-3.5" />
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (!isValidImageType(file)) { addToast("error", "Invalid Format", "Please select a JPEG, PNG, GIF, or WebP image."); return; }
                      const b64 = await fileToBase64(file);
                      if (b64) setItemForm({...itemForm, image_url: b64});
                      else addToast("error", "File Too Large", "Image must be under 5MB.");
                      e.target.value = "";
                    }} />
                  </label>
                  {itemForm.image_url && (
                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-surface-200 flex-shrink-0">
                      <img src={itemForm.image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
                <button type="button" onClick={() => setInventoryModal(null)} className="px-4 py-2 border border-surface-200 text-surface-600 hover:bg-surface-50 rounded-lg font-medium cursor-pointer text-xs">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 rounded-lg font-semibold cursor-pointer text-xs">
                  {selectedItem ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      {inventoryModal === 'stock' && selectedItem && (
        <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-surface-900">Adjust Stock: {selectedItem.name}</h3>
                <p className="text-[11px] text-surface-400 mt-0.5">Current stock: {Number(selectedItem.stock_quantity)} {selectedItem.unit}</p>
              </div>
              <button onClick={() => setInventoryModal(null)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleStockAdjust} className="p-6 space-y-4 text-xs font-sans tracking-tight">
              <div className="flex gap-2">
                {(['add', 'remove'] as const).map(a => (
                  <button key={a} type="button" onClick={() => setStockForm({...stockForm, action: a})}
                    className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      stockForm.action === a ? (a === 'add' ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-300' : 'bg-rose-50 text-rose-700 border-2 border-rose-300') : 'bg-surface-50 text-surface-400 border-2 border-transparent hover:border-surface-200'
                    }`}>
                    {a === 'add' ? <><Package className="w-3.5 h-3.5 inline mr-1" /> Add Stock</> : <><Minus className="w-3.5 h-3.5 inline mr-1" /> Remove</>}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-surface-500 font-medium mb-1">Quantity ({selectedItem.unit})</label>
                <input type="number" required min={1} value={stockForm.quantity || ''} onChange={(e) => setStockForm({...stockForm, quantity: Number(e.target.value)})}
                  className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs font-mono focus:outline-none focus:border-brand-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
                <button type="button" onClick={() => setInventoryModal(null)} className="px-4 py-2 border border-surface-200 text-surface-600 hover:bg-surface-50 rounded-lg font-medium cursor-pointer text-xs">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 rounded-lg font-semibold cursor-pointer text-xs">Update Stock</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GUEST ORDER MODAL */}
      {inventoryModal === 'order' && selectedBookingDetail && (
        <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-surface-900">Place Order</h3>
                <p className="text-[11px] text-surface-400 mt-0.5">For {selectedBookingDetail.customers?.full_name} —” Suite {selectedBookingDetail.rooms?.room_number}</p>
              </div>
              <button onClick={() => setInventoryModal(null)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handlePlaceOrder} className="p-6 space-y-4 text-xs font-sans tracking-tight">
              <div>
                <label className="block text-surface-500 font-medium mb-1">Menu Item</label>
                <select value={orderForm.item_id} onChange={(e) => setOrderForm({...orderForm, item_id: e.target.value})}
                  className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 cursor-pointer">
                  {inventoryItems.filter(i => Number(i.stock_quantity) > 0).map(i => (
                    <option key={i.id} value={i.id}>{i.name} —” {settings.currencySymbol}{Number(i.price).toFixed(2)} ({Number(i.stock_quantity)} {i.unit} available)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-surface-500 font-medium mb-1">Quantity</label>
                <input type="number" required min={1} value={orderForm.quantity} onChange={(e) => setOrderForm({...orderForm, quantity: Number(e.target.value)})}
                  className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs font-mono focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-medium mb-1">Notes</label>
                <input type="text" value={orderForm.notes} onChange={(e) => setOrderForm({...orderForm, notes: e.target.value})}
                  placeholder="e.g. No onions" className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
                <button type="button" onClick={() => setInventoryModal(null)} className="px-4 py-2 border border-surface-200 text-surface-600 hover:bg-surface-50 rounded-lg font-medium cursor-pointer text-xs">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-semibold cursor-pointer text-xs">Place Order</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EMPLOYEE CREATE/EDIT MODAL */}
      {employeeModal && (
        <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-surface-900">
                  {employeeModal === 'create' ? 'Add New Employee' : `Edit ${selectedEmployee?.full_name}`}
                </h3>
                <p className="text-[11px] text-surface-400 mt-0.5">
                  {employeeModal === 'create' ? 'Create a new staff account with role-based access' : 'Update staff name or role permissions'}
                </p>
              </div>
              <button type="button" onClick={() => setEmployeeModal(null)}
                className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEmployeeSubmit} className="p-6 space-y-5 text-xs font-sans tracking-tight">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-brand-600 font-mono">
                  <UserCheck className="w-3.5 h-3.5" /> Staff Account Details
                </div>

                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Full Name</label>
                  <input
                    type="text" required
                    value={employeeForm.full_name}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, full_name: e.target.value })}
                    placeholder="e.g. Maria Santos"
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs text-surface-800 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow font-sans tracking-tight"
                  />
                </div>

                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Email Address</label>
                  <input
                    type="email" required
                    value={employeeForm.email}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                    placeholder="e.g. maria@grandhorizon.com"
                    disabled={employeeModal === 'edit'}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs text-surface-800 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow font-sans tracking-tight disabled:bg-surface-50 disabled:text-surface-400"
                  />
                </div>

                {employeeModal === 'create' && (
                  <div>
                    <label className="block text-surface-500 font-medium mb-1.5">Temporary Password</label>
                    <input
                      type="password" required
                      value={employeeForm.password}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                      placeholder="Min. 6 characters"
                      className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs text-surface-800 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow font-sans tracking-tight"
                    />
                    <p className="text-[10px] text-surface-400 mt-1">The employee can change this after first login.</p>
                  </div>
                )}

                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Role Assignment</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'admin' as const, label: 'Admin' },
                      { id: 'front_desk' as const, label: 'Front Desk' },
                      { id: 'cook' as const, label: 'Cook' },
                      { id: 'cleaner' as const, label: 'Cleaner' },
                      { id: 'staff' as const, label: 'Staff' },
                      { id: 'waiter' as const, label: 'Waiter' },
                    ]).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setEmployeeForm({ ...employeeForm, role: r.id })}
                        className={`py-2 px-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          employeeForm.role === r.id
                            ? r.id === 'admin'
                              ? 'bg-brand-50 text-brand-700 border-2 border-brand-300 shadow-sm'
                              : 'bg-emerald-50 text-emerald-700 border-2 border-emerald-300 shadow-sm'
                            : 'bg-surface-50 text-surface-400 border-2 border-transparent hover:border-surface-200 hover:text-surface-600'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-surface-400 mt-1.5">
                    {employeeForm.role === 'admin'
                      ? 'Full access to all settings, rooms, bookings, and workforce management.'
                      : 'Can manage assigned bookings and update room status based on their role. Cannot modify staff or settings.'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
                <button
                  type="button"
                  onClick={() => setEmployeeModal(null)}
                  className="px-4 py-2 border border-surface-200 text-surface-600 hover:bg-surface-50 rounded-lg font-medium cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 rounded-lg font-semibold cursor-pointer text-xs"
                >
                  {employeeModal === 'create' ? 'Create Account' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Payroll Settings Modal */}
      {payrollModal === 'payroll' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-surface-100 p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-surface-900">Payroll Settings</h3>
                <p className="text-[10px] text-surface-400 mt-0.5">Configure hourly rate, overtime, and employment details</p>
              </div>
              <button onClick={() => setPayrollModal(null)} className="p-1 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-4 h-4 text-surface-400" /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Hourly Rate ($)</label>
                  <input type="number" step="0.01" min="0"
                    value={payrollRateForm.hourly_rate}
                    onChange={e => setPayrollRateForm({ ...payrollRateForm, hourly_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Overtime Rate ($)</label>
                  <input type="number" step="0.01" min="0"
                    value={payrollRateForm.overtime_rate}
                    onChange={e => setPayrollRateForm({ ...payrollRateForm, overtime_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Pay Frequency</label>
                  <select value={payrollRateForm.pay_frequency}
                    onChange={e => setPayrollRateForm({ ...payrollRateForm, pay_frequency: e.target.value as "weekly" | "bi-weekly" | "monthly" })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400">
                    <option value="weekly">Weekly</option>
                    <option value="bi-weekly">Bi-Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Employment Type</label>
                  <select value={payrollRateForm.employment_type}
                    onChange={e => setPayrollRateForm({ ...payrollRateForm, employment_type: e.target.value as "regular" | "probationary" | "contractual" | "seasonal" })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400">
                    <option value="regular">Regular</option>
                    <option value="probationary">Probationary</option>
                    <option value="contractual">Contractual</option>
                    <option value="seasonal">Seasonal</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Hire Date</label>
                <input type="date"
                  value={payrollRateForm.hire_date}
                  onChange={e => setPayrollRateForm({ ...payrollRateForm, hire_date: e.target.value })}
                  className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Tax ID</label>
                  <input type="text"
                    value={payrollRateForm.tax_id}
                    onChange={e => setPayrollRateForm({ ...payrollRateForm, tax_id: e.target.value })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Bank Account</label>
                  <input type="text"
                    value={payrollRateForm.bank_account}
                    onChange={e => setPayrollRateForm({ ...payrollRateForm, bank_account: e.target.value })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Remarks</label>
                <textarea rows={2}
                  value={payrollRateForm.remarks}
                  onChange={e => setPayrollRateForm({ ...payrollRateForm, remarks: e.target.value })}
                  className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 resize-none" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-surface-100">
              <button onClick={() => setPayrollModal(null)}
                className="px-4 py-2 text-xs font-semibold text-surface-600 hover:text-surface-800 bg-surface-100 hover:bg-surface-200 rounded-lg cursor-pointer transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveEmployeePayroll}
                className="px-4 py-2 text-xs font-semibold text-white bg-surface-900 hover:bg-surface-800 rounded-lg cursor-pointer transition-colors">
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAYROLL PERIOD CREATION MODAL */}
      {periodModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-surface-100 p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-surface-900">New Payroll Period</h3>
                <p className="text-[10px] text-surface-400 mt-0.5">
                  {periodForm.cutoff_type === 'semi-monthly-first' ? '1st Half of the month (1st - 15th)' :
                   periodForm.cutoff_type === 'semi-monthly-second' ? '2nd Half of the month (16th - EOM)' :
                   'Custom date range'}
                </p>
              </div>
              <button onClick={() => setPeriodModalOpen(false)} className="p-1 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-4 h-4 text-surface-400" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Period Name</label>
                <input type="text"
                  value={periodForm.name}
                  onChange={e => setPeriodForm({ ...periodForm, name: e.target.value })}
                  className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Start Date</label>
                  <input type="date"
                    value={periodForm.start_date}
                    onChange={e => setPeriodForm({ ...periodForm, start_date: e.target.value })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">End Date</label>
                  <input type="date"
                    value={periodForm.end_date}
                    onChange={e => setPeriodForm({ ...periodForm, end_date: e.target.value })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-surface-100">
              <button onClick={() => setPeriodModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-surface-600 hover:text-surface-800 bg-surface-100 hover:bg-surface-200 rounded-lg cursor-pointer transition-colors">
                Cancel
              </button>
              <button onClick={handleCreatePayrollPeriod}
                className="px-4 py-2 text-xs font-semibold text-white bg-surface-900 hover:bg-surface-800 rounded-lg cursor-pointer transition-colors">
                Create Period
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAYSLIP VIEW MODAL */}
      {viewPayslipEntry && (() => {
        const e = viewPayslipEntry;
        const period = payrollPeriods.find(p => p.id === e.period_id);
        const empName = (e as any).users?.full_name || (e as any).users?.email || 'Unknown';

        // Decode itemized breakdown if it exists
        let pNotes: any = null;
        try {
          if (e.notes && e.notes.trim().startsWith('{')) {
            pNotes = JSON.parse(e.notes);
          }
        } catch (err) {}

        const handleTriggerPrint = () => {
          window.print();
        };

        // Live calculation constants for the Edit Form
        const baseEarningsEdit = Number(payslipForm.regHours) * Number(payslipForm.hrRate);
        const otEarningsEdit = Number(payslipForm.otHours) * Number(payslipForm.otRate);
        const otherEarningsEdit = Number(payslipForm.allowance) + Number(payslipForm.bonus);
        const calculatedGrossEdit = baseEarningsEdit + otEarningsEdit + otherEarningsEdit;

        const totalDeductionsEdit = Number(payslipForm.sss) + Number(payslipForm.philhealth) + Number(payslipForm.pagibig) + Number(payslipForm.tax) + Number(payslipForm.otherDeductions);
        const calculatedNetEdit = Math.max(0, calculatedGrossEdit - totalDeductionsEdit);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm print:bg-white print:fixed print:inset-0 print:z-[99999] print:p-0 print:m-0 print:block">
            <div className="bg-white rounded-2xl shadow-2xl border border-surface-100 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none print:border-none print:w-full print:max-w-none print:p-6 print:m-0 print:block print:relative" onClick={e => e.stopPropagation()}>
              
              {/* Header */}
              <div className="sticky top-0 bg-white z-10 px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between rounded-t-2xl print:relative print:border-none print:pt-2 print:px-2 print:sticky-none print:shadow-none">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-brand-500 print:text-black" />
                  <div>
                    <h3 className="text-base font-bold text-surface-900 print:text-lg">
                      {isEditingPayslipEntry ? 'Adjust Payroll Ledger' : 'Payslip Voucher'}
                    </h3>
                    <p className="text-[10px] text-surface-400 mt-0.5 print:text-[11px] print:text-black">
                      {settings.brand.hotelName} · {period?.name || '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 print:hidden text-xs font-semibold">
                  {!isEditingPayslipEntry && (
                    <button
                      onClick={handleTriggerPrint}
                      className="p-1 px-2 text-surface-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print</span>
                    </button>
                  )}
                  <button onClick={() => setViewPayslipEntry(null)}
                    className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Editable form mode */}
              {isEditingPayslipEntry ? (
                <div className="p-6 space-y-5 text-xs">
                  {/* Employee Info Readonly summary */}
                  <div className="bg-surface-50 rounded-xl p-3 border border-surface-200">
                    <p className="font-semibold text-surface-900 text-xs">Adjusting Ledger for: <span className="text-brand-600">{empName}</span></p>
                    <p className="text-[10px] text-surface-400">Processed Rate: {settings.currencySymbol}{Number(e.hourly_rate).toFixed(2)}/hr · OT: {settings.currencySymbol}{Number(e.overtime_rate).toFixed(2)}/hr</p>
                  </div>

                  {/* Section: Hours & Rates adjustments */}
                  <div className="bg-white rounded-xl border border-surface-150 p-4 space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-surface-500">1. Shift Hours & Standard Rates</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-[9px] font-bold text-surface-400 uppercase tracking-wider mb-1 block">Reg Hours</label>
                        <input type="number" step="0.1" min="0" value={payslipForm.regHours}
                          onChange={e => setPayslipForm({ ...payslipForm, regHours: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs p-2 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500 bg-surface-50" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-surface-400 uppercase tracking-wider mb-1 block">Hourly Rate</label>
                        <input type="number" step="0.1" min="0" value={payslipForm.hrRate}
                          onChange={e => setPayslipForm({ ...payslipForm, hrRate: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs p-2 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500 bg-surface-50" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-surface-400 uppercase tracking-wider mb-1 block">OT Hours</label>
                        <input type="number" step="0.1" min="0" value={payslipForm.otHours}
                          onChange={e => setPayslipForm({ ...payslipForm, otHours: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs p-2 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500 bg-surface-50" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-surface-400 uppercase tracking-wider mb-1 block">OT Hourly Rate</label>
                        <input type="number" step="0.1" min="0" value={payslipForm.otRate}
                          onChange={e => setPayslipForm({ ...payslipForm, otRate: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs p-2 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500 bg-surface-50" />
                      </div>
                    </div>
                  </div>

                  {/* Section: Allowances, Incentives & Bonuses */}
                  <div className="bg-white rounded-xl border border-surface-150 p-4 space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-surface-500">2. Additional Earnings / Allowances ({settings.currencySymbol})</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[9px] font-bold text-surface-400 uppercase tracking-wider mb-1 block">Standard Allowance / Reimbursements</label>
                        <input type="number" step="1" min="0" value={payslipForm.allowance === 0 ? '' : payslipForm.allowance} placeholder="0.00"
                          onChange={e => setPayslipForm({ ...payslipForm, allowance: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs p-2.5 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-surface-400 uppercase tracking-wider mb-1 block">Bonus or Performance Incentives</label>
                        <input type="number" step="1" min="0" value={payslipForm.bonus === 0 ? '' : payslipForm.bonus} placeholder="0.00"
                          onChange={e => setPayslipForm({ ...payslipForm, bonus: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs p-2.5 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
                      </div>
                    </div>
                  </div>

                  {/* Section: PhilHealth, SSS, Pag-IBIG & Withholding Deductions */}
                  <div className="bg-white rounded-xl border border-surface-150 p-4 space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-surface-500">3. statutory & Withholding Deductions ({settings.currencySymbol})</h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                      <div>
                        <label className="text-[9px] font-bold text-surface-400 uppercase/80 tracking-wider mb-1 block">SSS Co.</label>
                        <input type="number" min="0" value={payslipForm.sss === 0 ? '' : payslipForm.sss} placeholder="0.00"
                          onChange={e => setPayslipForm({ ...payslipForm, sss: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs p-2 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-surface-400 uppercase/80 tracking-wider mb-1 block">PhilHealth</label>
                        <input type="number" min="0" value={payslipForm.philhealth === 0 ? '' : payslipForm.philhealth} placeholder="0.00"
                          onChange={e => setPayslipForm({ ...payslipForm, philhealth: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs p-2 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-surface-400 uppercase/80 tracking-wider mb-1 block">Pag-IBIG</label>
                        <input type="number" min="0" value={payslipForm.pagibig === 0 ? '' : payslipForm.pagibig} placeholder="0.00"
                          onChange={e => setPayslipForm({ ...payslipForm, pagibig: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs p-2 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-surface-400 uppercase/80 tracking-wider mb-1 block">Withholding Tax</label>
                        <input type="number" min="0" value={payslipForm.tax === 0 ? '' : payslipForm.tax} placeholder="0.00"
                          onChange={e => setPayslipForm({ ...payslipForm, tax: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs p-2 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-surface-400 uppercase/80 tracking-wider mb-1 block">Others</label>
                        <input type="number" min="0" value={payslipForm.otherDeductions === 0 ? '' : payslipForm.otherDeductions} placeholder="0.00"
                          onChange={e => setPayslipForm({ ...payslipForm, otherDeductions: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs p-2 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
                      </div>
                    </div>
                  </div>

                  {/* Section: Administrative Remarks */}
                  <div>
                    <label className="text-[9px] font-bold text-surface-500 uppercase tracking-wider mb-1.5 block">Custom/Adjustment Remarks</label>
                    <textarea rows={2} value={payslipForm.customNotes}
                      onChange={e => setPayslipForm({ ...payslipForm, customNotes: e.target.value })}
                      placeholder="Explain payroll corrections, adjustments, or bonuses granted..."
                      className="w-full text-xs p-2.5 border border-surface-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
                  </div>

                  {/* Realtime Live calculations ticker */}
                  <div className="bg-surface-900 rounded-xl p-4 text-white space-y-2">
                    <p className="text-[9px] font-bold text-white/50 uppercase tracking-wider border-b border-white/10 pb-1.5">Live Computation Details</p>
                    <div className="flex justify-between">
                      <span className="text-white/60">Simulated Gross Wages (Base + OT + Allowances):</span>
                      <span className="font-mono font-bold">{settings.currencySymbol}{calculatedGrossEdit.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Simulated Deductions:</span>
                      <span className="font-mono text-rose-300">-{settings.currencySymbol}{totalDeductionsEdit.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-white/20 pt-2 text-xs font-bold">
                      <span>PROJECTED NET PAYOUT:</span>
                      <span className="text-emerald-400 font-mono text-sm">{settings.currencySymbol}{calculatedNetEdit.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Footer buttons */}
                  <div className="flex justify-end gap-2 pt-3 border-t border-surface-100">
                    <button
                      onClick={() => setIsEditingPayslipEntry(false)}
                      className="px-4 py-2 bg-surface-100 text-surface-600 hover:bg-surface-200 rounded-lg font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSavePayslipAdjustments}
                      className="px-4 py-2 bg-brand-500 text-white hover:bg-brand-600 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-md shadow-brand-500/10"
                    >
                      <Check className="w-4 h-4" />
                      Save Adjustments & Ledger
                    </button>
                  </div>
                </div>
              ) : (
                /* Regular View Details Mode */
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
                        <span className="text-surface-400 block text-[9px] uppercase font-bold print:text-stone-500">Base Hourly Rate</span>
                        <span className="font-mono text-surface-700 block print:text-black">{settings.currencySymbol}{Number(e.hourly_rate || 0).toFixed(2)}/hr</span>
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
                          <span className="font-mono font-semibold text-surface-900 print:text-black">
                            {settings.currencySymbol}{(Number(e.total_regular_hours || 0) * Number(e.hourly_rate || 0)).toFixed(2)}
                          </span>
                        </div>

                        {Number(e.total_overtime_hours || 0) > 0 && (
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-semibold text-surface-800 print:text-black">Overtime Premium Pay</p>
                              <p className="text-[10px] text-surface-400 font-mono print:text-stone-500">
                                {Number(e.total_overtime_hours || 0).toFixed(1)}h @ {settings.currencySymbol}{Number(e.overtime_rate || 0).toFixed(2)}/hr
                              </p>
                            </div>
                            <span className="font-mono font-semibold text-surface-900 print:text-black">
                              {settings.currencySymbol}{(Number(e.total_overtime_hours || 0) * Number(e.overtime_rate || 0)).toFixed(2)}
                            </span>
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

                  {/* Edit Adjustment Button for authorised managers */}
                  {e.status === 'pending' && (
                    <div className="pt-2 flex justify-center print:hidden">
                      <button
                        onClick={() => setIsEditingPayslipEntry(true)}
                        className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 hover:shadow-lg shadow-amber-500/20"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Adjust Wages & Deductions</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Close Button print only hidden */}
              {!isEditingPayslipEntry && (
                <div className="px-6 py-4 border-t border-surface-100 flex justify-end print:hidden">
                  <button onClick={() => setViewPayslipEntry(null)}
                    className="px-4 py-2 text-xs font-semibold bg-surface-100 text-surface-600 hover:bg-surface-200 rounded-lg cursor-pointer transition-colors">
                    Close Window
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}


      {/* CONSOLIDATED PAYROLL LEDGER MODAL */}
      {viewConsolidatedPeriod && (() => {
        const period = viewConsolidatedPeriod;
        const entries = payrollEntries.filter(e => e.period_id === period.id);

        // Sum aggregates
        const totalRegHours = entries.reduce((s, e) => s + Number(e.total_regular_hours || 0), 0);
        const totalOtHours = entries.reduce((s, e) => s + Number(e.total_overtime_hours || 0), 0);
        const totalGross = entries.reduce((s, e) => s + Number(e.gross_pay || 0), 0);
        const totalDeductions = entries.reduce((s, e) => s + Number(e.deductions || 0), 0);
        const totalNet = entries.reduce((s, e) => s + Number(e.net_pay || 0), 0);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm print:bg-white print:fixed print:inset-0 print:z-[99999] print:p-0 print:m-0 print:block">
            <div className="bg-white rounded-2xl shadow-2xl border border-surface-100 w-full max-w-5xl mx-4 max-h-[90vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none print:border-none print:max-w-none print:p-0 print:m-0 print:block" onClick={e => e.stopPropagation()}>
              
              {/* Header */}
              <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-surface-100 flex items-center justify-between rounded-t-2xl print:hidden">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-brand-600 animate-pulse" />
                  <div>
                    <h3 className="text-base font-bold text-surface-900">Consolidated Payroll Ledger</h3>
                    <p className="text-[10px] text-surface-400 mt-0.5 font-medium">
                      {settings.brand.hotelName} · Cutoff Sheet of {period.name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="p-1 px-2 text-surface-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 text-xs font-semibold"
                    title="Print Consolidated Sheet"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Ledger</span>
                  </button>
                  <button onClick={() => setViewConsolidatedPeriod(null)}
                    className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Ledger Content Area */}
              <div className="p-6 space-y-6 print:p-2">
                
                {/* Official Corporate Document Header (Visible in print only) */}
                <div className="hidden print:block text-center border-b pb-4 mb-4">
                  <h1 className="text-xl font-bold tracking-tight uppercase text-black">{settings.brand.hotelName}</h1>
                  <p className="text-xs text-stone-600 uppercase font-semibold">CONSOLIDATED PAYROLL cutoff LEDGER & CASH DISBURSEMENT JOURNAL</p>
                  <p className="text-[10px] text-stone-500 mt-1 font-medium">
                    Pay Period: {new Date(period.start_date).toLocaleDateString()} — {new Date(period.end_date).toLocaleDateString()} &nbsp;|&nbsp; Sheet: {period.name}
                  </p>
                  <p className="text-[9px] text-stone-400 mt-0.5">Report Exported on: {new Date().toLocaleDateString()}</p>
                </div>

                {/* Key Metrics Dashboard Card */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-gradient-to-br from-brand-50/30 to-surface-50 p-4 rounded-xl border border-brand-100/30 print:bg-white print:border-stone-300 print:rounded-none">
                  <div className="p-2 border-r last:border-0 border-brand-100/50 print:border-stone-200">
                    <span className="text-[9px] uppercase tracking-wider text-surface-400 font-bold block">Cutoff Period</span>
                    <span className="text-sm font-bold text-brand-700 block truncate">{period.name}</span>
                  </div>
                  <div className="p-2 border-r last:border-0 border-brand-100/50 print:border-stone-200">
                    <span className="text-[9px] uppercase tracking-wider text-surface-400 font-bold block">Total Hours</span>
                    <span className="text-sm font-bold text-surface-900 block">{(totalRegHours + totalOtHours).toFixed(1)}h</span>
                    <span className="text-[8px] text-surface-400">Reg: {totalRegHours.toFixed(1)}h | OT: {totalOtHours.toFixed(1)}h</span>
                  </div>
                  <div className="p-2 border-r last:border-0 border-brand-100/50 print:border-stone-200">
                    <span className="text-[9px] uppercase tracking-wider text-surface-400 font-bold block">Gross payroll</span>
                    <span className="text-sm font-bold text-surface-900 block">{settings.currencySymbol}{totalGross.toLocaleString()}</span>
                  </div>
                  <div className="p-2 border-r last:border-0 border-brand-100/50 print:border-stone-200">
                    <span className="text-[9px] uppercase tracking-wider text-surface-400 font-bold block">Total Deductions</span>
                    <span className="text-sm font-bold text-rose-600 block">{settings.currencySymbol}{totalDeductions.toLocaleString()}</span>
                  </div>
                  <div className="p-2">
                    <span className="text-[9px] uppercase tracking-wider text-surface-400 font-bold block font-sans">Net Cash Outflow</span>
                    <span className="text-sm font-bold text-emerald-600 block">{settings.currencySymbol}{totalNet.toLocaleString()}</span>
                  </div>
                </div>

                {/* Detailed Landscape Table */}
                <div className="border border-surface-150 rounded-xl overflow-hidden print:border-stone-300 print:rounded-none">
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-surface-100 text-surface-700 font-bold border-b border-surface-200 print:bg-stone-100 print:text-black">
                        <th className="p-2.5 font-sans">Employee</th>
                        <th className="p-2.5 font-mono text-center">Reg Hrs</th>
                        <th className="p-2.5 font-mono text-center">OT Hrs</th>
                        <th className="p-2.5 font-mono text-right font-semibold">Basic Pay</th>
                        <th className="p-2.5 font-mono text-right font-semibold">OT Pay</th>
                        <th className="p-2.5 font-mono text-right font-semibold">Allow/Bonus</th>
                        <th className="p-2.5 font-mono text-right">SSS</th>
                        <th className="p-2.5 font-mono text-right">PhilHealth</th>
                        <th className="p-2.5 font-mono text-right">Pag-IBIG</th>
                        <th className="p-2.5 font-mono text-right">W/Tax</th>
                        <th className="p-2.5 font-mono text-right font-bold text-rose-700 print:text-black">Total Ded.</th>
                        <th className="p-2.5 font-mono text-right font-bold text-emerald-700 print:text-black">Net Pay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100 print:divide-stone-200">
                      {entries.map((entry) => {
                        const empName = (entry as any).users?.full_name || (entry as any).users?.email || 'Unknown';
                        let sss = 0, philhealth = 0, pagibig = 0, tax = 0, allowances = 0;
                        try {
                          if (entry.notes?.trim().startsWith('{')) {
                            const p = JSON.parse(entry.notes);
                            sss = p?.deductions?.sss || 0;
                            philhealth = p?.deductions?.philhealth || 0;
                            pagibig = p?.deductions?.pagibig || 0;
                            tax = p?.deductions?.tax || 0;
                            allowances = (p?.allowances?.allowance || 0) + (p?.allowances?.bonus || 0);
                          }
                        } catch (err) {}

                        const regPay = Number(entry.total_regular_hours || 0) * Number(entry.hourly_rate || 0);
                        const otPay = Number(entry.total_overtime_hours || 0) * Number(entry.overtime_rate || 0);
                        const totalD = Number(entry.deductions || 0);
                        const totalN = Number(entry.net_pay || 0);

                        return (
                          <tr key={entry.id} className="text-surface-700 hover:bg-surface-50/50 print:text-black">
                            <td className="p-2.5 font-semibold text-surface-900 print:text-black">{empName}</td>
                            <td className="p-2.5 font-mono text-center">{Number(entry.total_regular_hours || 0).toFixed(1)}h</td>
                            <td className="p-2.5 font-mono text-center">{Number(entry.total_overtime_hours || 0).toFixed(1)}h</td>
                            <td className="p-2.5 font-mono text-right">{settings.currencySymbol}{regPay.toFixed(2)}</td>
                            <td className="p-2.5 font-mono text-right">{settings.currencySymbol}{otPay.toFixed(2)}</td>
                            <td className="p-2.5 font-mono text-right text-emerald-600 print:text-black">{allowances > 0 ? `+${settings.currencySymbol}${allowances.toFixed(2)}` : '—'}</td>
                            <td className="p-2.5 font-mono text-right">{sss > 0 ? settings.currencySymbol + sss.toFixed(2) : '—'}</td>
                            <td className="p-2.5 font-mono text-right">{philhealth > 0 ? settings.currencySymbol + philhealth.toFixed(2) : '—'}</td>
                            <td className="p-2.5 font-mono text-right">{pagibig > 0 ? settings.currencySymbol + pagibig.toFixed(2) : '—'}</td>
                            <td className="p-2.5 font-mono text-right">{tax > 0 ? settings.currencySymbol + tax.toFixed(2) : '—'}</td>
                            <td className="p-2.5 font-mono text-right font-bold text-rose-600 print:text-black">{totalD > 0 ? `${settings.currencySymbol}${totalD.toFixed(2)}` : '—'}</td>
                            <td className="p-2.5 font-mono text-right font-bold text-emerald-600 print:text-black">{settings.currencySymbol}{totalN.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}
                      {/* Sub-totals Row */}
                      <tr className="bg-surface-50/70 font-bold border-t border-surface-200 text-surface-900 print:bg-stone-50 print:text-black print:border-stone-300">
                        <td className="p-2.5">Cutoff Totals</td>
                        <td className="p-2.5 font-mono text-center">{totalRegHours.toFixed(1)}h</td>
                        <td className="p-2.5 font-mono text-center">{totalOtHours.toFixed(1)}h</td>
                        <td className="p-2.5 font-mono text-right" colSpan={3}>Gross: {settings.currencySymbol}{totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="p-2.5 font-mono text-right" colSpan={4}></td>
                        <td className="p-2.5 font-mono text-right text-rose-700 print:text-black">{settings.currencySymbol}{totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="p-2.5 font-mono text-right text-emerald-700 print:text-black">{settings.currencySymbol}{totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Corporate Audit & Certification Signature Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-6 border-t border-surface-100 print:pt-4 print:border-stone-300">
                  <div className="space-y-4">
                    <span className="text-[8px] uppercase tracking-wider text-surface-400 font-bold block">Prepared & Audited By</span>
                    <div className="border-b border-surface-400 h-8 font-sans text-xs italic flex items-end pb-1 text-surface-800">
                      {userProfile?.full_name || 'System Controller'}
                    </div>
                    <span className="text-[9px] text-surface-400 block mt-1 font-medium">Workforce Administration Unit</span>
                  </div>
                  <div className="space-y-4">
                    <span className="text-[8px] uppercase tracking-wider text-surface-400 font-bold block">Certified Accurate By</span>
                    <div className="border-b border-surface-400 h-8 flex items-end pb-1 text-stone-500 font-sans text-xs font-medium">
                      [Signature over printed name]
                    </div>
                    <span className="text-[9px] text-surface-400 block mt-1 font-medium">Chief Accounting Officer</span>
                  </div>
                  <div className="space-y-4">
                    <span className="text-[8px] uppercase tracking-wider text-surface-400 font-bold block">Approved for Release By</span>
                    <div className="border-b border-surface-400 h-8 flex items-end pb-1 text-stone-500 font-sans text-xs font-medium">
                      [Signature over printed name]
                    </div>
                    <span className="text-[9px] text-surface-400 block mt-1 font-medium">Hotel Manager / Treasurer</span>
                  </div>
                  <div className="space-y-4">
                    <span className="text-[8px] uppercase tracking-wider text-surface-400 font-bold block">Remittance Method</span>
                    <div className="border-b border-surface-400 h-8 flex items-end pb-1 text-surface-800 font-mono text-xs font-bold uppercase">
                      Bank Wire Transfer / Cash Voucher
                    </div>
                    <span className="text-[9px] text-surface-400 block mt-1 font-medium font-mono">Disbursement Journal Entry</span>
                  </div>
                </div>

              </div>

              {/* Footer Panel with print-only hide controls */}
              <div className="px-6 py-4 border-t border-surface-100 flex justify-end print:hidden bg-surface-50 rounded-b-2xl">
                <button onClick={() => setViewConsolidatedPeriod(null)}
                  className="px-4 py-2 text-xs font-semibold bg-surface-900 hover:bg-surface-800 text-white rounded-lg cursor-pointer transition-colors shadow-sm">
                  Close Window
                </button>
              </div>

            </div>
          </div>
        );
      })()}


      {/* MANUAL WORKFORCE TIMESHEET CORRECTION MODAL */}
      {timeEntryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-surface-100 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-white z-10 px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between rounded-t-2xl">
              <div>
                <h3 className="text-base font-bold text-surface-900">
                  {editingTimeEntry ? 'Correct Clock Record' : 'Log Missed Shift Manually'}
                </h3>
                <p className="text-[10px] text-surface-400 mt-0.5">Force adjustments on worker logs and totals</p>
              </div>
              <button
                onClick={() => {
                  setTimeEntryModalOpen(false);
                  setEditingTimeEntry(null);
                }}
                className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inputs */}
            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Selected Staff / Employee</label>
                {editingTimeEntry ? (
                  <div className="p-2.5 bg-surface-50 border border-surface-200 rounded-lg font-semibold text-surface-900">
                    {(() => {
                      const matched = employees.find(emp => emp.id === manualTimeForm.userId);
                      return matched ? `${matched.full_name || matched.email} (${matched.role})` : 'Active Staff';
                    })()}
                  </div>
                ) : (
                  <select
                    value={manualTimeForm.userId}
                    onChange={e => setManualTimeForm({ ...manualTimeForm, userId: e.target.value })}
                    className="w-full text-xs p-2.5 bg-white border border-surface-200 rounded-xl focus:ring-1 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="">-- Choose Employee Staff member --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name || emp.email} ({emp.role || 'staff'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block font-mono">CLOCK IN DATETIME</label>
                  <input
                    type="datetime-local"
                    value={manualTimeForm.clockIn}
                    onChange={e => setManualTimeForm({ ...manualTimeForm, clockIn: e.target.value })}
                    className="w-full text-xs p-2.5 bg-white border border-surface-200 rounded-xl focus:ring-1 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block font-mono">CLOCK OUT DATETIME</label>
                  <input
                    type="datetime-local"
                    value={manualTimeForm.clockOut}
                    onChange={e => setManualTimeForm({ ...manualTimeForm, clockOut: e.target.value })}
                    className="w-full text-xs p-2.5 bg-white border border-surface-200 rounded-xl focus:ring-1 focus:ring-brand-500 focus:outline-none"
                    placeholder="Leave blank if currently clocked in"
                  />
                  <p className="text-[9px] text-surface-400 mt-1">Leave empty to mark shift as currently active</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Attendance Status</label>
                  <select
                    value={manualTimeForm.status}
                    onChange={e => setManualTimeForm({ ...manualTimeForm, status: e.target.value })}
                    className="w-full text-xs p-2.5 bg-white border border-surface-200 rounded-xl focus:ring-1 focus:ring-brand-500 focus:outline-none cursor-pointer"
                  >
                    <option value="Present">Present</option>
                    <option value="Late">Late</option>
                    <option value="Absent">Absent</option>
                    <option value="Half-Day">Half-Day</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Holiday Status</label>
                  <div className="flex items-center gap-2 mt-1 h-[38px] border border-surface-200 bg-surface-50 px-3 rounded-xl">
                    <input
                      type="checkbox"
                      id="isHolidayFlag"
                      checked={manualTimeForm.isHoliday}
                      onChange={e => setManualTimeForm({ ...manualTimeForm, isHoliday: e.target.checked })}
                      className="w-4 h-4 rounded text-brand-500 border-surface-300 focus:ring-brand-500 cursor-pointer"
                    />
                    <label htmlFor="isHolidayFlag" className="text-xs font-semibold text-surface-700 cursor-pointer select-none">Holiday Shift</label>
                  </div>
                </div>
              </div>

              {/* Break and Automated Overtime Threshold Controls */}
              <div className="bg-surface-50 border border-surface-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-surface-500 uppercase tracking-widest block font-mono">AUTOMATED BREAK & THRESHOLD ENGINE</span>
                  {manualTimeForm.clockIn && manualTimeForm.clockOut && (
                    <span className="px-2 py-0.5 bg-brand-50 text-brand-700 border border-brand-100 rounded text-[9px] font-extrabold uppercase">
                      Calculated
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Mandatory Meal Break</label>
                    <div className="flex items-center gap-2 h-[38px] border border-surface-200 bg-white px-3 rounded-xl">
                      <input
                        type="checkbox"
                        id="modalMealBreakTaken"
                        checked={!!(manualTimeForm as any).mealBreakTaken}
                        onChange={e => setManualTimeForm({ ...manualTimeForm, mealBreakTaken: e.target.checked } as any)}
                        className="w-4 h-4 rounded text-brand-500 border-surface-300 focus:ring-brand-500 cursor-pointer"
                      />
                      <label htmlFor="modalMealBreakTaken" className="text-xs font-semibold text-surface-700 cursor-pointer select-none">Meal Break Taken</label>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Break Duration</label>
                    <select
                      disabled={!((manualTimeForm as any).mealBreakTaken)}
                      value={(manualTimeForm as any).mealBreakDuration}
                      onChange={e => setManualTimeForm({ ...manualTimeForm, mealBreakDuration: Number(e.target.value) } as any)}
                      className="w-full text-xs p-2.5 bg-white border border-surface-200 rounded-xl focus:ring-1 focus:ring-brand-500 focus:outline-none cursor-pointer disabled:bg-surface-100 disabled:cursor-not-allowed"
                    >
                      <option value="30">30 minutes</option>
                      <option value="45">45 minutes</option>
                      <option value="60">60 minutes (Standard)</option>
                    </select>
                  </div>
                </div>

                {manualTimeForm.clockIn && manualTimeForm.clockOut && (() => {
                  const cin = new Date(manualTimeForm.clockIn).getTime();
                  const cout = new Date(manualTimeForm.clockOut).getTime();
                  if (cout > cin) {
                    const gross = (cout - cin) / 3600000;
                    const net = gross - ( (manualTimeForm as any).mealBreakTaken ? (Number( (manualTimeForm as any).mealBreakDuration || 0 ) / 60) : 0 );
                    const hoursWorked = Math.max(0, net);
                    const over8 = hoursWorked > 8;
                    const otSpan = over8 ? hoursWorked - 8 : 0;
                    return (
                      <div className="text-[10px] space-y-1 bg-white border border-surface-200 p-2.5 rounded-lg font-mono">
                        <div className="flex justify-between text-surface-650">
                          <span>Gross elapsed time:</span>
                          <span className="font-bold">{gross.toFixed(2)} hrs</span>
                        </div>
                        <div className="flex justify-between text-surface-650">
                          <span>Net productive worked:</span>
                          <span className="font-bold text-emerald-600">{hoursWorked.toFixed(2)} hrs</span>
                        </div>
                        <div className="flex justify-between border-t border-dashed border-surface-150 pt-1">
                          <span className="font-bold uppercase text-surface-500">Overtime hours logged (&gt;8h):</span>
                          <span className={`font-bold ${over8 ? 'text-amber-600' : 'text-surface-400'}`}>
                            {over8 ? `+${otSpan.toFixed(2)} hrs` : '0.00' }
                          </span>
                        </div>
                        {over8 && (
                          <div className="text-[9px] text-amber-500 font-bold mt-1 text-center bg-amber-50 border border-amber-100/50 py-1 rounded">
                            ⚠️ Standard shift threshold exceeded! +{otSpan.toFixed(2)} hrs overtime registered.
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {manualTimeForm.isHoliday && (
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Holiday Name</label>
                  <input
                    type="text"
                    value={manualTimeForm.holidayName}
                    onChange={e => setManualTimeForm({ ...manualTimeForm, holidayName: e.target.value })}
                    placeholder="e.g. Christmas Day, Independence Day..."
                    className="w-full text-xs p-2.5 bg-white border border-surface-200 rounded-xl focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Administrative Remarks</label>
                <textarea
                  rows={2}
                  value={manualTimeForm.remarks}
                  onChange={e => setManualTimeForm({ ...manualTimeForm, remarks: e.target.value })}
                  placeholder="Administrative remarks, reasons for adjustment, or shift discoveries..."
                  className="w-full text-xs p-2.5 bg-white border border-surface-200 rounded-xl focus:ring-1 focus:ring-brand-500 focus:outline-none resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-3 border-t border-surface-150">
                {editingTimeEntry ? (
                  <button
                    onClick={() => handleDeleteTimeEntry(editingTimeEntry.id)}
                    className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    Delete Record
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setTimeEntryModalOpen(false);
                      setEditingTimeEntry(null);
                    }}
                    className="px-4 py-2 bg-surface-100 hover:bg-surface-200 text-surface-600 font-semibold rounded-lg cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTimeEntry}
                    className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-lg cursor-pointer shadow-md shadow-brand-500/10 transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* BOOKING DETAIL MODAL */}
      {selectedBookingDetail && (() => {
        const b = selectedBookingDetail;
        const customerInfo = customers.find(c => c.id === b.customer_id);
        const customerBookings = bookings.filter(bk => bk.customer_id === b.customer_id).sort((a, bb) => new Date(bb.created_at).getTime() - new Date(a.created_at).getTime());
        const isOccupied = b.status === 'checked-in';
        const canToggle = b.status === 'confirmed' || b.status === 'checked-in';
        return (
        <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-2xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-surface-900">Booking Details</h3>
                <p className="text-[11px] text-surface-400 mt-0.5">Reservation for Suite {b.rooms?.room_number}</p>
              </div>
              <button type="button" onClick={() => setSelectedBookingDetail(null)}
                className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs font-sans tracking-tight max-h-[70vh] overflow-y-auto">
              {/* Guest Info Card */}
              <div className="bg-gradient-to-br from-brand-50 to-surface-50 rounded-xl p-4 border border-brand-100">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-brand-600 mb-3 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Guest Information
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-surface-500">Full Name</span>
                    <span className="font-semibold text-surface-900">{customerInfo?.full_name || b.customers?.full_name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-surface-500">Email</span>
                    <span className="font-medium text-surface-800">{customerInfo?.email || b.customers?.email || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-surface-500">Phone</span>
                    <span className="font-mono font-medium text-surface-800">{customerInfo?.phone || 'N/A'}</span>
                  </div>
                  {(customerInfo?.total_visits !== undefined || customerInfo?.notes) && (
                    <>
                      <div className="flex justify-between pt-2 border-t border-brand-200">
                        <span className="text-surface-500 text-[9px]">Total Visits</span>
                        <span className="font-bold text-surface-900">{customerInfo?.total_visits || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-surface-500 text-[9px]">Total Spent</span>
                        <span className="font-bold text-surface-900">{settings.currencySymbol}{(customerInfo?.total_spent || 0).toLocaleString()}</span>
                      </div>
                      {customerInfo?.notes && (
                        <div className="pt-2 border-t border-brand-200">
                          <span className="text-surface-500 text-[9px] block mb-1">Notes</span>
                          <p className="text-xs text-surface-700 bg-white/80 rounded-lg p-2">{customerInfo.notes}</p>
                        </div>
                      )}
                      {customerInfo?.preferences && Object.keys(customerInfo.preferences).length > 0 && (
                        <div className="pt-2 border-t border-brand-200">
                          <span className="text-surface-500 text-[9px] block mb-1">Preferences</span>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(customerInfo.preferences).map(([k, v]) => (
                              <span key={k} className="px-1.5 py-0.5 bg-white/80 rounded text-[9px] text-surface-600 border border-brand-100">
                                {k.replace(/_/g, ' ')}: {String(v)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Current Booking Details */}
              <div className="bg-white rounded-xl border border-surface-200 p-4">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-surface-500 mb-3 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Current Reservation
                </h4>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-surface-500">Room</span>
                    <span className="font-bold text-surface-900">Suite {b.rooms?.room_number} &mdash; {b.rooms?.type}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-surface-500">Check-In Date</span>
                    <span className="font-semibold text-surface-900">{b.check_in_date}</span>
                  </div>
                  <div className="flex items-center justify-between bg-brand-50 rounded-lg px-3 py-2 -mx-1">
                    <span className="font-semibold text-brand-700 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Arrival Time
                    </span>
                    <span className="font-bold text-brand-800 bg-white px-2.5 py-1 rounded-md text-[11px] shadow-sm">{b.check_in_time}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-surface-500">Check-Out</span>
                    <span className="font-semibold text-surface-900">{b.check_out_date} at {b.check_out_time}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-surface-500">Total Paid</span>
                    <span className="font-mono font-bold text-surface-900">{settings.currencySymbol}{b.total_price}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-surface-500">Status</span>
                    <span className={`px-2 py-0.5 font-bold uppercase text-[9px] rounded-full ${
                      b.status === 'confirmed' || b.status === 'checked-in'
                        ? 'bg-emerald-50 text-emerald-700'
                        : b.status === 'cancelled'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>{b.status}</span>
                  </div>
                </div>
              </div>

              {/* All Orders by This Guest */}
              <div className="bg-white rounded-xl border border-surface-200 p-4">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-surface-500 mb-3 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" /> All Orders by {customerInfo?.full_name || b.customers?.full_name || 'Guest'} ({customerBookings.length})
                </h4>
                {customerBookings.length === 0 ? (
                  <p className="text-surface-400 text-xs italic py-2">No other reservations found.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                    {customerBookings.map(cb => (
                      <div key={cb.id} className="flex items-center justify-between bg-surface-50 rounded-lg px-3 py-2 border border-surface-100">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-surface-800 min-w-[80px]">Suite {cb.rooms?.room_number || '?'}</span>
                          <span className="text-surface-400 text-[10px]">{cb.check_in_date}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-surface-700 font-medium">{settings.currencySymbol}{cb.total_price}</span>
                          <span className={`px-1.5 py-0.5 font-bold uppercase text-[8px] rounded-full ${
                            cb.status === 'confirmed' || cb.status === 'checked-in'
                              ? 'bg-emerald-50 text-emerald-700'
                              : cb.status === 'cancelled'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>{cb.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Guest Orders */}
              <div className="bg-white rounded-xl border border-surface-200 p-4">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-surface-500 mb-3 flex items-center gap-1.5">
                  <ShoppingCart className="w-3.5 h-3.5" /> Guest Orders
                </h4>
                {(() => {
                  const bookingOrders = guestOrders.filter(o => o.booking_id === b.id);
                  return (
                    <>
                      {bookingOrders.length === 0 ? (
                        <p className="text-surface-400 text-xs italic py-2">No orders placed for this booking yet.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-[150px] overflow-y-auto mb-3">
                          {bookingOrders.map(o => (
                            <div key={o.id} className="flex items-center justify-between bg-surface-50 rounded-lg px-3 py-2 border border-surface-100">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-surface-800 text-[11px]">{o.inventory_items?.name}</span>
                                <span className="text-surface-400 text-[10px]">x{o.quantity}</span>
                                <span className="font-mono text-surface-600 text-[10px]">{settings.currencySymbol}{Number(o.total_price).toFixed(2)}</span>
                              </div>
                              <span className={`px-1.5 py-0.5 font-bold uppercase text-[8px] rounded-full ${
                                o.status === 'served' ? 'bg-emerald-50 text-emerald-700' : o.status === 'preparing' ? 'bg-amber-50 text-amber-700' : o.status === 'cancelled' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'
                              }`}>{o.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={() => handleOpenOrderCreate(b)} className="w-full py-2 bg-emerald-50 text-emerald-700 border-2 border-emerald-200 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-100 transition-all cursor-pointer flex items-center justify-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> Place Order
                      </button>
                    </>
                  );
                })()}
              </div>

              {/* Occupancy Toggle Action */}
              {canToggle && (
                <div className="bg-white rounded-xl border border-surface-200 p-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-surface-500 mb-3 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" /> Room Occupancy Status
                  </h4>
                  <p className="text-surface-500 text-[11px] mb-3">
                    {isOccupied
                      ? "This guest is currently marked as occupying the room. Click below to revert."
                      : "Mark this guest as checked in and currently occupying the room."}
                  </p>
                  <button
                    onClick={() => handleQuickCheckIn(b)}
                    className={`w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      isOccupied
                        ? 'bg-amber-50 text-amber-700 border-2 border-amber-300 hover:bg-amber-100'
                        : 'bg-emerald-50 text-emerald-700 border-2 border-emerald-300 hover:bg-emerald-100'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    {isOccupied ? 'Revert Check-In (Mark as Not Occupied)' : 'Mark as Checked-In / Occupied'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* MENU ITEMS BROWSE MODAL */}
      {menuModal && (
        <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-surface-900">Menu Items</h3>
                <p className="text-[11px] text-surface-400 mt-0.5">{inventoryItems.length} items across {menuCategories.length} categories</p>
              </div>
              <button type="button" onClick={() => setMenuModal(false)}
                className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category Tabs */}
            <div className="px-6 py-3 border-b border-surface-100 flex gap-1 overflow-x-auto scrollbar-none bg-surface-50/50">
              <button onClick={() => setMenuModalCategory('all')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap transition-all ${
                  menuModalCategory === 'all' ? 'bg-surface-900 text-white shadow-sm' : 'bg-white text-surface-500 hover:text-surface-800 hover:bg-surface-100 border border-surface-200'
                }`}>
                All ({inventoryItems.length})
              </button>
              {menuCategories.map(cat => {
                const count = inventoryItems.filter(i => i.category_id === cat.id).length;
                return (
                  <button key={cat.id} onClick={() => setMenuModalCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap transition-all ${
                      menuModalCategory === cat.id ? 'bg-surface-900 text-white shadow-sm' : 'bg-white text-surface-500 hover:text-surface-800 hover:bg-surface-100 border border-surface-200'
                    }`}>
                    {cat.name} ({count})
                  </button>
                );
              })}
            </div>

            {/* Item Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              {(() => {
                const filtered = inventoryItems.filter(item => menuModalCategory === 'all' || item.category_id === menuModalCategory);
                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12">
                      <Search className="w-8 h-8 text-surface-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-surface-500">No items in this category</p>
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(item => {
                      const isLow = Number(item.stock_quantity) <= Number(item.low_stock_threshold);
                      const stock = Number(item.stock_quantity);
                      const threshold = Number(item.low_stock_threshold);
                      const stockPct = threshold > 0 ? Math.min(100, (stock / Math.max(threshold, stock)) * 100) : stock > 0 ? 100 : 0;
                      return (
                        <div key={item.id} className="bg-white rounded-xl border border-surface-200 overflow-hidden hover:border-surface-300 hover:shadow-sm transition-all">
                          <div className="h-28 bg-surface-50 relative overflow-hidden">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-8 h-8 text-surface-300" />
                              </div>
                            )}
                            {isLow && (
                              <div className="absolute top-2 right-2 px-2 py-0.5 bg-rose-500 text-white rounded-full text-[8px] font-bold uppercase shadow-sm">Low</div>
                            )}
                          </div>
                          <div className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-surface-900 truncate">{item.name}</p>
                                <p className="text-[9px] text-surface-400">{item.menu_categories?.name || 'Uncategorized'}</p>
                              </div>
                              <span className="text-sm font-bold text-surface-900 font-mono flex-shrink-0">{settings.currencySymbol}{Number(item.price).toFixed(2)}</span>
                            </div>
                            <div>
                              <div className="flex items-center justify-between text-[10px] mb-0.5">
                                <span className={`font-semibold ${isLow ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  {stock} {item.unit}
                                </span>
                                <span className="text-surface-400">Threshold: {threshold}</span>
                              </div>
                              <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${isLow ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${stockPct}%` }} />
                              </div>
                            </div>
                            <div className="flex gap-1.5 pt-1">
                              <button onClick={() => { handleOpenStockAdjust(item); setMenuModal(false); }} className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[9px] font-semibold hover:bg-emerald-100 cursor-pointer transition-all">Stock</button>
                              <button onClick={() => { handleOpenItemEdit(item); setMenuModal(false); }} className="flex-1 py-1.5 bg-surface-50 text-surface-600 border border-surface-200 rounded-lg text-[9px] font-semibold hover:bg-surface-100 cursor-pointer transition-all">Edit</button>
                              <button onClick={() => { handleDeleteInventoryItem(item); setMenuModal(false); }} className="flex-1 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[9px] font-semibold hover:bg-rose-100 cursor-pointer transition-all">Delete</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="px-6 py-3 border-t border-surface-100 bg-surface-50/50 flex items-center justify-between">
              <span className="text-[10px] text-surface-400">{inventoryItems.length} total items</span>
              <button onClick={() => { handleOpenItemCreate(); setMenuModal(false); }} className="px-3 py-1.5 bg-surface-900 text-white hover:bg-surface-800 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-all">
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROOM ORDERS DETAIL MODAL */}
      {roomOrdersModal && (
        <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-lg font-mono">
                  {roomOrdersModal.roomNumber.replace('Suite ', '')}
                </div>
                <div>
                  <h3 className="text-base font-bold text-surface-900">{roomOrdersModal.roomNumber}</h3>
                  <p className="text-[11px] text-surface-400">{roomOrdersModal.guestName} · {roomOrdersModal.orders.length} order{roomOrdersModal.orders.length > 1 ? 's' : ''}</p>
                </div>
              </div>
              <button type="button" onClick={() => setRoomOrdersModal(null)}
                className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-2">
              {roomOrdersModal.orders.map(o => (
                <div key={o.id} className="flex items-center justify-between bg-surface-50 rounded-xl px-4 py-3 border border-surface-100 hover:border-surface-200 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-surface-800 text-sm truncate">{o.inventory_items?.name || 'Item'}</span>
                      <span className="text-surface-400 text-[11px]">Ã—{o.quantity}</span>
                      <span className="font-mono text-surface-600 text-[11px]">{settings.currencySymbol}{Number(o.total_price).toFixed(2)}</span>
                    </div>
                    <span className="text-[10px] text-surface-400 hidden sm:inline">{new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`px-2 py-0.5 font-bold uppercase text-[9px] rounded-full ${
                      o.status === 'served' ? 'bg-emerald-50 text-emerald-700' : o.status === 'preparing' ? 'bg-amber-50 text-amber-700' : o.status === 'cancelled' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'
                    }`}>{o.status}</span>
                    {o.status === 'pending' && <button onClick={() => { handleUpdateOrderStatus(o, 'preparing'); setRoomOrdersModal(prev => prev ? { ...prev, orders: prev.orders.map(po => po.id === o.id ? { ...po, status: 'preparing' as const } : po) } : prev); }} className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[9px] font-semibold hover:bg-amber-100 cursor-pointer transition-colors">Prep</button>}
                    {o.status === 'preparing' && <button onClick={() => { handleUpdateOrderStatus(o, 'served'); setRoomOrdersModal(prev => prev ? { ...prev, orders: prev.orders.map(po => po.id === o.id ? { ...po, status: 'served' as const } : po) } : prev); }} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[9px] font-semibold hover:bg-emerald-100 cursor-pointer transition-colors">Serve</button>}
                    {o.status === 'pending' && <button onClick={() => { handleUpdateOrderStatus(o, 'cancelled'); setRoomOrdersModal(prev => prev ? { ...prev, orders: prev.orders.map(po => po.id === o.id ? { ...po, status: 'cancelled' as const } : po) } : prev); }} className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[9px] font-semibold hover:bg-rose-100 cursor-pointer transition-colors">Cancel</button>}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-surface-100 bg-surface-50/50 flex items-center justify-between">
              <span className="text-[11px] text-surface-500 font-medium">{roomOrdersModal.orders.length} item{roomOrdersModal.orders.length > 1 ? 's' : ''}</span>
              <span className="text-sm font-bold text-surface-900">{settings.currencySymbol}{roomOrdersModal.orders.reduce((s, o) => s + Number(o.total_price), 0).toFixed(2)} total</span>
            </div>
          </div>
        </div>
      )}

      {/* CRUD MODAL FOR ROOMS */}
      {roomModal && (
        <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-surface-900">
                  {roomModal === 'create' ? 'Create New Suite' : `Edit Suite ${roomForm.room_number}`}
                </h3>
                <p className="text-[11px] text-surface-400 mt-0.5">
                  {roomModal === 'create' ? 'Add a new residential layout to your portfolio' : 'Update specifications for this room'}
                </p>
              </div>
              <button type="button" onClick={() => setRoomModal(null)}
                className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRoomSubmit} className="p-6 space-y-5 text-xs font-sans tracking-tight max-h-[75vh] overflow-y-auto">
              {/* Section: Identity */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-brand-600 font-mono">
                  <Building className="w-3.5 h-3.5" /> Room Identity
                </div>
                <div className="grid grid-cols-5 gap-3">
                  <div className="col-span-3">
                    <label className="block text-surface-500 font-medium mb-1.5">Suite Number</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -transurface-y-1/2 text-surface-400 font-mono text-xs font-semibold">#</span>
                      <input
                        type="text" required
                        value={roomForm.room_number}
                        onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })}
                        placeholder="e.g. 104"
                        className="w-full pl-7 bg-white border border-surface-200 rounded-lg py-2.5 pr-3 text-xs text-surface-800 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow font-sans tracking-tight"
                      />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-surface-500 font-medium mb-1.5">Max Guests</label>
                    <div className="relative">
                      <Users className="absolute left-2.5 top-1/2 -transurface-y-1/2 w-3.5 h-3.5 text-surface-400" />
                      <input
                        type="number" required min={1}
                        value={roomForm.max_occupancy}
                        onChange={(e) => setRoomForm({ ...roomForm, max_occupancy: Number(e.target.value) })}
                        className="w-full pl-8 bg-white border border-surface-200 rounded-lg py-2.5 pr-3 text-xs text-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow font-sans tracking-tight"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Classification */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-emerald-600 font-mono">
                  <DollarSign className="w-3.5 h-3.5" /> Classification & Pricing
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-surface-500 font-medium mb-1.5">Room Category</label>
                    <select
                      value={roomForm.type}
                      onChange={(e) => setRoomForm({ ...roomForm, type: e.target.value })}
                      className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs text-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 h-[38px] cursor-pointer transition-shadow"
                    >
                      {settings.layoutCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-surface-500 font-medium mb-1.5">Rate per hour</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -transurface-y-1/2 text-surface-500 font-semibold text-xs">{settings.currencySymbol}</span>
                      <input
                        type="number" required min={1}
                        value={roomForm.price_per_hour}
                        onChange={(e) => setRoomForm({ ...roomForm, price_per_hour: Number(e.target.value) })}
                        className="w-full pl-8 bg-white border border-surface-200 rounded-lg py-2.5 pr-3 text-xs text-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow font-sans tracking-tight"
                      />
                    </div>
                    <p className="text-[10px] text-surface-400 mt-1">{settings.currencyCode} / hour</p>
                  </div>
                  <div>
                    <label className="block text-surface-500 font-medium mb-1.5">Min Stay (hours)</label>
                    <div className="relative">
                      <Clock className="absolute left-2.5 top-1/2 -transurface-y-1/2 w-3.5 h-3.5 text-surface-400" />
                      <input
                        type="number" required min={1} max={168}
                        value={roomForm.min_stay_hours}
                        onChange={(e) => setRoomForm({ ...roomForm, min_stay_hours: Number(e.target.value) })}
                        className="w-full pl-8 bg-white border border-surface-200 rounded-lg py-2.5 pr-3 text-xs text-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow font-sans tracking-tight"
                      />
                    </div>
                    <p className="text-[10px] text-surface-400 mt-1">Overrides global default of {settings.minStayHours}h</p>
                  </div>
                </div>
              </div>

              {/* Section: Status */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-amber-600 font-mono">
                  <Activity className="w-3.5 h-3.5" /> Operational Status
                </div>
                <div className="flex gap-2">
                  {(['available', 'booked', 'cleaning', 'maintenance'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRoomForm({ ...roomForm, status: s })}
                      className={`flex-1 py-2 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        roomForm.status === s
                          ? s === 'available'
                            ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-300 shadow-sm'
                            : s === 'booked'
                            ? 'bg-blue-50 text-blue-700 border-2 border-blue-300 shadow-sm'
                            : s === 'cleaning'
                            ? 'bg-amber-50 text-amber-700 border-2 border-amber-300 shadow-sm'
                            : 'bg-rose-50 text-rose-700 border-2 border-rose-300 shadow-sm'
                          : 'bg-surface-50 text-surface-400 border-2 border-transparent hover:border-surface-200 hover:text-surface-600'
                      }`}
                    >
                      {s === 'available' ? 'Open' : s === 'booked' ? 'Booked' : s === 'cleaning' ? 'Cleaning' : 'Maintenance'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section: Description */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-surface-500 font-mono">
                  <Edit3 className="w-3.5 h-3.5" /> Description
                </div>
                <textarea
                  required rows={3}
                  value={roomForm.description}
                  onChange={(e) => setRoomForm({ ...roomForm, description: e.target.value })}
                  placeholder="Describe the room's unique features, views, and amenities..."
                  className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs text-surface-800 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow font-sans tracking-tight leading-relaxed resize-none"
                />
              </div>

              {/* Section: Image */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-surface-500 font-mono">
                  <Sparkles className="w-3.5 h-3.5" /> Media Asset
                </div>
                <div className="flex gap-3">
                  {roomForm.image_url && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-surface-200 flex-shrink-0 bg-surface-50">
                      <img src={roomForm.image_url} alt="" className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="url"
                      value={roomForm.image_url}
                      onChange={(e) => setRoomForm({ ...roomForm, image_url: e.target.value })}
                      placeholder="https://images.unsplash.com/photo-..."
                      className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs text-surface-800 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow font-sans tracking-tight"
                    />
                    <p className="text-[10px] text-surface-400 mt-1">Paste an image URL for the suite listing card</p>
                  </div>
                </div>
              </div>

              {/* Section: Time Slots */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-brand-600 font-mono">
                  <Calendar className="w-3.5 h-3.5" /> Check-In / Check-Out Times
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {([{
                    key: 'check_in', label: 'Check-In', bg: 'bg-emerald-400', selectedBg: 'bg-emerald-100',
                    selectedBorder: 'border-emerald-300', selectedText: 'text-emerald-800',
                    hoverBg: 'hover:bg-emerald-50', hoverBorder: 'hover:border-emerald-200',
                    quickBg: 'bg-emerald-100', quickText: 'text-emerald-700', quickHover: 'hover:bg-emerald-200',
                    times: roomForm.check_in_times, setter: (ts: string[]) => setRoomForm({ ...roomForm, check_in_times: ts })
                  }, {
                    key: 'check_out', label: 'Check-Out', bg: 'bg-amber-400', selectedBg: 'bg-amber-100',
                    selectedBorder: 'border-amber-300', selectedText: 'text-amber-800',
                    hoverBg: 'hover:bg-amber-50', hoverBorder: 'hover:border-amber-200',
                    quickBg: 'bg-amber-100', quickText: 'text-amber-700', quickHover: 'hover:bg-amber-200',
                    times: roomForm.check_out_times, setter: (ts: string[]) => setRoomForm({ ...roomForm, check_out_times: ts })
                  }] as const).map(col => (
                    <div key={col.key} className="bg-surface-50 rounded-xl p-3 border border-surface-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-surface-700 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${col.bg}`} /> {col.label}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => {
                            const pool = col.key === 'check_in' ? settings.checkInTimes : settings.checkOutTimes;
                            col.setter(pool.length > 0 ? [...pool] : [...generateAllDaySlots()]);
                          }}
                            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                            style={{ backgroundColor: 'rgb(219 234 254)', color: 'rgb(67 56 202)' }}
                          >{(col.key === 'check_in' ? settings.checkInTimes : settings.checkOutTimes).length > 0 ? 'Select All Config' : 'Select All Times'}</button>
                          <button type="button" onClick={() => col.setter([])}
                            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded text-surface-400 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                          >Clear</button>
                          <span className="text-[10px] text-surface-400 font-mono ml-1">{col.times.length}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 min-h-[24px]">
                        {col.times.slice().sort(compareTimes).slice(0, 5).map((t, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-surface-200 rounded-md text-[9px] font-mono text-surface-600 shadow-sm">
                            {t}
                            <button type="button" onClick={() => col.setter(col.times.filter(x => x !== t))}
                              className="w-3 h-3 rounded-full hover:bg-rose-100 hover:text-rose-600 text-surface-400 flex items-center justify-center cursor-pointer text-[7px] leading-none">Ã—</button>
                          </span>
                        ))}
                        {col.times.length > 5 && <span className="text-[9px] text-surface-400 font-mono py-0.5">+{col.times.length - 5}</span>}
                        {col.times.length === 0 && <span className="text-[10px] text-surface-400 italic py-0.5">No times set</span>}
                      </div>
                      <div className="max-h-[180px] overflow-y-auto space-y-0.5 pr-0.5 scrollbar-thin">
                        {((col.key === 'check_in' ? settings.checkInTimes : settings.checkOutTimes).length === 0 ? generateAllDaySlots() : (col.key === 'check_in' ? settings.checkInTimes : settings.checkOutTimes)).map(time => {
                          const sel = col.times.includes(time);
                          return (
                            <button key={time} type="button" onClick={() => {
                              col.setter(sel ? col.times.filter(t => t !== time) : [...col.times, time].sort(compareTimes));
                            }} className={`w-full text-left px-2.5 py-1 rounded-md text-[10px] font-mono transition-all cursor-pointer border ${
                              sel
                                ? `${col.selectedBg} ${col.selectedBorder} ${col.selectedText} font-semibold shadow-sm`
                                : 'bg-white border-surface-200 text-surface-500 ' + col.hoverBg + ' ' + col.hoverBorder
                            }`}>{time}</button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setRoomModal(null)}
                  className="flex-1 py-2.5 border-2 border-surface-200 hover:border-surface-300 hover:bg-surface-50 rounded-xl text-surface-600 font-semibold transition-all cursor-pointer text-xs">
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 py-2.5 bg-surface-900 hover:bg-surface-800 text-white rounded-xl font-semibold transition-all cursor-pointer text-xs shadow-sm flex items-center justify-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  {roomModal === 'create' ? 'Create Suite' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rate Plan Modal */}
      {showRatePlanModal && (
        <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
              <div>
                        <h3 className="text-base font-bold text-surface-900">{selectedRatePlan ? 'Edit Rate Plan' : 'Add Rate Plan'}</h3>
                        <p className="text-[11px] text-surface-400 mt-0.5">{selectedRatePlan ? 'Update the seasonal or peak pricing plan' : 'Create a new seasonal or peak pricing plan'}</p>
              </div>
               <button onClick={() => setShowRatePlanModal(false)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Plan Name</label>
                  <input type="text" value={ratePlanForm.name} onChange={(e) => setRatePlanForm({...ratePlanForm, name: e.target.value})}
                    placeholder="e.g. Summer Special"
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Room Type</label>
                  <select value={ratePlanForm.room_type} onChange={(e) => setRatePlanForm({...ratePlanForm, room_type: e.target.value})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500">
                    {settings.layoutCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Date From</label>
                  <input type="date" value={ratePlanForm.date_from} onChange={(e) => setRatePlanForm({...ratePlanForm, date_from: e.target.value})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Date To</label>
                  <input type="date" value={ratePlanForm.date_to} onChange={(e) => setRatePlanForm({...ratePlanForm, date_to: e.target.value})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Base Price ({settings.currencyCode})</label>
                  <input type="number" min={0} step="0.01" value={ratePlanForm.base_price} onChange={(e) => setRatePlanForm({...ratePlanForm, base_price: Number(e.target.value)})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 font-mono" />
                </div>
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Min Stay (hours)</label>
                  <input type="number" min={1} value={ratePlanForm.min_stay_hours} onChange={(e) => setRatePlanForm({...ratePlanForm, min_stay_hours: Number(e.target.value)})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 font-mono" />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={ratePlanForm.is_peak} onChange={(e) => setRatePlanForm({...ratePlanForm, is_peak: e.target.checked})}
                    className="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer" />
                  <span className="text-xs text-surface-700 font-medium">Peak season pricing</span>
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
                <button onClick={() => setShowRatePlanModal(false)} className="px-4 py-2 border border-surface-200 text-surface-600 hover:bg-surface-50 rounded-lg font-medium cursor-pointer text-xs">Cancel</button>
                <button onClick={async () => {
                  if (!ratePlanForm.name || !ratePlanForm.room_type || !ratePlanForm.date_from || !ratePlanForm.date_to) { triggerAlert('Error', 'Please fill in all required fields.'); return; }
                  if (ratePlanForm.base_price <= 0) { triggerAlert('Error', 'Base price must be greater than 0.'); return; }
                  try {
                    if (selectedRatePlan) {
                      const { error } = await supabase.from('rate_plans').update({
                        name: ratePlanForm.name, room_type: ratePlanForm.room_type,
                        date_from: ratePlanForm.date_from, date_to: ratePlanForm.date_to,
                        base_price: ratePlanForm.base_price, min_stay_hours: ratePlanForm.min_stay_hours,
                        is_peak: ratePlanForm.is_peak
                      }).eq('id', selectedRatePlan.id);
                      if (error) throw error;
                      addToast('success', 'Rate Plan Updated', `"${ratePlanForm.name}" updated.`);
                    } else {
                      const { error } = await supabase.from('rate_plans').insert({
                        name: ratePlanForm.name, room_type: ratePlanForm.room_type,
                        date_from: ratePlanForm.date_from, date_to: ratePlanForm.date_to,
                        base_price: ratePlanForm.base_price, min_stay_hours: ratePlanForm.min_stay_hours,
                        is_peak: ratePlanForm.is_peak, is_active: true
                      });
                      if (error) throw error;
                      await supabase.from('activity_logs').insert({ user_id: userProfile?.id, user_name: userProfile?.full_name || 'Admin', action: 'Rate Plan Created', details: `Rate plan "${ratePlanForm.name}" created` });
                      addToast('success', 'Rate Plan Created', `"${ratePlanForm.name}" has been added.`);
                    }
                    setShowRatePlanModal(false);
                    setSelectedRatePlan(null);
                    refreshTable('rate_plans');
                  } catch (err: any) { triggerAlert('Error', err.message); }
                }} className="px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 rounded-lg font-semibold cursor-pointer text-xs flex items-center gap-1.5">{selectedRatePlan ? <><Edit3 className="w-3.5 h-3.5" /> Update Plan</> : <><Plus className="w-3.5 h-3.5" /> Create Plan</>}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Promo Code Modal */}
      {showPromoModal && (
        <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-surface-900">{selectedPromo ? 'Edit Promo Code' : 'Add Promo Code'}</h3>
                <p className="text-[11px] text-surface-400 mt-0.5">{selectedPromo ? 'Update the promo code details' : 'Create a new promo code for discounts'}</p>
              </div>
              <button onClick={() => setShowPromoModal(false)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Code</label>
                  <input type="text" value={promoForm.code} onChange={(e) => setPromoForm({...promoForm, code: e.target.value.toUpperCase()})}
                    placeholder="e.g. SUMMER20"
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 font-mono uppercase" />
                </div>
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Discount Type</label>
                  <select value={promoForm.discount_type} onChange={(e) => setPromoForm({...promoForm, discount_type: e.target.value as 'percentage' | 'fixed'})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500">
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-surface-500 font-medium mb-1.5">Description</label>
                <input type="text" value={promoForm.description} onChange={(e) => setPromoForm({...promoForm, description: e.target.value})}
                  placeholder="e.g. 20% off summer bookings"
                  className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Discount Value</label>
                  <input type="number" min={0} step="0.01" value={promoForm.discount_value} onChange={(e) => setPromoForm({...promoForm, discount_value: Number(e.target.value)})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 font-mono" />
                </div>
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Min. Spend ({settings.currencyCode})</label>
                  <input type="number" min={0} step="0.01" value={promoForm.min_spend} onChange={(e) => setPromoForm({...promoForm, min_spend: Number(e.target.value)})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Valid From</label>
                  <input type="date" value={promoForm.valid_from} onChange={(e) => setPromoForm({...promoForm, valid_from: e.target.value})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Valid To</label>
                  <input type="date" value={promoForm.valid_to} onChange={(e) => setPromoForm({...promoForm, valid_to: e.target.value})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Usage Limit (0 = unlimited)</label>
                  <input type="number" min={0} value={promoForm.usage_limit} onChange={(e) => setPromoForm({...promoForm, usage_limit: Number(e.target.value)})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 font-mono" />
                </div>
                <div className="flex items-end pb-2.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={promoForm.is_active} onChange={(e) => setPromoForm({...promoForm, is_active: e.target.checked})}
                      className="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer" />
                    <span className="text-xs text-surface-700 font-medium">Active</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
                <button onClick={() => setShowPromoModal(false)} className="px-4 py-2 border border-surface-200 text-surface-600 hover:bg-surface-50 rounded-lg font-medium cursor-pointer text-xs">Cancel</button>
                <button onClick={async () => {
                  if (!promoForm.code.trim() || promoForm.discount_value <= 0) { triggerAlert('Error', 'Code and discount value are required.'); return; }
                  try {
                    if (selectedPromo) {
                      const { error } = await supabase.from('promo_codes').update({
                        code: promoForm.code.trim(), description: promoForm.description.trim(),
                        discount_type: promoForm.discount_type, discount_value: promoForm.discount_value,
                        valid_from: promoForm.valid_from, valid_to: promoForm.valid_to,
                        usage_limit: promoForm.usage_limit, min_spend: promoForm.min_spend,
                        is_active: promoForm.is_active
                      }).eq('id', selectedPromo.id);
                      if (error) throw error;
                      addToast('success', 'Promo Updated', `"${promoForm.code}" updated.`);
                    } else {
                      const { error } = await supabase.from('promo_codes').insert({
                        code: promoForm.code.trim(), description: promoForm.description.trim(),
                        discount_type: promoForm.discount_type, discount_value: promoForm.discount_value,
                        valid_from: promoForm.valid_from, valid_to: promoForm.valid_to,
                        usage_limit: promoForm.usage_limit, min_spend: promoForm.min_spend,
                        is_active: promoForm.is_active
                      });
                      if (error) throw error;
                      addToast('success', 'Promo Created', `"${promoForm.code}" created.`);
                    }
                    setShowPromoModal(false);
                    setSelectedPromo(null);
                    refreshTable('promo_codes');
                  } catch (err: any) { triggerAlert('Error', err.message); }
                }} className="px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 rounded-lg font-semibold cursor-pointer text-xs flex items-center gap-1.5">{selectedPromo ? <><Edit3 className="w-3.5 h-3.5" /> Update Promo</> : <><Plus className="w-3.5 h-3.5" /> Create Promo</>}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Book Modal */}
      {quickBookRoom && (
        <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-surface-900">New Booking</h3>
                <p className="text-[11px] text-surface-400 mt-0.5">Suite {quickBookRoom.room_number} &mdash; {quickBookRoom.type}</p>
              </div>
              <button onClick={() => setQuickBookRoom(null)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-surface-500 font-medium mb-1.5">Guest Name</label>
                  <input type="text" value={quickBookForm.guest_name} onChange={(e) => setQuickBookForm({...quickBookForm, guest_name: e.target.value})}
                    placeholder="Full name" className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Email</label>
                  <input type="email" value={quickBookForm.guest_email} onChange={(e) => setQuickBookForm({...quickBookForm, guest_email: e.target.value})}
                    placeholder="guest@email.com" className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Phone</label>
                  <input type="tel" value={quickBookForm.guest_phone} onChange={(e) => setQuickBookForm({...quickBookForm, guest_phone: e.target.value})}
                    placeholder="+63 912 345 6789" className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Check-In</label>
                  <input type="date" value={quickBookForm.check_in} onChange={(e) => setQuickBookForm({...quickBookForm, check_in: e.target.value})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Time</label>
                  <div className="relative" ref={ref => { if (ref) { (window as any).__ciTimeRef = ref; } }}>
                    <input type="text" value={quickBookForm.check_in_time}
                      onChange={(e) => setQuickBookForm({...quickBookForm, check_in_time: e.target.value})}
                      onFocus={(e) => { const dd = e.currentTarget.nextElementSibling; if (dd) dd.classList.remove('hidden'); }}
                      onBlur={() => setTimeout(() => { const dd = (window as any).__ciTimeRef?.querySelector('.ci-dropdown'); if (dd) dd.classList.add('hidden'); }, 200)}
                      placeholder="e.g. 2:00 PM"
                      className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 font-mono" />
                    <div className="ci-dropdown hidden absolute top-full left-0 right-0 mt-1 bg-white border border-surface-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                      {(settings.checkInTimes?.length ? settings.checkInTimes : ['2:00 PM','3:00 PM','4:00 PM']).map(t => (
                        <button key={t} type="button" onMouseDown={(e) => { e.preventDefault(); setQuickBookForm({...quickBookForm, check_in_time: t}); const dd = e.currentTarget.closest('.ci-dropdown'); if (dd) dd.classList.add('hidden'); }}
                          className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-brand-50 cursor-pointer ${quickBookForm.check_in_time === t ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-surface-700'}`}>{t}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Check-Out</label>
                  <input type="date" value={quickBookForm.check_out} onChange={(e) => setQuickBookForm({...quickBookForm, check_out: e.target.value})}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-surface-500 font-medium mb-1.5">Time</label>
                  <div className="relative" ref={ref => { if (ref) { (window as any).__coTimeRef = ref; } }}>
                    <input type="text" value={quickBookForm.check_out_time}
                      onChange={(e) => setQuickBookForm({...quickBookForm, check_out_time: e.target.value})}
                      onFocus={(e) => { const dd = e.currentTarget.nextElementSibling; if (dd) dd.classList.remove('hidden'); }}
                      onBlur={() => setTimeout(() => { const dd = (window as any).__coTimeRef?.querySelector('.co-dropdown'); if (dd) dd.classList.add('hidden'); }, 200)}
                      placeholder="e.g. 11:00 AM"
                      className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500 font-mono" />
                    <div className="co-dropdown hidden absolute top-full left-0 right-0 mt-1 bg-white border border-surface-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                      {(settings.checkOutTimes?.length ? settings.checkOutTimes : ['10:00 AM','11:00 AM','12:00 PM']).map(t => (
                        <button key={t} type="button" onMouseDown={(e) => { e.preventDefault(); setQuickBookForm({...quickBookForm, check_out_time: t}); const dd = e.currentTarget.closest('.co-dropdown'); if (dd) dd.classList.add('hidden'); }}
                          className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-brand-50 cursor-pointer ${quickBookForm.check_out_time === t ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-surface-700'}`}>{t}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-surface-50 rounded-xl p-4 space-y-1.5">
                <div className="flex justify-between text-surface-500">
                  <span>Rate</span>
                  <span className="font-mono">{settings.currencySymbol}{Number(quickBookRoom.price_per_hour).toFixed(2)}/hr</span>
                </div>
                <div className="flex justify-between text-surface-500">
                  <span>Min Stay</span>
                  <span className="font-mono">{quickBookRoom.min_stay_hours || settings.minStayHours || 3}h</span>
                </div>
              </div>
              {(() => {
                const ci = new Date(quickBookForm.check_in + 'T' + (quickBookForm.check_in_time || '00:00'));
                const co = new Date(quickBookForm.check_out + 'T' + (quickBookForm.check_out_time || '00:00'));
                const hours = Math.max(1, Math.round((co.getTime() - ci.getTime()) / 3600000));
                const baseTotal = hours * Number(quickBookRoom.price_per_hour);
                const validPromos = quickBookPromos.filter(p => !p.min_spend || baseTotal >= p.min_spend);
                const selectedPromo = quickBookSelectedPromo;
                const discount = selectedPromo
                  ? selectedPromo.discount_type === 'percentage'
                    ? Math.round(baseTotal * Number(selectedPromo.discount_value) / 100 * 100) / 100
                    : Number(selectedPromo.discount_value)
                  : 0;
                const finalTotal = Math.max(0, baseTotal - discount);
                return validPromos.length > 0 ? (
                  <div>
                    <label className="block text-surface-500 font-medium mb-1.5 text-xs">Promo Code</label>
                    <div className="space-y-1.5 max-h-28 overflow-y-auto">
                      {validPromos.map(p => {
                        const disc = p.discount_type === 'percentage' ? `${p.discount_value}%` : `${settings.currencySymbol}${Number(p.discount_value).toFixed(2)}`;
                        const applied = selectedPromo?.id === p.id;
                        return (
                          <button key={p.id} type="button" onClick={() => setQuickBookSelectedPromo(applied ? null : p)}
                            className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg border text-xs cursor-pointer ${applied ? 'border-emerald-400 bg-emerald-50' : 'border-surface-200 hover:border-brand-300 hover:bg-brand-50'}`}>
                            <div>
                              <span className="font-semibold text-surface-800">{p.code}</span>
                              <span className="text-surface-500 ml-2">{p.description}</span>
                            </div>
                            <span className={`font-mono font-semibold ${applied ? 'text-emerald-700' : 'text-surface-500'}`}>{applied ? `-${disc}` : disc}</span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedPromo && (
                      <div className="mt-2 pt-2 border-t border-surface-200 flex justify-between text-sm">
                        <span className="text-surface-600">Subtotal</span>
                        <span className="font-mono text-surface-800">{settings.currencySymbol}{baseTotal.toFixed(2)}</span>
                        <span className="text-surface-400 mx-2">-</span>
                        <span className="font-mono text-emerald-600">{settings.currencySymbol}{discount.toFixed(2)}</span>
                        <span className="text-surface-400 mx-2">=</span>
                        <span className="font-mono font-bold text-surface-900">{settings.currencySymbol}{finalTotal.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                ) : null;
              })()}
              <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
                <button onClick={() => setQuickBookRoom(null)} className="px-4 py-2 border border-surface-200 text-surface-600 hover:bg-surface-50 rounded-lg font-medium cursor-pointer text-xs">Cancel</button>
                <button onClick={async () => {
                  if (!quickBookForm.guest_name || !quickBookForm.check_in || !quickBookForm.check_out) {
                    triggerAlert('Error', 'Please fill in guest name and dates.');
                    return;
                  }
                  try {
                    let customerId: string;
                    const { data: existing } = await supabase.from('customers').select('id').eq('email', quickBookForm.guest_email).maybeSingle();
                    if (existing) {
                      customerId = existing.id;
                    } else {
                      const { data: newCust, error: custErr } = await supabase.from('customers').insert({
                        full_name: quickBookForm.guest_name, email: quickBookForm.guest_email || `${quickBookForm.guest_name.replace(/\s/g,'')}@temp.com`, phone: quickBookForm.guest_phone
                      }).select().single();
                      if (custErr) throw custErr;
                      customerId = newCust.id;
                    }
                    const ci = new Date(quickBookForm.check_in + 'T' + (quickBookForm.check_in_time || '00:00'));
                    const co = new Date(quickBookForm.check_out + 'T' + (quickBookForm.check_out_time || '00:00'));
                    const hours = Math.max(1, Math.round((co.getTime() - ci.getTime()) / 3600000));
                    const baseTotal = hours * Number(quickBookRoom.price_per_hour);
                    const discount = quickBookSelectedPromo
                      ? quickBookSelectedPromo.discount_type === 'percentage'
                        ? Math.round(baseTotal * Number(quickBookSelectedPromo.discount_value) / 100 * 100) / 100
                        : Number(quickBookSelectedPromo.discount_value)
                      : 0;
                    const total = Math.max(0, baseTotal - discount);
                    const { error: bookErr } = await supabase.from('bookings').insert({
                      room_id: quickBookRoom.id, customer_id: customerId,
                      check_in_date: quickBookForm.check_in, check_in_time: quickBookForm.check_in_time,
                      check_out_date: quickBookForm.check_out, check_out_time: quickBookForm.check_out_time,
                      total_price: total, status: 'confirmed',
                      promo_code_id: quickBookSelectedPromo?.id || null,
                      discount_amount: discount || null
                    });
                    if (bookErr) throw bookErr;
                    if (quickBookSelectedPromo) {
                      await supabase.from('promo_codes').update({ used_count: quickBookSelectedPromo.used_count + 1 }).eq('id', quickBookSelectedPromo.id);
                    }
                    addToast('success', 'Booking Created', `Suite ${quickBookRoom.room_number} booked for ${quickBookForm.guest_name}.`);
                    setQuickBookRoom(null);
                    loadDatabase();
                  } catch (err: any) { triggerAlert('Booking Error', err.message); }
                }} className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-semibold cursor-pointer text-xs flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Confirm Booking</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guest Notes Modal */}
      {guestNotesModal && (
        <div className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-surface-900">Guest Notes &amp; Preferences</h3>
                <p className="text-[11px] text-surface-400 mt-0.5">{guestNotesModal.full_name}</p>
              </div>
              <button onClick={() => setGuestNotesModal(null)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-surface-500 font-medium mb-1.5">Notes</label>
                <textarea rows={3} value={guestNotesForm.notes} onChange={(e) => setGuestNotesForm({ ...guestNotesForm, notes: e.target.value })}
                  placeholder="Special requests, complaints, important details..."
                  className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1">Preferences (JSON format)</label>
                <textarea rows={5} value={guestNotesForm.preferences} onChange={(e) => setGuestNotesForm({...guestNotesForm, preferences: e.target.value})}
                  placeholder='{"smoking":"no","floor":"high","extra_towels":2}'
                  className="w-full bg-white border border-surface-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-brand-500" />
                <p className="text-[9px] text-surface-400 mt-1">Enter as JSON object. Common keys: smoking, floor, bedding, extra_towels, welcome_drink, late_checkout</p>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
                <button type="button" onClick={() => setGuestNotesModal(null)} className="px-4 py-2 border border-surface-200 text-surface-600 hover:bg-surface-50 rounded-lg font-medium cursor-pointer text-xs">Cancel</button>
                <button type="button" onClick={async () => {
                  try {
                    let parsedPrefs: Record<string, any> = {};
                    try { parsedPrefs = JSON.parse(guestNotesForm.preferences); } catch { addToast('error', 'Invalid JSON', 'Preferences must be valid JSON.'); return; }
                    const { error } = await supabase.from('customers').update({ notes: guestNotesForm.notes, preferences: parsedPrefs }).eq('id', guestNotesModal.id);
                    if (error) throw error;
                    addToast('success', 'Saved', `Notes updated for ${guestNotesModal.full_name}.`);
                    setCustomers(prev => prev.map(c => c.id === guestNotesModal.id ? { ...c, notes: guestNotesForm.notes, preferences: parsedPrefs } : c));
                    setGuestNotesModal(null);
                  } catch (err: any) { triggerAlert('Error', err.message); }
                }} className="px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 rounded-lg font-semibold cursor-pointer text-xs">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmDialog}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        confirmText={confirmDialog?.confirmText}
        isDangerous={confirmDialog?.isDangerous}
        onConfirm={() => { if (confirmDialog) confirmDialog.onConfirm(); }}
        onCancel={() => setConfirmDialog(null)}
      />

      <AlertDialog
        isOpen={!!alertDialog}
        title={alertDialog?.title || ''}
        message={alertDialog?.message || ''}
        onDismiss={() => setAlertDialog(null)}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Floating Chat Sidebar Widget */}
      {chatMessages.length > 0 && (
        <>
          {/* Toggle button - always visible */}
          <button
            onClick={() => setChatSidebarOpen(!chatSidebarOpen)}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all cursor-pointer"
            title="Chat conversations"
          >
            <MessageSquareText className="w-5 h-5" />
            {chatMessages.filter(m => m.sender_role === 'guest' && !m.seen_at).length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
                {chatMessages.filter(m => m.sender_role === 'guest' && !m.seen_at).length}
              </span>
            )}
            {chatSidebarOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>

          {/* Expanded sidebar panel */}
          {chatSidebarOpen && (
            <div className="fixed bottom-24 right-6 z-50 w-80 bg-white rounded-2xl border border-surface-200 shadow-2xl overflow-hidden transition-all duration-200">
              {/* Header */}
              <div className="px-4 py-3 bg-gradient-to-r from-brand-600 to-brand-700 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="w-4 h-4" />
                  <span className="text-sm font-bold">Recent Chats</span>
                </div>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-semibold">
                  {chatMessages.filter(m => m.sender_role === 'guest' && !m.seen_at).length} unread
                </span>
              </div>

              {/* Conversation list */}
              <div className="max-h-96 overflow-y-auto divide-y divide-surface-100">
                {chatConversations.filter(c => c.unreadCount > 0).length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-xs text-surface-400">All caught up! No unread conversations.</p>
                  </div>
                ) : (
                  chatConversations.filter(c => c.unreadCount > 0).map(conv => (
                    <button
                      key={conv.bookingId}
                      onClick={() => {
                        setSelectedChatBooking(conv.bookingId);
                        setActiveTab('front_desk_chat');
                        setChatSidebarOpen(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-brand-50/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-surface-900 truncate">{conv.guestName}</span>
                            {conv.unreadCount > 0 && (
                              <span className="shrink-0 px-1.5 py-0.5 bg-rose-50 text-rose-600 text-[9px] font-bold rounded-full">
                                {conv.unreadCount}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-surface-500 mt-0.5">Suite {conv.roomNumber}</p>
                          <p className="text-[10px] text-surface-400 truncate mt-0.5">{conv.lastMsg.message}</p>
                        </div>
                        <span className="text-[9px] text-surface-400 whitespace-nowrap">
                          {new Date(conv.lastMsg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Footer link */}
              <button
                onClick={() => {
                  setActiveTab('front_desk_chat');
                  setChatSidebarOpen(false);
                }}
                className="w-full px-4 py-2.5 bg-surface-50 hover:bg-surface-100 text-xs font-semibold text-brand-600 border-t border-surface-100 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <MessageSquareText className="w-3.5 h-3.5" />
                Open Full Chat
              </button>
            </div>
          )}
        </>
      )}

      {/* footer */}
      <footer className="bg-white border-t border-surface-200 py-4 px-6 text-center text-[10px] text-surface-400 font-mono">
        {settings.brand.hotelName} ADMIN · REAL-TIME METRIC ANALYSIS
      </footer>
    </div>
  );
}
