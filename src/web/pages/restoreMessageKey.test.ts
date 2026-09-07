import { describe, expect, it } from 'vitest';
import type { ProgressDto } from '../../shared/apiTypes';
import { restoreMessageKey } from './restoreMessageKey';

const progress = (overrides: Partial<ProgressDto>): ProgressDto => ({
  pctQ: 1,
  spine: 0,
  updatedAt: 0,
  lastPushedAt: null,
  deviceId: null,
  observedAt: null,
  ...overrides,
});

describe('restoreMessageKey', () => {
  it('shows nothing for an exact restore on the same device', () => {
    const local = progress({ xpath: '/body', deviceId: 'dev-a' });
    expect(restoreMessageKey(local, 'xpath', 'dev-a')).toBe(null);
  });

  it('shows the device toast for an exact restore on another device', () => {
    const local = progress({ xpath: '/body', deviceId: 'dev-a' });
    expect(restoreMessageKey(local, 'xpath', 'dev-b')).toBe('reader.otherDevice');
  });

  it('shows the approximate-position toast for an approximate restore on the same device', () => {
    const local = progress({ xpath: '/body', deviceId: 'dev-a' });
    expect(restoreMessageKey(local, 'para', 'dev-a')).toBe('reader.approxPosition');
  });

  it('prefers the approximate-position toast over the device toast', () => {
    const local = progress({ xpath: '/body', deviceId: 'dev-a' });
    expect(restoreMessageKey(local, 'para', 'dev-b')).toBe('reader.approxPosition');
  });
});
