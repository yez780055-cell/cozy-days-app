import { test, expect } from '@playwright/test';
import { openCycleInfo, openPeriod, openPeriodEditor, recordClosedPeriod, selectCalendarDate } from './period-actions';
import { openTodos } from './task-actions';

test.use({ timezoneId:'Asia/Shanghai' });
test.beforeEach(async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-10-23T04:00:00Z'));
  await page.goto('/');
});

test('diaries persist independently and history takes priority over fallback settings', async ({page}) => {
  await openPeriod(page);
  await expect(page.getByRole('region',{name:'周期摘要'})).toContainText('暂无周期预测');
  await recordClosedPeriod(page,'2026-09-25','2026-09-29');
  await page.getByRole('button',{name:'今天',exact:true}).click();
  await page.getByRole('switch',{name:'经期中'}).click();
  for (const choice of ['较多','腹痛','疲惫','开心']) await page.getByRole('button',{name:choice,exact:true}).click();
  await expect(page.locator('.period-storage')).toBeEmpty();
  await openCycleInfo(page);
  await page.getByRole('button',{name:'周期设置',exact:true}).click();
  await page.getByLabel('默认周期长度（天）').fill('30');
  await page.getByRole('button',{name:'保存周期设置'}).click();
  await expect(page.getByRole('button',{name:/平均周期长度：28 天/})).toBeVisible();
  await page.reload();
  await openPeriod(page);
  for (const choice of ['较多','腹痛','疲惫','开心']) await expect(page.getByRole('button',{name:choice,exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:/^2026-10-22/}).click();
  await expect(page.getByRole('button',{name:'较多',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'平静',exact:true}).click();
  await page.getByRole('button',{name:'今天',exact:true}).click();
  await expect(page.getByRole('button',{name:'开心',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('history edit checks overlap, deletion preserves diary and fallback settings',async ({page})=>{
  await openPeriod(page);
  await recordClosedPeriod(page,'2026-10-01','2026-10-05');
  await recordClosedPeriod(page,'2026-10-10','2026-10-12');
  await selectCalendarDate(page.locator('.period-calendar'),'2026-10-02');
  await expect(page.getByRole('switch',{name:'经期中'})).toBeDisabled();
  await page.getByRole('button',{name:'平静',exact:true}).click();
  await expect(page.locator('.period-storage')).toBeEmpty();
  await openPeriodEditor(page,'2026-10-01');
  await page.getByLabel(/结束日期/).fill('2026-10-10');
  await page.getByRole('button',{name:'保存经期记录'}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('重叠');
  await page.getByLabel(/结束日期/).fill('2026-10-04');
  await page.getByRole('button',{name:'保存经期记录'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'周期设置',exact:true}).click();
  await page.getByLabel('默认周期长度（天）').fill('32');
  await page.getByRole('button',{name:'保存周期设置'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.period-history-link').click();
  await page.getByRole('button',{name:'删除 2026-10-01'}).click();
  await page.getByRole('button',{name:'确认删除'}).click();
  await expect(page.getByRole('dialog').getByRole('button',{name:'修改 2026-10-01'})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:/设定周期长度：32 天/})).toBeVisible();
  await openPeriod(page);
  await selectCalendarDate(page.locator('.period-calendar'),'2026-10-02');
  await expect(page.getByRole('button',{name:'平静',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('adjacent dates, future diary lock and todo isolation', async ({page}) => {
  await openTodos(page);
  await page.getByRole('button',{name:'新增待办',exact:true}).click();
  await page.getByRole('textbox',{name:'想做些什么？'}).fill('保留待办');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await openPeriod(page);
  const calendar = page.locator('.period-calendar');
  await calendar.getByRole('button',{name:'下个月',exact:true}).click();
  await expect(calendar.getByRole('heading')).toHaveText('2026 年 11 月');
  await calendar.getByRole('button',{name:/^2026-12-01/}).click();
  await expect(calendar.getByRole('heading')).toHaveText('2026 年 12 月');
  await expect(page.getByRole('button',{name:'较多',exact:true})).toBeDisabled();
  await calendar.getByRole('button',{name:'今天',exact:true}).click();
  await expect(calendar.getByRole('heading')).toHaveText('2026 年 10 月');
  await openTodos(page);
  await expect(page.getByRole('button',{name:'编辑：保留待办',exact:true})).toBeVisible();
});

test('retry persists the latest diary, including writes after going offline',async ({page,context}) => {
  await openPeriod(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore['put']>) {
      if (this.transaction.db.name === 'cozy-days-period') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Synthetic failure','QuotaExceededError');
      }
      return original.apply(this,args);
    };
  });
  await page.getByRole('button',{name:'开心',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('保存失败');
  await page.getByRole('button',{name:'重试',exact:true}).click();
  await expect(page.locator('.period-storage')).toBeEmpty();
  await context.setOffline(true);
  await page.getByRole('button',{name:'腹痛',exact:true}).click();
  await expect(page.locator('.period-storage')).toBeEmpty();
  await context.setOffline(false);
  await page.reload();await openPeriod(page);
  for (const choice of ['开心','腹痛']) await expect(page.getByRole('button',{name:choice,exact:true})).toHaveAttribute('aria-pressed','true');
});
