import { test, expect } from '@playwright/test';
import { Lunar } from 'lunar-typescript';
import { addDays, inYear, nextImportantDate, occurrenceTiming, solarToLunar, validCalendarFields, type Anniversary } from '../src/features/anniversary/model';
import { decodeBackup, encodeBackup, makeBackup } from '../src/data/backupModel';
import { chooseDate } from './anniversary-actions';
const base: Anniversary = { id: 1, name: '在一起', date: '2025-06-24', yearly: true, theme: '恋爱', note: '保留备注', icon: '♡', color: 'pink', createdAt: 1, updatedAt: 1 };

test('农历跨春节、大小月和闰月逐年转换，备份保留新旧数据', () => {
  const lunar = { ...base, calendar: 'lunar' as const, lunarDate: { year: 2023, month: -2, day: 1 }, date: '2023-03-22', specialDays: [520, 777] };
  expect(validCalendarFields(lunar)).toBe(true);
  expect(inYear(lunar, 2024)).toBe('2024-03-10');
  expect(inYear(lunar, 2023)).toBe('2023-03-22');
  const spring = { ...lunar, lunarDate: { year: 2024, month: 1, day: 1 }, date: '2024-02-10' };
  expect(occurrenceTiming(spring, '2025-01-01')).toMatchObject({ occurrence: '2025-01-29', days: 28 });
  expect(occurrenceTiming(spring, '2025-01-30').occurrence).toBe('2026-02-17');
  const lastDay = { ...lunar, lunarDate: { year: 2023, month: 2, day: 30 }, date: Lunar.fromYmd(2023, 2, 30).getSolar().toYmd() };
  expect(solarToLunar(inYear(lastDay, 2024)!)).toEqual({ year: 2024, month: 2, day: 30 });
  expect(solarToLunar(inYear(lastDay, 2025)!)).toEqual({ year: 2025, month: 2, day: 29 });
  expect(validCalendarFields({ ...lunar, date: '2023-03-21' })).toBe(false);
  expect(validCalendarFields({ ...lunar, specialDays: [-1] })).toBe(false);
  expect(validCalendarFields({ ...lunar, lunarDate: { year: 2024, month: -2, day: 1 } })).toBe(false);
  const records = { categories: [], todos: [], anniversaries: [base, { ...lunar, id: 2 }], period: null };
  expect(decodeBackup(encodeBackup(makeBackup(records, '0.2.1'))).records.anniversaries).toEqual(records.anniversaries);
});

test('特殊累计节点在当日和到期后排序，不修改收藏数量，支持自定义与关闭', () => {
  const row = { ...base, yearly: false };
  const day519 = addDays(row.date, 518);
  expect(nextImportantDate([row], day519)).toMatchObject({ milestone: 520, days: 1 });
  expect(nextImportantDate([row], addDays(day519, 1))).toMatchObject({ milestone: 520, days: 0 });
  expect(nextImportantDate([row], addDays(day519, 2))).toMatchObject({ milestone: 600, days: 79 });
  expect(nextImportantDate([{ ...row, specialDays: [530, 525] }], day519)).toMatchObject({ milestone: 525, days: 6 });
  expect(nextImportantDate([{ ...row, specialDays: [] }], day519)).toBeUndefined();
  const closer = { ...row, id: 2, name: '明天', timingMode: 'countdown' as const, date: day519 };
  expect(nextImportantDate([row, closer], day519)?.row.id).toBe(2);
  expect(row).toEqual({ ...base, yearly: false });
});

