import { describe, expect, it } from 'vitest';
import { translate } from '../i18n/messages';
import { ApiClientError } from './api';
import { describeError } from './errorMessage';

const tEn = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);

describe('describeError', () => {
  it('maps known codes', () => {
    expect(describeError(new ApiClientError(409, 'duplicate', 'x'), tEn)).toBe('Already in your library');
  });
  it('maps sync_* with the kind', () => {
    expect(describeError(new ApiClientError(502, 'sync_progress', 'x'), tEn)).toBe('Could not reach the sync server (progress)');
  });
  it('falls back for unknown codes and non-api errors', () => {
    expect(describeError(new ApiClientError(418, 'teapot', 'x'), tEn)).toBe('Unexpected error');
    expect(describeError(new TypeError('failed to fetch'), tEn)).toBe('Could not connect');
  });
});
