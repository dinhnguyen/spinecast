import { describe, expect, it } from 'vitest';
import { pickQuote, QUOTES } from './quotes';

const HOSTS = /^https:\/\/(www\.)?(gutenberg\.org|vi\.wikisource\.org|en\.wikisource\.org)\//;

describe.each(['vi', 'en'] as const)('quotes %s', (locale) => {
  const pool = QUOTES[locale];

  it('has at least 40 entries', () => {
    expect(pool.length).toBeGreaterThanOrEqual(40);
  });

  it('every entry is complete and sourced', () => {
    for (const q of pool) {
      expect(q.text.trim().length).toBeGreaterThan(0);
      expect(q.text.length).toBeLessThanOrEqual(180);
      expect(q.work.trim().length).toBeGreaterThan(0);
      expect(q.author.trim().length).toBeGreaterThan(0);
      expect(q.source).toMatch(HOSTS);
    }
  });

  it('has no duplicate texts', () => {
    expect(new Set(pool.map((q) => q.text)).size).toBe(pool.length);
  });

  it('picks deterministically for a fixed random', () => {
    expect(pickQuote(locale, () => 0)).toBe(pool[0]);
    expect(pickQuote(locale, () => 0.999999)).toBe(pool[pool.length - 1]);
  });
});
