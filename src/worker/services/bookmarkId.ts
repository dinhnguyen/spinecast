import { sha256Hex } from './crypto';

export { BOOKMARK_XPATH_MAX } from '../../shared/position';
export const BOOKMARK_SUMMARY_MAX = 256;

// The server's contract: id = first 16 hex chars of SHA-256(xpath), so re-adding
// the same bookmark is idempotent and a delete needs no extra device state.
export const bookmarkIdFor = async (xpath: string): Promise<string> => (await sha256Hex(xpath)).slice(0, 16);
