import { paragraphBlocks } from './xpath';

interface Piece {
  node: Text;
  start: number;
}

const SKIPPED_TAGS = new Set(['script', 'style']);

const textPieces = (root: Node): { whole: string; pieces: Piece[] } => {
  const pieces: Piece[] = [];
  let whole = '';
  const walk = (n: Node): void => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n as Text;
      pieces.push({ node: t, start: whole.length });
      whole += t.data;
      return;
    }
    if (n.nodeType === Node.ELEMENT_NODE && SKIPPED_TAGS.has((n as Element).tagName.toLowerCase())) return;
    for (const child of Array.from(n.childNodes)) walk(child);
  };
  walk(root);
  return { whole, pieces };
};

const locate = (pieces: Piece[], offset: number): { node: Text; offset: number } | null => {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i]!;
    if (offset >= p.start) return { node: p.node, offset: offset - p.start };
  }
  return null;
};

// Collapses each run of whitespace in `raw` to a single space, and records, for every
// character of the normalized string, the raw span (start inclusive, end exclusive) it
// came from. That lets a match found in the normalized string be translated back to the
// exact raw offsets, whitespace included, instead of shifting every offset by collapsing
// `whole` itself.
const normalizeWithMap = (raw: string): { normalized: string; starts: number[]; ends: number[] } => {
  let normalized = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (/\s/.test(ch)) {
      const runStart = i;
      while (i < raw.length && /\s/.test(raw[i]!)) i++;
      normalized += ' ';
      starts.push(runStart);
      ends.push(i);
    } else {
      normalized += ch;
      starts.push(i);
      ends.push(i + 1);
      i++;
    }
  }
  return { normalized, starts, ends };
};

const rangeIn = (root: Node, needle: string): Range | null => {
  const { whole, pieces } = textPieces(root);
  const { normalized, starts, ends } = normalizeWithMap(whole);
  const at = normalized.indexOf(needle);
  if (at === -1) return null;
  const rawStart = starts[at]!;
  const rawEnd = ends[at + needle.length - 1]!;
  const from = locate(pieces, rawStart);
  const to = locate(pieces, rawEnd);
  if (!from || !to) return null;
  const doc = root.ownerDocument ?? (root as Document);
  const range = doc.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
};

// Tier 2 of the three-tier resolution in the design doc: a clipping that arrived
// from a device carries no cfi, only the portable anchors. `para` is 1-based over
// paragraphBlocks, the same notion phase 1 restores positions with.
export const findRangeByParaAndText = (doc: Document, para: number | null, text: string): Range | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // The stored text may have been whitespace-normalized on the device while the
  // document keeps its source line breaks; normalize both sides before matching.
  const needle = trimmed.replace(/\s+/g, ' ');
  const blocks = paragraphBlocks(doc.body);
  const block = para !== null && para >= 1 ? blocks[para - 1] : undefined;
  if (block) {
    const hit = rangeIn(block, needle);
    if (hit) return hit;
  }
  return rangeIn(doc.body, needle);
};
