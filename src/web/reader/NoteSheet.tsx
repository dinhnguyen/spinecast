import { useEffect, useState } from 'react';
import type { ClippingDto } from '../../shared/apiTypes';
import { CLIPPING_NOTE_MAX, HIGHLIGHT_COLORS } from '../../shared/clipping';
import { BottomSheet } from '../components/BottomSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useT } from '../i18n/LocaleProvider';
import { Icon } from '../lib/icons';

interface NoteSheetProps {
  open: boolean;
  clipping: ClippingDto | null;
  onClose: () => void;
  onSave: (patch: { note: string | null; color: string }) => Promise<void>;
  onDelete: () => Promise<void>;
}

const noteByteLength = (v: string): number => new TextEncoder().encode(v).length;

const NoteSheetBody = ({
  clipping,
  color,
  setColor,
  note,
  setNote,
  error,
  busy,
  onSave,
  onDelete,
}: {
  clipping: ClippingDto;
  color: string;
  setColor: (c: string) => void;
  note: string;
  setNote: (v: string) => void;
  error: string | null;
  busy: boolean;
  onSave: () => void;
  onDelete: () => void;
}) => {
  const { t } = useT();
  return (
    <>
      <p className="line-clamp-4 font-serif text-[15px] text-ink">{clipping.text}</p>
      <div className="flex items-center gap-2.5">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={t('reader.highlight')}
            onClick={() => setColor(c)}
            style={{ backgroundColor: c, boxShadow: c === color ? '0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent)' : undefined }}
            className="h-[22px] w-[22px] shrink-0 rounded-full"
          />
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={CLIPPING_NOTE_MAX}
        placeholder={t('reader.notePlaceholder')}
        className="h-32 flex-1 resize-none rounded-[6px] border border-control bg-surface p-3 text-[15px] text-ink outline-none placeholder:text-faint focus:border-accent focus:shadow-[0_0_0_3px_#f0e5d6]"
      />
      {error ? <p role="alert" className="text-[13px] text-danger">{error}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={onSave}
        className="flex h-11 items-center justify-center rounded-[6px] border border-accent bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-60"
      >
        {t('common.save')}
      </button>
      <button type="button" disabled={busy} onClick={onDelete} className="flex h-10 items-center justify-center gap-2 text-[14px] font-medium text-danger disabled:opacity-60">
        {t('reader.noteDelete')}
      </button>
    </>
  );
};

export const NoteSheet = ({ open, clipping, onClose, onSave, onDelete }: NoteSheetProps) => {
  const { t } = useT();
  const [note, setNote] = useState('');
  const [color, setColor] = useState<string>(HIGHLIGHT_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Reseed the draft every time the sheet opens or the underlying clipping
  // changes, not once at mount - otherwise a stale draft overwrites a newer
  // note on save (the bug 2a shipped in DeviceRow's rename control).
  useEffect(() => {
    if (!open || !clipping) return;
    setNote(clipping.note ?? '');
    setConfirming(false);
    setColor(clipping.color ?? HIGHLIGHT_COLORS[0]);
    setError(null);
  }, [open, clipping]);

  if (!open || !clipping) return null;

  const save = async (): Promise<void> => {
    const trimmed = note.trim();
    const patchNote = trimmed === '' ? null : trimmed;
    if (patchNote !== null && noteByteLength(patchNote) > CLIPPING_NOTE_MAX) {
      setError(t('reader.noteTooLong'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ note: patchNote, color });
      onClose();
    } catch {
      setError(t('reader.noteFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch {
      setError(t('reader.noteFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="md:hidden">
        <BottomSheet open={open} onClose={onClose} title={t('reader.noteTitle')} height={420}>
          <NoteSheetBody clipping={clipping} color={color} setColor={setColor} note={note} setNote={setNote} error={error} busy={busy} onSave={() => void save()} onDelete={() => setConfirming(true)} />
        </BottomSheet>
      </div>
      <div className="hidden w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-surface p-[16px_12px] md:flex">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[18px] font-semibold">{t('reader.noteTitle')}</h2>
          <button type="button" aria-label={t('common.close')} onClick={onClose} className="text-faint">
            <Icon name="x" size={16} />
          </button>
        </div>
        <NoteSheetBody clipping={clipping} color={color} setColor={setColor} note={note} setNote={setNote} error={error} busy={busy} onSave={() => void save()} onDelete={() => setConfirming(true)} />
      </div>
      <ConfirmDialog open={confirming} message={t('reader.noteDeleteConfirm')} confirmLabel={t('reader.noteDelete')} onConfirm={() => void remove()} onCancel={() => setConfirming(false)} />
    </>
  );
};
