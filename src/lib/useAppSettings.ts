import { useState, useEffect, useCallback } from 'react';
import { getSettings, saveSettings, fetchSettingsFromSupabase, AppSettings, hexToRgb } from './settings';

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  useEffect(() => {
    fetchSettingsFromSupabase().then((s) => {
      setSettings(s);
      applyColorScheme(s);
    });

    const handler = () => {
      const s = getSettings();
      setSettings(s);
      applyColorScheme(s);
    };
    window.addEventListener('hotel-settings-updated', handler);
    return () => window.removeEventListener('hotel-settings-updated', handler);
  }, []);

  const updateSettings = useCallback(async (updated: AppSettings) => {
    setSettings(updated);
    applyColorScheme(updated);
    await saveSettings(updated);
  }, []);

  return { settings, updateSettings };
}

export function applyColorScheme(settings: AppSettings) {
  // Apply brand color as CSS variables (from colorScheme.primary)
  const primaryRgb = hexToRgb(settings.colorScheme.primary);
  document.documentElement.style.setProperty('--brand-500', primaryRgb);
  document.documentElement.style.setProperty('--brand-600', primaryRgb);

  // Apply all color scheme values as CSS variables
  document.documentElement.style.setProperty('--color-primary', settings.colorScheme.primary);
  document.documentElement.style.setProperty('--color-secondary', settings.colorScheme.secondary);
  document.documentElement.style.setProperty('--color-accent', settings.colorScheme.accent);
  document.documentElement.style.setProperty('--color-surface-tint', settings.colorScheme.surface);

  // Update document title
  document.title = settings.brand.hotelName || 'Hotel Management';

  // Update favicon (replace existing)
  const existingFavicon = document.querySelector<HTMLLinkElement>('link[rel*="icon"]');
  if (settings.brand.faviconUrl) {
    if (existingFavicon) {
      existingFavicon.href = settings.brand.faviconUrl;
    } else {
      const link = document.createElement('link');
      link.rel = 'shortcut icon';
      link.type = 'image/x-icon';
      link.href = settings.brand.faviconUrl;
      document.getElementsByTagName('head')[0].appendChild(link);
    }
  }
}
