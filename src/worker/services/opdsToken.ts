import { sha256Hex } from './crypto';

// Lowercase base32 so the token can be typed on an e-ink keyboard.
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
export const OPDS_TOKEN_LENGTH = 6;

export const generateOpdsToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(OPDS_TOKEN_LENGTH));
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 31]!;
  return out;
};

export const hashOpdsToken = (token: string): Promise<string> => sha256Hex(token);
