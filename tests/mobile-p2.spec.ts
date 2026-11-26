import { openTodos } from './task-actions';
import { chooseDate } from './anniversary-actions';
import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'Asia/Shanghai' });

test('desktop device preview applies phone layout at 393px', async ({page}) => {
  await page.setViewportSize({width:1280,height:1000});
  await page.goto('/');
  await page.getByRole('button',{name:/^标准/}).click();
  await expect(page.locator('.phone')).toHaveJSProperty('clientWidth',393);
  await page.getByRole('button',{name:'生理期',exact:true}).click();
  const calendar=page.getByRole('region',{name:'生理期日历'});
  const summary=page.getByRole('region',{name:'周期摘要'});
  const daily=page.getByRole('region',{name:'每日记录'});
  await expect(summary).toBeVisible();
  await expect(daily).toBeVisible();
  const [a,b,c]=await Promise.all([summary.boundingBox(),calendar.boundingBox(),daily.boundingBox()]);
  expect(b!.y).toBeGreaterThanOrEqual(a!.y+a!.height);
  expect(c!.y).toBeGreaterThanOrEqual(b!.y+b!.height);
  expect((await page.locator('.period-date').first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

for (const width of [360, 390, 430]) test(`mobile information and targets ${width}`, async ({page}) => {
  await page.setViewportSize({width, height:844});
  await page.goto('/');
  await openTodos(page);
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
  const daily = page.getByRole('region',{name:'每日记录'});
  await daily.getByRole('button',{name:'适中',exact:true}).click();
  await expect(daily.getByRole('switch',{name:'经期中'})).toHaveAttribute('aria-checked','false');
  await expect(page.getByRole('region',{name:'周期摘要'})).toContainText('暂无周期预测');
  expect((await page.locator('.period-date').first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button',{name:'首页',exact:true}).click();
  await page.getByRole('button',{name:'打开应用设置'}).click();
  await expect(page.getByRole('heading',{name:'设置',exact:true})).toBeVisible();
  await expect(page.getByText(/记录保存在本机/)).toBeVisible();
  expect(await page.locator('.phone').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('anniversary dates distinguish origin and next occurrence', async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00+08:00'));
  await page.goto('/'); await page.getByRole('button',{name:'纪念日',exact:true}).click();
  await page.getByRole('button',{name:'新增纪念日'}).click();
  await page.getByLabel('纪念日名称').fill('生日');
  await chooseDate(page.getByRole('dialog', { name:'新增纪念日' }), '1990-11-08');
  await page.getByRole('button',{name:'保存纪念日'}).click();
  await page.getByRole('button',{name:'查看详情：生日'}).click();
  const details=page.getByRole('region',{name:'纪念日详情'});
  await expect(details.locator('p').filter({hasText:'起始日期'}).locator('time')).toHaveAttribute('datetime','1990-11-08');
  await expect(details.locator('p').filter({hasText:'纪念日期'}).locator('time')).toHaveAttribute('datetime','2026-11-08');
});
