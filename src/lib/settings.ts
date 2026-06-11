import { supabase } from './supabase';

export interface BrandSettings {
  hotelName: string;
  hotelSubtitle: string;
  logoUrl: string;
  brandColor: string;
  faviconUrl: string;
}

export interface ColorScheme {
  primary: string;    // Main brand color (default: #7c3aed)
  secondary: string;  // Secondary accent (default: #6366f1)
  accent: string;     // Highlight/CTA (default: #f59e0b)
  surface: string;    // Card/bg surface tint (default: #f0f2f5)
}

export interface AppSettings {
  layoutCategories: string[];
  currencyCode: string;
  currencySymbol: string;
  minStayHours: number;
  checkInTimes: string[];
  checkOutTimes: string[];
  localServerUrl: string;
  announcement: {
    text: string;
    enabled: boolean;
    type: 'promo' | 'info' | 'warning';
  };
  brand: BrandSettings;
  colorScheme: ColorScheme;
  holidays?: any[];
  shiftStartTime?: string;
  paymentOptions?: string[];
  nightlyThreshold?: number;
}

const DEFAULT_COLOR_SCHEME: ColorScheme = {
  primary: '#7c3aed',
  secondary: '#6366f1',
  accent: '#f59e0b',
  surface: '#f0f2f5',
};

const DEFAULT_BRAND: BrandSettings = {
  hotelName: 'Grand Horizon Hotel',
  hotelSubtitle: 'Resort Concierge',
  logoUrl: '',
  brandColor: '#7c3aed',
  faviconUrl: '',
};

const DEFAULT_SETTINGS: AppSettings = {
  layoutCategories: ['Standard Room', 'Deluxe Room', 'Grand Suite', 'Presidential Penthouse'],
  currencyCode: 'PHP',
  currencySymbol: '₱',
  minStayHours: 3,
  checkInTimes: [],
  checkOutTimes: [],
  localServerUrl: '',
  announcement: {
    text: '',
    enabled: false,
    type: 'promo'
  },
  brand: DEFAULT_BRAND,
  colorScheme: DEFAULT_COLOR_SCHEME,
  paymentOptions: ['Cash', 'Credit Card', 'Debit Card', 'GCash', 'Bank Transfer'],
};

const SETTINGS_KEY = 'link-fortress-settings';

export function getSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        layoutCategories: parsed.layoutCategories || DEFAULT_SETTINGS.layoutCategories,
        currencyCode: parsed.currencyCode || DEFAULT_SETTINGS.currencyCode,
        currencySymbol: parsed.currencySymbol || DEFAULT_SETTINGS.currencySymbol,
        minStayHours: parsed.minStayHours ?? DEFAULT_SETTINGS.minStayHours,
        checkInTimes: parsed.checkInTimes || DEFAULT_SETTINGS.checkInTimes,
        checkOutTimes: parsed.checkOutTimes || DEFAULT_SETTINGS.checkOutTimes,
        localServerUrl: parsed.localServerUrl || DEFAULT_SETTINGS.localServerUrl,
        announcement: parsed.announcement || DEFAULT_SETTINGS.announcement,
        brand: { ...DEFAULT_BRAND, ...(parsed.brand || {}) },
        colorScheme: { ...DEFAULT_COLOR_SCHEME, ...((parsed.colorScheme || {}) as Partial<ColorScheme>) },
        paymentOptions: parsed.paymentOptions || DEFAULT_SETTINGS.paymentOptions,
      };
    }
  } catch (e) {
    console.error('Failed to parse app settings, falling back to defaults', e);
  }
  return DEFAULT_SETTINGS;
}

export async function fetchSettingsFromSupabase(): Promise<AppSettings> {
  try {
    const { data, error } = await supabase
      .from('hotel_settings')
      .select('value')
      .eq('key', 'resort_settings')
      .maybeSingle();

    if (error) {
      console.warn('Could not read settings from Supabase:', error.message);
      return getSettings();
    }

    if (data && data.value) {
      const parsed = data.value as Record<string, any>;
      const merged: AppSettings = {
        layoutCategories: (parsed.layoutCategories as string[]) || DEFAULT_SETTINGS.layoutCategories,
        currencyCode: (parsed.currencyCode as string) || DEFAULT_SETTINGS.currencyCode,
        currencySymbol: (parsed.currencySymbol as string) || DEFAULT_SETTINGS.currencySymbol,
        minStayHours: (parsed.minStayHours as number) ?? DEFAULT_SETTINGS.minStayHours,
        checkInTimes: (parsed.checkInTimes as string[]) || DEFAULT_SETTINGS.checkInTimes,
        checkOutTimes: (parsed.checkOutTimes as string[]) || DEFAULT_SETTINGS.checkOutTimes,
        localServerUrl: (parsed.localServerUrl as string) || DEFAULT_SETTINGS.localServerUrl,
        announcement: (parsed.announcement as AppSettings['announcement']) || DEFAULT_SETTINGS.announcement,
        brand: { ...DEFAULT_BRAND, ...((parsed.brand || {}) as Partial<BrandSettings>) },
        colorScheme: { ...DEFAULT_COLOR_SCHEME, ...((parsed.colorScheme || {}) as Partial<ColorScheme>) },
        holidays: parsed.holidays || undefined,
        shiftStartTime: parsed.shiftStartTime || undefined,
        paymentOptions: (parsed.paymentOptions as string[]) || DEFAULT_SETTINGS.paymentOptions,
        nightlyThreshold: (parsed.nightlyThreshold as number) ?? DEFAULT_SETTINGS.nightlyThreshold,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch (e) {
    console.error('Failed to fetch settings from Supabase:', e);
  }
  return getSettings();
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const { error } = await supabase
    .from('hotel_settings')
    .upsert({
      key: 'resort_settings',
      value: settings,
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

  if (error) {
    console.warn('Failed to save settings to database, saving locally only:', error.message);
  }

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event('hotel-settings-updated'));
}

export function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '124 58 237';
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
}
