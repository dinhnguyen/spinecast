import { useNavigate } from 'react-router';
import type { Locale } from '../../shared/apiTypes';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { SegmentedControl } from '../components/SegmentedControl';
import { useToast } from '../hooks/useToast';
import { useLocale } from '../i18n/LocaleProvider';
import { useAuth } from '../lib/auth';
import { describeError } from '../lib/errorMessage';

export const AccountForm = () => {
  const { user, logout, updateLocale } = useAuth();
  const { t, locale } = useLocale();
  const { toast, show } = useToast();
  const navigate = useNavigate();

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
      <div className="pt-1.5">
        <Button type="button" kind="ghost" icon="logout" onClick={() => void handleLogout()}>
          {t('settings.account.logout')}
        </Button>
      </div>
      {toast}
    </div>
  );
};
