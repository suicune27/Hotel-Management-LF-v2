import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { Room, Profile, GuestOrder, ChatMessage, ChatTyping, StaffCall, Booking, RatePlan, PromoCode } from '../types';
import {
  Building, Check, X,
  Loader2, LogOut, Home, Search, Calendar, Bell, MessageSquareText,
  Send, Phone, ChevronRight, Clock, AlertTriangle,
  ChevronLeft, ChevronDown, ShoppingCart, Eye, RefreshCw, Menu,
  History, Timer, Sparkles, ClipboardList,
  UserPlus, CalendarPlus, Shield, Wrench, Pencil, User,
  CalendarClock, Receipt, CreditCard, FileText, ArrowRightLeft,
  DoorOpen, CheckCircle, XCircle, Users, Clipboard, Star, Printer
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { detectHoliday, calculateAttendanceStatus, isDateInPreset } from './EmployeeDashboard';
import { Sidebar } from './frontdesk/Sidebar';
import { TimePicker } from './frontdesk/TimePicker';
import { StatCards } from './frontdesk/StatCards';
import { RoomGrid } from './frontdesk/RoomGrid';
import { CheckInWizard } from './frontdesk/CheckInWizard';
import { CheckOutFlow } from './frontdesk/CheckOutFlow';
import { SearchCommand } from './frontdesk/SearchCommand';
import { RoomModal } from './frontdesk/RoomModal';
import type { RoomModalAction } from './frontdesk/RoomModal';

import {
  STATUS_CONFIG, ORDER_STATUS_FLOW, diffHours, todayStr, tomorrowStr, nowTime,
  toIso, to24h, timeToMin, minToTime12, snapToNearest, dt, DeskTab, InvoiceData,
} from './frontdesk/constants';
import NotificationBell, { type AppNotification } from './NotificationBell';
import { ToastContainer, ToastMessage } from './Toast';
import BrandBar from './BrandBar';
import { getSettings, saveSettings } from '../lib/settings';
import type { AppSettings } from '../lib/settings';

interface FrontDeskPanelProps {
  onNavigate: (screen: 'login' | 'admin-dashboard' | 'employee-dashboard') => void;
  userProfile: Profile | null;
  onLogout: () => void;
  ratePlans?: RatePlan[];
  promoCodes?: PromoCode[];
}

export default function FrontDeskPanel({ onNavigate, userProfile, onLogout, ratePlans: propRatePlans, promoCodes: propPromoCodes }: FrontDeskPanelProps) {
  const [activeTab, setActiveTab] = useState<DeskTab>('rooms');
  const [loading, setLoading] = useState(true);
  const [errorDialog, setErrorDialog] = useState<{ title: string; message: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Rate Plans & Promo Codes (loaded internally if not provided via props)
  const [internalRatePlans, setInternalRatePlans] = useState<RatePlan[]>([]);
  const [internalPromoCodes, setInternalPromoCodes] = useState<PromoCode[]>([]);
  const ratePlans = propRatePlans ?? internalRatePlans;
  const promoCodes = propPromoCodes ?? internalPromoCodes;

  // Rooms
  const [rooms, setRooms] = useState<Room[]>([]);
  const [expectedToday, setExpectedToday] = useState<Booking[]>([]);
  const [activeBookingsRaw, setActiveBookingsRaw] = useState<Booking[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomPhotoIndex, setRoomPhotoIndex] = useState(0);
  const [roomModalLoading, setRoomModalLoading] = useState(false);
  const [roomModalBookings, setRoomModalBookings] = useState<Booking[]>([]);
  const [roomModalLogs, setRoomModalLogs] = useState<any[]>([]);
  const [roomModalCharges, setRoomModalCharges] = useState<any[]>([]);
  const [roomModalPayments, setRoomModalPayments] = useState<any[]>([]);
  const [roomModalOrders, setRoomModalOrders] = useState<any[]>([]);
  const [roomModalTasks, setRoomModalTasks] = useState<any[]>([]);
  const [roomModalRefreshKey, setRoomModalRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [modalStack, setModalStack] = useState<{ room: Room; photoIndex: number; section?: string } | null>(null);
  const [roomModalSection, setRoomModalSection] = useState<string>('overview');
  const [showActiveGuests, setShowActiveGuests] = useState(true);
  const [favoriteActions, setFavoriteActions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('frontdesk.favoriteRoomActions');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Dialogs
  const [checkInDialog, setCheckInDialog] = useState<{ room: Room; mode?: 'checkin' | 'reservation'; booking?: Booking } | null>(null);
  const [checkOutDialog, setCheckOutDialog] = useState<{ room: Room } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; action: () => Promise<void> } | null>(null);
  const [cancelDialog, setCancelDialog] = useState<{ booking: Booking; guestName: string; roomNumber: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editBookingDialog, setEditBookingDialog] = useState<{ booking: Booking; room: Room } | null>(null);
  const [editGuestName, setEditGuestName] = useState('');
  const [editGuestEmail, setEditGuestEmail] = useState('');
  const [editCheckInDate, setEditCheckInDate] = useState('');
  const [editCheckOutDate, setEditCheckOutDate] = useState('');
  const [editCheckInTime, setEditCheckInTime] = useState('');
  const [editCheckOutTime, setEditCheckOutTime] = useState('');
  const [editRecurringRule, setEditRecurringRule] = useState('');
  const [bookingsModal, setBookingsModal] = useState<{ room: Room; bookings: Booking[] } | null>(null);
  const [transferDialog, setTransferDialog] = useState<Room | null>(null);
  const [transferTargetRoomId, setTransferTargetRoomId] = useState<string | null>(null);
  const [extendStayDialog, setExtendStayDialog] = useState<{ booking: Booking; room: Room } | null>(null);
  const [extendDays, setExtendDays] = useState(0);
  const [extendHours, setExtendHours] = useState(0);
  const [extendMinutes, setExtendMinutes] = useState(0);
  const [extendConflicts, setExtendConflicts] = useState<Booking[]>([]);
  const [extendConflictLoading, setExtendConflictLoading] = useState(false);
  const [stayExtensions, setStayExtensions] = useState<any[]>([]);

  useEffect(() => {
    if (!extendStayDialog || extendDays + extendHours + extendMinutes < 1) {
      setExtendConflicts([]);
      return;
    }
    const { booking, room } = extendStayDialog;
    const totalMinutes = extendDays * 1440 + extendHours * 60 + extendMinutes;
    const currentOut = new Date(dt(booking.check_out_date, booking.check_out_time));
    const newOut = new Date(currentOut.getTime() + totalMinutes * 60000);
    const ourStart = dt(booking.check_in_date, booking.check_in_time);
    const ny = newOut.getFullYear();
    const nm = `${newOut.getMonth() + 1}`.padStart(2, '0');
    const nd = `${newOut.getDate()}`.padStart(2, '0');
    const nh = newOut.getHours() % 12 || 12;
    const nmin = `${newOut.getMinutes()}`.padStart(2, '0');
    const nampm = newOut.getHours() >= 12 ? 'PM' : 'AM';
    const ourEnd = dt(`${ny}-${nm}-${nd}`, `${nh}:${nmin} ${nampm}`);

    setExtendConflictLoading(true);
    supabase
      .from('bookings')
      .select('*, customers(*)')
      .eq('room_id', room.id)
      .neq('id', booking.id)
      .not('status', 'in', '(cancelled,completed)')
      .lte('check_in_date', ourEnd.split('T')[0])
      .gte('check_out_date', ourStart.split('T')[0])
      .then(({ data, error }) => {
        if (error) { setExtendConflicts([]); setExtendConflictLoading(false); return; }
        const ourStartDt = ourStart;
        const ourEndDt = ourEnd;
        const conflicts = (data || []).filter((b: Booking) => {
          const otherStart = dt(b.check_in_date, b.check_in_time);
          const otherEnd = dt(b.check_out_date, b.check_out_time);
          return ourStartDt < otherEnd && otherStart < ourEndDt;
        });
        setExtendConflicts(conflicts);
        setExtendConflictLoading(false);
      });
  }, [extendStayDialog, extendDays, extendHours, extendMinutes]);

  const [chargesDialog, setChargesDialog] = useState<{ booking: Booking; room: Room } | null>(null);
  const [chargeDescription, setChargeDescription] = useState('');
  const [chargeAmount, setChargeAmount] = useState(0);
  const [paymentDialog, setPaymentDialog] = useState<{ booking: Booking; room: Room; outstanding?: number } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [invoiceDialog, setInvoiceDialog] = useState<{ booking: Booking; room: Room; charges: any[]; payments: any[]; promoCode?: any } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // POS Register
  const [showPos, setShowPos] = useState(false);
  const [posItems, setPosItems] = useState<any[]>([]);
  const [posCart, setPosCart] = useState<{ item: any; qty: number }[]>([]);
  const [posSearch, setPosSearch] = useState('');
  const [posCategory, setPosCategory] = useState('');
  const [posChargeMethod, setPosChargeMethod] = useState<'room' | 'cash'>('room');
  const [posSelectedBooking, setPosSelectedBooking] = useState('');
  const [posLoading, setPosLoading] = useState(false);

  // Orders
  const [guestOrders, setGuestOrders] = useState<GuestOrder[]>([]);
  const [orderView, setOrderView] = useState<'active' | 'history'>('active');
  const [orderDetailModal, setOrderDetailModal] = useState<GuestOrder | null>(null);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedChatBooking, setSelectedChatBooking] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [typingUsers, setTypingUsers] = useState<ChatTyping[]>([]);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Requests
  const [staffCalls, setStaffCalls] = useState<StaffCall[]>([]);

  // Housekeeping
  const [housekeepingDialog, setHousekeepingDialog] = useState<{ room: Room; booking?: Booking } | null>(null);
  const [cleaners, setCleaners] = useState<Profile[]>([]);

  // Settings & theme
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());
  useEffect(() => {
    const handler = () => setSettings(getSettings());
    window.addEventListener('hotel-settings-updated', handler);
    return () => window.removeEventListener('hotel-settings-updated', handler);
  }, []);
  // Clock
  const [clock, setClock] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(i); }, []);

  // Keyboard shortcuts for Front Desk
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return;

      switch (e.key) {
        case 'n':
        case 'N':
          if (!e.ctrlKey && !e.metaKey) break;
          e.preventDefault();
          document.getElementById('new-checkin-btn')?.click();
          break;
        case 'f':
        case 'F':
          if (!e.ctrlKey && !e.metaKey) break;
          e.preventDefault();
          const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="Search"]');
          searchInput?.focus();
          break;
        case 'r':
        case 'R':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setActiveTab('reports');
          }
          break;
        case '1':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setActiveTab('rooms');
          }
          break;
        case '2':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setActiveTab('reports');
          }
          break;
        case '3':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setActiveTab('orders');
          }
          break;
        case 'Escape':
          if (selectedRoom) {
            setSelectedRoom(null as any);
            setBookingsModal(null);
            setCheckOutDialog(null);
            setCheckInDialog(null);
            setPaymentDialog(null);
            setInvoiceDialog(null);
            setShowPos(false);
          }
          break;
        case '?':
          e.preventDefault();
          setShowShortcuts(p => !p);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedRoom, setActiveTab]);

  const showSuccess = (msg: string) => {
    const id = Date.now().toString();
    setToasts((p) => [...p, { id, type: 'success', title: 'Success', message: msg }]);
  };

  const showError = (title: string, msg: string) => {
    setErrorDialog({ title, message: msg });
  };

  const formatMoney = useCallback((value: number) => {
    return `${settings.currencySymbol}${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [settings.currencySymbol]);

  const formatDateValue = useCallback((value?: string | null) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
  }, []);

  const formatDateTimeValue = useCallback((value?: string | null) => {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('frontdesk.favoriteRoomActions', JSON.stringify(favoriteActions));
    } catch {
      // ignore storage failures
    }
  }, [favoriteActions]);

  const toggleFavoriteAction = useCallback((actionKey: string) => {
    if (userProfile?.role !== 'admin') return;
    setFavoriteActions((prev) => {
      if (prev.includes(actionKey)) return prev.filter((k) => k !== actionKey);
      return [...prev, actionKey].slice(0, 6);
    });
  }, [userProfile?.role]);

  // In-app notification center
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const addNotification = (notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    setNotifications(prev => [{ ...notif, id, timestamp: new Date(), read: false }, ...prev]);
  };
  const markNotifRead = (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllNotifRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const clearNotif = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));
  const clearAllNotif = () => setNotifications([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);

  const logActivity = async (action: string, details: string, bookingId?: string) => {
    try {
      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id || '',
        user_name: userProfile?.full_name || 'Front Desk',
        action,
        details: `${details}${bookingId ? ` (booking: ${bookingId})` : ''}`,
      });
    } catch { /* silently fail */ }
  };

  // Attendance & Time tracking
  const [activeTimeEntry, setActiveTimeEntry] = useState<any>(null);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [clockLoading, setClockLoading] = useState(false);
  const [clockElapsed, setClockElapsed] = useState('');
  const [clockOutNotes, setClockOutNotes] = useState('');
  const [mealBreakTaken, setMealBreakTaken] = useState(true);
  const [mealBreakDuration, setMealBreakDuration] = useState(60);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [shiftStartTime, setShiftStartTime] = useState('09:00');
  const [timeFilterPreset, setTimeFilterPreset] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [timeFilterStartDate, setTimeFilterStartDate] = useState('');
  const [timeFilterEndDate, setTimeFilterEndDate] = useState('');
  const [myAccomplishments, setMyAccomplishments] = useState<any[]>([]);

  const closeRoomModal = useCallback(() => {
    setSelectedRoom(null);
    setRoomPhotoIndex(0);
  }, []);

  useEffect(() => {
    if (!selectedRoom) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRoomModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedRoom, closeRoomModal]);

  useEffect(() => {
    const room = selectedRoom;
    if (!room) {
      setRoomModalBookings([]);
      setRoomModalLogs([]);
      return;
    }

    let active = true;
    (async () => {
      setRoomModalLoading(true);
      try {
        const [bookingsRes, logsRes] = await Promise.all([
          supabase
            .from('bookings')
            .select('*, customers(*), rooms(*)')
            .eq('room_id', room.id)
            .order('created_at', { ascending: false })
            .limit(40),
          supabase
            .from('activity_logs')
            .select('*')
            .ilike('details', `%Suite #${room.room_number}%`)
            .order('created_at', { ascending: false })
            .limit(80),
        ]);

        if (!active) return;
        const bookings = (bookingsRes.data as Booking[]) || [];
        setRoomModalBookings(bookings);
        setRoomModalLogs(logsRes.data || []);

        const bookingIds = bookings.map((b) => b.id);
        if (bookingIds.length > 0) {
          const [chargesRes, paymentsRes, ordersRes] = await Promise.all([
            supabase.from('booking_charges').select('*').in('booking_id', bookingIds).order('created_at', { ascending: false }),
            supabase.from('payments').select('*').in('booking_id', bookingIds).order('created_at', { ascending: false }),
            supabase.from('guest_orders').select('*, inventory_items(*)').in('booking_id', bookingIds).order('created_at', { ascending: false }),
          ]);
          if (active) {
            setRoomModalCharges(chargesRes.data || []);
            setRoomModalPayments(paymentsRes.data || []);
            setRoomModalOrders(ordersRes.data || []);
          }
        } else {
          setRoomModalCharges([]);
          setRoomModalPayments([]);
          setRoomModalOrders([]);
        }
        const tasksP1 = bookingIds.length > 0
          ? supabase.from('tasks').select('*, users!tasks_assigned_employee_id_fkey(*)').in('booking_id', bookingIds)
          : Promise.resolve({ data: [] as any[] });
        const tasksP2 = supabase.from('tasks').select('*, users!tasks_assigned_employee_id_fkey(*)').ilike('title', `%Suite #${room.room_number}%`);
        const [tasksRes1, tasksRes2] = await Promise.all([tasksP1, tasksP2]);
        const merged = [...((tasksRes1 as any)?.data || []), ...(tasksRes2.data || [])];
        const unique = merged.filter((t: any, i: number, a: any[]) => a.findIndex((x: any) => x.id === t.id) === i);
        if (active) setRoomModalTasks(unique);
      } catch (err) {
        if (active) {
          setRoomModalBookings([]);
          setRoomModalLogs([]);
          setRoomModalCharges([]);
          setRoomModalPayments([]);
          setRoomModalOrders([]);
          setRoomModalTasks([]);
        }
      } finally {
        if (active) setRoomModalLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedRoom?.id, roomModalRefreshKey]);

  const modalBooking = useMemo(() => {
    if (!selectedRoom) return null;
    const checkedIn = roomModalBookings.find((b) => b.status === 'checked-in');
    if (checkedIn) return checkedIn;
    const reserved = roomModalBookings.find((b) => b.status === 'confirmed' || b.status === 'pending');
    return reserved || null;
  }, [selectedRoom, roomModalBookings]);

  const currentAndUpcomingBookings = useMemo(() => {
    if (!selectedRoom) return [] as Booking[];

    const now = Date.now();
    return roomModalBookings
      .filter((b) => {
        if (b.status === 'checked-in' || b.status === 'completed') return true;
        if (b.status !== 'pending' && b.status !== 'confirmed') return false;
        const checkInTs = new Date(dt(b.check_in_date, b.check_in_time || '00:00')).getTime();
        return checkInTs >= now - 24 * 3600000;
      })
      .sort((a, b) => {
        const aTs = new Date(dt(a.check_in_date, a.check_in_time || '00:00')).getTime();
        const bTs = new Date(dt(b.check_in_date, b.check_in_time || '00:00')).getTime();
        return aTs - bTs;
      })
      .slice(0, 8);
  }, [selectedRoom, roomModalBookings]);

  const loadChargesAndPayments = async (bookingId: string) => {
    const [chargesRes, paymentsRes] = await Promise.all([
      supabase.from('booking_charges').select('*').eq('booking_id', bookingId),
      supabase.from('payments').select('*').eq('booking_id', bookingId),
    ]);
    return { charges: chargesRes.data || [], payments: paymentsRes.data || [] };
  };

  const handleAddCharge = async () => {
    if (!chargesDialog || !chargeDescription.trim() || chargeAmount <= 0) return;
    setActionLoading('charge');
    try {
      const { error } = await supabase.from('booking_charges').insert({
        booking_id: chargesDialog.booking.id,
        description: chargeDescription.trim(),
        amount: chargeAmount,
      });
      if (error) { showError('Add Charge Failed', error.message); setActionLoading(null); return; }
      await logActivity('Charge Added', `${chargeDescription.trim()} — ${settings.currencySymbol}${chargeAmount} added to Suite #${chargesDialog.room.room_number}`, chargesDialog.booking.id);
      setModalStack(null);
      setChargesDialog(null);
      setChargeDescription('');
      setChargeAmount(0);
      showSuccess(`Charge of ${settings.currencySymbol}${chargeAmount} added`);
    } catch (err: any) {
      showError('Add Charge Failed', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentDialog || paymentAmount <= 0 || !paymentMethod) return;
    setActionLoading('payment');
    try {
      const { error } = await supabase.from('payments').insert({
        booking_id: paymentDialog.booking.id,
        amount: paymentAmount,
        method: paymentMethod,
        reference: paymentReference.trim(),
      });
      if (error) { showError('Payment Failed', error.message); setActionLoading(null); return; }
      await logActivity('Payment Recorded', `${settings.currencySymbol}${paymentAmount} via ${paymentMethod}${paymentReference ? ` (ref: ${paymentReference})` : ''} for Suite #${paymentDialog.room.room_number}`, paymentDialog.booking.id);
      setModalStack(null);
      setPaymentDialog(null);
      setPaymentAmount(0);
      setPaymentMethod('');
      setPaymentReference('');
      showSuccess(`${settings.currencySymbol}${paymentAmount} payment recorded`);
    } catch (err: any) {
      showError('Payment Failed', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateInvoice = async (booking: Booking, room: Room) => {
    setActionLoading('invoice');
    try {
      const { charges, payments } = await loadChargesAndPayments(booking.id);
      await buildAndShowInvoice(booking, room, charges, payments);
    } catch (err: any) {
      showError('Invoice Error', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const buildAndShowInvoice = async (booking: Booking, room: Room, charges: any[], payments: any[]) => {
    let promoCode: any;
    if ((booking as any).promo_code_id) {
      const { data } = await supabase.from('promo_codes').select('code, description, discount_type, discount_value').eq('id', (booking as any).promo_code_id).maybeSingle();
      promoCode = data;
    }
    setInvoiceDialog({ booking, room, charges, payments, promoCode });
  };

  const goBackFromDialog = useCallback(() => {
    if (!modalStack) return;
    setSelectedRoom(modalStack.room);
    setRoomPhotoIndex(modalStack.photoIndex);
    setRoomModalSection(modalStack.section || 'overview');
    setModalStack(null);
    setChargesDialog(null);
    setPaymentDialog(null);
    setInvoiceDialog(null);
    setBookingsModal(null);
    setEditBookingDialog(null);
    setExtendStayDialog(null);
    setTransferDialog(null);
    setCancelDialog(null);
    setCheckInDialog(null);
    setCheckOutDialog(null);
    setConfirmDialog(null);
    setOrderDetailModal(null);
  }, [modalStack]);

  const runRoomModalAction = useCallback((actionKey: string, bookingId?: string) => {
    if (!selectedRoom) return;

    // When a bookingId is supplied (row-level action), resolve it from the loaded list.
    // Fall back to the globally inferred modalBooking for top-level actions.
    const resolveBooking = (): Booking | null => {
      if (bookingId) {
        return (
          roomModalBookings.find((b) => b.id === bookingId) ||
          currentAndUpcomingBookings.find((b) => b.id === bookingId) ||
          modalBooking
        );
      }
      return modalBooking;
    };

    const notYet = (label: string) => showError('Action Not Yet Wired', `${label} will be connected in the next iteration.`);

    const close = () => {
      setModalStack({ room: selectedRoom, photoIndex: roomPhotoIndex, section: roomModalSection });
      closeRoomModal();
    };

    switch (actionKey) {
      case 'new-walkin-checkin':
        close(); setCheckInDialog({ room: selectedRoom });
        break;
      case 'create-reservation':
        close(); setCheckInDialog({ room: selectedRoom, mode: 'reservation' });
        break;
      case 'block-room':
        close(); setConfirmDialog({ title: 'Block Room', message: `Mark Suite #${selectedRoom.room_number} as reserved?`, action: () => updateRoomStatus(selectedRoom, 'reserved') });
        break;
      case 'mark-cleaning':
        close(); setConfirmDialog({ title: 'Mark Cleaning', message: `Mark Suite #${selectedRoom.room_number} as cleaning?`, action: () => updateRoomStatus(selectedRoom, 'cleaning') });
        break;
      case 'mark-maintenance':
        close(); setConfirmDialog({ title: 'Mark Maintenance', message: `Mark Suite #${selectedRoom.room_number} as maintenance?`, action: () => updateRoomStatus(selectedRoom, 'maintenance') });
        break;
      case 'edit-room-details':
        onNavigate('admin-dashboard');
        break;
      case 'view-guest-profile': {
        const b = resolveBooking();
        close(); b && setBookingsModal({ room: selectedRoom, bookings: [b] });
        break;
      }
      case 'extend-stay': {
        const b = resolveBooking();
        close(); b && setExtendStayDialog({ booking: b, room: selectedRoom });
        break;
      }
      case 'transfer-room':
        close(); setTransferDialog(selectedRoom);
        break;
      case 'add-guest-order':
        close(); setActiveTab('orders');
        break;
      case 'add-charges': {
        const b = resolveBooking();
        close(); b && setChargesDialog({ booking: b, room: selectedRoom });
        break;
      }
      case 'create-invoice': {
        const b = resolveBooking();
        close(); b && handleCreateInvoice(b, selectedRoom);
        break;
      }
      case 'payment-history': {
        const b = resolveBooking();
        close(); b && setPaymentDialog({
          booking: b,
          room: selectedRoom,
          outstanding: Math.max(0, Number(b.total_price || 0) + (roomModalCharges || []).reduce((s: number, c: any) => s + Number(c.amount), 0) - (roomModalPayments || []).reduce((s: number, p: any) => s + Number(p.amount), 0) - Number(b.discount_amount || 0)),
        });
        break;
      }
      case 'process-checkout':
        close(); setCheckOutDialog({ room: selectedRoom });
        break;
      case 'view-chat':
        close(); setActiveTab('chat');
        if (modalBooking?.id) setSelectedChatBooking(modalBooking.id);
        break;
      case 'view-reservation': {
        const b = resolveBooking();
        close(); b ? setBookingsModal({ room: selectedRoom, bookings: [b] }) : onShowNoBooking();
        break;
      }
      case 'confirm-checkin': {
        const b = resolveBooking();
        close(); setCheckInDialog({ room: selectedRoom, booking: b || undefined });
        break;
      }
      case 'modify-reservation': {
        const b = resolveBooking();
        close(); b && setEditBookingDialog({ booking: b, room: selectedRoom });
        b && setEditRecurringRule(b.recurring_rule || '');
        break;
      }
      case 'cancel-reservation': {
        const b = resolveBooking();
        close(); b && setCancelDialog({ booking: b, guestName: (b as any).customers?.full_name || 'Guest', roomNumber: selectedRoom.room_number || '?' });
        break;
      }
      case 'contact-guest':
        close(); setActiveTab('chat');
        if (modalBooking?.id) setSelectedChatBooking(modalBooking.id);
        break;
      case 'mark-available':
        close(); setConfirmDialog({ title: 'Return to Service', message: `Mark Suite #${selectedRoom.room_number} as available?`, action: () => updateRoomStatus(selectedRoom, 'available') });
        break;
      case 'assign-housekeeping':
        close();
        supabase.from('users').select('*').eq('role', 'cleaner').order('full_name', { ascending: true }).then(({ data }) => {
          if (data) setCleaners(data);
        });
        setHousekeepingDialog({ room: selectedRoom, booking: modalBooking || undefined });
        break;
      case 'view-clean-history':
        close(); setBookingsModal({ room: selectedRoom, bookings: roomModalBookings });
        break;
      case 'view-maintenance':
        close(); setActiveTab('requests');
        break;
      case 'assign-technician':
        close(); setActiveTab('requests');
        break;
      case 'complete-maintenance':
        close(); setConfirmDialog({ title: 'Complete Maintenance', message: `Return Suite #${selectedRoom.room_number} to service?`, action: () => updateRoomStatus(selectedRoom, 'available') });
        break;
      case 'return-to-service':
        close(); setConfirmDialog({ title: 'Return to Service', message: `Mark Suite #${selectedRoom.room_number} as available?`, action: () => updateRoomStatus(selectedRoom, 'available') });
        break;
      case 'quick-search-guest':
      case 'quick-search-reservation':
      case 'quick-search-room':
        close(); setSearchOpen(true);
        break;
      case 'add-new-order':
        close(); setActiveTab('orders');
        break;
      case 'add-service-request':
        close(); setActiveTab('requests');
        break;
      default:
        notYet('This action');
        break;
    }
  }, [selectedRoom, modalBooking, currentAndUpcomingBookings, roomModalBookings, roomModalCharges, roomModalPayments, roomPhotoIndex, closeRoomModal]);

  const onShowNoBooking = () => showError('No Booking Found', 'No active/reserved booking is linked to this room yet.');

  type QuickAction = {
    key: string;
    label: string;
    icon: LucideIcon;
    tone: 'emerald' | 'blue' | 'amber' | 'rose' | 'violet' | 'slate';
    shortcut?: string;
    badge?: string;
  };

  const modalActions = useMemo<QuickAction[]>(() => {
    if (!selectedRoom) {
      return [];
    }

    switch (selectedRoom.status) {
      case 'available':
        return [
          { key: 'new-walkin-checkin', label: 'Walk-In Check-In', icon: UserPlus, tone: 'emerald', shortcut: 'Alt+W', badge: 'HOT' },
          { key: 'create-reservation', label: 'New Reservation', icon: CalendarPlus, tone: 'blue', shortcut: 'Alt+R', badge: 'HOT' },
          { key: 'block-room', label: 'Block Room', icon: Shield, tone: 'slate', shortcut: 'Alt+B' },
          { key: 'mark-cleaning', label: 'Cleaning Mode', icon: Sparkles, tone: 'amber', shortcut: 'Alt+C' },
          { key: 'mark-maintenance', label: 'Maintenance Mode', icon: Wrench, tone: 'violet', shortcut: 'Alt+M' },
          { key: 'edit-room-details', label: 'Edit Room', icon: Pencil, tone: 'slate', shortcut: 'Alt+E' },
        ];
      case 'booked':
        return [
          { key: 'view-guest-profile', label: 'Current Guest', icon: User, tone: 'slate', shortcut: 'Alt+G' },
          { key: 'extend-stay', label: 'Extend Stay', icon: CalendarClock, tone: 'blue', shortcut: 'Alt+S' },
          { key: 'add-guest-order', label: 'Add Order', icon: ShoppingCart, tone: 'amber', shortcut: 'Alt+O', badge: 'HOT' },
          { key: 'add-charges', label: 'Add Charges', icon: Receipt, tone: 'slate', shortcut: 'Alt+A' },
          { key: 'payment-history', label: 'Record Payment', icon: CreditCard, tone: 'emerald', shortcut: 'Alt+P', badge: 'HOT' },
          { key: 'create-invoice', label: 'Create Invoice', icon: FileText, tone: 'blue', shortcut: 'Alt+I' },
          { key: 'transfer-room', label: 'Transfer Room', icon: ArrowRightLeft, tone: 'slate', shortcut: 'Alt+T' },
          { key: 'process-checkout', label: 'Process Checkout', icon: DoorOpen, tone: 'rose', shortcut: 'Alt+X', badge: 'HOT' },
          { key: 'create-reservation', label: 'Advance Booking', icon: CalendarPlus, tone: 'violet', shortcut: 'Alt+N' },
        ];
      case 'reserved':
        return [
          { key: 'confirm-checkin', label: 'Confirm Check-In', icon: CheckCircle, tone: 'emerald', shortcut: 'Alt+C', badge: 'HOT' },
          { key: 'view-reservation', label: 'View Reservation', icon: Calendar, tone: 'blue', shortcut: 'Alt+V' },
          { key: 'modify-reservation', label: 'Modify Reservation', icon: Pencil, tone: 'slate', shortcut: 'Alt+M' },
          { key: 'contact-guest', label: 'Contact Guest', icon: Phone, tone: 'slate', shortcut: 'Alt+G' },
          { key: 'cancel-reservation', label: 'Cancel Reservation', icon: XCircle, tone: 'rose', shortcut: 'Alt+X' },
          { key: 'create-reservation', label: 'Advance Booking', icon: CalendarPlus, tone: 'violet', shortcut: 'Alt+N' },
        ];
      case 'cleaning':
        return [
          { key: 'mark-available', label: 'Mark Available', icon: Check, tone: 'emerald', shortcut: 'Alt+V', badge: 'HOT' },
          { key: 'assign-housekeeping', label: 'Assign Housekeeping', icon: Users, tone: 'blue', shortcut: 'Alt+H' },
          { key: 'view-clean-history', label: 'Cleaning History', icon: Clock, tone: 'slate', shortcut: 'Alt+Y' },
        ];
      case 'maintenance':
        return [
          { key: 'assign-technician', label: 'Assign Technician', icon: Wrench, tone: 'violet', shortcut: 'Alt+T' },
          { key: 'view-maintenance', label: 'View Maintenance', icon: Clipboard, tone: 'slate', shortcut: 'Alt+V' },
          { key: 'complete-maintenance', label: 'Complete Maintenance', icon: CheckCircle, tone: 'emerald', shortcut: 'Alt+C' },
          { key: 'return-to-service', label: 'Return To Service', icon: RefreshCw, tone: 'blue', shortcut: 'Alt+R', badge: 'HOT' },
        ];
      default:
        return [];
    }
  }, [selectedRoom]);

  const favoriteModalActions = useMemo(
    () => modalActions.filter((a) => favoriteActions.includes(a.key)),
    [modalActions, favoriteActions]
  );

  const nonFavoriteModalActions = useMemo(
    () => modalActions.filter((a) => !favoriteActions.includes(a.key)),
    [modalActions, favoriteActions]
  );

  useEffect(() => {
    if (!selectedRoom || modalActions.length === 0) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
      if (isTyping || !event.altKey || event.ctrlKey || event.metaKey) return;

      const action = modalActions.find((a) => {
        if (!a.shortcut) return false;
        const parts = a.shortcut.toLowerCase().split('+');
        const keyPart = parts[parts.length - 1];
        return event.key.toLowerCase() === keyPart;
      });

      if (!action) return;
      event.preventDefault();
      runRoomModalAction(action.key);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedRoom, modalActions, runRoomModalAction]);

  const bookingTimeline = useMemo(() => {
    if (!selectedRoom) return [] as Array<{ label: string; date?: string; time?: string; done: boolean }>;

    const out: Array<{ label: string; date?: string; time?: string; done: boolean }> = [];
    if (modalBooking) {
      out.push({ label: 'Booking created', date: modalBooking.created_at, done: true });
      out.push({
        label: 'Check-in',
        date: modalBooking.check_in_date,
        time: modalBooking.check_in_time,
        done: modalBooking.status === 'checked-in' || modalBooking.status === 'completed',
      });
      out.push({
        label: 'Expected check-out',
        date: modalBooking.check_out_date,
        time: modalBooking.check_out_time,
        done: modalBooking.status === 'completed',
      });
    }

    return out;
  }, [selectedRoom, modalBooking]);

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
          user_name: userProfile?.full_name || 'Front Desk',
          action: 'Clock Out',
          details: `Clocked out after ${netHours.toFixed(2)} net hours (Break: ${mealBreakTaken ? mealBreakDuration + 'm' : 'none'})`
        });

        setActiveTimeEntry(null);
        setClockElapsed('');
        setClockOutNotes('');
        showSuccess('Clock Off successful');
      } else {
        // Prevent multiple active checkins
        const { data: activeChecks } = await supabase
          .from('time_entries')
          .select('*')
          .eq('user_id', staffId)
          .is('clock_out', null);

        if (activeChecks && activeChecks.length > 0) {
          showSuccess('Active checked-in log resumed!');
          setActiveTimeEntry(activeChecks[0]);
          setClockLoading(false);
          return;
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

        if (!error && data) {
          setActiveTimeEntry(data);
          await supabase.from('activity_logs').insert({
            user_id: staffId,
            user_name: userProfile?.full_name || 'Front Desk',
            action: 'Clock In',
            details: `Clocked in for shift on ${now.toLocaleDateString()}`
          });
          showSuccess('Clock On successful');
        } else if (error) {
          showError('Clock In Failed', error.message);
        }
      }

      const { data } = await supabase.from('time_entries').select('*, users!time_entries_user_id_fkey(*)').eq('user_id', staffId).order('clock_in', { ascending: false }).limit(100);
      if (data) setTimeEntries(data);
    } catch (err: any) {
      showError('Clock Error', err.message || 'Failed to clock in/out');
    } finally {
      setClockLoading(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const roomsP = supabase.from('rooms').select('*, hotels(*)').order('room_number', { ascending: true });
    const ordersP = supabase.from('guest_orders').select('*, inventory_items(*), bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false });
    const chatP = supabase.from('chat_messages').select('*, bookings(*, customers(*), rooms(*))').order('created_at', { ascending: true });
    const callsP = supabase.from('staff_calls').select('*, bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false });
    const expectedP = supabase.from('bookings').select('*, customers(*), rooms(*)').eq('check_in_date', today).in('status', ['pending', 'confirmed']).order('check_in_time', { ascending: true });
    const activeP = supabase.from('bookings').select('*, customers(*)').eq('status', 'checked-in');
    const cleanersP = supabase.from('users').select('*').eq('role', 'cleaner').order('full_name', { ascending: true });
    const extsP = supabase.from('stay_extensions').select('*, bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false }).limit(50);
    const ratePlansP = !propRatePlans ? supabase.from('rate_plans').select('*').order('created_at', { ascending: false }) : Promise.resolve(null);
    const promoCodesP = !propPromoCodes ? supabase.from('promo_codes').select('*').order('created_at', { ascending: false }) : Promise.resolve(null);
    const [roomsRes, ordersRes, chatRes, callsRes, expectedRes, activeRes, cleanersRes, extsRes, ratePlansRes, promoCodesRes] = await Promise.all([roomsP, ordersP, chatP, callsP, expectedP, activeP, cleanersP, extsP, ratePlansP, promoCodesP]);
    if (roomsRes && !(roomsRes as any).error && (roomsRes as any).data) setRooms((roomsRes as any).data);
    if (ordersRes && !(ordersRes as any).error && (ordersRes as any).data) setGuestOrders((ordersRes as any).data);
    if (chatRes && !(chatRes as any).error && (chatRes as any).data) setChatMessages((chatRes as any).data);
    if (callsRes && !(callsRes as any).error && (callsRes as any).data) setStaffCalls((callsRes as any).data);
    if (expectedRes && !(expectedRes as any).error && (expectedRes as any).data) setExpectedToday((expectedRes as any).data);
    if (activeRes && !(activeRes as any).error && (activeRes as any).data) {
      setActiveBookingsRaw((activeRes as any).data);
    }
    if (cleanersRes && !(cleanersRes as any).error && (cleanersRes as any).data) {
      setCleaners((cleanersRes as any).data);
    }
    if (extsRes && !(extsRes as any).error && (extsRes as any).data) {
      setStayExtensions((extsRes as any).data);
    }
    if (ratePlansRes && !(ratePlansRes as any).error && (ratePlansRes as any).data) {
      setInternalRatePlans((ratePlansRes as any).data);
    }
    if (promoCodesRes && !(promoCodesRes as any).error && (promoCodesRes as any).data) {
      setInternalPromoCodes((promoCodesRes as any).data);
    }

    // Load current user's time tracking status & logs
    try {
      const staffId = userProfile?.id;
      if (staffId) {
        const [timeRes, holidaysRes, shiftRes, accomplishmentsRes] = await Promise.all([
          supabase.from('time_entries').select('*, users!time_entries_user_id_fkey(*)').eq('user_id', staffId).order('clock_in', { ascending: false }).limit(100),
          supabase.from('hotel_settings').select('value').eq('key', 'holidays_list').maybeSingle(),
          supabase.from('hotel_settings').select('value').eq('key', 'shift_settings').maybeSingle(),
          supabase.from('activity_logs').select('*').eq('user_id', staffId).order('created_at', { ascending: false }).limit(200)
        ]);
        if (timeRes.error) {
          // console.error('frontdesk time_entries load error:', timeRes.error);
        }
        if (timeRes.data) {
          setTimeEntries(timeRes.data);
          const active = timeRes.data.find(e => !e.clock_out);
          setActiveTimeEntry(active || null);
        }
        if (accomplishmentsRes.data) {
          setMyAccomplishments(accomplishmentsRes.data);
        }
        if (holidaysRes.data && Array.isArray(holidaysRes.data.value)) {
          setHolidays(holidaysRes.data.value);
        } else {
          setHolidays([
            { date: '2026-01-01', name: "New Year's Day", type: 'regular' },
            { date: '2026-04-09', name: 'Araw ng Kagitingan', type: 'regular' },
            { date: '2026-05-01', name: 'Labor Day', type: 'regular' },
            { date: '2026-06-12', name: 'Independence Day', type: 'regular' },
            { date: '2026-08-31', name: 'National Heroes Day', type: 'regular' },
            { date: '2026-11-01', name: 'All Saints Day', type: 'special' },
            { date: '2026-11-30', name: 'Bonifacio Day', type: 'regular' },
            { date: '2026-12-25', name: 'Christmas Day', type: 'regular' },
            { date: '2026-12-30', name: 'Rizal Day', type: 'regular' },
          ]);
        }
        if (shiftRes.data && (shiftRes.data.value as any)?.startTime) {
          setShiftStartTime((shiftRes.data.value as any).startTime);
        }
      }
    } catch (e) {
      // console.error("Error loading front desk attendance details:", e);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!userProfile?.id) return;
    loadAll();
  }, [userProfile?.id]);

  // Keep attendance state in sync after re-login and across tabs/sessions.
  useEffect(() => {
    const staffId = userProfile?.id;
    if (!staffId) return;

    const timeChannel = supabase
      .channel(`frontdesk-time-${staffId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'time_entries',
        filter: `user_id=eq.${staffId}`
      }, async () => {
        const { data, error } = await supabase
          .from('time_entries')
          .select('*, users!time_entries_user_id_fkey(*)')
          .eq('user_id', staffId)
          .order('clock_in', { ascending: false })
          .limit(100);

        if (error) {
          // console.error('frontdesk realtime time_entries error:', error);
          return;
        }

        if (data) {
          setTimeEntries(data);
          const active = data.find(e => !e.clock_out);
          setActiveTimeEntry(active || null);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(timeChannel);
    };
  }, [userProfile?.id]);

  // Realtime rooms sync — reflect status changes made by cleaners or other sources instantly
  useEffect(() => {
    const channel = supabase
      .channel('frontdesk-rooms')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms' }, (payload) => {
        setRooms((prev) => prev.map((r) => (r.id === (payload.new as any).id ? { ...r, ...(payload.new as any) } : r)));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rooms' }, () => {
        // A new room was added by admin — do a targeted rooms refresh
        supabase.from('rooms').select('*, hotels(*)').order('room_number', { ascending: true }).then(({ data }) => {
          if (data) setRooms(data);
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Realtime bookings sync — check-in/out/cancel updates reflected immediately
  useEffect(() => {
    const channel = supabase
      .channel('frontdesk-bookings')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, async (payload) => {
        const b = payload.new as any;
        if (!b?.id) return;
        const { data } = await supabase.from('bookings').select('*, customers(*), rooms(*)').eq('id', b.id).maybeSingle();
        if (!data) return;
        // Add to expected today if applicable
        const today = new Date().toISOString().slice(0, 10);
        if ((data as any).check_in_date === today && ['pending', 'confirmed'].includes((data as any).status)) {
          setExpectedToday((prev) => prev.some((e) => e.id === data.id) ? prev : [...prev, data as any]);
        }
        // Add to active bookings if checked-in
        if ((data as any).status === 'checked-in') {
          setActiveBookingsRaw((prev) => prev.some((e) => e.id === data.id) ? prev : [...prev, data as any]);
        }
        const id = Date.now().toString();
        setToasts((p) => [...p, { id, type: 'info', title: 'New Booking', message: `${(data as any).customers?.full_name || 'Guest'} booked Suite #${(data as any).rooms?.room_number}` }]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, async (payload) => {
        const b = payload.new as any;
        if (!b?.id) return;
        // Update active bookings list in place
        if (b.status === 'checked-in') {
          const { data } = await supabase.from('bookings').select('*, customers(*)').eq('id', b.id).maybeSingle();
          if (data) {
            setActiveBookingsRaw((prev) => {
              const exists = prev.some((e) => e.id === b.id);
              return exists ? prev.map((e) => e.id === b.id ? { ...e, ...(data as any) } : e) : [...prev, data as any];
            });
          }
        } else {
          setActiveBookingsRaw((prev) => prev.filter((e) => e.id !== b.id));
        }
        // Remove from expectedToday when checked in or cancelled
        if (['checked-in', 'cancelled'].includes(b.status)) {
          setExpectedToday((prev) => prev.filter((e) => e.id !== b.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Realtime guest_orders — update badge counts and orders list in place
  useEffect(() => {
    const channel = supabase
      .channel('frontdesk-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guest_orders' }, async (payload) => {
        const o = payload.new as any;
        const { data } = await supabase.from('guest_orders').select('*, inventory_items(*), bookings(*, customers(*), rooms(*))').eq('id', o.id).maybeSingle();
        if (data) setGuestOrders((prev) => [data as any, ...prev]);
        const id = Date.now().toString();
        setToasts((p) => [...p, { id, type: 'info', title: 'New Order', message: `Order received for room #${(data as any)?.bookings?.rooms?.room_number || '?'}` }]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'guest_orders' }, (payload) => {
        const updated = payload.new as any;
        setGuestOrders((prev) => prev.map((o) => o.id === updated.id ? { ...o, ...updated } : o));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Realtime chat messages — append only (don't overwrite seen_at)
  useEffect(() => {
    const channel = supabase
      .channel('frontdesk-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const m = payload.new as any;
        const { data } = await supabase.from('chat_messages').select('*, bookings(*, customers(*), rooms(*))').eq('id', m.id).maybeSingle();
        if (!data) return;
        setChatMessages((prev) => prev.some((c) => c.id === m.id) ? prev : [...prev, data as any]);
        if ((data as any).sender_role === 'guest') {
          const id = Date.now().toString();
          setToasts((p) => [...p, { id, type: 'info', title: 'New Guest Message', message: `${(data as any).sender_name || 'Guest'}: ${((data as any).message || '').slice(0, 60)}` }]);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
        const updated = payload.new as any;
        setChatMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, seen_at: updated.seen_at } : m));
      })
      .subscribe();

      // Typing indicators subscription
      const typingChannel = supabase
        .channel('frontdesk-typing')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'chat_typing'
        }, (payload) => {
          const typingData = payload.new as ChatTyping;
          if (typingData.user_role === 'guest' && typingData.booking_id) {
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

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(typingChannel);
    };
  }, []);

  // Realtime staff_calls — insert new calls immediately
  useEffect(() => {
    const channel = supabase
      .channel('frontdesk-calls')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_calls' }, async (payload) => {
        const c = payload.new as any;
        const { data } = await supabase.from('staff_calls').select('*, bookings(*, customers(*), rooms(*))').eq('id', c.id).maybeSingle();
        if (data) {
          setStaffCalls((prev) => [data as any, ...prev]);
          const id = Date.now().toString();
          setToasts((p) => [...p, { id, type: 'info', title: 'Staff Call', message: `${(data as any).guest_name || 'Guest'}: ${(data as any).reason || 'Help requested'}` }]);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'staff_calls' }, (payload) => {
        const updated = payload.new as any;
        setStaffCalls((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Realtime notification when a cleaner completes a task — auto-update room if needed
  useEffect(() => {
    const channel = supabase
      .channel('frontdesk-tasks')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, async (payload) => {
        const newStatus = (payload.new as any)?.status;
        const oldStatus = (payload.old as any)?.status;
        if (newStatus === 'completed' && oldStatus !== 'completed') {
          // Use booking relation for room lookup instead of regex on title
          const taskId: string = (payload.new as any)?.id;
          const { data: task } = await supabase.from('tasks').select('*, bookings(room_id, rooms(room_number))').eq('id', taskId).maybeSingle();
          const roomId = (task as any)?.bookings?.room_id;
          const roomNumber = (task as any)?.bookings?.rooms?.room_number;
          if (roomId) {
            const { data: room } = await supabase.from('rooms').select('status').eq('id', roomId).maybeSingle();
            if (room && room.status === 'cleaning') {
              await supabase.from('rooms').update({ status: 'available' }).eq('id', roomId);
            }
          }
          const label = roomNumber ? `Suite #${roomNumber}` : 'Room';
          const id = Date.now().toString();
          setToasts((p) => [...p, { id, type: 'success', title: 'Cleaning Completed', message: `${label} is now available.` }]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Realtime stay_extensions — new guest extension requests appear immediately
  useEffect(() => {
    const channel = supabase
      .channel('frontdesk-extensions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stay_extensions' }, async (payload) => {
        const ext = payload.new as any;
        const { data } = await supabase.from('stay_extensions').select('*, bookings(*, customers(*), rooms(*))').eq('id', ext.id).maybeSingle();
        if (data) {
          setStayExtensions((prev) => [data as any, ...prev]);
          const guestName = (data as any).bookings?.customers?.full_name || 'Guest';
          const roomNum = (data as any).bookings?.rooms?.room_number || '?';
          const id = Date.now().toString();
          setToasts((p) => [...p, { id, type: 'info', title: 'Extension Request', message: `${guestName} in Suite #${roomNum} wants to extend their stay.` }]);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stay_extensions' }, (payload) => {
        const updated = payload.new as any;
        setStayExtensions((prev) => prev.map((e) => e.id === updated.id ? { ...e, ...updated } : e));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Lightweight polling fallback (realtime is primary; this catches any missed events)
  useEffect(() => {
    const interval = setInterval(async () => {
      const [ordersRes, chatRes, callsRes] = await Promise.all([
        supabase.from('guest_orders').select('*, inventory_items(*), bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false }).limit(50),
        supabase.from('chat_messages').select('*, bookings(*, customers(*), rooms(*))').order('created_at', { ascending: true }).limit(50),
        supabase.from('staff_calls').select('*, bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false }).limit(50),
      ]);
      if (ordersRes.data) {
        setGuestOrders((prev) => {
          const prevMap = new Map(prev.map((o) => [o.id, o]));
          return ordersRes.data!.map((o) => ({ ...(prevMap.get(o.id) || {}), ...o }));
        });
      }
      if (chatRes.data) {
        setChatMessages((prev) => {
          const prevMap = new Map(prev.map((m) => [m.id, m]));
          return chatRes.data!.map((m) => {
            const local = prevMap.get(m.id);
            return { ...m, seen_at: local?.seen_at ?? m.seen_at };
          });
        });
      }
      if (callsRes.data) {
        setStaffCalls((prev) => {
          const prevMap = new Map(prev.map((c) => [c.id, c]));
          return callsRes.data!.map((c) => ({ ...(prevMap.get(c.id) || {}), ...c }));
        });
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, selectedChatBooking]);

  // Mark guest messages as seen when staff opens a conversation
  useEffect(() => {
    if (!selectedChatBooking) return;
    const now = new Date().toISOString();
    const unreadMsgs = chatMessages.filter(
      m => m.booking_id === selectedChatBooking && m.sender_role === 'guest' && !m.seen_at
    );
    if (unreadMsgs.length === 0) return;
    setChatMessages(prev => prev.map(m =>
      m.booking_id === selectedChatBooking && m.sender_role === 'guest' && !m.seen_at
        ? { ...m, seen_at: now }
        : m
    ));
    for (const msg of unreadMsgs) {
      supabase.from('chat_messages').update({ seen_at: now }).eq('id', msg.id).then(({ error }) => {
        if (error) setChatMessages(prev => prev.map(m => m.id === msg.id ? { ...m, seen_at: null as any } : m));
      });
    }
  }, [selectedChatBooking]);

  // Helper: check if a booking's check-out time has passed
  const isBookingOverstayed = (b: Booking): boolean => {
    const now = new Date();
    const timeStr = b.check_out_time;
    const [t, mod] = timeStr.split(' ');
    let [h, m] = t.split(':').map(Number);
    if (mod === 'PM' && h !== 12) h += 12;
    if (mod === 'AM' && h === 12) h = 0;
    const checkoutDate = new Date(b.check_out_date);
    checkoutDate.setHours(h, m, 0, 0);
    return now > checkoutDate;
  };

  // Derived: only show active guests whose room status also confirms "booked"
  const activeGuests = new Map<string, string>();
  const overstayedRoomIds = new Set<string>();
  const roomStatusMap = new Map(rooms.map((r) => [r.id, r.status]));
  for (const b of activeBookingsRaw) {
    if (roomStatusMap.get(b.room_id) === 'booked') {
      activeGuests.set(b.room_id, (b as any).customers?.full_name || 'Guest');
      if (isBookingOverstayed(b)) overstayedRoomIds.add(b.room_id);
    }
  }

  const statCounts = {
    available: rooms.filter((r) => r.status === 'available').length,
    booked: rooms.filter((r) => r.status === 'booked').length,
    reserved: rooms.filter((r) => r.status === 'reserved').length,
    cleaning: rooms.filter((r) => r.status === 'cleaning').length,
    maintenance: rooms.filter((r) => r.status === 'maintenance').length,
  };

  const dailyRevenue = activeBookingsRaw.reduce((sum, b) => sum + Number(b.total_price || 0), 0);

  const VALID_ROOM_STATUSES = ['available', 'booked', 'reserved', 'cleaning', 'maintenance'] as const;
  type ValidRoomStatus = typeof VALID_ROOM_STATUSES[number];

  const updateRoomStatus = async (room: Room, newStatus: string) => {
    if (!VALID_ROOM_STATUSES.includes(newStatus as ValidRoomStatus)) {
      showError('Invalid Status', `"${newStatus}" is not a valid room status.`);
      return;
    }
    setActionLoading(room.id);
    const prevStatus = room.status;
    setRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, status: newStatus as Room['status'] } : r));
    setConfirmDialog(null);
    try {
      const { error } = await supabase.from('rooms').update({ status: newStatus }).eq('id', room.id);
      if (error) {
        setRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, status: prevStatus } : r));
        setActionLoading(null);
        showError('Update Failed', `Room update error: ${error.message}`);
        return;
      }
      const { data } = await supabase.from('rooms').select('status').eq('id', room.id).single();
      if ((data as any)?.status !== newStatus) {
        setRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, status: prevStatus } : r));
        setActionLoading(null);
        showError('Update Blocked', 'The database silently rejected the update.');
        return;
      }
      await logActivity('Room Status Update', `Suite #${room.room_number} → ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      showSuccess(`Suite #${room.room_number} → ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
    } catch (err: any) {
      setRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, status: prevStatus } : r));
      showError('Update Failed', err.message || 'Failed to update room status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditBooking = async () => {
    if (!editBookingDialog) return;
    const { booking, room } = editBookingDialog;
    setActionLoading(room.id);
    try {
      const { error } = await supabase.from('bookings').update({
        check_in_date: editCheckInDate,
        check_out_date: editCheckOutDate,
        check_in_time: editCheckInTime,
        check_out_time: editCheckOutTime,
        recurring_rule: editRecurringRule || null,
      }).eq('id', booking.id);
      if (error) { showError('Edit Failed', error.message); setActionLoading(null); return; }
      await logActivity('Booking Edited', `Suite #${room.room_number} booking updated: ${editCheckInDate} ${editCheckInTime} → ${editCheckOutDate} ${editCheckOutTime}`, booking.id);
      setModalStack(null);
      setEditBookingDialog(null);
      showSuccess(`Booking for Suite #${room.room_number} updated`);
    } catch (err: any) {
      showError('Edit Failed', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelBooking = async () => {
    if (!cancelDialog || !cancelReason.trim()) return;
    const { booking } = cancelDialog;
    try {
      const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id);
      if (error) { showError('Cancel Failed', error.message); return; }
      
      // Make the room available when cancelling the reservation/booking
      await supabase.from('rooms').update({ status: 'available' }).eq('id', booking.room_id);

      await logActivity('Cancelled', `${cancelDialog.guestName}'s booking for Suite #${cancelDialog.roomNumber} — Reason: ${cancelReason.trim()}`);
      setModalStack(null);
      setCancelDialog(null);
      setCancelReason('');
      showSuccess(`Booking for Suite #${cancelDialog.roomNumber} cancelled`);
    } catch (err: any) {
      showError('Cancel Failed', err.message);
    }
  };

  const handleExtendStay = async () => {
    if (!extendStayDialog) return;
    const { booking, room } = extendStayDialog;
    const totalMinutes = extendDays * 1440 + extendHours * 60 + extendMinutes;
    if (totalMinutes < 1) { showError('Extend Stay', 'Add at least 1 minute to extend.'); return; }
    if (extendConflicts.length > 0) {
      showError('Extend Stay', 'Cannot extend — there are overlapping bookings during the extended period.');
      return;
    }
    setActionLoading('extend');
    try {
      const currentOut = new Date(dt(booking.check_out_date, booking.check_out_time));
      const newOut = new Date(currentOut.getTime() + totalMinutes * 60000);
      const y = newOut.getFullYear();
      const m = `${newOut.getMonth() + 1}`.padStart(2, '0');
      const d = `${newOut.getDate()}`.padStart(2, '0');
      let h = newOut.getHours();
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      const min = `${newOut.getMinutes()}`.padStart(2, '0');
      const newDate = `${y}-${m}-${d}`;
      const newTime = `${h}:${min} ${ampm}`;

      const { error, data } = await supabase.from('bookings').update({
        check_out_date: newDate,
        check_out_time: newTime,
      }).eq('id', booking.id).select('id');
      if (error) { showError('Extend Stay Failed', error.message); setActionLoading(null); return; }
      if (!data || data.length === 0) {
        showError('Extend Stay Failed', 'Booking not found — it may have been deleted or cancelled already.');
        setActionLoading(null); return;
      }

      await logActivity('Stay Extended', `Suite #${room.room_number} extended by ${extendDays}d ${extendHours}h ${extendMinutes}m — new check-out: ${newDate} ${newTime}`, booking.id);
      setModalStack(null);
      setExtendStayDialog(null);
      setExtendDays(0); setExtendHours(0); setExtendMinutes(0); setExtendConflicts([]);
      showSuccess(`Stay extended to ${m}/${d}/${y} ${newTime}`);
    } catch (err: any) {
      showError('Extend Stay Failed', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRoomTransfer = async () => {
    if (!transferDialog || !transferTargetRoomId || !modalBooking) return;
    setActionLoading('transfer');
    try {
      const targetRoom = rooms.find(r => r.id === transferTargetRoomId);
      if (!targetRoom) { showError('Transfer Failed', 'Target room not found.'); setActionLoading(null); return; }

      const { error: bookErr } = await supabase.from('bookings').update({ room_id: targetRoom.id }).eq('id', modalBooking.id);
      if (bookErr) { showError('Transfer Failed', `Booking update error: ${bookErr.message}`); setActionLoading(null); return; }

      await supabase.from('rooms').update({ status: 'available' }).eq('id', transferDialog.id);
      await supabase.from('rooms').update({ status: 'booked' }).eq('id', targetRoom.id);

      await logActivity('Room Transfer', `${(modalBooking as any).customers?.full_name || 'Guest'} transferred from Suite #${transferDialog.room_number} to Suite #${targetRoom.room_number}`, modalBooking.id);
      setModalStack(null);
      setTransferDialog(null);
      setTransferTargetRoomId(null);
      showSuccess(`Guest transferred to Suite #${targetRoom.room_number}`);
    } catch (err: any) {
      showError('Transfer Failed', err.message || 'Unexpected error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSelectRoom = (room: Room) => {
    setSelectedRoom((prev) => prev?.id === room.id ? null : room);
  };

  // Force room modal data refresh when a room is newly selected (including re-selecting same room after dialog closes)
  useEffect(() => {
    if (selectedRoom) setRoomModalRefreshKey((k) => k + 1);
  }, [selectedRoom?.id]);

  const handleQuickAction = (room: Room, action: string) => {
    if (action === 'check-in' && room.status === 'available') {
      setCheckInDialog({ room });
      return;
    }
    if (action === 'check-out' && room.status === 'booked') {
      setCheckOutDialog({ room });
      return;
    }
    if (action === 'mark-available') {
      setConfirmDialog({ title: 'Mark Available', message: `Mark Suite #${room.room_number} as available?`, action: () => updateRoomStatus(room, 'available') });
      return;
    }
    // view, billing, status — these open the room modal/drawer
    setSelectedRoom(room);
  };

  // Chat conversations
  const chatConversations = (() => {
    const convMap = new Map<string, { bookingId: string; lastMsg: ChatMessage; msgCount: number; guestName: string; roomNumber: string; unreadCount: number }>();
    for (const msg of chatMessages) {
      const bid = msg.booking_id;
      if (!bid) continue;
      const existing = convMap.get(bid);
      const guestName = msg.bookings?.customers?.full_name || 'Guest';
      const roomNumber = msg.bookings?.rooms?.room_number || '?';
      if (existing) {
        existing.msgCount++;
        if (new Date(msg.created_at) > new Date(existing.lastMsg.created_at)) existing.lastMsg = msg;
        if (msg.sender_role === 'guest' && !msg.seen_at) existing.unreadCount++;
      } else {
        convMap.set(bid, { bookingId: bid, lastMsg: msg, msgCount: 1, guestName, roomNumber, unreadCount: msg.sender_role === 'guest' && !msg.seen_at ? 1 : 0 });
      }
    }
    return Array.from(convMap.values()).sort((a, b) => new Date(b.lastMsg.created_at).getTime() - new Date(a.lastMsg.created_at).getTime());
  })();

  const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChatInput(e.target.value);
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
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedChatBooking) return;
    try {
      const msgText = chatInput.trim();
      const { error } = await supabase.from('chat_messages').insert({
        booking_id: selectedChatBooking,
        sender_id: userProfile?.id || '',
        sender_name: userProfile?.full_name || 'Front Desk',
        sender_role: 'staff',
        message: msgText,
      });
      if (error) { showError('Chat Error', `Failed to send message: ${error.message}`); return; }
      setChatInput('');
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

      // Get guest context
      const bookingMsgs = chatMessages.filter(m => m.booking_id === selectedChatBooking);
      const guestName = bookingMsgs[0]?.bookings?.customers?.full_name || 'Guest';
      const roomNum = bookingMsgs[0]?.bookings?.rooms?.room_number || 'N/A';
      
      await logActivity('Chat Reply', `Responded to chat inquiry from ${guestName} (Suite #${roomNum}): "${msgText.substring(0, 40)}${msgText.length > 40 ? '...' : ''}"`);
      
      // Reload accomplishments
      const staffId = userProfile?.id;
      if (staffId) {
        const { data } = await supabase.from('activity_logs').select('*').eq('user_id', staffId).order('created_at', { ascending: false }).limit(200);
        if (data) setMyAccomplishments(data);
      }
    } catch (err: any) {
      showError('Chat Error', `Failed to send message: ${err.message}`);
    }
  };

  const updateOrderStatus = async (order: GuestOrder, newStatus: string) => {
    try {
      const { error } = await supabase.from('guest_orders').update({ status: newStatus }).eq('id', order.id);
      if (error) { showError('Order Update Failed', `Order update error: ${error.message}`); return; }
      const { data } = await supabase.from('guest_orders').select('status').eq('id', order.id).single();
      if ((data as any)?.status !== newStatus) { showError('Order Update Blocked', 'Order update was silently rejected.'); return; }
      
      const guestName = order.bookings?.customers?.full_name || 'Guest';
      const roomNum = order.bookings?.rooms?.room_number || 'N/A';
      await logActivity('Order Update', `Updated guest order state to "${newStatus}" for ${guestName} (Suite #${roomNum})`);
      showSuccess(`Order #${order.id.slice(0, 6)} → ${newStatus}`);
    } catch (err: any) {
      showError('Order Update Failed', err.message);
    }
  };

  const updateCallStatus = async (call: StaffCall, newStatus: string) => {
    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'responded' || newStatus === 'completed') updates.responded_at = new Date().toISOString();
      const { error } = await supabase.from('staff_calls').update(updates).eq('id', call.id);
      if (error) { showError('Request Update Failed', `Staff call update error: ${error.message}`); return; }
      const { data } = await supabase.from('staff_calls').select('status').eq('id', call.id).single();
      if ((data as any)?.status !== newStatus) { showError('Request Update Blocked', 'Staff call update was silently rejected.'); return; }
      
      const roomNum = call.bookings?.rooms?.room_number || 'N/A';
      await logActivity('Service Request Update', `Updated request "${call.reason || 'Service Request'}" from ${call.guest_name} (Suite #${roomNum}) to "${newStatus}"`);
      showSuccess(`Request from ${call.guest_name} ${newStatus}`);
    } catch (err: any) {
      showError('Request Update Failed', err.message);
    }
  };

  const handleApproveExtension = async (ext: any) => {
    try {
      await supabase.from('stay_extensions').update({ status: 'approved', reviewed_by: userProfile?.id }).eq('id', ext.id);
      if (ext.requested_check_out_date) {
        await supabase.from('bookings').update({ check_out_date: ext.requested_check_out_date }).eq('id', ext.booking_id);
      }
      setStayExtensions((prev) => prev.map((e) => e.id === ext.id ? { ...e, status: 'approved' } : e));
      showSuccess('Extension approved');
    } catch (err: any) {
      showError('Approval Failed', err.message);
    }
  };

  const handleRejectExtension = async (ext: any) => {
    try {
      await supabase.from('stay_extensions').update({ status: 'rejected', reviewed_by: userProfile?.id }).eq('id', ext.id);
      setStayExtensions((prev) => prev.map((e) => e.id === ext.id ? { ...e, status: 'rejected' } : e));
      showSuccess('Extension rejected');
    } catch (err: any) {
      showError('Rejection Failed', err.message);
    }
  };

  const badges = {
    rooms: 0,
    orders: guestOrders.filter((o) => o.status === 'pending' || o.status === 'preparing').length,
    chat: chatConversations.reduce((s, c) => s + c.unreadCount, 0),
    requests: staffCalls.filter((c) => c.status === 'pending').length + stayExtensions.filter((e) => e.status === 'pending').length,
  };

  const orderStats = {
    pending: guestOrders.filter((o) => o.status === 'pending').length,
    preparing: guestOrders.filter((o) => o.status === 'preparing').length,
    served: guestOrders.filter((o) => o.status === 'served').length,
    cancelled: guestOrders.filter((o) => o.status === 'cancelled').length,
  };
  
  const liveGrossHours = activeTimeEntry ? Math.max(0, (Date.now() - new Date(activeTimeEntry.clock_in).getTime()) / 3600000) : 0;
  const liveNetHours = activeTimeEntry ? Math.max(0, liveGrossHours - (mealBreakTaken ? mealBreakDuration / 60 : 0)) : 0;
  const isOvertimeActive = liveNetHours > 8;
  const overtimeLiveAmount = isOvertimeActive ? liveNetHours - 8 : 0;

  // POS derived categories
  const posCategories = useMemo(() => [...new Set(posItems.map((i: any) => i.menu_categories?.name).filter(Boolean))], [posItems]);

  // POS Register: load items
  useEffect(() => {
    if (showPos) {
      supabase.from('inventory_items').select('*, menu_categories(*)').then(({ data }) => {
        if (data) setPosItems(data);
      });
    }
  }, [showPos]);

  // POS Cart functions
  const addToCart = (item: any) => {
    setPosCart(prev => {
      const existing = prev.find(c => c.item.id === item.id);
      if (existing) return prev.map(c => c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { item, qty: 1 }];
    });
  };
  const updateQty = (itemId: string, delta: number) => {
    setPosCart(prev => prev.map(c => c.item.id === itemId ? { ...c, qty: Math.max(1, c.qty + delta) } : c).filter(c => c.qty > 0));
  };
  const clearCart = () => setPosCart([]);

  // POS Complete Sale handler
  const handlePosComplete = async () => {
    if (posCart.length === 0) return;
    setPosLoading(true);
    try {
      for (const entry of posCart) {
        const total = Number(entry.item.price) * entry.qty;
        if (posChargeMethod === 'room' && posSelectedBooking) {
          await supabase.from('booking_charges').insert({
            booking_id: posSelectedBooking,
            description: `POS: ${entry.item.name} x${entry.qty}`,
            amount: total
          });
        } else {
          await supabase.from('booking_charges').insert({
            booking_id: null,
            description: `Cash Sale: ${entry.item.name} x${entry.qty}`,
            amount: total
          });
        }
      }
      const grandTotal = posCart.reduce((s, c) => s + Number(c.item.price) * c.qty, 0);
      showSuccess(`Sale Complete — ${settings.currencySymbol}${grandTotal.toFixed(2)} processed.`);
      clearCart();
      setShowPos(false);
    } catch (err: any) {
      showError('Sale Failed', err.message || 'Failed to complete sale');
    } finally {
      setPosLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 text-surface-800 font-sans tracking-tight flex">
      {/* POS Register Panel */}
      {showPos && (
        <div className="fixed inset-0 bg-surface-900/30 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col">
            <div className="p-4 border-b border-surface-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-surface-900">POS Register</h2>
              <button onClick={() => { setShowPos(false); clearCart(); }} className="p-1.5 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <input type="text" placeholder="Search items..." value={posSearch} onChange={e => setPosSearch(e.target.value)}
                className="w-full bg-surface-50 border border-surface-200 rounded-lg py-2 px-3 text-xs mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
              <div className="flex gap-1.5 mb-4 flex-wrap">
                <button onClick={() => setPosCategory('')} className={`px-2.5 py-1 text-[10px] font-bold rounded-full cursor-pointer ${!posCategory ? 'bg-surface-900 text-white' : 'bg-surface-100 text-surface-500 hover:bg-surface-200'}`}>All</button>
                {posCategories.map(cat => (
                  <button key={cat} onClick={() => setPosCategory(cat)} className={`px-2.5 py-1 text-[10px] font-bold rounded-full cursor-pointer ${posCategory === cat ? 'bg-surface-900 text-white' : 'bg-surface-100 text-surface-500 hover:bg-surface-200'}`}>{cat as string}</button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {posItems
                  .filter((item: any) => !posSearch || item.name.toLowerCase().includes(posSearch.toLowerCase()))
                  .filter((item: any) => !posCategory || (item as any).menu_categories?.name === posCategory)
                  .map((item: any) => (
                    <button key={item.id} onClick={() => addToCart(item)}
                      className="bg-surface-50 hover:bg-surface-100 border border-surface-100 rounded-xl p-3 text-left transition-all cursor-pointer">
                      <div className="text-xs font-bold text-surface-900 truncate">{item.name}</div>
                      <div className="text-[10px] text-surface-400 mt-0.5">{settings.currencySymbol}{Number(item.price).toFixed(2)}</div>
                      <div className="text-[8px] text-surface-400 mt-0.5">Stock: {item.stock_quantity}</div>
                    </button>
                  ))}
              </div>
            </div>
            {posCart.length > 0 && (
              <div className="border-t border-surface-100 p-4 bg-surface-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-surface-900">Cart ({posCart.length} items)</span>
                  <button onClick={clearCart} className="text-[10px] text-rose-500 font-bold cursor-pointer">Clear</button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1 mb-3">
                  {posCart.map((entry: any) => (
                    <div key={entry.item.id} className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-1.5 border border-surface-100">
                      <span className="flex-1 text-[11px] font-medium text-surface-700 truncate">{entry.item.name}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(entry.item.id, -1)} className="w-5 h-5 flex items-center justify-center bg-surface-100 rounded text-[10px] font-bold text-surface-600 hover:bg-surface-200 cursor-pointer">-</button>
                        <span className="text-xs font-bold text-surface-900 w-5 text-center">{entry.qty}</span>
                        <button onClick={() => updateQty(entry.item.id, 1)} className="w-5 h-5 flex items-center justify-center bg-surface-100 rounded text-[10px] font-bold text-surface-600 hover:bg-surface-200 cursor-pointer">+</button>
                      </div>
                      <span className="text-[11px] font-bold text-surface-900 w-16 text-right">{settings.currencySymbol}{(Number(entry.item.price) * entry.qty).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mb-3">
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-surface-600 cursor-pointer">
                    <input type="radio" name="posCharge" checked={posChargeMethod === 'room'} onChange={() => setPosChargeMethod('room')} className="accent-surface-900" /> Charge to Room
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-surface-600 cursor-pointer">
                    <input type="radio" name="posCharge" checked={posChargeMethod === 'cash'} onChange={() => setPosChargeMethod('cash')} className="accent-surface-900" /> Cash Sale
                  </label>
                </div>
                {posChargeMethod === 'room' && (
                  <select value={posSelectedBooking} onChange={e => setPosSelectedBooking(e.target.value)}
                    className="w-full bg-white border border-surface-200 rounded-lg py-2 px-3 text-xs mb-3 focus:outline-none cursor-pointer">
                    <option value="">Select a room...</option>
                    {activeBookingsRaw.filter((b: any) => b.status === 'checked-in').map((b: any) => (
                      <option key={b.id} value={b.id}>#{(b as any).rooms?.room_number} - {(b as any).customers?.full_name}</option>
                    ))}
                  </select>
                )}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-surface-500 font-medium">Total</span>
                  <span className="text-lg font-black text-surface-900">{settings.currencySymbol}{(posCart as any[]).reduce((s: any, c: any) => s + Number(c.item.price) * c.qty, 0).toFixed(2)}</span>
                </div>
                <button onClick={handlePosComplete} disabled={posLoading || (posChargeMethod === 'room' && !posSelectedBooking)}
                  className="w-full py-2.5 bg-surface-900 text-white rounded-xl text-xs font-bold hover:bg-surface-800 disabled:opacity-40 transition-all cursor-pointer">
                  {posLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Complete Sale`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        badges={badges}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <BrandBar
          settings={settings}
          userFullName={userProfile?.full_name || 'Front Desk'}
          userRole={userProfile?.role || 'front_desk'}
          onLogout={onLogout}
          onClockInOut={handleClockInOut}
          clockedIn={!!activeTimeEntry}
          extraActions={
            <>
              {activeTimeEntry && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <Timer className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-mono font-bold text-emerald-700 tabular-nums">{clockElapsed}</span>
                </div>
              )}
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-surface-100 rounded-lg font-mono">
                <Clock className="w-3.5 h-3.5 text-surface-400" />
                <span className="text-xs font-semibold text-surface-600">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                <span className="text-[9px] text-surface-400">|</span>
                <span className="text-[9px] text-surface-400">{clock.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              </div>
              <button onClick={() => setShowPos(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-900 text-white rounded-lg text-[10px] font-bold hover:bg-surface-800 transition-all cursor-pointer">
                <ShoppingCart className="w-3 h-3" />
                <span>POS Register</span>
              </button>
              <button onClick={() => setSearchOpen(true)} className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-50 border border-surface-200 rounded-lg text-[10px] text-surface-400 hover:text-surface-600 transition-all cursor-pointer">
                <Search className="w-3 h-3" />
                <span>Search</span>
                <kbd className="px-1 py-0.5 bg-surface-200 rounded text-[8px] font-mono text-surface-500">⌘K</kbd>
              </button>
              <NotificationBell
                notifications={notifications}
                onMarkRead={markNotifRead}
                onMarkAllRead={markAllNotifRead}
                onClear={clearNotif}
                onClearAll={clearAllNotif}
              />
              <button onClick={() => { setActionLoading('refresh'); loadAll().finally(() => setActionLoading(null)); }} className="p-2 text-surface-400 hover:text-surface-800 hover:bg-surface-50 rounded-lg transition-all cursor-pointer" title="Refresh">
                <RefreshCw className={`w-4 h-4 ${actionLoading === 'refresh' ? 'animate-spin' : ''}`} />
              </button>
            </>
          }
        />

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 lg:px-6 py-4">
            {/* Dashboard Stats */}
            <StatCards
              counts={statCounts}
              expectedToday={expectedToday.length}
              dailyRevenue={dailyRevenue}
              activeFilter={statusFilter}
              onFilterChange={setStatusFilter}
              currencySymbol={settings.currencySymbol}
            />

            {/* Expected Today */}
            {expectedToday.length > 0 && activeTab === 'rooms' && (
              <div className="mt-4 bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-surface-200 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center"><Calendar className="w-3.5 h-3.5 text-amber-600" /></div>
                  <h3 className="text-xs font-bold text-surface-900">Expected Today</h3>
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold">{expectedToday.length} arrival{expectedToday.length > 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-surface-50">
                  {expectedToday.map((b) => (
                    <div key={b.id} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-50 transition-colors">
                      <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-brand-700">{(b as any).customers?.full_name?.charAt(0) || '?'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-surface-900">{(b as any).customers?.full_name || 'Guest'}</p>
                        <p className="text-xs text-surface-500">Suite #{((b as any).rooms as Room)?.room_number || '?'} · {b.check_in_time || '—'}</p>
                      </div>
                      <button
                        onClick={() => {
                          const room = rooms.find((r) => r.id === b.room_id);
                          if (room) { setCheckInDialog({ room, booking: b }); }
                        }}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 whitespace-nowrap"
                      >
                        Check In
                      </button>
                      <button
                        onClick={() => setCancelDialog({ booking: b, guestName: (b as any).customers?.full_name || 'Guest', roomNumber: ((b as any).rooms as Room)?.room_number || '?' })}
                        className="px-2.5 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold cursor-pointer transition-all active:scale-95 whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===== ROOMS TAB ===== */}
            <AnimatePresence>{activeTab === 'rooms' && (
              <motion.div key="rooms" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }} className="mt-4 flex gap-5">
                <div className={`flex-1 min-w-0 ${selectedRoom ? 'lg:w-3/5 xl:w-2/3' : ''}`}>
                  <div className="mb-3 rounded-2xl border border-surface-200 bg-white/90 backdrop-blur-sm px-4 py-2.5 flex items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-brand-50 flex items-center justify-center"><Building className="w-3 h-3 text-brand-600" /></div>
                      <h2 className="text-xs font-bold text-surface-900">Rooms</h2>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <button id="new-checkin-btn" onClick={() => setSearchOpen(true)} className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1">
                        <UserPlus className="w-3 h-3" /><span>Check In</span>
                      </button>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold">{statCounts.available} free</span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold">{statCounts.booked} occupied</span>
                      {overstayedRoomIds.size > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold">{overstayedRoomIds.size} overstayed</span>}
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold">{statCounts.reserved} reserved</span>
                      <span className="px-2 py-0.5 rounded-full bg-surface-100 text-surface-500 font-bold">{rooms.length} total</span>
                    </div>
                  </div>

                  {/* Active Guests */}
                  {activeGuests.size > 0 && (
                    <div className="mb-4 bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                      <button
                        onClick={() => setShowActiveGuests((p) => !p)}
                        className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-blue-50 to-sky-50 border-b border-surface-200"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                          <h3 className="text-xs font-bold text-surface-900">
                            Active Guests — {activeGuests.size} checked in
                          </h3>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-surface-400 transition-transform ${showActiveGuests ? 'rotate-180' : ''}`} />
                      </button>
                      {showActiveGuests && (
                        <div className="divide-y divide-surface-100">
                          {rooms
                            .filter((r) => activeGuests.has(r.id))
                            .sort((a, b) => Number(a.room_number) - Number(b.room_number))
                            .map((r) => (
                              <div key={r.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-surface-50/50 transition-colors cursor-pointer" onClick={() => handleSelectRoom(r)}>
                                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs font-bold text-blue-700">#{r.room_number}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-surface-900 truncate flex items-center gap-1.5">
                                    {activeGuests.get(r.id)}
                                    {overstayedRoomIds.has(r.id) && <span className="text-[8px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-200 animate-pulse">OVERSTAY</span>}
                                  </p>
                                  <p className="text-[10px] text-surface-400">Suite #{r.room_number} · {r.type}</p>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedRoom(r); setCheckOutDialog({ room: r }); }}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-all whitespace-nowrap"
                                >
                                  Check Out
                                </button>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="rounded-2xl border border-surface-200 bg-white/90 shadow-sm p-2 sm:p-3">
                    <RoomGrid
                      rooms={rooms}
                      loading={loading}
                      searchQuery={searchQuery}
                      statusFilter={statusFilter}
                      selectedRoomId={selectedRoom?.id || null}
                      actionLoading={actionLoading}
                      statCounts={statCounts}
                      activeGuests={activeGuests}
                      overstayedRoomIds={overstayedRoomIds}
                      currencySymbol={settings.currencySymbol}
                      onSearchChange={setSearchQuery}
                      onFilterChange={setStatusFilter}
                      onSelectRoom={handleSelectRoom}
                      onQuickAction={handleQuickAction}
                    />
                  </div>
                </div>

              </motion.div>
            )}</AnimatePresence>

            <AnimatePresence>
              {selectedRoom && (
                <RoomModal
                  key={selectedRoom.id + '-' + roomModalRefreshKey}
                  room={selectedRoom}
                  currencySymbol={settings.currencySymbol}
                  modalBooking={modalBooking}
                  currentAndUpcomingBookings={currentAndUpcomingBookings}
                  roomModalLogs={roomModalLogs}
                  roomModalLoading={roomModalLoading}
                  roomModalCharges={roomModalCharges}
                  roomModalPayments={roomModalPayments}
                  roomModalOrders={roomModalOrders}
                  actionLoading={actionLoading === selectedRoom?.id}
                  favoriteActions={favoriteActions}
                  nonFavoriteActions={nonFavoriteModalActions}
                  userRole={userProfile?.role}
                  onClose={closeRoomModal}
                  onAction={runRoomModalAction}
                  onToggleFavorite={toggleFavoriteAction}
                  onShowHistory={() => runRoomModalAction('view-clean-history')}
                  formatMoney={formatMoney}
                  formatDateValue={formatDateValue}
                  formatDateTimeValue={formatDateTimeValue}
                  initialSection={roomModalSection}
                  onSectionChange={setRoomModalSection}
                  onBookingInvoice={(booking) => {
                    setModalStack({ room: selectedRoom, photoIndex: roomPhotoIndex, section: roomModalSection });
                    closeRoomModal();
                    handleCreateInvoice(booking, selectedRoom);
                  }}
                />
              )}
            </AnimatePresence>

            {/* ===== ORDERS TAB ===== */}
            <AnimatePresence>{activeTab === 'orders' && <motion.div key="orders" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}><OrdersContent
              guestOrders={guestOrders}
              loading={loading}
              orderView={orderView}
              setOrderView={setOrderView}
              orderStats={orderStats}
              updateOrderStatus={updateOrderStatus}
              setOrderDetailModal={setOrderDetailModal}
              currencySymbol={settings.currencySymbol}
            /></motion.div>}</AnimatePresence>

            {/* ===== CHAT TAB ===== */}
            <AnimatePresence>{activeTab === 'chat' && <motion.div key="chat" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}><ChatContent
              chatMessages={chatMessages}
              chatConversations={chatConversations}
              selectedChatBooking={selectedChatBooking}
              setSelectedChatBooking={setSelectedChatBooking}
              chatInput={chatInput}
              setChatInput={setChatInput}
              chatSearch={chatSearch}
              setChatSearch={setChatSearch}
              sendChatMessage={sendChatMessage}
              chatEndRef={chatEndRef}
              typingUsers={typingUsers}
              onChatInputChange={handleChatInputChange}
            /></motion.div>}</AnimatePresence>

            {/* ===== REQUESTS TAB ===== */}
            <AnimatePresence>{activeTab === 'requests' && <motion.div key="requests" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}><RequestsContent
              staffCalls={staffCalls}
              stayExtensions={stayExtensions}
              loading={loading}
              updateCallStatus={updateCallStatus}
              onApproveExtension={handleApproveExtension}
              onRejectExtension={handleRejectExtension}
            /></motion.div>}</AnimatePresence>

            {/* ===== HOUSEKEEPING BOARD TAB ===== */}
            {activeTab === 'housekeeping' && (() => {
              const today = new Date().toISOString().slice(0, 10);
              const cleaningRooms = rooms.filter(r => r.status === 'cleaning');
              const maintenanceRooms = rooms.filter(r => r.status === 'maintenance');
              const checkoutsToday = activeBookingsRaw.filter(b => b.check_out_date === today && b.status === 'checked-in');
              const cleanersOnShift = Array.from(new Set(timeEntries.filter(e => !e.clock_out).map(e => (e as any).users?.full_name).filter(Boolean)));

              return (
                <div className="space-y-5 mt-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                      <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Rooms Cleaning</p>
                      <p className="text-2xl font-bold text-amber-600">{cleaningRooms.length}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                      <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Maintenance</p>
                      <p className="text-2xl font-bold text-rose-600">{maintenanceRooms.length}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                      <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Checkouts Today</p>
                      <p className="text-2xl font-bold text-blue-600">{checkoutsToday.length}</p>
                      <p className="text-[9px] text-surface-400 mt-0.5">Rooms need prep</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                      <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Staff On Shift</p>
                      <p className="text-2xl font-bold text-emerald-600">{cleanersOnShift.length}</p>
                      <p className="text-[9px] text-surface-400 mt-0.5 truncate">{cleanersOnShift.slice(0, 2).join(', ') || 'None clocked in'}</p>
                    </div>
                  </div>

                  {/* Expected Departures Today */}
                  {checkoutsToday.length > 0 && (
                    <div className="bg-white rounded-2xl border border-blue-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-600" />
                        <h3 className="text-sm font-bold text-blue-900">Expected Departures Today ({checkoutsToday.length})</h3>
                      </div>
                      <div className="divide-y divide-surface-100">
                        {checkoutsToday.map(b => (
                          <div key={b.id} className="px-4 py-3 flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-blue-700 text-sm">#{(b as any).rooms?.room_number}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-surface-900">{(b as any).customers?.full_name || 'Guest'}</p>
                              <p className="text-xs text-surface-400">Check-out: {b.check_out_time || 'Anytime'}</p>
                            </div>
                            <button onClick={() => { setSelectedRoom(rooms.find(r => r.id === b.room_id) || null); setActiveTab('rooms'); }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold cursor-pointer">Open Room</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cleaning Rooms */}
                  {cleaningRooms.length > 0 && (
                    <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-600" />
                        <h3 className="text-sm font-bold text-amber-900">Currently Being Cleaned ({cleaningRooms.length})</h3>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
                        {cleaningRooms.map(r => (
                          <button key={r.id} onClick={() => { setSelectedRoom(r); setActiveTab('rooms'); }} className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-left hover:bg-amber-100 cursor-pointer transition-colors">
                            <p className="font-bold text-amber-900 text-sm">Suite #{r.room_number}</p>
                            <p className="text-[11px] text-amber-700">{r.type}</p>
                            <p className="text-[10px] text-amber-600 mt-1">Cleaning in progress</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Maintenance Rooms */}
                  {maintenanceRooms.length > 0 && (
                    <div className="bg-white rounded-2xl border border-rose-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-rose-50 border-b border-rose-100 flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-rose-600" />
                        <h3 className="text-sm font-bold text-rose-900">Under Maintenance ({maintenanceRooms.length})</h3>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
                        {maintenanceRooms.map(r => (
                          <button key={r.id} onClick={() => { setSelectedRoom(r); setActiveTab('rooms'); }} className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-left hover:bg-rose-100 cursor-pointer transition-colors">
                            <p className="font-bold text-rose-900 text-sm">Suite #{r.room_number}</p>
                            <p className="text-[11px] text-rose-700">{r.type}</p>
                            <p className="text-[10px] text-rose-600 mt-1">Out of service</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Who's On Shift */}
                  <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-surface-50 border-b border-surface-200 flex items-center gap-2">
                      <Users className="w-4 h-4 text-surface-600" />
                      <h3 className="text-sm font-bold text-surface-900">Who's On Shift Now</h3>
                    </div>
                    {timeEntries.filter(e => !e.clock_out).length === 0 ? (
                      <div className="p-8 text-center text-xs text-surface-400">No staff currently clocked in.</div>
                    ) : (
                      <div className="divide-y divide-surface-100">
                        {timeEntries.filter(e => !e.clock_out).map(e => (
                          <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-surface-900">{(e as any).users?.full_name || 'Staff'}</p>
                              <p className="text-xs text-surface-400">Clocked in: {new Date(e.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                              <span className="text-[10px] font-bold text-emerald-700">On Duty</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ===== REPORTS / NIGHT AUDIT TAB ===== */}
            {activeTab === 'reports' && (() => {
              const today = new Date().toISOString().slice(0, 10);
              const totalRooms = rooms.length || 1;
              const occupiedRooms = rooms.filter(r => r.status === 'booked').length;
              const occupancyRate = Math.round((occupiedRooms / totalRooms) * 100);
              const availableRooms = rooms.filter(r => r.status === 'available').length;
              const reservedRooms = rooms.filter(r => r.status === 'reserved').length;
              const cleaningRoomsCount = rooms.filter(r => r.status === 'cleaning').length;
              const maintenanceCount = rooms.filter(r => r.status === 'maintenance').length;
              const todayCheckIns = activeBookingsRaw.filter(b => b.check_in_date === today).length;
              const todayCheckOuts = activeBookingsRaw.filter(b => b.check_out_date === today).length;
              const totalRevenue = activeBookingsRaw.reduce((s, b) => s + Number(b.total_price || 0), 0);
              const revPAR = Math.round(totalRevenue / totalRooms);
              const pendingOrders = guestOrders.filter(o => o.status === 'pending' || o.status === 'preparing').length;
              const pendingRequests = staffCalls.filter(c => c.status === 'pending').length;
              const staffOnShift = timeEntries.filter(e => !e.clock_out).length;

              return (
                <div className="space-y-5 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-black text-surface-900">Daily Report & Night Audit</h2>
                      <p className="text-xs text-surface-400 mt-0.5">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 bg-surface-900 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-surface-800"><Printer className="w-3.5 h-3.5" /> Print Report</button>
                  </div>

                  {/* Occupancy */}
                  <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5">
                    <h3 className="text-sm font-bold text-surface-900 mb-4">Occupancy Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {[
                        { label: 'Occupancy Rate', value: `${occupancyRate}%`, color: 'text-blue-600' },
                        { label: 'Occupied', value: occupiedRooms, color: 'text-blue-600' },
                        { label: 'Available', value: availableRooms, color: 'text-emerald-600' },
                        { label: 'Reserved', value: reservedRooms, color: 'text-purple-600' },
                        { label: 'Cleaning', value: cleaningRoomsCount, color: 'text-amber-600' },
                        { label: 'Maintenance', value: maintenanceCount, color: 'text-rose-600' },
                      ].map(stat => (
                        <div key={stat.label} className="bg-surface-50 rounded-xl p-3 text-center">
                          <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">{stat.label}</p>
                          <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 h-2.5 bg-surface-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${occupancyRate}%` }} />
                    </div>
                    <p className="text-[10px] text-surface-400 mt-1">{occupancyRate}% of {totalRooms} rooms occupied</p>
                  </div>

                  {/* Revenue */}
                  <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5">
                    <h3 className="text-sm font-bold text-surface-900 mb-4">Revenue Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Total Revenue</p>
                        <p className="text-xl font-black text-emerald-700">{settings.currencySymbol}{totalRevenue.toLocaleString()}</p>
                        <p className="text-[10px] text-emerald-500 mt-0.5">Active bookings</p>
                      </div>
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">RevPAR</p>
                        <p className="text-xl font-black text-blue-700">{settings.currencySymbol}{revPAR.toLocaleString()}</p>
                        <p className="text-[10px] text-blue-500 mt-0.5">Revenue per available room</p>
                      </div>
                      <div className="bg-surface-50 border border-surface-100 rounded-xl p-4">
                        <p className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Check-Ins Today</p>
                        <p className="text-xl font-black text-surface-700">{todayCheckIns}</p>
                      </div>
                      <div className="bg-surface-50 border border-surface-100 rounded-xl p-4">
                        <p className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Check-Outs Today</p>
                        <p className="text-xl font-black text-surface-700">{todayCheckOuts}</p>
                      </div>
                    </div>
                  </div>

                  {/* Operations */}
                  <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5">
                    <h3 className="text-sm font-bold text-surface-900 mb-4">Operations Status</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-surface-50 rounded-xl p-4"><p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Active Orders</p><p className="text-xl font-black text-amber-600">{pendingOrders}</p><p className="text-[10px] text-surface-400">Pending/Preparing</p></div>
                      <div className="bg-surface-50 rounded-xl p-4"><p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Staff Requests</p><p className="text-xl font-black text-rose-600">{pendingRequests}</p><p className="text-[10px] text-surface-400">Awaiting response</p></div>
                      <div className="bg-surface-50 rounded-xl p-4"><p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Staff On Shift</p><p className="text-xl font-black text-emerald-600">{staffOnShift}</p><p className="text-[10px] text-surface-400">Currently clocked in</p></div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ===== ATTENDANCE TAB ===== */}
            {activeTab === 'attendance' && (() => {
              // Filter time entries
              const filteredEntries = timeEntries.filter((entry) => {
                return isDateInPreset(entry.clock_in, timeFilterPreset, timeFilterStartDate, timeFilterEndDate);
              });

              // Unique days
              const uniqueDays = new Set(
                filteredEntries
                  .filter((e) => e.clock_out)
                  .map((e) => new Date(e.clock_in).toDateString())
              ).size;

              // Sum of hours
              const totalHoursSum = filteredEntries
                .filter((e) => e.clock_out)
                .reduce((sum, e) => sum + (e.total_hours ? Number(e.total_hours) : 0), 0);

              // Counts
              let lates = 0;
              let holidaysWorked = 0;

              filteredEntries.forEach((entry) => {
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

              const todayHoliday = detectHoliday(new Date(), holidays);

              return (
                <div className="space-y-6 mt-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-surface-200 shadow-sm">
                    <div>
                      <h2 className="text-lg font-bold text-surface-900 tracking-tight">Front Desk Attendance</h2>
                      <p className="text-xs text-surface-500 mt-0.5">Clock in, clock out, and view your personal timesheet records.</p>
                    </div>

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

                  {/* Metrics */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Total Days Worked</p>
                      <p className="text-2xl font-bold text-surface-900">{uniqueDays}</p>
                      <p className="text-[9px] text-surface-400 mt-0.5">Unique work days logged</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Total Hours Worked</p>
                      <p className="text-2xl font-bold text-emerald-600 font-mono">{totalHoursSum.toFixed(1)}h</p>
                      <p className="text-[9px] text-surface-400 mt-0.5">Cumulative workhours</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Late Count</p>
                      <p className="text-2xl font-bold text-amber-500">{lates}</p>
                      <p className="text-[9px] text-surface-400 mt-0.5">Arrival after {shiftStartTime}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1">Holiday Shifts</p>
                      <p className="text-2xl font-bold text-indigo-600">{holidaysWorked}</p>
                      <p className="text-[9px] text-surface-400 mt-0.5">Completed holiday logs</p>
                    </div>
                  </div>

                  {activeTimeEntry && (
                    <div className="bg-gradient-to-br from-emerald-500/5 to-emerald-550/10 border border-emerald-500/20 rounded-2xl p-6 text-center space-y-4 shadow-sm">
                      <div>
                        <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">Current Active Shift</p>
                        <p className="text-xs text-surface-500 mb-3">Check-in at: <span className="font-mono font-semibold">{new Date(activeTimeEntry.clock_in).toLocaleString()}</span></p>

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
                              id="fd-meal-break-taken"
                              checked={mealBreakTaken}
                              onChange={(e) => setMealBreakTaken(e.target.checked)}
                              className="w-4 h-4 rounded text-emerald-600 border-surface-300 focus:ring-emerald-500 cursor-pointer"
                            />
                            <label htmlFor="fd-meal-break-taken" className="text-xs font-bold text-surface-700 cursor-pointer select-none">
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
                              ⚠️ Standard limit met! Dynamic overtime engine is active: logging +{overtimeLiveAmount.toFixed(2)} hrs overtime.
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
                          placeholder="Accomplishments, turnover tasks, notes..."
                          rows={2}
                          className="w-full text-xs p-2.5 rounded-xl border border-emerald-300 focus:ring-1 focus:ring-emerald-500 bg-white text-emerald-950 resize-none transition-all shadow-sm"
                        />
                      </div>
                    </div>
                  )}

                  {/* Filters and Ledger */}
                  <div className="bg-white border border-surface-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
                    <div className="flex flex-wrap items-center gap-1">
                      {(['all', 'today', 'week', 'month', 'custom'] as const).map((preset) => (
                        <button
                          key={preset}
                          onClick={() => setTimeFilterPreset(preset)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors capitalize ${
                            timeFilterPreset === preset ? 'bg-surface-900 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'
                          }`}
                        >
                          {preset === 'all' ? 'All Logs' : preset}
                        </button>
                      ))}
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
                        <table className="w-full text-left text-xs bg-white">
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
                          <tbody className="divide-y divide-surface-100 text-surface-700">
                            {filteredEntries.map((entry) => {
                              const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                              const entryDate = new Date(entry.clock_in);
                              const dayOfWeek = days[entryDate.getDay()];
                              const formattedDate = entryDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

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
                                const hr = entryDate.getHours();
                                const min = entryDate.getMinutes();
                                const [sh, sm] = shiftStartTime.split(':').map(Number);
                                if (hr > sh || (hr === sh && min > sm)) {
                                  status = 'Late';
                                }
                              }

                              return (
                                <tr key={entry.id} className="hover:bg-surface-50/50">
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

                  {/* ===== MY ACCOMPLISHMENTS LEDGER ===== */}
                  <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden mt-6">
                    <div className="px-5 py-4 border-b border-surface-200 bg-surface-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-brand-500 animate-pulse" />
                          <span>My Personal Accomplishments Record</span>
                        </h3>
                        <p className="text-[10px] text-surface-400 mt-0.5">Verified list of checked bookings, completed transactions, and chat support actions linked to your shifts.</p>
                      </div>
                      
                      <div className="flex items-center gap-1.5 self-start">
                        <span className="text-[10px] font-bold text-surface-500 bg-surface-100 px-2.5 py-1 rounded-lg">
                          Total Logged: {myAccomplishments.filter((a) => isDateInPreset(a.created_at, timeFilterPreset, timeFilterStartDate, timeFilterEndDate)).length} tasks
                        </span>
                      </div>
                    </div>

                    {(() => {
                      const filteredAcc = myAccomplishments.filter((acc) => {
                        return isDateInPreset(acc.created_at, timeFilterPreset, timeFilterStartDate, timeFilterEndDate);
                      });

                      const checkInsCount = filteredAcc.filter(a => a.action === 'Check In').length;
                      const checkOutsCount = filteredAcc.filter(a => a.action === 'Check Out').length;
                      const chatRepliesCount = filteredAcc.filter(a => a.action === 'Chat Reply').length;
                      const orderUpdatesCount = filteredAcc.filter(a => a.action === 'Order Update' || a.action === 'Order Processed').length;
                      const serviceRequestsCount = filteredAcc.filter(a => a.action === 'Service Request Update').length;
                      const cancellationsCount = filteredAcc.filter(a => a.action === 'Cancelled').length;

                      return (
                        <div className="p-5 space-y-5 text-xs">
                          {/* Inner Stats Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 text-center">
                              <p className="text-[9px] font-bold text-emerald-800 uppercase tracking-widest">Check-Ins</p>
                              <p className="text-xl font-extrabold text-emerald-700 mt-0.5">{checkInsCount}</p>
                            </div>
                            <div className="bg-sky-50/50 border border-sky-100 rounded-xl p-3 text-center">
                              <p className="text-[9px] font-bold text-sky-800 uppercase tracking-widest">Check-Outs</p>
                              <p className="text-xl font-extrabold text-sky-700 mt-0.5">{checkOutsCount}</p>
                            </div>
                            <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-3 text-center">
                              <p className="text-[9px] font-bold text-purple-800 uppercase tracking-widest">Chat Support</p>
                              <p className="text-xl font-extrabold text-purple-700 mt-0.5">{chatRepliesCount}</p>
                            </div>
                            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 text-center">
                              <p className="text-[9px] font-bold text-amber-800 uppercase tracking-widest">Orders Processed</p>
                              <p className="text-xl font-extrabold text-amber-700 mt-0.5">{orderUpdatesCount}</p>
                            </div>
                            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-center">
                              <p className="text-[9px] font-bold text-indigo-800 uppercase tracking-widest">Service Tasks</p>
                              <p className="text-xl font-extrabold text-indigo-700 mt-0.5">{serviceRequestsCount}</p>
                            </div>
                            <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-3 text-center">
                              <p className="text-[9px] font-bold text-rose-800 uppercase tracking-widest">Cancellations</p>
                              <p className="text-xl font-extrabold text-rose-700 mt-0.5">{cancellationsCount}</p>
                            </div>
                          </div>

                          {/* Action Items List */}
                          {filteredAcc.length === 0 ? (
                            <div className="py-10 text-center text-surface-400 font-medium">
                              <Sparkles className="w-6 h-6 text-surface-300 mx-auto mb-2" />
                              <span>No actions logged for your account in this date range. Your accomplishments will populate here as you book and check out guests, manage chats, and update order statuses!</span>
                            </div>
                          ) : (
                            <div className="divide-y divide-surface-100 max-h-96 overflow-y-auto border border-surface-200 rounded-xl">
                              {filteredAcc.map((accItem) => {
                                let actionColor = 'bg-surface-100 text-surface-700 border-surface-200';
                                if (accItem.action === 'Check In') actionColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                else if (accItem.action === 'Check Out') actionColor = 'bg-sky-50 text-sky-700 border-sky-200';
                                else if (accItem.action === 'Chat Reply' || accItem.action === 'Chat Response') actionColor = 'bg-purple-50 text-purple-700 border-purple-200';
                                else if (accItem.action === 'Order Update') actionColor = 'bg-amber-50 text-amber-700 border-amber-200';
                                else if (accItem.action === 'Service Request Update') actionColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                                else if (accItem.action === 'Cancelled') actionColor = 'bg-rose-50 text-rose-700 border-rose-200';
                                else if (accItem.action === 'Clock In' || accItem.action === 'Clock Out') actionColor = 'bg-slate-50 text-slate-700 border-slate-200';

                                return (
                                  <div key={accItem.id} className="p-3.5 hover:bg-surface-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 transition-colors">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`px-2 py-0.5 text-[9px] tracking-wider font-extrabold uppercase rounded-md border ${actionColor}`}>
                                          {accItem.action}
                                        </span>
                                        <span className="font-semibold text-surface-900 leading-none">
                                          {accItem.details}
                                        </span>
                                      </div>
                                    </div>
                                    <span className="text-[10px] text-surface-400 font-mono self-start sm:self-center">
                                      {new Date(accItem.created_at).toLocaleString()}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Search Command */}
      {searchOpen && (
        <SearchCommand
          rooms={rooms}
          currencySymbol={settings.currencySymbol}
          onSelectRoom={(room) => { setSelectedRoom(room); setSearchOpen(false); }}
          onOpenCheckIn={(room) => { setSelectedRoom(room); setCheckInDialog({ room }); setSearchOpen(false); }}
        />
      )}

      {/* Add Charges Dialog */}
      {chargesDialog && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-elevated max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {modalStack && (
                <button onClick={goBackFromDialog} className="p-1.5 hover:bg-surface-100 rounded-lg cursor-pointer flex items-center gap-1 text-xs text-surface-600 font-medium flex-shrink-0"><ChevronLeft className="w-4 h-4" /> Back</button>
              )}
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0"><Receipt className="w-5 h-5 text-amber-600" /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-surface-900 truncate">Add Charges — Suite #{chargesDialog.room.room_number}</h2>
                <p className="text-[10px] text-surface-400 truncate">{(chargesDialog.booking as any).customers?.full_name || 'Guest'}</p>
              </div>
              <button onClick={() => { setModalStack(null); setChargesDialog(null); setChargeDescription(''); setChargeAmount(0); }} className="p-1.5 hover:bg-surface-100 rounded-lg cursor-pointer flex-shrink-0"><X className="w-4 h-4 text-surface-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-surface-500 mb-1">Description</label>
                <input type="text" value={chargeDescription} onChange={(e) => setChargeDescription(e.target.value)}
                  placeholder="e.g. Late checkout fee, mini bar, damages"
                  className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900 transition-colors" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-500 mb-1">Amount ({settings.currencySymbol})</label>
                <input type="number" min={0} step={0.01} value={chargeAmount || ''} onChange={(e) => setChargeAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900 transition-colors" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setModalStack(null); setChargesDialog(null); setChargeDescription(''); setChargeAmount(0); }} className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-xl text-xs font-semibold cursor-pointer hover:bg-surface-50 transition-all">Cancel</button>
              <button onClick={handleAddCharge} disabled={!chargeDescription.trim() || chargeAmount <= 0 || actionLoading === 'charge'} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40 transition-all flex items-center justify-center gap-1.5">
                {actionLoading === 'charge' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding...</> : <><Receipt className="w-3.5 h-3.5" /> Add Charge</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Dialog */}
      {paymentDialog && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-elevated max-w-lg w-full p-6 space-y-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {modalStack && (
                <button onClick={goBackFromDialog} className="p-1.5 hover:bg-surface-100 rounded-lg cursor-pointer flex items-center gap-1 text-xs text-surface-600 font-medium flex-shrink-0"><ChevronLeft className="w-4 h-4" /> Back</button>
              )}
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0"><CreditCard className="w-5 h-5 text-emerald-600" /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-surface-900 truncate">Record Payment — Suite #{paymentDialog.room.room_number}</h2>
                <p className="text-[10px] text-surface-400 truncate">{(paymentDialog.booking as any).customers?.full_name || 'Guest'}</p>
              </div>
              <button onClick={() => { setModalStack(null); setPaymentDialog(null); setPaymentAmount(0); setPaymentMethod(''); setPaymentReference(''); }} className="p-1.5 hover:bg-surface-100 rounded-lg cursor-pointer flex-shrink-0"><X className="w-4 h-4 text-surface-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-surface-500 mb-1">Amount ({settings.currencySymbol})</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} step={0.01} value={paymentAmount || ''} onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                      placeholder="0.00" autoFocus
                      className="flex-1 px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900 transition-colors" />
                    {paymentDialog.outstanding && paymentDialog.outstanding > 0 && (
                      <button onClick={() => setPaymentAmount(paymentDialog.outstanding!)}
                        className="px-3 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-[10px] font-bold cursor-pointer transition-all border border-blue-100 whitespace-nowrap">
                        Pay in Full
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-500 mb-1">Payment Method</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900 transition-colors">
                    <option value="">Select method</option>
                    {(settings.paymentOptions || ['Cash', 'Credit Card', 'Debit Card', 'GCash', 'Bank Transfer']).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-500 mb-1">Reference <span className="text-surface-300 font-normal">(optional)</span></label>
                  <input type="text" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. OR #12345"
                    className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900 transition-colors" />
                </div>
              </div>

              {/* Invoice Preview */}
              <div className="bg-blue-50 rounded-xl p-4 space-y-2" id="payment-invoice-preview">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Invoice Preview</h4>
                  <button onClick={() => window.print()} className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[9px] font-bold cursor-pointer transition-all flex items-center gap-1">
                    <Printer className="w-2.5 h-2.5" /> Print
                  </button>
                </div>
                <div className="text-xs space-y-1 bg-white rounded-lg p-3">
                  <div className="flex justify-between"><span className="text-surface-500">Room Charge</span><span className="font-semibold text-surface-900">{settings.currencySymbol}{Number(paymentDialog.booking.total_price).toLocaleString()}</span></div>
                  {(roomModalCharges || []).length > 0 && (roomModalCharges || []).map((c: any) => (
                    <div key={c.id} className="flex justify-between"><span className="text-surface-500">{c.description}</span><span className="font-semibold text-surface-900">{settings.currencySymbol}{Number(c.amount).toLocaleString()}</span></div>
                  ))}
                  {(roomModalPayments || []).length > 0 && (roomModalPayments || []).map((p: any) => (
                    <div key={p.id} className="flex justify-between"><span className="text-surface-500">Paid via {p.method}{p.reference ? ` (${p.reference})` : ''}</span><span className="font-semibold text-emerald-600">{settings.currencySymbol}{Number(p.amount).toLocaleString()}</span></div>
                  ))}
                  <div className="border-t border-surface-200 pt-2 flex justify-between text-sm">
                    <span className="font-bold text-surface-700">Balance Due</span>
                    <span className="font-bold text-surface-900">{settings.currencySymbol}{Math.max(0, Number(paymentDialog.booking.total_price) + (roomModalCharges || []).reduce((s: number, c: any) => s + Number(c.amount), 0) - (roomModalPayments || []).reduce((s: number, p: any) => s + Number(p.amount), 0) - Number(paymentDialog.booking.discount_amount || 0)).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setModalStack(null); setPaymentDialog(null); setPaymentAmount(0); setPaymentMethod(''); setPaymentReference(''); }} className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-xl text-xs font-semibold cursor-pointer hover:bg-surface-50 transition-all">Cancel</button>
              <button onClick={handleRecordPayment} disabled={paymentAmount <= 0 || !paymentMethod || actionLoading === 'payment'} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40 transition-all flex items-center justify-center gap-1.5">
                {actionLoading === 'payment' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Recording...</> : <><CreditCard className="w-3.5 h-3.5" /> Record Payment</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Dialog */}
      {invoiceDialog && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-elevated max-w-md w-full p-6 space-y-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {modalStack && (
                <button onClick={goBackFromDialog} className="p-1.5 hover:bg-surface-100 rounded-lg cursor-pointer flex items-center gap-1 text-xs text-surface-600 font-medium flex-shrink-0"><ChevronLeft className="w-4 h-4" /> Back</button>
              )}
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0"><FileText className="w-5 h-5 text-blue-600" /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-surface-900 truncate">Invoice — Suite #{invoiceDialog.room.room_number}</h2>
                <p className="text-[10px] text-surface-400 truncate">{(invoiceDialog.booking as any).customers?.full_name || 'Guest'}</p>
              </div>
              <button onClick={() => { setModalStack(null); setInvoiceDialog(null); }} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer flex-shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-4">
              {/* Booking Info */}
              <div className="bg-surface-50 rounded-xl p-3 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-surface-500">Check In</span><span className="font-semibold text-surface-900">{invoiceDialog.booking.check_in_date} {invoiceDialog.booking.check_in_time}</span></div>
                <div className="flex justify-between text-xs"><span className="text-surface-500">Check Out</span><span className="font-semibold text-surface-900">{invoiceDialog.booking.check_out_date} {invoiceDialog.booking.check_out_time}</span></div>
                <div className="flex justify-between text-xs"><span className="text-surface-500">Status</span><span className="font-semibold text-surface-900 capitalize">{invoiceDialog.booking.status}</span></div>
              </div>

              {/* Room Charge */}
              <div>
                <h4 className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Room Charges</h4>
                <div className="bg-surface-50 rounded-xl p-3">
                  <div className="flex justify-between text-sm"><span className="text-surface-600">Base rate</span><span className="font-semibold text-surface-900">{settings.currencySymbol}{Number(invoiceDialog.booking.total_price).toLocaleString()}</span></div>
                </div>
              </div>

              {/* Additional Charges */}
              {invoiceDialog.charges.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Additional Charges</h4>
                  <div className="bg-surface-50 rounded-xl divide-y divide-surface-200">
                    {invoiceDialog.charges.map((c: any, i: number) => (
                      <div key={i} className="p-3 flex justify-between items-center">
                        <span className="text-xs text-surface-700">{c.description}</span>
                        <span className="text-xs font-semibold text-surface-900">{settings.currencySymbol}{Number(c.amount).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payments */}
              {invoiceDialog.payments.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Payments</h4>
                  <div className="bg-surface-50 rounded-xl divide-y divide-surface-200">
                    {invoiceDialog.payments.map((p: any, i: number) => (
                      <div key={i} className="p-3 flex justify-between items-center">
                        <div><span className="text-xs text-surface-700">{p.method}</span>{p.reference ? <span className="text-[10px] text-surface-400 ml-2">({p.reference})</span> : null}</div>
                        <span className="text-xs font-semibold text-emerald-700">+{settings.currencySymbol}{Number(p.amount).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="bg-brand-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-surface-600">Room Charges</span><span className="font-semibold text-surface-900">{settings.currencySymbol}{Number(invoiceDialog.booking.total_price).toLocaleString()}</span></div>
                {(() => {
                  const extraTotal = invoiceDialog.charges.reduce((s: number, c: any) => s + Number(c.amount), 0);
                  if (extraTotal > 0) return (
                    <div className="flex justify-between text-sm"><span className="text-surface-600">Additional Charges</span><span className="font-semibold text-surface-900">{settings.currencySymbol}{extraTotal.toLocaleString()}</span></div>
                  );
                  return null;
                })()}
                {(() => {
                  const discountAmount = Number((invoiceDialog.booking as any).discount_amount || 0);
                  if (discountAmount > 0) return (
                    <div className="flex justify-between text-sm">
                      <div>
                        <span className="text-surface-600">Discount</span>
                        {(invoiceDialog.booking as any).discount_description && <span className="text-[8px] text-surface-500 block">{(invoiceDialog.booking as any).discount_description}</span>}
                        {invoiceDialog.promoCode && <span className="text-[8px] text-blue-500 font-semibold block">{invoiceDialog.promoCode.code}{invoiceDialog.promoCode.description ? ` — ${invoiceDialog.promoCode.description}` : ''}</span>}
                      </div>
                      <span className="font-semibold text-rose-600">-{settings.currencySymbol}{discountAmount.toLocaleString()}</span>
                    </div>
                  );
                  return null;
                })()}
                {(() => {
                  const paymentTotal = invoiceDialog.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
                  if (paymentTotal > 0) return (
                    <div className="flex justify-between text-sm"><span className="text-surface-600">Total Paid</span><span className="font-semibold text-emerald-700">+{settings.currencySymbol}{paymentTotal.toLocaleString()}</span></div>
                  );
                  return null;
                })()}
                {(() => {
                  const total = Number(invoiceDialog.booking.total_price) + invoiceDialog.charges.reduce((s: number, c: any) => s + Number(c.amount), 0) - Number((invoiceDialog.booking as any).discount_amount || 0) - invoiceDialog.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
                  return (
                    <div className="border-t border-brand-200 pt-2 flex justify-between text-sm">
                      <span className="font-bold text-surface-700">Balance Due</span>
                      <span className="font-bold text-surface-900 text-base">{settings.currencySymbol}{Math.max(0, total).toLocaleString()}</span>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setInvoiceDialog(null)} className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-xl text-xs font-semibold cursor-pointer hover:bg-surface-50 transition-all">Close</button>
              <button onClick={() => { window.print(); }} className="flex-1 py-2.5 bg-surface-900 hover:bg-surface-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5">
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Check In Wizard */}
      {checkInDialog && (
        <CheckInWizard
          room={checkInDialog.room}
          mode={checkInDialog.mode}
          booking={checkInDialog.booking}
          currencySymbol={settings.currencySymbol}
          onClose={() => { setModalStack(null); setCheckInDialog(null); }}
          onBack={modalStack ? goBackFromDialog : undefined}
          onComplete={loadAll}
          showError={showError}
          showSuccess={showSuccess}
          userProfileId={userProfile?.id || ''}
          logActivity={logActivity}
          ratePlans={ratePlans}
          promoCodes={promoCodes}
        />
      )}

      {/* Check Out Flow */}
      {checkOutDialog && (
        <CheckOutFlow
          room={checkOutDialog.room}
          currencySymbol={settings.currencySymbol}
          onClose={() => { setModalStack(null); setCheckOutDialog(null); }}
          onBack={modalStack ? goBackFromDialog : undefined}
          onComplete={loadAll}
          showError={showError}
          showSuccess={showSuccess}
          logActivity={logActivity}
          paymentOptions={settings.paymentOptions}
        />
      )}

      {/* Housekeeping Assignment Dialog */}
      {housekeepingDialog && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-elevated max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {modalStack && (
                <button onClick={goBackFromDialog} className="p-1.5 hover:bg-surface-100 rounded-lg cursor-pointer flex items-center gap-1 text-xs text-surface-600 font-medium flex-shrink-0"><ChevronLeft className="w-4 h-4" /> Back</button>
              )}
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0"><Users className="w-5 h-5 text-blue-600" /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-surface-900 truncate">Assign Housekeeping — Suite #{housekeepingDialog.room.room_number}</h2>
                <p className="text-[10px] text-surface-400 truncate">Select a cleaner to assign</p>
              </div>
              <button onClick={() => { setModalStack(null); setHousekeepingDialog(null); }} className="p-1.5 hover:bg-surface-100 rounded-lg cursor-pointer flex-shrink-0"><X className="w-4 h-4 text-surface-400" /></button>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {(() => {
                const activeTask = roomModalTasks.find((t: any) => (t.status === 'pending' || t.status === 'in-progress') && t.title?.includes(`Suite #${housekeepingDialog.room.room_number}`));
                if (activeTask) {
                  return (
                    <div className="bg-amber-50 rounded-xl p-4 text-center">
                      <p className="text-xs font-semibold text-amber-800">Already assigned</p>
                      <p className="text-[10px] text-amber-600 mt-0.5">{activeTask.users?.full_name || 'A cleaner'} is currently assigned ({(activeTask as any).status})</p>
                    </div>
                  );
                }
                return null;
              })()}
              {cleaners.length === 0 ? (
                <div className="text-center py-8 text-xs text-surface-400">No cleaners available.</div>
              ) : (
                cleaners.map((c) => (
                  <button key={c.id} onClick={async () => {
                    const { data: existingTasks } = await supabase.from('tasks').select('id, status').ilike('title', `%Suite #${housekeepingDialog.room.room_number}%`).in('status', ['pending', 'in-progress']);
                    if (existingTasks && existingTasks.length > 0) {
                      showError('Already Assigned', `A cleaner is already assigned for Suite #${housekeepingDialog.room.room_number}.`);
                      return;
                    }
                    const { error } = await supabase.from('tasks').insert({
                      title: `Clean Suite #${housekeepingDialog.room.room_number}`,
                      description: `Housekeeping assigned for room ${housekeepingDialog.room.type} — Suite #${housekeepingDialog.room.room_number}`,
                      assigned_employee_id: c.id,
                      booking_id: housekeepingDialog.booking?.id || null,
                      status: 'pending',
                      priority: 'high',
                    });
                    if (error) { showError('Assignment Failed', error.message); return; }
                    const { error: roomErr } = await supabase.from('rooms').update({ status: 'cleaning' }).eq('id', housekeepingDialog.room.id);
                    if (roomErr) // console.error('Room status update failed:', roomErr);
                    await logActivity('Housekeeping Assigned', `Suite #${housekeepingDialog.room.room_number} assigned to ${c.full_name} for cleaning`);
                    setModalStack(null); setHousekeepingDialog(null);
                    showSuccess(`Cleaner assigned: ${c.full_name}`);
                    loadAll();
                  }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-50 transition-all border border-transparent hover:border-surface-200 cursor-pointer text-left">
                    <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0">{c.full_name.charAt(0).toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-surface-900 truncate">{c.full_name}</p>
                      <p className="text-[10px] text-surface-400 capitalize">{c.role}</p>
                    </div>
                    <Users className="w-4 h-4 text-surface-300 flex-shrink-0" />
                  </button>
                ))
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setModalStack(null); setHousekeepingDialog(null); }} className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-xl text-xs font-semibold cursor-pointer hover:bg-surface-50 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Bookings Modal */}
      {bookingsModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-elevated max-w-lg w-full p-6 space-y-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {modalStack && (
                <button onClick={goBackFromDialog} className="p-1.5 hover:bg-surface-100 rounded-lg cursor-pointer flex items-center gap-1 text-xs text-surface-600 font-medium flex-shrink-0"><ChevronLeft className="w-4 h-4" /> Back</button>
              )}
              <div className="w-10 h-10 bg-surface-100 rounded-xl flex items-center justify-center flex-shrink-0"><Calendar className="w-5 h-5 text-surface-600" /></div>
              <div className="flex-1 min-w-0"><h2 className="text-sm font-bold text-surface-900 truncate">Suite #{bookingsModal.room.room_number} — Bookings</h2><p className="text-[10px] text-surface-400 truncate">{bookingsModal.room.type} · {bookingsModal.bookings.length} total</p></div>
              <button onClick={() => { setModalStack(null); setBookingsModal(null); }} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer flex-shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto space-y-2 flex-1">
              {bookingsModal.bookings.length === 0 ? (
                <p className="text-xs text-surface-400 text-center py-8">No booking records for this room.</p>
              ) : (
                bookingsModal.bookings.map((b) => {
                  const statusCfg: Record<string, string> = { pending: 'bg-amber-50 text-amber-700', confirmed: 'bg-sky-50 text-sky-700', 'checked-in': 'bg-emerald-50 text-emerald-700', completed: 'bg-surface-100 text-surface-500', cancelled: 'bg-rose-50 text-rose-700' };
                  return (
                    <div key={b.id} className="bg-surface-50 rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${statusCfg[b.status] || 'bg-surface-100 text-surface-500'}`}>{b.status}</span>
                        <span className="text-[10px] text-surface-400 font-mono">#{b.id.slice(0, 8)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <span className="text-surface-500">Check In</span><span className="font-semibold text-surface-900 text-right">{b.check_in_date} {b.check_in_time}</span>
                        <span className="text-surface-500">Check Out</span><span className="font-semibold text-surface-900 text-right">{b.check_out_date} {b.check_out_time}</span>
                        <span className="text-surface-500">Guest</span><span className="font-semibold text-surface-900 text-right">{(b as any).customers?.full_name || '—'}</span>
                        <span className="text-surface-500">Price</span><span className="font-semibold text-surface-900 text-right">{settings.currencySymbol}{Number(b.total_price).toLocaleString()}</span>
                      </div>
                      {['pending', 'confirmed', 'checked-in'].includes(b.status) ? (
                        <div className="flex justify-end pt-1.5 border-t border-surface-200 mt-1">
                          <button
                            onClick={() => {
                              setCancelDialog({
                                booking: b,
                                guestName: (b as any).customers?.full_name || 'Guest',
                                roomNumber: bookingsModal.room.room_number || '?'
                              });
                              setBookingsModal(null);
                            }}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-[10px] font-bold cursor-pointer transition-all border border-rose-100 flex items-center gap-1"
                          >
                            Cancel Booking
                          </button>
                        </div>
                      ) : b.status === 'completed' ? (
                        <div className="flex justify-end pt-1.5 border-t border-surface-200 mt-1">
                          <button
                            onClick={() => {
                              setBookingsModal(null);
                              handleCreateInvoice(b, bookingsModal.room);
                            }}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-[10px] font-bold cursor-pointer transition-all border border-blue-100 flex items-center gap-1"
                          >
                            View Invoice
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[120] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-elevated max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-surface-900">{confirmDialog.title}</h2>
            <p className="text-xs text-surface-500">{confirmDialog.message}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-50 transition-all">Cancel</button>
              <button onClick={confirmDialog.action} className="flex-1 py-2.5 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-all">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {orderDetailModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-elevated max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-surface-900">Order Details</h2><button onClick={() => setOrderDetailModal(null)} className="p-1 text-surface-400 hover:text-surface-600"><X className="w-4 h-4" /></button></div>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between"><span className="text-surface-500">Item</span><span className="font-semibold">{orderDetailModal.inventory_items?.name || 'Unknown'}</span></div>
              <div className="flex justify-between"><span className="text-surface-500">Quantity</span><span className="font-semibold">x{orderDetailModal.quantity}</span></div>
              <div className="flex justify-between"><span className="text-surface-500">Total</span><span className="font-semibold">{settings.currencySymbol}{Number(orderDetailModal.total_price).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-surface-500">Status</span><span className="font-semibold capitalize">{orderDetailModal.status}</span></div>
              <div className="flex justify-between"><span className="text-surface-500">Ordered at</span><span className="font-semibold">{new Date(orderDetailModal.created_at).toLocaleString()}</span></div>
              {orderDetailModal.notes && <div className="flex justify-between"><span className="text-surface-500">Notes</span><span className="font-semibold italic">"{orderDetailModal.notes}"</span></div>}
              <div className="flex justify-between"><span className="text-surface-500">Guest</span><span className="font-semibold">{(orderDetailModal.bookings as any)?.customers?.full_name || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-surface-500">Room</span><span className="font-semibold">Suite #{(orderDetailModal.bookings as any)?.rooms?.room_number || 'N/A'}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Booking Dialog */}
      {editBookingDialog && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-elevated max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {modalStack && (
                <button onClick={goBackFromDialog} className="p-1.5 hover:bg-surface-100 rounded-lg cursor-pointer flex items-center gap-1 text-xs text-surface-600 font-medium flex-shrink-0"><ChevronLeft className="w-4 h-4" /> Back</button>
              )}
              <div className="w-10 h-10 bg-surface-100 rounded-xl flex items-center justify-center flex-shrink-0"><Calendar className="w-5 h-5 text-surface-600" /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-surface-900 truncate">Edit Booking — Suite #{editBookingDialog.room.room_number}</h2>
                <p className="text-[10px] text-surface-400 truncate">{editGuestName || 'Guest'}</p>
              </div>
              <button onClick={() => { setModalStack(null); setEditBookingDialog(null); }} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer flex-shrink-0"><X className="w-4 h-4 text-surface-400" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-xs font-semibold text-surface-500 mb-1">Guest Name</label><input type="text" value={editGuestName} onChange={(e) => setEditGuestName(e.target.value)} className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900" /></div>
              <div><label className="block text-xs font-semibold text-surface-500 mb-1">Guest Email</label><input type="email" value={editGuestEmail} onChange={(e) => setEditGuestEmail(e.target.value)} className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-surface-500">Check In Date</label>
                  <input type="text" value={editCheckInDate} onChange={(e) => setEditCheckInDate(e.target.value)} placeholder="yyyy-mm-dd" className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-surface-500">Check In Time</label>
                  <TimePicker value={editCheckInTime} onChange={setEditCheckInTime} options={editBookingDialog?.room.check_in_times || []} placeholder="e.g. 2:00 PM" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-surface-500">Check Out Date</label>
                  <input type="text" value={editCheckOutDate} onChange={(e) => setEditCheckOutDate(e.target.value)} placeholder="yyyy-mm-dd" className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-surface-500">Check Out Time</label>
                  <TimePicker value={editCheckOutTime} onChange={setEditCheckOutTime} options={editBookingDialog?.room.check_out_times || []} placeholder="e.g. 12:00 PM" />
                </div>
              </div>
              {(editCheckInDate && editCheckOutDate && editCheckInTime && editCheckOutTime) && (
                <div className="bg-brand-50 rounded-xl p-3 flex justify-between text-xs">
                  <span className="font-semibold text-surface-500">Duration</span>
                  <span className="font-semibold text-surface-900">
                    {(() => {
                      const h = diffHours(editCheckInDate, editCheckInTime, editCheckOutDate, editCheckOutTime);
                      return `${Math.round(h * 10) / 10} hours`;
                    })()}
                  </span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-surface-500 mb-1">Recurring Booking</label>
                <select value={editRecurringRule} onChange={(e) => setEditRecurringRule(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900 cursor-pointer">
                  <option value="">No repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setModalStack(null); setEditBookingDialog(null); }} className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-xl text-xs font-semibold cursor-pointer hover:bg-surface-50 transition-all">Cancel</button>
              <button onClick={handleEditBooking} disabled={actionLoading === editBookingDialog.room.id} className="flex-1 py-2.5 bg-surface-900 hover:bg-surface-800 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40 transition-all flex items-center justify-center gap-1.5">
                {actionLoading === editBookingDialog.room.id ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <>Save Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Stay Dialog */}
      {extendStayDialog && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-elevated max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {modalStack && (
                <button onClick={goBackFromDialog} className="p-1.5 hover:bg-surface-100 rounded-lg cursor-pointer flex items-center gap-1 text-xs text-surface-600 font-medium flex-shrink-0"><ChevronLeft className="w-4 h-4" /> Back</button>
              )}
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0"><CalendarClock className="w-5 h-5 text-blue-600" /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-surface-900 truncate">Extend Stay — Suite #{extendStayDialog.room.room_number}</h2>
                <p className="text-[10px] text-surface-400 truncate">{(extendStayDialog.booking as any).customers?.full_name || 'Guest'}</p>
              </div>
              <button onClick={() => { setModalStack(null); setExtendStayDialog(null); setExtendDays(0); setExtendHours(0); setExtendMinutes(0); setExtendConflicts([]); }} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer flex-shrink-0"><X className="w-4 h-4 text-surface-400" /></button>
            </div>

            <div className="bg-surface-50 rounded-xl p-3 space-y-1">
              <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Current Check-Out</p>
              <p className="text-sm font-bold text-surface-900">{formatDateValue(extendStayDialog.booking.check_out_date)} {extendStayDialog.booking.check_out_time}</p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-surface-600">Add time to extend</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-surface-500 mb-1">Days</label>
                  <input type="number" min={0} value={extendDays} onChange={e => setExtendDays(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900 transition-colors text-center" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-surface-500 mb-1">Hours</label>
                  <input type="number" min={0} value={extendHours} onChange={e => setExtendHours(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900 transition-colors text-center" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-surface-500 mb-1">Minutes</label>
                  <input type="number" min={0} value={extendMinutes} onChange={e => setExtendMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900 transition-colors text-center" />
                </div>
              </div>

              {(() => {
                const totalMin = extendDays * 1440 + extendHours * 60 + extendMinutes;
                if (totalMin < 1) return null;
                const currentOut = new Date(dt(extendStayDialog.booking.check_out_date, extendStayDialog.booking.check_out_time));
                const newOut = new Date(currentOut.getTime() + totalMin * 60000);
                const m = `${newOut.getMonth() + 1}`.padStart(2, '0');
                const d = `${newOut.getDate()}`.padStart(2, '0');
                const y = newOut.getFullYear();
                let h = newOut.getHours();
                const ampm = h >= 12 ? 'PM' : 'AM';
                h = h % 12 || 12;
                const min = `${newOut.getMinutes()}`.padStart(2, '0');
                return (
                  <div className="bg-emerald-50 rounded-xl p-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-surface-600">New Check-Out</span>
                    <span className="text-sm font-bold text-emerald-700">{m}/{d}/{y} {h}:{min} {ampm}</span>
                  </div>
                );
              })()}

            {extendConflictLoading && (
              <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-surface-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Checking for conflicts…
              </div>
            )}
            {!extendConflictLoading && extendConflicts.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-rose-50 rounded-lg text-[10px] text-rose-600 font-semibold">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  {extendConflicts.length} overlapping booking{extendConflicts.length > 1 ? 's' : ''} found
                </div>
                <div className="max-h-20 overflow-y-auto space-y-1">
                  {extendConflicts.map((c, i) => (
                    <div key={i} className="px-2 py-1 bg-rose-50/50 rounded-lg text-[10px] text-rose-700">
                      {(c as any).customers?.full_name || 'Guest'} — {c.check_in_date} {c.check_in_time} → {c.check_out_date} {c.check_out_time}
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => { setModalStack(null); setExtendStayDialog(null); setExtendDays(0); setExtendHours(0); setExtendMinutes(0); setExtendConflicts([]); }} className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-xl text-xs font-semibold cursor-pointer hover:bg-surface-50 transition-all">Cancel</button>
              <button onClick={handleExtendStay} disabled={extendDays + extendHours + extendMinutes < 1 || actionLoading === 'extend' || extendConflicts.length > 0} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40 transition-all flex items-center justify-center gap-1.5">
                {actionLoading === 'extend' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <><CalendarClock className="w-3.5 h-3.5" /> Extend Stay</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Transfer Dialog */}
      {transferDialog && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-elevated max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {modalStack && (
                <button onClick={goBackFromDialog} className="p-1.5 hover:bg-surface-100 rounded-lg cursor-pointer flex items-center gap-1 text-xs text-surface-600 font-medium flex-shrink-0"><ChevronLeft className="w-4 h-4" /> Back</button>
              )}
              <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0"><ArrowRightLeft className="w-5 h-5 text-violet-600" /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-surface-900 truncate">Transfer Room — Suite #{transferDialog.room_number}</h2>
                <p className="text-[10px] text-surface-400 truncate">Select a destination room</p>
              </div>
              <button onClick={() => { setModalStack(null); setTransferDialog(null); setTransferTargetRoomId(null); }} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer flex-shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {rooms.filter(r => r.id !== transferDialog.id).map((r) => (
                <button
                  key={r.id}
                  onClick={() => setTransferTargetRoomId(r.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                    transferTargetRoomId === r.id
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-surface-200 hover:border-surface-300 bg-white'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    r.status === 'available' ? 'bg-emerald-50' : 'bg-surface-100'
                  }`}>
                    <Building className={`w-4 h-4 ${r.status === 'available' ? 'text-emerald-600' : 'text-surface-400'}`} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-surface-900">Suite #{r.room_number}</p>
                    <p className="text-[10px] text-surface-400">{r.type}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    r.status === 'available' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {r.status}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setTransferDialog(null); setTransferTargetRoomId(null); }} className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-xl text-xs font-semibold cursor-pointer hover:bg-surface-50 transition-all">Cancel</button>
              <button onClick={handleRoomTransfer} disabled={!transferTargetRoomId || actionLoading === 'transfer'} className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40 transition-all flex items-center justify-center gap-1.5">
                {actionLoading === 'transfer' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Transferring...</> : <>Transfer <ArrowRightLeft className="w-3.5 h-3.5" /></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Booking Dialog */}
      {cancelDialog && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-elevated max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {modalStack && (
                <button onClick={goBackFromDialog} className="p-1.5 hover:bg-surface-100 rounded-lg cursor-pointer flex items-center gap-1 text-xs text-surface-600 font-medium flex-shrink-0"><ChevronLeft className="w-4 h-4" /> Back</button>
              )}
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center flex-shrink-0"><XCircle className="w-5 h-5 text-rose-600" /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-surface-900 truncate">Cancel Reservation</h2>
                <p className="text-[10px] text-surface-400 truncate">{cancelDialog.guestName} · Suite #{cancelDialog.roomNumber}</p>
              </div>
              <button onClick={() => { setModalStack(null); setCancelDialog(null); setCancelReason(''); }} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer flex-shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-surface-500 mb-1.5">Cancellation Reason *</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Guest cancelled, no-show, double booking..."
                rows={3}
                className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-surface-900 resize-none"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setModalStack(null); setCancelDialog(null); setCancelReason(''); }} className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-xl text-xs font-semibold cursor-pointer hover:bg-surface-50 transition-all">Keep Reservation</button>
              <button onClick={handleCancelBooking} disabled={!cancelReason.trim()} className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center justify-center gap-1.5"><X className="w-3.5 h-3.5" /> Cancel Booking</button>
            </div>
          </div>
        </div>
      )}

      {/* Error dialog */}
      {errorDialog && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-elevated max-w-sm w-full p-6 space-y-4 border-t-4 border-rose-500">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-5 h-5 text-rose-600" /></div>
              <div><h2 className="text-sm font-bold text-surface-900">{errorDialog.title}</h2><p className="text-[10px] text-surface-400">Operation failed</p></div>
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-4"><p className="text-xs text-rose-800 font-mono leading-relaxed break-words">{errorDialog.message}</p></div>
            <button onClick={() => { setErrorDialog(null); loadAll(); }} className="w-full py-3 bg-surface-900 hover:bg-surface-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-all">Dismiss & Refresh</button>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Help */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/30 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white rounded-2xl border border-surface-100 shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-surface-900 mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><kbd className="px-2 py-0.5 bg-surface-100 rounded text-[10px] font-mono font-bold">Ctrl+N</kbd><span className="text-surface-500">New Check-in</span></div>
              <div className="flex justify-between"><kbd className="px-2 py-0.5 bg-surface-100 rounded text-[10px] font-mono font-bold">Ctrl+F</kbd><span className="text-surface-500">Search rooms</span></div>
              <div className="flex justify-between"><kbd className="px-2 py-0.5 bg-surface-100 rounded text-[10px] font-mono font-bold">Ctrl+R</kbd><span className="text-surface-500">Reports</span></div>
              <div className="flex justify-between"><kbd className="px-2 py-0.5 bg-surface-100 rounded text-[10px] font-mono font-bold">1 / 2 / 3</kbd><span className="text-surface-500">Switch tabs</span></div>
              <div className="flex justify-between"><kbd className="px-2 py-0.5 bg-surface-100 rounded text-[10px] font-mono font-bold">Esc</kbd><span className="text-surface-500">Close panels</span></div>
              <div className="flex justify-between"><kbd className="px-2 py-0.5 bg-surface-100 rounded text-[10px] font-mono font-bold">?</kbd><span className="text-surface-500">Toggle this help</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// ===== Sub-panel components =====

function OrdersContent({
  guestOrders, loading, orderView, setOrderView, orderStats, updateOrderStatus, setOrderDetailModal, currencySymbol,
}: {
  guestOrders: GuestOrder[]; loading: boolean; orderView: 'active' | 'history'; setOrderView: (v: 'active' | 'history') => void;
  orderStats: Record<string, number>; updateOrderStatus: (o: GuestOrder, s: string) => Promise<void>;
  setOrderDetailModal: (o: GuestOrder | null) => void; currencySymbol: string;
}) {
  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setOrderView('active')} className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${orderView === 'active' ? 'bg-surface-900 text-white shadow-sm' : 'bg-white border border-surface-200 text-surface-600 hover:bg-surface-50'}`}>
          <ShoppingCart className="w-3.5 h-3.5" /> Active {orderStats.pending + orderStats.preparing > 0 && <span className="ml-1 px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[9px]">{orderStats.pending + orderStats.preparing}</span>}
        </button>
        <button onClick={() => setOrderView('history')} className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${orderView === 'history' ? 'bg-surface-900 text-white shadow-sm' : 'bg-white border border-surface-200 text-surface-600 hover:bg-surface-50'}`}>
          <Clock className="w-3.5 h-3.5" /> History
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20"><Loader2 className="w-8 h-8 text-surface-400 animate-spin mx-auto" /></div>
      ) : orderView === 'active' ? (
        <ActiveOrdersView orders={guestOrders} updateOrderStatus={updateOrderStatus} setOrderDetailModal={setOrderDetailModal} currencySymbol={currencySymbol} />
      ) : (
        <HistoryOrdersView orders={guestOrders} setOrderDetailModal={setOrderDetailModal} />
      )}
    </div>
  );
}

function ActiveOrdersView({ orders, updateOrderStatus, setOrderDetailModal, currencySymbol }: {
  orders: GuestOrder[]; updateOrderStatus: (o: GuestOrder, s: string) => Promise<void>;
  setOrderDetailModal: (o: GuestOrder | null) => void; currencySymbol: string;
}) {
  const active = orders.filter((o) => o.status === 'pending' || o.status === 'preparing');
  if (active.length === 0) return (
    <div className="text-center py-20"><ShoppingCart className="w-12 h-12 text-surface-300 mx-auto mb-3" /><h3 className="text-sm font-semibold text-surface-600">No active orders</h3><p className="text-xs text-surface-400 mt-1">Pending and preparing orders from guests will appear here.</p></div>
  );
  const byRoom = new Map<string, { roomNum: string; guestName: string; orders: GuestOrder[] }>();
  for (const o of active) { const key = (o.bookings as any)?.rooms?.room_number || '?'; if (!byRoom.has(key)) { byRoom.set(key, { roomNum: key, guestName: (o.bookings as any)?.customers?.full_name || 'Guest', orders: [] }); } byRoom.get(key)!.orders.push(o); }
  return (
    <div className="space-y-4">
      {Array.from(byRoom.entries()).sort(([a], [b]) => Number(a) - Number(b)).map(([roomKey, group]) => {
        const pendingCount = group.orders.filter((o) => o.status === 'pending').length;
        const preparingCount = group.orders.filter((o) => o.status === 'preparing').length;
        return (
          <div key={roomKey} className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-surface-50/70 border-b border-surface-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-surface-900 text-white rounded-xl flex items-center justify-center text-sm font-bold font-mono">{roomKey}</div>
                <div><p className="text-sm font-bold text-surface-900">Suite #{roomKey}</p><p className="text-[10px] text-surface-500">{group.guestName}</p></div>
              </div>
              <div className="flex items-center gap-2">{pendingCount > 0 && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[9px] font-bold">{pendingCount} pending</span>}{preparingCount > 0 && <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-full text-[9px] font-bold">{preparingCount} preparing</span>}</div>
            </div>
            <div className="divide-y divide-surface-100">
              {group.orders.map((order) => { const item = order.inventory_items; return (
                <div key={order.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-surface-50/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="text-sm font-bold text-surface-900">{item?.name || 'Unknown'}</span><span className="text-xs text-surface-400">x{order.quantity}</span><span className="text-xs font-semibold text-surface-500">{currencySymbol}{Number(order.total_price).toFixed(2)}</span></div>
                    <p className="text-[10px] text-surface-400">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}{order.notes ? ` — "${order.notes}"` : ''}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${order.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>{order.status}</span>
                  {order.status === 'pending' && <button onClick={() => updateOrderStatus(order, 'preparing')} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-all whitespace-nowrap">Start</button>}
                  {order.status === 'preparing' && <button onClick={() => updateOrderStatus(order, 'served')} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-all whitespace-nowrap">Serve</button>}
                  <button onClick={() => setOrderDetailModal(order)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"><Eye className="w-3.5 h-3.5" /></button>
                </div>
              );})}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryOrdersView({ orders, setOrderDetailModal }: {
  orders: GuestOrder[]; setOrderDetailModal: (o: GuestOrder | null) => void;
}) {
  const history = orders.filter((o) => o.status === 'served' || o.status === 'cancelled');
  if (history.length === 0) return (
    <div className="text-center py-20"><Clock className="w-12 h-12 text-surface-300 mx-auto mb-3" /><h3 className="text-sm font-semibold text-surface-600">No order history</h3><p className="text-xs text-surface-400 mt-1">Completed and cancelled orders will appear here.</p></div>
  );
  const byDate = new Map<string, GuestOrder[]>();
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  for (const o of history) { const d = new Date(o.created_at).toISOString().split('T')[0]; if (!byDate.has(d)) byDate.set(d, []); byDate.get(d)!.push(o); }
  const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
  return (
    <div className="space-y-5">
      {sortedDates.map((dateStr) => {
        const orders = byDate.get(dateStr)!;
        let dateLabel: string;
        if (dateStr === today) dateLabel = 'Today';
        else if (dateStr === yesterday) dateLabel = 'Yesterday';
        else dateLabel = new Date(dateStr).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
        return (
          <div key={dateStr}>
            <h3 className="text-xs font-bold text-surface-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Calendar className="w-3.5 h-3.5" />{dateLabel}<span className="text-[10px] text-surface-300 font-normal">({orders.length} order{orders.length !== 1 ? 's' : ''})</span></h3>
            <div className="space-y-2">{orders.map((order) => { const item = order.inventory_items; const guestName = (order.bookings as any)?.customers?.full_name || 'Guest'; const roomNum = (order.bookings as any)?.rooms?.room_number || '?'; return (
              <div key={order.id} className="bg-white rounded-xl border border-surface-100 shadow-sm px-4 py-3 flex items-center gap-3 hover:bg-surface-50/50 transition-colors">
                <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-sm font-bold text-surface-900">{item?.name || 'Unknown'}</span><span className="text-xs text-surface-400">x{order.quantity}</span></div><p className="text-[10px] text-surface-500">Suite #{roomNum} · {guestName} · {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</p></div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${order.status === 'served' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{order.status}</span>
                <button onClick={() => setOrderDetailModal(order)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg cursor-pointer"><Eye className="w-3.5 h-3.5" /></button>
              </div>
            );})}</div>
          </div>
        );
      })}
    </div>
  );
}

function ChatContent({
  chatMessages, chatConversations, selectedChatBooking, setSelectedChatBooking,
  chatInput, setChatInput, chatSearch, setChatSearch, sendChatMessage, chatEndRef,
  typingUsers, onChatInputChange,
}: {
  chatMessages: ChatMessage[]; chatConversations: any[]; selectedChatBooking: string | null;
  setSelectedChatBooking: (id: string | null) => void; chatInput: string; setChatInput: (v: string) => void;
  chatSearch: string; setChatSearch: (v: string) => void; sendChatMessage: (e: React.FormEvent) => Promise<void>;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  typingUsers: ChatTyping[]; onChatInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  return (
    <div className="mt-4 bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden flex flex-col lg:flex-row" style={{ minHeight: '520px' }}>
      <div className={`${sidebarCollapsed ? 'lg:w-12' : 'lg:w-80'} border-b lg:border-b-0 lg:border-r border-surface-100 bg-surface-50/50 transition-all duration-200`}>
        <div className="p-3 border-b border-surface-100 bg-white flex items-center justify-between gap-2">
          {!sidebarCollapsed && <h3 className="text-[10px] font-bold uppercase tracking-wider text-surface-500">Conversations</h3>}
          <button onClick={() => setSidebarCollapsed((p) => !p)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer flex-shrink-0">
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
        {!sidebarCollapsed && (
          <>
            <div className="p-3 border-b border-surface-100 bg-white">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                <input type="text" value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Search guest or room..." className="w-full bg-surface-50 border border-surface-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-surface-800 placeholder:text-surface-400 focus:outline-none focus:border-brand-500 font-sans" />
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '380px' }}>
              {chatConversations.filter((c) => !chatSearch.trim() || c.guestName.toLowerCase().includes(chatSearch.toLowerCase()) || c.roomNumber.includes(chatSearch)).length === 0 ? (
                <div className="text-center py-12 px-4"><MessageSquareText className="w-8 h-8 text-surface-300 mx-auto mb-2" /><p className="text-xs text-surface-400">{chatSearch.trim() ? 'No results.' : 'No conversations yet.'}</p></div>
              ) : (
                chatConversations.filter((c) => !chatSearch.trim() || c.guestName.toLowerCase().includes(chatSearch.toLowerCase()) || c.roomNumber.includes(chatSearch)).map((conv) => (
                  <button key={conv.bookingId} onClick={() => setSelectedChatBooking(conv.bookingId)}
                    className={`w-full text-left px-4 py-3 border-b border-surface-100 hover:bg-white transition-colors cursor-pointer ${selectedChatBooking === conv.bookingId ? 'bg-white border-l-2 border-l-brand-500' : ''}`}>
                    <div className="flex justify-between items-start mb-1"><span className="text-xs font-bold text-surface-900 truncate max-w-[140px]">{conv.guestName}</span><span className="text-[9px] text-surface-400 whitespace-nowrap ml-2">{new Date(conv.lastMsg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span></div>
                    <p className="text-[10px] text-surface-500">Suite {conv.roomNumber}</p>
                    <div className="flex justify-between items-center mt-1"><p className="text-[10px] text-surface-400 truncate max-w-[160px]">{conv.lastMsg.message}</p><div className="flex items-center gap-1"><span className="text-[9px] text-surface-400">{conv.msgCount}</span>{conv.unreadCount > 0 && <span className="px-1 py-0.5 bg-brand-600 text-white text-[8px] font-bold rounded-full leading-none">{conv.unreadCount}</span>}</div></div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 flex flex-col">
        {!selectedChatBooking ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div><MessageSquareText className="w-12 h-12 text-surface-200 mx-auto mb-3" /><p className="text-sm font-semibold text-surface-500">Select a conversation</p><p className="text-xs text-surface-400 mt-1">Choose a guest conversation from the list to view and reply.</p></div>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-surface-100 bg-white flex items-center gap-3">
              <button onClick={() => setSelectedChatBooking(null)} className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer flex-shrink-0"><ChevronRight className="w-4 h-4" /></button>
              <div className="w-8 h-8 bg-brand-50 rounded-full flex items-center justify-center flex-shrink-0"><MessageSquareText className="w-4 h-4 text-brand-600" /></div>
              <div className="min-w-0 flex-1"><p className="text-sm font-bold text-surface-900 truncate">{chatMessages.find((m) => m.booking_id === selectedChatBooking)?.bookings?.customers?.full_name || 'Guest'}</p><p className="text-[10px] text-surface-400">Suite {chatMessages.find((m) => m.booking_id === selectedChatBooking)?.bookings?.rooms?.room_number || 'N/A'}</p></div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-surface-50/50" style={{ maxHeight: '380px' }}>
              {chatMessages.filter((m) => m.booking_id === selectedChatBooking).length === 0 ? (
                <div className="text-center py-8"><p className="text-xs text-surface-400">No messages yet.</p></div>
              ) : (
                chatMessages.filter((m) => m.booking_id === selectedChatBooking).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map((msg) => (
                  <div key={msg.id} className={`flex ${msg.sender_role === 'staff' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${msg.sender_role === 'staff' ? 'bg-brand-600 text-white rounded-br-md' : 'bg-white border border-surface-200 text-surface-800 rounded-bl-md shadow-sm'}`}>
                      <p className="text-[10px] font-semibold mb-0.5 opacity-80">{msg.sender_role === 'staff' ? 'You' : msg.sender_name}</p>
                      <p className="text-sm leading-relaxed">{msg.message}</p>
                      <p className={`text-[9px] mt-1 ${msg.sender_role === 'staff' ? 'text-brand-200' : 'text-surface-400'}`}>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            {/* Typing Indicator */}
            {selectedChatBooking && typingUsers
              .filter(t => t.booking_id === selectedChatBooking && t.user_role === 'guest' && t.is_typing)
              .slice(0, 1)
              .map(t => (
                <div key={t.user_id} className="flex items-center gap-2 px-4 py-1.5">
                  <span className="text-[10px] text-surface-400 italic">{t.user_name} is typing</span>
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-surface-300 animate-bounce" style={{animationDelay: '0ms'}} />
                    <span className="w-1 h-1 rounded-full bg-surface-300 animate-bounce" style={{animationDelay: '150ms'}} />
                    <span className="w-1 h-1 rounded-full bg-surface-300 animate-bounce" style={{animationDelay: '300ms'}} />
                  </span>
                </div>
              ))}
            <div className="border-t border-surface-100 p-4 bg-white">
              <form onSubmit={sendChatMessage} className="flex gap-2">
                <input type="text" value={chatInput} onChange={onChatInputChange} placeholder="Type a reply..." className="flex-1 px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-brand-500 transition-colors" />
                <button type="submit" disabled={!chatInput.trim()} className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> Send</button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RequestsContent({ staffCalls, stayExtensions, loading, updateCallStatus, onApproveExtension, onRejectExtension }: {
  staffCalls: StaffCall[]; stayExtensions: any[]; loading: boolean;
  updateCallStatus: (c: StaffCall, s: string) => Promise<void>;
  onApproveExtension: (ext: any) => Promise<void>;
  onRejectExtension: (ext: any) => Promise<void>;
}) {
  const pendingExts = stayExtensions.filter((e) => e.status === 'pending');
  const hasStaffCalls = staffCalls.length > 0;
  const hasExtensions = pendingExts.length > 0;
  if (!hasStaffCalls && !hasExtensions) {
    return (
      <div className="space-y-4 mt-4">
        <div className="flex items-center justify-between">
          <div><h2 className="text-sm font-bold text-surface-900 tracking-tight">Guest Requests</h2><p className="text-xs text-surface-400 mt-0.5">View and respond to guest requests.</p></div>
        </div>
        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto"><Bell className="w-10 h-10 text-surface-300 mx-auto mb-4" /><h3 className="text-base font-semibold text-surface-800">No requests yet</h3><p className="text-xs text-surface-400 mt-1">Guest assistance and extension requests will appear here.</p></div>
        <Footer />
      </div>
    );
  }
  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-sm font-bold text-surface-900 tracking-tight">Guest Requests</h2><p className="text-xs text-surface-400 mt-0.5">View and respond to guest requests.</p></div>
        {pendingExts.length + staffCalls.filter((c) => c.status === 'pending').length > 0 && <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold">{pendingExts.length + staffCalls.filter((c) => c.status === 'pending').length} pending</span>}
      </div>

      {hasExtensions && (
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 text-amber-600">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />Extension Requests — {pendingExts.length}
          </h3>
          <div className="grid gap-3">
            {pendingExts.map((ext) => {
              const guestName = ext.bookings?.customers?.full_name || 'Guest';
              const roomNum = ext.bookings?.rooms?.room_number || '?';
              return (
                <div key={ext.id} className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center"><CalendarClock className="w-5 h-5 text-amber-600" /></div>
                      <div><h4 className="text-sm font-bold text-surface-900">{guestName}</h4><p className="text-xs text-surface-500">Suite #{roomNum} — {new Date(ext.created_at).toLocaleString()}</p></div>
                    </div>
                    <span className="px-2 py-1 bg-amber-50 text-amber-700 text-[9px] font-bold uppercase rounded-full border border-amber-200 animate-pulse">New</span>
                  </div>
                  <div className="bg-amber-50/50 rounded-lg p-3 mb-3 border border-amber-100">
                    <p className="text-xs text-surface-700">
                      {ext.extend_type === 'hour'
                        ? `Extend by ${ext.requested_hours || ext.extend_hours || '?'} hour${(ext.requested_hours || ext.extend_hours) > 1 ? 's' : ''}`
                        : `Extend to ${ext.requested_check_out_date?.split('T')[0] || ext.requested_check_out_date}`
                      }
                      {ext.reason ? ` — "${ext.reason}"` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onApproveExtension(ext)} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5"><Check className="w-3.5 h-3.5" /> Approve</button>
                    <button onClick={() => onRejectExtension(ext)} className="flex-1 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5"><X className="w-3.5 h-3.5" /> Reject</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasStaffCalls && (
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 text-amber-600">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />Staff Calls — {staffCalls.length}
          </h3>
          <div className="grid gap-3">
            {['pending', 'responded', 'completed'].map((statusGroup) => {
              const filtered = staffCalls.filter((c) => c.status === statusGroup);
              if (filtered.length === 0) return null;
              return (
                <div key={statusGroup}>
                  <h4 className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${statusGroup === 'pending' ? 'text-amber-600' : statusGroup === 'responded' ? 'text-sky-600' : 'text-emerald-600'}`}>
                    {statusGroup.charAt(0).toUpperCase() + statusGroup.slice(1)} — {filtered.length}
                  </h4>
                  {filtered.map((call) => (
                    <div key={call.id} className="bg-white rounded-xl border shadow-sm p-4 mb-3 last:mb-0">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${call.status === 'pending' ? 'bg-amber-50' : call.status === 'responded' ? 'bg-sky-50' : 'bg-emerald-50'}`}>
                            <Bell className={`w-5 h-5 ${call.status === 'pending' ? 'text-amber-600' : call.status === 'responded' ? 'text-sky-600' : 'text-emerald-600'}`} />
                          </div>
                          <div><h4 className="text-sm font-bold text-surface-900">{call.guest_name}</h4><p className="text-xs text-surface-500">Suite {call.bookings?.rooms?.room_number || 'N/A'} — {new Date(call.created_at).toLocaleString()}</p></div>
                        </div>
                        {call.status === 'pending' && <span className="px-2 py-1 bg-amber-50 text-amber-700 text-[9px] font-bold uppercase rounded-full border border-amber-200 animate-pulse">New</span>}
                      </div>
                      <div className="bg-surface-50/50 rounded-lg p-3 mb-3 border border-surface-100"><p className="text-xs text-surface-700 font-medium">{call.reason}</p></div>
                      {call.status === 'pending' && <div className="flex gap-2"><button onClick={() => updateCallStatus(call, 'responded')} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Respond</button><button onClick={() => updateCallStatus(call, 'completed')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Resolve</button></div>}
                      {call.status === 'responded' && <button onClick={() => updateCallStatus(call, 'completed')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Mark Completed</button>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="bg-white border-t border-surface-200 py-3 px-6 text-center text-[10px] text-surface-400 font-mono">
      FRONT DESK · REAL-TIME OPERATIONS
    </footer>
  );
}
