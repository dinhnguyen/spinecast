import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(path.join(import.meta.dirname, rel), 'utf8');

const tokens = (): Record<string, string> => {
  const css = read('./styles.css');
  const block = css.slice(css.indexOf('@theme'), css.indexOf('}', css.indexOf('@theme')));
  return Object.fromEntries([...block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1]!, m[2]!]));
};

const srgb = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
};
export const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

// WCAG 2.2 AA: 4.5:1 for text under 24px, 3:1 for the boundary of a control
// whose shape is the only thing identifying it (1.4.11).
const TEXT: [string, string][] = [
  ['ink', 'bg'], ['ink', 'surface'],
  ['muted', 'bg'], ['muted', 'surface'],
  ['faint', 'bg'], ['faint', 'surface'],
  ['accent', 'bg'], ['accent', 'surface'],
  ['accent-ink', 'accent-soft'],
  ['on-accent', 'accent'],
  ['ok', 'surface'], ['warn', 'surface'], ['danger', 'surface'],
  ['ok', 'ok-soft'], ['warn', 'warn-soft'], ['danger', 'danger-soft'],
];

const CONTROL: [string, string][] = [['control', 'bg'], ['control', 'surface']];

describe('palette contrast', () => {
  const t = tokens();

  it('reads every token it checks', () => {
    for (const name of [...new Set([...TEXT.flat(), ...CONTROL.flat()])]) expect(t[name], name).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(TEXT)('%s on %s carries text at AA', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CONTROL)('%s on %s outlines a control at 3:1', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
  });

  it('steps the reading calendar from lightest to darkest, with visible gaps', () => {
    const ramp = [0, 1, 2, 3, 4].map((n) => t[`heat-${n}`]!);
    for (const hex of ramp) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    for (let i = 1; i < ramp.length; i++) {
      // Five steps in one hue cannot each clear 3:1, so this is a legibility floor,
      // not an AA claim - every square also carries a date and duration label.
      expect(contrast(ramp[i - 1]!, ramp[i]!), `heat-${i - 1} to heat-${i}`).toBeGreaterThanOrEqual(1.35);
    }
    expect(contrast(ramp[4]!, t['surface']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ramp[0]!, t['surface']!)).toBeLessThan(1.4);
  });

  it('keeps ink, muted and faint as three distinguishable levels', () => {
    const [ink, muted, faint] = [t['ink']!, t['muted']!, t['faint']!].map((c) => contrast(c, t['bg']!));
    expect(ink).toBeGreaterThan(muted! * 1.4);
    expect(muted).toBeGreaterThan(faint! * 1.25);
  });
});

describe('mockup palette', () => {
  it('matches the app tokens, so the artboards are not drawn in stale colours', () => {
    const gen = read('../../docs/design/mockups/gen.mjs');
    const block = gen.slice(gen.indexOf('const T = {'), gen.indexOf('};', gen.indexOf('const T = {')));
    const mock = Object.fromEntries([...block.matchAll(/(\w+):\s*'(#[0-9a-f]{6})'/g)].map((m) => [m[1]!, m[2]!]));
    const t = tokens();
    // gen.mjs uses camelCase for the compound names the CSS spells with dashes
    const same = (cssName: string, genName: string) => expect(mock[genName], genName).toBe(t[cssName]);
    for (const n of ['bg', 'surface', 'ink', 'muted', 'faint', 'border', 'control', 'accent', 'ok', 'warn', 'danger', 'dark']) same(n, n);
    same('accent-ink', 'accentInk');
    same('accent-soft', 'accentSoft');
  });
});
