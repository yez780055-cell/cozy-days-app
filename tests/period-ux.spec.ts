import { test, expect, type Page } from '@playwright/test';

const today = '2026-11-19';
const time = new Date('2026-11-19T04:00:00Z');
test.use({ timezoneId: 'Asia/Shanghai' });
const calendar = (page: Page) => page.locator('.period-content > .period-calendar');
const date = (page: Page, key: string) => calendar(page).getByRole('button', {name: new RegExp('^'+key)});
const toggle = (page: Page) => page.getByRole('switch', {name:'经期中'});

async function open(page: Page) {
  await page.getByRole('navigation').getByRole('button', {name:'生理期',exact:true}).click();
  await expect(toggle(page)).toBeVisible();
}

async function historical(page: Page, start: string, end: string) {
  await date(page,start).click();
  await toggle(page).click();
  const picker = page.getByRole('dialog',{name:'选择经期结束日期'});
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('button',{name:'保存经期记录'})).toBeDisabled();
  await picker.getByRole('button',{name:new RegExp('^'+end)}).click();
  await picker.getByRole('button',{name:'保存经期记录'}).click();
  return picker;
}

async function cycleInfo(page: Page) {
  await page.getByRole('navigation').getByRole('button',{name:'首页',exact:true}).click();
  await page.getByRole('button',{name:'打开应用设置'}).click();
  await page.getByRole('button',{name:'周期信息',exact:true}).click();
  await expect(page.getByRole('heading',{name:'当前周期'})).toBeVisible();
}

test.beforeEach(async ({page}) => {
  await page.clock.setFixedTime(time);
  await page.addInitScript(()=>localStorage.setItem('cozy-days.settings-hint-seen','1'));
  await page.goto('/');
});

test('same-day undo removes the open interval; a later date closes an inclusive interval', async ({page}) => {
  await open(page);
  await toggle(page).click();
  await expect(date(page,today)).toHaveClass(/actual/);
  await expect(page.locator('.period-storage')).toBeEmpty();
  await page.reload();
  await open(page);
  await toggle(page).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(date(page,today)).not.toHaveClass(/actual/);
  await cycleInfo(page);
  await expect(page.getByText('暂无周期预测')).toBeVisible();

  await open(page);
  await toggle(page).click();
  await page.clock.setFixedTime(new Date('2026-11-22T04:00:00Z'));
  await page.reload();
  await open(page);
  await date(page,'2026-11-22').click();
  await expect(toggle(page)).toHaveAttribute('aria-checked','true');
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-checked','false');
  await expect(date(page,'2026-11-22')).toHaveClass(/actual/);
  await expect(date(page,'2026-11-23')).not.toHaveClass(/actual/);
  await expect(page.locator('.period-storage')).toBeEmpty();
  await page.reload();
  await open(page);
  await expect(date(page,'2026-11-22')).toHaveClass(/actual/);
  await expect(date(page,'2026-11-23')).not.toHaveClass(/actual/);
});

test('historical switch requires an end, rejects overlap, and old start cancellation preserves history',async ({page})=>{
  await open(page);
  await expect(await historical(page,'2026-11-04','2026-11-07')).toHaveCount(0);
  const picker=await historical(page,'2026-11-02','2026-11-05');
  await expect(picker.getByRole('alert')).toContainText('重叠');
  await picker.getByRole('button',{name:'关闭弹窗'}).click();
  await expect(picker).toHaveCount(0);
  await expect(date(page,'2026-11-02')).not.toHaveClass(/actual/);

  await date(page,today).click();
  await toggle(page).click();
  await expect(page.locator('.period-storage')).toBeEmpty();
  await page.clock.setFixedTime(new Date('2026-11-22T04:00:00Z'));
  await page.reload();
  await open(page);
  await date(page,today).click();
  await expect(toggle(page)).toHaveAttribute('aria-checked','true');

  await toggle(page).click();
  const confirm=page.getByRole('dialog',{name:'是否取消这次经期记录？'});
  await confirm.getByRole('button',{name:'暂不操作'}).click();
  await expect(toggle(page)).toHaveAttribute('aria-checked','true');
  await toggle(page).click();
  await confirm.getByRole('button',{name:'取消经期',exact:true}).click();
  await expect(date(page,today)).not.toHaveClass(/actual/);
  await expect(date(page,'2026-11-04')).toHaveClass(/actual/);
  await cycleInfo(page);
  await page.getByRole('button',{name:'周期设置',exact:true}).click();
  await page.getByLabel('默认周期长度（天）').fill('30');
  await page.getByRole('button',{name:'保存周期设置'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/设定周期长度：30 天/})).toBeVisible();
});

