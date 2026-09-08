import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { Locale } from '../../shared/apiTypes';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { SegmentedControl } from '../components/SegmentedControl';
import { Toggle } from '../components/Toggle';
import { useToast } from '../hooks/useToast';
import { useLocale } from '../i18n/LocaleProvider';
import { ApiClientError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { describeError } from '../lib/errorMessage';

export const AccountForm = () => {
  const { user, logout, updateLocale, changePassword } = useAuth();
  const { t, locale } = useLocale();
  const { toast, show } = useToast();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [mismatchError, setMismatchError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const options = [
    { value: 'vi' as Locale, label: t('locale.vi') },
    { value: 'en' as Locale, label: t('locale.en') },
  ];

  const handleLocale = (next: Locale) => {
    updateLocale(next).catch((e: unknown) => show(describeError(e, t)));
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setCurrentError(null);
    setMismatchError(null);
    if (next !== repeat) {
      setMismatchError(t('account.password.mismatch'));
      return;
    }
    setPwBusy(true);
    try {
      await changePassword(current, next, signOutOthers);
      setCurrent('');
      setNext('');
      setRepeat('');
      show(t('account.password.saved'));
    } catch (error) {
      setCurrentError(error instanceof ApiClientError && error.code === 'invalid_credentials' ? t('account.password.wrongCurrent') : describeError(error, t));
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 md:gap-[22px]">
      <Field label={t('settings.account.email')} value={user?.email ?? ''} readOnly className="md:!h-[44px]" />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold tracking-[.01em] text-muted">{t('settings.account.role')}</span>
        <span className="text-[15px] text-ink">{user?.role === 'admin' ? t('settings.account.admin') : t('settings.account.user')}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold tracking-[.01em] text-muted">{t('settings.account.language')}</span>
        <div className="md:w-[280px]">
          <SegmentedControl options={options} value={locale} onChange={handleLocale} height={40} />
        </div>
      </div>
      <form onSubmit={(event) => void submitPassword(event)} className="flex flex-col gap-3.5 border-t border-border pt-5">
        <span className="text-[13px] font-semibold tracking-[.01em] text-muted">{t('account.password.title')}</span>
        <Field label={t('account.password.current')} type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required />
        {currentError ? <p role="alert" className="text-[13.5px] text-danger">{currentError}</p> : null}
        <Field label={t('account.password.new')} type="password" autoComplete="new-password" minLength={8} value={next} onChange={(event) => setNext(event.target.value)} required />
        <Field label={t('account.password.repeat')} type="password" autoComplete="new-password" minLength={8} value={repeat} onChange={(event) => setRepeat(event.target.value)} required />
        {mismatchError ? <p role="alert" className="text-[13.5px] text-danger">{mismatchError}</p> : null}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14.5px] text-ink">{t('account.password.signOutOthers')}</span>
          <Toggle checked={signOutOthers} onChange={setSignOutOthers} label={t('account.password.signOutOthers')} />
        </div>
        <div><Button type="submit" height={40} disabled={pwBusy}>{t('account.password.save')}</Button></div>
      </form>
      <div className="pt-1.5">
        <Button type="button" kind="ghost" icon="logout" onClick={() => void handleLogout()}>
          {t('settings.account.logout')}
        </Button>
      </div>
      {toast}
    </div>
  );
};
