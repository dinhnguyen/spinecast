import { describe, expect, it } from 'vitest';
import { en } from './en';
import { vi } from './vi';
import { isMessageKey, translate, translatePlural } from './messages';

describe('message tables', () => {
  it('have the same keys in both directions', () => {
    const viKeys = Object.keys(vi).sort();
    const enKeys = Object.keys(en).filter((k) => !k.endsWith('_one')).sort();
    expect(enKeys).toEqual(viKeys);
  });

  it('define _other for every _one', () => {
    for (const k of Object.keys(en)) {
      if (k.endsWith('_one')) expect(vi).toHaveProperty(k.replace(/_one$/, '_other'));
    }
  });
});

describe('translate', () => {
  it('replaces placeholders', () => {
    expect(translate('vi', 'reader.continueTitle', { device: 'CrossInk' })).toBe('Tiếp tục từ CrossInk?');
    expect(translate('en', 'reader.continueTitle', { device: 'CrossInk' })).toBe('Continue from CrossInk?');
  });

  it('leaves unknown placeholders visible', () => {
    expect(translate('en', 'reader.continueTitle')).toBe('Continue from {device}?');
  });

  it('picks _one only for english count 1', () => {
    expect(translatePlural('en', 'time.daysAgo', 1)).toBe('1 day ago');
    expect(translatePlural('en', 'time.daysAgo', 3)).toBe('3 days ago');
    expect(translatePlural('vi', 'time.daysAgo', 1)).toBe('1 ngày trước');
  });

  it('recognises keys', () => {
    expect(isMessageKey('errors.duplicate')).toBe(true);
    expect(isMessageKey('errors.nope')).toBe(false);
  });
});
