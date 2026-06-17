import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { X, UserPlus, CalendarPlus, Shield, Sparkles, Wrench, Pencil, User, CalendarClock, ShoppingCart, Receipt, CreditCard, FileText, ArrowRightLeft, DoorOpen, CheckCircle, XCircle, Users, Phone, Clock, History, Calendar, Star, Loader2, ChevronRight, ChevronLeft, Maximize2, Minimize2, Building, BedDouble, LogOut, Check, AlertTriangle, Image, GripVertical, MoreVertical, ClipboardList, DollarSign, MapPin, Printer, Eye, EyeOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Room, Booking } from '../../types';
import { QRCodeSVG } from 'qrcode.react';
import { StatusChip } from './StatusChip';
import { RoomTimeline, StayProgressBar } from './RoomTimeline';
import { STATUS_CONFIG, dt, diffHours } from './constants';

export type RoomModalAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: 'emerald' | 'blue' | 'amber' | 'rose' | 'violet' | 'slate';
  shortcut?: string;
  badge?: string;
};

interface RoomModalProps {
  room: Room;
  currencySymbol: string;
  modalBooking: Booking | null;
  currentAndUpcomingBookings: Booking[];
  roomModalLogs: any[];
  roomModalLoading: boolean;
  roomModalCharges?: any[];
  roomModalPayments?: any[];
  roomModalOrders?: any[];
  actionLoading: boolean;
  favoriteActions: string[];
  nonFavoriteActions: RoomModalAction[];
  userRole?: string;
  onClose: () => void;
  onAction: (key: string, bookingId?: string) => void;
  onToggleFavorite: (key: string) => void;
  onShowHistory: () => void;
  formatMoney: (v: number) => string;
  formatDateValue: (v?: string | null) => string;
  formatDateTimeValue: (v?: string | null) => string;
  initialSection?: string;
  onSectionChange?: (section: string) => void;
  onBookingInvoice?: (booking: Booking) => void;
}

function ActionToneBorder({ tone }: { tone: string }) {
  const map: Record<string, string> = {
    emerald: 'border-t-emerald-500',
    blue: 'border-t-blue-500',
    amber: 'border-t-amber-500',
    rose: 'border-t-rose-500',
    violet: 'border-t-violet-500',
    default: 'border-t-slate-400',
  };
  return <span className={`absolute top-0 left-2 right-2 h-[2px] rounded-full ${map[tone] || map.default}`} />;
}

function ActionIcon({ tone }: { tone: string }) {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    violet: 'bg-violet-50 text-violet-600',
    default: 'bg-surface-50 text-surface-500',
  };
  return map[tone] || map.default;
}

