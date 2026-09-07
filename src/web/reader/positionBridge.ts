import type { ProgressDto, RemoteProgressDto } from '../../shared/apiTypes';
import { buildKoXPath, parseKoXPath, PCT_Q_MAX, type Position } from '../../shared/position';
import type { ReaderLocation } from './FoliateView';
import { innerPathFromNode, nearestAnchor, paragraphBlocks, paragraphIndexOf, resolveInnerPath } from './xpath';

export type RestoreResult = 'xpath' | 'para' | 'spine' | 'fraction' | 'start';

export interface RestoreTarget {
  book: { sections: { length: number } };
  goTo(index: number): Promise<unknown>;
  goToFraction(f: number): Promise<void>;
  goToTextStart(): Promise<unknown>;
  getSectionFractions(): number[];
  renderer: {
    getContents(): { doc: Document; index: number }[];
    goTo(t: { index: number; anchor?: number | ((doc: Document) => Element | Range | null) }): Promise<void>;
  };
}

// validatePosition on the worker rejects a pctQ outside [0, PCT_Q_MAX] with a
// 400, and a remote row's `percentage` comes from an external sync client that
// may report slightly over 1.0 - so clamp instead of letting the save fail.
const toPctQ = (fraction: number): number => Math.max(0, Math.min(PCT_Q_MAX, Math.round(fraction * PCT_Q_MAX)));

export const positionFromLocation = (loc: ReaderLocation, xpathMaxBytes?: number): Position => {
  const node = loc.range.startContainer;
  const body = node.ownerDocument?.body;
  const pos: Position = { pctQ: toPctQ(loc.fraction), spine: loc.index };
  if (body) {
    const { inner } = innerPathFromNode(body, node);
    const offset = node.nodeType === Node.TEXT_NODE ? loc.range.startOffset : null;
    pos.xpath = buildKoXPath(loc.index, inner, offset, xpathMaxBytes);
    const para = paragraphIndexOf(body, node);
    if (para !== null) pos.para = para;
    const anchor = nearestAnchor(body, node);
    if (anchor) pos.anchor = anchor;
  }
  if (loc.pageInSection !== null) pos.page = loc.pageInSection;
  if (loc.pagesInSection !== null) pos.pages = loc.pagesInSection;
  return pos;
};

const docFor = async (view: RestoreTarget, index: number): Promise<Document | null> => {
  await view.goTo(index);
  return view.renderer.getContents().find((c) => c.index === index)?.doc ?? null;
};

export const restorePosition = async (view: RestoreTarget, pos: Position): Promise<RestoreResult> => {
  const total = view.book.sections.length;
  const parsed = pos.xpath ? parseKoXPath(pos.xpath) : null;
  const spine = parsed?.spine ?? pos.spine;

  if (parsed && parsed.spine < total) {
    const doc = await docFor(view, parsed.spine);
    const node = doc ? resolveInnerPath(doc.body, parsed.inner) : null;
    if (doc && node) {
      const range = doc.createRange();
      if (node.nodeType === Node.TEXT_NODE) range.setStart(node, Math.min(parsed.offset ?? 0, node.textContent?.length ?? 0));
      else range.setStartBefore(node);
      range.collapse(true);
      await view.renderer.goTo({ index: parsed.spine, anchor: () => range });
      return 'xpath';
    }
  }
  if (pos.para !== undefined && spine < total) {
    const doc = await docFor(view, spine);
    const el = doc ? paragraphBlocks(doc.body)[pos.para - 1] : undefined;
    if (el) {
      await view.renderer.goTo({ index: spine, anchor: () => el });
      return 'para';
    }
  }
  const overall = pos.pctQ / 1_000_000;
  if (spine < total) {
    const fr = view.getSectionFractions();
    const start = fr[spine] ?? 0;
    const end = fr[spine + 1] ?? 1;
    const inSection = end > start ? Math.min(1, Math.max(0, (overall - start) / (end - start))) : 0;
    await view.renderer.goTo({ index: spine, anchor: inSection });
    return 'spine';
  }
  if (overall > 0) {
    await view.goToFraction(overall);
    return 'fraction';
  }
  await view.goToTextStart();
  return 'start';
};

export const remoteToPosition = (remote: RemoteProgressDto): Position => {
  if (remote.position) return remote.position;
  const parsed = parseKoXPath(remote.progress);
  const pos: Position = { pctQ: toPctQ(remote.percentage), spine: parsed?.spine ?? 0 };
  if (parsed) pos.xpath = remote.progress;
  return pos;
};

export const shouldOfferRemote = (local: ProgressDto | null, remote: RemoteProgressDto | null): boolean => {
  if (!remote) return false;
  if (!local) return true;
  if (remote.timestamp <= local.updatedAt + 60) return false;
  const rp = remoteToPosition(remote);
  return rp.spine !== local.spine || Math.abs(rp.pctQ - local.pctQ) > 5000;
};
