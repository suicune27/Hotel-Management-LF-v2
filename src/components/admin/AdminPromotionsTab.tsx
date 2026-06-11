import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { PromoCode, RatePlan, WaitlistEntry, Room, Booking, Profile } from '../../types';
import type { AppSettings } from '../../lib/settings';
import type { ToastMessage } from '../Toast';
import { Tag, TrendingUp, ClipboardList, Plus, Trash2, Edit3, X, Check, Search, RefreshCw, Percent, Calendar, Clock, DollarSign, Bell } from 'lucide-react';

interface AdminPromotionsTabProps {
  promoCodes: PromoCode[];
  ratePlans: RatePlan[];
  waitlist: WaitlistEntry[];
  rooms: Room[];
  bookings: Booking[];
  userProfile: Profile | null;
  settings: AppSettings;
  addToast: (type: ToastMessage['type'], title: string, message: string) => void;
  refreshTable: (table: string) => Promise<void>;
  triggerConfirm: (title: string, message: string, onConfirm: () => Promise<void>, isDestructive?: boolean, confirmLabel?: string) => void;
  triggerAlert: (title: string, message: string) => void;
}

type SubTab = 'promocodes' | 'rateplans' | 'waitlist';

interface PromoFormData {
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_spend: number;
  max_discount: number | null;
  valid_from: string;
  valid_to: string;
  usage_limit: number | null;
  is_active: boolean;
}

interface RatePlanFormData {
  name: string;
  room_type: string;
  date_from: string;
  date_to: string;
  base_price: number;
  min_stay_hours: number;
  is_peak: boolean;
  is_active: boolean;
}

interface WaitlistFormData {
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  room_type: string;
  check_in: string;
  check_out: string;
  party_size: number;
  preferred_room_id: string | null;
  notes: string;
}

const emptyPromoForm: PromoFormData = {
  code: '',
  description: '',
  discount_type: 'percentage',
  discount_value: 0,
  min_spend: 0,
  max_discount: null,
  valid_from: '',
  valid_to: '',
  usage_limit: null,
  is_active: true,
};

const emptyRatePlanForm: RatePlanFormData = {
  name: '',
  room_type: '',
  date_from: '',
  date_to: '',
  base_price: 0,
  min_stay_hours: 3,
  is_peak: false,
  is_active: true,
};

const emptyWaitlistForm: WaitlistFormData = {
  guest_name: '',
  guest_email: '',
  guest_phone: '',
  room_type: '',
  check_in: '',
  check_out: '',
  party_size: 1,
  preferred_room_id: null,
  notes: '',
};

const ROOM_TYPES = ['Standard Room', 'Deluxe Room', 'Grand Suite', 'Presidential Penthouse'];

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  waiting: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Waiting' },
  notified: { bg: 'bg-sky-50', text: 'text-sky-700', label: 'Notified' },
  booked: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Booked' },
  expired: { bg: 'bg-surface-100', text: 'text-surface-500', label: 'Expired' },
  cancelled: { bg: 'bg-rose-50', text: 'text-rose-700', label: 'Cancelled' },
};

