import { test, expect } from '@playwright/test';

test('desktop device preview applies phone layout at 393px', async ({page}) => {
  await page.setViewportSize({width:1280,height:1000});
  await page.goto('/');
  await page.getByRole('button',{name:'生理期',exact:true}).click();
  const calendar=page.locator('.period-calendar'), summary=page.locator('.period-summary');
  await expect(summary).toBeVisible();
  const a=(await calendar.boundingBox())!, b=(await summary.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(a.y+a.height);
  expect((await page.locator('.period-date').first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

for (const width of [360, 390, 430]) test(`mobile information and targets ${width}`, async ({page}) => {
  await page.setViewportSize({width, height:844});
  await page.goto('/');
  for (const name of ['买牛奶','做晚饭','散步']) {
    await page.getByRole('button',{name:'新增待办'}).click();
    await page.getByLabel('想做些什么？').fill(name);
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  const viewport = await page.locator('.task-area').boundingBox();
  const cards = await page.getByTestId('todo-card').all();
  let visible = 0;
  for (const card of cards) { const box = await card.boundingBox(); if (box && viewport && box.y >= viewport.y && box.y + box.height <= viewport.y + viewport.height) visible++; }
  console.log(`${width}px fully visible tasks: ${visible}`);
  expect(visible).toBeGreaterThanOrEqual(1);
  await page.getByRole('button',{name:'生理期',exact:true}).click();
  await expect(page.getByText(/流量日记不会自动创建/)).toBeVisible();
  expect((await page.locator('.period-date').first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button',{name:'打开应用设置'}).click();
  await expect(page.getByRole('heading',{name:'设置',exact:true})).toBeVisible();
  await expect(page.getByText(/不会自动同步/)).toBeVisible();
  expect(await page.locator('.phone').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('anniversary dates distinguish origin and next occurrence', async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00+08:00'));
  await page.goto('/'); await page.getByRole('button',{name:'纪念日',exact:true}).click();
  await page.getByRole('button',{name:'新增纪念日'}).click();
  await page.getByLabel('纪念日名称').fill('生日');
  await page.getByLabel('日期',{exact:true}).fill('1990-11-08');
  await page.getByRole('button',{name:'保存纪念日'}).click();
  await expect(page.getByTestId('anniversary-card')).toContainText('原始日期：1990.11.08');
  await expect(page.getByTestId('anniversary-card')).toContainText('下次：2026.11.08');
});
