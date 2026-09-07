import { describe, expect, it } from 'vitest';
import { catalogUrl } from './opds';

describe('catalogUrl', () => {
  it('builds the absolute catalog root without a trailing slash', () => {
    expect(catalogUrl('https://spinecast.example.com', 'u1', 'library')).toBe('https://spinecast.example.com/opds/u1/library');
    expect(catalogUrl('http://localhost:5173', 'u1', 'public')).toBe('http://localhost:5173/opds/u1/public');
  });
});
