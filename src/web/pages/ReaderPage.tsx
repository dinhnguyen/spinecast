import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { FoliateTocItem } from '../../../vendor/foliate-js/view.js';
import type { BookDto, ClippingDto, RemoteProgressDto } from '../../shared/apiTypes';
import { CLIPPING_CHAPTER_MAX, HIGHLIGHT_COLORS } from '../../shared/clipping';
import { BOOKMARK_XPATH_MAX, type Position } from '../../shared/position';
import { Button } from '../components/Button';
import type { SyncState } from '../components/SyncBadge';
import { useBookmarks } from '../hooks/useBookmarks';
import { useClippings } from '../hooks/useClippings';
import { useProgress } from '../hooks/useProgress';
import { useSyncSettings } from '../hooks/useSyncSettings';
import { useToast } from '../hooks/useToast';
import { useLocale } from '../i18n/LocaleProvider';
import { ApiClientError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { describeError } from '../lib/errorMessage';
import { syncBadgeFor } from '../lib/format';
import { bookmarkOnPage } from '../reader/bookmarkPage';
import { ContinuePrompt } from '../reader/ContinuePrompt';
import { FoliateView, type FoliateSelection, type FoliateShowAnnotation, type FoliateViewElement, type ReaderLocation } from '../reader/FoliateView';
import { drawHighlight, placeClipping } from '../reader/highlights';
import { NoteSheet } from '../reader/NoteSheet';
import {
  positionFromLocation,
  remoteToPosition,
  restorePosition,
  shouldOfferRemote,
  type RestoreResult,
} from '../reader/positionBridge';
import { ReaderDisplaySettings } from '../reader/ReaderDisplaySettings';
import { ReaderTocPanel } from '../reader/ReaderTocPanel';
import { ReaderToolbar } from '../reader/ReaderToolbar';
import { loadSettings, saveSettings, themeColors, type ReaderSettings } from '../reader/readerSettings';
import { SelectionMenu } from '../reader/SelectionMenu';
import { useReadingSession } from '../reader/useReadingSession';
import { paragraphIndexOf } from '../reader/xpath';
import { restoreMessageKey } from './restoreMessageKey';

const findHrefByLabel = (items: FoliateTocItem[], label: string): string | null => {
  for (const item of items) {
    if (item.label === label) return item.href;
    const nested = item.subitems ? findHrefByLabel(item.subitems, label) : null;
    if (nested) return nested;
  }
  return null;
};

const zoneFor = (clientX: number, rect: DOMRect): 'left' | 'center' | 'right' => {
  const x = (clientX - rect.left) / rect.width;
  return x < 0.25 ? 'left' : x > 0.75 ? 'right' : 'center';
};

export const ReaderPage = () => {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { settings: syncSettings } = useSyncSettings();
  const { load, save, flush, beacon, lastResult } = useProgress(bookId ?? '');
  const { onForwardTurn } = useReadingSession(bookId ?? '');
  const {
    bookmarks,
    loading: bookmarksLoading,
    loadError: bookmarksLoadError,
    sync: syncBookmarks,
    add: addBookmark,
    remove: removeBookmark,
  } = useBookmarks(bookId ?? '');
  const {
    clippings,
    loading: clippingsLoading,
    loadError: clippingsLoadError,
    sync: syncClippings,
    add: addClipping,
    update: updateClipping,
    remove: removeClipping,
  } = useClippings(bookId ?? '');
  const { toast, show } = useToast();
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const tRef = useRef(t);
  tRef.current = t;

  const [book, setBook] = useState<BookDto | null>(null);
  const [file, setFile] = useState<Blob | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings());
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  const [metaTitle, setMetaTitle] = useState<string | null>(null);
  const [toc, setToc] = useState<FoliateTocItem[]>([]);
  const [pendingRemote, setPendingRemote] = useState<RemoteProgressDto | null>(null);
  const [unplaced, setUnplaced] = useState<Set<string>>(new Set());
  // foliate never dispatches `create-overlayer` for a fixed-layout (pre-paginated)
  // book, so a clipping there always lands in `unplaced` even though it is stored
  // and synced correctly - see ClippingList's use of this for the label.
  const [fixedLayout, setFixedLayout] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<{ index: number; range: Range; text: string; rect: DOMRect } | null>(null);
  const [sheetClipping, setSheetClipping] = useState<ClippingDto | null>(null);

  const viewRef = useRef<FoliateViewElement | null>(null);
  const restoringRef = useRef(true);
  const lastPosRef = useRef<Position | null>(null);
  // Kept fresh every render so the `create-overlay` listener (added once,
  // in handleReady) never reads a closed-over, stale clippings array.
  const clippingsRef = useRef<ClippingDto[]>([]);
  clippingsRef.current = clippings;
  // cfi <-> clipping id, populated as each clipping is placed. Lets a tap on an
  // existing highlight (show-annotation carries only the cfi) and a tap on a
  // notes-tab row (only has the id) both resolve to the same clipping.
  // idToCfiRef doubles as the "already placed with this exact cfi" record the
  // re-scan effect below checks before re-running placeClipping.
  const cfiToIdRef = useRef<Map<string, string>>(new Map());
  const idToCfiRef = useRef<Map<string, string>>(new Map());
  // Ids currently mid-placement, so a re-entrant scan (triggered by a reload
  // that a placement still in flight itself kicked off) never runs a second,
  // overlapping placeClipping call for the same clipping.
  const placingIdsRef = useRef<Set<string>>(new Set());
  // Set on `onSelect`, cleared on the very next `onTap`: pointerup (which fires
  // onSelect) precedes click (which fires onTap) for the same gesture, so a
  // text selection must not also toggle the toolbar.
  const justSelectedRef = useRef(false);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    (async () => {
      try {
        const dto = await api.get<BookDto>(`/api/books/${bookId}`);
        const res = await fetch(`/api/books/${bookId}/file`, { credentials: 'same-origin' });
        if (!res.ok) throw new ApiClientError(res.status, 'file_error', 'file download failed');
        const blob = await res.blob();
        if (cancelled) return;
        // foliate-js's `makeBook()` sniffs the format partly by filename (e.g.
        // `isCBZ`/`isFB2`/`isFBZ` call `name.endsWith(...)` unconditionally), so
        // it needs a File with a real `.name`, not a bare Blob from fetch().
        setBook(dto);
        setFile(new File([blob], dto.filename, { type: blob.type }));
      } catch (e) {
        if (cancelled) return;
        setError(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const updateSettings = useCallback((next: ReaderSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  // `create-overlay` fires every time a section's overlayer is (re)built -
  // foliate tears down and recreates it (a fresh `new Overlayer()`) on every
  // `create-overlayer`, even revisiting a section already seen this session.
  // Dropping this section's prior placement records before placing again
  // means `placeOne`'s "already placed at this cfi" guard can never mistake
  // "was drawn into a now-destroyed overlayer" for "already drawn into the
  // current one" - which would otherwise skip a redraw the fresh, empty
  // overlayer genuinely needs (and leave that highlight untappable too, since
  // the new overlayer has no hit-test entry for it either).
  const clearSectionPlacements = (index: number) => {
    for (const clipping of clippingsRef.current) {
      if (clipping.spine !== index) continue;
      const cfi = idToCfiRef.current.get(clipping.id);
      if (cfi !== undefined) cfiToIdRef.current.delete(cfi);
      idToCfiRef.current.delete(clipping.id);
    }
  };

  // Places (and, via the `draw-annotation` listener registered in handleReady,
  // draws) a single clipping. A null result means neither the stored cfi nor a
  // para+text search resolved it - it goes in `unplaced` and is never drawn at
  // a guessed position. Tier 'text' means placeClipping recomputed the cfi, so
  // the freshly-resolved value is PATCHed back; tier 'cfi' means the stored
  // cfi already matched, so there is nothing new to persist. placeClipping
  // itself returns null (rather than a fake success) when the target
  // section's overlayer isn't actually up yet, so nothing here ever records a
  // clipping as placed unless it was truly drawn.
  //
  // Two guards against redundant/overlapping work *within one overlayer's
  // lifetime*, both needed because the re-scan effect below can fire again
  // *while this is still running* - its own tier-2 PATCH reloads `clippings`,
  // which re-triggers that effect for the whole section before this pass has
  // finished:
  // - `placingIdsRef` skips a clipping already mid-placement, rather than
  //   starting a second concurrent placeClipping call for the same id.
  // - the `idToCfiRef` check skips a clipping already placed at its current
  //   cfi, so a section with M clippings converges in O(M) placements instead
  //   of an unbounded re-placement of everything on every reload. This is
  //   only ever a same-generation guard: `clearSectionPlacements` wipes it
  //   before every `create-overlay`, so it can never suppress the first
  //   placement attempt against a fresh overlayer.
  const placeOne = useCallback(
    async (view: FoliateViewElement, clipping: ClippingDto) => {
      if (placingIdsRef.current.has(clipping.id)) return;
      if (idToCfiRef.current.has(clipping.id)) return;
      placingIdsRef.current.add(clipping.id);
      try {
        const result = await placeClipping(view, clipping);
        if (!result) {
          setUnplaced((prev) => (prev.has(clipping.id) ? prev : new Set(prev).add(clipping.id)));
          return;
        }
        cfiToIdRef.current.set(result.cfi, clipping.id);
        idToCfiRef.current.set(clipping.id, result.cfi);
        setUnplaced((prev) => {
          if (!prev.has(clipping.id)) return prev;
          const next = new Set(prev);
          next.delete(clipping.id);
          return next;
        });
        // Best-effort persistence of the freshly-resolved cfi: the highlight is
        // already drawn either way, and a failed PATCH just means this same
        // tier-2 search (and PATCH) runs again next time this clipping is placed.
        if (result.tier === 'text') void updateClipping(clipping.id, { cfi: result.cfi }).catch(() => undefined);
      } finally {
        placingIdsRef.current.delete(clipping.id);
      }
    },
    [updateClipping],
  );

  // Called from the `create-overlay` listener each time a section's overlayer
  // is attached, so a clipping is only ever placed once the document *and*
  // the overlayer that actually draws onto it both exist.
  const placeSectionClippings = useCallback(
    async (index: number) => {
      const view = viewRef.current;
      if (!view) return;
      for (const clipping of clippingsRef.current.filter((c) => c.spine === index)) {
        await placeOne(view, clipping);
      }
    },
    [placeOne],
  );

  // The clippings fetch is a separate async request that can resolve after a
  // section's `create-overlay` has already fired - without this, a clipping
  // that arrives late never gets drawn until the next page turn. Re-scanning
  // every currently-rendered section whenever `clippings` changes (initial
  // load, sync, add, update, remove) covers that race; placeOne's own guards
  // make re-running it on an already-placed clipping a cheap no-op.
  useEffect(() => {
    const view = viewRef.current;
    if (!view?.renderer) return;
    for (const { index } of view.renderer.getContents()) void placeSectionClippings(index);
  }, [clippings, placeSectionClippings]);

  const handleReady = useCallback(
    async (view: FoliateViewElement) => {
      viewRef.current = view;
      setToc(view.book.toc ?? []);
      setFixedLayout(view.isFixedLayout);
      const rawTitle = view.book.metadata?.title;
      setMetaTitle(typeof rawTitle === 'string' ? rawTitle : rawTitle ? (Object.values(rawTitle)[0] ?? null) : null);

      // Registered before the restore below navigates anywhere, so the very
      // first section's `create-overlay` also places its clippings.
      //
      // This has to be `create-overlay`, not `load`: foliate emits `load` from
      // inside `view.load(...)`, and only dispatches `create-overlayer` (which
      // is what attaches the overlayer `addAnnotation` draws into) after that
      // call resolves. Placing on `load` means the `addAnnotation` call inside
      // placeClipping resolves the section's own `#getOverlayer(index)` to
      // undefined - it returns successfully, recording the clipping as placed,
      // but draws nothing, silently. `create-overlay` (see the reference
      // reader in vendor/foliate-js/reader.js) fires only once the overlayer
      // exists, so a draw is guaranteed.
      //
      // `queueMicrotask` is required, not optional - but not for the reason
      // `this.#view` suggests. `#createView()` (paginator.js:671, called from
      // `#display` at paginator.js:976) assigns `this.#view` to the new
      // section's view *before* `await view.load(...)` even starts, so by the
      // time `create-overlayer`/`create-overlay` dispatch (paginator.js:989),
      // `this.#view` already points at the correct, current section - the
      // later `this.#view = view` at paginator.js:995 only reassigns the same
      // value. What is genuinely still unset at dispatch time is
      // `view.overlayer`: `create-overlayer`'s listener is
      // `e.detail.attach(this.#createOverlayer(e.detail))` (view.js:265), and
      // argument-evaluation order means `#createOverlayer` - which builds the
      // overlayer and, at its very end, emits this `create-overlay` (our
      // listener runs here) - returns before `attach` is called with its
      // result, so `attach`'s `view.overlayer = overlayer` write lands only
      // after this listener has already run synchronously. So reading
      // `getContents()` synchronously from inside this handler, as
      // `placeClipping`'s overlayer check does, correctly finds the *right*
      // section but with `overlayer` still `undefined` - which correctly
      // reads as not ready and marks the clipping unplaced rather than
      // drawing it, not the reverse. Queueing a microtask runs the placement
      // after `attach` has run.
      view.addEventListener('create-overlay', (e) => {
        const { index } = (e as CustomEvent<{ index: number }>).detail;
        queueMicrotask(() => {
          clearSectionPlacements(index);
          void placeSectionClippings(index);
        });
      });
      // The colour rides on the annotation object itself (set in
      // placeClipping/handleSaveSheetClipping), not a ref - two placements can
      // overlap (see placeOne's comment), and a ref shared between them would
      // let one call's draw read a colour meant for the other.
      view.addEventListener('draw-annotation', (e) => {
        const { draw, annotation } = (e as CustomEvent<{ draw: (func: unknown, opts?: unknown) => void; annotation: { color?: string } }>).detail;
        drawHighlight(draw, annotation.color ?? HIGHLIGHT_COLORS[0]);
      });

      // The local position arrived with the book's metadata (the same D1 row
      // /progress returns as `local`), so restore from it immediately. Awaiting
      // /progress here would block on up to two 10s calls to the external sync
      // server while `restoringRef` silently discards every page turn.
      const local = book?.progress ?? null;
      restoringRef.current = true;
      let result: RestoreResult | null = null;
      try {
        if (local) {
          result = await restorePosition(view, { ...local, observedAt: local.observedAt ?? undefined });
        } else {
          await view.goToTextStart();
        }
      } finally {
        restoringRef.current = false;
      }

      // The position was already restored above; this only tells the reader why
      // it landed where it did in this browser.
      const messageKey = restoreMessageKey(local, result, user?.deviceId);
      if (messageKey) show(tRef.current(messageKey));

      // The remote comparison only drives the optional "continue from another
      // device" prompt, so it runs in the background: if the sync server is slow
      // or down, reading just carries on from the local position.
      void load()
        .then(({ local: serverLocal, remote, syncError }) => {
          if (syncError) show(tRef.current('reader.remoteFailed'));
          if (remote && shouldOfferRemote(serverLocal, remote)) setPendingRemote(remote);
        })
        .catch(() => undefined);
      void syncBookmarks();
      void syncClippings();
    },
    [book?.progress, load, show, syncBookmarks, syncClippings, user?.deviceId, placeSectionClippings],
  );

  const handleStay = useCallback(() => setPendingRemote(null), []);

  const handleContinueRemote = useCallback(async () => {
    const remote = pendingRemote;
    setPendingRemote(null);
    const view = viewRef.current;
    if (!view || !remote) return;
    restoringRef.current = true;
    try {
      const pos = remoteToPosition(remote);
      const result = await restorePosition(view, pos);
      if (result !== 'xpath' && pos.xpath) show(tRef.current('reader.approxPosition'));
      lastPosRef.current = pos;
      save(pos);
    } finally {
      restoringRef.current = false;
    }
  }, [pendingRemote, save, show]);

  const handleRelocate = useCallback(
    (loc: ReaderLocation) => {
      onForwardTurn(loc.fraction);
      setLocation(loc);
      // A page turn tears down the previous section's document; a selection's
      // Range from it must not be held past that point.
      setPendingSelection(null);
      if (restoringRef.current) return;
      const pos = positionFromLocation(loc);
      lastPosRef.current = pos;
      save(pos);
    },
    [save, onForwardTurn],
  );

  const chapterLabel = location?.tocLabel ?? '';

  const handleToggleBookmark = useCallback(() => {
    const existing = bookmarkOnPage(bookmarks, location?.fraction ?? 0);
    if (existing) {
      void removeBookmark(existing.id).catch(() => show(tRef.current('reader.bookmarkRemoveFailed')));
      return;
    }
    // Bookmark identity is derived from the xpath, so it needs the wider
    // BOOKMARK_XPATH_MAX budget rather than lastPosRef's progress-sized one -
    // see the spec's note on why the two paths must not share a cap.
    const pos = location ? positionFromLocation(location, BOOKMARK_XPATH_MAX) : null;
    if (!pos?.xpath) return;
    void addBookmark({
      xpath: pos.xpath,
      percentage: pos.pctQ / 1_000_000,
      ...(location?.range.startContainer.textContent ? { summary: location.range.startContainer.textContent.slice(0, 256) } : {}),
      si: pos.spine,
      ...(chapterLabel ? { chapter: chapterLabel.slice(0, 64) } : {}),
    }).catch(() => show(tRef.current('reader.bookmarkFailed')));
  }, [bookmarks, location, addBookmark, removeBookmark, show]);

  const handleSelect = useCallback((sel: FoliateSelection) => {
    justSelectedRef.current = true;
    setPendingSelection({ index: sel.index, range: sel.range, text: sel.text, rect: sel.rect });
  }, []);

  const handleSelectionCleared = useCallback(() => setPendingSelection(null), []);

  const handleShowAnnotation = useCallback((a: FoliateShowAnnotation) => {
    const id = cfiToIdRef.current.get(a.value);
    const clipping = id ? clippingsRef.current.find((c) => c.id === id) : undefined;
    if (clipping) setSheetClipping(clipping);
  }, []);

  // Shared by the selection menu's colour swatches and its note button: both
  // create the clipping from the live selection and draw it immediately, on
  // the section it was made in, without waiting for a `load` event that will
  // never come (the section is already rendered).
  const createClippingFromSelection = useCallback(
    (color: string): Promise<ClippingDto> | null => {
      const sel = pendingSelection;
      if (!sel) return null;
      setPendingSelection(null);
      const view = viewRef.current;
      if (!view) return null;
      const doc = sel.range.startContainer.ownerDocument;
      doc?.getSelection()?.removeAllRanges();
      const para = doc ? paragraphIndexOf(doc.body, sel.range.startContainer) : null;
      const cfi = view.getCFI(sel.index, sel.range);
      return addClipping({
        text: sel.text,
        spine: sel.index,
        ...(para !== null ? { para } : {}),
        ...(chapterLabel ? { chapter: chapterLabel.slice(0, CLIPPING_CHAPTER_MAX) } : {}),
        color,
        cfi,
      }).then((created) => {
        // The clipping is already saved at this point; a failed draw just
        // means the re-scan effect (watching `clippings`) picks it up and
        // places it on the next relevant reload instead of right away.
        if (viewRef.current) void placeOne(viewRef.current, created).catch(() => undefined);
        return created;
      });
    },
    [pendingSelection, chapterLabel, addClipping, placeOne],
  );

  const handleHighlight = useCallback(
    (color: string) => {
      void createClippingFromSelection(color)?.catch(() => show(tRef.current('reader.noteFailed')));
    },
    [createClippingFromSelection, show],
  );

  const handleAddNoteFromSelection = useCallback(() => {
    void createClippingFromSelection(HIGHLIGHT_COLORS[0])
      ?.then((created) => setSheetClipping(created))
      .catch(() => show(tRef.current('reader.noteFailed')));
  }, [createClippingFromSelection, show]);

  // Reuses the existing bookmark path (2a), only deriving the xpath from the
  // selection's own range instead of the toolbar button's current-page one.
  const handleBookmarkFromSelection = useCallback(() => {
    const sel = pendingSelection;
    setPendingSelection(null);
    if (!sel) return;
    const pos = positionFromLocation(
      { index: sel.index, range: sel.range, sectionFraction: 0, fraction: location?.fraction ?? 0, tocLabel: chapterLabel || null, pageInSection: null, pagesInSection: null },
      BOOKMARK_XPATH_MAX,
    );
    if (!pos.xpath) return;
    void addBookmark({
      xpath: pos.xpath,
      percentage: pos.pctQ / 1_000_000,
      ...(sel.text ? { summary: sel.text.slice(0, 256) } : {}),
      si: pos.spine,
      ...(chapterLabel ? { chapter: chapterLabel.slice(0, 64) } : {}),
    }).catch(() => show(tRef.current('reader.bookmarkFailed')));
  }, [pendingSelection, location, chapterLabel, addBookmark, show]);

  const handleCopySelection = useCallback(() => {
    const sel = pendingSelection;
    setPendingSelection(null);
    if (!sel) return;
    void navigator.clipboard
      .writeText(sel.text)
      .then(() => show(tRef.current('reader.copied')))
      .catch(() => undefined);
  }, [pendingSelection, show]);

  const handleSelectClipping = useCallback((id: string) => {
    setTocOpen(false);
    const view = viewRef.current;
    if (!view) return;
    const clipping = clippingsRef.current.find((c) => c.id === id);
    const cfi = idToCfiRef.current.get(id) ?? clipping?.cfi ?? null;
    if (cfi) {
      // `showAnnotation` throws if `goTo` can't resolve a stale cfi (a
      // clipping placed in a previous session against a book re-uploaded with
      // a different rendering) or if the target section's overlayer isn't up
      // yet. Either way there is nothing more to do than leave the reader
      // where it was - the clipping stays in the list to retry.
      void view.showAnnotation({ value: cfi }).catch(() => undefined);
      return;
    }
    // Not placed this session - its section was never rendered, so there is
    // no cfi to navigate by yet. Falling back to the stored spine at least
    // gets the reader to the right chapter, where `create-overlay` then
    // fires and places it, rather than the tap silently doing nothing.
    if (clipping?.spine !== null && clipping?.spine !== undefined) void view.goTo(clipping.spine);
  }, []);

  const handleRemoveClipping = useCallback(
    (id: string) => {
      const cfi = idToCfiRef.current.get(id);
      void removeClipping(id)
        .then(() => {
          // The clipping is already deleted server-side and out of `clippings`
          // state at this point; a failed overlay removal just leaves a stray
          // highlight drawn until the section next re-renders.
          if (cfi) void viewRef.current?.deleteAnnotation({ value: cfi }).catch(() => undefined);
        })
        .catch(() => show(tRef.current('reader.noteFailed')));
    },
    [removeClipping, show],
  );

  const handleSaveSheetClipping = useCallback(
    async (patch: { note: string | null; color: string }) => {
      if (!sheetClipping) return;
      await updateClipping(sheetClipping.id, patch);
      const cfi = idToCfiRef.current.get(sheetClipping.id);
      // Re-adding the same cfi redraws it: addAnnotation removes its own prior
      // overlay for that value before re-adding, so this is enough to reflect
      // a new colour immediately without a separate delete call. The colour
      // travels on the annotation object itself (see placeClipping), not a
      // ref, so this can't race a concurrent placement of a different clipping.
      if (cfi && viewRef.current) await viewRef.current.addAnnotation({ value: cfi, color: patch.color });
    },
    [sheetClipping, updateClipping],
  );

  const handleDeleteSheetClipping = useCallback(async () => {
    if (!sheetClipping) return;
    const cfi = idToCfiRef.current.get(sheetClipping.id);
    await removeClipping(sheetClipping.id);
    // Same as handleRemoveClipping: the clipping is already gone server-side
    // and from state, so a failed overlay removal only leaves a stray drawn
    // highlight until the section next re-renders.
    if (cfi) void viewRef.current?.deleteAnnotation({ value: cfi }).catch(() => undefined);
  }, [sheetClipping, removeClipping]);

  const handleTap = useCallback((zone: 'left' | 'center' | 'right') => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (zone === 'left') void viewRef.current?.goLeft();
    else if (zone === 'right') void viewRef.current?.goRight();
    else setToolbarVisible((v) => !v);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') void viewRef.current?.goLeft();
      else if (e.key === 'ArrowRight') void viewRef.current?.goRight();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // The sheet can be open for a clipping that then gets removed through the
  // other surface (the notes list, or a future sync from another device) -
  // without this, it keeps showing a deleted clipping's stale text and note.
  useEffect(() => {
    if (sheetClipping && !clippings.some((c) => c.id === sheetClipping.id)) setSheetClipping(null);
  }, [clippings, sheetClipping]);

  useEffect(() => {
    const onPageHide = () => {
      flush();
      if (lastPosRef.current) beacon(lastPosRef.current);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [flush, beacon]);

  if (error) {
    const message =
      error instanceof ApiClientError && error.code === 'file_error'
        ? t('reader.fileFailed')
        : error instanceof ApiClientError && error.code !== 'http_error'
          ? describeError(error, t)
          : t('reader.openFailed');
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <p className="font-serif text-[18px] font-semibold text-danger">{message}</p>
        <Button onClick={() => navigate('/')}>{t('reader.backToLibrary')}</Button>
      </div>
    );
  }

  if (!book || !file) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <p className="font-serif text-[18px] text-muted">{t('reader.opening')}</p>
      </div>
    );
  }

  const currentHref = location?.tocLabel ? findHrefByLabel(toc, location.tocLabel) : null;
  const { bg } = themeColors(settings.theme);
  // `FoliateView` already sanitizes `fraction` to a finite number before this
  // ever reaches state, so no NaN guard is needed here (see FoliateView.tsx).
  const pctQ = Math.round((location?.fraction ?? 0) * 1_000_000);
  const current = bookmarkOnPage(bookmarks, location?.fraction ?? 0);
  const sync: { state: SyncState; text: string } = lastResult
    ? lastResult.pushed
      ? { state: 'ok', text: t('sync.badgeSynced', { when: t('time.justNow') }) }
      : lastResult.syncError?.startsWith('unauthorized')
        ? { state: 'danger', text: t('sync.badgeUnauthorized') }
        : lastResult.syncError
          ? { state: 'warn', text: t('sync.badgePending') }
          : syncBadgeFor(syncSettings, locale)
    : syncBadgeFor(syncSettings, locale);

  const handleSelectToc = (href: string) => {
    setTocOpen(false);
    void viewRef.current?.goTo(href);
  };

  const handleSelectBookmark = (xpath: string) => {
    setTocOpen(false);
    const view = viewRef.current;
    if (!view) return;
    const bookmark = bookmarks.find((b) => b.xpath === xpath);
    const bookmarkPctQ = Math.round((bookmark?.percentage ?? 0) * 1_000_000);
    void restorePosition(view, { pctQ: bookmarkPctQ, spine: bookmark?.si ?? 0, xpath });
  };

  // FoliateView renders its book content inside a same-origin sandboxed <iframe>;
  // clicks inside that iframe never bubble out to this document, so FoliateView
  // reports them itself via `onTap`. This handler only catches clicks that land
  // in the light DOM around the iframe (margins, gaps between columns). It is a
  // sibling of ReaderDisplaySettings rather than an ancestor, so opening the
  // popover doesn't cause its own clicks to also register as a page tap.
  const handleOutsideTap = (e: MouseEvent<HTMLDivElement>) => {
    handleTap(zoneFor(e.clientX, e.currentTarget.getBoundingClientRect()));
  };

  return (
    <div style={{ background: bg }} className="fixed inset-0 flex flex-col">
      <ReaderToolbar
        visible={toolbarVisible}
        themeBg={bg}
        title={metaTitle ?? book.title}
        author={book.author}
        syncState={sync.state}
        syncText={sync.text}
        chapterLabel={chapterLabel}
        pctQ={pctQ}
        tocOpen={tocOpen}
        notesOpen={sheetClipping !== null}
        displayOpen={displayOpen}
        bookmarked={current !== null}
        onBack={() => navigate('/')}
        onOpenToc={() => setTocOpen((v) => !v)}
        onOpenDisplay={() => setDisplayOpen((v) => !v)}
        onToggleBookmark={handleToggleBookmark}
        onSeek={(fraction) => void viewRef.current?.goToFraction(fraction)}
      />
      <div className="flex flex-1 overflow-hidden">
        <ReaderTocPanel
          open={tocOpen}
          onClose={() => setTocOpen(false)}
          toc={toc}
          currentHref={currentHref}
          onSelect={handleSelectToc}
          bookmarks={bookmarks}
          bookmarksLoading={bookmarksLoading}
          bookmarksLoadError={bookmarksLoadError}
          onSelectBookmark={handleSelectBookmark}
          onRemoveBookmark={(id) => void removeBookmark(id).catch(() => show(tRef.current('reader.bookmarkRemoveFailed')))}
          clippings={clippings}
          clippingsUnplaced={unplaced}
          clippingsFixedLayout={fixedLayout}
          clippingsLoading={clippingsLoading}
          clippingsLoadError={clippingsLoadError}
          onSelectClipping={handleSelectClipping}
          onRemoveClipping={handleRemoveClipping}
        />
        <div className="relative flex-1">
          <div className="absolute inset-0" onClick={handleOutsideTap}>
            <FoliateView
              file={file}
              settings={settings}
              onReady={handleReady}
              onRelocate={handleRelocate}
              onTap={handleTap}
              onError={() => setError(new Error('epub render failed'))}
              onSelect={handleSelect}
              onSelectionCleared={handleSelectionCleared}
              onShowAnnotation={handleShowAnnotation}
            />
          </div>
          <ReaderDisplaySettings open={displayOpen} onClose={() => setDisplayOpen(false)} settings={settings} onChange={updateSettings} />
          {pendingSelection ? (
            <SelectionMenu
              rect={pendingSelection.rect}
              onHighlight={handleHighlight}
              onNote={handleAddNoteFromSelection}
              onBookmark={handleBookmarkFromSelection}
              onCopy={handleCopySelection}
            />
          ) : null}
        </div>
        <NoteSheet
          open={sheetClipping !== null}
          clipping={sheetClipping}
          onClose={() => setSheetClipping(null)}
          onSave={handleSaveSheetClipping}
          onDelete={handleDeleteSheetClipping}
        />
      </div>
      {pendingRemote ? (
        <ContinuePrompt
          device={pendingRemote.device}
          percentage={pendingRemote.percentage}
          timestamp={pendingRemote.timestamp}
          onStay={handleStay}
          onContinue={() => void handleContinueRemote()}
        />
      ) : null}
      {toast}
    </div>
  );
};
