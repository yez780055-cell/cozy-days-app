import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
]) {
  test(`gold shell, controls and focus at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: '应用模块' });
    const module = (name: string) => nav.getByRole('button', { name, exact: true });
    await expect(nav).toHaveCSS('height', '66px');
    await expect(nav).toHaveCSS('background-color', 'rgb(255, 253, 248)');
    await expect(page.locator('.phone')).toHaveCSS('background-image', 'none');
    await expect(page.locator('.home-page')).toHaveCSS('padding-left', viewport.width === 360 ? '16px' : '20px');
    expect((await nav.boundingBox())!.y + 66).toBe(viewport.height);
    const widths = await nav.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().width));
    expect(widths).toEqual(Array(4).fill(viewport.width / 4));

    await page.locator('.home-settings').click();
    await expect(module('首页')).toHaveAttribute('aria-current', 'page');
    await module('待办').click();
    await expect(module('待办')).toHaveAttribute('aria-current', 'page');

    const openEditor = page.getByRole('button', { name: '新增待办', exact: true });
    await openEditor.click();
    const dialog = page.getByRole('dialog');
    const text = dialog.getByRole('textbox', { name: '想做些什么？' });
    const close = dialog.getByRole('button', { name: '关闭弹窗' });
    const save = dialog.getByRole('button', { name: '保存', exact: true });
    await expect(text).toBeFocused();
    await expect(text).toHaveCSS('border-radius', '8px');
    await expect(text).toHaveCSS('font-size', '16px');
    await expect(close).toHaveCSS('min-height', '44px');
    await expect(save).toHaveCSS('background-color', 'rgb(240, 234, 224)');
    await text.fill('保留表单内容');
    await page.keyboard.press('Escape');
    await expect(dialog.getByRole('alert')).toContainText('还有未保存的修改');
    await dialog.getByRole('button', { name: '继续编辑' }).click();
    await expect(text).toBeFocused();
    await expect(text).toHaveValue('保留表单内容');
    await save.focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: /收藏这件小事/ })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(save).toBeFocused();

    await page.setViewportSize({ width: viewport.width, height: 440 });
    await expect(save).toBeInViewport({ ratio: 1 });
    await dialog.getByRole('button', { name: '选择归属日期' }).click();
    const days = dialog.locator('.calendar-day');
    await expect(days.first()).toBeAttached();
    const minimumDayWidth = await days.evaluateAll(items => Math.min(...items.map(item => item.getBoundingClientRect().width)));
    expect(minimumDayWidth).toBeGreaterThanOrEqual(44);
    await expect(save).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: '放弃修改' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(openEditor).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  });
}

test('destructive confirmation is centered and stays above pending undo', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/?preview=1&scenario=delete');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const confirm = await dialog.boundingBox();
  expect(confirm!.width).toBeCloseTo(316.8, 0);
  await expect.poll(async () => {
    const box = await dialog.boundingBox();
    return Math.round(box!.y + box!.height / 2);
  }).toBe(370);
  const destroy = dialog.getByRole('button', { name: '确认删除' });
  await expect(destroy).toHaveCSS('background-color', 'rgb(146, 63, 55)');
  await destroy.click();
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新增待办', exact: true }).click();
  await expect(dialog).toBeVisible();
  const layers = await page.evaluate(() => ({
    notice: Number(getComputedStyle(document.querySelector('.undo-stack')!).zIndex),
    sheet: Number(getComputedStyle(document.querySelector('.modal-backdrop')!).zIndex),
  }));
  expect(layers.sheet).toBeGreaterThan(layers.notice);
});

test('a pending save blocks dismissal and a failed save can be retried', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: '待办', exact: true }).click();
  await page.evaluate(async () => {
    const path = '/src/data/database.ts';
    const { todoRepository } = await import(path);
    const original = todoRepository.add;
    todoRepository.add = () => new Promise((_, reject) => {
      todoRepository.add = original;
      window.addEventListener('test-fail-todo-write', () => reject(new Error('Synthetic write failure')), { once: true });
    });
  });
  await page.getByRole('button', { name: '新增待办', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const title = dialog.getByRole('textbox', { name: '想做些什么？' });
  await title.fill('保存失败后继续');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '正在保存…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.locator('.modal-backdrop').click({ position: { x: 10, y: 10 } });
  await expect(dialog).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('test-fail-todo-write')));
  await expect(dialog.getByRole('alert')).toContainText('保存失败');
  await expect(title).toHaveValue('保存失败后继续');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '编辑：保存失败后继续' })).toBeVisible();
});
