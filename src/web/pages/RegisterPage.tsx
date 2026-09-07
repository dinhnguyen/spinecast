import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { QuotePanel } from '../components/QuotePanel';
import { useLocale } from '../i18n/LocaleProvider';
import { useAuth } from '../lib/auth';
import { describeError } from '../lib/errorMessage';
import { Button } from '../components/Button';
import { Field } from '../components/Field';

export const RegisterPage = () => {
  const { user, register } = useAuth();
  const { t, locale, setLocale } = useLocale();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email, password, invite);
      navigate('/', { replace: true });
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full">
      <QuotePanel />
      <main className="flex flex-1 flex-col justify-center px-7 pb-[60px] md:items-center md:px-0 md:pb-0">
        <form onSubmit={submit} className="flex w-full flex-col gap-9 md:w-[380px] md:gap-7">
          <div className="flex flex-col gap-2.5 md:gap-2">
            <h1 className="font-serif text-[36px] font-semibold tracking-[-.015em] md:text-[30px]">{t('register.title')}</h1>
          </div>
          <div className="flex flex-col gap-[18px] md:gap-4">
            <Field label={t('login.email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Field label={t('login.password')} type="password" autoComplete="new-password" hint={t('register.passwordHint')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            <Field label={t('register.invite')} mono placeholder="ABCD-EFGH" value={invite} onChange={(e) => setInvite(e.target.value)} required />
            {error ? <p role="alert" className="text-[14px] text-danger">{error}</p> : null}
            <Button type="submit" height={48} disabled={busy} className="md:!h-[46px]">{t('register.submit')}</Button>
          </div>
          <p className="text-center text-[14px] text-muted md:text-left">{t('register.haveAccount')} <Link to="/login" className="font-semibold">{t('register.login')}</Link></p>
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