export default function AdminPromotionsTab({
  promoCodes,
  ratePlans,
  waitlist,
  rooms,
  bookings,
  userProfile,
  settings,
  addToast,
  refreshTable,
  triggerConfirm,
  triggerAlert,
}: AdminPromotionsTabProps) {
  const [activeTab, setActiveTab] = useState<SubTab>('promocodes');

  // Promo modal
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState<PromoCode | null>(null);
  const [promoForm, setPromoForm] = useState<PromoFormData>(emptyPromoForm);

  // Rate plan modal
  const [showRatePlanModal, setShowRatePlanModal] = useState(false);
  const [selectedRatePlan, setSelectedRatePlan] = useState<RatePlan | null>(null);
  const [ratePlanForm, setRatePlanForm] = useState<RatePlanFormData>(emptyRatePlanForm);

  // Waitlist modal
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [selectedWaitlist, setSelectedWaitlist] = useState<WaitlistEntry | null>(null);
  const [waitlistForm, setWaitlistForm] = useState<WaitlistFormData>(emptyWaitlistForm);

  const [waitlistSearch, setWaitlistSearch] = useState('');

  // ── Promo Code CRUD ──

  const handleSavePromo = async () => {
    if (!promoForm.code || !promoForm.valid_from || !promoForm.valid_to) {
      triggerAlert('Validation Error', 'Code, valid from, and valid to are required.');
      return;
    }
    try {
      if (selectedPromo) {
        const { error } = await supabase.from('promo_codes').update(promoForm).eq('id', selectedPromo.id);
        if (error) throw error;
        addToast('success', 'Updated', 'Promo code updated successfully.');
      } else {
        const { error } = await supabase.from('promo_codes').insert({ ...promoForm, used_count: 0 });
        if (error) throw error;
        addToast('success', 'Created', 'Promo code created successfully.');
      }
      setShowPromoModal(false);
      setSelectedPromo(null);
      await refreshTable('promo_codes');
    } catch (err: any) {
      triggerAlert('Error', err.message || 'Failed to save promo code');
    }
  };

  const handleDeletePromo = (promo: PromoCode) => {
    triggerConfirm('Delete Promo Code', `Permanently delete "${promo.code}"?`, async () => {
      try {
        const { error } = await supabase.from('promo_codes').delete().eq('id', promo.id);
        if (error) throw error;
        addToast('success', 'Deleted', `"${promo.code}" removed.`);
        await refreshTable('promo_codes');
      } catch (err: any) {
        triggerAlert('Error', err.message || 'Failed to delete');
      }
    }, true, 'Delete');
  };

  const handleTogglePromo = async (promo: PromoCode) => {
    try {
      const { error } = await supabase.from('promo_codes').update({ is_active: !promo.is_active }).eq('id', promo.id);
      if (error) throw error;
      addToast('success', 'Toggled', `"${promo.code}" is now ${!promo.is_active ? 'active' : 'inactive'}.`);
      await refreshTable('promo_codes');
    } catch (err: any) {
      triggerAlert('Error', err.message || 'Failed to toggle');
    }
  };

  const openPromoModal = (promo: PromoCode | null) => {
    if (promo) {
      setSelectedPromo(promo);
      setPromoForm({
        code: promo.code,
        description: promo.description,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        min_spend: promo.min_spend,
        max_discount: promo.max_discount,
        valid_from: promo.valid_from,
        valid_to: promo.valid_to,
        usage_limit: promo.usage_limit,
        is_active: promo.is_active,
      });
    } else {
      setSelectedPromo(null);
      setPromoForm(emptyPromoForm);
    }
    setShowPromoModal(true);
  };

  // ── Rate Plan CRUD ──

  const handleSaveRatePlan = async () => {
    if (!ratePlanForm.name || !ratePlanForm.room_type || !ratePlanForm.date_from || !ratePlanForm.date_to) {
      triggerAlert('Validation Error', 'Name, room type, date from, and date to are required.');
      return;
    }
    try {
      if (selectedRatePlan) {
        const { error } = await supabase.from('rate_plans').update(ratePlanForm).eq('id', selectedRatePlan.id);
        if (error) throw error;
        addToast('success', 'Updated', 'Rate plan updated successfully.');
      } else {
        const { error } = await supabase.from('rate_plans').insert(ratePlanForm);
        if (error) throw error;
        addToast('success', 'Created', 'Rate plan created successfully.');
      }
      setShowRatePlanModal(false);
      setSelectedRatePlan(null);
      await refreshTable('rate_plans');
    } catch (err: any) {
      triggerAlert('Error', err.message || 'Failed to save rate plan');
    }
  };

  const handleDeleteRatePlan = (plan: RatePlan) => {
    triggerConfirm('Delete Rate Plan', `Permanently delete "${plan.name}"?`, async () => {
      try {
        const { error } = await supabase.from('rate_plans').delete().eq('id', plan.id);
        if (error) throw error;
        addToast('success', 'Deleted', `"${plan.name}" removed.`);
        await refreshTable('rate_plans');
      } catch (err: any) {
        triggerAlert('Error', err.message || 'Failed to delete');
      }
    }, true, 'Delete');
  };

  const openRatePlanModal = (plan: RatePlan | null) => {
    if (plan) {
      setSelectedRatePlan(plan);
      setRatePlanForm({
        name: plan.name,
        room_type: plan.room_type,
        date_from: plan.date_from,
        date_to: plan.date_to,
        base_price: plan.base_price,
        min_stay_hours: plan.min_stay_hours,
        is_peak: plan.is_peak,
        is_active: plan.is_active,
      });
    } else {
      setSelectedRatePlan(null);
      setRatePlanForm(emptyRatePlanForm);
    }
    setShowRatePlanModal(true);
  };

  // ── Waitlist CRUD ──

  const handleSaveWaitlist = async () => {
    if (!waitlistForm.guest_name || !waitlistForm.room_type) {
      triggerAlert('Validation Error', 'Guest name and room type are required.');
      return;
    }
    try {
      if (selectedWaitlist) {
        const { error } = await supabase.from('waitlist').update(waitlistForm).eq('id', selectedWaitlist.id);
        if (error) throw error;
        addToast('success', 'Updated', 'Waitlist entry updated.');
      } else {
        const { error } = await supabase.from('waitlist').insert({ ...waitlistForm, status: 'waiting' });
        if (error) throw error;
        addToast('success', 'Added', 'Guest added to waitlist.');
      }
      setShowWaitlistModal(false);
      setSelectedWaitlist(null);
      await refreshTable('waitlist');
    } catch (err: any) {
      triggerAlert('Error', err.message || 'Failed to save waitlist entry');
    }
  };

  const handleDeleteWaitlist = (entry: WaitlistEntry) => {
    triggerConfirm('Remove Entry', `Remove ${entry.guest_name} from the waitlist?`, async () => {
      try {
        const { error } = await supabase.from('waitlist').delete().eq('id', entry.id);
        if (error) throw error;
        addToast('success', 'Removed', `${entry.guest_name} removed from waitlist.`);
        await refreshTable('waitlist');
      } catch (err: any) {
        triggerAlert('Error', err.message || 'Failed to delete');
      }
    }, true, 'Remove');
  };

  const handleWaitlistStatus = async (entry: WaitlistEntry, status: WaitlistEntry['status']) => {
    try {
      const { error } = await supabase.from('waitlist').update({ status }).eq('id', entry.id);
      if (error) throw error;
      addToast('success', 'Updated', `Status changed to ${status}.`);
      await refreshTable('waitlist');
    } catch (err: any) {
      triggerAlert('Error', err.message || 'Failed to update status');
    }
  };

  const openWaitlistModal = (entry: WaitlistEntry | null) => {
    if (entry) {
      setSelectedWaitlist(entry);
      setWaitlistForm({
        guest_name: entry.guest_name,
        guest_email: entry.guest_email,
        guest_phone: entry.guest_phone,
        room_type: entry.room_type,
        check_in: entry.check_in || '',
        check_out: entry.check_out || '',
        party_size: entry.party_size,
        preferred_room_id: entry.preferred_room_id,
        notes: entry.notes,
      });
    } else {
      setSelectedWaitlist(null);
      setWaitlistForm(emptyWaitlistForm);
    }
    setShowWaitlistModal(true);
  };

  const filteredWaitlist = waitlist.filter(e =>
    e.guest_name.toLowerCase().includes(waitlistSearch.toLowerCase()) ||
    e.room_type.toLowerCase().includes(waitlistSearch.toLowerCase())
  );

  const activeWaitlist = filteredWaitlist.filter(e => e.status === 'waiting' || e.status === 'notified');
  const historyWaitlist = filteredWaitlist.filter(e => e.status === 'booked' || e.status === 'expired' || e.status === 'cancelled');

  // ── Sub-tab config ──

  const subTabs: { id: SubTab; label: string; icon: any; count: number }[] = [
    { id: 'promocodes', label: 'Promo Codes', icon: Tag, count: promoCodes.length },
    { id: 'rateplans', label: 'Rate Plans', icon: TrendingUp, count: ratePlans.length },
    { id: 'waitlist', label: 'Waitlist', icon: ClipboardList, count: waitlist.filter(e => e.status === 'waiting' || e.status === 'notified').length },
  ];

  // ── Render ──

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-surface-900 tracking-tight">Promotions & Availability</h2>
        <p className="text-xs text-surface-400 mt-0.5">Manage promo codes, rate plans, and waitlist entries.</p>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1.5 p-1.5 bg-surface-100/60 rounded-2xl overflow-x-auto no-scrollbar">
        {subTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-white text-surface-900 shadow-sm border border-surface-100'
                  : 'text-surface-500 hover:text-surface-800 hover:bg-surface-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'bg-surface-200 text-surface-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── PROMO CODES ── */}
      {activeTab === 'promocodes' && (
        <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-surface-500" />
              <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Promo Codes</h3>
            </div>
            <button
              onClick={() => openPromoModal(null)}
              className="px-3 py-1.5 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add Promo Code
            </button>
          </div>
          <div className="overflow-x-auto">
            {promoCodes.length === 0 ? (
              <div className="p-12 text-center">
                <Tag className="w-10 h-10 text-surface-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-surface-700">No promo codes</p>
                <p className="text-xs text-surface-400 mt-1">Create your first promo code to start offering discounts.</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-50/80 border-b border-surface-100">
                    <th className="text-left px-4 py-2.5 font-bold text-surface-600">Code</th>
                    <th className="text-left px-4 py-2.5 font-bold text-surface-600">Description</th>
                    <th className="text-left px-4 py-2.5 font-bold text-surface-600">Discount</th>
                    <th className="text-left px-4 py-2.5 font-bold text-surface-600">Valid Dates</th>
                    <th className="text-left px-4 py-2.5 font-bold text-surface-600">Usage</th>
                    <th className="text-left px-4 py-2.5 font-bold text-surface-600">Status</th>
                    <th className="text-right px-4 py-2.5 font-bold text-surface-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {promoCodes.map(promo => (
                    <tr key={promo.id} className="hover:bg-surface-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-surface-900">{promo.code}</td>
                      <td className="px-4 py-3 text-surface-500 max-w-[200px] truncate">{promo.description || '—'}</td>
                      <td className="px-4 py-3 text-surface-700">
                        {promo.discount_type === 'percentage' ? `${promo.discount_value}%` : `${settings.currencySymbol}${promo.discount_value}`}
                        {promo.min_spend > 0 && <span className="text-[10px] text-surface-400 ml-1">min {settings.currencySymbol}{promo.min_spend}</span>}
                      </td>
                      <td className="px-4 py-3 text-surface-600 text-[10px]">
                        {promo.valid_from && promo.valid_to ? (
                          <span>{promo.valid_from} — {promo.valid_to}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-surface-600">
                        {promo.usage_limit ? `${promo.used_count || 0}/${promo.usage_limit}` : `${promo.used_count || 0}`}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleTogglePromo(promo)}
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase cursor-pointer border ${
                            promo.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-surface-100 text-surface-500 border-surface-200 hover:bg-surface-200'
                          }`}
                        >
                          {promo.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openPromoModal(promo)}
                            className="p-1.5 text-surface-400 hover:text-surface-700 hover:bg-surface-100 rounded-lg cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePromo(promo)}
                            className="p-1.5 text-surface-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── RATE PLANS ── */}
      {activeTab === 'rateplans' && (
        <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-surface-500" />
              <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Rate Plans</h3>
            </div>
            <button
              onClick={() => openRatePlanModal(null)}
              className="px-3 py-1.5 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add Rate Plan
            </button>
          </div>
          <div className="overflow-x-auto">
            {ratePlans.length === 0 ? (
              <div className="p-12 text-center">
                <TrendingUp className="w-10 h-10 text-surface-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-surface-700">No rate plans</p>
                <p className="text-xs text-surface-400 mt-1">Create rate plans for seasonal pricing and minimum stays.</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-50/80 border-b border-surface-100">
                    <th className="text-left px-4 py-2.5 font-bold text-surface-600">Name</th>
                    <th className="text-left px-4 py-2.5 font-bold text-surface-600">Room Type</th>
                    <th className="text-left px-4 py-2.5 font-bold text-surface-600">Date Range</th>
                    <th className="text-left px-4 py-2.5 font-bold text-surface-600">Base Price</th>
                    <th className="text-left px-4 py-2.5 font-bold text-surface-600">Min Stay</th>
                    <th className="text-left px-4 py-2.5 font-bold text-surface-600">Peak</th>
                    <th className="text-left px-4 py-2.5 font-bold text-surface-600">Status</th>
                    <th className="text-right px-4 py-2.5 font-bold text-surface-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {ratePlans.map(plan => (
                    <tr key={plan.id} className="hover:bg-surface-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-surface-900">{plan.name}</td>
                      <td className="px-4 py-3 text-surface-600">{plan.room_type}</td>
                      <td className="px-4 py-3 text-surface-600 text-[10px]">
                        {plan.date_from} — {plan.date_to}
                      </td>
                      <td className="px-4 py-3 font-semibold text-surface-800">
                        {settings.currencySymbol}{plan.base_price}
                      </td>
                      <td className="px-4 py-3 text-surface-600">{plan.min_stay_hours}h</td>
                      <td className="px-4 py-3">
                        {plan.is_peak ? (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[9px] font-bold uppercase rounded-full">Peak</span>
                        ) : (
                          <span className="text-surface-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${
                          plan.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-100 text-surface-500'
                        }`}>
                          {plan.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openRatePlanModal(plan)}
                            className="p-1.5 text-surface-400 hover:text-surface-700 hover:bg-surface-100 rounded-lg cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRatePlan(plan)}
                            className="p-1.5 text-surface-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── WAITLIST ── */}
      {activeTab === 'waitlist' && (
        <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-surface-500" />
              <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Waitlist</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-surface-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={waitlistSearch}
                  onChange={e => setWaitlistSearch(e.target.value)}
                  className="w-40 pl-7 pr-2 py-1.5 bg-surface-50 border border-surface-200 rounded-lg text-[10px] focus:outline-none focus:border-brand-500"
                />
              </div>
              <button
                onClick={() => openWaitlistModal(null)}
                className="px-3 py-1.5 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Entry
              </button>
            </div>
          </div>

          {waitlist.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList className="w-10 h-10 text-surface-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-surface-700">Waitlist is empty</p>
              <p className="text-xs text-surface-400 mt-1">Guests added to the waitlist will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-100">
              {/* Active entries */}
              {activeWaitlist.length > 0 && (
                <div>
                  <div className="px-5 py-2 bg-amber-50/50 border-b border-amber-100">
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Active — {activeWaitlist.length} entries</p>
                  </div>
                  {activeWaitlist.map(entry => (
                    <div key={entry.id} className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-surface-50/50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-surface-900">{entry.guest_name}</p>
                          <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${STATUS_BADGES[entry.status].bg} ${STATUS_BADGES[entry.status].text}`}>
                            {STATUS_BADGES[entry.status].label}
                          </span>
                        </div>
                        <p className="text-[10px] text-surface-500 mt-0.5">
                          {entry.room_type} · {entry.party_size} guest{entry.party_size !== 1 ? 's' : ''}
                          {entry.check_in && <span> · Check-in: {entry.check_in}</span>}
                        </p>
                        {entry.notes && <p className="text-[10px] text-surface-400 italic mt-0.5">"{entry.notes}"</p>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {entry.status === 'waiting' && (
                          <button
                            onClick={() => handleWaitlistStatus(entry, 'notified')}
                            className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[9px] font-bold cursor-pointer flex items-center gap-1"
                          >
                            <Bell className="w-3 h-3" /> Notify
                          </button>
                        )}
                        {entry.status === 'waiting' && (
                          <button
                            onClick={() => handleWaitlistStatus(entry, 'booked')}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-bold cursor-pointer flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" /> Book
                          </button>
                        )}
                        {entry.status === 'notified' && (
                          <button
                            onClick={() => handleWaitlistStatus(entry, 'booked')}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-bold cursor-pointer flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" /> Book
                          </button>
                        )}
                        {entry.status === 'waiting' && (
                          <button
                            onClick={() => handleWaitlistStatus(entry, 'expired')}
                            className="px-2.5 py-1 bg-surface-200 hover:bg-surface-300 text-surface-600 rounded-lg text-[9px] font-bold cursor-pointer"
                          >
                            Expire
                          </button>
                        )}
                        <button
                          onClick={() => handleWaitlistStatus(entry, 'cancelled')}
                          className="p-1.5 text-surface-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openWaitlistModal(entry)}
                          className="p-1.5 text-surface-400 hover:text-surface-700 hover:bg-surface-100 rounded-lg cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteWaitlist(entry)}
                          className="p-1.5 text-surface-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* History entries */}
              {historyWaitlist.length > 0 && (
                <details>
                  <summary className="px-5 py-2.5 text-[10px] font-bold text-surface-500 cursor-pointer hover:bg-surface-50 transition-colors select-none">
                    History — {historyWaitlist.length} entries
                  </summary>
                  <div className="divide-y divide-surface-100">
                    {historyWaitlist.map(entry => (
                      <div key={entry.id} className="px-5 py-2.5 flex items-center justify-between gap-4 hover:bg-surface-50/50 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-surface-700">{entry.guest_name}</p>
                            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${STATUS_BADGES[entry.status].bg} ${STATUS_BADGES[entry.status].text}`}>
                              {STATUS_BADGES[entry.status].label}
                            </span>
                          </div>
                          <p className="text-[10px] text-surface-400">
                            {entry.room_type} · {entry.party_size} guest{entry.party_size !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => openWaitlistModal(entry)}
                            className="p-1 text-surface-400 hover:text-surface-700 hover:bg-surface-100 rounded-lg cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteWaitlist(entry)}
                            className="p-1 text-surface-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── PROMO CODE MODAL ── */}
      {showPromoModal && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowPromoModal(false); setSelectedPromo(null); }}>
          <div className="bg-white rounded-2xl shadow-xl border border-surface-100 max-w-lg w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-surface-900">{selectedPromo ? 'Edit Promo Code' : 'Add Promo Code'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Code *</label>
                <input type="text" value={promoForm.code} onChange={e => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Discount Type</label>
                <select value={promoForm.discount_type} onChange={e => setPromoForm({ ...promoForm, discount_type: e.target.value as 'percentage' | 'fixed' })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500">
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Discount Value *</label>
                <input type="number" min={0} value={promoForm.discount_value} onChange={e => setPromoForm({ ...promoForm, discount_value: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Min Spend</label>
                <input type="number" min={0} value={promoForm.min_spend} onChange={e => setPromoForm({ ...promoForm, min_spend: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Max Discount (optional)</label>
                <input type="number" min={0} value={promoForm.max_discount ?? ''} onChange={e => setPromoForm({ ...promoForm, max_discount: e.target.value ? parseFloat(e.target.value) : null })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Usage Limit (0 = unlimited)</label>
                <input type="number" min={0} value={promoForm.usage_limit ?? ''} onChange={e => setPromoForm({ ...promoForm, usage_limit: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Valid From *</label>
                <input type="date" value={promoForm.valid_from} onChange={e => setPromoForm({ ...promoForm, valid_from: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Valid To *</label>
                <input type="date" value={promoForm.valid_to} onChange={e => setPromoForm({ ...promoForm, valid_to: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={promoForm.is_active} onChange={e => setPromoForm({ ...promoForm, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
                  <span className="text-xs font-semibold text-surface-700">Active</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-surface-500 font-semibold mb-1 text-xs">Description</label>
              <input type="text" value={promoForm.description} onChange={e => setPromoForm({ ...promoForm, description: e.target.value })}
                className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs focus:outline-none focus:border-brand-500" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowPromoModal(false); setSelectedPromo(null); }}
                className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-50 bg-white">
                Cancel
              </button>
              <button onClick={handleSavePromo}
                className="flex-1 py-2.5 bg-surface-900 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-800">
                {selectedPromo ? 'Update Promo' : 'Create Promo Code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RATE PLAN MODAL ── */}
      {showRatePlanModal && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowRatePlanModal(false); setSelectedRatePlan(null); }}>
          <div className="bg-white rounded-2xl shadow-xl border border-surface-100 max-w-lg w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-surface-900">{selectedRatePlan ? 'Edit Rate Plan' : 'Add Rate Plan'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="block text-surface-500 font-semibold mb-1">Name *</label>
                <input type="text" value={ratePlanForm.name} onChange={e => setRatePlanForm({ ...ratePlanForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Room Type *</label>
                <select value={ratePlanForm.room_type} onChange={e => setRatePlanForm({ ...ratePlanForm, room_type: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500">
                  <option value="">Select type</option>
                  {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Base Price *</label>
                <input type="number" min={0} value={ratePlanForm.base_price} onChange={e => setRatePlanForm({ ...ratePlanForm, base_price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Date From *</label>
                <input type="date" value={ratePlanForm.date_from} onChange={e => setRatePlanForm({ ...ratePlanForm, date_from: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Date To *</label>
                <input type="date" value={ratePlanForm.date_to} onChange={e => setRatePlanForm({ ...ratePlanForm, date_to: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Min Stay (hours)</label>
                <input type="number" min={1} value={ratePlanForm.min_stay_hours} onChange={e => setRatePlanForm({ ...ratePlanForm, min_stay_hours: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div className="flex items-center gap-4 pt-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={ratePlanForm.is_peak} onChange={e => setRatePlanForm({ ...ratePlanForm, is_peak: e.target.checked })}
                    className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
                  <span className="text-xs font-semibold text-surface-700">Peak Season</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={ratePlanForm.is_active} onChange={e => setRatePlanForm({ ...ratePlanForm, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
                  <span className="text-xs font-semibold text-surface-700">Active</span>
                </label>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowRatePlanModal(false); setSelectedRatePlan(null); }}
                className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-50 bg-white">
                Cancel
              </button>
              <button onClick={handleSaveRatePlan}
                className="flex-1 py-2.5 bg-surface-900 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-800">
                {selectedRatePlan ? 'Update Rate Plan' : 'Create Rate Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WAITLIST MODAL ── */}
      {showWaitlistModal && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowWaitlistModal(false); setSelectedWaitlist(null); }}>
          <div className="bg-white rounded-2xl shadow-xl border border-surface-100 max-w-lg w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-surface-900">{selectedWaitlist ? 'Edit Waitlist Entry' : 'Add Waitlist Entry'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="block text-surface-500 font-semibold mb-1">Guest Name *</label>
                <input type="text" value={waitlistForm.guest_name} onChange={e => setWaitlistForm({ ...waitlistForm, guest_name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Email</label>
                <input type="email" value={waitlistForm.guest_email} onChange={e => setWaitlistForm({ ...waitlistForm, guest_email: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Phone</label>
                <input type="text" value={waitlistForm.guest_phone} onChange={e => setWaitlistForm({ ...waitlistForm, guest_phone: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Room Type *</label>
                <select value={waitlistForm.room_type} onChange={e => setWaitlistForm({ ...waitlistForm, room_type: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500">
                  <option value="">Select type</option>
                  {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Party Size</label>
                <input type="number" min={1} value={waitlistForm.party_size} onChange={e => setWaitlistForm({ ...waitlistForm, party_size: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Preferred Room</label>
                <select value={waitlistForm.preferred_room_id ?? ''} onChange={e => setWaitlistForm({ ...waitlistForm, preferred_room_id: e.target.value || null })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500">
                  <option value="">No preference</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>Suite {r.room_number} ({r.type})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Check-in Date</label>
                <input type="date" value={waitlistForm.check_in} onChange={e => setWaitlistForm({ ...waitlistForm, check_in: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Check-out Date</label>
                <input type="date" value={waitlistForm.check_out} onChange={e => setWaitlistForm({ ...waitlistForm, check_out: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-surface-500 font-semibold mb-1">Notes</label>
                <textarea rows={2} value={waitlistForm.notes} onChange={e => setWaitlistForm({ ...waitlistForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs focus:outline-none focus:border-brand-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowWaitlistModal(false); setSelectedWaitlist(null); }}
                className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-50 bg-white">
                Cancel
              </button>
              <button onClick={handleSaveWaitlist}
                className="flex-1 py-2.5 bg-surface-900 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-800">
                {selectedWaitlist ? 'Update Entry' : 'Add to Waitlist'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
