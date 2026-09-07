export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  margin: 'hep' | 'vua' | 'rong';
  font: 'serif' | 'sans' | 'goc';
  theme: 'sang' | 'giay' | 'toi';
  flow: 'paginated' | 'scrolled';
}

export const DEFAULT_SETTINGS: ReaderSettings = { fontSize: 17.5, lineHeight: 1.6, margin: 'vua', font: 'serif', theme: 'giay', flow: 'paginated' };
const KEY = 'spinecast.reader';

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export const loadSettings = (): ReaderSettings => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<ReaderSettings>;
    return {
      fontSize: clamp(Number(p.fontSize ?? DEFAULT_SETTINGS.fontSize), 12, 32),
      lineHeight: clamp(Number(p.lineHeight ?? DEFAULT_SETTINGS.lineHeight), 1.2, 2.2),
      margin: p.margin === 'hep' || p.margin === 'rong' ? p.margin : 'vua',
      font: p.font === 'sans' || p.font === 'goc' ? p.font : 'serif',
      theme: p.theme === 'sang' || p.theme === 'toi' ? p.theme : 'giay',
      flow: p.flow === 'scrolled' ? 'scrolled' : 'paginated',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (s: ReaderSettings): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage may be unavailable; settings then live for the session only
  }
};

export const themeColors = (theme: ReaderSettings['theme']): { bg: string; fg: string } =>
  theme === 'sang' ? { bg: '#ffffff', fg: '#222222' } : theme === 'toi' ? { bg: '#221e1a', fg: '#d9d2c7' } : { bg: '#f6f1e8', fg: '#2a251f' };

const FONTS: Record<Exclude<ReaderSettings['font'], 'goc'>, string> = {
  serif: "'Source Serif 4', Georgia, 'Times New Roman', serif",
  sans: "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif",
};

export const sectionCss = (s: ReaderSettings): string => {
  const { bg, fg } = themeColors(s.theme);
  const font = s.font === 'goc' ? '' : `font-family: ${FONTS[s.font]} !important;`;
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html { color: ${fg}; background: ${bg}; font-size: ${s.fontSize}px; line-height: ${s.lineHeight}; ${font} }
    body { color: inherit; background: transparent; }
    p, li, div, blockquote, h1, h2, h3, h4, h5, h6 { ${font} }
    a { color: #8a5a2b; }
    img, svg { max-width: 100%; height: auto; }
  `;
};

const MARGIN: Record<ReaderSettings['margin'], string> = { hep: '24px', vua: '40px', rong: '56px' };

export const rendererAttributes = (s: ReaderSettings): Record<string, string> => ({
  flow: s.flow,
  margin: MARGIN[s.margin],
  gap: '7%',
  'max-inline-size': '720px',
  'max-column-count': '2',
});
