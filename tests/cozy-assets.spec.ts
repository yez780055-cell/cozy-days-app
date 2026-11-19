import { expect, test, type Page } from '@playwright/test';
import { openTodos, taskAction } from './task-actions';

async function addTodo(page: Page, text: string) {
  await page.getByRole('button', { name: '新增待办', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: '想做些什么？' }).fill(text);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

for (const [width, height] of [[360, 740], [393, 852], [430, 932]]) {
  test(`正式首页素材、长待办和模拟安全区 ${width}×${height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByText('今天还没有待办')).toBeVisible();
    const scene = page.locator('.home-scene');
    await expect(scene.locator('img')).toHaveCount(2);
    await scene.locator('img').evaluateAll(images => Promise.all(
      images.map(image => (image as HTMLImageElement).decode()),
    ));
    await expect(scene.locator('.home-room')).toHaveCSS('object-fit', 'cover');
    const catRatio = await scene.locator<HTMLImageElement>('.home-cats').evaluate(image =>
      Math.abs(image.width / image.height - image.naturalWidth / image.naturalHeight),
    );
    expect(catRatio).toBeLessThan(.08);

    await openTodos(page);
    await expect(page.getByText('这一天的清单是空的。')).toBeVisible();
    const tasks = ['准备下周的设计稿', '整理一下房间', '看一本喜欢的书', '晚上做十分钟拉伸'];
    for (const task of tasks) await addTodo(page, task);
    await page.reload();
    await openTodos(page);
    const cards = page.getByTestId('todo-card');
    await expect(cards).toHaveCount(tasks.length);

    const longText = '这是需要正常换行的长待办内容'.repeat(8) + '\n' + 'verylongunbrokentask'.repeat(12);
    await addTodo(page, longText);
    const content = page.getByRole('button', { name: `编辑：${longText}`, exact: true });
    await expect(content).toHaveCount(1);
    expect(await content.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(await content.evaluate(element => element.clientWidth));
    await taskAction(page, longText, 'delete');
    await expect(cards).toHaveCount(tasks.length);

    await page.addStyleTag({ content: ':root { --safe-bottom: 34px; }' });
    const nav = page.getByRole('navigation', { name: '应用模块' });
    await expect(nav).toHaveCSS('height', '100px');
    await expect(nav.getByRole('button', { name: '纪念日', exact: true })).toBeInViewport();
    const list = page.locator('.task-area');
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(cards.last()).toBeInViewport();
    const navBox = await nav.boundingBox();
    const listBox = await list.boundingBox();
    expect(navBox!.y + navBox!.height).toBe(height);
    expect(listBox!.y + listBox!.height).toBeLessThanOrEqual(navBox!.y);
    const controls = await page.locator('.todo-heading button, .todo-month button, .todo-week button, .task-actions button, .bottom-nav button').evaluateAll(
      elements => elements.map(element => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      }),
    );
    for (const control of controls) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.body.scrollWidth)).toBe(width);
    expect(errors).toEqual([]);
  });
}
