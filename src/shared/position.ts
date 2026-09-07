export interface Position {
  pctQ: number;
  spine: number;
  xpath?: string;
  para?: number;
  anchor?: string;
  page?: number;
  pages?: number;
  observedAt?: number;
}

export const PCT_Q_MAX = 1_000_000;
export const XPATH_MAX_BYTES = 120;
export const ANCHOR_MAX_BYTES = 48;
// Bookmark identity is derived from the xpath (id = sha256(xpath)[:16]), so a
// bookmark xpath must not be truncated the way a progress xpath is: two distinct
// positions truncating to the same string would collide on the same id. Shared
// here (rather than only in the worker) so the web client can ask for this wider
// budget too, instead of reusing the progress path's 120-byte cap.
export const BOOKMARK_XPATH_MAX = 512;

const byteLength = (s: string): number => new TextEncoder().encode(s).length;

const KO_RE = /^\/body\/DocFragment\[(\d+)\]\/body(?:\/(.*?))?(?:\.(\d+))?$/;

export const parseKoXPath = (xpath: string): { spine: number; inner: string; offset: number | null } | null => {
  const m = xpath.match(KO_RE);
  if (!m) return null;
  const frag = Number(m[1]);
  if (!Number.isInteger(frag) || frag < 1) return null;
  const inner = m[2] ?? '';
  const offsetStr = m[3];
  // an offset only makes sense after a text() step
  const offset = offsetStr !== undefined && /text\(\)(\[\d+\])?$/.test(inner) ? Number(offsetStr) : null;
  return { spine: frag - 1, inner, offset };
};

export const buildKoXPath = (spine: number, inner: string, offset?: number | null, maxBytes = XPATH_MAX_BYTES): string => {
  const head = `/body/DocFragment[${spine + 1}]/body`;
  const withInner = (i: string): string => (i ? `${head}/${i}` : head);
  const full = offset !== null && offset !== undefined ? `${withInner(inner)}.${offset}` : withInner(inner);
  if (byteLength(full) <= maxBytes) return full;
  const noText = withInner(inner.replace(/\/?text\(\)(\[\d+\])?$/, ''));
  if (byteLength(noText) <= maxBytes) return noText;
  // drop trailing steps until it fits; the position falls back to para/pctQ on the other side
  const steps = inner.replace(/\/?text\(\)(\[\d+\])?$/, '').split('/');
  while (steps.length > 0 && byteLength(withInner(steps.join('/'))) > maxBytes) steps.pop();
  return withInner(steps.join('/'));
};

const optUint = (v: unknown, name: string, max = 65535): number | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) throw new RangeError(`${name} out of range`);
  return v;
};

const optStr = (v: unknown, name: string, maxBytes: number): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || byteLength(v) > maxBytes) throw new RangeError(`${name} too long`);
  return v;
};

export const validatePosition = (input: unknown): Position => {
  if (typeof input !== 'object' || input === null) throw new RangeError('position must be an object');
  const o = input as Record<string, unknown>;
  const pctQ = o['pctQ'];
  if (typeof pctQ !== 'number' || !Number.isInteger(pctQ) || pctQ < 0 || pctQ > PCT_Q_MAX) throw new RangeError('pctQ out of range');
  const spine = optUint(o['spine'], 'spine');
  if (spine === undefined) throw new RangeError('spine required');
  const pos: Position = { pctQ, spine };
  const xpath = optStr(o['xpath'], 'xpath', XPATH_MAX_BYTES);
  const para = optUint(o['para'], 'para');
  const anchor = optStr(o['anchor'], 'anchor', ANCHOR_MAX_BYTES);
  const page = optUint(o['page'], 'page');
  const pages = optUint(o['pages'], 'pages');
  const observedAt = optUint(o['observedAt'], 'observedAt', Number.MAX_SAFE_INTEGER);
  if (xpath !== undefined) pos.xpath = xpath;
  if (para !== undefined) pos.para = para;
  if (anchor !== undefined) pos.anchor = anchor;
  if (page !== undefined) pos.page = page;
  if (pages !== undefined) pos.pages = pages;
  if (observedAt !== undefined) pos.observedAt = observedAt;
  return pos;
};
