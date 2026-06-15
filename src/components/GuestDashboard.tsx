import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Booking, Profile, Customer, InventoryItem, MenuCategory, GuestOrder, ChatMessage, StaffCall, StayExtension, ChatTyping } from '../types';
import { AlertDialog } from './AlertDialog';
import { getSettings, fetchSettingsFromSupabase, AppSettings } from '../lib/settings';
import { CallService } from '../lib/callService';
import type { Call } from '../types';
import { 
  Building, Calendar, User, LogOut, Home, Loader2, CalendarDays,
  UtensilsCrossed, MessageSquareText, Bell, Clock, Plus, Minus,
  Send, Phone, PhoneOff, Check, ShoppingCart, MapPin, Mail, X, CalendarPlus,
  Receipt, Star, DoorOpen, AlertTriangle, RefreshCw, CreditCard, FileText,
  Mic, MicOff
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface GuestDashboardProps {
  onNavigate: (screen: 'login' | 'admin-dashboard' | 'employee-dashboard' | 'guest-dashboard' | 'guest-access') => void;
  userSession: Session | null;
  userProfile: Profile | null;
  onLogout: () => void;
  onProfileUpdate: (updatedProfile: Profile) => void;
  roomNumber?: string | null;
  bookingUid?: string | null;
}

type GuestTab = 'bookings' | 'profile' | 'menu' | 'chat' | 'extend_stay' | 'billing' | 'feedback';

export default function GuestDashboard({ onNavigate, userSession, userProfile, onLogout, onProfileUpdate, roomNumber, bookingUid }: GuestDashboardProps) {
  const [activeTab, setActiveTab] = useState<GuestTab>('bookings');
  const [loading, setLoading] = useState(true);
  const [deviceLocked, setDeviceLocked] = useState(false);
  const [lockedBooking, setLockedBooking] = useState<Booking | null>(null);
  const [inputSharingCode, setInputSharingCode] = useState('');
  const [sharingError, setSharingError] = useState('');
  const [sharingVerifying, setSharingVerifying] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [generatingCode, setGeneratingCode] = useState(false);

  const isLocalAccess = !!roomNumber || !!bookingUid;
  const localId = roomNumber || bookingUid || 'unknown';
  const effectiveProfile: Profile = isLocalAccess
    ? { id: `local-${localId}`, email: `room${localId}@local`, full_name: `Room ${roomNumber || 'Guest'} Guest`, role: 'guest', created_at: new Date().toISOString() }
    : userProfile || { id: '', email: '', full_name: 'Guest', role: 'guest', created_at: new Date().toISOString() };
  const chatSenderId = isLocalAccess ? null : effectiveProfile.id;

  // Core data
  const [customerRecord, setCustomerRecord] = useState<Customer | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [checkedInBooking, setCheckedInBooking] = useState<Booking | null>(null);

  // Profile
  const [newName, setNewName] = useState(effectiveProfile.full_name || '');
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Menu ordering
  const [menuItems, setMenuItems] = useState<InventoryItem[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [guestOrders, setGuestOrders] = useState<GuestOrder[]>([]);
  const [cart, setCart] = useState<{ item: InventoryItem; qty: number }[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [diningSubTab, setDiningSubTab] = useState<'menu' | 'history'>('menu');
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [securityCodeInput, setSecurityCodeInput] = useState('');
  const [securityCodeError, setSecurityCodeError] = useState('');

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typingUsers, setTypingUsers] = useState<ChatTyping[]>([]);

  // Staff calls
  const [staffCalls, setStaffCalls] = useState<StaffCall[]>([]);
  const [callReason, setCallReason] = useState('');
  const [callingStaff, setCallingStaff] = useState(false);
  const [showCallStaffModal, setShowCallStaffModal] = useState(false);
  const [guestCallStatus, setGuestCallStatus] = useState<'idle' | 'calling' | 'connected' | 'ended'>('idle');
  const [guestCallDuration, setGuestCallDuration] = useState(0);
  const [guestIsMuted, setGuestIsMuted] = useState(false);
  const guestCallServiceRef = useRef<CallService | null>(null);
  const [showCheckoutConfirmModal, setShowCheckoutConfirmModal] = useState(false);

  // Stay extensions
  const [extensions, setExtensions] = useState<StayExtension[]>([]);
  const [extendDate, setExtendDate] = useState('');
  const [extendType, setExtendType] = useState<'day' | 'hour'>('day');
  const [extendHours, setExtendHours] = useState(1);
  const [extendReason, setExtendReason] = useState('');
  const [extending, setExtending] = useState(false);

  // Chat sidebar toggle
  const [chatSidebarOpen, setChatSidebarOpen] = useState(true);

  // Alerts
  const [alertState, setAlertState] = useState<{ title: string; message: string } | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  useEffect(() => {
    const handleSettingsUpdate = () => {
      setSettings(getSettings());
    };
    window.addEventListener('hotel-settings-updated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('hotel-settings-updated', handleSettingsUpdate);
    };
  }, []);
  const [liveStayDuration, setLiveStayDuration] = useState('');
  const prevOrderStatusesRef = useRef<Record<string, string>>({});
  const prevExtensionStatusesRef = useRef<Record<string, string>>({});
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [orderToast, setOrderToast] = useState<string | null>(null);
  const [extensionToast, setExtensionToast] = useState<string | null>(null);

  // Billing
  const [guestCharges, setGuestCharges] = useState<any[]>([]);
  const [guestPayments, setGuestPayments] = useState<any[]>([]);

  // Feedback
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Checkout request
  const [checkoutRequesting, setCheckoutRequesting] = useState(false);

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Mark staff messages as seen when guest views the chat tab
  useEffect(() => {
    if (!checkedInBooking || activeTab !== 'chat') return;
    const unreadStaffMsgs = chatMessages.filter(
      m => m.booking_id === checkedInBooking.id && m.sender_role === 'staff' && !m.seen_at
    );
    if (unreadStaffMsgs.length === 0) return;
    unreadStaffMsgs.forEach(msg => {
      supabase.from('chat_messages').update({ seen_at: new Date().toISOString() }).eq('id', msg.id).then(() => {}, () => {});
    });
  }, [activeTab, chatMessages, checkedInBooking]);

  const loadGuestData = async () => {
    setLoading(true);
    try {
      let activeCheckedIn: Booking | null = null;

      if (bookingUid) {
        // DIRECT ACCESS MODE: Load booking by UID
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('*, rooms(*)')
          .eq('id', bookingUid)
          .maybeSingle();

        if (bookingData && bookingData.status === 'checked-in' && (bookingData as any).rooms?.status === 'booked') {
          // CHECK DEVICE PORTAL LOCK
          const dbToken = (bookingData as any).device_token;
          const localKey = `guest_device_token_${bookingUid}`;
          const localToken = localStorage.getItem(localKey);

          const params = new URLSearchParams(window.location.search);
          const urlCode = params.get('code');
          const dbCode = (bookingData as any).sharing_code;

          let isCompanionAuthorized = false;
          if (urlCode && dbCode && urlCode.trim().toUpperCase() === dbCode.trim().toUpperCase()) {
            isCompanionAuthorized = true;
            if (dbToken) {
              localStorage.setItem(localKey, dbToken);
            }
          }

          if (dbToken) {
            if (localToken === dbToken || isCompanionAuthorized) {
              if (isCompanionAuthorized) {
                window.history.replaceState({}, '', window.location.pathname);
              }
              setCheckedInBooking(bookingData);
              setBookings([bookingData]);
              activeCheckedIn = bookingData;
              setDeviceLocked(false);
              setLockedBooking(null);
            } else {
              setDeviceLocked(true);
              setLockedBooking(bookingData);
              setLoading(false);
              return;
            }
          } else {
            // First device claiming access!
            const generatedToken = `gdev_${bookingUid}_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
            localStorage.setItem(localKey, generatedToken);
            await supabase
              .from('bookings')
              .update({ device_token: generatedToken })
              .eq('id', bookingUid);

            setCheckedInBooking(bookingData);
            setBookings([bookingData]);
            activeCheckedIn = bookingData;
          }
        } else if (bookingData) {
          // Orphaned booking (checked-in but room not booked) — clean up
          if (bookingData.status === 'checked-in') {
            supabase.from('bookings').delete().eq('id', bookingData.id).then();
          }
          setBookings([]);
        } else {
          setBookings([]);
        }
      } else if (roomNumber) {
        // LOCAL ACCESS MODE: Find room by number, then find active booking
        const { data: room } = await supabase
          .from('rooms')
          .select('*')
          .eq('room_number', roomNumber)
          .maybeSingle();

        if (room) {
          const { data: bookingData } = await supabase
            .from('bookings')
            .select('*, rooms(*)')
            .eq('room_id', room.id)
            .eq('status', 'checked-in')
            .maybeSingle();

          if (bookingData && (bookingData as any).rooms?.status === 'booked') {
            // CHECK DEVICE PORTAL LOCK
            const bId = bookingData.id;
            const dbToken = (bookingData as any).device_token;
            const localKey = `guest_device_token_${bId}`;
            const localToken = localStorage.getItem(localKey);

            const params = new URLSearchParams(window.location.search);
            const urlCode = params.get('code');
            const dbCode = (bookingData as any).sharing_code;

            let isCompanionAuthorized = false;
            if (urlCode && dbCode && urlCode.trim().toUpperCase() === dbCode.trim().toUpperCase()) {
              isCompanionAuthorized = true;
              if (dbToken) {
                localStorage.setItem(localKey, dbToken);
              }
            }

            if (dbToken) {
              if (localToken === dbToken || isCompanionAuthorized) {
                setCheckedInBooking(bookingData);
                setBookings([bookingData]);
                activeCheckedIn = bookingData;
                window.history.replaceState({}, '', '/guest-access/' + bookingData.id);
                setDeviceLocked(false);
                setLockedBooking(null);
              } else {
                setDeviceLocked(true);
                setLockedBooking(bookingData);
                setLoading(false);
                return;
              }
            } else {
              // First device claiming access!
              const generatedToken = `gdev_${bId}_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
              localStorage.setItem(localKey, generatedToken);
              await supabase
                .from('bookings')
                .update({ device_token: generatedToken })
                .eq('id', bId);

              setCheckedInBooking(bookingData);
              setBookings([bookingData]);
              activeCheckedIn = bookingData;
              window.history.replaceState({}, '', '/guest-access/' + bookingData.id);
            }
          } else {
            // Orphaned checked-in booking (room not booked) — clean up
            if (bookingData) {
              supabase.from('bookings').delete().eq('id', bookingData.id).then();
            }
            setBookings([]);
          }
        }
      } else {
        // AUTH MODE: Get customer record by email
        if (!effectiveProfile.email) return;

        const { data: customerData } = await supabase
          .from('customers')
          .select('*')
          .eq('email', effectiveProfile.email)
          .single();

        if (customerData) {
          setCustomerRecord(customerData);

          const { data: bookingsData } = await supabase
            .from('bookings')
            .select('*, rooms(*)')
            .eq('customer_id', customerData.id)
            .order('check_in_date', { ascending: false });

          if (bookingsData) {
            setBookings(bookingsData);
            const active = bookingsData.find(b => b.status === 'checked-in');
            setCheckedInBooking(active || null);
            activeCheckedIn = active || null;
          }
        }
      }

      // Fetch menu items and categories (for all guests)
      const [itemsRes, catsRes] = await Promise.all([
        supabase.from('inventory_items').select('*, menu_categories(*)').gt('stock_quantity', 0).order('name'),
        supabase.from('menu_categories').select('*').order('name')
      ]);
      if (itemsRes.data) setMenuItems(itemsRes.data);
      if (catsRes.data) setMenuCategories(catsRes.data);

      // Fetch resort settings
      const freshSettings = await fetchSettingsFromSupabase();
      setSettings(freshSettings);

      if (activeCheckedIn) {
        await loadBookingData(activeCheckedIn.id);
      }
    } catch (err) {
      console.error("Error loading guest data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Load booking-specific data (orders, chat, calls, extensions) when we have a checked-in booking
  const loadBookingData = async (bookingId: string) => {
    const [ordersRes, chatRes, callsRes, extRes] = await Promise.all([
      supabase.from('guest_orders').select('*, inventory_items(*)').eq('booking_id', bookingId).order('created_at', { ascending: false }),
      supabase.from('chat_messages').select('*').eq('booking_id', bookingId).order('created_at', { ascending: true }),
      supabase.from('staff_calls').select('*').eq('booking_id', bookingId).order('created_at', { ascending: false }),
      supabase.from('stay_extensions').select('*').eq('booking_id', bookingId).order('created_at', { ascending: false })
    ]);
    if (ordersRes.data) setGuestOrders(ordersRes.data);
    if (chatRes.data) setChatMessages(chatRes.data);
    if (callsRes.data) setStaffCalls(callsRes.data);
    if (extRes.data) {
      setExtensions(extRes.data);
      extRes.data.forEach(ext => { prevExtensionStatusesRef.current[ext.id] = ext.status; });
    }

    // Load billing data
    const [chargesRes, paymentsRes] = await Promise.all([
      supabase.from('booking_charges').select('*').eq('booking_id', bookingId).order('created_at', { ascending: false }),
      supabase.from('payments').select('*').eq('booking_id', bookingId).order('created_at', { ascending: false }),
    ]);
    if (chargesRes.data) setGuestCharges(chargesRes.data);
    if (paymentsRes.data) setGuestPayments(paymentsRes.data);
  };

  useEffect(() => {
    loadGuestData();
  }, [effectiveProfile.email, roomNumber, bookingUid]);

  // Real-time subscription for chat messages
  useEffect(() => {
    if (!checkedInBooking) return;

    const channel = supabase
      .channel('guest-chat')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `booking_id=eq.${checkedInBooking.id}`
      }, (payload) => {
        const newMsg = payload.new as ChatMessage;
        setChatMessages(prev => {
          if (prev.find(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [checkedInBooking]);

  // Real-time subscription for guest order status changes
  useEffect(() => {
    if (!checkedInBooking) return;
    const orderChannel = supabase
      .channel('guest-orders-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'guest_orders', filter: `booking_id=eq.${checkedInBooking.id}` }, (payload) => {
        const updated = payload.new as GuestOrder;
        setGuestOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
        const prev = prevOrderStatusesRef.current[updated.id];
        if (prev && prev !== updated.status) {
          const msg = updated.status === 'preparing' ? '👨‍🍳 Your order is being prepared!' : updated.status === 'served' ? '✅ Your order has been served!' : null;
          if (msg) { setOrderToast(msg); if (toastTimerRef.current) clearTimeout(toastTimerRef.current); toastTimerRef.current = setTimeout(() => setOrderToast(null), 5000); }
        }
        prevOrderStatusesRef.current[updated.id] = updated.status;
      })
      .subscribe();
    return () => { supabase.removeChannel(orderChannel); };
  }, [checkedInBooking]);

  // Real-time subscription for typing indicators
  useEffect(() => {
    if (!checkedInBooking) return;

    const typingChannel = supabase
      .channel('guest-typing')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_typing',
        filter: `booking_id=eq.${checkedInBooking.id}`
      }, (payload) => {
        const typingData = payload.new as ChatTyping;
        if (typingData.user_role === 'staff') {
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
  }, [checkedInBooking]);

  // Real-time subscription for all booking-related data (orders, staff calls, extensions, booking updates)
  useEffect(() => {
    if (!checkedInBooking) return;

    const bookingChannel = supabase
      .channel('guest-booking-data')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'guest_orders',
        filter: `booking_id=eq.${checkedInBooking.id}`
      }, async (payload) => {
        const newOrder = payload.new as any;
        if (!newOrder?.id) return;
        const { data } = await supabase
          .from('guest_orders')
          .select('*, inventory_items(*)')
          .eq('id', newOrder.id)
          .maybeSingle();
        if (data) setGuestOrders(prev => prev.some(o => o.id === data.id) ? prev : [data as any, ...prev]);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'staff_calls',
        filter: `booking_id=eq.${checkedInBooking.id}`
      }, async () => {
        const { data } = await supabase
          .from('staff_calls')
          .select('*')
          .eq('booking_id', checkedInBooking.id)
          .order('created_at', { ascending: false });
        if (data) setStaffCalls(data);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'stay_extensions',
        filter: `booking_id=eq.${checkedInBooking.id}`
      }, async () => {
        const { data } = await supabase
          .from('stay_extensions')
          .select('*')
          .eq('booking_id', checkedInBooking.id)
          .order('created_at', { ascending: false });
        if (data) setExtensions(data);
        // Detect status change for toast
        if (data && data.length > 0) {
          for (const ext of data) {
            const prev = prevExtensionStatusesRef.current[ext.id];
            const statusChanged = prev && prev !== ext.status;
            const isNew = !prev;
            if (statusChanged || isNew) {
              prevExtensionStatusesRef.current[ext.id] = ext.status;
              if (statusChanged) {
                const statusLabel = ext.status === 'approved' ? 'Approved ✅' : ext.status === 'rejected' ? 'Rejected ❌' : ext.status;
                setExtensionToast(`Extension ${statusLabel}: ${ext.reason || 'No reason'}`);
                if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                toastTimerRef.current = setTimeout(() => setExtensionToast(null), 4000);
              }
            }
          }
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `id=eq.${checkedInBooking.id}`
      }, async (payload) => {
        const updated = payload.new as Booking;
        setCheckedInBooking(prev => prev && prev.id === updated.id ? { ...prev, ...updated } : prev);
        setBookings(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b));
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'charges',
        filter: `booking_id=eq.${checkedInBooking.id}`
      }, async () => {
        const { data } = await supabase.from('booking_charges').select('*').eq('booking_id', checkedInBooking!.id).order('created_at', { ascending: false });
        if (data) setGuestCharges(data);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'payments',
        filter: `booking_id=eq.${checkedInBooking.id}`
      }, async () => {
        const { data } = await supabase.from('payments').select('*').eq('booking_id', checkedInBooking!.id).order('created_at', { ascending: false });
        if (data) setGuestPayments(data);
      })
      .subscribe();

    return () => { supabase.removeChannel(bookingChannel); };
  }, [checkedInBooking]);

  // Polling fallback for orders, chat, staff calls, extensions (in case Realtime is not enabled)
  useEffect(() => {
    if (!checkedInBooking) return;
    const interval = setInterval(async () => {
      const [ordersRes, chatRes, callsRes, extRes, chargesRes, paymentsRes] = await Promise.all([
        supabase.from('guest_orders').select('*, inventory_items(*)').eq('booking_id', checkedInBooking.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('chat_messages').select('*').eq('booking_id', checkedInBooking.id).order('created_at', { ascending: true }).limit(50),
        supabase.from('staff_calls').select('*').eq('booking_id', checkedInBooking.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('stay_extensions').select('*').eq('booking_id', checkedInBooking.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('booking_charges').select('*').eq('booking_id', checkedInBooking.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('payments').select('*').eq('booking_id', checkedInBooking.id).order('created_at', { ascending: false }).limit(50),
      ]);
      if (ordersRes.data) setGuestOrders(ordersRes.data);
      if (chatRes.data) setChatMessages(chatRes.data);
      if (callsRes.data) setStaffCalls(callsRes.data);
      if (extRes.data) setExtensions(extRes.data);
      if (chargesRes.data) setGuestCharges(chargesRes.data);
      if (paymentsRes.data) setGuestPayments(paymentsRes.data);
    }, 30000);
    return () => clearInterval(interval);
  }, [checkedInBooking]);

  // Live stay duration timer (updates every 30s)
  useEffect(() => {
    if (!checkedInBooking) { setLiveStayDuration(''); return; }
    const calcDuration = () => {
      const timeStr = checkedInBooking.check_in_time || '12:00 PM';
      const [time, ampm] = timeStr.split(' ');
      let [h, m] = time.split(':').map(Number);
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      const checkInDate = new Date(checkedInBooking.check_in_date);
      checkInDate.setHours(h, m, 0, 0);
      const now = new Date();
      const diffMs = now.getTime() - checkInDate.getTime();
      if (diffMs <= 0) { setLiveStayDuration('Just checked in'); return; }
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      if (days > 0) setLiveStayDuration(`${days}d ${hours}h ${mins}m`);
      else setLiveStayDuration(`${hours}h ${mins}m`);
    };
    calcDuration();
    const interval = setInterval(calcDuration, 30000);
    return () => clearInterval(interval);
  }, [checkedInBooking]);

  // Detect order status changes for real-time toast notifications (auto-closes after 4s)
  useEffect(() => {
    const statusLabels: Record<string, string> = {
      preparing: 'being prepared',
      served: 'on its way to your suite',
      completed: 'completed',
      cancelled: 'cancelled',
    };
    for (const order of guestOrders) {
      const prevStatus = prevOrderStatusesRef.current[order.id];
      if (prevStatus && prevStatus !== order.status) {
        const label = statusLabels[order.status] || order.status;
        const itemName = (order as any).inventory_items?.name || 'Order item';
        setOrderToast(`${itemName} is now ${label}!`);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => { setOrderToast(null); toastTimerRef.current = null; }, 4000);
      }
    }
    prevOrderStatusesRef.current = Object.fromEntries(guestOrders.map(o => [o.id, o.status]));
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, [guestOrders]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingProfile(true);
    setProfileMsg('');
    try {
      const { error } = await supabase
        .from('users')
        .update({ full_name: newName.trim() })
        .eq('id', effectiveProfile.id);
      if (error) throw error;
      if (userProfile) onProfileUpdate({ ...userProfile, full_name: newName.trim() });
      setProfileMsg("Profile updated successfully!");
    } catch (err: any) {
      setProfileMsg("Error: " + err.message);
    } finally {
      setUpdatingProfile(false);
    }
  };

  // ===== MENU ORDERING =====
  const addToCart = (item: InventoryItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === item.id);
      if (existing) {
        if (existing.qty >= Number(item.stock_quantity)) return prev;
        return prev.map(c => c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { item, qty: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === itemId);
      if (!existing) return prev;
      if (existing.qty <= 1) return prev.filter(c => c.item.id !== itemId);
      return prev.map(c => c.item.id === itemId ? { ...c, qty: c.qty - 1 } : c);
    });
  };

  const cartTotal = cart.reduce((sum, c) => sum + Number(c.item.price) * c.qty, 0);

  const placeOrder = async () => {
    if (!checkedInBooking || cart.length === 0) return;
    setOrderLoading(true);
    try {
      // Check stock levels and collect fresh stock values from DB
      const freshStock = new Map<string, number>();
      for (const entry of cart) {
        const { data: currentItem } = await supabase
          .from('inventory_items')
          .select('stock_quantity')
          .eq('id', entry.item.id)
          .single();
        if (!currentItem || Number(currentItem.stock_quantity) < entry.qty) {
          throw new Error(`Insufficient stock for ${entry.item.name}: only ${currentItem?.stock_quantity || 0} available.`);
        }
        freshStock.set(entry.item.id, Number(currentItem.stock_quantity));
      }

      // Batch insert all order items
      const orderInserts = cart.map(entry => ({
        booking_id: checkedInBooking.id,
        item_id: entry.item.id,
        quantity: entry.qty,
        unit_price: Number(entry.item.price),
        total_price: Number(entry.item.price) * entry.qty,
        status: 'pending',
        notes: ''
      }));

      const { error: insertError } = await supabase.from('guest_orders').insert(orderInserts);
      if (insertError) throw insertError;

      // Deduct stock using fresh values from DB
      for (const entry of cart) {
        const currentStock = freshStock.get(entry.item.id) ?? Number(entry.item.stock_quantity);
        const newQty = currentStock - entry.qty;
        await supabase.from('inventory_items').update({ stock_quantity: newQty }).eq('id', entry.item.id);
      }

      // Log activity
      await supabase.from('activity_logs').insert({
        user_id: effectiveProfile.id,
        user_name: effectiveProfile.full_name || 'Guest',
        action: 'Guest Order Placed',
        details: `${cart.length} item(s) ordered for booking ${checkedInBooking.id}`
      });

      setCart([]);
      setAlertState({ title: 'Order Placed!', message: 'Your order has been sent to the kitchen. We\'ll prepare it right away!' });

      // Send chat notification to front desk about this order
      try {
        const orderSummary = cart.map(entry => `${entry.item.name} x${entry.qty}`).join(', ');
        await supabase.from('chat_messages').insert({
          booking_id: checkedInBooking.id,
          sender_id: chatSenderId,
          sender_name: effectiveProfile.full_name || 'Guest',
          sender_role: 'guest',
          message: `🍽️ New Order: ${orderSummary}`
        });
      } catch (chatErr) {
        console.warn('Failed to send order chat notification:', chatErr);
      }

      // Refresh orders
      const { data: ordersRes } = await supabase
        .from('guest_orders')
        .select('*, inventory_items(*)')
        .eq('booking_id', checkedInBooking.id)
        .order('created_at', { ascending: false });
      if (ordersRes) setGuestOrders(ordersRes);

      // Refresh menu items (stock levels changed)
      const { data: itemsRes } = await supabase
        .from('inventory_items')
        .select('*, menu_categories(*)')
        .gt('stock_quantity', 0)
        .order('name');
      if (itemsRes) setMenuItems(itemsRes);

    } catch (err: any) {
      setAlertState({ title: 'Order Failed', message: err.message });
    } finally {
      setOrderLoading(false);
    }
  };

  // ===== CHAT =====
  const sendChatMessage = async () => {
    if (!checkedInBooking || !chatInput.trim()) return;
    setSendingChat(true);
    try {
      const { data: newMsgData, error } = await supabase.from('chat_messages').insert({
        booking_id: checkedInBooking.id,
        sender_id: chatSenderId,
        sender_name: effectiveProfile.full_name || 'Guest',
        sender_role: 'guest',
        message: chatInput.trim()
      }).select();
      if (error) throw error;
      if (newMsgData?.[0]) {
        setChatMessages(prev => [...prev, newMsgData[0] as ChatMessage]);
      }
      setChatInput('');
      // Clear typing status after sending
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
      if (effectiveProfile.id) {
        supabase.from('chat_typing').upsert({
          booking_id: checkedInBooking.id,
          user_id: effectiveProfile.id,
          user_name: effectiveProfile.full_name || 'Guest',
          user_role: 'guest',
          is_typing: false
        }, { onConflict: 'booking_id, user_id' }).then(() => {});
      }
    } catch (err: any) {
      setAlertState({ title: 'Send Failed', message: err.message });
    } finally {
      setSendingChat(false);
    }
  };

  // ===== STAFF CALLS =====
  const callStaff = async () => {
    if (!checkedInBooking) return;
    setCallingStaff(true);
    try {
      const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
      const { error } = await supabase.from('staff_calls').insert({
        booking_id: checkedInBooking.id,
        guest_id: isUuid(effectiveProfile.id) ? effectiveProfile.id : null,
        guest_name: effectiveProfile.full_name || 'Guest',
        reason: callReason.trim() || 'Guest needs assistance',
        status: 'pending'
      });
      if (error) throw error;
      await supabase.from('chat_messages').insert({
        booking_id: checkedInBooking.id,
        sender_id: chatSenderId,
        sender_name: effectiveProfile.full_name || 'Guest',
        sender_role: 'guest',
        message: callReason.trim()
          ? `📞 Staff Call: ${callReason.trim()}`
          : `📞 Staff Call: Guest needs assistance`
      });
      setCallReason('');
      setAlertState({ title: 'Staff Called!', message: 'A staff member will be with you shortly.' });
      // Refresh calls
      const { data: callsRes } = await supabase
        .from('staff_calls')
        .select('*')
        .eq('booking_id', checkedInBooking.id)
        .order('created_at', { ascending: false });
      if (callsRes) setStaffCalls(callsRes);
    } catch (err: any) {
      setAlertState({ title: 'Error', message: err.message });
    } finally {
      setCallingStaff(false);
    }
  };

  const callFrontDesk = async () => {
    if (!checkedInBooking || !effectiveProfile) return;
    setGuestCallStatus('calling');
    try {
      const svc = new CallService();
      guestCallServiceRef.current = svc;
      const ok = await svc.requestMicrophone();
      if (!ok) { setAlertState({ title: 'Microphone Required', message: 'Please allow microphone access to call the front desk.' }); setGuestCallStatus('idle'); return; }
      const call = await CallService.createCall({
        booking_id: checkedInBooking.id,
        caller_id: (() => { const s = effectiveProfile.id || ''; return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null; })(),
        caller_name: effectiveProfile.full_name || 'Guest',
        caller_role: 'guest',
        room_number: checkedInBooking.rooms?.room_number || undefined,
        status: 'ringing',
      });
      if (!call) { setAlertState({ title: 'Call Failed', message: 'Could not connect to the front desk. Make sure the "calls" table has been created in your Supabase database.' }); setGuestCallStatus('idle'); return; }
      let callTimer: ReturnType<typeof setInterval> | null = null;
      svc.subscribeToSignaling(call.id, effectiveProfile.id || '', async (signal) => {
        if (signal.type === 'answer') {
          const fromDb = await CallService.getCall(call.id);
          if (fromDb?.answer_data) await svc.handleAnswer(JSON.parse(fromDb.answer_data));
        }
        if (signal.type === 'declined' || signal.type === 'ended') {
          setGuestCallStatus('ended');
          svc.endCall();
        }
        if (signal.type === 'ice-candidate') svc.queueIceCandidate(signal.data);
      });
      const offer = await svc.createOffer();
      if (offer) {
        const stored = await CallService.updateCall(call.id, { offer_data: JSON.stringify(offer) });
        if (stored) CallService.announceNewCall(call.id);
        else console.error('Failed to store offer_data for call:', call.id);
      }
      // Poll for answer
      const pollTimer = setInterval(async () => {
        const updated = await CallService.getCall(call.id);
        if (!updated) return;
        if (updated.status === 'connected' && updated.answer_data) {
          await svc.handleAnswer(JSON.parse(updated.answer_data));
          setGuestCallStatus('connected');
          const start = Date.now();
          callTimer = setInterval(() => setGuestCallDuration(Math.floor((Date.now() - start) / 1000)), 1000);
          clearInterval(pollTimer);
        }
        if (updated.status === 'missed' || updated.status === 'ended') {
          setGuestCallStatus('ended');
          if (callTimer) clearInterval(callTimer);
          clearInterval(pollTimer);
          svc.endCall();
          if (checkedInBooking && updated.status === 'missed') {
            try {
              await supabase.from('chat_messages').insert({
                booking_id: checkedInBooking.id,
                sender_id: chatSenderId,
                sender_name: effectiveProfile.full_name || 'Guest',
                sender_role: 'guest',
                message: `📞 Missed call from Front Desk`
              });
            } catch {}
          }
        }
      }, 1000);
    } catch { setGuestCallStatus('idle'); }
  };

  const toggleGuestMute = () => {
    if (guestCallServiceRef.current) {
      setGuestIsMuted(guestCallServiceRef.current.toggleMute());
    }
  };

  const hangUpCall = async () => {
    if (guestCallServiceRef.current) {
      const svc = guestCallServiceRef.current;
      const callId = svc['currentCallIdVal'] || '';
      await CallService.updateCall(callId, { status: 'ended', end_time: new Date().toISOString() });
      svc.broadcastSignal('ended');
      if (callId && guestCallDuration > 0 && checkedInBooking) {
        const mins = Math.floor(guestCallDuration / 60);
        const secs = guestCallDuration % 60;
        try {
          await supabase.from('chat_messages').insert({
            booking_id: checkedInBooking.id,
            sender_id: chatSenderId,
            sender_name: effectiveProfile.full_name || 'Guest',
            sender_role: 'guest',
            message: `📞 Call with Front Desk ended — ${mins}:${secs.toString().padStart(2, '0')}`
          });
        } catch {}
      }
      svc.endCall();
    }
    setGuestCallStatus('idle');
    setGuestCallDuration(0);
  };

  // ===== STAY EXTENSION =====
  const requestExtension = async () => {
    if (!checkedInBooking) return;
    if (extendType === 'day' && !extendDate) return;
    if (extendType === 'hour' && (!extendHours || extendHours < 1)) return;
    setExtending(true);
    try {
      const extPayload: any = {
        booking_id: checkedInBooking.id,
        extend_type: extendType,
        reason: extendReason.trim() || 'Guest requested extension',
        status: 'pending'
      };
      if (extendType === 'day') {
        extPayload.requested_check_out_date = extendDate;
      } else {
        // For hourly, store requested_hours and compute estimated date
        extPayload.requested_hours = extendHours;
        // Calculate new check-out date/time based on current check-out + hours
        const timeStr = checkedInBooking.check_out_time || '12:00 PM';
        const [hStr, modifier] = timeStr.split(' ');
        let [h, m] = hStr.split(':').map(Number);
        if (modifier === 'PM' && h < 12) h += 12;
        if (modifier === 'AM' && h === 12) h = 0;
        const currentOut = new Date(checkedInBooking.check_out_date);
        currentOut.setHours(h, m, 0, 0);
        const newOut = new Date(currentOut.getTime() + extendHours * 60 * 60 * 1000);
        extPayload.requested_check_out_date = newOut.toISOString().split('T')[0];
      }
      const { error } = await supabase.from('stay_extensions').insert(extPayload);
      if (error) throw error;
      // Send chat notification to front desk about this extension
      try {
        const extDesc = extendType === 'day'
          ? `extend to ${extendDate}`
          : `extend by ${extendHours} hour${extendHours > 1 ? 's' : ''}`;
        await supabase.from('chat_messages').insert({
          booking_id: checkedInBooking.id,
          sender_id: chatSenderId,
          sender_name: effectiveProfile.full_name || 'Guest',
          sender_role: 'guest',
          message: `🕐 Extension Request: ${extDesc}${extendReason.trim() ? ` — "${extendReason.trim()}"` : ''}`
        });
      } catch (chatErr) {
        console.warn('Failed to send extension chat notification:', chatErr);
      }
      setExtendDate('');
      setExtendHours(1);
      setExtendReason('');
      setAlertState({ title: 'Extension Requested!', message: 'Your extension request has been sent to the front desk for approval.' });
      const { data: extRes } = await supabase
        .from('stay_extensions')
        .select('*')
        .eq('booking_id', checkedInBooking.id)
        .order('created_at', { ascending: false });
      if (extRes) setExtensions(extRes);
    } catch (err: any) {
      setAlertState({ title: 'Error', message: err.message });
    } finally {
      setExtending(false);
    }
  };

  const isPastCheckIn = (() => {
    if (!checkedInBooking) return false;
    const t = checkedInBooking.check_in_time;
    const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return true;
    let h = parseInt(m[1]);
    if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
    const checkInDt = new Date(checkedInBooking.check_in_date);
    checkInDt.setHours(h, parseInt(m[2]), 0, 0);
    return new Date() >= checkInDt;
  })();
  const hasActiveStay = !!checkedInBooking && checkedInBooking.status === 'checked-in' && isPastCheckIn;

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackComment.trim()) return;
    setFeedbackSubmitting(true);
    try {
      await supabase.from('testimonials').insert({
        customer_name: effectiveProfile.full_name || 'Guest',
        role_or_title: 'Hotel Guest',
        comment: feedbackComment.trim(),
        rating: feedbackRating,
        avatar_url: '',
      });
      setFeedbackSubmitted(true);
      setFeedbackComment('');
    } catch (err: any) {
      setAlertState({ title: 'Feedback Failed', message: err.message });
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleRequestCheckout = async () => {
    if (!checkedInBooking) return;
    setCheckoutRequesting(true);
    try {
      await supabase.from('staff_calls').insert({
        booking_id: checkedInBooking.id,
        guest_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(effectiveProfile.id) ? effectiveProfile.id : null,
        guest_name: effectiveProfile.full_name || 'Guest',
        reason: 'Guest requested checkout — please process check-out.',
        status: 'pending',
      });

      // Write checkout request to Chat Messages
      const roomLabel = checkedInBooking?.rooms?.room_number || roomNumber || 'Suite';
      await supabase.from('chat_messages').insert({
        booking_id: checkedInBooking.id,
        sender_id: chatSenderId,
        sender_name: effectiveProfile.full_name || 'Guest',
        sender_role: 'guest',
        message: `🚪 Checkout Request: I would like to request checking out of Suite ${roomLabel}. Please prepare my outstanding bill.`
      });

      setAlertState({ 
        title: 'Checkout Requested', 
        message: 'Front desk has been notified. We have opened the live chat thread so you can discuss your checkout and bill directly with the reception.' 
      });
      setActiveTab('chat');
    } catch (err: any) {
      setAlertState({ title: 'Request Failed', message: err.message });
    } finally {
      setCheckoutRequesting(false);
    }
  };

  const handleGenerateSharingCode = async () => {
    if (!checkedInBooking) return;
    setGeneratingCode(true);
    try {
      const code = Math.floor(10000 + Math.random() * 90000).toString();
      const { error } = await supabase
        .from('bookings')
        .update({ sharing_code: code })
        .eq('id', checkedInBooking.id);

      if (error) throw error;
      
      setCheckedInBooking({ ...checkedInBooking, sharing_code: code });
    } catch (err: any) {
      setAlertState({ title: 'Generation Failed', message: err.message || 'Could not generate code.' });
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleResetSharingCode = async () => {
    if (!checkedInBooking) return;
    setGeneratingCode(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ sharing_code: null })
        .eq('id', checkedInBooking.id);

      if (error) throw error;

      setCheckedInBooking({ ...checkedInBooking, sharing_code: null });
    } catch (err: any) {
      setAlertState({ title: 'Reset Failed', message: err.message || 'Could not reset code.' });
    } finally {
      setGeneratingCode(false);
    }
  };

  // Build tab list based on whether guest is checked in
  const guestTabs: { id: GuestTab; label: string; icon: any }[] = [
    { id: 'bookings', label: 'My Bookings', icon: CalendarDays },
  ];
  if (hasActiveStay) {
    guestTabs.push(
      { id: 'menu', label: 'Order Food', icon: UtensilsCrossed },
      { id: 'billing', label: 'My Bill', icon: Receipt },
      { id: 'chat', label: 'Chat Front Desk', icon: MessageSquareText },
      { id: 'extend_stay', label: 'Extend Stay', icon: Clock },
      { id: 'feedback', label: 'Feedback', icon: Star },
    );
  }
  if (!isLocalAccess) {
    guestTabs.push({ id: 'profile', label: 'My Profile', icon: User });
  }

  const unreadChatCount = checkedInBooking ? chatMessages.filter(m => m.sender_role === 'staff' && !m.seen_at).length : 0;
  const pendingCallCount = staffCalls.filter(c => c.status === 'pending').length;

  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);
  const codeRef = useRef('');

  if (deviceLocked) {
    return (
      <div className="min-h-screen bg-surface-0 text-surface-800 font-sans tracking-tight flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[300px]"
        >
          <div className="text-center">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.06 }}
              className="w-14 h-14 mx-auto mb-5 rounded-full bg-surface-100 flex items-center justify-center"
            >
              <DoorOpen className="w-6 h-6 text-surface-500" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: 0.12 }}
            >
              <h2 className="text-lg font-semibold tracking-tight mb-1">
                Enter Passcode
              </h2>
              <p className="text-[13px] text-surface-400 leading-relaxed mb-8">
                Enter the 5-digit code from the main device
              </p>
            </motion.div>

            <motion.form
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: 0.18 }}
              onSubmit={async (e) => {
                e.preventDefault();
                const code = codeRef.current;
                if (code.length < 5) return;
                setSharingError('');
                setSharingVerifying(true);
                try {
                  const targetBookingId = bookingUid || lockedBooking?.id;
                  if (!targetBookingId) {
                    setSharingError('Unable to identify booking context.');
                    return;
                  }
                  const { data: bData } = await supabase
                    .from('bookings')
                    .select('*')
                    .eq('id', targetBookingId)
                    .maybeSingle();

                  if (bData && bData.sharing_code && bData.sharing_code.toUpperCase() === code.trim().toUpperCase()) {
                    const localKey = `guest_device_token_${bData.id}`;
                    localStorage.setItem(localKey, bData.device_token);
                    setDeviceLocked(false);
                    setLockedBooking(null);
                    codeRef.current = '';
                    setInputSharingCode('');
                    await loadGuestData();
                  } else {
                    setSharingError('Invalid code');
                    codeRef.current = '';
                    setInputSharingCode('');
                    setShaking(true);
                    setShakeKey((k) => k + 1);
                    setTimeout(() => setShaking(false), 500);
                    digitRefs.current[0]?.focus();
                  }
                } catch (err: any) {
                  setSharingError('Verification failed');
                  codeRef.current = '';
                  setInputSharingCode('');
                  setShaking(true);
                  setShakeKey((k) => k + 1);
                  setTimeout(() => setShaking(false), 500);
                  digitRefs.current[0]?.focus();
                } finally {
                  setSharingVerifying(false);
                }
              }}
            >
              <div
                key={shakeKey}
                className={`flex gap-3 justify-center mb-6 ${shaking ? 'animate-shake' : ''}`}
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <input
                    key={i}
                    ref={(el) => { digitRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={inputSharingCode[i] || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      const parts = codeRef.current.split('');
                      parts[i] = val;
                      const newCode = parts.join('').slice(0, 5);
                      codeRef.current = newCode;
                      setInputSharingCode(newCode);
                      setSharingError('');
                      if (val && i < 4) {
                        digitRefs.current[i + 1]?.focus();
                      }
                      if (newCode.length === 5 && !sharingVerifying) {
                        const form = (e.target as HTMLElement).closest('form');
                        form?.requestSubmit();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !inputSharingCode[i] && i > 0) {
                        digitRefs.current[i - 1]?.focus();
                      }
                      if (e.key === 'ArrowLeft' && i > 0) {
                        digitRefs.current[i - 1]?.focus();
                      }
                      if (e.key === 'ArrowRight' && i < 4) {
                        digitRefs.current[i + 1]?.focus();
                      }
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 5);
                      if (pasted) {
                        codeRef.current = pasted;
                        setInputSharingCode(pasted);
                        setSharingError('');
                        const nextIdx = Math.min(pasted.length, 4);
                        digitRefs.current[pasted.length >= 5 ? 4 : nextIdx]?.focus();
                        if (pasted.length === 5 && !sharingVerifying) {
                          const form = (e.target as HTMLElement).closest('form');
                          setTimeout(() => form?.requestSubmit(), 50);
                        }
                      }
                    }}
                    className={`w-11 h-11 rounded-full text-center text-lg font-semibold font-mono outline-none transition-all duration-150 ${inputSharingCode[i] ? 'bg-brand-500 text-white' : 'bg-surface-100 text-transparent'} ${shaking ? 'ring-2 ring-rose-400/60 bg-rose-100' : 'ring-1 ring-surface-300 focus:ring-2 focus:ring-brand-400'}`}
                  />
                ))}
              </div>
              {sharingVerifying && (
                <div className="flex items-center justify-center gap-2 text-sm text-surface-500 mb-6">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </div>
              )}
              {sharingError && !sharingVerifying && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-rose-500 font-medium text-center mb-6"
                >
                  {sharingError}
                </motion.p>
              )}
            </motion.form>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              className="text-[13px] text-surface-400"
            >
              Need help? Ask the device holder or visit the Front Desk.
            </motion.p>
          </div>
        </motion.div>
      </div>
    );
  }

  return loading ? (
    <div className="min-h-screen bg-gradient-to-br from-surface-50 via-white to-brand-50/30 text-surface-800 font-sans tracking-tight flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--color-brand-100/0.3)_0%,_transparent_60%)] pointer-events-none" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative text-center"
      >
        {settings.brand.logoUrl ? (
          <motion.img
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            src={settings.brand.logoUrl}
            alt={settings.brand.hotelName}
            className="h-14 mx-auto mb-5"
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/20"
          >
            <span className="text-white font-bold text-xl font-mono">{(settings.brand.hotelName || 'GH').charAt(0)}</span>
          </motion.div>
        )}
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="text-lg font-display font-bold text-surface-900 mb-6"
        >
          {settings.brand.hotelName || 'Grand Hotel'}
        </motion.h1>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="flex items-center justify-center gap-2 text-surface-400"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs font-mono">Preparing your stay...</span>
        </motion.div>
      </motion.div>
    </div>
  ) : (
    <div className="min-h-screen bg-surface-50 text-surface-800 font-sans tracking-tight flex flex-col">

      <div className="flex-1">
        <header className="sticky top-0 bg-white/95 backdrop-blur-md z-40 border-b border-surface-100 shadow-sm">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0" onClick={() => { if (!isLocalAccess) onNavigate('login'); }}>
              {settings.brand.logoUrl ? (
                <img src={settings.brand.logoUrl} alt={settings.brand.hotelName} className="h-8 sm:h-9 w-auto" />
              ) : (
                <span className="p-1.5 sm:p-2 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white rounded-lg font-bold text-sm sm:text-base font-mono">{(settings.brand.hotelName || 'GH').charAt(0)}</span>
              )}
              <div className="min-w-0">
                <span className="text-sm sm:text-base font-semibold tracking-tight text-surface-900 font-sans truncate block">{isLocalAccess ? `Suite #${roomNumber || '—'}` : 'Guest Portal'}</span>
                <span className="text-[8px] sm:text-[9px] block font-mono text-emerald-600 tracking-wider font-bold uppercase -mt-0.5 truncate">
                  {isLocalAccess ? 'Local Network Access' : `Welcome, ${effectiveProfile.full_name?.split(' ')[0] || 'Guest'}`}
                </span>
              </div>
              {hasActiveStay && (
                <span className="hidden sm:flex ml-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-[8px] font-bold tracking-wider items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  Checked In
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              {!isLocalAccess && (
                <button 
                  onClick={() => onNavigate('login')}
                  className="p-2 sm:px-3 sm:py-1.5 border border-surface-200 text-surface-600 hover:text-surface-900 hover:bg-surface-50 font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Home className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Book a Room</span>
                </button>
              )}
              {!isLocalAccess && (
                <button 
                  onClick={onLogout}
                  className="p-2 sm:px-3 sm:py-1.5 bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100 font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <LogOut className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Log Out</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Tab Bar with Animated Underline */}
        <div className="sticky top-14 sm:top-16 bg-white border-b border-surface-100 z-30 shadow-sm">
          <div className="max-w-7xl mx-auto px-2 sm:px-6 flex gap-0 text-[10px] sm:text-xs font-semibold overflow-x-auto scrollbar-none">
            {guestTabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              const count = tab.id === 'chat' ? unreadChatCount : 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2.5 sm:py-3 cursor-pointer transition-colors whitespace-nowrap border-b-2 flex-shrink-0 ${
                    isActive
                      ? 'text-emerald-700 border-emerald-600'
                      : 'text-surface-400 border-transparent hover:text-surface-700 hover:border-surface-300'
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden xs:inline sm:inline">{tab.label}</span>
                  {count > 0 && (
                    <span className="px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold rounded-full bg-emerald-100 text-emerald-700 leading-none">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          {isLocalAccess && !checkedInBooking ? (
            <div className="max-w-md mx-auto text-center py-16">
              <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-amber-100">
                <Building className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className="text-lg font-bold text-surface-900 tracking-tight mb-2">
                {roomNumber ? 'Room Not Occupied' : 'Stay No Longer Active'}
              </h2>
              <p className="text-xs text-surface-500 leading-relaxed max-w-xs mx-auto">
                {roomNumber
                  ? `Suite #${roomNumber} is not currently occupied. Please check in at the front desk first.`
                  : 'This booking is no longer active. Please see the front desk for assistance.'}
              </p>
            </div>
          ) : (
            <div>
              {/* ===== BOOKINGS TAB ===== */}
              {activeTab === 'bookings' && (
                <div className="space-y-6">
                  {hasActiveStay && (
                    <>
                    <div className="bg-gradient-to-br from-emerald-50 via-white to-teal-50/60 border-2 border-emerald-200/80 rounded-2xl p-4 sm:p-6 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100/30 rounded-full -mr-10 -mt-10 blur-2xl" />
                      <div className="relative">
                        <div className="flex items-start justify-between mb-4 sm:mb-5">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-emerald-100 rounded-xl flex items-center justify-center shadow-sm border border-emerald-200/60">
                              <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                            </div>
                            <div>
                              <h3 className="text-sm sm:text-base font-bold text-surface-900">You're staying with us!</h3>
                              <p className="text-[10px] sm:text-xs text-surface-500">Suite {checkedInBooking?.rooms?.room_number} — {checkedInBooking?.rooms?.type}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-emerald-600 text-white text-[9px] sm:text-[10px] font-bold uppercase tracking-wider rounded-full shadow-sm">
                              Checked In
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-5">
                          <div className="flex items-center gap-2 px-2.5 sm:px-3.5 py-2.5 sm:py-3 bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-100/80 shadow-sm">
                            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[8px] sm:text-[9px] text-surface-400 font-bold uppercase tracking-wider">Check-In</p>
                              <p className="text-[10px] sm:text-xs font-semibold text-surface-800 truncate">{checkedInBooking?.check_in_date}</p>
                              <p className="text-[9px] sm:text-[10px] text-emerald-600 font-bold">{checkedInBooking?.check_in_time}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 px-2.5 sm:px-3.5 py-2.5 sm:py-3 bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-100/80 shadow-sm">
                            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[8px] sm:text-[9px] text-surface-400 font-bold uppercase tracking-wider">Check-Out</p>
                              <p className="text-[10px] sm:text-xs font-semibold text-surface-800 truncate">{checkedInBooking?.check_out_date}</p>
                              <p className="text-[9px] sm:text-[10px] text-emerald-600 font-bold">{checkedInBooking?.check_out_time}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 px-2.5 sm:px-3.5 py-2.5 sm:py-3 bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-100/80 shadow-sm">
                            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[8px] sm:text-[9px] text-surface-400 font-bold uppercase tracking-wider">Stay Duration</p>
                              <p className="text-[10px] sm:text-xs font-bold text-amber-700 font-mono">{liveStayDuration || '—'}</p>
                              <p className="text-[8px] sm:text-[9px] text-surface-400">and counting</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 px-2.5 sm:px-3.5 py-2.5 sm:py-3 bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-100/80 shadow-sm">
                            <UtensilsCrossed className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[8px] sm:text-[9px] text-surface-400 font-bold uppercase tracking-wider">Orders</p>
                              <p className="text-[10px] sm:text-xs font-semibold text-surface-800">{guestOrders.filter(o => o.status !== 'cancelled').length} placed</p>
                              <p className="text-[9px] sm:text-[10px] text-emerald-600 font-bold">{settings.currencySymbol}{guestOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total_price), 0).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                          <button onClick={() => setActiveTab('menu')} className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] sm:text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all shadow-sm hover:shadow-md hover:shadow-emerald-600/20">
                            <UtensilsCrossed className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Order Food
                          </button>
                          <button onClick={() => setActiveTab('chat')} className="px-3 sm:px-4 py-2 bg-white hover:bg-surface-50 border border-emerald-200 text-emerald-700 rounded-lg text-[10px] sm:text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all">
                            <MessageSquareText className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Chat Desk
                          </button>
                          <button onClick={() => setActiveTab('extend_stay')} className="px-3 sm:px-4 py-2 bg-white hover:bg-surface-50 border border-emerald-200 text-emerald-700 rounded-lg text-[10px] sm:text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all">
                            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Extend Stay
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-surface-50 pb-3">
                        <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                          Companion Access Sharing
                        </h3>
                        <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[9px] font-bold uppercase rounded-md tracking-wider">
                          Secure Key Lock
                        </span>
                      </div>
                      
                      {checkedInBooking?.sharing_code ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
                          <div className="space-y-3">
                            <p className="text-xs text-surface-500 leading-relaxed">
                              This guest portal has a security one-device lock active. Share access with your companions (e.g., spouse or family) using this 5-digit authorization code or let them scan the QR code to log in instantly.
                            </p>
                            <div className="bg-indigo-50/50 border border-indigo-100/60 rounded-xl p-4 text-center">
                              <span className="text-[10px] text-indigo-500 uppercase font-bold tracking-wider block mb-1">Companion Security Code</span>
                              <span className="text-3xl font-extrabold tracking-widest font-mono text-indigo-700 block">
                                {checkedInBooking.sharing_code}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={handleGenerateSharingCode}
                                disabled={generatingCode}
                                className="flex-1 py-1.5 border border-surface-200 hover:border-surface-300 text-surface-700 font-semibold rounded-lg text-xs cursor-pointer flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                              >
                                <RefreshCw className="w-3.5 h-3.5" /> New Code
                              </button>
                              <button 
                                onClick={handleResetSharingCode}
                                disabled={generatingCode}
                                className="py-1.5 px-3 border border-rose-200 hover:bg-rose-50 text-rose-600 font-semibold rounded-lg text-xs cursor-pointer flex items-center justify-center transition-colors disabled:opacity-50"
                                title="Revoke access code"
                              >
                                Revoke
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-col items-center justify-center p-4 bg-surface-50 rounded-2xl border border-surface-100/60 shadow-inner">
                            <div className="bg-white p-3 rounded-xl shadow-sm border border-surface-100">
                              <QRCodeSVG 
                                value={`${window.location.origin}/guest-access/${checkedInBooking.id}?code=${checkedInBooking.sharing_code}`} 
                                size={128} 
                                level="H" 
                              />
                            </div>
                            <span className="text-[10px] font-mono text-surface-500 mt-2 text-center">
                              Scan with companion phone to instantly log in
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4 space-y-3">
                          <div className="w-12 h-12 bg-surface-50 rounded-xl border border-surface-100 flex items-center justify-center mx-auto text-surface-400">
                            🔒
                          </div>
                          <div className="max-w-xs mx-auto">
                            <h4 className="text-xs font-semibold text-surface-800">No active sharing code</h4>
                            <p className="text-[11px] text-surface-400 mt-0.5 leading-relaxed">
                              Generate a temporary companion sharing code to authorize your spouse, friends, or other family devices to log into this Suite from their phones.
                            </p>
                          </div>
                          <button
                            onClick={handleGenerateSharingCode}
                            disabled={generatingCode}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs cursor-pointer inline-flex items-center gap-1.5 transition-colors shadow-sm"
                          >
                            {generatingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Companion Access Code'}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-5">
                      <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Bill Summary
                      </h3>
                      {(() => {
                        const roomCharge = Number(checkedInBooking?.total_price || 0);
                        const foodTotal = guestOrders
                          .filter(o => o.status !== 'cancelled')
                          .reduce((sum, o) => sum + Number(o.total_price), 0);
                        const grandTotal = roomCharge + foodTotal;
                        const orderCount = guestOrders.filter(o => o.status !== 'cancelled').length;
                        return (
                          <div className="space-y-0 divide-y divide-surface-100 text-xs">
                            <div className="flex justify-between items-center py-2.5">
                              <span className="text-surface-600">Suite Charge</span>
                              <span className="font-semibold text-surface-900">{settings.currencySymbol}{roomCharge.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center py-2.5">
                              <span className="text-surface-600">Food &amp; Beverages</span>
                              <span className="font-semibold text-surface-900">{settings.currencySymbol}{foodTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center py-3">
                              <span className="font-bold text-surface-800">Grand Total</span>
                              <span className="font-bold text-emerald-700 text-base">{settings.currencySymbol}{grandTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    </>
                  )}

                  <div>
                    <h2 className="text-lg font-bold text-surface-900 tracking-tight">My Reservations</h2>
                    <p className="text-xs text-surface-400 mt-0.5">View your upcoming and past stays with us.</p>
                  </div>

                  {bookings.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto shadow-sm">
                      <Calendar className="w-10 h-10 text-surface-300 mx-auto mb-4" />
                      <h3 className="text-base font-semibold text-surface-800">No bookings found</h3>
                      <p className="text-xs text-surface-400 mt-1 mb-4">You haven't made any reservations yet.</p>
                      <button 
                        onClick={() => onNavigate('login')}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-sm cursor-pointer"
                      >
                        Explore Rooms
                      </button>
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-6">
                      {bookings.map((booking) => {
                        const isActive = booking.status === 'checked-in';
                        return (
                          <div key={booking.id} className={`bg-white rounded-2xl border shadow-sm p-6 flex flex-col transition-all hover:shadow-md ${
                            isActive ? 'border-emerald-200 ring-1 ring-emerald-100/60' : 'border-surface-100'
                          }`}>
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold font-mono ${
                                  isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-100 text-surface-500'
                                }`}>
                                  {booking.rooms?.room_number?.toString().padStart(2, '0') || '—'}
                                </div>
                                <div>
                                  <h3 className="text-sm font-bold text-surface-900">{booking.rooms?.type || 'Suite'}</h3>
                                  <p className="text-[10px] text-surface-400 font-medium">{booking.rooms?.room_number ? `Suite #${booking.rooms.room_number}` : '—'}</p>
                                </div>
                              </div>
                              <span className={`px-2 py-0.5 text-[9px] tracking-wider uppercase font-bold rounded-full ${
                                booking.status === 'checked-in'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : booking.status === 'completed'
                                  ? 'bg-surface-100 text-surface-500 border border-surface-200'
                                  : booking.status === 'cancelled'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                  : 'bg-amber-50 text-amber-700 border border-amber-100'
                              }`}>
                                {booking.status === 'checked-in' ? 'Active' : booking.status}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3 py-3 border-y border-surface-50 mb-4">
                              <div>
                                <p className="text-[9px] text-surface-400 font-bold uppercase tracking-wider mb-1">Check-In</p>
                                <p className="text-xs font-semibold text-surface-800">{booking.check_in_date}</p>
                                <p className="text-[9px] text-emerald-700 font-bold mt-0.5">{booking.check_in_time}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] text-surface-400 font-bold uppercase tracking-wider mb-1">Check-Out</p>
                                <p className="text-xs font-semibold text-surface-800">{booking.check_out_date}</p>
                                <p className="text-[9px] text-emerald-700 font-bold mt-0.5">{booking.check_out_time}</p>
                              </div>
                            </div>

                            <div className="mt-auto flex items-center justify-between">
                              <div className="flex items-baseline gap-1">
                                <span className="text-lg font-bold text-surface-900">{settings.currencySymbol}{Number(booking.total_price).toFixed(2)}</span>
                                <span className="text-[9px] text-surface-400">total</span>
                              </div>
                              <div className="flex gap-1.5">
                                {isActive && (
                                  <>
                                    <button onClick={() => setActiveTab('menu')} className="text-xs font-semibold text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100 transition-colors cursor-pointer">
                                      <UtensilsCrossed className="w-3 h-3" /> Order
                                    </button>
                                    <button onClick={() => setActiveTab('chat')} className="text-xs font-semibold text-indigo-700 hover:bg-indigo-100 flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100 transition-colors cursor-pointer">
                                      <MessageSquareText className="w-3 h-3" /> Chat Desk
                                    </button>
                                  </>
                                )}
                                {booking.status === 'pending' && (
                                  <span className="text-[10px] text-amber-600 font-medium">Awaiting confirmation</span>
                                )}
                                {booking.status === 'completed' && (
                                  <span className="text-[10px] text-surface-400">Stay completed</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ===== MENU ORDERING TAB ===== */}
              {activeTab === 'menu' && hasActiveStay && (
                <div className="space-y-6">
                  {/* Dining Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-surface-900 tracking-tight">Suite Dining & Room Service</h2>
                      <p className="text-xs text-surface-400 mt-0.5">Order chef-curated food and track your dining expenses directly.</p>
                    </div>
                    {cart.length > 0 && (
                      <span className="self-start px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-xs font-bold animate-pulse">
                        🛒 {cart.length} item{cart.length > 1 ? 's' : ''} in cart
                      </span>
                    )}
                  </div>

                  {/* Dining Cabinet Subtabs */}
                  <div className="flex bg-surface-100/80 rounded-xl p-1 max-w-xs sm:max-w-sm">
                    <button
                      type="button"
                      onClick={() => setDiningSubTab('menu')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        diningSubTab === 'menu'
                          ? 'bg-white text-emerald-700 shadow-sm border border-emerald-100/60'
                          : 'text-surface-500 hover:text-surface-700'
                      }`}
                    >
                      <UtensilsCrossed className="w-3.5 h-3.5" /> Order Menu
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiningSubTab('history')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all relative cursor-pointer ${
                        diningSubTab === 'history'
                          ? 'bg-white text-emerald-700 shadow-sm border border-emerald-100/60'
                          : 'text-surface-500 hover:text-surface-700'
                      }`}
                    >
                      <ShoppingCart className="w-3.5 h-3.5" /> My Orders
                      {guestOrders.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 bg-emerald-600 text-white text-[8px] font-bold rounded-full leading-none">
                          {guestOrders.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {diningSubTab === 'menu' ? (
                    <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
                      <div className="lg:col-span-2 space-y-6">
                        {menuCategories.map(cat => {
                          const items = menuItems.filter(i => i.category_id === cat.id);
                          if (items.length === 0) return null;
                          return (
                            <div key={cat.id} className="bg-white rounded-xl border border-surface-100 shadow-sm overflow-hidden">
                              <div className="px-5 py-3 bg-surface-50/80 border-b border-surface-100 flex items-center justify-between">
                                <h3 className="text-sm font-bold text-surface-900">{cat.name}</h3>
                                <span className="text-[10px] text-surface-400 font-medium">{items.length} item{items.length > 1 ? 's' : ''}</span>
                              </div>
                              <div className="divide-y divide-surface-50">
                                {items.map(item => (
                                  <div key={item.id} className="px-5 py-3 flex items-center gap-4 hover:bg-surface-50/50 transition-colors">
                                    {item.image_url ? (
                                      <img src={item.image_url} alt={item.name} className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover border border-surface-200 flex-shrink-0" />
                                    ) : (
                                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-surface-50 to-surface-100 flex items-center justify-center text-surface-400 flex-shrink-0 border border-surface-200">
                                        <UtensilsCrossed className="w-5 h-5 sm:w-6 sm:h-6" />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between">
                                        <p className="text-xs sm:text-sm font-semibold text-surface-900 truncate">{item.name}</p>
                                        <p className="text-[10px] sm:text-xs font-bold text-emerald-600 ml-2 whitespace-nowrap">{settings.currencySymbol}{Number(item.price).toFixed(2)}</p>
                                      </div>
                                      {item.description && <p className="text-[10px] sm:text-[11px] text-surface-400 mt-0.5 leading-relaxed">{item.description}</p>}
                                    </div>
                                    <div className="flex items-center gap-1 sm:gap-2 ml-1 sm:ml-2">
                                      <span className="text-[9px] sm:text-[10px] font-medium hidden sm:inline text-surface-400">
                                        {Number(item.stock_quantity)} left
                                      </span>
                                      <button
                                        onClick={() => addToCart(item)}
                                        disabled={Number(item.stock_quantity) <= 0}
                                        className="p-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-surface-200 text-white rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="space-y-4">
                        <div className="bg-white rounded-xl border border-surface-100 shadow-sm p-4 sm:p-5">
                          <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider flex items-center gap-1.5 mb-4">
                            <ShoppingCart className="w-4 h-4 text-emerald-600" /> Your Cart
                          </h3>
                          {cart.length === 0 ? (
                            <div className="text-center py-8">
                              <ShoppingCart className="w-8 h-8 text-surface-200 mx-auto mb-2" />
                              <p className="text-xs text-surface-400">Your cart is empty.</p>
                              <p className="text-[10px] text-surface-300 mt-0.5">Browse and add items from the menu.</p>
                            </div>
                          ) : (
                            <div className="space-y-1 mb-4">
                              {cart.map(entry => (
                                <div key={entry.item.id} className="flex items-center justify-between py-2 border-b border-surface-50 last:border-0">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-surface-800 truncate">{entry.item.name}</p>
                                    <p className="text-[10px] text-surface-400">{settings.currencySymbol}{Number(entry.item.price).toFixed(2)} each</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 ml-2">
                                    <button onClick={() => removeFromCart(entry.item.id)} className="p-0.5 bg-surface-100 hover:bg-surface-200 rounded cursor-pointer transition-colors">
                                      <Minus className="w-3 h-3 text-surface-600" />
                                    </button>
                                    <span className="text-xs font-bold text-surface-900 w-5 text-center tabular-nums">{entry.qty}</span>
                                    <button onClick={() => addToCart(entry.item)} disabled={entry.qty >= Number(entry.item.stock_quantity)} className="p-0.5 bg-surface-100 hover:bg-surface-200 rounded cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                      <Plus className="w-3 h-3 text-surface-600" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {cart.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex justify-between font-bold text-sm text-surface-900 border-t border-surface-100 pt-2">
                                <span>Total</span>
                                <span className="text-emerald-700">{settings.currencySymbol}{cartTotal.toFixed(2)}</span>
                              </div>
                              <button
                                onClick={() => {
                                  setSecurityCodeInput('');
                                  setSecurityCodeError('');
                                  setShowSecurityModal(true);
                                }}
                                disabled={orderLoading}
                                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-surface-300 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all shadow-sm hover:shadow-md"
                              >
                                {orderLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                <span>{orderLoading ? 'Placing Order...' : `Place Order (${cart.length} items)`}</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {guestOrders.length > 0 && (
                          <div className="bg-white rounded-xl border border-surface-100 shadow-sm p-4 sm:p-5">
                            <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                              <UtensilsCrossed className="w-3.5 h-3.5 text-emerald-600" /> Recent Activity
                            </h3>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {guestOrders.slice(0, 5).map(order => (
                                <div key={order.id} className="flex items-center justify-between py-1.5 border-b border-surface-50 last:border-0 text-xs">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-surface-800 truncate text-[11px]">{order.inventory_items?.name} x{order.quantity}</p>
                                    <p className="text-[9px] text-surface-400">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                  </div>
                                  <span className={`px-1.5 py-0.5 text-[8px] font-bold uppercase rounded-full ml-2 whitespace-nowrap ${
                                    order.status === 'served' ? 'bg-emerald-50 text-emerald-700' :
                                    order.status === 'preparing' ? 'bg-blue-50 text-blue-700' :
                                    order.status === 'cancelled' ? 'bg-rose-50 text-rose-700' :
                                    'bg-amber-50 text-amber-700'
                                  }`}>
                                    {order.status}
                                  </span>
                                </div>
                              ))}
                              <button
                                onClick={() => setDiningSubTab('history')}
                                className="w-full text-center text-[10px] text-emerald-600 font-bold hover:underline py-1 mt-1 block"
                              >
                                View Detailed Order History →
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {guestOrders.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-surface-200 p-12 text-center max-w-xl mx-auto">
                          <ShoppingCart className="w-10 h-10 text-surface-300 mx-auto mb-3 animate-bounce" />
                          <h3 className="text-sm font-semibold text-surface-700">No Stay Orders Yet</h3>
                          <p className="text-xs text-surface-400 mt-1 max-w-xs mx-auto">Browse our room service menu and order fresh food and beverages anytime.</p>
                          <button
                            onClick={() => setDiningSubTab('menu')}
                            className="mt-5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm hover:shadow-md transition-all animate-pulse"
                          >
                            Explore Menu
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3 max-w-3xl">
                          {guestOrders.map((order) => {
                            const statusColor: Record<string, string> = { 
                              pending: 'bg-amber-50 text-amber-700 border-amber-100', 
                              preparing: 'bg-blue-50 text-blue-700 border-blue-100', 
                              served: 'bg-emerald-50 text-emerald-700 border-emerald-100', 
                              cancelled: 'bg-surface-100 text-surface-500 border-surface-100' 
                            };
                            const statusIcon = { pending: '⏳', preparing: '👨‍🍳', served: '✅', cancelled: '❌' } as Record<string, string>;
                            return (
                              <div key={order.id} className="bg-white rounded-2xl border border-surface-150 p-4 shadow-sm flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="text-2xl">{statusIcon[order.status] || '📦'}</div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-surface-900 text-sm">{(order as any).inventory_items?.name || 'Dining Item'}</p>
                                    <p className="text-xs text-surface-500">x{order.quantity} · {settings.currencySymbol}{Number(order.total_price).toFixed(2)}</p>
                                    <p className="text-[10px] text-surface-400">{new Date(order.created_at).toLocaleString()}</p>
                                  </div>
                                </div>
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${statusColor[order.status] || 'bg-surface-100 text-surface-500'} flex-shrink-0`}>
                                  {order.status}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ===== CHAT FRONT DESK TAB ===== */}
              {activeTab === 'chat' && hasActiveStay && (() => {
                const roomLabel = checkedInBooking?.rooms?.room_number || roomNumber || 'N/A';
                return (
                <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden flex flex-col lg:flex-row min-h-[70vh] sm:min-h-[520px]">
                  {/* Conversation sidebar */}
                  <div className={`${chatSidebarOpen ? 'block' : 'hidden'} lg:block lg:w-72 border-b lg:border-b-0 lg:border-r border-surface-100 bg-surface-50/50 flex flex-col`}>
                    <div className="p-3 border-b border-surface-100 bg-white flex items-center justify-between">
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-surface-500">Conversations</h3>
                      <button onClick={() => setChatSidebarOpen(false)} className="p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer lg:hidden">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <div className="px-4 py-3 border-b border-surface-100 bg-white border-l-2 border-l-brand-500">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-bold text-surface-900 truncate max-w-[160px]">
                            {effectiveProfile.full_name || 'Guest'}
                          </span>
                          <span className="text-[9px] text-surface-400 whitespace-nowrap ml-2">
                            {chatMessages.length > 0
                              ? new Date(chatMessages[chatMessages.length - 1].created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
                              : ''}
                          </span>
                        </div>
                        <p className="text-[10px] text-surface-500">Suite {roomLabel}</p>
                        <div className="flex justify-between items-center mt-1">
                          <p className="text-[10px] text-surface-400 truncate max-w-[160px]">
                            {chatMessages.length > 0
                              ? chatMessages[chatMessages.length - 1].message
                              : 'No messages yet'}
                          </p>
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-surface-400">{chatMessages.length}</span>
                            {unreadChatCount > 0 && (
                              <span className="px-1 py-0.5 bg-brand-600 text-white text-[8px] font-bold rounded-full leading-none">
                                {unreadChatCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Message panel */}
                  <div className="flex-1 flex flex-col">
                    <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-surface-100 bg-white flex items-center gap-2 sm:gap-3">
                      <button onClick={() => setChatSidebarOpen(true)} className="p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer lg:hidden">
                        <MessageSquareText className="w-4 h-4" />
                      </button>
                      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-brand-50 rounded-full flex items-center justify-center flex-shrink-0">
                        <MessageSquareText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-bold text-surface-900 truncate">Front Desk</p>
                        <p className="text-[9px] sm:text-[10px] text-surface-400">Suite {roomLabel}</p>
                      </div>
                      {unreadChatCount > 0 && (
                        <span className="px-1.5 sm:px-2 py-0.5 bg-brand-50 border border-brand-200 text-brand-700 rounded-full text-[9px] sm:text-[10px] font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
                          <span className="hidden sm:inline">{unreadChatCount} new</span>
                        </span>
                      )}
                    </div>

                    {/* Stay Services Quick Bar */}
                    <div className="bg-amber-50/40 border-b border-surface-100 px-3 sm:px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="p-1 px-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 font-bold text-xs">🛎️</span>
                        <div>
                          <p className="font-bold text-surface-800">Support & Suite Assistant</p>
                          <p className="text-[10px] text-surface-400">Dispatch a host or request express checkout instantly</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCallReason('');
                            setShowCallStaffModal(true);
                          }}
                          className="px-2.5 sm:px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold cursor-pointer transition-all flex items-center gap-1 text-[10px] sm:text-[11px] shadow-sm hover:shadow-md"
                        >
                          <Bell className="w-3 h-3 text-white" /> Call Staff
                        </button>
                        <button
                          type="button"
                          onClick={callFrontDesk}
                          disabled={guestCallStatus !== 'idle'}
                          className="px-2.5 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold cursor-pointer transition-all flex items-center gap-1 text-[10px] sm:text-[11px] shadow-sm hover:shadow-md disabled:opacity-50"
                        >
                          {guestCallStatus === 'calling' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3 text-white" />}
                          {guestCallStatus === 'calling' ? 'Calling...' : guestCallStatus === 'connected' ? 'On Call' : 'Call Front Desk'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowCheckoutConfirmModal(true);
                          }}
                          disabled={checkoutRequesting}
                          className="px-2.5 sm:px-3 py-1.5 bg-white hover:bg-surface-50 border border-surface-200 text-surface-700 rounded-xl font-bold cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1 text-[10px] sm:text-[11px] shadow-sm hover:shadow-md"
                        >
                          {checkoutRequesting ? <Loader2 className="w-3 h-3 animate-spin text-surface-500" /> : <DoorOpen className="w-3 h-3 text-surface-500" />}
                          Express Checkout
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 bg-surface-50/50" style={{ maxHeight: '50vh' }}>
                      {chatMessages.length === 0 ? (
                        <div className="text-center py-12">
                          <MessageSquareText className="w-10 h-10 text-surface-200 mx-auto mb-2" />
                          <p className="text-xs text-surface-400">No messages yet.</p>
                          <p className="text-[10px] text-surface-300 mt-0.5">Say hello to the front desk team!</p>
                        </div>
                      ) : (
                        chatMessages.map((msg, idx) => {
                          const isGuest = msg.sender_role === 'guest';
                          const showAvatar = idx === 0 || chatMessages[idx - 1]?.sender_role !== msg.sender_role;
                          return (
                            <div key={msg.id} className={`flex ${isGuest ? 'justify-end' : 'justify-start'} items-end gap-2 ${showAvatar ? 'mt-4' : 'mt-0.5'}`}>
                              {!isGuest && showAvatar && (
                                <div className="w-7 h-7 rounded-full bg-brand-100 border border-brand-200 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[9px] font-bold text-brand-700">FD</span>
                                </div>
                              )}
                              {!isGuest && !showAvatar && <div className="w-7 flex-shrink-0" />}
                              <div className={`max-w-[75%] ${isGuest ? 'order-1' : 'order-2'}`}>
                                {showAvatar && (
                                  <p className={`text-[10px] font-semibold mb-1 ${isGuest ? 'text-right text-surface-400' : 'text-surface-400'}`}>
                                    {isGuest ? 'You' : msg.sender_name}
                                  </p>
                                )}
                                <div className={`rounded-2xl px-4 py-2.5 ${
                                  isGuest
                                    ? 'bg-brand-600 text-white rounded-br-md'
                                    : 'bg-white border border-surface-200 text-surface-800 rounded-bl-md shadow-sm'
                                }`}>
                                  <p className="text-sm leading-relaxed">{msg.message}</p>
                                  <p className={`text-[9px] mt-1 ${isGuest ? 'text-brand-200' : 'text-surface-400'}`}>
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                      {typingUsers.length > 0 && (
                        <div className="flex justify-start items-end gap-2">
                          <div className="w-7 h-7 rounded-full bg-brand-100 border border-brand-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-bold text-brand-700">FD</span>
                          </div>
                          <div className="bg-white border border-surface-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                            <p className="text-[10px] text-surface-400 flex items-center gap-1.5">
                              <span className="animate-pulse">typing</span>
                              <span className="inline-flex">
                                <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce mx-[1.5px]" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce mx-[1.5px]" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce mx-[1.5px]" style={{ animationDelay: '300ms' }} />
                              </span>
                            </p>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    <div className="border-t border-surface-100 p-4 bg-white">
                      <form
                        onSubmit={(e) => { e.preventDefault(); sendChatMessage(); }}
                        className="flex gap-2"
                      >
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Type your message..."
                          className="flex-1 px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-brand-500 transition-colors placeholder:text-surface-400"
                        />
                        <button
                          type="submit"
                          disabled={!chatInput.trim() || sendingChat}
                          className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-surface-200 text-white rounded-xl text-xs font-bold cursor-pointer disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                        >
                          {sendingChat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          Send
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
                );
              })()}


              {/* ===== EXTEND STAY TAB ===== */}
              {activeTab === 'extend_stay' && hasActiveStay && (
                <div className="space-y-6 max-w-2xl mx-auto">
                  <div>
                    <h2 className="text-lg font-bold text-surface-900 tracking-tight">Extend Your Stay</h2>
                    <p className="text-xs text-surface-400 mt-0.5">Request to extend your reservation beyond the original check-out date.</p>
                  </div>

                  <div className="bg-gradient-to-br from-brand-50 via-white to-amber-50/40 border border-brand-100 rounded-2xl p-4 sm:p-6 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-brand-100/20 rounded-full -mr-8 -mt-8 blur-xl" />
                    <div className="relative flex items-center gap-3 sm:gap-4">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-100 rounded-xl flex items-center justify-center border border-brand-200 shadow-sm">
                        <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-brand-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] sm:text-[10px] text-surface-500 font-bold uppercase tracking-wider">Current Check-Out</p>
                        <p className="text-base sm:text-lg font-bold text-surface-900 truncate">{checkedInBooking?.check_out_date} at {checkedInBooking?.check_out_time}</p>
                        <p className="text-[9px] sm:text-[10px] text-surface-400">You've been here {liveStayDuration || '—'} so far</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-4 sm:p-6">
                    <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-brand-600" /> Request Extension
                    </h3>
                    <div className="space-y-4">
                      <div className="flex bg-surface-100 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={() => setExtendType('day')}
                          className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                            extendType === 'day'
                              ? 'bg-white text-brand-700 shadow-sm'
                              : 'text-surface-500 hover:text-surface-700'
                          }`}
                        >
                          <Calendar className="w-3.5 h-3.5 inline mr-1" /> Per Day
                        </button>
                        <button
                          type="button"
                          onClick={() => setExtendType('hour')}
                          className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                            extendType === 'hour'
                              ? 'bg-white text-brand-700 shadow-sm'
                              : 'text-surface-500 hover:text-surface-700'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 inline mr-1" /> Per Hour
                        </button>
                      </div>

                      {extendType === 'day' ? (
                        <div>
                          <label className="block text-xs text-surface-500 font-medium mb-1.5">New Check-Out Date</label>
                          <input
                            type="date"
                            value={extendDate}
                            onChange={(e) => setExtendDate(e.target.value)}
                            min={checkedInBooking?.check_out_date || ''}
                            className="w-full bg-surface-50 border border-surface-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs text-surface-500 font-medium mb-1.5">Additional Hours</label>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setExtendHours(Math.max(1, extendHours - 1))}
                              className="p-2 bg-surface-100 hover:bg-surface-200 rounded-lg cursor-pointer transition-colors"
                            >
                              <Minus className="w-4 h-4 text-surface-600" />
                            </button>
                            <input
                              type="number"
                              value={extendHours}
                              onChange={(e) => setExtendHours(Math.max(1, parseInt(e.target.value) || 1))}
                              min={1}
                              max={24}
                              className="w-20 text-center bg-surface-50 border border-surface-200 rounded-xl px-3 py-2.5 text-sm font-bold text-surface-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => setExtendHours(Math.min(24, extendHours + 1))}
                              className="p-2 bg-surface-100 hover:bg-surface-200 rounded-lg cursor-pointer transition-colors"
                            >
                              <Plus className="w-4 h-4 text-surface-600" />
                            </button>
                            <span className="text-xs text-surface-500">hours</span>
                          </div>
                          {checkedInBooking && (
                            <p className="text-[10px] text-brand-600 mt-2 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Extended check-out: ~{(() => {
                                const timeStr = checkedInBooking.check_out_time || '12:00 PM';
                                const [time, ampm] = timeStr.split(' ');
                                let [h, m] = time.split(':').map(Number);
                                if (ampm === 'PM' && h !== 12) h += 12;
                                if (ampm === 'AM' && h === 12) h = 0;
                                const outDate = new Date(checkedInBooking.check_out_date);
                                outDate.setHours(h + extendHours, m);
                                return outDate.toLocaleDateString() + ' at ' + outDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              })()}
                            </p>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="block text-xs text-surface-500 font-medium mb-1.5">Reason (optional)</label>
                        <textarea
                          value={extendReason}
                          onChange={(e) => setExtendReason(e.target.value)}
                          placeholder="Tell us why you'd like to extend your stay..."
                          rows={3}
                          className="w-full bg-surface-50 border border-surface-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 resize-none transition-all"
                        />
                      </div>
                      <button
                        onClick={requestExtension}
                        disabled={(extendType === 'day' && !extendDate) || (extendType === 'hour' && (!extendHours || extendHours < 1)) || extending}
                        className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-surface-200 text-white rounded-xl font-semibold text-xs cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md hover:shadow-brand-600/20"
                      >
                        {extending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                        <span>{extending ? 'Requesting...' : 'Submit Extension Request'}</span>
                      </button>
                    </div>
                  </div>

                  {extensions.length > 0 && (
                    <div className="bg-white rounded-xl border border-surface-100 shadow-sm p-5">
                      <h3 className="text-xs font-bold text-surface-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-brand-500" /> Extension History
                      </h3>
                      <div className="space-y-2">
                        {extensions.map(ext => (
                          <div key={ext.id} className="flex items-center justify-between py-2 border-b border-surface-50 last:border-0">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-surface-800 truncate">Requested until {ext.requested_check_out_date}</p>
                              {ext.reason && <p className="text-[10px] text-surface-400 truncate">{ext.reason}</p>}
                              <p className="text-[10px] text-surface-400">{new Date(ext.created_at).toLocaleDateString()}</p>
                            </div>
                            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ml-2 whitespace-nowrap ${
                              ext.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                              ext.status === 'rejected' ? 'bg-rose-50 text-rose-700' :
                              'bg-amber-50 text-amber-700'
                            }`}>
                              {ext.status === 'approved' ? 'Approved' : ext.status === 'rejected' ? 'Rejected' : 'Pending'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ===== PROFILE TAB ===== */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-surface-900 tracking-tight">My Profile</h2>
                    <p className="text-xs text-surface-400 mt-0.5">Manage your personal information.</p>
                  </div>

                  <div className="max-w-lg mx-auto sm:mx-0">
                    <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50/60 border-b border-surface-100 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center">
                          <User className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-surface-900">{effectiveProfile.full_name || 'Guest'}</h3>
                          <p className="text-[10px] text-surface-400">{effectiveProfile.email}</p>
                        </div>
                      </div>
                      <form onSubmit={handleProfileSave} className="p-6 space-y-4 text-xs font-sans tracking-tight">
                        <div>
                          <label className="block text-surface-500 font-semibold mb-1.5">Full Name</label>
                          <input
                            type="text"
                            required
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="w-full bg-surface-50 border border-surface-200 rounded-lg p-3 text-surface-800 font-sans tracking-tight focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-surface-500 font-semibold mb-1.5">Email Address</label>
                          <div className="w-full bg-surface-100 border border-surface-200 rounded-lg p-3 text-surface-500 font-sans tracking-tight text-xs flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-surface-400" />
                            <span>{effectiveProfile.email || '—'}</span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-surface-500 font-semibold mb-1.5">Account Type</label>
                          <div className="w-full bg-surface-100 border border-surface-200 rounded-lg p-3 text-surface-500 text-xs flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-surface-400" />
                            <span className="capitalize">{effectiveProfile.role || 'guest'}</span>
                          </div>
                        </div>

                        {profileMsg && (
                          <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg text-xs leading-relaxed flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 flex-shrink-0" />
                            {profileMsg}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={updatingProfile}
                          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-surface-300 text-white font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm hover:shadow-md mt-2"
                        >
                          {updatingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>Save Changes</span>
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )}


              {/* MY BILL TAB */}
              {activeTab === 'billing' && hasActiveStay && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-surface-900">My Bill</h2>
                    <p className="text-xs text-surface-400 mt-0.5">Current charges and payments for your stay.</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 space-y-4">
                    <h3 className="text-sm font-bold text-surface-800 flex items-center gap-2"><Receipt className="w-4 h-4 text-amber-500" /> Charges</h3>
                    {checkedInBooking && (
                      <div className="flex justify-between text-sm py-2 border-b border-surface-100">
                        <span className="text-surface-600">Room Charge</span>
                        <span className="font-semibold">{settings.currencySymbol}{Number(checkedInBooking.total_price || 0).toLocaleString()}</span>
                      </div>
                    )}
                    {guestCharges.map((c: any) => (
                      <div key={c.id} className="flex justify-between text-sm py-2 border-b border-surface-100 last:border-0">
                        <span className="text-surface-600">{c.description}</span>
                        <span className="font-semibold">{settings.currencySymbol}{Number(c.amount).toLocaleString()}</span>
                      </div>
                    ))}
                    {guestOrders.filter(o => o.status !== 'cancelled').length > 0 && (
                      <div className="flex justify-between text-sm py-2 border-b border-surface-100">
                        <span className="text-surface-600">Food & Beverage ({guestOrders.filter(o => o.status !== 'cancelled').length} order(s))</span>
                        <span className="font-semibold">{settings.currencySymbol}{guestOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total_price), 0).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  {guestPayments.length > 0 && (
                    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 space-y-3">
                      <h3 className="text-sm font-bold text-surface-800 flex items-center gap-2"><CreditCard className="w-4 h-4 text-emerald-500" /> Payments Received</h3>
                      {guestPayments.map((p: any) => (
                        <div key={p.id} className="flex justify-between text-sm py-2 border-b border-surface-100 last:border-0">
                          <span className="text-surface-600">{p.method}{p.reference ? ` (${p.reference})` : ''}</span>
                          <span className="font-semibold text-emerald-600">-{settings.currencySymbol}{Number(p.amount).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="bg-surface-900 rounded-2xl p-5 text-white flex items-center justify-between">
                    <span className="font-bold text-sm">Estimated Balance Due</span>
                    <span className="text-xl font-black">
                      {settings.currencySymbol}{Math.max(0, (Number(checkedInBooking?.total_price || 0) + guestCharges.reduce((s: number, c: any) => s + Number(c.amount), 0) + guestOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total_price), 0)) - guestPayments.reduce((s: number, p: any) => s + Number(p.amount), 0)).toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-surface-50 border border-surface-200 rounded-2xl p-4 text-center mt-2">
                    <p className="text-xs text-surface-500">
                      Ready to check out? Go to <button type="button" onClick={() => setActiveTab('chat')} className="font-bold text-brand-600 hover:underline cursor-pointer">Chat Desk</button> to request your express checkout or summon assistance instantly.
                    </p>
                  </div>
                </div>
              )}

              {/* FEEDBACK TAB */}
              {activeTab === 'feedback' && hasActiveStay && (
                <div className="space-y-4 max-w-lg">
                  <div>
                    <h2 className="text-lg font-bold text-surface-900">Share Feedback</h2>
                    <p className="text-xs text-surface-400 mt-0.5">Rate your experience and help us improve.</p>
                  </div>
                  {feedbackSubmitted ? (
                    <div className="bg-white rounded-2xl border border-surface-200 p-12 text-center">
                      <div className="text-4xl mb-3">🙏</div>
                      <h3 className="text-sm font-bold text-surface-900">Thank you for your feedback!</h3>
                      <p className="text-xs text-surface-400 mt-1">Your review helps us serve you better.</p>
                      <button onClick={() => setFeedbackSubmitted(false)} className="mt-4 text-xs text-emerald-600 font-semibold hover:underline cursor-pointer">Submit another</button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitFeedback} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 space-y-5">
                      <div>
                        <label className="block text-xs font-semibold text-surface-600 mb-2">Overall Rating</label>
                        <div className="flex items-center gap-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button key={star} type="button" onClick={() => setFeedbackRating(star)} className="text-3xl cursor-pointer transition-transform hover:scale-110">
                              {star <= feedbackRating ? '⭐' : '☆'}
                            </button>
                          ))}
                          <span className="text-sm font-semibold text-surface-600 ml-1">{feedbackRating}/5</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-surface-600 mb-1.5">Your Comments</label>
                        <textarea required value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)} placeholder="Tell us about your stay experience..." rows={4} className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
                      </div>
                      <button type="submit" disabled={feedbackSubmitting || !feedbackComment.trim()} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
                        {feedbackSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Star className="w-4 h-4" /> Submit Feedback</>}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <footer className="bg-white border-t border-surface-100 py-4 px-6 text-center text-[10px] text-surface-400 font-mono">
        © Hotel Groups HOTEL
      </footer>

      <AlertDialog
        isOpen={!!alertState}
        title={alertState?.title || ''}
        message={alertState?.message || ''}
        onDismiss={() => setAlertState(null)}
      />

      {/* Real-time order status toast */}
      <AnimatePresence>
        {extensionToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-6 left-1/2 z-50 px-5 py-3 bg-amber-600 text-white rounded-2xl shadow-xl border border-amber-500 flex items-center gap-2.5 text-xs font-semibold"
          >
            <CalendarPlus className="w-4 h-4 flex-shrink-0" />
            <span>{extensionToast}</span>
            <button onClick={() => setExtensionToast(null)} className="p-0.5 ml-1 hover:bg-amber-500 rounded cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {orderToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-6 left-1/2 z-50 px-5 py-3 bg-emerald-600 text-white rounded-2xl shadow-xl border border-emerald-500 flex items-center gap-2.5 text-xs font-semibold"
          >
            <UtensilsCrossed className="w-4 h-4 flex-shrink-0" />
            <span>{orderToast}</span>
            <button onClick={() => setOrderToast(null)} className="p-0.5 ml-1 hover:bg-emerald-500 rounded cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Security Code Verification Dialog for Room Service Place Order */}
      <AnimatePresence>
        {showSecurityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSecurityModal(false)}
              className="fixed inset-0 bg-surface-950/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl border border-surface-200 max-w-sm w-full p-6 shadow-xl relative z-10 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
                  <span className="text-lg">🔒</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-surface-900">Secure Order Authorization</h3>
                  <p className="text-[10px] text-surface-400">Security Check before placing orders</p>
                </div>
              </div>

              <div className="space-y-2 text-xs leading-relaxed text-surface-600 bg-surface-50 p-3.5 rounded-xl border border-surface-100">
                <p>
                  To prevent unauthorized or reckless ordering by children or companions, please authenticate with either:
                </p>
                <div className="space-y-1.5 font-semibold text-surface-800">
                  <p className="flex items-center gap-1.5">
                    🚪 <span className="text-[11px]">Suite/Room Number: <strong className="text-emerald-700">{(checkedInBooking as any)?.rooms?.room_number || roomNumber || 'N/A'}</strong></span>
                  </p>
                  {checkedInBooking?.sharing_code && (
                    <p className="flex items-center gap-1.5">
                      🔑 <span className="text-[11px]">Companion Security Code: <strong className="text-brand-700">{checkedInBooking.sharing_code}</strong></span>
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider">Enter Authorization Code</label>
                <input
                  type="text"
                  placeholder="Enter Suite # or companion key..."
                  value={securityCodeInput}
                  onChange={(e) => {
                    setSecurityCodeInput(e.target.value);
                    setSecurityCodeError('');
                  }}
                  className="w-full px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-xs font-mono font-bold tracking-wider outline-none focus:border-brand-500 transition-colors placeholder:font-sans placeholder:text-surface-400 placeholder:font-normal"
                />
                {securityCodeError && (
                  <p className="text-[10px] text-rose-600 font-semibold mt-1">⚠️ {securityCodeError}</p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSecurityModal(false)}
                  className="flex-1 py-2 text-xs font-semibold hover:bg-surface-50 text-surface-605 border border-surface-200 rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setSecurityCodeError('');
                    const actualRoom = ((checkedInBooking as any)?.rooms?.room_number || roomNumber || '').toString().trim().toUpperCase();
                    const actualCode = (checkedInBooking?.sharing_code || '').toString().trim().toUpperCase();
                    const inputVal = securityCodeInput.trim().toUpperCase();

                    if (!inputVal) {
                      setSecurityCodeError('Please enter a code to authorize.');
                      return;
                    }

                    const isRoomMatch = actualRoom && inputVal === actualRoom;
                    const isCodeMatch = actualCode && inputVal === actualCode;

                    if (isRoomMatch || isCodeMatch) {
                      setShowSecurityModal(false);
                      await placeOrder();
                    } else {
                      setSecurityCodeError('Authentication failed. Check your Suite or companion key.');
                    }
                  }}
                  className="flex-1 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer transition-colors shadow-sm"
                >
                  Confirm & Order
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Express Checkout Confirmation Dialog */}
      <AnimatePresence>
        {showCheckoutConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCheckoutConfirmModal(false)}
              className="fixed inset-0 bg-surface-950/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl border border-surface-200 max-w-sm w-full p-6 shadow-xl relative z-10 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <span className="text-lg">🚪</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-surface-900">Request Express Checkout</h3>
                  <p className="text-[10px] text-surface-400">Formal Guest Departure Action</p>
                </div>
              </div>

              <div className="space-y-2 text-xs leading-relaxed text-surface-600 bg-surface-50 p-3.5 rounded-xl border border-surface-100">
                <p>
                  You are about to submit a checkout request for <strong className="text-surface-800">Suite {(checkedInBooking as any)?.rooms?.room_number || roomNumber || 'N/A'}</strong>.
                </p>
                <p>
                  This notifies the front desk instantly to prepare your final invoice statement and dispatch the housekeeping team.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCheckoutConfirmModal(false)}
                  className="flex-1 py-2 text-xs font-semibold hover:bg-surface-50 text-surface-605 border border-surface-200 rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowCheckoutConfirmModal(false);
                    await handleRequestCheckout();
                  }}
                  className="flex-1 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl cursor-pointer transition-colors shadow-sm"
                >
                  Request Checkout
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Call Staff Assistance Modal */}
      <AnimatePresence>
        {showCallStaffModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCallStaffModal(false)}
              className="fixed inset-0 bg-surface-950/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl border border-surface-200 max-w-md w-full p-6 shadow-xl relative z-10 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                  <span className="text-lg">🛎️</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-surface-900 font-sans">Request Staff Support</h3>
                  <p className="text-[10px] text-surface-400">Dispatch a hotel host to Suite {(checkedInBooking as any)?.rooms?.room_number || roomNumber || 'N/A'}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Select Quick Request Type</label>
                  <div className="flex flex-wrap gap-1.5">
                    {['Extra Towels', 'Housekeeping Request', 'Maintenance Call', 'In-Suite Amenity', 'Tech Support', 'Other'].map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCallReason(r)}
                        className={`px-2.5 py-1.5 text-[10px] sm:text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                          callReason === r
                            ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                            : 'bg-surface-50 border-surface-200 text-surface-700 hover:bg-surface-100 hover:border-surface-300'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider">Custom Assistance request / Detail</label>
                  <input
                    type="text"
                    value={callReason}
                    onChange={(e) => setCallReason(e.target.value)}
                    placeholder="E.g., Please bring 2 wine glasses..."
                    className="w-full bg-surface-50 border border-surface-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCallStaffModal(false)}
                  className="flex-1 py-2 text-xs font-semibold hover:bg-surface-50 text-surface-605 border border-surface-200 rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const finalReason = callReason.trim() || 'General Desk Assistance';
                    setShowCallStaffModal(false);
                    // Set reason on component state and trigger staff call
                    setCallReason(finalReason);
                    // Give a tiny timeout so state registers before database insert
                    setTimeout(async () => {
                      await callStaff();
                    }, 50);
                  }}
                  disabled={callingStaff}
                  className="flex-1 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xl cursor-pointer transition-colors shadow-sm disabled:bg-surface-200 disabled:cursor-not-allowed"
                >
                  {callingStaff ? 'Calling...' : 'Call Staff Now'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Audio element for remote call audio */}
      <audio ref={(el) => { if (el && guestCallServiceRef.current?.remoteStream) { el.srcObject = guestCallServiceRef.current.remoteStream; el.play().catch(() => {}); }}} autoPlay />

      {/* Call panel for guest — matches front desk style */}
      {guestCallStatus !== 'idle' && (
        <div className="fixed bottom-6 right-6 z-[200] w-72 bg-white rounded-2xl shadow-2xl border border-surface-100 overflow-hidden animate-scale-in">
          <div className="px-4 py-3 bg-brand-600 text-white flex items-center justify-between">
            <div className="flex items-center gap-2"><Phone className="w-4 h-4" /><span className="text-xs font-bold">Call</span></div>
          </div>
          <div className={`p-4 ${guestCallStatus === 'connected' ? 'bg-emerald-50' : guestCallStatus === 'ended' ? 'bg-surface-50' : 'bg-brand-50'}`}>
            <div className="text-center mb-3">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2 ${guestCallStatus === 'connected' ? 'bg-emerald-200' : guestCallStatus === 'ended' ? 'bg-surface-200' : 'bg-brand-200 animate-pulse'}`}>
                {guestCallStatus === 'calling' ? <Loader2 className="w-8 h-8 text-brand-600 animate-spin" /> : <Phone className={`w-8 h-8 ${guestCallStatus === 'connected' ? 'text-emerald-600' : 'text-surface-500'}`} />}
              </div>
              <p className="text-sm font-bold text-surface-900">Front Desk</p>
              {guestCallStatus === 'calling' && <p className="text-[10px] text-brand-600 font-semibold mt-0.5">Connecting...</p>}
              {guestCallStatus === 'ended' && <p className="text-[10px] text-surface-500 mt-0.5">Call ended</p>}
              {guestCallStatus === 'connected' && (
                <p className="text-lg font-mono font-bold text-emerald-700 mt-1">
                  {Math.floor(guestCallDuration / 60).toString().padStart(2, '0')}:{(guestCallDuration % 60).toString().padStart(2, '0')}
                </p>
              )}
            </div>
            <div className="flex justify-center gap-3">
              {guestCallStatus === 'connected' && (
                <button onClick={toggleGuestMute} className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${guestIsMuted ? 'bg-rose-100 text-rose-600' : 'bg-white text-surface-600 hover:bg-surface-50'}`}>
                  {guestIsMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
              <button onClick={guestCallStatus === 'ended' ? () => setGuestCallStatus('idle') : hangUpCall} className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${guestCallStatus === 'ended' ? 'bg-surface-100 text-surface-600 hover:bg-surface-200' : 'bg-rose-600 text-white hover:bg-rose-700'}`}>
                {guestCallStatus === 'ended' ? <X className="w-4 h-4" /> : <PhoneOff className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