test('紧凑卡片、滚轮闰月、编辑持久化和截图', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-22T12:00:00+08:00'));
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/');
  await page.evaluate(async row => {
    const path = '/src/data/database.ts'; const { anniversaryRepository } = await import(path);
    await anniversaryRepository.save(row);
    await anniversaryRepository.save({ ...row, id: undefined, name: '她的生日', theme: '生日', timingMode: 'countdown', calendar: 'lunar', lunarDate: { year: 2023, month: -2, day: 1 }, date: '2023-03-22', note: '' });
    await anniversaryRepository.save({ ...row, id: undefined, name: '圣诞节', theme: '生活', timingMode: 'countdown', date: '2020-12-25' });
  }, { ...base, id: undefined });
  const nav = page.getByRole('navigation', { name: '应用模块' });
  await nav.getByRole('button', { name: '纪念日', exact: true }).click();
  const featured = page.locator('.ann-featured');
  await expect(page.getByTestId('anniversary-card')).toHaveCount(3);
  await expect(featured).toContainText('在一起');
  const box = (await featured.boundingBox())!; expect(box.height).toBeLessThan(230);
  await expect(page.getByRole('button', { name: '查看详情：在一起', exact: true }).locator('.ann-count')).toHaveText('517天');
  await expect(page.locator('.ann-card-copy')).not.toContainText(['周年 · 每年', '生日 · 每年', '生活 · 每年']);
  await page.screenshot({ path: 'artifacts/anniversary-refresh/compact.png' });
  await page.getByRole('button', { name: '查看详情：她的生日', exact: true }).click();
  await page.getByRole('button', { name: '编辑纪念日', exact: true }).click();
  const form = page.getByRole('dialog', { name: '编辑纪念日' });
  await form.getByRole('button', { name: '选择日期', exact: true }).click();
  const picker = form.getByRole('region', { name: '选择日期' });
  await expect(picker.getByRole('option', { name: '闰二月', exact: true })).toHaveAttribute('aria-selected', 'true');
  await picker.screenshot({ path: 'artifacts/anniversary-refresh/lunar-picker.png' });
  await picker.getByRole('button', { name: '取消', exact: true }).click();
  await chooseDate(form, '2027-03-11');
  await form.getByRole('button', { name: '选择日期', exact: true }).click();
  await picker.screenshot({ path: 'artifacts/anniversary-refresh/solar-picker.png' });
  await picker.getByRole('button', { name: '取消', exact: true }).click();
  await form.getByRole('button', { name: '正计时', exact: true }).click();
  await form.locator('summary').click();
  await form.getByLabel('自定义累计天数').fill('520、601、777');
  await form.getByRole('button', { name: '保存纪念日', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.reload();
  const saved = await page.evaluate(async () => { const path = '/src/data/database.ts'; return (await import(path)).anniversaryRepository.all(); });
  expect(saved).toHaveLength(3);
  expect(saved.find((r: Anniversary) => r.name === '她的生日')).toMatchObject({ date: '2027-03-11', calendar: 'solar', timingMode: 'cumulative', specialDays: [520, 601, 777] });
  await nav.getByRole('button', { name: '纪念日', exact: true }).click();
  await page.evaluate(async () => {
    const path = '/src/data/database.ts'; const { anniversaryRepository } = await import(path);
    const row = (await anniversaryRepository.all()).find((r: Anniversary) => r.name === '在一起');
    const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 240;
    const ctx = canvas.getContext('2d')!; const gradient = ctx.createLinearGradient(0,0,0,240); gradient.addColorStop(0,'#697b9e'); gradient.addColorStop(1,'#edc1ab'); ctx.fillStyle=gradient;ctx.fillRect(0,0,180,240);ctx.fillStyle='#fff3d4';ctx.beginPath();ctx.arc(130,55,20,0,Math.PI*2);ctx.fill();
    await anniversaryRepository.save({ ...row, backgroundImage: canvas.toDataURL() });
  });
  await page.reload(); await nav.getByRole('button', { name: '纪念日', exact: true }).click();
  await expect(featured.locator('.ann-art')).toBeVisible();
  const text = (await featured.locator('.ann-featured-copy').boundingBox())!; const image = (await featured.locator('.ann-art').boundingBox())!;
  expect(image.x).toBeGreaterThan(text.x + text.width); expect(image.width / (await featured.boundingBox())!.width).toBeLessThan(.35);
  for (const width of [360, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    expect(await page.locator('.ann-library').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/anniversary-refresh/photo-${width}.png` });
  }
});
