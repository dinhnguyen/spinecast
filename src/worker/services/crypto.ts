const enc = new TextEncoder();
const dec = new TextDecoder();
const PBKDF2_ITER = 100_000;

const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const toHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const randomHex = (bytes: number): string =>
  toHex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);

const pbkdf2 = async (password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> => {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${toB64(salt)}$${toB64(hash)}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, iterStr, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iterStr || !saltB64 || !hashB64) return false;
  try {
    const hash = new Uint8Array(await pbkdf2(password, fromB64(saltB64), Number(iterStr)));
    const expected = fromB64(hashB64);
    if (hash.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < hash.length; i++) diff |= hash[i]! ^ expected[i]!;
    return diff === 0;
  } catch {
    return false;
  }
};

// Workers' WebCrypto supports MD5 digests (non-standard); KOReader clients send md5(password).
export const md5Hex = async (data: Uint8Array | string): Promise<string> => {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  return toHex(await crypto.subtle.digest('MD5', bytes));
};

export const sha256Hex = async (data: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', enc.encode(data)));

const importAesKey = (keyB64: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['encrypt', 'decrypt']);

export const encryptString = async (plain: string, keyB64: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(keyB64);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  return `${toB64(iv)}.${toB64(ct)}`;
};

export const decryptString = async (sealed: string, keyB64: string): Promise<string> => {
  const [ivB64, ctB64] = sealed.split('.');
  if (!ivB64 || !ctB64) throw new Error('malformed ciphertext');
  const key = await importAesKey(keyB64);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ctB64));
  return dec.decode(plain);
};
