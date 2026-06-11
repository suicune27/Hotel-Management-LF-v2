import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Profile, PromoCode } from '../../types';
import { X, Plus, Tag, Percent, DollarSign, Settings, Trash2, RefreshCw, ImageUp, Palette, Check } from 'lucide-react';
import { getSettings, saveSettings, AppSettings, ColorScheme } from '../../lib/settings';
import { fileToBase64, isValidImageType } from '../../lib/imageUpload';
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

  const [activeSubTab, setActiveSubTab] = useState<'general' | 'brand' | 'theme' | 'promos' | 'system'>('general');

  const [brandForm, setBrandForm] = useState({
    hotelName: settings.brand?.hotelName || '',
    hotelSubtitle: settings.brand?.hotelSubtitle || '',
    logoUrl: settings.brand?.logoUrl || '',
    faviconUrl: settings.brand?.faviconUrl || '',
  });

  const isBrandDirty = 
    brandForm.hotelName !== (settings.brand?.hotelName || '') ||
    brandForm.hotelSubtitle !== (settings.brand?.hotelSubtitle || '') ||
    brandForm.logoUrl !== (settings.brand?.logoUrl || '') ||
    brandForm.faviconUrl !== (settings.brand?.faviconUrl || '');

  // Keep brandForm updated if settings updates from syncing
  useEffect(() => {
    setBrandForm({
      hotelName: settings.brand?.hotelName || '',
      hotelSubtitle: settings.brand?.hotelSubtitle || '',
      logoUrl: settings.brand?.logoUrl || '',
      faviconUrl: settings.brand?.faviconUrl || '',
    });
  }, [settings.brand]);

  const handleSaveBrand = async () => {
    const updatedBrand = {
      ...settings.brand,
      hotelName: brandForm.hotelName,
      hotelSubtitle: brandForm.hotelSubtitle,
      logoUrl: brandForm.logoUrl,
      faviconUrl: brandForm.faviconUrl,
    };
    const updated = { ...settings, brand: updatedBrand };
    setSettings(updated);
    await saveSettings(updated);
    addToast('success', 'Changes Saved', 'Hotel identity and brand logos have been successfully saved.');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isValidImageType(file)) {
      triggerAlert('Invalid File', 'Please select a valid image file (PNG, JPG, WebP, SVG).');
      return;
    }
    const base64 = await fileToBase64(file);
    if (!base64) {
      triggerAlert('Error', 'Failed to convert image or file is too large (>5MB).');
      return;
    }
    setBrandForm(prev => ({ ...prev, logoUrl: base64 }));
    addToast('success', 'Logo Uploaded', 'New Brand Logo prepared. Click "Save Brand & Logo" below to apply changes.');
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isValidImageType(file)) {
      triggerAlert('Invalid File', 'Please select a valid image file (PNG, JPG, WebP).');
      return;
    }
    const base64 = await fileToBase64(file, 2); // 2MB limit for favicons
    if (!base64) {
      triggerAlert('Error', 'Failed to convert favicon or file is too large (>2MB).');
      return;
    }
    setBrandForm(prev => ({ ...prev, faviconUrl: base64 }));
    addToast('success', 'Favicon Uploaded', 'New Brand Favicon prepared. Click "Save Brand & Logo" below to apply changes.');
  };

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
    <div className="flex flex-col h-full w-full">
      {/* Settings Sub-Header Navigation */}
      <div className="flex flex-col md:flex-row gap-6 items-start flex-1 overflow-hidden min-h-0">
        {/* Left Sub-Tab Navigation Panel */}
        <div className="w-full md:w-56 flex md:flex-col gap-1.5 p-1.5 bg-surface-100/60 md:bg-white md:border md:border-surface-100 rounded-2xl flex-shrink-0 md:max-h-[70vh] overflow-x-auto md:overflow-x-visible md:overflow-y-auto no-scrollbar">
          {[
            { id: 'general' as const, label: 'General Rules', icon: Settings, desc: 'Billing, times, and rules' },
            { id: 'brand' as const, label: 'Brand & Logo', icon: ImageUp, desc: 'Hotel identity & assets' },
            { id: 'theme' as const, label: 'Color Theme', icon: Palette, desc: 'Branding color scheme' },
            { id: 'promos' as const, label: 'Promo Codes', icon: Percent, desc: 'Coupons and discounts' },
            { id: 'system' as const, label: 'System & Reset', icon: RefreshCw, desc: 'Advanced diagnostics' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2.5 md:w-full text-left p-2.5 rounded-xl transition-all font-bold cursor-pointer outline-none whitespace-nowrap ${
                  isActive
                    ? 'bg-white md:bg-surface-900 md:text-white text-brand-700 shadow-md md:shadow-none border border-brand-100 md:border-transparent'
                    : 'text-surface-500 hover:text-surface-800 hover:bg-surface-100 md:hover:bg-surface-50'
                }`}
              >
                <div className={`p-1.5 rounded-lg flex items-center justify-center ${isActive ? 'bg-brand-50 md:bg-white/15 text-brand-600 md:text-white' : 'bg-surface-100 text-surface-400'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold leading-tight">{tab.label}</p>
                  <p className={`text-[9px] font-medium leading-none mt-0.5 hidden md:block ${isActive ? 'text-brand-500 md:text-white/70' : 'text-surface-400'}`}>{tab.desc}</p>
                </div>
                <div className="block sm:hidden text-xs font-bold">{tab.label}</div>
              </button>
            );
          })}
        </div>

        {/* Right Scrollable Detail Panel */}
        <div className="flex-1 w-full overflow-y-auto pr-1 md:pr-4 space-y-6 max-h-[calc(100vh-220px)] pb-12 rounded-2xl scrollbar-thin scrollbar-thumb-surface-200 scrollbar-track-transparent">
          {activeSubTab === 'general' && (
            <div className="space-y-6">
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
                      <Plus className="w-3.5 h-3.5 text-white" /> Add
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
            </div>
          )}

          {activeSubTab === 'brand' && (
            <div className="space-y-6">
              {/* Brand & Logo */}
              <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden overflow-visible">
                <div className="px-5 py-4 border-b border-surface-100 bg-surface-50/55 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageUp className="w-4 h-4 text-brand-600" />
                    <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Brand Information & Logos</h3>
                  </div>
                  {isBrandDirty ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse uppercase">
                      Unsaved Changes
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                      In Sync
                    </span>
                  )}
                </div>
                <div className="p-5 space-y-5">
                  <div className="flex flex-col md:flex-row items-start gap-5">
                    {/* Logo preview */}
                    <div className="flex flex-col items-center gap-2 flex-shrink-0 mx-auto md:mx-0">
                      {brandForm.logoUrl ? (
                        <img src={brandForm.logoUrl} alt="Logo" className="w-20 h-20 rounded-xl object-contain bg-surface-50 p-2 border border-surface-250/60 shadow-xs" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-20 h-20 rounded-xl bg-surface-100 flex items-center justify-center text-surface-300 border border-surface-200">
                          <ImageUp className="w-8 h-8" />
                        </div>
                      )}
                      <span className="text-[9px] font-bold text-surface-400 uppercase tracking-wide">Logo Preview</span>
                    </div>

                    <div className="flex-1 w-full space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Hotel Name</label>
                          <input
                            type="text"
                            value={brandForm.hotelName}
                            onChange={e => setBrandForm(prev => ({ ...prev, hotelName: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-brand-500"
                            placeholder="Your Hotel Name"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1">Tagline / Subtitle</label>
                          <input
                            type="text"
                            value={brandForm.hotelSubtitle}
                            onChange={e => setBrandForm(prev => ({ ...prev, hotelSubtitle: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs focus:outline-none focus:border-brand-500"
                            placeholder="e.g. Luxury Resort & Spa"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider">Logo Image Link Or File</label>
                            <label className="text-[9px] font-bold text-brand-600 hover:text-brand-700 cursor-pointer flex items-center gap-1">
                              <ImageUp className="w-3 h-3" />
                              Upload
                              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                            </label>
                          </div>
                          <input
                            type="text"
                            value={brandForm.logoUrl}
                            onChange={e => setBrandForm(prev => ({ ...prev, logoUrl: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-mono focus:outline-none focus:border-brand-500"
                            placeholder="Paste Logo image URL"
                          />
                          <p className="text-[9px] text-surface-400 mt-0.5">Supports PNG, JPG, WebP, SVG. Max 5MB.</p>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider">Favicon Link Or File</label>
                            <label className="text-[9px] font-bold text-brand-600 hover:text-brand-700 cursor-pointer flex items-center gap-1">
                              <ImageUp className="w-3 h-3" />
                              Upload
                              <input type="file" accept="image/*" onChange={handleFaviconUpload} className="hidden" />
                            </label>
                          </div>
                          <input
                            type="text"
                            value={brandForm.faviconUrl}
                            onChange={e => setBrandForm(prev => ({ ...prev, faviconUrl: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-xs font-mono focus:outline-none focus:border-brand-500"
                            placeholder="Paste Favicon URL"
                          />
                          <p className="text-[9px] text-surface-400 mt-0.5">Primary browser tab icon. Max 2MB.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Brand Action Save Section */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-100">
                    {isBrandDirty && (
                      <button
                        onClick={() => {
                          setBrandForm({
                            hotelName: settings.brand?.hotelName || '',
                            hotelSubtitle: settings.brand?.hotelSubtitle || '',
                            logoUrl: settings.brand?.logoUrl || '',
                            faviconUrl: settings.brand?.faviconUrl || '',
                          });
                          addToast('info', 'Reverted Changes', 'Disposed unsaved brand form edits.');
                        }}
                        className="px-4 py-2 border border-surface-200 text-surface-500 hover:text-surface-700 rounded-xl text-xs font-bold transition-all cursor-pointer hover:bg-surface-50"
                      >
                        Discard
                      </button>
                    )}
                    <button
                      onClick={handleSaveBrand}
                      disabled={!isBrandDirty}
                      className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${
                        isBrandDirty
                          ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-brand-500/10 cursor-pointer scale-[1.02]'
                          : 'bg-surface-100 text-surface-400 border border-surface-200/50 cursor-not-allowed opacity-80'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      Save Brand Settings
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'theme' && (
            <div className="space-y-6">
              {/* Color Scheme */}
              <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-surface-100 bg-surface-50/50 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-surface-500" />
                  <h3 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Color Theme</h3>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-[10px] text-surface-400">Customize the app color scheme. Changes apply instantly to all employees and guest environments in real-time.</p>

                  {/* Preset themes */}
                  <div>
                    <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Preset Themes</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { name: 'Violet / Lavender', colors: { primary: '#7c3aed', secondary: '#6366f1', accent: '#f59e0b', surface: '#f0f2f5' } },
                        { name: 'Emerald / Mint', colors: { primary: '#059669', secondary: '#0d9488', accent: '#f59e0b', surface: '#ecfdf5' } },
                        { name: 'Royal Steel', colors: { primary: '#1d4ed8', secondary: '#7c3aed', accent: '#f59e0b', surface: '#eff6ff' } },
                        { name: 'Rose Petal', colors: { primary: '#e11d48', secondary: '#db2777', accent: '#f59e0b', surface: '#fff1f2' } },
                        { name: 'Sunset Amber', colors: { primary: '#d97706', secondary: '#ea580c', accent: '#059669', surface: '#fffbeb' } },
                        { name: 'Modern Slate', colors: { primary: '#475569', secondary: '#334155', accent: '#0ea5e9', surface: '#f8fafc' } },
                      ].map(theme => {
                        const isActive = settings.colorScheme.primary === theme.colors.primary;
                        return (
                          <button
                            key={theme.name}
                            onClick={() => {
                              const updated = { ...settings, colorScheme: theme.colors as ColorScheme };
                              setSettings(updated);
                              saveSettings(updated);
                              addToast('success', 'Theme Applied', `"${theme.name}" applied successfully.`);
                            }}
                            className={`relative flex items-center justify-start gap-2.5 px-3 py-2.5 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                              isActive
                                ? 'border-surface-900 bg-surface-50 shadow-xs ring-1 ring-surface-900/10'
                                : 'border-surface-200 hover:border-surface-300 bg-white'
                            }`}
                          >
                            <div className="flex -space-x-1 flex-shrink-0">
                              <div className="w-4 h-4 rounded-full border-2 border-white shadow-xs" style={{ backgroundColor: theme.colors.primary }} />
                              <div className="w-4 h-4 rounded-full border-2 border-white shadow-xs" style={{ backgroundColor: theme.colors.secondary }} />
                            </div>
                            <span className="truncate">{theme.name}</span>
                            {isActive && <Check className="w-3 h-3 text-surface-600 ml-auto" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom colors */}
                  <div className="border-t border-surface-100 pt-4">
                    <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-3">Custom Accent Colors</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { key: 'primary', label: 'Primary Brand Color', default: '#7c3aed' },
                        { key: 'secondary', label: 'Secondary Hue', default: '#6366f1' },
                        { key: 'accent', label: 'Highlight/Caution Accent', default: '#f59e0b' },
                        { key: 'surface', label: 'Surface Undercoat', default: '#f0f2f5' },
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
                                className="w-10 h-9 rounded-lg cursor-pointer border border-surface-200 flex-shrink-0 p-0 overflow-hidden"
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
                    <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Live Canvas Preview</label>
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
                        <div className="flex gap-1.5 pt-1">
                          <button className="px-3 py-1.5 rounded-lg text-[9px] font-bold text-white transition-all" style={{ backgroundColor: settings.colorScheme.primary }}>Active Button</button>
                          <button className="px-3 py-1.5 rounded-lg text-[9px] font-bold transition-all border" style={{ borderColor: settings.colorScheme.primary, color: settings.colorScheme.primary }}>Alt Boundary</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'promos' && (
            <div className="space-y-6">
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
                    <Plus className="w-3 h-3 text-white" /> New Promo
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
                              {promo.usage_limit ? ` · Used ${promo.used_count || 0}/${promo.usage_limit}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                            <button
                              onClick={() => {
                                setSelectedPromo(promo);
                                setPromoForm({ ...promo });
                                setShowPromoModal(true);
                              }}
                              className="px-2 py-1 bg-surface-100 hover:bg-surface-200 text-surface-600 rounded-lg text-[9px] font-semibold cursor-pointer border border-surface-200/50"
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
            </div>
          )}

          {activeSubTab === 'system' && (
            <div className="space-y-6">
              {/* Reset to Defaults */}
              <div className="bg-white rounded-xl border border-rose-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-rose-800">Reset to Defaults</h3>
                    <p className="text-xs text-rose-600 mt-0.5">Restore all settings to their original factory values.</p>
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
                    className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-white" /> Reset Settings
                  </button>
                </div>
              </div>

              {/* Settings JSON Summary */}
              <details className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden">
                <summary className="px-5 py-3.5 text-xs font-bold text-surface-500 cursor-pointer hover:bg-surface-50 select-none">
                  Display raw database parameters (JSON)
                </summary>
                <div className="border-t border-surface-100">
                  <pre className="p-5 text-[10px] font-mono text-surface-600 overflow-x-auto max-h-80 bg-surface-50">
                    {JSON.stringify(settings, null, 2)}
                  </pre>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* Promo Code Modal (Kept in top layer) */}
      {showPromoModal && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 shadow-xl" onClick={() => setShowPromoModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-surface-100 max-w-lg w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-surface-900">{selectedPromo ? 'Edit Promo Code' : 'New Promo Code'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
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
              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={promoForm.is_active} onChange={e => setPromoForm({ ...promoForm, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
                  <span className="text-xs font-semibold text-surface-700">Promo is Active</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-surface-500 font-semibold mb-1 text-xs">Description / Subhead</label>
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
    </div>
  );
}
