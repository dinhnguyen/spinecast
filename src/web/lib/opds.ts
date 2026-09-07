import type { OpdsScope } from '../../shared/apiTypes';

export const catalogUrl = (origin: string, userId: string, scope: OpdsScope): string => `${origin}/opds/${userId}/${scope}`;
