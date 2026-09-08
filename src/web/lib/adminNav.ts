import type { MessageKey } from '../i18n/messages';

export type AdminSection = 'overview' | 'users' | 'invites';

export const ADMIN_NAV: { key: AdminSection; labelKey: MessageKey; to: string }[] = [
  { key: 'overview', labelKey: 'admin.overview', to: '/admin' },
  { key: 'users', labelKey: 'admin.users', to: '/admin/users' },
  { key: 'invites', labelKey: 'admin.invites', to: '/admin/invites' },
];
