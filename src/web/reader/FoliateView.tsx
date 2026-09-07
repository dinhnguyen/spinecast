import { useEffect, useRef } from 'react';
import type { View, FoliateRelocateDetail } from '../../../vendor/foliate-js/view.js';
import { rendererAttributes, sectionCss, themeColors, type ReaderSettings } from './readerSettings';

export type FoliateViewElement = View;

export interface ReaderLocation {
  index: number;
  range: Range;
  sectionFraction: number;
  fraction: number;
  tocLabel: string | null;
  pageInSection: number | null;
  pagesInSection: number | null;
}

export interface FoliateSelection {
  index: number;
  range: Range;
  text: string;
  rect: DOMRect;
}

export interface FoliateShowAnnotation {
  value: string;
  index: number;
}

interface FoliateViewProps {
  file: Blob;
  settings: ReaderSettings;
  onReady: (view: FoliateViewElement) => void | Promise<void>;
  onRelocate: (loc: ReaderLocation) => void;
  onTap: (zone: 'left' | 'center' | 'right') => void;
  onError: (err: unknown) => void;
  onSelect?: (sel: FoliateSelection) => void;
  onSelectionCleared?: () => void;
  onShowAnnotation?: (a: FoliateShowAnnotation) => void;
}

// The `foliate-view` custom element re-emits its renderer's `relocate` event as
// its own `relocate` event, synchronously, from inside the renderer's own
// listener (see `View#open`/`View#onRelocate` in vendor/foliate-js/view.js).
// Because of that nesting, a *second* listener added on `view.renderer` always
// runs one event late relative to a listener added on `view` itself. So all
// location data here is derived from the single `view`-level event instead of
// combining it with a separate renderer-level listener (which is what the
// original draft of this component did, and which produced a location that
// was always one page-turn stale, plus a missing very-first location).
// `sectionFraction` (fraction within the current section) isn't part of the
// view-level payload, so it's derived from `view.getSectionFractions()`.
const sectionFractionOf = (view: FoliateViewElement, index: number, fraction: number): number => {
  const bounds = view.getSectionFractions();
  const start = bounds[index] ?? 0;
  const end = bounds[index + 1] ?? 1;
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (fraction - start) / (end - start)));
};

// foliate-js (and any consumer downstream, e.g. Task 15's position persistence)
// must never see a non-finite fraction: `section.size` totaling to 0, or
// `#sectionProgress` not having been built yet, both make the library hand back
// `NaN`/`undefined` for real, not just hypothetically. Sanitize once, here, so
// every value that leaves this component is already valid.
const safeFraction = (n: number | undefined): number => (Number.isFinite(n) ? (n as number) : 0);

