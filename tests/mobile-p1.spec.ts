import { openTodos } from './task-actions';
import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'Asia/Shanghai' });

test('direct completion and unsaved todo protection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openTodos(page);
  await page.getByRole('button', { name: '新增待办' }).click();
  await page.getByLabel('想做些什么？').fill('准备晚餐');
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  await expect(page.getByRole('alert')).toContainText('未保存');
  await page.getByRole('button', { name: '继续编辑' }).click();
  await expect(page.getByLabel('想做些什么？')).toHaveValue('准备晚餐');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '标记完成：准备晚餐' }).click();
  await expect(page.getByRole('button', { name: '已完成 1' })).toBeVisible();
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.getByRole('button', { name: '标记完成：准备晚餐' })).toBeVisible();
});

test('anniversary draft and dated card lead to the matching event', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00+08:00'));
  await page.goto('/');
  await page.getByRole('button', { name: '纪念日', exact: true }).click();
  await page.getByRole('button', { name: '新增纪念日' }).click();
  await page.getByLabel('纪念日名称').fill('我们的纪念日');
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '继续编辑' }).click();
  await expect(page.getByLabel('纪念日名称')).toHaveValue('我们的纪念日');
  await page.getByRole('button', { name: '保存纪念日' }).click();
  await page.getByRole('button', { name: '查看详情：我们的纪念日' }).click();
  const detail = page.getByRole('region', { name: '纪念日详情' });
  await expect(detail.getByRole('heading')).toHaveText('我们的纪念日');
  await expect(detail.locator('time')).toHaveAttribute('datetime', '2026-10-23');
  await detail.getByRole('button', { name: '编辑纪念日' }).click();
  await expect(page.getByRole('dialog', { name: '编辑纪念日' })).toBeVisible();
});

test('period prediction identifies defaults and overdue state', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00+08:00'));
  await page.goto('/');
  await page.getByRole('button', { name: '生理期', exact: true }).click();
  const calendar = page.getByRole('region', { name: '生理期日历' });
  await calendar.getByRole('button', { name: '上个月' }).click();
  await calendar.getByRole('button', { name: /^2026-09-01/ }).click();
  await page.getByRole('switch', { name: '经期中' }).click();
  const picker = page.getByRole('dialog', { name: '选择经期结束日期' });
  await picker.getByRole('button', { name: /^2026-09-05/ }).click();
  await picker.getByRole('button', { name: '保存经期记录' }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('.period-storage')).toBeEmpty();
  await page.getByRole('button', { name: '首页', exact: true }).click();
  await page.getByRole('button', { name: '打开应用设置' }).click();
  await page.getByRole('button', { name: '周期信息', exact: true }).click();
  const summary = page.getByRole('region', { name: '周期统计' });
  await expect(summary).toContainText('基于默认周期设置');
  await expect(summary).toContainText('预测日期已过');
  await expect(summary).toContainText('不用于避孕或诊断');
});
