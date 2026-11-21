import { expect, test } from '@playwright/test';
for (const [width, height] of [[360, 740], [1280, 900]]) {
  test('unified app startup and account entry smoke ' + width, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.goto('./');
    await expect(page.getByRole('heading', { name: '欢迎来到双人空间' })).toBeVisible();
    await page.getByRole('button', { name: '首次使用，注册账号' }).click();
    await expect(page.getByLabel('邮箱', { exact: true })).toBeVisible();
    await expect(page.getByLabel('邀请码')).toBeVisible();
    await page.getByRole('button', { name: '已有账号，返回登录' }).click();
    await expect(page.getByRole('heading', { name: '登录双人空间' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
