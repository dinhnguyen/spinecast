import { describe, expect, it } from 'vitest';
import { buildKoXPath, parseKoXPath, validatePosition } from './position';

describe('KoXPath codec', () => {
  it('parses a KOReader xpath with text offset', () => {
    expect(parseKoXPath('/body/DocFragment[8]/body/div[2]/p[4]/text()[1].96')).toEqual({
      spine: 7,
      inner: 'div[2]/p[4]/text()[1]',
      offset: 96,
    });
  });

  it('parses an element-only xpath', () => {
    expect(parseKoXPath('/body/DocFragment[16]/body/div[1]/p[143]')).toEqual({ spine: 15, inner: 'div[1]/p[143]', offset: null });
  });

  it('returns null for foreign strings', () => {
    expect(parseKoXPath('epubcfi(/6/4!/4/2)')).toBeNull();
    expect(parseKoXPath('/body/DocFragment[x]/body/p')).toBeNull();
  });

  it('builds and round-trips', () => {
    const x = buildKoXPath(7, 'div[2]/p[4]/text()[1]', 96);
    expect(x).toBe('/body/DocFragment[8]/body/div[2]/p[4]/text()[1].96');
    expect(parseKoXPath(x)).toEqual({ spine: 7, inner: 'div[2]/p[4]/text()[1]', offset: 96 });
  });

  it('keeps xpath within 120 bytes by dropping the text step first', () => {
    const deep = Array.from({ length: 20 }, (_, i) => `div[${i + 1}]`).join('/') + '/p[3]/text()[1]';
    const x = buildKoXPath(0, deep, 12);
    expect(new TextEncoder().encode(x).length).toBeLessThanOrEqual(120);
    expect(x.endsWith('.12')).toBe(false);
  });
});

describe('validatePosition', () => {
  it('accepts a full position and strips unknown fields', () => {
    expect(validatePosition({ pctQ: 486700, spine: 7, xpath: '/body/DocFragment[8]/body/p[1]', para: 96, anchor: 'a', observedAt: 1700, extra: 1 })).toEqual({
      pctQ: 486700, spine: 7, xpath: '/body/DocFragment[8]/body/p[1]', para: 96, anchor: 'a', observedAt: 1700,
    });
  });

  it('omits observedAt when the client sends none', () => {
    expect(validatePosition({ pctQ: 1, spine: 0 })).toEqual({ pctQ: 1, spine: 0 });
  });

  it('rejects out-of-range values', () => {
    expect(() => validatePosition({ pctQ: 1_000_001, spine: 0 })).toThrow(RangeError);
    expect(() => validatePosition({ pctQ: 1, spine: -1 })).toThrow(RangeError);
    expect(() => validatePosition({ pctQ: 1, spine: 0, anchor: 'x'.repeat(49) })).toThrow(RangeError);
    expect(() => validatePosition({ pctQ: 1, spine: 0, xpath: 'x'.repeat(121) })).toThrow(RangeError);
  });
});
