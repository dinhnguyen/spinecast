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

  test('revoking a device logs it out; changing a password can sign out the others', async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Mutates the same seeded account as the desktop project');
    const readerContext = await browser.newContext();
    const readerPage = await readerContext.newPage();
    await login(readerPage, 'reader@dev.local', 'new-pass-987');
    await expect(readerPage).toHaveURL('/');

    await login(page, 'admin@dev.local', '123456');
    await page.getByRole('button', { name: 'Tài khoản' }).click();
    await page.getByRole('link', { name: 'Người dùng', exact: true }).click();
    await page.getByRole('link', { name: 'reader@dev.local' }).click();
    await expect(page).toHaveURL(/\/admin\/users\//);
    await expect(page.getByRole('heading', { name: 'Thiết bị' })).toBeVisible();
    const revokeButtons = page.getByRole('button', { name: /^Thu hồi / });
    await expect(revokeButtons.first()).toBeVisible();
    while (await revokeButtons.count()) {
      const count = await revokeButtons.count();
      await revokeButtons.first().click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Xoá' }).click();
      await expect(revokeButtons).toHaveCount(count - 1);
      await expect(page.getByText('Đã thu hồi')).toBeVisible();
    }

    await readerPage.goto('/stats');
    await expect(readerPage).toHaveURL(/\/login/);

    await login(readerPage, 'reader@dev.local', 'new-pass-987');
    const thirdContext = await browser.newContext();
    const thirdPage = await thirdContext.newPage();
    await login(thirdPage, 'reader@dev.local', 'new-pass-987');
    await expect(thirdPage).toHaveURL('/');

    await readerPage.getByRole('button', { name: 'Tài khoản' }).click();
    await readerPage.getByRole('link', { name: 'Tài khoản', exact: true }).click();
    await readerPage.getByLabel('Mật khẩu hiện tại').fill('new-pass-987');
    await readerPage.getByLabel('Mật khẩu mới', { exact: true }).fill('final-pass-555');
    await readerPage.getByLabel('Nhập lại mật khẩu mới').fill('final-pass-555');
    await readerPage.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await expect(readerPage.getByText('Đã đổi mật khẩu')).toBeVisible();

    await thirdPage.goto('/stats');
    await expect(thirdPage).toHaveURL(/\/login/);
    await readerPage.goto('/stats');
    await expect(readerPage).toHaveURL('/stats');

    await thirdContext.close();
    await readerContext.close();
  });
});