export function RoomModal({
  room, currencySymbol, modalBooking, currentAndUpcomingBookings, roomModalLogs, roomModalLoading,
  roomModalCharges, roomModalPayments, roomModalOrders,
  actionLoading, favoriteActions, nonFavoriteActions, userRole,
  onClose, onAction, onToggleFavorite, onShowHistory,
  formatMoney, formatDateValue, formatDateTimeValue, initialSection, onSectionChange, onBookingInvoice,
}: RoomModalProps) {
  const [activeSection, setActiveSection] = useState<string>((initialSection as any) || 'overview');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [sectionStack, setSectionStack] = useState<string[]>([initialSection || 'overview']);
  const [sharingCode, setSharingCode] = useState<string>(modalBooking?.sharing_code || '');
  const [generatingSharingCode, setGeneratingSharingCode] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [accessCodeRevealed, setAccessCodeRevealed] = useState(false);
  const [sharingCodeRevealed, setSharingCodeRevealed] = useState(false);
  const [accessCodePromptOpen, setAccessCodePromptOpen] = useState(false);
  const [accessCodePwdInput, setAccessCodePwdInput] = useState('');
  const [accessCodePwdVerifying, setAccessCodePwdVerifying] = useState(false);

  useEffect(() => {
    setSharingCode(modalBooking?.sharing_code || '');
  }, [modalBooking?.sharing_code]);

  const handleRevealAccessCode = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email) return;
    setAccessCodePromptOpen(true);
    setAccessCodePwdInput('');
  };

  const confirmRevealAccessCode = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email || !accessCodePwdInput) return;
    setAccessCodePwdVerifying(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: accessCodePwdInput,
      });
      if (error) { setAccessCodePwdVerifying(false); return; }
      // Reveal both codes on successful password
      setAccessCodeRevealed(true);
      setSharingCodeRevealed(true);
      setAccessCodePromptOpen(false);
      setAccessCodePwdInput('');
    } catch { } finally { setAccessCodePwdVerifying(false); }
  };

  const handleGenerateSharingCode = useCallback(async () => {
    if (!modalBooking) return;
    setGeneratingSharingCode(true);
    try {
      const code = Math.floor(10000 + Math.random() * 90000).toString();
      const { error } = await supabase.from('bookings').update({ sharing_code: code }).eq('id', modalBooking.id);
      if (error) throw error;
      setSharingCode(code);
    } catch { } finally { setGeneratingSharingCode(false); }
  }, [modalBooking]);

  const handleResetSharingCode = useCallback(async () => {
    if (!modalBooking) return;
    setGeneratingSharingCode(true);
    try {
      const { error } = await supabase.from('bookings').update({ sharing_code: null }).eq('id', modalBooking.id);
      if (error) throw error;
      setSharingCode('');
    } catch { } finally { setGeneratingSharingCode(false); }
  }, [modalBooking]);

  // Housekeeping checklist state mapping
  const roomType = room.type?.toLowerCase() || 'standard';
  const checklistItems = useMemo(() => {
    const listMap: Record<string, string[]> = {
      suite: [
        "Sanitize remote controls & high-touch surfaces",
        "Dust all fixtures, mirrors & display glass",
        "Replenish luxury bath essentials & plush linen",
        "Change high-thread-count bed sheets & duvet covers",
        "Vacuum premium carpet & clean floor transitions",
        "Wipe down minibar & audit beverage inventory",
        "Clean premium espresso machine & reload pods",
        "Sanitize glass shower & polish high-gloss fittings"
      ],
      deluxe: [
        "Sanitize remote controls & phone keypad",
        "Dust bedside tables, headboard & light fixtures",
        "Replenish luxury bath items & plush towels",
        "Replace deluxe linens & fluff pillows",
        "Vacuum carpet & inspect wardrobe hangers",
        "Verify refrigerator temperature & restock inventory",
        "Disinfect vanity counter & porcelain toilet",
        "Sanitize shower enclosure & polish fittings"
      ],
      standard: [
        "Sanitize door handles, TV remote & high-touch switches",
        "Dust lamp fixtures, TV frame & headboard",
        "Replenish basic guest toiletries & fresh towels",
        "Replace standard sheets & pillowcases",
        "Vacuum carpet lanes & sweep laminate transitions",
        "Sanitize toilet bowl, vanity basin & shower area",
        "Empty waste receptacles & fit fresh liners",
        "Check that lighting & TV are fully operational"
      ],
      penthouse: [
        "Clean panoramic floor-to-ceiling glass panel windows",
        "Sanitize indoor mini pool / tub and check railing safety",
        "Dust hanging chandeliers, led trays and wall moldings",
        "Change king-size Egyptian cotton sheet setups",
        "Verify home theater control panels & smart tablet response",
        "Replenish resort-brand cosmetics & premium bath towels",
        "Wipe terrace dry-bar & verify bottle racks",
        "Vacuum silk rugs & polish luxury marble floors",
        "Sanitize dual shower, jacuzzi & inspect drainage flow"
      ]
    };
    return listMap[roomType] || listMap.standard;
  }, [roomType]);

  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`hk-checked-${room.id}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleChecklistItem = (item: string) => {
    const next = { ...checkedItems, [item]: !checkedItems[item] };
    setCheckedItems(next);
    localStorage.setItem(`hk-checked-${room.id}`, JSON.stringify(next));
  };

  const isAllChecked = useMemo(() => {
    return checklistItems.every((item) => checkedItems[item]);
  }, [checklistItems, checkedItems]);

  const checkedCount = useMemo(() => {
    return checklistItems.filter((item) => checkedItems[item]).length;
  }, [checklistItems, checkedItems]);

  const resetChecklist = () => {
    setCheckedItems({});
    localStorage.removeItem(`hk-checked-${room.id}`);
  };

  const handleSectionChange = useCallback((section: string) => {
    setActiveSection(section);
    onSectionChange?.(section);
    setSectionStack(prev => {
      if (prev[prev.length - 1] === section) return prev;
      return [...prev, section];
    });
  }, [onSectionChange]);

  const handleBack = useCallback(() => {
    if (sectionStack.length > 1) {
      const nextStack = [...sectionStack];
      nextStack.pop();
      const prevSection = nextStack[nextStack.length - 1];
      setActiveSection(prevSection);
      onSectionChange?.(prevSection);
      setSectionStack(nextStack);
    }
  }, [sectionStack, onSectionChange]);
  const [liveHours, setLiveHours] = useState(0);
  const [localTasks, setLocalTasks] = useState<any[]>([]);
  const [localTasksLoading, setLocalTasksLoading] = useState(true);
  const [logPage, setLogPage] = useState(0);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const LOGS_PER_PAGE = 20;

  useEffect(() => {
    let active = true;
    setLocalTasksLoading(true);
    (async () => {
      // Query via room_id on the linked booking for accurate task association.
      // Fall back to text match if no bookings have room_id tasks.
      const { data: tasksByRoom } = await supabase
        .from('tasks')
        .select('*, bookings(room_id)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (active) {
        const filtered = (tasksByRoom || []).filter(
          (t: any) => t.bookings?.room_id === room.id ||
            String(t.title || '').toLowerCase().includes(`suite #${room.room_number}`.toLowerCase())
        );
        setLocalTasks(filtered);
        setLocalTasksLoading(false);
      }
    })();
    return () => { active = false; };
  }, [room.id, room.room_number]);
  const contentRef = useRef<HTMLDivElement>(null);

  const currentGuestBookings = useMemo(
    () => currentAndUpcomingBookings.filter((b) => b.status === 'checked-in'),
    [currentAndUpcomingBookings]
  );
  const nextReservations = useMemo(
    () => currentAndUpcomingBookings.filter((b) => b.status === 'pending' || b.status === 'confirmed'),
    [currentAndUpcomingBookings]
  );
  const latestCleaningLog = useMemo(
    () => roomModalLogs.find((log) => /clean/i.test(String(log.action || '')) || /clean/i.test(String(log.details || ''))) || null,
    [roomModalLogs]
  );

  useEffect(() => {
    if (!modalBooking?.check_in_date) return;
    const ci = new Date(dt(modalBooking.check_in_date, modalBooking.check_in_time || '00:00'));
    const update = () => setLiveHours(Math.max(0, (Date.now() - ci.getTime()) / 3600000));
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [modalBooking?.check_in_date, modalBooking?.check_in_time]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const bookingTimeline = useMemo(() => {
    if (!modalBooking) return [];
    const out = [
      { label: 'Booking created', date: modalBooking.created_at ? new Date(modalBooking.created_at).toLocaleDateString() : undefined, done: true },
      {
        label: 'Check-in', date: formatDateValue(modalBooking.check_in_date), time: modalBooking.check_in_time,
        done: modalBooking.status === 'checked-in' || modalBooking.status === 'completed', active: modalBooking.status === 'checked-in'
      },
      {
        label: 'Expected check-out', date: formatDateValue(modalBooking.check_out_date), time: modalBooking.check_out_time,
        done: modalBooking.status === 'completed'
      },
    ];
    return out;
  }, [modalBooking, formatDateValue]);

  const totalStayHours = modalBooking
    ? diffHours(modalBooking.check_in_date, modalBooking.check_in_time || '2:00 PM', modalBooking.check_out_date, modalBooking.check_out_time || '11:00 AM')
    : 0;

  const isOverstay = useMemo(() => {
    if (!modalBooking || modalBooking.status !== 'checked-in') return false;
    const coDate = modalBooking.check_out_date ? new Date(modalBooking.check_out_date + 'T' + (modalBooking.check_out_time || '11:00')) : null;
    return coDate ? coDate <= new Date() : false;
  }, [modalBooking]);

  const roomImages = useMemo(() => {
    const imgs: string[] = [];
    if (room.image_url) imgs.push(room.image_url);
    return imgs;
  }, [room.image_url]);

  const billingTotalCharges = useMemo(() => {
    const extra = (roomModalCharges || []).reduce((s: number, c: any) => s + Number(c.amount), 0);
    const roomCharge = currentAndUpcomingBookings.reduce((s: number, b: any) => s + Number(b.total_price || 0), 0);
    return extra + roomCharge;
  }, [roomModalCharges, currentAndUpcomingBookings]);
  const billingTotalPayments = useMemo(() => (roomModalPayments || []).reduce((s: number, p: any) => s + Number(p.amount), 0), [roomModalPayments]);
  const billingTotalDiscounts = useMemo(() => currentAndUpcomingBookings.reduce((s: number, b: any) => s + Number(b.discount_amount || 0), 0), [currentAndUpcomingBookings]);
  const hasPromo = useMemo(() => currentAndUpcomingBookings.some((b: any) => b.promo_code_id), [currentAndUpcomingBookings]);
  const activeHousekeepingTask = useMemo(() => {
    return localTasks.find((t: any) => t.status === 'pending' || t.status === 'in-progress') || null;
  }, [localTasks]);

  const ActionButton = useCallback(({ action }: { action: RoomModalAction }) => {
    const Icon = action.icon;
    const isBusy = actionLoading;
    const isFav = favoriteActions.includes(action.key);
    const isHousekeepingAssigned = action.key === 'assign-housekeeping' && !!activeHousekeepingTask;

    return (
      <div className="relative group/action">
        <button
          type="button"
          title={`${action.label}${action.shortcut ? ` (${action.shortcut})` : ''}`}
          onClick={() => onAction(action.key)}
          disabled={isBusy || isHousekeepingAssigned}
          className="relative w-full rounded-lg border border-surface-100 bg-white hover:border-surface-200 hover:shadow-card-hover hover:-translate-y-0.5 transition-all p-2.5 text-left disabled:opacity-50 overflow-hidden"
        >
          <ActionToneBorder tone={action.tone} />
          <div className="flex items-center gap-2.5">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ActionIcon({ tone: action.tone })}`}>
              {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-4 h-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-surface-800 leading-tight">{action.label}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isHousekeepingAssigned ? (
                  <span className="text-[7px] text-surface-400 font-medium">Assigned</span>
                ) : action.shortcut ? (
                  <kbd className="px-1 py-0.5 bg-surface-50 rounded text-[8px] font-mono text-surface-400 border border-surface-100">{action.shortcut}</kbd>
                ) : null}
                {action.badge && (
                  <span className="px-1 py-0.5 rounded-full text-[7px] font-bold bg-surface-800 text-white">{action.badge}</span>
                )}
              </div>
            </div>
            <ChevronRight className="w-3 h-3 text-surface-300 flex-shrink-0 opacity-0 group-hover/action:opacity-100 transition-opacity" />
          </div>
        </button>
        {userRole === 'admin' && (
          <button
            type="button"
            aria-label={isFav ? 'Unpin action' : 'Pin action'}
            onClick={() => onToggleFavorite(action.key)}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md border flex items-center justify-center opacity-0 group-hover/action:opacity-100 transition-all bg-white hover:bg-amber-50 border-surface-100 text-surface-400 hover:text-amber-600"
          >
            <Star className={`w-2.5 h-2.5 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>
        )}
      </div>
    );
  }, [actionLoading, favoriteActions, userRole, onAction, onToggleFavorite, activeHousekeepingTask]);

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-xs"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className={`relative w-full h-full bg-white flex flex-col overflow-hidden transition-all duration-350 sm:border sm:border-surface-200/50 ${
          isFullscreen ? 'max-w-none h-full rounded-none' : 'md:max-w-6xl md:h-[92vh] md:rounded-2xl md:shadow-2xl'
        }`}
      >
        {/* Glass header */}
        <div className="relative z-20 flex-shrink-0 bg-white/80 backdrop-blur-xl border-b border-surface-100/80">
          <div className="flex items-start justify-between p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                {sectionStack.length > 1 && (
                  <button
                    onClick={handleBack}
                    className="mr-1 inline-flex items-center justify-center w-9 h-9 rounded-xl border border-surface-200 hover:bg-surface-50 active:bg-surface-100 text-surface-600 transition-all cursor-pointer"
                    title="Go Back"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <h2 className="text-xl sm:text-2xl font-black text-surface-900 tracking-tight">
                  Suite #{room.room_number}
                </h2>
                <StatusChip status={room.status} size="md" pulse={room.status === 'booked'} />
                {modalBooking?.status === 'checked-in' && (
                  <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-[9px] font-bold text-blue-700 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-surface-400 flex-wrap">
                <span className="capitalize font-medium">{room.type}</span>
                <span className="w-1 h-1 rounded-full bg-surface-300" />
                <span>Floor {String(room.room_number || '').charAt(0) || 'N/A'}</span>
                <span className="w-1 h-1 rounded-full bg-surface-300" />
                <span>{room.max_occupancy || 1} guests max</span>
                <span className="w-1 h-1 rounded-full bg-surface-300" />
                <span className="font-semibold text-surface-600">{currencySymbol}{Number(room.price_per_hour).toLocaleString()}/hr</span>
              </div>
              {room.access_code && (
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-surface-400">
                  <span className="text-[10px] font-semibold uppercase tracking-wider">Access Code:</span>
                  {accessCodeRevealed ? (
                    <>
                      <span className="font-mono font-bold text-surface-900 tracking-widest">{room.access_code}</span>
                      <button onClick={() => setAccessCodeRevealed(false)} className="p-0.5 text-surface-400 hover:text-surface-600 cursor-pointer" title="Hide code">
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="font-mono text-surface-300 tracking-widest">•••••</span>
                      <button onClick={handleRevealAccessCode} className="p-0.5 text-surface-400 hover:text-brand-600 cursor-pointer" title="Reveal access code (requires password)">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl border border-surface-200 hover:bg-surface-50 text-surface-500 hover:text-surface-800 transition-all cursor-pointer"
                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-xl bg-surface-900 hover:bg-surface-800 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm md:font-bold"
                title="Close"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* Section tabs */}
          <div className="flex items-center gap-0.5 px-4 sm:px-5 pb-0 overflow-x-auto">
            {[
              { key: 'overview', label: 'Overview', icon: Building },
              { key: 'bookings', label: 'Bookings', icon: Calendar },
              { key: 'billing', label: 'Billing', icon: Receipt },
              { key: 'orders', label: 'Orders', icon: ShoppingCart },
              { key: 'activity', label: 'Activity', icon: History },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSection === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleSectionChange(tab.key as any)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition-all cursor-pointer ${
                    isActive
                      ? 'text-surface-900 border-brand-500 bg-white'
                      : 'text-surface-400 border-transparent hover:text-surface-600 hover:bg-surface-0'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto bg-surface-0">
          {roomModalLoading ? (
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-surface-100 animate-pulse flex-shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-36 bg-surface-100 rounded animate-pulse" />
                  <div className="h-3 w-52 bg-surface-50 rounded animate-pulse" />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-40 bg-surface-100 rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          ) : activeSection === 'overview' ? (
            <div className="p-4 sm:p-5 space-y-4">
              {/* Room Image & Info + Guest Portal Access */}
              <div className="flex items-start gap-3">
                {roomImages[0] ? (
                  <img src={roomImages[0]} alt={`Suite #${room.room_number}`} className="w-14 h-14 rounded-xl object-cover shadow-xs border border-surface-100 flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-surface-50 to-surface-100 flex items-center justify-center text-surface-300 flex-shrink-0 border border-surface-100">
                    <Building className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black text-surface-900">Suite #{room.room_number}</h3>
                    <StatusChip status={room.status} size="md" pulse={room.status === 'booked'} />
                    {modalBooking?.status === 'checked-in' && (
                      <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-[8px] font-bold text-blue-700 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" /> LIVE
                      </span>
                    )}
                    {isOverstay && (
                      <span className="px-2 py-0.5 bg-rose-50 border border-rose-300 rounded-full text-[8px] font-bold text-rose-700 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> Overstay
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-surface-400 flex-wrap">
                    <span className="capitalize font-medium">{room.type}</span>
                    <span className="w-1 h-1 rounded-full bg-surface-300" />
                    <span>Floor {String(room.room_number || '').charAt(0) || 'N/A'}</span>
                    <span className="w-1 h-1 rounded-full bg-surface-300" />
                    <span>{room.max_occupancy || 1} guests max</span>
                    <span className="w-1 h-1 rounded-full bg-surface-300" />
                    <span className="font-semibold text-surface-600">{currencySymbol}{Number(room.price_per_hour).toLocaleString()}/hr</span>
                    {latestCleaningLog && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-surface-300" />
                        <span>Cleaned: {formatDateTimeValue(latestCleaningLog.created_at)}</span>
                      </>
                    )}
                    {liveHours > 0 && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-surface-300" />
                        <span className="font-semibold text-blue-600">{liveHours.toFixed(1)}h stayed</span>
                      </>
                    )}
                  </div>
                </div>
                <button onClick={() => setQrModalOpen(true)} className="bg-white rounded-xl p-1.5 border border-surface-100 shadow-sm shrink-0 self-start cursor-pointer hover:border-violet-300 hover:shadow-md transition-all">
                  <QRCodeSVG
                    value={`${window.location.origin}/guest-access?room=${room.room_number}`}
                    size={48}
                    level="M"
                  />
                </button>
              </div>

              {modalBooking && (
                <div className="flex items-center justify-between bg-surface-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-surface-600">
                    <Shield className="w-3.5 h-3.5 text-surface-400" />
                    <span className="text-[11px]">Device Sharing Code:</span>
                    {sharingCode ? (
                      sharingCodeRevealed ? (
                        <span className="font-mono font-bold text-surface-900 tracking-[0.2em] text-sm">{sharingCode}</span>
                      ) : (
                        <span className="font-mono text-surface-300 tracking-widest text-sm">•••••</span>
                      )
                    ) : (
                      <span className="text-surface-400 text-[11px]">Not set</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {sharingCode ? (
                      <>
                        {sharingCodeRevealed ? (
                          <button onClick={() => setSharingCodeRevealed(false)} className="p-1 text-surface-400 hover:text-surface-600 cursor-pointer" title="Hide code">
                            <EyeOff className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button onClick={handleRevealAccessCode} className="p-1 text-surface-400 hover:text-brand-600 cursor-pointer" title="Reveal sharing code (requires password)">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={handleResetSharingCode} disabled={generatingSharingCode} className="text-[10px] text-rose-500 hover:text-rose-600 font-semibold cursor-pointer disabled:opacity-50 px-2 py-1 rounded-md hover:bg-rose-50 transition-colors">
                          {generatingSharingCode ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Revoke'}
                        </button>
                      </>
                    ) : (
                      <button onClick={handleGenerateSharingCode} disabled={generatingSharingCode} className="text-[10px] text-brand-600 hover:text-brand-700 font-semibold cursor-pointer disabled:opacity-50 px-2 py-1 rounded-md hover:bg-brand-50 transition-colors flex items-center gap-1">
                        {generatingSharingCode ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Generate
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Cleaning banner */}
              {room.status === 'cleaning' && activeHousekeepingTask && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl p-3.5 text-white shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold">Room being cleaned</p>
                      <p className="text-amber-100 text-[11px]">
                        A staff member is assigned
                        {activeHousekeepingTask.status === 'in-progress' ? ' — currently cleaning' : ' — pending start'}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase ${activeHousekeepingTask.status === 'in-progress' ? 'bg-white/20 text-white' : 'bg-amber-700/30 text-amber-100'}`}>
                      {activeHousekeepingTask.status === 'in-progress' ? 'In Progress' : 'Pending'}
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Housekeeping Checklist Section */}
              {room.status === 'cleaning' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm space-y-3.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                        <ClipboardList className="w-4 h-4" />
                      </span>
                      <div>
                        <h4 className="text-xs font-extrabold text-surface-800 uppercase tracking-wide">Housekeeping Checklist</h4>
                        <p className="text-[10px] text-surface-400 capitalize">{room.type} Room Protocols</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-amber-600">{checkedCount} / {checklistItems.length}</span>
                      <p className="text-[9px] text-surface-400">verified</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-surface-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-amber-500 h-1.5 transition-all duration-300" 
                      style={{ width: `${(checkedCount / checklistItems.length) * 100}%` }}
                    />
                  </div>

                  {/* Checklist lines */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 font-sans">
                    {checklistItems.map((item) => {
                      const isChecked = !!checkedItems[item];
                      return (
                        <button
                          key={item}
                          onClick={() => toggleChecklistItem(item)}
                          className={`flex items-start text-left gap-2.5 p-2 rounded-lg border transition-all cursor-pointer select-none text-[11px] ${
                            isChecked
                              ? 'bg-emerald-50/40 border-emerald-200 text-surface-700 font-medium'
                              : 'bg-surface-0 border-surface-100 text-surface-500 hover:bg-surface-50'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded mt-0.5 flex-shrink-0 flex items-center justify-center border transition-all ${
                            isChecked
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'bg-surface-0 border-surface-300 text-transparent'
                          }`}>
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                          <span className={`${isChecked ? 'line-through text-surface-400' : ''}`}>{item}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Completion widget */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-surface-100">
                    {isAllChecked ? (
                      <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-semibold animate-pulse">
                        <Sparkles className="w-4 h-4 animate-spin-slow" />
                        Pristine Status Achieved! Mark as Clean.
                      </div>
                    ) : (
                      <p className="text-[10px] text-amber-600 font-medium">Verify all items to return room to active service</p>
                    )}
                    <div className="flex gap-2">
                      <button 
                        onClick={resetChecklist} 
                        className="px-2.5 py-1 text-[10px] font-bold text-surface-400 hover:text-surface-700 hover:bg-surface-50 border border-surface-200 rounded-lg cursor-pointer"
                      >
                        Reset
                      </button>
                      <button
                        onClick={() => {
                          if (isAllChecked) {
                            resetChecklist();
                            onAction('mark-available');
                          } else {
                            if (window.confirm("Some protocol checklist items are still unverified. Returning the room to service now overrides housekeeping enforcement. Complete anyway?")) {
                              resetChecklist();
                              onAction('mark-available');
                            }
                          }
                        }}
                        className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          isAllChecked 
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm' 
                            : 'bg-surface-100 text-surface-400 hover:bg-amber-600 hover:text-white border border-surface-200'
                        }`}
                      >
                        {isAllChecked ? "Complete & Mark Active" : "Override & Mark Active"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Live guest banner */}
              {modalBooking?.status === 'checked-in' && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-4 text-white shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-base font-black">{(modalBooking as any).customers?.full_name || 'Guest'}</p>
                          <p className="text-slate-300 text-xs font-medium">Currently checked in</p>
                        </div>
                      </div>
                      <StayProgressBar
                        elapsedHours={liveHours}
                        totalHours={totalStayHours}
                        checkIn={`${formatDateValue(modalBooking.check_in_date)} ${modalBooking.check_in_time || ''}`}
                        checkOut={`${formatDateValue(modalBooking.check_out_date)} ${modalBooking.check_out_time || ''}`}
                        currencySymbol={currencySymbol}
                        ratePerHour={Number(room.price_per_hour)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button onClick={() => onAction('extend-stay')} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer text-center active:scale-95">Extend</button>
                      <button onClick={() => onAction('process-checkout')} className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-lg text-[11px] font-bold transition-all cursor-pointer text-center active:scale-95">Check Out</button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Quick Actions */}
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-surface-50 text-surface-500 flex items-center justify-center">
                      <GripVertical className="w-3.5 h-3.5" />
                    </span>
                    <h3 className="font-bold text-surface-700 text-xs">Quick Actions</h3>
                  </div>
                  <span className="text-[9px] text-surface-400 font-medium">{nonFavoriteActions.length + favoriteActions.length} available</span>
                </div>
                {favoriteActions.length > 0 && (
                  <div className="mb-2.5">
                    <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> Pinned</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                      {nonFavoriteActions
                        .filter((a) => favoriteActions.includes(a.key))
                        .concat(nonFavoriteActions.filter((a) => !favoriteActions.includes(a.key)))
                        .filter((_, i) => i < favoriteActions.length)
                        .map((action) => <ActionButton key={`fav-${action.key}`} action={action} />)}
                    </div>
                    <div className="my-2 border-t border-surface-100" />
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                  {nonFavoriteActions.slice(0, 8).map((action) => (
                    <ActionButton key={action.key} action={action} />
                  ))}
                </div>
                {nonFavoriteActions.length > 8 && (
                  <div className="mt-1.5 pt-1.5 border-t border-surface-100">
                    <button
                      onClick={() => contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' })}
                      className="w-full text-[11px] text-surface-400 font-semibold hover:text-surface-600 transition-colors flex items-center justify-center gap-1 py-1"
                    >
                      <MoreVertical className="w-2.5 h-2.5" />
                      {nonFavoriteActions.length - 8} more actions
                    </button>
                  </div>
                )}
              </div>

              {/* Guest & Reservation cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Current Guest */}
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <User className="w-3.5 h-3.5" />
                    </span>
                    <h3 className="font-bold text-surface-700 text-xs">Current Guest</h3>
                  </div>
                  {currentGuestBookings[0] ? (
                    <div className="space-y-2">
                      <p className="font-bold text-surface-900 text-sm">
                        {(currentGuestBookings[0] as any).customers?.full_name || 'Guest'}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        <div className="bg-surface-0 rounded-lg p-2">
                          <p className="text-surface-400 text-[10px]">Check In</p>
                          <p className="font-semibold text-surface-700 text-[11px] mt-0.5">
                            {formatDateValue(currentGuestBookings[0].check_in_date)} {currentGuestBookings[0].check_in_time || ''}
                          </p>
                        </div>
                        <div className="bg-surface-0 rounded-lg p-2">
                          <p className="text-surface-400 text-[10px]">Check Out</p>
                          <p className="font-semibold text-surface-700 text-[11px] mt-0.5">
                            {formatDateValue(currentGuestBookings[0].check_out_date)} {currentGuestBookings[0].check_out_time || ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1.5 border-t border-surface-100">
                        <span className="text-[11px] text-surface-500">Total Charge</span>
                        <span className="font-bold text-surface-800 text-xs">{formatMoney(Number(currentGuestBookings[0].total_price || 0))}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-2">
                        <UserPlus className="w-6 h-6 text-emerald-300" />
                      </div>
                      <p className="font-bold text-surface-600 text-xs">Vacant</p>
                      <p className="text-[11px] text-surface-400 mt-0.5">Ready for new guests</p>
                    </div>
                  )}
                </div>

                {/* Upcoming Reservation */}
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Calendar className="w-3.5 h-3.5" />
                    </span>
                    <h3 className="font-bold text-surface-700 text-xs">Upcoming</h3>
                  </div>
                  {nextReservations[0] ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-surface-900 text-xs">
                          {(nextReservations[0] as any).customers?.full_name || 'Guest'}
                        </p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border capitalize ${
                          nextReservations[0].status === 'confirmed' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-amber-600 bg-amber-50 border-amber-200'
                        }`}>
                          {nextReservations[0].status}
                        </span>
                      </div>
                      <div className="bg-surface-0 rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-surface-400">Check In</span>
                          <span className="font-semibold text-surface-700">
                            {formatDateValue(nextReservations[0].check_in_date)} {nextReservations[0].check_in_time || ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-surface-400">Check Out</span>
                          <span className="font-semibold text-surface-700">
                            {formatDateValue(nextReservations[0].check_out_date)} {nextReservations[0].check_out_time || ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-surface-400 pt-0.5">
                        <span>{nextReservations[0].customers?.email || 'No email'}</span>
                        <span className="font-semibold">{room.max_occupancy || 1} guest(s)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-2">
                        <CalendarPlus className="w-6 h-6 text-blue-300" />
                      </div>
                      <p className="font-bold text-surface-600 text-xs">No Upcoming</p>
                      <p className="text-[11px] text-surface-400 mt-0.5">No reservations scheduled</p>
                    </div>
                  )}
                </div>

              </div>

              {/* Booking Timeline */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-8 h-8 rounded-lg bg-surface-50 text-surface-500 flex items-center justify-center">
                    <Clock className="w-3.5 h-3.5" />
                  </span>
                  <h3 className="font-bold text-surface-700 text-xs">Booking Timeline</h3>
                </div>
                {bookingTimeline.length > 0 ? (
                  <RoomTimeline events={bookingTimeline} />
                ) : (
                  <p className="text-xs text-surface-400 py-4 text-center">No active booking</p>
                )}
              </div>

              {/* Section nav hints */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => handleSectionChange('billing')} className="card-hover flex items-center justify-between p-3.5 group">
                  <div className="flex items-center gap-2.5">
                    <Receipt className="w-4 h-4 text-surface-400" />
                    <span className="font-bold text-xs text-surface-600">Billing & Payments</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-surface-300 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button onClick={() => handleSectionChange('orders')} className="card-hover flex items-center justify-between p-3.5 group">
                  <div className="flex items-center gap-2.5">
                    <ShoppingCart className="w-4 h-4 text-surface-400" />
                    <span className="font-bold text-xs text-surface-600">Orders & Services</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-surface-300 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          ) : activeSection === 'billing' ? (
            <div className="p-4 sm:p-5 space-y-4">
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Receipt className="w-3.5 h-3.5" />
                  </span>
                  <h3 className="font-bold text-surface-700 text-xs">Billing & Payments</h3>
                </div>
                <div className={`grid ${billingTotalDiscounts > 0 || hasPromo ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mb-2.5`}>
                  <div className="bg-surface-0 rounded-lg p-2.5 text-center">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-surface-400">Charges</p>
                    <p className="text-xs font-bold text-amber-600 mt-0.5">{formatMoney(billingTotalCharges)}</p>
                  </div>
                  <div className="bg-surface-0 rounded-lg p-2.5 text-center">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-surface-400">Payments</p>
                    <p className="text-xs font-bold text-emerald-600 mt-0.5">{formatMoney(billingTotalPayments)}</p>
                  </div>
                  {(billingTotalDiscounts > 0 || hasPromo) && (
                    <div className="bg-surface-0 rounded-lg p-2.5 text-center">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-surface-400">Discounts</p>
                      <p className="text-xs font-bold text-blue-600 mt-0.5">-{formatMoney(billingTotalDiscounts)}</p>
                      {hasPromo && <span className="text-[7px] text-blue-500 font-semibold uppercase tracking-wider mt-0.5 block">Promo Applied</span>}
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => onAction('add-charges')} disabled={!modalBooking} className="flex-1 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-[9px] font-bold cursor-pointer disabled:opacity-40 transition-all border border-amber-100">+ Add Charge</button>
                  <button onClick={() => onAction('payment-history')} disabled={!modalBooking} className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-bold cursor-pointer disabled:opacity-40 transition-all border border-emerald-100">+ Record Payment</button>
                  <button onClick={() => onAction('create-invoice')} disabled={!modalBooking || billingTotalCharges === 0} className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[9px] font-bold cursor-pointer disabled:opacity-40 transition-all border border-blue-100">View Invoice</button>
                </div>
              </div>

              {/* Charges History */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Receipt className="w-3 h-3" />
                  </span>
                  <h3 className="font-bold text-surface-700 text-xs">Charge History</h3>
                  <span className="text-[9px] text-surface-400 font-mono">({(roomModalCharges?.length || 0) + (currentAndUpcomingBookings.filter(b => Number(b.total_price) > 0).length)})</span>
                </div>
                <div className="space-y-0.5">
                  {currentAndUpcomingBookings.filter(b => Number(b.total_price) > 0).map((b: any) => (
                    <div key={`room-${b.id}`} className="flex items-center justify-between py-1.5 border-b border-surface-50 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-surface-600 truncate">Room Charge — {(b as any).customers?.full_name || 'Guest'}</p>
                        <p className="text-[9px] text-surface-400">{formatDateValue(b.check_in_date)} {b.check_in_time || ''} → {formatDateValue(b.check_out_date)} {b.check_out_time || ''}</p>
                      </div>
                      <span className="font-semibold text-amber-600 ml-2 text-xs">{formatMoney(Number(b.total_price))}</span>
                    </div>
                  ))}
                  {(roomModalCharges || []).map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-surface-50 text-xs last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-surface-600 truncate">{c.description}</p>
                        <p className="text-[9px] text-surface-400">{formatDateTimeValue(c.created_at)}</p>
                      </div>
                      <span className="font-semibold text-amber-600 ml-2 text-xs">{formatMoney(Number(c.amount))}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payments History */}
              {(roomModalPayments || []).length > 0 && (
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <CreditCard className="w-3 h-3" />
                    </span>
                    <h3 className="font-bold text-surface-700 text-xs">Payment History</h3>
                    <span className="text-[9px] text-surface-400 font-mono">({roomModalPayments?.length || 0})</span>
                    {modalBooking && (
                      <button onClick={() => window.print()} className="ml-auto px-2 py-1 bg-surface-800 hover:bg-surface-700 text-white rounded-lg text-[9px] font-bold cursor-pointer transition-all flex items-center gap-1">
                        <Printer className="w-2.5 h-2.5" /> Print
                      </button>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {(roomModalPayments || []).map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-surface-50 text-xs last:border-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-surface-600 truncate">{p.method}{p.reference ? ` — ${p.reference}` : ''}</p>
                          <p className="text-[9px] text-surface-400">{formatDateTimeValue(p.created_at)}</p>
                        </div>
                        <span className="font-semibold text-emerald-600 ml-2 text-xs">{formatMoney(Number(p.amount))}</span>
                      </div>
                    ))}
                  </div>
                  {/* Invoice summary */}
                  {modalBooking && (
                    <div className="mt-3 pt-3 border-t border-surface-100 space-y-1.5 text-xs">
                      <div className="flex justify-between"><span className="text-surface-500">Room Charge</span><span className="font-semibold text-surface-800">{formatMoney(Number(modalBooking.total_price))}</span></div>
                      {(roomModalCharges || []).length > 0 && (roomModalCharges || []).map((c: any) => (
                        <div key={c.id} className="flex justify-between"><span className="text-surface-500">{c.description}</span><span className="font-semibold text-surface-800">{formatMoney(Number(c.amount))}</span></div>
                      ))}
                      <div className="flex justify-between"><span className="text-surface-500">Total Paid</span><span className="font-semibold text-emerald-600">-{formatMoney((roomModalPayments || []).reduce((s: number, p: any) => s + Number(p.amount), 0))}</span></div>
                      <div className="border-t border-surface-100 pt-1.5 flex justify-between">
                        <span className="font-bold text-surface-600">Balance Due</span>
                        <span className="font-bold text-surface-800">{formatMoney(Math.max(0, Number(modalBooking.total_price) + (roomModalCharges || []).reduce((s: number, c: any) => s + Number(c.amount), 0) - (roomModalPayments || []).reduce((s: number, p: any) => s + Number(p.amount), 0)))}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(roomModalCharges || []).length === 0 && (roomModalPayments || []).length === 0 && currentAndUpcomingBookings.filter(b => Number(b.total_price) > 0).length === 0 && (
                <div className="text-center py-12">
                  <Receipt className="w-10 h-10 text-surface-300 mx-auto mb-2" />
                  <h3 className="text-xs font-semibold text-surface-500">No billing records</h3>
                  <p className="text-[11px] text-surface-400 mt-0.5">Charges and payments will appear here</p>
                </div>
              )}
            </div>
          ) : activeSection === 'orders' ? (
            <div className="p-4 sm:p-5 space-y-4">
              {(roomModalOrders || []).length > 0 ? (
                <div className="space-y-1.5">
                  {(roomModalOrders || []).map((o: any) => {
                    const statusColors: Record<string, string> = { pending: 'bg-amber-50 text-amber-700', preparing: 'bg-blue-50 text-blue-700', served: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-rose-50 text-rose-500' };
                    return (
                      <div key={o.id} className="card p-3.5">
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-xs text-surface-800">{o.inventory_items?.name || 'Item'}</span>
                              <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase ${statusColors[o.status] || 'bg-surface-50 text-surface-500'}`}>{o.status}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-surface-500">
                              <span>x{o.quantity}</span>
                              <span>{formatMoney(Number(o.total_price))}</span>
                              {o.notes && <span className="text-surface-400 italic">— {o.notes}</span>}
                            </div>
                          </div>
                          <div className="text-[9px] text-surface-400 flex-shrink-0 tabular-nums">{formatDateTimeValue(o.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <ShoppingCart className="w-10 h-10 text-surface-300 mx-auto mb-2" />
                  <h3 className="text-xs font-semibold text-surface-500">No orders</h3>
                  <p className="text-[11px] text-surface-400 mt-0.5">Food and beverage orders will appear here</p>
                </div>
              )}
              <button onClick={() => onAction('add-new-order')} disabled={!modalBooking} className="btn-primary w-full">+ New Order</button>
            </div>
          ) : activeSection === 'bookings' ? (
            <div className="p-4 sm:p-5">
              {currentAndUpcomingBookings.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="w-10 h-10 text-surface-300 mx-auto mb-2" />
                  <h3 className="text-xs font-semibold text-surface-500">No bookings for this room</h3>
                  <p className="text-[11px] text-surface-400 mt-0.5">Booking history will appear here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {currentAndUpcomingBookings.map((booking) => (
                    <div key={booking.id} className="card p-3.5 card-hover">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-surface-800 text-xs">{(booking as any).customers?.full_name || 'Guest'}</span>
                            <StatusChip status={booking.status} size="sm" />
                            <span className="text-[9px] text-surface-400 font-mono">{String(booking.id).slice(0, 8)}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-surface-500">
                            <span>{formatDateValue(booking.check_in_date)} {booking.check_in_time || ''}</span>
                            <ArrowRightLeft className="w-3 h-3 text-surface-300" />
                            <span>{formatDateValue(booking.check_out_date)} {booking.check_out_time || ''}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px]">
                            <span className="font-semibold text-surface-600">{formatMoney(Number(booking.total_price || 0))}</span>
                            {booking.assigned_employee_id && (
                              <span className="text-surface-400">Assigned · {String(booking.assigned_employee_id).slice(0, 8)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {booking.status === 'completed' ? (
                            <button onClick={() => onBookingInvoice?.(booking)} className="p-1.5 rounded-lg border border-surface-200 text-blue-500 hover:bg-blue-50 transition-all cursor-pointer" title="Invoice"><Receipt className="w-3 h-3" /></button>
                          ) : (
                            <>
                              <button onClick={() => onAction('modify-reservation', booking.id)} className="p-1.5 rounded-lg border border-surface-200 text-surface-400 hover:bg-surface-0 transition-all cursor-pointer" title="Edit"><Pencil className="w-3 h-3" /></button>
                              <button onClick={() => onAction('cancel-reservation', booking.id)} className="p-1.5 rounded-lg border border-surface-200 text-rose-400 hover:bg-rose-50 transition-all cursor-pointer" title="Cancel"><XCircle className="w-3 h-3" /></button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              {roomModalLogs.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-10 h-10 text-surface-300 mx-auto mb-2" />
                  <h3 className="text-xs font-semibold text-surface-500">No activity recorded</h3>
                  <p className="text-[11px] text-surface-400 mt-0.5">Room activity logs will appear here</p>
                </div>
              ) : (() => {
                const grouped: Record<string, any[]> = {};
                for (const log of roomModalLogs) {
                  const d = new Date(log.created_at);
                  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                  if (!grouped[key]) grouped[key] = [];
                  grouped[key].push(log);
                }
                const groupKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
                const totalPages = Math.max(1, Math.ceil(groupKeys.length / LOGS_PER_PAGE));
                const safePage = Math.min(logPage, totalPages - 1);
                const pageKeys = groupKeys.slice(safePage * LOGS_PER_PAGE, (safePage + 1) * LOGS_PER_PAGE);
                const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
                const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
                const formatGroupLabel = (key: string) => {
                  if (key === todayKey) return 'Today';
                  if (key === yesterdayKey) return 'Yesterday';
                  const d = new Date(key + 'T00:00:00');
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                };
                return <>
                  <div className="space-y-1.5">
                    {pageKeys.map((dateKey) => {
                      const collapsed = collapsedDates.has(dateKey);
                      const toggle = () => setCollapsedDates(prev => {
                        const next = new Set(prev);
                        if (next.has(dateKey)) next.delete(dateKey); else next.add(dateKey);
                        return next;
                      });
                      return (
                      <div key={dateKey}>
                        <div className="sticky top-0 bg-surface-50/90 backdrop-blur-sm z-10 px-3 py-1.5 flex items-center gap-2 cursor-pointer select-none" onClick={toggle}>
                          <svg className={`w-2.5 h-2.5 text-surface-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400">{formatGroupLabel(dateKey)}</p>
                          <span className="text-[9px] text-surface-300 ml-auto">{grouped[dateKey].length} log{grouped[dateKey].length !== 1 ? 's' : ''}</span>
                        </div>
                        {!collapsed && <div className="space-y-0.5">
                          {grouped[dateKey].map((log: any) => {
                            const isPayment = /payment/i.test(String(log.action || ''));
                            const isCharge = /charge/i.test(String(log.action || ''));
                            const isCheckout = /check.?out/i.test(String(log.action || ''));
                            const viaMatch = isPayment ? String(log.details || '').match(/via\s+([^-\d]+?)(?:\s+for|$)/i) : null;
                            const paymentMethod = viaMatch?.[1]?.trim() || null;
                            const bookingIdMatch = String(log.details || '').match(/\(booking:\s*([^)]+)\)/i);
                            const logBookingId = bookingIdMatch?.[1]?.trim() || null;
                            const billable = isPayment || isCharge || isCheckout;
                            const guestName = String(log.details || '').match(/^(.*?)\s+(checked|was|paid|made|requested|extended)/i)?.[1]?.trim() || null;
                            return (
                              <div key={log.id || Math.random()} className="flex items-start gap-2.5 py-2 px-3 rounded-lg hover:bg-white transition-colors">
                                {guestName && <span className="text-[9px] font-medium text-surface-400 mt-1 flex-shrink-0 max-w-[80px] truncate" title={guestName}>{guestName}</span>}
                                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${isPayment ? 'bg-emerald-400' : isCharge ? 'bg-amber-400' : isCheckout ? 'bg-blue-400' : 'bg-surface-300'}`} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-xs font-medium text-surface-600">{log.action || 'Action'}</p>
                                    {paymentMethod && (
                                      <span className="px-1 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[8px] font-bold uppercase tracking-wider">{paymentMethod}</span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-surface-500 mt-0.5">{log.details || ''}</p>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {billable && (
                                    <button
                                      onClick={() => {
                                        const matched = logBookingId && currentAndUpcomingBookings.find((b) => b.id === logBookingId);
                                        if (matched) onBookingInvoice?.(matched);
                                        else onAction('payment-history');
                                      }}
                                      className="p-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all cursor-pointer"
                                      title="View Bill"
                                    ><Receipt className="w-3 h-3" /></button>
                                  )}
                                  <p className="text-[9px] text-surface-400 tabular-nums">{formatDateTimeValue(log.created_at)}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>}
                      </div>
                    );
                  })}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-3 pb-1">
                      <button
                        onClick={() => setLogPage(p => Math.max(0, p - 1))}
                        disabled={safePage === 0}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-surface-100 text-surface-600 hover:bg-surface-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >Prev</button>
                      <span className="text-[10px] text-surface-400 tabular-nums">{safePage + 1} / {totalPages}</span>
                      <button
                        onClick={() => setLogPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={safePage >= totalPages - 1}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-surface-100 text-surface-600 hover:bg-surface-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >Next</button>
                    </div>
                  )}
                </>;
              })()}
            </div>
          )}
        </div>

        {/* Footer bar */}
        <div className="flex-shrink-0 bg-white border-t border-surface-100 px-4 sm:px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-surface-400">
            <span className="font-semibold text-surface-500">{room.room_number}</span>
            <span className="w-1 h-1 rounded-full bg-surface-300" />
            <span className="capitalize">{room.type}</span>
            <span className="w-1 h-1 rounded-full bg-surface-300" />
            <span>{currencySymbol}{Number(room.price_per_hour).toLocaleString()}/hr</span>
          </div>
          <span className="text-[9px] text-surface-400 flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-surface-50 rounded text-[8px] font-mono border border-surface-100">Esc</kbd> to close
          </span>
        </div>
      </motion.div>

      {/* QR Code Modal */}
      <AnimatePresence>
        {qrModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setQrModalOpen(false)}
            className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-xl text-center"
            >
              <div className="bg-white rounded-xl p-3 border border-surface-100 shadow-sm inline-flex mb-4">
                <QRCodeSVG
                  value={`${window.location.origin}/guest-access?room=${room.room_number}`}
                  size={180}
                  level="M"
                />
              </div>
              <h3 className="text-sm font-bold text-surface-900 mb-1">Suite #{room.room_number}</h3>
              <p className="text-[11px] text-surface-500 mb-3 break-all">
                {window.location.origin}/guest-access?room={room.room_number}
              </p>
              {modalBooking && (
                <div className="bg-surface-50 rounded-xl p-3 text-left">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-surface-400 font-medium">Device Sharing Code</span>
                    <button
                      onClick={sharingCode ? handleResetSharingCode : handleGenerateSharingCode}
                      disabled={generatingSharingCode}
                      className="text-[10px] cursor-pointer disabled:opacity-50 flex items-center gap-1"
                    >
                      {generatingSharingCode ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : sharingCode ? (
                        <span className="text-rose-500 hover:text-rose-600 font-semibold">Revoke</span>
                      ) : (
                        <span className="text-brand-600 hover:text-brand-700 font-semibold">Generate</span>
                      )}
                    </button>
                  </div>
                  {sharingCode ? (
                    <div className="flex items-center gap-2">
                      <p className="font-mono font-bold text-surface-900 text-base tracking-[0.3em]">{sharingCodeRevealed ? sharingCode : '•••••'}</p>
                      {sharingCodeRevealed ? (
                        <button onClick={() => setSharingCodeRevealed(false)} className="p-1 text-surface-400 hover:text-surface-600 cursor-pointer" title="Hide code">
                          <EyeOff className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button onClick={handleRevealAccessCode} className="p-1 text-surface-400 hover:text-brand-600 cursor-pointer" title="Reveal sharing code">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-surface-400">No code set</p>
                  )}
                </div>
              )}
              <button
                onClick={() => setQrModalOpen(false)}
                className="mt-4 w-full py-2 bg-surface-100 hover:bg-surface-200 text-surface-700 font-semibold rounded-xl text-xs cursor-pointer transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
        {accessCodePromptOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40" onClick={() => setAccessCodePromptOpen(false)}>
            <div className="bg-white rounded-xl shadow-2xl border border-surface-200 p-5 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-surface-900 mb-2">Confirm Password</h3>
              <p className="text-xs text-surface-500 mb-4">Enter your password to reveal the room access code.</p>
              <input
                type="password"
                value={accessCodePwdInput}
                onChange={e => setAccessCodePwdInput(e.target.value)}
                placeholder="Your password"
                autoFocus
                className="w-full bg-white border border-surface-200 rounded-lg py-2.5 px-3 text-xs text-surface-800 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 mb-4"
                onKeyDown={e => { if (e.key === 'Enter') confirmRevealAccessCode(); }}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setAccessCodePromptOpen(false)} className="px-3 py-1.5 border border-surface-200 text-surface-600 rounded-lg text-[10px] font-semibold cursor-pointer hover:bg-surface-50">Cancel</button>
                <button onClick={confirmRevealAccessCode} disabled={accessCodePwdVerifying || !accessCodePwdInput} className="px-3 py-1.5 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-[10px] font-semibold cursor-pointer transition-colors disabled:opacity-50 flex items-center gap-1">
                  {accessCodePwdVerifying && <Loader2 className="w-3 h-3 animate-spin" />}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
