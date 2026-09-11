import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminOverviewDto } from '../../shared/apiTypes';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AdminOverview } from './AdminOverview';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const clean: AdminOverviewDto = { users: 3, books: 23, blobs: 20, blobBytes: 60_000_000, orphanBlobRows: 0, orphanObjects: 0 };
const dirty: AdminOverviewDto = { users: 3, books: 23, blobs: 20, blobBytes: 60_000_000, orphanBlobRows: 1, orphanObjects: 2 };

const mockFetch = (overview: AdminOverviewDto, extra: (url: string, init?: RequestInit) => Response | null = () => null) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    const res = extra(url, init);
    if (res) return Promise.resolve(res);
    if (url === '/api/admin/overview') return Promise.resolve(json(overview));
    return Promise.resolve(json({ error: { code: 'not_found', message: 'nope' } }, 404));
  });

const mount = () =>
  render(
    <LocaleProvider initial="vi">
      <AdminOverview />
    </LocaleProvider>,
  );

describe('AdminOverview', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the four figures and hides the cleanup button when there are no orphans', async () => {
    mockFetch(clean);
    mount();

    await screen.findByText('3');
    expect(screen.getByText('23')).toBeTruthy();
    expect(screen.getByText('20')).toBeTruthy();
    expect(screen.getByText('57,2 MB')).toBeTruthy();
    expect(screen.queryByText('Dọn')).toBeNull();
  });

  it('shows the orphan line and cleanup button, and cleans up on confirm', async () => {
    let getCount = 0;
    const calls: { url: string; init?: RequestInit }[] = [];
    mockFetch(dirty, (url, init) => {
      if (url === '/api/admin/overview' && (!init || init.method === undefined || init.method === 'GET')) getCount++;
      calls.push({ url, init });
      if (url === '/api/admin/overview/cleanup' && init?.method === 'POST') {
        return json({ deletedRows: 1, deletedObjects: 2 });
      }
      return null;
    });
    mount();

    await screen.findByText('Mồ côi: 1 blob, 2 object');
    const cleanupButton = screen.getByText('Dọn');
    act(() => cleanupButton.click());

    const confirmDialog = await screen.findByRole('alertdialog');
    expect(confirmDialog.textContent).toContain('Xoá các tệp mồ côi đã tìm thấy?');
    await act(async () => within(confirmDialog).getByText('Dọn').click());

    await waitFor(() => expect(getCount).toBe(2));
    expect(await screen.findByText('Đã dọn tệp mồ côi')).toBeTruthy();
  });

  it('walks the rehash cursor to the end and sums the counts across batches', async () => {
    const posted: string[] = [];
    mockFetch(clean, (url, init) => {
      if (!url.startsWith('/api/admin/overview/rehash') || init?.method !== 'POST') return null;
      posted.push(url);
      // Two full batches then a short one; the page must not stop at the first.
      if (posted.length === 1) return json({ scanned: 40, updated: 40, missing: 0, cursor: 'b40' });
      if (posted.length === 2) return json({ scanned: 40, updated: 38, missing: 2, cursor: 'b80' });
      return json({ scanned: 7, updated: 7, missing: 0, cursor: null });
    });
    mount();

    await screen.findByText('3');
    act(() => screen.getByText('Tính lại hash đồng bộ').click());

    const confirmDialog = await screen.findByRole('alertdialog');
    await act(async () => within(confirmDialog).getByText('Tính lại hash đồng bộ').click());

    expect(await screen.findByText('Đã cập nhật 85 cuốn, thiếu 2 tệp')).toBeTruthy();
    expect(posted).toEqual([
      '/api/admin/overview/rehash',
      '/api/admin/overview/rehash?after=b40',
      '/api/admin/overview/rehash?after=b80',
    ]);
  });

  it('stops rehashing if the server hands back a cursor that does not advance', async () => {
    let posts = 0;
    mockFetch(clean, (url, init) => {
      if (!url.startsWith('/api/admin/overview/rehash') || init?.method !== 'POST') return null;
      posts++;
      return json({ scanned: 40, updated: 1, missing: 0, cursor: 'stuck' });
    });
    mount();

    await screen.findByText('3');
    act(() => screen.getByText('Tính lại hash đồng bộ').click());
    const confirmDialog = await screen.findByRole('alertdialog');
    await act(async () => within(confirmDialog).getByText('Tính lại hash đồng bộ').click());

    expect(await screen.findByText('Đã cập nhật 2 cuốn, thiếu 0 tệp')).toBeTruthy();
    expect(posts).toBe(2);
  });

  it('surfaces a cleanup failure as an alert instead of swallowing it', async () => {
    mockFetch(dirty, (url, init) => {
      if (url === '/api/admin/overview/cleanup' && init?.method === 'POST') {
        return json({ error: { code: 'internal', message: 'boom' } }, 500);
      }
      return null;
    });
    mount();

    await screen.findByText('Mồ côi: 1 blob, 2 object');
    act(() => screen.getByText('Dọn').click());

    const confirmDialog = await screen.findByRole('alertdialog');
    await act(async () => within(confirmDialog).getByText('Dọn').click());

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Lỗi máy chủ'));
  });
});
