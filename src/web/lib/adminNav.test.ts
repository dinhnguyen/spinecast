import { describe, expect, it } from 'vitest';
import { ADMIN_NAV } from './adminNav';
import { settingsNav } from './settingsNav';

describe('ADMIN_NAV', () => {
  it('has exactly four rows in order overview, users, invites, books', () => {
    expect(ADMIN_NAV.map((n) => n.key)).toEqual(['overview', 'users', 'invites', 'books']);
    expect(ADMIN_NAV.map((n) => n.to)).toEqual(['/admin', '/admin/users', '/admin/invites', '/admin/books']);
  });
});

describe('settingsNav', () => {
  it('contains no invites key', () => {
    expect(settingsNav().map((n) => n.key)).not.toContain('invites');
  });
});
