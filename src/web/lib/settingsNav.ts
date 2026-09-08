import type { MessageKey } from '../i18n/messages';

export type SettingsSection = 'sync' | 'account' | 'opds' | 'devices' | 'passkeys';

const NAV: { key: SettingsSection; labelKey: MessageKey; to: string }[] = [
  { key: 'account', labelKey: 'settings.account', to: '/settings/account' },
  { key: 'sync', labelKey: 'settings.sync', to: '/settings/sync' },
  { key: 'devices', labelKey: 'settings.devices', to: '/settings/devices' },
  { key: 'passkeys', labelKey: 'settings.passkeys', to: '/settings/passkeys' },
  { key: 'opds', labelKey: 'settings.opds', to: '/settings/opds' },
];

export const settingsNav = () => NAV;
