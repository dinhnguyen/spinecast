import { expect, test } from '@playwright/test';

test('a reader adds another user public catalog as a source and downloads a book', async ({ page }, testInfo) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@dev.local');
  await page.getByLabel('Mật khẩu').fill('123456');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thư viện' })).toBeVisible();

  // Admin only ever mints invites here - additive and safe under concurrency, unlike
  // minting a public OPDS token, which is a true singleton per (user_id, scope) and
  // would race between the desktop and mobile projects if done on this shared seeded
  // account. The book-sharing and token-minting instead happen on a freshly registered
  // per-invocation "sharer" account below, so each project run gets its own singleton.
  const invites = await page.evaluate(async () => {
    const a = (await (await fetch('/api/invites', { method: 'POST' })).json()) as { code: string };
    const b = (await (await fetch('/api/invites', { method: 'POST' })).json()) as { code: string };
    return { sharer: a.code, reader: b.code };
  });
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));

  const runId = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;

  await page.goto('/register');
  await page.getByLabel('Email').fill(`opds-sharer-${runId}@e2e.local`);
  await page.getByLabel('Mật khẩu').fill('sharer-pass-1');
  await page.getByLabel('Mã mời').fill(invites.sharer);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByText('Chưa có sách nào')).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles('test/fixtures/minimal.epub');
  await expect(page.getByText('Minimal Book')).toBeVisible();

  const shared = await page.evaluate(async () => {
    const books = (await (await fetch('/api/books')).json()) as { items: { id: string }[] };
    const id = books.items[0]!.id;
    await fetch(`/api/books/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shared: true }) });
    const token = (await (await fetch('/api/opds/tokens/public', { method: 'POST' })).json()) as { token: string; url: string };
    return { token: token.token, url: token.url };
  });
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));

  await page.goto('/register');
  await page.getByLabel('Email').fill(`opds-reader-${runId}@e2e.local`);
  await page.getByLabel('Mật khẩu').fill('reader-pass-1');
  await page.getByLabel('Mã mời').fill(invites.reader);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByText('Chưa có sách nào')).toBeVisible();

  await page.getByRole('link', { name: 'Nguồn' }).click();
  await expect(page.getByText('Chưa có nguồn nào. Thêm URL catalog OPDS để duyệt và tải sách về.')).toBeVisible();
  await page.getByRole('button', { name: 'Thêm nguồn' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Sách của admin');
  await page.getByLabel('URL catalog').fill(shared.url);
  await page.getByLabel('Tên đăng nhập').fill('koreader');
  await page.getByLabel('Mật khẩu').fill(shared.token);
  await page.getByRole('button', { name: 'Lưu' }).click();

  await page.getByText('Sách của admin', { exact: true }).click();
  await expect(page).toHaveURL(/\/catalogs\//);
  // The OPDS server's navigation feed (src/worker/opds/routes.ts) is a fixed, English-only
  // Atom feed meant for generic e-reader clients - it is not run through the app's i18n layer,
  // so "All Books" is what actually appears here regardless of the viewer's locale.
  await page.getByText('All Books').click();
  await expect(page.getByText('Minimal Book')).toBeVisible();

  await page.getByRole('button', { name: 'Thêm' }).click();
  await expect(page.getByText('Đã có')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('link', { name: 'Thư viện' }).click();
  await expect(page.getByText('Minimal Book')).toBeVisible();

  // Confirm the import really created a new book row rather than the page just
  // rendering a stale list: read the second user's own library back from the API.
  const count = await page.evaluate(async () => ((await (await fetch('/api/books')).json()) as { items: unknown[] }).items.length);
  expect(count).toBe(1);
});
