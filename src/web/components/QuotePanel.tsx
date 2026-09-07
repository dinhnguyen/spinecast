import { useMemo } from 'react';
import { useLocale } from '../i18n/LocaleProvider';
import { pickQuote } from '../quotes/quotes';

export const QuotePanel = () => {
  const { t, locale } = useLocale();
  const quote = useMemo(() => pickQuote(locale), [locale]);
  const lines = quote.text.split('\n');
  return (
    <aside className="hidden w-[640px] flex-col justify-between bg-dark p-16 text-[#e9e1d4] md:flex">
      <span className="font-serif text-[26px] font-semibold">Spinecast</span>
      <div className="flex flex-col gap-[22px]">
        <p className="font-serif text-[38px] leading-[1.25] text-pretty">
          {lines.map((line, i) => (
            <span key={i}>
              {line}
              {i < lines.length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
        <span className="text-[15px] text-[#a89e92]">{quote.work} · {quote.author}</span>
      </div>
      <span className="text-[14px] text-[#8a8175]">{t('app.tagline')}</span>
    </aside>
  );
};
