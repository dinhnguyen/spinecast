import { sha256Hex } from './crypto';

export { CLIPPING_TEXT_MAX, CLIPPING_NOTE_MAX, CLIPPING_CHAPTER_MAX, CLIPPING_CFI_MAX, HIGHLIGHT_COLORS, isHighlightColor } from '../../shared/clipping';
export type { HighlightColor } from '../../shared/clipping';

// The server's contract: id = first 16 hex chars of SHA-256(created_at_decimal + text).
// Both inputs are immutable, so editing a note leaves the id alone.
export const clippingIdFor = async (createdAt: number, text: string): Promise<string> =>
  (await sha256Hex(`${createdAt}${text}`)).slice(0, 16);
