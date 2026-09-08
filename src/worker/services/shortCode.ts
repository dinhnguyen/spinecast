const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const makeShortCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
};
