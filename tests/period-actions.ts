import { expect, type Page, type Locator } from '@playwright/test';

export async function openPeriod(page: Page) {
  await page.getByRole('navigation').getByRole('button', {name:'生理期', exact:true}).click();
  await expect(page.locator('.period-content > .period-calendar')).toBeVisible();
}

export async function openCycleInfo(page: Page) {
  await page.getByRole('navigation').getByRole('button', {name:'首页', exact:true}).click();
  await page.getByRole('button', {name:'打开应用设置', exact:true}).click();
  await page.getByRole('button', {name:'周期信息', exact:true}).click();
  await expect(page.getByRole('heading', {name:'当前周期', exact:true})).toBeVisible();
}

export async function openPeriodEditor(page: Page, date: string) {
  await openCycleInfo(page);
  await page.locator('.period-history-link').click();
  await page.getByRole('button', {name:`修改 ${date}`, exact:true}).click();
}

export async function selectCalendarDate(panel: Locator, date: string) {
  const [year, month] = (await panel.getByRole('heading').innerText()).match(/\d+/g)!.map(Number);
  const distance = (Number(date.slice(0, 4)) - year) * 12 + Number(date.slice(5, 7)) - month;
  for (let i = 0; i < Math.abs(distance); i++) {
    await panel.getByRole('button', {name:distance < 0 ? '上个月' : '下个月', exact:true}).click();
  }
  await panel.getByRole('button', {name:new RegExp(`^${date}`)}).click();
}

export async function recordClosedPeriod(page: Page, start: string, end: string) {
  await selectCalendarDate(page.locator('.period-content > .period-calendar'), start);
  await page.getByRole('switch', {name:'经期中', exact:true}).click();
  const picker = page.getByRole('dialog', {name:'选择经期结束日期'});
  await selectCalendarDate(picker.locator('.period-calendar'), end);
  await picker.getByRole('button', {name:'保存经期记录', exact:true}).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('.period-storage')).toBeEmpty();
}
