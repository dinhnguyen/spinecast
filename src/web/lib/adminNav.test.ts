import { describe, expect, it } from 'vitest';
import { ADMIN_NAV } from './adminNav';
import { settingsNav } from './settingsNav';

describe('ADMIN_NAV', () => {
  it('has exactly three rows in order overview, users, invites', () => {
    expect(ADMIN_NAV.map((n) => n.key)).toEqual(['overview', 'users', 'invites']);
    expect(ADMIN_NAV.map((n) => n.to)).toEqual(['/admin', '/admin/users', '/admin/invites']);
  });
});

describe('settingsNav', () => {
  it('contains no invites key', () => {
    expect(settingsNav().map((n) => n.key)).not.toContain('invites');
  });
});