export const FoliateView = ({
  file,
  settings,
  onReady,
  onRelocate,
  onTap,
  onError,
  onSelect,
  onSelectionCleared,
  onShowAnnotation,
}: FoliateViewProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateViewElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    (async () => {
      await import('../../../vendor/foliate-js/view.js');
      if (cancelled) return;
      const view = document.createElement('foliate-view') as FoliateViewElement;
      view.style.cssText = 'display:block;width:100%;height:100%';
      host.replaceChildren(view);
      viewRef.current = view;
      await view.open(file);
      if (cancelled) return;
      const { renderer } = view;
      for (const [k, v] of Object.entries(rendererAttributes(settings))) renderer.setAttribute(k, v);
      renderer.setStyles?.(sectionCss(settings));
      view.addEventListener('relocate', (e) => {
        const d = (e as CustomEvent<FoliateRelocateDetail>).detail;
        const index = d.section?.current ?? 0;
        const fraction = safeFraction(d.fraction);
        onRelocate({
          index,
          range: d.range,
          sectionFraction: safeFraction(sectionFractionOf(view, index, fraction)),
          fraction,
          tocLabel: d.tocItem?.label ?? null,
          pageInSection: null,
          pagesInSection: null,
        });
      });
      view.addEventListener('show-annotation', (e) => {
        const d = (e as CustomEvent<{ value: string; index: number }>).detail;
        onShowAnnotation?.({ value: d.value, index: d.index });
      });
      view.addEventListener('load', (e) => {
        const { doc, index } = (e as CustomEvent<{ doc: Document; index: number }>).detail;
        doc.addEventListener('click', (ev) => {
          const mouseEvent = ev as MouseEvent;
          // Our click listener is registered here, from `load`, which runs
          // before foliate's own hit-test listener (added later, from
          // `#createOverlayer` - see view.js), so ours always fires first for
          // the same click. Racing that ordering with a deferred dispatch
          // doesn't work: a real user click empties the JS stack between the
          // two listeners, so a microtask queued from here still runs before
          // foliate's listener does. Ask the overlayer directly instead: a
          // `MouseEvent`'s `x`/`y` alias `clientX`/`clientY`, already relative
          // to this document, the same frame `Overlayer.hitTest` measures its
          // rects in. If the point lands on a drawn annotation, don't dispatch
          // a tap at all - let foliate's listener open the note sheet.
          const contents = view.renderer.getContents().find((c) => c.doc === doc);
          const [hitAnnotation] = contents?.overlayer?.hitTest(mouseEvent) ?? [];
          if (hitAnnotation) return;
          // In paginated flow, foliate-js lays a section out as one wide CSS
          // multi-column canvas inside an iframe that is itself that full width
          // (all columns side by side, `pageCount * pageSize`), and turns pages by
          // scrolling the outer `#container`, not by moving the iframe's own
          // viewport. That means `clientX` is canvas-relative: on page k of a
          // section it is already offset by `k * pageWidth`, so comparing it
          // straight against the renderer's own (viewport-sized) width would
          // misclassify almost every tap once k >= 1. Converting through the
          // iframe's own `frameElement` bounding rect (which does reflect the
          // container's current scroll position, since it's measured in the
          // parent document) recovers a renderer-relative, viewport-scale x.
          const frame = doc.defaultView?.frameElement as HTMLElement | null;
          const rendererRect = renderer.getBoundingClientRect();
          const x = frame ? mouseEvent.clientX + frame.getBoundingClientRect().left - rendererRect.left : mouseEvent.clientX;
          const w = rendererRect.width || window.innerWidth;
          const zone = x < w * 0.25 ? 'left' : x > w * 0.75 ? 'right' : 'center';
          onTap(zone);
        });
        doc.addEventListener('keydown', (ev) => {
          const k = (ev as KeyboardEvent).key;
          if (k === 'ArrowLeft') void view.goLeft();
          if (k === 'ArrowRight') void view.goRight();
        });
        doc.addEventListener('pointerup', () => {
          const selection = doc.defaultView?.getSelection();
          const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
          const text = range?.toString().trim() ?? '';
          if (!range || range.collapsed || !text) {
            onSelectionCleared?.();
            return;
          }
          // `range.getBoundingClientRect()` is measured inside the content
          // iframe, which in paginated flow is the whole multi-column canvas
          // (`left`/`top` offset by the current page's scroll position - see the
          // click handler's comment above for the same underlying mechanism).
          // `SelectionMenu` positions itself with `position: fixed`, so this
          // needs actual viewport coordinates, not the renderer-relative ones
          // the click handler above computes - translate through the iframe's
          // own bounding rect instead.
          const frame = doc.defaultView?.frameElement as HTMLElement | null;
          const f = frame?.getBoundingClientRect();
          const r = range.getBoundingClientRect();
          const rect = f ? new DOMRect(r.left + f.left, r.top + f.top, r.width, r.height) : r;
          onSelect?.({ index, range, text, rect });
        });
      });
      await onReady(view);
    })().catch((err) => {
      // A book foliate-js cannot open (unparseable EPUB, unsupported format)
      // would otherwise leave an empty container with no toolbar and no way
      // back, since the toolbar's tap handler lives in the content document
      // that never loaded. Report it so the page can show its error state.
      console.error('foliate open failed', err);
      if (!cancelled) onError(err);
    });
    return () => {
      cancelled = true;
      viewRef.current?.close();
      viewRef.current = null;
    };
    // settings are applied in the effect below; open only once per file
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view?.renderer) return;
    for (const [k, v] of Object.entries(rendererAttributes(settings))) view.renderer.setAttribute(k, v);
    view.renderer.setStyles?.(sectionCss(settings));
  }, [settings]);

  const { bg } = themeColors(settings.theme);
  return <div ref={hostRef} style={{ background: bg }} className="h-full w-full" />;
};
