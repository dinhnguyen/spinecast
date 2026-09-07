import type { Locale } from '../../shared/apiTypes';
import { en } from './en';
import { vi } from './vi';

export interface Quote {
  text: string;
  work: string;
  author: string;
  year?: number;
  source: string;
}

export const QUOTES: Record<Locale, readonly Quote[]> = { vi, en };

export const pickQuote = (locale: Locale, random: () => number = Math.random): Quote => {
  const pool = QUOTES[locale];
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
};
