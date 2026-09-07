export type ViewMode = 'grid' | 'list';

const KEY = 'spinecast.libraryView';

export const loadView = (): ViewMode => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
};

export const saveView = (mode: ViewMode): void => {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // storage may be unavailable; the choice then lives for the session only
  }
};
