import { describe, expect, it } from 'vitest';
import { ICONS } from './icons';

describe('icons', () => {
  it('has every icon used by the mockups', () => {
    for (const k of ['upload', 'list', 'type', 'gear', 'back', 'sync', 'check', 'alert', 'bookmark', 'highlight', 'chev', 'library', 'chart', 'user', 'eye', 'search', 'plus', 'copy', 'x', 'logout', 'more', 'share', 'cloud', 'key'])
      expect(ICONS[k as keyof typeof ICONS].length).toBeGreaterThan(0);
  });

  // The svg sets fill="none" and stroke="currentColor"; a node may override the
  // fill (KeyRound fills its bow) but never with a colour of its own, or the icon
  // would stop following the text colour around the palette.
  it('draws only shapes that follow the text colour', () => {
    for (const nodes of Object.values(ICONS))
      for (const [tag, attrs] of nodes) {
        expect(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']).toContain(tag);
        if ('fill' in attrs) expect(attrs['fill']).toBe('currentColor');
      }
  });
});