for (const [width,height] of [[360,740],[393,852],[430,932]]) {
  test(`calendar layout and status colors at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height});
    await open(page);
    await expect(page.getByRole('region',{name:'周期摘要'})).toContainText('暂无周期预测');
    await expect(await historical(page,'2026-11-13','2026-11-15')).toHaveCount(0);
    const mark = (key: string) => date(page,key).locator('span');
    await expect(mark('2026-11-13')).toHaveCSS('background-color','rgb(144, 72, 91)');
    await expect(mark('2026-11-22')).toHaveCSS('background-color','rgb(241, 233, 239)');
    await expect(mark('2026-11-27')).toHaveCSS('border-top-style','solid');
    await expect(mark('2026-11-27')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await expect(date(page,'2026-11-27')).toHaveAccessibleName(/预测排卵日/);
    await page.getByRole('button',{name:'下个月',exact:true}).click();
    await expect(mark('2026-12-11')).toHaveCSS('border-top-style','dashed');
    await expect(calendar(page).locator('.period-grid button > :not(span)')).toHaveCount(0);
    await expect(calendar(page).locator('+ .period-daily')).toBeVisible();
    await expect(page.getByRole('region',{name:'周期摘要'})).toContainText('11月13日');
    const legend=calendar(page).locator('.period-legend');
    expect(await legend.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
    expect(await page.locator('.period-page').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
    await page.getByRole('button',{name:'今天',exact:true}).click();
    await toggle(page).click();
    await expect(date(page,today)).toHaveCSS('outline-style','solid');
    await expect(mark(today)).toHaveCSS('text-decoration-line','underline');
    await expect(mark(today)).toHaveCSS('background-color','rgb(144, 72, 91)');
    await expect(mark(today)).toHaveCSS('width','32px');
    await expect(date(page,today)).toHaveCSS('height','44px');
    expect((await date(page,today).boundingBox())!.width).toBeGreaterThanOrEqual(44);
  });
}

test('six-week month and cross-month dates share the same calendar with the end picker',async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await open(page);
  for (let i = 0; i < 3; i++) await calendar(page).getByRole('button',{name:'上个月'}).click();
  await expect(calendar(page).getByRole('heading')).toHaveText('2026 年 8 月');
  await expect(calendar(page).locator('.period-date')).toHaveCount(42);
  await date(page,'2026-09-01').click();
  await expect(calendar(page).getByRole('heading')).toHaveText('2026 年 9 月');
  await toggle(page).click();
  const picker = page.getByRole('dialog',{name:'选择经期结束日期'});
  await expect(picker.getByRole('button',{name:/^2026-08-31/})).toBeDisabled();
  await picker.getByRole('button',{name:'下个月'}).click();
  await picker.getByRole('button',{name:'下个月'}).click();
  await expect(picker.getByRole('button',{name:/^2026-11-20/})).toBeDisabled();
  await picker.getByRole('button',{name:/^2026-11-19/}).click();
  await picker.getByRole('button',{name:'保存经期记录'}).click();
  await expect(picker).toHaveCount(0);
  await page.getByRole('button',{name:'今天',exact:true}).click();
  await expect(date(page,today)).toHaveClass(/actual/);
});
