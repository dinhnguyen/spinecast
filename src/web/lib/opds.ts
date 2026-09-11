import type { OpdsScope } from '../../shared/apiTypes';
import { scopeChar } from '../../shared/opds';

export const catalogUrl = (origin: string, slug: string, scope: OpdsScope): string => `${origin}/o/${slug}/${scopeChar(scope)}`;
