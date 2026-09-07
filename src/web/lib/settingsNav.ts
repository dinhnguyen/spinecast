import type { UserDto } from '../../shared/apiTypes';
import type { MessageKey } from '../i18n/messages';

export type SettingsSection = 'sync' | 'account' | 'invites' | 'opds' | 'devices' | 'passkeys';

const NAV: { key: SettingsSection; labelKey: MessageKey; to: string }[] = [
  { key: 'account', labelKey: 'settings.account', to: '/settings/account' },
  { key: 'sync', labelKey: 'settings.sync', to: '/settings/sync' },
  { key: 'devices', labelKey: 'settings.devices', to: '/settings/devices' },
  { key: 'passkeys', labelKey: 'settings.passkeys', to: '/settings/passkeys' },
  { key: 'opds', labelKey: 'settings.opds', to: '/settings/opds' },
  { key: 'invites', labelKey: 'settings.invites', to: '/settings/invites' },
];

export const settingsNavFor = (role: UserDto['role'] | undefined) => NAV.filter((n) => n.key !== 'invites' || role === 'admin');
