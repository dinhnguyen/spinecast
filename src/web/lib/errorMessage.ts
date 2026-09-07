import type { Translate } from '../i18n/LocaleProvider';
import { isMessageKey } from '../i18n/messages';
import { ApiClientError } from './api';

export const describeError = (err: unknown, t: Translate): string => {
  if (!(err instanceof ApiClientError)) return t('errors.network');
  if (err.code.startsWith('sync_')) return t('errors.sync', { kind: err.code.slice('sync_'.length) });
  const key = `errors.${err.code}`;
  return isMessageKey(key) ? t(key) : t('errors.unknown');
};
