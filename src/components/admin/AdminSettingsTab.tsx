import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Profile, PromoCode } from '../../types';
import { X, Plus, Tag, Percent, DollarSign, Settings, Trash2, RefreshCw, ImageUp, Palette, Check } from 'lucide-react';
import { getSettings, saveSettings, AppSettings, ColorScheme } from '../../lib/settings';
import type { ToastMessage } from '../Toast';

interface AdminSettingsTabProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  userProfile: Profile | null;
  addToast: (type: ToastMessage['type'], title: string, message: string) => void;
  triggerAlert: (title: string, message: string) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void | Promise<void>, isDangerous?: boolean, confirmText?: string) => void;
  loadDatabase: () => Promise<void>;
  promoCodes: PromoCode[];
  setPromoCodes: React.Dispatch<React.SetStateAction<PromoCode[]>>;
  showPromoModal: boolean;
  setShowPromoModal: React.Dispatch<React.SetStateAction<boolean>>;
  selectedPromo: PromoCode | null;
  setSelectedPromo: React.Dispatch<React.SetStateAction<PromoCode | null>>;
  promoForm: any;
  setPromoForm: React.Dispatch<React.SetStateAction<any>>;
}

export default function AdminSettingsTab({
  settings,
  setSettings,
  userProfile,
  addToast,
  triggerAlert,
  triggerConfirm,
  loadDatabase,
  promoCodes,
  setPromoCodes,
  showPromoModal,
  setShowPromoModal,
  selectedPromo,
  setSelectedPromo,
  promoForm,
  setPromoForm,
}: AdminSettingsTabProps) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newPaymentOption, setNewPaymentOption] = useState('');
  const paymentOptions = settings.paymentOptions || [];

  const allDaySlots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? 'AM' : 'PM';
      allDaySlots.push(`${hour12}:${m.toString().padStart(2, '0')} ${ampm}`);
    }
  }

  const handleAddCategory = () => {
    const cleanName = newCategoryName.trim();
    if (!cleanName) return;
    if (settings.layoutCategories.includes(cleanName)) {
      triggerAlert('Duplicate Category', 'This category already exists.');
      return;
    }
    triggerConfirm(
      'Add Layout Category',
      `Add "${cleanName}" to suite layout categories?`,
      async () => {
        const updatedCats = [...settings.layoutCategories, cleanName];
        const updated = { ...settings, layoutCategories: updatedCats };
        setSettings(updated);
        setNewCategoryName('');
        await saveSettings(updated);
        addToast('success', 'Category Added', `"${cleanName}" added.`);
      }
    );
  };

  const handleRemoveCategory = (cat: string) => {
    triggerConfirm(
      'Remove Category',
      `Remove "${cat}" from layout categories?`,
      async () => {
        const updatedCats = settings.layoutCategories.filter(c => c !== cat);
        const updated = { ...settings, layoutCategories: updatedCats };
        setSettings(updated);
        await saveSettings(updated);
        addToast('success', 'Category Removed', `"${cat}" removed.`);
      }
    );
  };

  const handleRemovePaymentOption = (opt: string) => {
    triggerConfirm(
      'Remove Payment Option',
      `Remove "${opt}" from payment options?`,
      async () => {
        const updatedOptions = paymentOptions.filter(o => o !== opt);
        const updated = { ...settings, paymentOptions: updatedOptions };
        setSettings(updated);
        await saveSettings(updated);
        addToast('success', 'Option Removed', `"${opt}" removed.`);
      }
    );
  };

  const toggleTimeSlot = (type: 'checkIn' | 'checkOut', slot: string) => {
    const key = type === 'checkIn' ? 'checkInTimes' : 'checkOutTimes';
    const current = [...settings[key]];
    const idx = current.indexOf(slot);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(slot);
    current.sort((a, b) => {
      const toMin = (t: string) => {
        const [time, ampm] = t.split(' ');
        let [h, m] = time.split(':').map(Number);
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      };
      return toMin(a) - toMin(b);
    });
    const updated = { ...settings, [key]: current };
    setSettings(updated);
    saveSettings(updated);
  };

  const selectAllSlots = (type: 'checkIn' | 'checkOut') => {
    const key = type === 'checkIn' ? 'checkInTimes' : 'checkOutTimes';
    const updated = { ...settings, [key]: [...allDaySlots] };
    setSettings(updated);
    saveSettings(updated);
  };

  const clearAllSlots = (type: 'checkIn' | 'checkOut') => {
    const key = type === 'checkIn' ? 'checkInTimes' : 'checkOutTimes';
    const updated = { ...settings, [key]: [] };
    setSettings(updated);
    saveSettings(updated);
  };

  const handleSavePromo = async () => {
    if (!promoForm.code || !promoForm.valid_from || !promoForm.valid_to) {
      triggerAlert('Validation Error', 'Code, valid from, and valid to are required.');
      return;
    }
    try {
      if (selectedPromo) {
        const { error } = await supabase.from('promo_codes').update(promoForm).eq('id', selectedPromo.id);
        if (error) throw error;
        addToast('success', 'Promo Updated', 'Promo code updated successfully.');
      } else {
        const { error } = await supabase.from('promo_codes').insert({ ...promoForm, used_count: 0 });
        if (error) throw error;
        addToast('success', 'Promo Created', 'Promo code created successfully.');
      }
      setShowPromoModal(false);
      setSelectedPromo(null);
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Error', err.message);
    }
  };

  const handleDeletePromo = async (promo: PromoCode) => {
    triggerConfirm('Delete Promo', `Delete "${promo.code}" permanently?`, async () => {
      try {
        await supabase.from('promo_codes').delete().eq('id', promo.id);
        addToast('success', 'Promo Deleted', `"${promo.code}" removed.`);
        await loadDatabase();
      } catch (err: any) {
        triggerAlert('Error', err.message);
      }
    }, true, 'Delete');
  };

  const updateSettingField = async (field: string, value: any) => {
    const updated = { ...settings, [field]: value };
    setSettings(updated);
    await saveSettings(updated);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-surface-900 tracking-tight">Resort Configuration</h2>
        <p className="text-xs text-surface-400 mt-0.5">Manage hotel settings, billing, time slots, and branding.</p>
      </div>

      {/* Suite Layout Categories */}
      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
          <Settings className="w-4 h-4 text-surface-500" />
          <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Suite Layout Categories</h3>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[10px] text-surface-400">Configure room type filters available on the landing page and room creation dropdowns.</p>
          <div className="flex flex-wrap gap-1.5">
            {settings.layoutCategories.map(cat => (
              <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-100 text-surface-700 rounded-lg text-[10px] font-semibold">
                {cat}
                <button onClick={() => handleRemoveCategory(cat)} className="p-0.5 hover:text-rose-600 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              placeholder="e.g. Master Executive Suite"
              className="flex-1 px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs focus:outline-none focus:border-brand-500"
            />
            <button onClick={handleAddCategory} className="px-3 py-2 bg-surface-900 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-800 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>
      </div>

      {/* Currency & Billing */}
      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-surface-500" />
          <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Currency & Billing</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Currency Code</label>
              <input
                type="text"
                value={settings.currencyCode}
                onChange={e => updateSettingField('currencyCode', e.target.value.toUpperCase())}
                className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs focus:outline-none focus:border-brand-500"
                placeholder="e.g. PHP"
                maxLength={3}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Display Symbol</label>
              <input
                type="text"
                value={settings.currencySymbol}
                onChange={e => updateSettingField('currencySymbol', e.target.value)}
                className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs focus:outline-none focus:border-brand-500"
                placeholder="e.g. ₱"
                maxLength={5}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Minimum Stay (hours)</label>
              <input
                type="number"
                value={settings.minStayHours}
                onChange={e => updateSettingField('minStayHours', parseInt(e.target.value) || 3)}
                className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs focus:outline-none focus:border-brand-500"
                min={1}
                max={24}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Nightly Threshold (hours)</label>
            <input
              type="number"
              value={settings.nightlyThreshold ?? 24}
              onChange={e => updateSettingField('nightlyThreshold', parseInt(e.target.value) || 24)}
              className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs focus:outline-none focus:border-brand-500"
              min={1}
              max={72}
            />
            </div>
          </div>
        </div>
      </div>

      {/* Payment Options */}
      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
          <Tag className="w-4 h-4 text-surface-500" />
          <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Payment Options</h3>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {paymentOptions.map(opt => (
              <span key={opt} className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-100 text-surface-700 rounded-lg text-[10px] font-semibold">
                {opt}
                <button onClick={() => handleRemovePaymentOption(opt)} className="p-0.5 hover:text-rose-600 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPaymentOption}
              onChange={e => setNewPaymentOption(e.target.value)}
              placeholder="e.g. GCash"
              className="flex-1 px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs focus:outline-none focus:border-brand-500"
            />
            <button
              onClick={async () => {
                const opt = newPaymentOption.trim();
                if (!opt) return;
                if (paymentOptions.includes(opt)) {
                  triggerAlert('Duplicate', 'This payment option already exists.');
                  return;
                }
                const updated = { ...settings, paymentOptions: [...paymentOptions, opt] };
                setSettings(updated);
                setNewPaymentOption('');
                await saveSettings(updated);
                addToast('success', 'Option Added', `"${opt}" added.`);
              }}
              className="px-3 py-2 bg-surface-900 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-800 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>
      </div>

      {/* Check-In / Check-Out Time Slots */}
      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
          <Settings className="w-4 h-4 text-surface-500" />
          <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Check-In / Check-Out Times</h3>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-[10px] text-surface-400">Select available check-in and check-out time slots for rooms.</p>

          {/* Check-In Times */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-surface-700">Check-In Times</h4>
              <div className="flex gap-1.5">
                <button onClick={() => selectAllSlots('checkIn')} className="px-2 py-1 bg-brand-50 text-brand-700 rounded-lg text-[9px] font-bold cursor-pointer">Select All</button>
                <button onClick={() => clearAllSlots('checkIn')} className="px-2 py-1 bg-rose-50 text-rose-600 rounded-lg text-[9px] font-bold cursor-pointer">Clear</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-2 bg-surface-50 rounded-xl border border-surface-100">
              {allDaySlots.map(slot => (
                <button
                  key={`ci-${slot}`}
                  onClick={() => toggleTimeSlot('checkIn', slot)}
                  className={`px-2 py-1 text-[9px] font-semibold rounded-lg transition-colors cursor-pointer ${
                    settings.checkInTimes.includes(slot)
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-surface-500 border border-surface-200 hover:bg-surface-100'
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          {/* Check-Out Times */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-surface-700">Check-Out Times</h4>
              <div className="flex gap-1.5">
                <button onClick={() => selectAllSlots('checkOut')} className="px-2 py-1 bg-brand-50 text-brand-700 rounded-lg text-[9px] font-bold cursor-pointer">Select All</button>
                <button onClick={() => clearAllSlots('checkOut')} className="px-2 py-1 bg-rose-50 text-rose-600 rounded-lg text-[9px] font-bold cursor-pointer">Clear</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-2 bg-surface-50 rounded-xl border border-surface-100">
              {allDaySlots.map(slot => (
                <button
                  key={`co-${slot}`}
                  onClick={() => toggleTimeSlot('checkOut', slot)}
                  className={`px-2 py-1 text-[9px] font-semibold rounded-lg transition-colors cursor-pointer ${
                    settings.checkOutTimes.includes(slot)
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-surface-500 border border-surface-200 hover:bg-surface-100'
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Access */}
      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
          <Settings className="w-4 h-4 text-surface-500" />
          <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">QR Code Access</h3>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[10px] text-surface-400">Set the local server URL used in guest portal QR codes.</p>
          <input
            type="text"
            value={settings.localServerUrl || ''}
            onChange={e => updateSettingField('localServerUrl', e.target.value)}
            placeholder="e.g. http://192.168.1.100:5173"
            className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-mono focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {/* Landing Page Announcement */}
      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
          <Settings className="w-4 h-4 text-surface-500" />
          <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Landing Page Announcement</h3>
        </div>
        <div className="p-5 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.announcement.enabled}
              onChange={e => updateSettingField('announcement', { ...settings.announcement, enabled: e.target.checked })}
              className="w-4 h-4 rounded border-surface-300"
            />
            <span className="text-xs font-semibold text-surface-700">Show announcement banner</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Banner Text</label>
              <input
                type="text"
                value={settings.announcement.text || ''}
                onChange={e => updateSettingField('announcement', { ...settings.announcement, text: e.target.value })}
                placeholder="e.g. Summer Special — 20% off!"
                className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Style</label>
              <select
                value={settings.announcement.type}
                onChange={e => updateSettingField('announcement', { ...settings.announcement, type: e.target.value })}
                className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs focus:outline-none focus:border-brand-500"
              >
                <option value="promo">Indigo / Promo</option>
                <option value="info">Dark / Info</option>
                <option value="warning">Amber / Warning</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Brand & Logo */}
      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
          <ImageUp className="w-4 h-4 text-surface-500" />
          <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Brand & Logo</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-4">
            {/* Logo preview */}
            <div className="flex-shrink-0">
              {settings.brand.logoUrl ? (
                <img src={settings.brand.logoUrl} alt="Logo" className="w-16 h-16 rounded-xl object-cover border border-surface-200" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-surface-100 flex items-center justify-center text-surface-300 border border-surface-200">
                  <ImageUp className="w-6 h-6" />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Hotel Name</label>
                  <input
                    type="text"
                    value={settings.brand.hotelName}
                    onChange={e => updateSettingField('brand', { ...settings.brand, hotelName: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-brand-500"
                    placeholder="Your Hotel Name"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Tagline / Subtitle</label>
                  <input
                    type="text"
                    value={settings.brand.hotelSubtitle}
                    onChange={e => updateSettingField('brand', { ...settings.brand, hotelSubtitle: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs focus:outline-none focus:border-brand-500"
                    placeholder="e.g. Luxury Resort & Spa"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Logo URL</label>
                  <input
                    type="text"
                    value={settings.brand.logoUrl}
                    onChange={e => updateSettingField('brand', { ...settings.brand, logoUrl: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-mono focus:outline-none focus:border-brand-500"
                    placeholder="https://example.com/logo.png"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Favicon URL</label>
                  <input
                    type="text"
                    value={settings.brand.faviconUrl}
                    onChange={e => updateSettingField('brand', { ...settings.brand, faviconUrl: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-mono focus:outline-none focus:border-brand-500"
                    placeholder="https://example.com/favicon.ico"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Color Scheme */}
      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
          <Palette className="w-4 h-4 text-surface-500" />
          <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Color Theme</h3>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-[10px] text-surface-400">Customize the app color scheme. Changes apply instantly to all users.</p>

          {/* Preset themes */}
          <div>
            <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Preset Themes</label>
            <div className="flex flex-wrap gap-2">
              {[
                { name: 'Violet', colors: { primary: '#7c3aed', secondary: '#6366f1', accent: '#f59e0b', surface: '#f0f2f5' } },
                { name: 'Emerald', colors: { primary: '#059669', secondary: '#0d9488', accent: '#f59e0b', surface: '#ecfdf5' } },
                { name: 'Royal', colors: { primary: '#1d4ed8', secondary: '#7c3aed', accent: '#f59e0b', surface: '#eff6ff' } },
                { name: 'Rose', colors: { primary: '#e11d48', secondary: '#db2777', accent: '#f59e0b', surface: '#fff1f2' } },
                { name: 'Amber', colors: { primary: '#d97706', secondary: '#ea580c', accent: '#059669', surface: '#fffbeb' } },
                { name: 'Slate', colors: { primary: '#475569', secondary: '#334155', accent: '#0ea5e9', surface: '#f8fafc' } },
              ].map(theme => {
                const isActive = settings.colorScheme.primary === theme.colors.primary;
                return (
                  <button
                    key={theme.name}
                    onClick={() => {
                      const updated = { ...settings, colorScheme: theme.colors as ColorScheme };
                      setSettings(updated);
                      saveSettings(updated);
                      addToast('success', 'Theme Applied', `"${theme.name}" color scheme applied.`);
                    }}
                    className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'border-surface-900 bg-surface-50 shadow-xs'
                        : 'border-surface-200 hover:border-surface-300 bg-white'
                    }`}
                  >
                    <div className="flex -space-x-1">
                      <div className="w-4 h-4 rounded-full border-2 border-white shadow-xs" style={{ backgroundColor: theme.colors.primary }} />
                      <div className="w-4 h-4 rounded-full border-2 border-white shadow-xs" style={{ backgroundColor: theme.colors.secondary }} />
                    </div>
                    <span>{theme.name}</span>
                    {isActive && <Check className="w-3 h-3 text-surface-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom colors */}
          <div className="border-t border-surface-100 pt-4">
            <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-3">Custom Colors</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { key: 'primary', label: 'Primary', default: '#7c3aed' },
                { key: 'secondary', label: 'Secondary', default: '#6366f1' },
                { key: 'accent', label: 'Accent', default: '#f59e0b' },
                { key: 'surface', label: 'Surface Tint', default: '#f0f2f5' },
              ].map(({ key, label, default: def }) => {
                const currentVal = settings.colorScheme[key as keyof ColorScheme] || def;
                return (
                  <div key={key}>
                    <label className="block text-[9px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">{label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={currentVal}
                        onChange={e => {
                          const newScheme = { ...settings.colorScheme, [key]: e.target.value };
                          const updated = { ...settings, colorScheme: newScheme };
                          setSettings(updated);
                          saveSettings(updated);
                        }}
                        className="w-10 h-9 rounded-lg cursor-pointer border border-surface-200 flex-shrink-0"
                      />
                      <input
                        type="text"
                        value={currentVal}
                        onChange={e => {
                          const val = e.target.value;
                          if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                            const newScheme = { ...settings.colorScheme, [key]: val } as ColorScheme;
                            const updated = { ...settings, colorScheme: newScheme };
                            setSettings(updated);
                            saveSettings(updated);
                          }
                        }}
                        className="flex-1 px-2 py-1.5 bg-surface-50 border border-surface-200 rounded-lg text-[9px] font-mono focus:outline-none focus:border-brand-500"
                        placeholder={def}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live preview */}
          <div className="border-t border-surface-100 pt-4">
            <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Preview</label>
            <div className="rounded-xl overflow-hidden border border-surface-200">
              {/* Preview header bar */}
              <div className="p-3 flex items-center gap-2" style={{ backgroundColor: settings.colorScheme.primary }}>
                <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center text-white text-[9px] font-bold">
                  {settings.brand.hotelName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <span className="text-xs font-bold text-white">{settings.brand.hotelName}</span>
              </div>
              {/* Preview body */}
              <div className="p-3 space-y-2" style={{ backgroundColor: settings.colorScheme.surface }}>
                <div className="flex gap-1.5">
                  <span className="px-2 py-1 rounded-md text-[9px] font-bold text-white" style={{ backgroundColor: settings.colorScheme.primary }}>Primary</span>
                  <span className="px-2 py-1 rounded-md text-[9px] font-bold text-white" style={{ backgroundColor: settings.colorScheme.secondary }}>Secondary</span>
                  <span className="px-2 py-1 rounded-md text-[9px] font-bold text-white" style={{ backgroundColor: settings.colorScheme.accent }}>Accent</span>
                </div>
                <div className="flex gap-1.5">
                  <button className="px-3 py-1.5 rounded-lg text-[9px] font-bold text-white transition-all" style={{ backgroundColor: settings.colorScheme.primary }}>Button</button>
                  <button className="px-3 py-1.5 rounded-lg text-[9px] font-bold transition-all border" style={{ borderColor: settings.colorScheme.primary, color: settings.colorScheme.primary }}>Outline</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Promo Codes */}
      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-surface-500" />
            <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Promo Codes</h3>
          </div>
          <button
            onClick={() => {
              setSelectedPromo(null);
              setPromoForm({ code: '', description: '', discount_type: 'percentage', discount_value: 0, valid_from: '', valid_to: '', usage_limit: 0, min_spend: 0, is_active: true });
              setShowPromoModal(true);
            }}
            className="px-3 py-1.5 bg-surface-900 text-white hover:bg-surface-800 rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> New Promo
          </button>
        </div>
        <div className="p-5">
          {promoCodes.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-4">No promo codes configured.</p>
          ) : (
            <div className="space-y-2">
              {promoCodes.map(promo => (
                <div key={promo.id} className="flex items-center justify-between p-3 bg-surface-50 rounded-xl border border-surface-100">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-surface-900 text-sm">{promo.code}</span>
                      <span className={`px-2 py-0.5 text-[8px] font-bold uppercase rounded-full ${promo.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-100 text-surface-500'}`}>
                        {promo.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-[10px] text-surface-500 mt-0.5">
                      {promo.discount_type === 'percentage' ? `${promo.discount_value}% off` : `${promo.discount_value} off`}
                      {promo.usage_limit ? ` · Used ${promo.used_count}/${promo.usage_limit}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => {
                        setSelectedPromo(promo);
                        setPromoForm({ ...promo });
                        setShowPromoModal(true);
                      }}
                      className="px-2 py-1 bg-surface-100 hover:bg-surface-200 text-surface-600 rounded-lg text-[9px] font-semibold cursor-pointer"
                    >
                      Edit
                    </button>
                    <button onClick={() => handleDeletePromo(promo)} className="p-1 text-surface-400 hover:text-rose-600 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Promo Code Modal */}
      {showPromoModal && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowPromoModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-surface-100 max-w-lg w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-surface-900">{selectedPromo ? 'Edit Promo Code' : 'New Promo Code'}</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Code</label>
                <input type="text" value={promoForm.code} onChange={e => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Type</label>
                <select value={promoForm.discount_type} onChange={e => setPromoForm({ ...promoForm, discount_type: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500">
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Value</label>
                <input type="number" value={promoForm.discount_value} onChange={e => setPromoForm({ ...promoForm, discount_value: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Min Spend</label>
                <input type="number" value={promoForm.min_spend} onChange={e => setPromoForm({ ...promoForm, min_spend: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Valid From</label>
                <input type="date" value={promoForm.valid_from} onChange={e => setPromoForm({ ...promoForm, valid_from: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Valid To</label>
                <input type="date" value={promoForm.valid_to} onChange={e => setPromoForm({ ...promoForm, valid_to: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Usage Limit (0 = unlimited)</label>
                <input type="number" value={promoForm.usage_limit} onChange={e => setPromoForm({ ...promoForm, usage_limit: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={promoForm.is_active} onChange={e => setPromoForm({ ...promoForm, is_active: e.target.checked })}
                    className="w-4 h-4" />
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
                className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-50">
                Cancel
              </button>
              <button onClick={handleSavePromo}
                className="flex-1 py-2.5 bg-surface-900 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-800">
                {selectedPromo ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset to Defaults */}
      <div className="bg-white rounded-2xl border border-rose-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-rose-800">Reset to Defaults</h3>
            <p className="text-xs text-rose-600 mt-0.5">Restore all settings to their original values.</p>
          </div>
          <button
            onClick={async () => {
              if (confirm('Are you sure you want to reset all settings to defaults?')) {
                await saveSettings(getSettings());
                setSettings(getSettings());
                addToast('success', 'Reset Complete', 'Settings restored to defaults.');
                await loadDatabase();
              }
            }}
            className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Settings JSON Summary */}
      <details className="bg-white rounded-2xl border border-surface-100 shadow-sm">
        <summary className="px-5 py-3 text-xs font-bold text-surface-500 cursor-pointer hover:bg-surface-50 rounded-2xl transition-colors">
          Raw Settings JSON
        </summary>
        <pre className="p-5 text-[10px] font-mono text-surface-600 overflow-x-auto max-h-80 border-t border-surface-100">
          {JSON.stringify(settings, null, 2)}
        </pre>
      </details>
    </div>
  );
}
