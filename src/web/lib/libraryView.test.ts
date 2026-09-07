import { describe, expect, it } from 'vitest';
import { loadView, saveView } from './libraryView';

describe('libraryView', () => {
  it('falls back to grid when storage is empty or holds an unknown value', () => {
    localStorage.clear();
    expect(loadView()).toBe('grid');
    localStorage.setItem('spinecast.libraryView', 'nope');
    expect(loadView()).toBe('grid');
  });

  it('round-trips a saved mode', () => {
    saveView('list');
    expect(loadView()).toBe('list');
    saveView('grid');
    expect(loadView()).toBe('grid');
  });
});
