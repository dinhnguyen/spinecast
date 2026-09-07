import { expect, test } from '@playwright/test';

const PASSWORD = 'passkey-pass-1';

test('enrols a passkey and signs back in with it', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'virtual authenticator is Chromium-only');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  // Its own account: the desktop and mobile projects share one dev server, so
  // enrolling onto the seeded admin would leave two passkeys in one list.
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@dev.local');
  await page.getByLabel('Mật khẩu').fill('123456');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thư viện' })).toBeVisible();

  const invite = await page.evaluate(async () => (await (await fetch('/api/invites', { method: 'POST' })).json()) as { code: string });
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));

  const email = `passkey-${testInfo.workerIndex}-${Date.now()}@e2e.local`;
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(PASSWORD);
  await page.getByLabel('Mã mời').fill(invite.code);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByText('Chưa có sách nào')).toBeVisible();

  await page.goto('/settings/passkeys');
  await page.getByRole('button', { name: 'Thêm passkey' }).click();
  await page.getByLabel('Mật khẩu').fill(PASSWORD);
  await page.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByText('Chưa dùng lần nào')).toBeVisible({ timeout: 20_000 });

  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));
  await page.goto('/login');
  await page.getByRole('button', { name: 'Đăng nhập bằng passkey' }).click();
  await expect(page.getByText('Chưa có sách nào')).toBeVisible({ timeout: 20_000 });

  await page.goto('/settings/passkeys');
  await expect(page.getByText(/Dùng lần cuối/)).toBeVisible();
});
