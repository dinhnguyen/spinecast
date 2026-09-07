import { expect, test } from '@playwright/test';

test('language switch persists across reload and a fresh login', async ({ page, browser }, testInfo) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@dev.local');
  await page.getByLabel('Mật khẩu').fill('123456');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thư viện' })).toBeVisible();
  const invite = await page.evaluate(async () => (await (await fetch('/api/invites', { method: 'POST' })).json()) as { code: string });
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));

  const email = `i18n-${testInfo.workerIndex}-${Date.now()}@e2e.local`;
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill('reader-pass-1');
  await page.getByLabel('Mã mời').fill(invite.code);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByText('Chưa có sách nào')).toBeVisible();

  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const fresh = await browser.newContext();
  const page2 = await fresh.newPage();
  await page2.goto('/login');
  await page2.getByLabel('Email').fill(email);
  await page2.getByLabel(/Mật khẩu|Password/).fill('reader-pass-1');
  await page2.getByRole('button', { name: /^(Đăng nhập|Log in)$/ }).click();
  await expect(page2.getByRole('heading', { name: 'Library' })).toBeVisible();
  await fresh.close();
});
