import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminBookDto, AdminBooksPageDto } from '../../shared/apiTypes';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AdminBooks } from './AdminBooks';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const item = (over: Partial<AdminBookDto> = {}): AdminBookDto => ({ id: 'b1', ownerId: 'u2', ownerEmail: 'user2@x', filename: 'kieu.epub', filesize: 2048, shared: false, blobHash: null, blobRefs: 1, createdAt: 1_700_000_000, ...over });
const stubMatchMedia = (matches: boolean) => { window.matchMedia = (() => ({ matches, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null })) as unknown as typeof window.matchMedia; };
const mount = () => render(<MemoryRouter><LocaleProvider initial="vi"><AdminBooks /></LocaleProvider></MemoryRouter>);

describe('AdminBooks', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it('renders metadata, owner link and shared-ref badge', async () => {
    stubMatchMedia(true);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ items: [item(), item({ id: 'b2', blobRefs: 2 })], nextCursor: null } satisfies AdminBooksPageDto));
    mount();
    expect((await screen.findAllByText('kieu.epub')).length).toBe(2);
    expect(screen.getAllByRole('link', { name: 'user2@x' })[0]?.getAttribute('href')).toBe('/admin/users/u2');
    expect(screen.getAllByText('2 KB').length).toBeGreaterThan(0);
    expect(screen.getAllByText('x2')).toHaveLength(1);
  });
  it('never renders a title leaked by the API', async () => {
    stubMatchMedia(true);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ items: [{ ...item(), title: 'Truyện Kiều' }], nextCursor: null }));
    mount();
    await screen.findByText('kieu.epub');
    expect(screen.queryByText('Truyện Kiều')).toBeNull();
  });
  it('loads the next cursor and then hides load more', async () => {
    stubMatchMedia(true);
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => { const url = String(input); urls.push(url); return json(url.includes('cursor=next') ? { items: [item({ id: 'b2', filename: 'two.epub' })], nextCursor: null } : { items: [item()], nextCursor: 'next' }); });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Tải thêm' }));
    await screen.findByText('two.epub');
    expect(urls.some((url) => url.includes('cursor=next'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).toBeNull();
  });
  it('renders the header and surfaces a load-more failure as an alert', async () => {
    stubMatchMedia(true);
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('cursor=next')) return json({ error: { code: 'internal', message: 'boom' } }, 500);
      return json({ items: [item()], nextCursor: 'next' });
    });
    mount();
    expect(await screen.findByText('Tên file')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });
  it('refetches and resets when sorting by owner', async () => {
    stubMatchMedia(true);
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => { const url = String(input); urls.push(url); return json({ items: [item({ filename: url.includes('sort=owner') ? 'owner.epub' : 'size.epub' })], nextCursor: null }); });
    mount();
    await screen.findByText('size.epub');
    fireEvent.click(screen.getByRole('button', { name: 'Chủ sở hữu' }));
    await screen.findByText('owner.epub');
    expect(screen.queryByText('size.epub')).toBeNull();
    expect(urls.some((url) => url.includes('sort=owner'))).toBe(true);
  });
  it('shows an empty state', async () => {
    stubMatchMedia(true);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ items: [], nextCursor: null }));
    mount();
    expect(await screen.findByText('Chưa có sách')).toBeTruthy();
  });
});
