import { expect, test } from '@playwright/test';

test.describe.serial('phase 1 flow', () => {
  test('admin logs in, invites a reader, reader registers, uploads, reads and resumes', async ({ page, isMobile }, testInfo) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@dev.local');
    await page.getByLabel('Mật khẩu').fill('123456');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Thư viện' })).toBeVisible();

    const invite = await page.evaluate(async () => (await (await fetch('/api/invites', { method: 'POST' })).json()) as { code: string });
    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));

    await page.goto('/register');
    await page.getByLabel('Email').fill(`reader-${testInfo.workerIndex}-${Date.now()}@e2e.local`);
    await page.getByLabel('Mật khẩu').fill('reader-pass-1');
    await page.getByLabel('Mã mời').fill(invite.code);
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(page.getByText('Chưa có sách nào')).toBeVisible();

    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles('test/fixtures/minimal.epub');
    await expect(page.getByText('Minimal Book')).toBeVisible();
    const card = page.locator('a[href^="/read/"]').first();

    await card.click();
    await expect(page).toHaveURL(/\/read\//);

    const contentFrame = () => {
      const frame = page.frames().find((f) => f !== page.mainFrame());
      if (!frame) throw new Error('foliate content iframe not found yet');
      return frame;
    };
    await expect.poll(() => page.frames().length, { timeout: 20_000 }).toBeGreaterThan(1);
    await expect(contentFrame().getByText('Paragraph 1 of chapter 1')).toBeVisible({ timeout: 20_000 });

    // `<foliate-view>` itself lives in the main document's light DOM (it's only its own
    // internal rendering nodes - the container/iframe - that sit behind a *closed* shadow
    // root); its public `lastLocation` property is updated synchronously by the renderer's
    // own `relocate` event, independent of React's `restoringRef` gate in ReaderPage.tsx.
    // `lastLocation.cfi` is a deterministic string built from the current section index and
    // DOM range (see `View#getCFI` in vendor/foliate-js/view.js), so it is a precise,
    // page-accurate fingerprint of "what is actually rendered right now" - unlike the D1
    // row, which `handleRelocate` explicitly skips writing while a restore is in progress.
    const readCfi = (): Promise<string | null> =>
      page.evaluate(() => (document.querySelector('foliate-view') as unknown as { lastLocation?: { cfi?: string } } | null)?.lastLocation?.cfi ?? null);

    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    const bookId = page.url().split('/read/')[1]!;

    // Progress saves are debounced client-side, so poll the server for the persisted row
    // rather than sleeping for a fixed window just past the debounce.
    const readProgress = (): Promise<{ local: { pctQ: number; xpath: string } | null }> =>
      page.evaluate(async (id) => (await (await fetch(`/api/books/${id}/progress`)).json()) as { local: { pctQ: number; xpath: string } | null }, bookId);
    await expect.poll(async () => (await readProgress()).local?.pctQ ?? 0, { timeout: 10_000 }).toBeGreaterThan(0);
    const progress = await readProgress();
    expect(progress.local!.pctQ).toBeGreaterThan(0);
    expect(progress.local!.xpath).toMatch(/^\/body\/DocFragment\[\d+\]\/body/);

    const cfiBeforeReload = await readCfi();
    expect(cfiBeforeReload).not.toBeNull();

    await page.reload();
    await expect.poll(() => page.frames().length, { timeout: 20_000 }).toBeGreaterThan(1);
    await expect(contentFrame().locator('body')).toBeVisible({ timeout: 20_000 });

    // The DB row itself is untouched by this reload (see comment above), so re-reading
    // `/progress` here would only prove the earlier PUT worked, not that restoring on
    // reopen actually re-seeks the book. What genuinely exercises the client's restore
    // path is the position `foliate-view` renders once it's done restoring: it must
    // converge back to the exact page we were on before reloading, not fall back to the
    // start of the book.
    await expect.poll(readCfi, { timeout: 20_000 }).toBe(cfiBeforeReload);

    const after = await page.evaluate(async (id) => (await (await fetch(`/api/books/${id}/progress`)).json()) as { local: { pctQ: number } }, bookId);
    expect(Math.abs(after.local.pctQ - progress.local!.pctQ)).toBeLessThan(20_000);

    if (isMobile) {
      await page.mouse.click(195, 400); // center tap shows the toolbar
      await expect(page.getByRole('button', { name: 'Mục lục' })).toBeVisible();
    } else {
      await page.getByRole('button', { name: 'Mục lục' }).click();
      await expect(page.getByRole('button', { name: 'Chapter 2' })).toBeVisible();
    }
  });
});
