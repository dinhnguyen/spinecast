import { Overlayer } from '../../../vendor/foliate-js/overlayer.js';
import type { ClippingDto } from '../../shared/apiTypes';
import { HIGHLIGHT_COLORS } from '../../shared/clipping';
import { findRangeByParaAndText } from './relocate';

type DrawFn = (func: unknown, opts?: unknown) => void;

export const drawHighlight = (draw: DrawFn, color: string): void => draw(Overlayer.highlight, { color });

export type PlacementTier = 'cfi' | 'text';

// Tier 1 is the stored cfi, tier 2 is the para plus text search, tier 3 is null:
// unplaced, listed in the panel, never drawn at a guessed position.
export const placeClipping = async (
  view: {
    addAnnotation: (a: { value: string; color?: string }) => Promise<unknown>;
    getCFI: (index: number, range: Range) => string;
    renderer?: { getContents: () => { index: number; doc: Document; overlayer?: unknown }[] };
  },
  clipping: ClippingDto,
): Promise<{ cfi: string; tier: PlacementTier } | null> => {
  // The colour rides on the annotation object itself, forwarded verbatim into
  // the `draw-annotation` event's `detail.annotation` by foliate's own
  // `addAnnotation` (see vendor/foliate-js/reader.js's reference usage). Two
  // overlapping placement passes (a re-scan racing an in-flight selection, for
  // instance) each carry their own colour this way - a single ref shared
  // across calls would let one call's draw read another's colour.
  const color = clipping.color ?? HIGHLIGHT_COLORS[0];

  const contents = view.renderer?.getContents() ?? [];
  const section = clipping.spine === null ? undefined : contents.find((c) => c.index === clipping.spine);
  // foliate's own `addAnnotation` guards on `if (obj)` internally and, when no
  // overlayer exists yet for the target index (the section's document has
  // loaded but `create-overlay` hasn't fired for it - a real window right
  // after open, when a `clippings` fetch can land mid-load), silently draws
  // nothing while still resolving normally. Without this check that reads as
  // success: the caller would record the clipping as placed even though
  // nothing was drawn, and (per the create-overlay handler, which is the only
  // thing that ever retries a whole section) it would then never get a second
  // chance this session. So a section whose overlayer isn't up yet is treated
  // exactly like "not yet rendered" - return null rather than attempt the call.
  if (clipping.spine !== null && !section?.overlayer) return null;

  if (clipping.cfi) {
    try {
      await view.addAnnotation({ value: clipping.cfi, color });
      return { cfi: clipping.cfi, tier: 'cfi' };
    } catch {
      // addAnnotation resolves the cfi lazily (CFI.toRange, invoked from inside
      // foliate's own navigation), so a cfi whose node path no longer matches the
      // document - a book re-uploaded with a different rendering, for instance -
      // throws here instead of failing gracefully. Falling through to the tier-2
      // search rather than returning null means the caller PATCHes the freshly
      // computed cfi back, so a stale cfi repairs itself on the next open.
    }
  }
  if (clipping.spine === null) return null;
  if (!section) return null;
  const range = findRangeByParaAndText(section.doc, clipping.para, clipping.text);
  if (!range) return null;
  const cfi = view.getCFI(clipping.spine, range);
  await view.addAnnotation({ value: cfi, color });
  return { cfi, tier: 'text' };
};
