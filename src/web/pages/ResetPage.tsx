import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { QuotePanel } from '../components/QuotePanel';
import { useLocale } from '../i18n/LocaleProvider';
import { useAuth } from '../lib/auth';
import { describeError } from '../lib/errorMessage';
import { Button } from '../components/Button';
import { Field } from '../components/Field';

export const ResetPage = () => {
  const { resetPassword } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(code, password);
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
            <h1 className="font-serif text-[36px] font-semibold tracking-[-.015em] md:text-[30px]">{t('reset.title')}</h1>
          </div>
          {code ? (
            <div className="flex flex-col gap-[18px] md:gap-4">
              <Field label={t('reset.password')} type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
              {error ? <p role="alert" className="text-[14px] text-danger">{error}</p> : null}
              <Button type="submit" height={48} disabled={busy} className="md:!h-[46px]">{t('reset.title')}</Button>
            </div>
          ) : (
            <p role="alert" className="text-[14px] text-danger">{t('reset.invalidLink')}</p>
          )}
        </form>
      </main>
    </div>
  );
};
