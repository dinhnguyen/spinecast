import type { Locale } from '../../shared/apiTypes';

export const STORAGE_KEY = 'spinecast.locale';

export const isLocale = (v: unknown): v is Locale => v === 'vi' || v === 'en';

export const localeFromNavigator = (lang: string | undefined): Locale => (lang?.toLowerCase().startsWith('vi') ? 'vi' : 'en');

export const resolveInitialLocale = (): Locale => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // storage blocked: fall through to navigator
  }
  return localeFromNavigator(typeof navigator === 'undefined' ? undefined : navigator.language);
};

export const storeLocale = (locale: Locale): void => {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // storage blocked: nothing to persist
  }
};
