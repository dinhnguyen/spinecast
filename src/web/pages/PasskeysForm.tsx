import { useState } from 'react';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import type { PasskeyDto } from '../../shared/apiTypes';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field } from '../components/Field';
import { usePasskeys } from '../hooks/usePasskeys';
import { useLocale } from '../i18n/LocaleProvider';
import { ApiClientError } from '../lib/api';
import { describeError } from '../lib/errorMessage';
import { formatDate, formatRelative } from '../lib/format';
import { Icon } from '../lib/icons';
import { isCeremonyCancel } from '../lib/webauthn';

interface RowProps {
  passkey: PasskeyDto;
  busy: boolean;
  onRename: (name: string) => Promise<void>;
  onRemove: () => void;
}

const Row = ({ passkey, busy, onRename, onRemove }: RowProps) => {
  const { t, locale } = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(passkey.name);

  const cancel = (): void => {
    setDraft(passkey.name);
    setEditing(false);
  };

  const submit = async (): Promise<void> => {
    const name = draft.trim();
    if (!name || name === passkey.name) return cancel();
    await onRename(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-end gap-2.5 border-b border-border py-3.5">
        <Field label={t('passkeys.name')} value={draft} maxLength={64} onChange={(e) => setDraft(e.target.value)} className="flex-1" />
        <Button height={40} disabled={busy} onClick={() => void submit()}>
          {t('passkeys.save')}
        </Button>
        <Button kind="ghost" height={40} disabled={busy} onClick={cancel}>
          {t('passkeys.cancel')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] text-ink">{passkey.name}</span>
        <span className="text-[12.5px] text-faint">{t('passkeys.created', { date: formatDate(passkey.createdAt, locale) })}</span>
        <span className="text-[12.5px] text-faint">
          {passkey.lastUsedAt === null ? t('passkeys.neverUsed') : t('passkeys.lastUsed', { when: formatRelative(passkey.lastUsedAt, locale) })}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button kind="ghost" height={36} disabled={busy} onClick={() => { setDraft(passkey.name); setEditing(true); }}>
          {t('passkeys.rename')}
        </Button>
        <button
          type="button"
          aria-label={t('passkeys.delete')}
          disabled={busy}
          onClick={onRemove}
          className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-control text-muted disabled:opacity-60"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  );
};

export const PasskeysForm = () => {
  const { t } = useLocale();
  const { passkeys, loading, loadError, enrol, rename, remove } = usePasskeys();
  const [adding, setAdding] = useState(false);
  const [password, setPassword] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PasskeyDto | null>(null);
  const supported = browserSupportsWebAuthn();

  // The 409 code is shared with the book-upload duplicate, whose message talks
  // about the library, so this one case gets its own string.
  const describe = (err: unknown): string =>
    err instanceof ApiClientError && err.code === 'duplicate' ? t('passkeys.duplicate') : describeError(err, t);

  const run = async (id: string, fn: () => Promise<void>): Promise<void> => {
    setActionError(null);
    setBusyId(id);
    try {
      await fn();
    } catch (err) {
      setActionError(describe(err));
    } finally {
      setBusyId(null);
    }
  };

  const closeAdd = (): void => {
    setAdding(false);
    setPassword('');
  };

  const submitAdd = async (): Promise<void> => {
    setActionError(null);
    setBusyId('new');
    try {
      await enrol(password);
      closeAdd();
    } catch (err) {
      // Cancelling the OS prompt is a normal outcome, so it closes the form
      // silently rather than reporting a failure.
      if (isCeremonyCancel(err)) closeAdd();
      else setActionError(describe(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-[18px] md:gap-[22px]">
      <p className="text-[14px] leading-normal text-muted md:text-[14.5px]">{t('passkeys.intro')}</p>
      {supported ? null : <p className="text-[14px] text-faint">{t('passkeys.unsupported')}</p>}

      {loading ? null : loadError ? (
        <p role="alert" className="text-[13.5px] text-danger">
          {describeError(loadError, t)}
        </p>
      ) : passkeys && passkeys.length > 0 ? (
        <div className="flex flex-col">
          {passkeys.map((p) => (
            <Row
              key={p.id}
              passkey={p}
              busy={busyId === p.id}
              onRename={(name) => run(p.id, () => rename(p.id, name).then(() => undefined))}
              onRemove={() => setPendingDelete(p)}
            />
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-faint">{t('passkeys.empty')}</p>
      )}

      {!supported ? null : adding ? (
        <div className="flex flex-col gap-3">
          {/* The hint sits outside the Field: Field renders its own hint inside
              the label, which would fold the sentence into the label text. */}
          <Field
            label={t('passkeys.password')}
            type="password"
            autoComplete="current-password"
            aria-describedby="passkey-password-hint"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p id="passkey-password-hint" className="text-[12.5px] text-faint">
            {t('passkeys.passwordHint')}
          </p>
          <div className="flex gap-2.5">
            <Button height={42} disabled={busyId === 'new'} onClick={() => void submitAdd()}>
              {t('passkeys.confirm')}
            </Button>
            <Button kind="ghost" height={42} disabled={busyId === 'new'} onClick={closeAdd}>
              {t('passkeys.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button kind="ghost" icon="key" height={42} className="self-start" onClick={() => setAdding(true)}>
          {t('passkeys.add')}
        </Button>
      )}

      {actionError ? (
        <p role="alert" className="text-[13.5px] text-danger">
          {actionError}
        </p>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        message={pendingDelete ? t('passkeys.deleteConfirm', { name: pendingDelete.name }) : ''}
        confirmLabel={t('passkeys.delete')}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) void run(target.id, () => remove(target.id));
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
