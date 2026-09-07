import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, rendererAttributes, saveSettings, sectionCss, themeColors } from './readerSettings';

describe('readerSettings', () => {
  it('loads defaults when storage is empty or corrupt', () => {
    localStorage.clear();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    localStorage.setItem('spinecast.reader', '{bad');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips and clamps values', () => {
    saveSettings({ ...DEFAULT_SETTINGS, fontSize: 99, theme: 'toi' });
    expect(loadSettings()).toMatchObject({ fontSize: 32, theme: 'toi' });
  });

  it('builds section css from settings', () => {
    const css = sectionCss({ ...DEFAULT_SETTINGS, font: 'sans', fontSize: 18, lineHeight: 1.7, theme: 'giay' });
    expect(css).toContain('font-size: 18px');
    expect(css).toContain('line-height: 1.7');
    expect(css).toContain("'Source Sans 3'");
    expect(css).toContain('#f6f1e8');
    expect(sectionCss({ ...DEFAULT_SETTINGS, font: 'goc' })).not.toContain('font-family');
  });

  it('maps themes and renderer attributes', () => {
    expect(themeColors('sang')).toEqual({ bg: '#ffffff', fg: '#222222' });
    expect(themeColors('giay')).toEqual({ bg: '#f6f1e8', fg: '#2a251f' });
    expect(themeColors('toi')).toEqual({ bg: '#221e1a', fg: '#d9d2c7' });
    expect(rendererAttributes({ ...DEFAULT_SETTINGS, margin: 'rong', flow: 'scrolled' })).toEqual({ flow: 'scrolled', margin: '56px', gap: '7%', 'max-inline-size': '720px', 'max-column-count': '2' });
  });
});
