import { test, expect, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
  await expect(page.getByRole('button', { name:'新增纪念日', exact:true })).toBeEnabled();
}
async function add(page: Page, name: string, date: string, yearly = true, color = '粉色') {
  await page.getByRole('button', { name:'新增纪念日', exact:true }).click();
  const form = page.getByRole('dialog', { name:'新增纪念日', exact:true });
  await form.getByLabel('纪念日名称').fill(name);
  await form.getByLabel('日期', { exact:true }).fill(date);
  await form.getByLabel('每年重复').setChecked(yearly);
  await form.getByLabel('备注', { exact:true }).fill('把这一天，好好收藏 ♡');
  await form.getByRole('button', { name:color, exact:true }).click();
  await form.getByRole('button', { name:'保存纪念日', exact:true }).click();
  await expect(form).not.toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width:393, height:852 });
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00+08:00'));
});

test('空状态、新增、全部字段编辑、刷新/模块切换保留、删除确认与数量', async ({ page }) => {
  await open(page);
  await expect(page.getByText('重要的日子，从这里收藏')).toBeVisible();
  await add(page, '相遇纪念', '2023-05-20');
  await page.getByRole('button', { name:'编辑：相遇纪念', exact:true }).click();
  const editor = page.getByRole('dialog', { name:'编辑纪念日', exact:true });
  await editor.getByLabel('纪念日名称').fill('猫咪生日');
  await editor.getByLabel('日期', { exact:true }).fill('2024-10-23');
  await editor.getByLabel('分类 / 主题').selectOption('宠物');
  await editor.getByLabel('图标', { exact:true }).selectOption('🐱');
  await editor.getByLabel('备注', { exact:true }).fill('两周年啦\n每天都很可爱');
  await editor.getByRole('button', { name:'淡紫', exact:true }).click();
  await page.screenshot({ path:'public/review/anniversary/editor-393.png' });
  await editor.getByRole('button', { name:'保存纪念日', exact:true }).click();
  await expect(editor).not.toBeVisible();
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
  const card = page.getByTestId('anniversary-card');
  await expect(card).toHaveClass(/ann-lavender/);
  await expect(card).toContainText('就是今天');
  await expect(card).toContainText('已满 2 周年');
  await expect(card).toContainText('每天都很可爱');
  await page.getByRole('button', { name:'编辑：猫咪生日', exact:true }).click();
  await expect(editor.getByLabel('日期', { exact:true })).toHaveValue('2024-10-23');
  await expect(editor.getByLabel('分类 / 主题')).toHaveValue('宠物');
  await expect(editor.getByLabel('图标', { exact:true })).toHaveValue('🐱');
  await expect(editor.getByLabel('每年重复')).toBeChecked();
  await editor.getByRole('button', { name:'关闭弹窗' }).click();
  await page.getByRole('button', { name:'删除：猫咪生日', exact:true }).click();
  await page.screenshot({ path:'public/review/anniversary/delete-393.png' });
  await page.getByRole('button', { name:'再想想' }).click();
  await expect(card).toHaveCount(1);
  await page.getByRole('button', { name:'删除：猫咪生日', exact:true }).click();
  await page.getByRole('button', { name:'确认删除' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.ann-filters')).toContainText('全部0');
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
  await expect(card).toHaveCount(0);
});

test('动态筛选、周标记、月视图与跨月选择', async ({ page }) => {
  await open(page);
  await add(page, '过去的毕业', '2022-06-30', false, '薄荷绿');
  await add(page, '今天的小美好', '2026-10-23', false);
  await add(page, '妈妈生日', '1990-11-08', true, '奶黄');
  await expect(page.locator('.ann-filters')).toContainText('全部3即将到来2已过去1');
  await page.getByRole('button', { name:'已过去 1', exact:true }).click();
  await expect(page.getByTestId('anniversary-card')).toHaveCount(1);
  await expect(page.getByTestId('anniversary-card')).toContainText('过去的毕业');
  await page.getByRole('button', { name:'即将到来 2', exact:true }).click();
  await expect(page.getByTestId('anniversary-card')).toHaveCount(2);
  await expect(page.locator('.ann-week').getByRole('button', { name:'2026-10-23，1 个纪念日' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name:'月视图', exact:true }).click();
  const month = page.getByRole('dialog', { name:'月视图' });
  await month.getByRole('button', { name:'下个月' }).click();
  await expect(month).toContainText('2026 年 11 月');
  await month.getByRole('button', { name:'2026-11-08，1 个纪念日', exact:true }).click();
  await expect(month.locator('.ann-month-events')).toContainText('妈妈生日');
  await month.getByRole('button', { name:'查看收藏' }).click();
  await expect(page.locator('.ann-date-title')).toContainText('11月8日');
  await expect(page.locator('.ann-day-summary')).toContainText('妈妈生日');
  await page.getByRole('button', { name:'回到今天', exact:true }).click();
  await expect(page.locator('.ann-date-title')).toContainText('10月23日');
});

for (const size of [{ width:360, height:740 }, { width:393, height:852 }, { width:430, height:932 }]) {
  test(`移动布局、缩短视口与真实截图 ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path:`public/review/anniversary/empty-${size.width}.png` });
    await add(page, '恋爱纪念日', '2023-05-20', true);
    await add(page, '妈妈生日', '1990-11-08', true, '奶黄');
    await add(page, '养猫一周年', '2024-01-15', true, '淡紫');
    await add(page, '毕业纪念日', '2022-06-30', false, '薄荷绿');
    await page.locator('.ann-page').evaluate(el => { el.scrollTop = 0; });
    await page.evaluate(() => document.fonts.ready);
    const first = await page.getByTestId('anniversary-card').first().boundingBox();
    expect(first!.y + 50).toBeLessThan(size.height - 72);
    expect(await page.locator('.ann-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path:`public/review/anniversary/list-${size.width}.png` });
    await page.getByRole('button', { name:'月视图', exact:true }).click();
    await page.screenshot({ path:`public/review/anniversary/month-${size.width}.png` });
    await page.getByRole('button', { name:'关闭弹窗' }).click();
    await page.getByTestId('anniversary-card').last().scrollIntoViewIfNeeded();
    const lastButton = page.getByTestId('anniversary-card').last().getByRole('button', { name:/删除/ });
    const box = await lastButton.boundingBox();
    const nav = await page.getByRole('navigation').boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
    const fab = await page.getByRole('button', { name:'新增纪念日', exact:true }).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(fab!.y);
    await page.getByRole('button', { name:'新增纪念日', exact:true }).click();
    await page.setViewportSize({ width:size.width, height:480 });
    const editor = page.getByRole('dialog', { name:'新增纪念日', exact:true });
    await editor.getByLabel('纪念日名称').fill('键盘视口测试');
    await editor.getByRole('button', { name:'保存纪念日', exact:true }).click();
    await expect(editor).not.toBeVisible();
    await expect(page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true })).toHaveAttribute('aria-current', 'page');
  });
}

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
  await expect(page.locator('.ann-cats')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await context.setOffline(true);
  await add(page, '离线也能收藏', '2026-10-23');
  await page.getByRole('navigation').getByRole('button', { name:'待办', exact:true }).click();
  await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
  await expect(page.getByTestId('anniversary-card')).toContainText('离线也能收藏');
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
  await expect(page.getByTestId('anniversary-card')).toContainText('离线也能收藏');
});

test('360×480编辑完整字段与六行月历操作可滚动使用', async ({ page }) => {
  await page.setViewportSize({ width:360, height:480 });
  await open(page);
  await add(page, '小屏编辑', '2026-10-23');
  await page.getByRole('button', { name:'编辑：小屏编辑', exact:true }).click();
  const editor = page.getByRole('dialog', { name:'编辑纪念日', exact:true });
  await editor.getByLabel('纪念日名称').fill('小屏完整编辑');
  await editor.getByLabel('日期', { exact:true }).fill('2024-02-29');
  await editor.getByLabel('分类 / 主题').selectOption('宠物');
  await editor.getByLabel('图标', { exact:true }).selectOption('🐱');
  await editor.getByLabel('每年重复').uncheck();
  await editor.getByLabel('备注', { exact:true }).fill('小屏备注完整保留');
  await editor.getByRole('button', { name:'薄荷绿', exact:true }).click();
  await editor.getByRole('button', { name:'保存纪念日', exact:true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByTestId('anniversary-card')).toHaveClass(/ann-mint/);
  await page.getByRole('button', { name:'编辑：小屏完整编辑', exact:true }).click();
  await expect(editor.getByLabel('日期', { exact:true })).toHaveValue('2024-02-29');
  await expect(editor.getByLabel('分类 / 主题')).toHaveValue('宠物');
  await expect(editor.getByLabel('图标', { exact:true })).toHaveValue('🐱');
  await expect(editor.getByLabel('每年重复')).not.toBeChecked();
  await expect(editor.getByLabel('备注', { exact:true })).toHaveValue('小屏备注完整保留');
  await editor.getByRole('button', { name:'关闭弹窗' }).click();
  await page.getByRole('button', { name:'月视图', exact:true }).click();
  const month = page.getByRole('dialog', { name:'月视图' });
  await month.getByRole('button', { name:'上个月' }).click();
  await month.getByRole('button', { name:'上个月' }).click();
  await expect(month).toContainText('2026 年 8 月');
  await month.getByRole('button', { name:'2026-08-31', exact:true }).click();
  await expect(month).toContainText('2026-08-31');
  await month.getByRole('button', { name:'回到今天', exact:true }).click();
  await expect(month).toContainText('2026-10-23');
  await month.getByRole('button', { name:'查看收藏', exact:true }).click();
  await expect(month).not.toBeVisible();
});
