import { useEffect, useState, type FormEvent } from 'react';
import type { HashMethod, SyncSettingsDto, SyncSettingsInput } from '../../shared/apiTypes';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { RadioOption } from '../components/RadioOption';
import { Toggle } from '../components/Toggle';
import { useLocale } from '../i18n/LocaleProvider';
import { describeError } from '../lib/errorMessage';
import { formatClock, syncErrorMessageFor } from '../lib/format';
import { Icon } from '../lib/icons';

type TestResult = { ok: true } | { ok: false; message: string };

interface SyncSettingsFormProps {
  settings: SyncSettingsDto | null;
  save: (input: SyncSettingsInput) => Promise<SyncSettingsDto>;
  test: () => Promise<void>;
}

export const SyncSettingsForm = ({ settings, save, test }: SyncSettingsFormProps) => {
  const { t, locale } = useLocale();
  const [initialized, setInitialized] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hashMethod, setHashMethod] = useState<HashMethod>('partial');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (settings && !initialized) {
      setEnabled(settings.enabled);
      setServerUrl(settings.serverUrl);
      setUsername(settings.username);
      setHashMethod(settings.hashMethod);
      setInitialized(true);
    }
  }, [settings, initialized]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await save({ enabled, serverUrl, username, hashMethod, ...(password ? { password } : {}) });
      setPassword('');
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await test();
      setTestResult({ ok: true });
    } catch (err) {
      setTestResult({ ok: false, message: describeError(err, t) });
    } finally {
      setTesting(false);
    }
  };

  const statusLine = settings?.lastError
    ? { cls: 'text-danger', text: syncErrorMessageFor(settings.lastError, locale) }
    : settings?.lastOkAt
      ? { cls: 'text-ok', text: t('settings.sync.okAt', { time: formatClock(settings.lastOkAt, locale) }) }
      : { cls: 'text-muted', text: t('settings.sync.intro') };

  const testDisabled = testing || saving || !settings?.hasCredentials;

  const testResultLine = testResult ? (
    <span className={`flex items-center gap-1.5 text-[13.5px] ${testResult.ok ? 'text-ok' : 'text-danger'}`}>
      <Icon name={testResult.ok ? 'check' : 'alert'} size={16} />
      {testResult.ok ? (settings?.lastOkAt ? t('settings.sync.okAt', { time: formatClock(settings.lastOkAt, locale) }) : t('settings.sync.ok')) : testResult.message}
    </span>
  ) : null;

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5 md:gap-[22px]">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3.5 md:px-[18px] md:py-4">
        <div className="flex flex-col gap-0.5 md:gap-[3px]">
          <span className="text-[15px] font-semibold md:text-[16px]">{t('settings.sync.toggle')}</span>
          <span className={`text-[13px] md:text-[13.5px] ${statusLine.cls}`}>{statusLine.text}</span>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} label={t('settings.sync.toggle')} />
      </div>

      <Field
        label={t('settings.sync.serverUrl')}
        mono
        inputMode="url"
        value={serverUrl}
        onChange={(e) => setServerUrl(e.target.value)}
        className="md:!h-[44px]"
        required
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t('settings.sync.username')} value={username} onChange={(e) => setUsername(e.target.value)} className="md:!h-[44px]" required />
        <Field
          label={t('settings.sync.password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={settings?.hasCredentials ? '••••••••' : undefined}
          hint={t('settings.sync.passwordHint')}
          className="md:!h-[44px]"
          required={!settings?.hasCredentials}
        />
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-muted">{t('settings.sync.matching')}</span>
        <div className="grid grid-cols-1 md:grid-cols-2 md:gap-4">
          <RadioOption
            label={t('settings.sync.partial')}
            description={t('settings.sync.partialHint')}
            checked={hashMethod === 'partial'}
            onSelect={() => setHashMethod('partial')}
          />
          <RadioOption
            label={t('settings.sync.filename')}
            description={t('settings.sync.filenameHint')}
            checked={hashMethod === 'filename'}
            onSelect={() => setHashMethod('filename')}
          />
        </div>
      </div>

      {error ? <p role="alert" className="text-[14px] text-danger">{error}</p> : null}

      <div className="hidden items-center justify-between pt-1.5 md:flex">
        <div className="flex items-center gap-2.5">
          <Button type="button" kind="ghost" icon="sync" height={40} disabled={testDisabled} onClick={() => void handleTest()}>
            {t('settings.sync.test')}
          </Button>
          {testResultLine}
        </div>
        <Button type="submit" height={40} disabled={saving}>
          {t('common.saveChanges')}
        </Button>
      </div>

      <div className="flex flex-col gap-2.5 md:hidden">
        <div className="flex gap-2.5">
          <Button type="button" kind="ghost" icon="sync" height={44} disabled={testDisabled} onClick={() => void handleTest()}>
            {t('settings.sync.test')}
          </Button>
          <div className="flex-1">
            <Button type="submit" height={44} disabled={saving} className="w-full">
              {t('common.save')}
            </Button>
          </div>
        </div>
        {testResultLine}
      </div>
    </form>
  );
};
