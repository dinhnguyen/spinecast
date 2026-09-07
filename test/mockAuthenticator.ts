import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

// isoBase64URL and the WebAuthn types both want a Uint8Array over a plain
// ArrayBuffer, which TextEncoder.encode does not promise.
type Bytes = Uint8Array<ArrayBuffer>;
const utf8 = (s: string): Bytes => Uint8Array.from(new TextEncoder().encode(s));

const concat = (...parts: Bytes[]): Bytes => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
};

const sha256 = async (data: Bytes | string): Promise<Bytes> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? utf8(data) : data));

const u32be = (n: number): Bytes => new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
const u16be = (n: number): Bytes => new Uint8Array([(n >>> 8) & 0xff, n & 0xff]);

// A CBOR encoder for exactly the shapes an attestationObject needs: small
// ints, byte strings, text strings and definite-length maps. Test-only.
const cborHead = (major: number, n: number): Bytes => {
  if (n < 24) return new Uint8Array([(major << 5) | n]);
  if (n < 256) return new Uint8Array([(major << 5) | 24, n]);
  if (n < 65536) return concat(new Uint8Array([(major << 5) | 25]), u16be(n));
  throw new Error('mock cbor: value too large');
};
const cborInt = (n: number): Bytes => (n >= 0 ? cborHead(0, n) : cborHead(1, -n - 1));
const cborBytes = (b: Bytes): Bytes => concat(cborHead(2, b.length), b);
const cborText = (s: string): Bytes => {
  const b = utf8(s);
  return concat(cborHead(3, b.length), b);
};
const cborMap = (entries: [Bytes, Bytes][]): Bytes => concat(cborHead(5, entries.length), ...entries.flat());

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

// WebCrypto signs ECDSA as raw r||s; WebAuthn expects DER, so convert.
const derSig = (raw: Bytes): Bytes => {
  const trim = (v: Bytes): Bytes => {
    let i = 0;
    while (i < v.length - 1 && v[i] === 0) i++;
    const t = v.subarray(i);
    return (t[0]! & 0x80) !== 0 ? concat(new Uint8Array([0]), t) : t;
  };
  const r = trim(raw.subarray(0, 32));
  const s = trim(raw.subarray(32));
  const body = concat(new Uint8Array([0x02, r.length]), r, new Uint8Array([0x02, s.length]), s);
  return concat(new Uint8Array([0x30, body.length]), body);
};

export interface MockAuthenticator {
  credentialId: string;
  publicKeyB64: string;
  register(args: { rpID: string; origin: string; challenge: string }): Promise<RegistrationResponseJSON>;
  assert(args: { rpID: string; origin: string; challenge: string; counter: number }): Promise<AuthenticationResponseJSON>;
}

export const createMockAuthenticator = async (): Promise<MockAuthenticator> => {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', keys.publicKey)) as JsonWebKey;
  const x = isoBase64URL.toBuffer(jwk.x!);
  const y = isoBase64URL.toBuffer(jwk.y!);
  const credentialIdBytes = crypto.getRandomValues(new Uint8Array(16));
  const credentialId = isoBase64URL.fromBuffer(credentialIdBytes);

  // COSE_Key: kty EC2, alg ES256, crv P-256, x, y
  const cosePublicKey = cborMap([
    [cborInt(1), cborInt(2)],
    [cborInt(3), cborInt(-7)],
    [cborInt(-1), cborInt(1)],
    [cborInt(-2), cborBytes(x)],
    [cborInt(-3), cborBytes(y)],
  ]);

  const clientData = (type: string, challenge: string, origin: string): { json: string; b64: string } => {
    const json = JSON.stringify({ type, challenge, origin, crossOrigin: false });
    return { json, b64: isoBase64URL.fromBuffer(utf8(json)) };
  };

  const authData = async (rpID: string, flags: number, counter: number, tail?: Bytes): Promise<Bytes> =>
    concat(await sha256(rpID), new Uint8Array([flags]), u32be(counter), ...(tail ? [tail] : []));

  return {
    credentialId,
    publicKeyB64: isoBase64URL.fromBuffer(cosePublicKey),

    async register({ rpID, origin, challenge }) {
      const attested = concat(new Uint8Array(16), u16be(credentialIdBytes.length), credentialIdBytes, cosePublicKey);
      const data = await authData(rpID, FLAG_UP | FLAG_UV | FLAG_AT, 0, attested);
      const attestationObject = cborMap([
        [cborText('fmt'), cborText('none')],
        [cborText('attStmt'), cborMap([])],
        [cborText('authData'), cborBytes(data)],
      ]);
      const cd = clientData('webauthn.create', challenge, origin);
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: cd.b64,
          attestationObject: isoBase64URL.fromBuffer(attestationObject),
          transports: ['internal'],
        },
      } as RegistrationResponseJSON;
    },

    async assert({ rpID, origin, challenge, counter }) {
      const data = await authData(rpID, FLAG_UP | FLAG_UV, counter);
      const cd = clientData('webauthn.get', challenge, origin);
      const signed = concat(data, await sha256(utf8(cd.json)));
      const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, signed));
      // No userHandle: login resolves the account from the credential id, so
      // nothing reads it, and v14 types it as an optional string.
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: cd.b64,
          authenticatorData: isoBase64URL.fromBuffer(data),
          signature: isoBase64URL.fromBuffer(derSig(raw)),
        },
      } as AuthenticationResponseJSON;
    },
  };
};
