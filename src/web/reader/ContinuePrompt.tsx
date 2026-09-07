import { Button } from '../components/Button';
import { useLocale } from '../i18n/LocaleProvider';
import { formatPercent, formatRelative } from '../lib/format';

interface ContinuePromptProps {
  device: string;
  percentage: number;
  timestamp: number;
  onStay: () => void;
  onContinue: () => void;
}

export const ContinuePrompt = ({ device, percentage, timestamp, onStay, onContinue }: ContinuePromptProps) => {
  const { t, locale } = useLocale();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(42,37,31,.28)]">
      <div className="flex w-[340px] flex-col gap-4 rounded-[10px] bg-surface p-5 shadow-[0_12px_32px_rgba(42,37,31,.16)]">
        <h2 className="font-serif text-[18px] font-semibold">{t('reader.continueTitle', { device })}</h2>
        <p className="text-[15px] text-muted">
          {t('reader.continueBody', { percent: formatPercent(Math.round(percentage * 1_000_000)), when: formatRelative(timestamp, locale) })}
        </p>
        <div className="flex justify-end gap-2.5">
          <Button kind="ghost" onClick={onStay}>
            {t('reader.stay')}
          </Button>
          <Button kind="primary" onClick={onContinue}>
            {t('reader.continue')}
          </Button>
        </div>
      </div>
    </div>
  );
};
