import type { Locale } from '../../shared/apiTypes';
import { en } from './en';
import { vi } from './vi';

export type MessageKey = keyof typeof vi;
type PluralOf<K> = K extends `${infer B}_other` ? B : never;
export type PluralBase = PluralOf<MessageKey>;
export type Params = Record<string, string | number>;

const TABLES: Record<Locale, Record<string, string>> = { vi, en };

const fill = (raw: string, params?: Params): string =>
  params ? raw.replace(/\{(\w+)\}/g, (m, p: string) => (p in params ? String(params[p]) : m)) : raw;

export const isMessageKey = (k: string): k is MessageKey => k in vi;

export const translate = (locale: Locale, key: MessageKey, params?: Params): string =>
  fill(TABLES[locale][key] ?? key, params);

export const translatePlural = (locale: Locale, base: PluralBase, count: number, params?: Params): string => {
  const table = TABLES[locale];
  const one = `${base}_one`;
  const key = locale === 'en' && count === 1 && one in table ? one : `${base}_other`;
  return fill(table[key] ?? key, { ...params, count });
};
