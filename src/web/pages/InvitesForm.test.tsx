import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InviteDto } from '../../shared/apiTypes';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { InvitesForm } from './InvitesForm';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const now = Math.floor(Date.now() / 1000);
const unused: InviteDto = { code: 'ABCD-EFGH', expiresAt: now + 3 * 86400, usedBy: null, usedByEmail: null, createdAt: now };
const used: InviteDto = { code: 'USED-CODE', expiresAt: now + 3 * 86400, usedBy: 'u1', usedByEmail: 'b@x.y', createdAt: now };
const expired: InviteDto = { code: 'EXPD-CODE', expiresAt: now - 1, usedBy: null, usedByEmail: null, createdAt: now };

const mockFetch = (items: InviteDto[], extra: (url: string, init?: RequestInit) => Response | null = () => null) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    const res = extra(url, init);
    if (res) return Promise.resolve(res);
    if (url === '/api/invites') return Promise.resolve(json({ items }));
    return Promise.resolve(json({ error: { code: 'not_found', message: 'nope' } }, 404));
  });

const mount = () =>
  render(
    <LocaleProvider initial="vi">
      <InvitesForm />
    </LocaleProvider>,
  );

describe('InvitesForm', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('revokes an unused invite and removes its row', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    mockFetch([unused], (url, init) => {
      calls.push({ url, init });
      if (url === '/api/invites/ABCD-EFGH' && init?.method === 'DELETE') return new Response(null, { status: 204 });
      return null;
    });
    mount();

    const revokeButton = await screen.findByLabelText('Thu hồi mã ABCD-EFGH');
    await act(async () => revokeButton.click());

    await waitFor(() => expect(calls.some((c) => c.url === '/api/invites/ABCD-EFGH' && c.init?.method === 'DELETE')).toBe(true));
    await waitFor(() => expect(screen.queryByText('ABCD-EFGH')).toBeNull());
  });

  it('shows the used-by email and no revoke button for a used invite', async () => {
    mockFetch([used]);
    mount();

    await screen.findByText('b@x.y');
    expect(screen.queryByLabelText('Thu hồi mã USED-CODE')).toBeNull();
  });

  it('shows "Đã hết hạn" for an expired unused invite and still allows revoking it', async () => {
    mockFetch([expired]);
    mount();

    const expiredLabel = await screen.findByText('Đã hết hạn');
    expect(expiredLabel.className).toContain('text-faint');
    expect(screen.getByLabelText('Thu hồi mã EXPD-CODE')).toBeTruthy();
  });

  it('keeps the create-invite button visible when the list is empty', async () => {
    mockFetch([]);
    mount();

    expect(await screen.findByText('Chưa có mã mời')).toBeTruthy();
    expect(screen.getByText('Tạo mã mời')).toBeTruthy();
  });

  it('shows a loading indicator, not the empty state, before the list arrives', async () => {
    let resolveFetch: (res: Response) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    mount();

    expect(screen.getByText('Đang tải…')).toBeTruthy();
    expect(screen.queryByText('Chưa có mã mời')).toBeNull();

    resolveFetch(json({ items: [] }));
    expect(await screen.findByText('Chưa có mã mời')).toBeTruthy();
  });
});
