import type { OpdsScope } from './apiTypes';

// The short catalog path spells the scope with one letter so the whole URL
// stays typeable on an e-reader keyboard.
export const scopeChar = (scope: OpdsScope): 'l' | 'p' => (scope === 'library' ? 'l' : 'p');

export const scopeFromChar = (ch: string): OpdsScope | null => (ch === 'l' ? 'library' : ch === 'p' ? 'public' : null);
