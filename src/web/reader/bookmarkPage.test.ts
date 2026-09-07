import { describe, expect, it } from 'vitest';
import type { BookmarkDto } from '../../shared/apiTypes';
import { bookmarkOnPage } from './bookmarkPage';

const at = (id: string, percentage: number): BookmarkDto => ({ id, xpath: `/x/${id}`, percentage, summary: null, si: null, chapter: null, updatedAt: 0 });

describe('bookmarkOnPage', () => {
  it('finds a bookmark within the fixed tolerance', () => {
    expect(bookmarkOnPage([at('a', 0.5005)], 0.5)?.id).toBe('a');
  });

  it('ignores one further than the fixed tolerance away', () => {
    expect(bookmarkOnPage([at('a', 0.52)], 0.5)).toBeNull();
  });

  it('applies the fixed tolerance at its boundary', () => {
    expect(bookmarkOnPage([at('a', 0.5015)], 0.5)?.id).toBe('a');
    expect(bookmarkOnPage([at('a', 0.5025)], 0.5)).toBeNull();
  });

  it('returns the closest when several are in range', () => {
    expect(bookmarkOnPage([at('far', 0.501), at('near', 0.5001)], 0.5)?.id).toBe('near');
  });

  it('returns null for an empty list and for a non-finite fraction', () => {
    expect(bookmarkOnPage([], 0.5)).toBeNull();
    // NaN already fails every `gap <= half` comparison on its own, so this assertion
    // documents the guard's intent rather than pinning it against the implementation.
    expect(bookmarkOnPage([at('a', 0.5)], Number.NaN)).toBeNull();
  });
});
