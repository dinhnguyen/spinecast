import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from '../../shared/apiTypes';
import { resolveInitialLocale, storeLocale } from './locale';
import { translate, translatePlural, type MessageKey, type Params, type PluralBase } from './messages';

export type Translate = (key: MessageKey, params?: Params) => string;
export type TranslatePlural = (base: PluralBase, count: number, params?: Params) => string;

export interface LocaleValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
  tn: TranslatePlural;
}

const LocaleContext = createContext<LocaleValue | null>(null);

interface LocaleProviderProps {
  children: ReactNode;
  initial?: Locale;
}

export const LocaleProvider = ({ children, initial }: LocaleProviderProps) => {
  const [locale, setLocaleState] = useState<Locale>(() => initial ?? resolveInitialLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    storeLocale(next);
    setLocaleState(next);
  }, []);

  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
      tn: (base, count, params) => translatePlural(locale, base, count, params),
    }),
    [locale, setLocale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export const useLocale = (): LocaleValue => {
  const v = useContext(LocaleContext);
  if (!v) throw new Error('useLocale outside LocaleProvider');
  return v;
};

export const useT = (): { t: Translate; tn: TranslatePlural; locale: Locale } => {
  const { t, tn, locale } = useLocale();
  return { t, tn, locale };
};
