import { chooseDate } from './anniversary-actions';
import { test, expect, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
  await expect(page.getByRole('button', { name:'新增纪念日', exact:true })).toBeEnabled();
}
async function add(page: Page, name: string, date: string, yearly = true) {
  await page.getByRole('button', { name:'新增纪念日', exact:true }).click();
  const form = page.getByRole('dialog', { name:'新增纪念日', exact:true });
  await form.getByLabel('纪念日名称').fill(name);
  await chooseDate(form, date);
  await form.getByLabel('每年重复').setChecked(yearly);
  await form.getByLabel('备注', { exact:true }).fill('把这一天，好好收藏 ♡');

  await form.getByRole('button', { name:'保存纪念日', exact:true }).click();
  await expect(form).not.toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width:393, height:852 });
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00+08:00'));
});

test('从v3升级保留待办与分类数据', async ({ page }) => {
  await page.route('**/migration-fixture', route => route.fulfill({ contentType:'text/html', body:'<!doctype html><title>Migration fixture</title>' }));
  await page.goto('/migration-fixture');
  await page.evaluate(async () => {
    // Dexie v3 maps to native version 30; fixture only in a fresh test context.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('little-days', 30);
      request.onupgradeneeded = () => {
        const db = request.result;
        const todos = db.createObjectStore('todos', { keyPath:'id', autoIncrement:true });
        for (const name of ['date','completed','createdAt','categoryId']) todos.createIndex(name, name);
        const categories = db.createObjectStore('categories', { keyPath:'id' });
        categories.createIndex('key','key',{ unique:true }); categories.createIndex('createdAt','createdAt');
        categories.put({ id:'life', name:'生活', key:'生活', builtin:false, createdAt:1 });
        todos.put({ id:42, text:'保留原有待办', date:'2026-10-23', completed:false, categoryId:'life', createdAt:1 });
      };
      request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
    });
  });
  await open(page);
  await add(page, '新收藏', '2026-10-23');
  await page.getByRole('navigation').getByRole('button', { name:'待办', exact:true }).click();
  await expect(page.getByRole('button', { name:'编辑：保留原有待办', exact:true })).toBeVisible();
});

test('插画缺失仍可显示，离线新增后重新进入仍保留', async ({ page, context }) => {
  await page.route('**/assets/cozy_days/**', route => route.abort());
  await open(page);
  await expect(page.getByText('还没有纪念日', {exact:true})).toBeVisible();
  await context.setOffline(true);
  await add(page, '离线也能收藏', '2026-10-23');
  await expect(page.locator('.ann-featured')).toContainText('离线也能收藏');
  await page.getByRole('navigation').getByRole('button', { name:'待办', exact:true }).click();
  await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
  await expect(page.getByTestId('anniversary-card')).toContainText('离线也能收藏');
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
  await expect(page.getByTestId('anniversary-card')).toContainText('离线也能收藏');
});

test('360×480 可取消草稿并保存所有可编辑字段', async ({ page }) => {
  await page.setViewportSize({width:360,height:480});
  await open(page);
  await add(page,'小屏编辑','2026-10-23');
  await page.getByRole('button',{name:'查看详情：小屏编辑'}).click();
  const edit = page.getByRole('button',{name:'编辑纪念日',exact:true});
  await edit.click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('纪念日名称').fill('取消后的草稿');
  await editor.getByRole('button',{name:'取消',exact:true}).click();
  await editor.getByRole('button',{name:'放弃修改'}).click();
  await expect(editor).toHaveCount(0);
  await expect(edit).toBeFocused();
  await edit.click();
  await expect(editor.getByLabel('纪念日名称')).toHaveValue('小屏编辑');
  await editor.getByLabel('纪念日名称').fill('小屏完整编辑');
  await chooseDate(editor, '2024-02-29');
  await editor.getByRole('button', { name: '正计时', exact: true }).click();
  await editor.getByLabel('每年重复').uncheck();
  await editor.getByLabel('备注').fill('小屏备注完整保留');
  const save = editor.getByRole('button',{name:'保存纪念日'});
  await expect(save).toBeInViewport({ratio:1});
  await save.click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'小屏完整编辑'})).toBeVisible();
  await expect(page.getByText('起始日期 · 2024-02-29')).toBeVisible();
  await expect(page.getByText('小屏备注完整保留')).toBeVisible();
});
