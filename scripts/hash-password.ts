import { webcrypto } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error('usage: tsx scripts/hash-password.ts <password>');
  process.exit(1);
}
const enc = new TextEncoder();
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const key = await webcrypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await webcrypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256);
const b64 = (u: Uint8Array): string => Buffer.from(u).toString('base64');
console.log(`pbkdf2$100000$${b64(salt)}$${b64(new Uint8Array(bits))}`);
