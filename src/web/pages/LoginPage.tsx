import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { QuotePanel } from '../components/QuotePanel';
import { useLocale } from '../i18n/LocaleProvider';
import { useAuth } from '../lib/auth';
import { describeError } from '../lib/errorMessage';
import { isCeremonyCancel } from '../lib/webauthn';
import { Button } from '../components/Button';
import { Field } from '../components/Field';

export const LoginPage = () => {
  const { user, login, loginWithPasskey } = useAuth();
  const { t, locale, setLocale } = useLocale();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string; disabled?: boolean } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(location.state?.disabled ?? false);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const supportsPasskey = browserSupportsWebAuthn();
  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDisabled(false);
    try {
      await login(email, password);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const passkeySubmit = async () => {
    setPasskeyBusy(true);
    setError(null);
    try {
      await loginWithPasskey();
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      // Cancelling the OS prompt is a normal outcome, not a failure.
      if (!isCeremonyCancel(err)) setError(describeError(err, t));
    } finally {
      setPasskeyBusy(false);
    }
  };

  return (
    <div className="flex min-h-full">
      <QuotePanel />
      <main className="flex flex-1 flex-col justify-center px-7 pb-[60px] md:items-center md:px-0 md:pb-0">
        <form onSubmit={submit} className="flex w-full flex-col gap-9 md:w-[380px] md:gap-7">
          <div className="flex flex-col gap-2.5 md:gap-2">
            <h1 className="font-serif text-[36px] font-semibold tracking-[-.015em] md:text-[30px]"><span className="md:hidden">Spinecast</span><span className="hidden md:inline">{t('login.title')}</span></h1>
            <p className="text-[16px] leading-[1.45] text-muted md:text-[15px]"><span className="md:hidden">{t('login.subtitleMobile')}</span><span className="hidden md:inline">{t('login.subtitleDesktop')}</span></p>
          </div>
          <div className="flex flex-col gap-[18px] md:gap-4">
            <Field label={t('login.email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Field label={t('login.password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error || disabled ? <p role="alert" className="text-[14px] text-danger">{error ?? t('errors.account_disabled')}</p> : null}
            <Button type="submit" height={48} disabled={busy} className="md:!h-[46px]">{t('login.submit')}</Button>
            {supportsPasskey ? (
              <>
                <div className="flex items-center gap-3 text-[13px] text-faint">
                  <div className="h-px flex-1 bg-border" />
                  <span>{t('login.or')}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <Button type="button" kind="ghost" icon="key" height={48} disabled={passkeyBusy} className="md:!h-[46px]" onClick={() => void passkeySubmit()}>
                  {t('login.passkey')}
                </Button>
              </>
            ) : null}
          </div>
          <p className="text-center text-[14px] text-muted md:text-left">{t('login.haveInvite')} <Link to="/register" className="font-semibold">{t('login.register')}</Link></p>
          <p className="text-center text-[13px] text-faint md:text-left">{t('login.forgot')}</p>
          <button
            type="button"
            onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}
            aria-label={t('locale.switchLabel', { lang: t('locale.switch') })}
            className="text-center text-[13px] text-faint md:text-left"
          >
            {t('locale.switch')}
          </button>
        </form>
      </main>
    </div>
  );
};
