import { expect, test } from '@playwright/test';

test('direct completion and unsaved todo protection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
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

test('anniversary draft and selected date lead to the matching event', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00+08:00'));
  await page.goto('/');
  await page.getByRole('button', { name: '纪念日', exact: true }).click();
  await page.getByRole('button', { name: '新增纪念日' }).click();
  await page.getByLabel('纪念日名称').fill('我们的纪念日');
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  await page.getByRole('button', { name: '继续编辑' }).click();
  await expect(page.getByLabel('纪念日名称')).toHaveValue('我们的纪念日');
  await page.getByRole('button', { name: '保存纪念日' }).click();
  const selected = page.getByRole('region', { name: '所选日期的纪念日' });
  await selected.getByRole('button', { name: /我们的纪念日/ }).click();
  await expect(page.getByRole('dialog', { name: '编辑纪念日' })).toBeVisible();
});

test('period prediction identifies defaults and overdue state', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00+08:00'));
  await page.goto('/');
  await page.getByRole('button', { name: '生理期', exact: true }).click();
  await page.getByRole('button', { name: '记录第一次经期' }).click();
  await page.getByLabel('开始日期', { exact: true }).fill('2026-09-01');
  await page.getByRole('button', { name: '保存经期记录' }).click();
  await expect(page.locator('.period-summary')).toContainText('基于默认周期设置');
  await expect(page.locator('.period-summary')).toContainText('预测日期已过');
  await expect(page.locator('.period-summary')).toContainText('不用于避孕或诊断');
});
