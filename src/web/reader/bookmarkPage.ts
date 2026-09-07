import type { BookmarkDto } from '../../shared/apiTypes';

// Two tenths of a percent of the book. foliate-js only reports a page count per
// section, not for the whole book, while `fraction` here is always whole-book, so
// a page-based tolerance would compare mismatched units. A fixed tolerance is the
// only option until the reader can report a whole-book page count.
const FALLBACK_HALF_PAGE = 0.002;

// An exact id match cannot work: the same spot can produce a different xpath after
// a reflow, so the toggle asks "is this page marked" rather than "is this node marked".
export const bookmarkOnPage = (bookmarks: BookmarkDto[], fraction: number): BookmarkDto | null => {
  if (!Number.isFinite(fraction)) return null;
  let best: BookmarkDto | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const b of bookmarks) {
    const gap = Math.abs(b.percentage - fraction);
    if (gap <= FALLBACK_HALF_PAGE && gap < bestGap) {
      best = b;
      bestGap = gap;
    }
  }
  return best;
};
