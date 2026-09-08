import { expect, test } from '@playwright/test';

const logout = (page: import('@playwright/test').Page) => page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));

const login = async (page: import('@playwright/test').Page, email: string, password: string) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
};

test.describe.serial('admin flow', () => {
  test('reset, lock and unlock a user', async ({ page, browser }) => {
    // 1. Admin opens the users list.
    await login(page, 'admin@dev.local', '123456');
    await expect(page.getByRole('heading', { name: 'Thư viện' })).toBeVisible();
    await page.getByRole('button', { name: 'Tài khoản' }).click();
    const usersLink = page.getByRole('link', { name: 'Người dùng', exact: true });
    await expect(usersLink).toBeVisible();
    await usersLink.click();
    await expect(page.getByText('reader@dev.local')).toBeVisible();

    // 2. Issue a reset code and read the link out of the dialog.
    await page.getByRole('button', { name: 'Thao tác với reader@dev.local' }).click();
    await page.getByRole('button', { name: 'Cấp mã đặt lại' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    const linkText = (await dialog.locator('span.break-all').textContent()) ?? '';
    expect(linkText).toMatch(/\/reset\?code=[0-9a-f]{32}$/);
    await dialog.getByRole('button', { name: 'Đóng' }).click();

    // 3. Reader uses the link to set a new password.
    await logout(page);
    await page.goto(linkText);
    await page.getByLabel('Mật khẩu mới').fill('new-pass-987');
    await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Thư viện' })).toBeVisible();

    // 4. Old password no longer works, new one does.
    await logout(page);
    await login(page, 'reader@dev.local', '123456');
    await expect(page.getByRole('alert')).toHaveText('Email hoặc mật khẩu không đúng');
    await page.getByLabel('Mật khẩu').fill('new-pass-987');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL('/');

    // 5. The reset link is single-use.
    await page.goto(linkText);
    await page.getByLabel('Mật khẩu mới').fill('whatever-1');
    await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
    await expect(page.getByRole('alert')).toContainText('Link đặt lại không hợp lệ');

    // 6. Admin locks the account; it invalidates the reader's live session immediately.
    await logout(page);
    await login(page, 'admin@dev.local', '123456');
    await expect(page.getByRole('heading', { name: 'Thư viện' })).toBeVisible();
    await page.getByRole('button', { name: 'Tài khoản' }).click();
    await page.getByRole('link', { name: 'Người dùng', exact: true }).click();
    await page.getByRole('button', { name: 'Thao tác với reader@dev.local' }).click();
    await page.getByRole('button', { name: 'Khoá' }).click();
    await expect(page.getByText('Đã khoá')).toBeVisible();

    const readerContext = await browser.newContext();
    const readerPage = await readerContext.newPage();
    await login(readerPage, 'reader@dev.local', 'new-pass-987');
    await expect(readerPage.getByRole('alert')).toHaveText('Tài khoản đã bị khoá');

    await page.getByRole('button', { name: 'Thao tác với reader@dev.local' }).click();
    await page.getByRole('button', { name: 'Mở khoá' }).click();
    await expect(page.getByText('Đã khoá')).toHaveCount(0);

    await login(readerPage, 'reader@dev.local', 'new-pass-987');
    await expect(readerPage).toHaveURL('/');
    await readerContext.close();
  });
});
