import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import { localeFromNavigator, resolveInitialLocale, STORAGE_KEY, storeLocale } from './locale';

describe('locale resolution', () => {
  afterEach(() => {
    localStorage.clear();
    vitest.restoreAllMocks();
  });

  it('maps navigator language', () => {
    expect(localeFromNavigator('vi-VN')).toBe('vi');
    expect(localeFromNavigator('vi')).toBe('vi');
    expect(localeFromNavigator('en-US')).toBe('en');
    expect(localeFromNavigator('fr')).toBe('en');
    expect(localeFromNavigator(undefined)).toBe('en');
  });

  it('prefers a stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'en');
    vitest.spyOn(navigator, 'language', 'get').mockReturnValue('vi-VN');
    expect(resolveInitialLocale()).toBe('en');
  });

  it('ignores garbage in storage', () => {
    localStorage.setItem(STORAGE_KEY, 'de');
    vitest.spyOn(navigator, 'language', 'get').mockReturnValue('vi-VN');
    expect(resolveInitialLocale()).toBe('vi');
  });

  it('stores', () => {
    storeLocale('en');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
  });
});
