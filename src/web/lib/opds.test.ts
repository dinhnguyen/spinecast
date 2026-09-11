import { describe, expect, it } from 'vitest';
import { catalogUrl } from './opds';

describe('catalogUrl', () => {
  it('builds the absolute catalog root without a trailing slash', () => {
    expect(catalogUrl('https://spinecast.example.com', 'u1', 'library')).toBe('https://spinecast.example.com/o/u1/l');
    expect(catalogUrl('http://localhost:5173', 'u1', 'public')).toBe('http://localhost:5173/o/u1/p');
  });
});
