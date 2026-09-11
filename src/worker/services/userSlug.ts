// Same lowercase base32 as the OPDS token, for the same reason: the slug is
// typed by hand on an e-ink keyboard.
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
export const USER_SLUG_LENGTH = 6;

export const generateUserSlug = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(USER_SLUG_LENGTH));
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 31]!;
  return out;
};
