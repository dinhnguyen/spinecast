import { describe, expect, it, vi } from 'vitest';
import { BOOKMARK_XPATH_MAX, XPATH_MAX_BYTES } from '../../shared/position';
import { positionFromLocation, remoteToPosition, restorePosition, shouldOfferRemote, type RestoreTarget } from './positionBridge';

const chapterDoc = (): Document =>
  new DOMParser().parseFromString('<html><body><h1 id="c1">C1</h1><div><p>one</p><p>two words here</p><p>three</p></div></body></html>', 'text/html');

const fakeView = (docs: Document[]): RestoreTarget & { calls: unknown[] } => {
  const calls: unknown[] = [];
  let current = 0;
  return {
    calls,
    book: { sections: { length: docs.length } },
    goTo: async (i: number) => { current = i; calls.push(['goTo', i]); },
    goToFraction: async (f: number) => { calls.push(['goToFraction', f]); },
    goToTextStart: async () => { calls.push(['start']); },
    getSectionFractions: () => docs.map((_, i) => i / docs.length),
    renderer: {
      getContents: () => [{ doc: docs[current]!, index: current }],
      goTo: async (t) => { calls.push(['rgoTo', t.index, typeof t.anchor === 'function' ? t.anchor(docs[t.index]!) : t.anchor]); },
    },
  };
};

describe('positionFromLocation', () => {
  it('builds a koreader xpath, para, anchor and pctQ from a range', () => {
    const doc = chapterDoc();
    const p2 = doc.querySelectorAll('p')[1]!;
    const range = doc.createRange();
    range.setStart(p2.firstChild!, 4);
    range.collapse(true);
    const pos = positionFromLocation({ index: 2, range, sectionFraction: 0.5, fraction: 0.4867, tocLabel: null, pageInSection: 3, pagesInSection: 12 });
    expect(pos).toEqual({ pctQ: 486700, spine: 2, xpath: '/body/DocFragment[3]/body/div[1]/p[2]/text()[1].4', para: 3, anchor: 'c1', page: 3, pages: 12 });
  });

  it('keeps a deeply nested xpath intact under the wider bookmark budget but truncates it under the default', () => {
    // 30 levels of nesting produces a path over 120 bytes but under 512, so this
    // pins that the bookmark call site (which asks for BOOKMARK_XPATH_MAX) gets the
    // full, collision-safe path while the default (progress) budget still truncates.
    const depth = 30;
    let html = 'leaf';
    for (let i = 0; i < depth; i++) html = `<div>${html}</div>`;
    const doc = new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html');
    let el = doc.body.firstElementChild!;
    while (el.firstElementChild) el = el.firstElementChild;
    const range = doc.createRange();
    range.setStart(el.firstChild!, 0);
    range.collapse(true);
    const loc = { index: 0, range, sectionFraction: 0, fraction: 0, tocLabel: null, pageInSection: null, pagesInSection: null };

    const full = `/body/DocFragment[1]/body/${'div[1]/'.repeat(depth)}text()[1].0`;
    expect(new TextEncoder().encode(full).length).toBeGreaterThan(XPATH_MAX_BYTES);
    expect(new TextEncoder().encode(full).length).toBeLessThanOrEqual(BOOKMARK_XPATH_MAX);

    expect(positionFromLocation(loc, BOOKMARK_XPATH_MAX).xpath).toBe(full);

    const defaultPos = positionFromLocation(loc);
    expect(defaultPos.xpath).not.toBe(full);
    expect(new TextEncoder().encode(defaultPos.xpath!).length).toBeLessThanOrEqual(XPATH_MAX_BYTES);
  });
});

describe('restorePosition', () => {
  it('resolves an xpath to a range in the right section', async () => {
    const v = fakeView([chapterDoc(), chapterDoc()]);
    const r = await restorePosition(v, { pctQ: 1, spine: 1, xpath: '/body/DocFragment[2]/body/div[1]/p[2]/text()[1].4' });
    expect(r).toBe('xpath');
    const last = v.calls.at(-1) as [string, number, Range];
    expect(last[0]).toBe('rgoTo');
    expect(last[1]).toBe(1);
    expect(last[2].startContainer.textContent).toBe('two words here');
    expect(last[2].startOffset).toBe(4);
  });

  it('falls back to para when the xpath does not resolve', async () => {
    const v = fakeView([chapterDoc()]);
    const r = await restorePosition(v, { pctQ: 1, spine: 0, xpath: '/body/DocFragment[1]/body/div[9]/p[1]', para: 4 });
    expect(r).toBe('para');
    const last = v.calls.at(-1) as [string, number, Element];
    expect(last[2].textContent).toBe('three');
  });

  it('falls back to a fraction inside the spine item, then to the global fraction', async () => {
    const v = fakeView([chapterDoc(), chapterDoc()]);
    expect(await restorePosition(v, { pctQ: 750000, spine: 1 })).toBe('spine');
    expect(v.calls.at(-1)).toEqual(['rgoTo', 1, 0.5]);
    expect(await restorePosition(v, { pctQ: 250000, spine: 9 })).toBe('fraction');
    expect(v.calls.at(-1)).toEqual(['goToFraction', 0.25]);
  });
});

describe('remote helpers', () => {
  it('converts a remote row with and without a rich position', () => {
    const base = { document: 'd', percentage: 0.4867, progress: '/body/DocFragment[8]/body/div[2]/p[4]/text()[1].96', device: 'CrossPoint', deviceId: 'x', timestamp: 10 };
    expect(remoteToPosition({ ...base, position: { pctQ: 486700, spine: 7, para: 96 } })).toEqual({ pctQ: 486700, spine: 7, para: 96 });
    expect(remoteToPosition({ ...base, position: null })).toEqual({ pctQ: 486700, spine: 7, xpath: base.progress });
  });

  it('clamps a remote percentage outside 0..1 into a valid pctQ', () => {
    const base = { document: 'd', progress: '', device: 'CrossPoint', deviceId: 'x', timestamp: 10, position: null };
    expect(remoteToPosition({ ...base, percentage: 1.004 }).pctQ).toBe(1_000_000);
    expect(remoteToPosition({ ...base, percentage: -0.2 }).pctQ).toBe(0);
  });

  it('offers the remote position only when newer and different', () => {
    const local = { pctQ: 400000, spine: 3, updatedAt: 1000, lastPushedAt: null, deviceId: null, observedAt: null };
    const remote = { document: 'd', percentage: 0.41, progress: '', device: 'd', deviceId: 'x', timestamp: 1100, position: { pctQ: 410000, spine: 3 } };
    expect(shouldOfferRemote(local, remote)).toBe(true);
    expect(shouldOfferRemote(local, { ...remote, timestamp: 1030 })).toBe(false);
    expect(shouldOfferRemote(local, { ...remote, position: { pctQ: 402000, spine: 3 } })).toBe(false);
    expect(shouldOfferRemote(null, remote)).toBe(true);
    expect(shouldOfferRemote(local, null)).toBe(false);
  });
});
