import { expect, test } from '@playwright/test';
import { mergeBackup } from '../src/data/backupModel';
import { nextImportantDate, timing, type Anniversary } from '../src/features/anniversary/model';

const legacy: Anniversary = {
  id: 1, name: '在一起', date: '2025-03-11', yearly: true, theme: '恋爱',
  icon: '♡', note: '保留旧备注', color: 'lavender', createdAt: 1, updatedAt: 1,
};

test.use({ viewport: { width: 393, height: 864 }, timezoneId: 'Asia/Shanghai' });

test('累计从第一天起算，旧备份与等效显式模式合并时去重', () => {
  expect(timing(legacy, '2025-03-10')).toMatchObject({ kind: 'upcoming', days: 1 });
  expect(timing(legacy, '2025-03-11')).toMatchObject({ kind: 'cumulative', days: 1 });
  expect(timing(legacy, '2026-03-11')).toMatchObject({ kind: 'cumulative', days: 366 });
  const source = { anniversaries: [legacy as Anniversary & { id: number }], categories: [], todos: [], period: null };
  const local = { ...source, anniversaries: [{ ...source.anniversaries[0], timingMode: 'cumulative' as const }] };
  expect(mergeBackup(local, source).records.anniversaries).toEqual(local.anniversaries);
});

test('顶部选择最近一次发生日期，兼顾闰日、同日优先级和历史记录', () => {
  const couple = { ...legacy, date: '2025-06-24' };
  const birthday = { ...legacy, id: 2, name: '小明生日', date: '2000-06-28', theme: '生日' as const };
  const past = { ...legacy, yearly: false };
  const laterCreated = { ...couple, id: 3, name: '同日事件', createdAt: 2 };
  expect(nextImportantDate([laterCreated, birthday, past, couple], '2027-06-14')).toMatchObject({
    title: '在一起两周年', days: 10, occurrence: '2027-06-24',
  });
  expect(nextImportantDate([couple, birthday], '2027-06-24')).toMatchObject({ days: 0, title: '在一起两周年' });
  expect(nextImportantDate([couple, birthday], '2027-06-25')).toMatchObject({ days: 3, title: '小明生日' });
  const leap = { ...birthday, date: '2000-02-29' };
  expect(nextImportantDate([leap], '2027-02-28')).toMatchObject({ days: 0, occurrence: '2027-02-28' });
  expect(nextImportantDate([leap], '2028-02-28')).toMatchObject({ days: 1, occurrence: '2028-02-29' });
  const oneTime = { ...past, date: '2027-06-15' };
  expect(nextImportantDate([couple, oneTime], '2027-06-14')).toMatchObject({ days: 1, occurrence: '2027-06-15' });
  expect(nextImportantDate([past], '2027-06-14')).toBeUndefined();
});

test('旧备份恢复后按计时方式展示，搜索、切换视图、编辑和删除', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-19T12:00:00+08:00'));
  await page.goto('/');
  const fixture = [
    legacy,
    { ...legacy, id: 2, name: '生日', date: '2000-06-28', theme: '生日', icon: '🎂', note: '', createdAt: 2 },
    { ...legacy, id: 3, name: '第一次旅行', date: '2025-06-24', theme: '生活', yearly: false, timingMode: 'cumulative', note: '', createdAt: 3 },
  ];
  await page.evaluate(async anniversaries => {
    const models = '/src/data/backupModel.ts';
    const storage = '/src/data/backup.ts';
    const { makeBackup, encodeBackup, decodeBackup } = await import(models);
    const { restoreBackup, exportBackup } = await import(storage);
    const { backup } = await exportBackup();
    const json = encodeBackup(makeBackup({ ...backup.records, anniversaries }, backup.appVersion));
    await restoreBackup(decodeBackup(json), 'replace');
  }, fixture);
  await page.reload();

  const nav = page.getByRole('navigation', { name: '应用模块' });
  await nav.getByRole('button', { name: '纪念日', exact: true }).click();
  const cards = page.getByTestId('anniversary-card');
  const card = (name: string) => page.getByRole('button', { name: `查看详情：${name}`, exact: true });
  await expect(nav.getByRole('button')).toHaveCount(4);
  const featured = page.locator('.ann-featured');
  await expect(featured).toContainText('在一起两周年');
  await expect(featured.locator('.ann-featured-count')).toHaveText('112 天后');
  await expect(featured.locator('time')).toHaveAttribute('datetime', '2027-03-11');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('221');
  await expect(cards.nth(1)).toContainText('514');
  await expect(cards.nth(2)).toContainText('619');
  await expect(cards.first().locator('time')).toHaveAttribute('datetime', '2000-06-28');
  for (const width of [360, 430, 393]) {
    await page.setViewportSize({ width, height: 864 });
    expect(await page.locator('.ann-library').evaluate(el => el.scrollWidth)).toBe(width);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'artifacts/anniversary-393x864.png', animations: 'disabled' });

  const search = page.getByRole('searchbox', { name: '搜索纪念日' });
  await search.fill('旧备注');
  await expect(cards).toHaveCount(1);
  await expect(card('在一起')).toBeVisible();
  await search.clear();
  const grid = page.getByRole('button', { name: '网格视图' });
  await grid.click();
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.ann-list')).toHaveClass(/ann-grid/);
  await grid.click();

  await page.getByRole('button', { name: '新增纪念日', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '取消' })).toBeVisible();
  await expect(dialog.getByRole('combobox')).toHaveCount(1);
  for (const width of [360, 430, 393]) {
    await page.setViewportSize({ width, height: 864 });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
  }
  await dialog.getByLabel('纪念日名称').fill('当天事项');
  await dialog.getByLabel('每年重复').uncheck();
  await page.setViewportSize({ width: 360, height: 450 });
  await dialog.getByRole('button', { name: '保存纪念日' }).click();
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 393, height: 864 });
  await expect(cards.first()).toContainText('今天');
  await expect(featured.locator('.ann-featured-count')).toHaveText('今天');

  await card('当天事项').click();
  await page.getByRole('button', { name: '编辑纪念日', exact: true }).click();
  await dialog.getByLabel('日期', { exact: true }).fill('2026-11-18');
  await dialog.getByRole('button', { name: '保存纪念日' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '返回纪念日列表' }).click();
  await page.getByRole('button', { name: '纪念日菜单' }).click();
  await page.getByRole('button', { name: '已过去', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(card('当天事项')).toHaveAccessibleDescription('已过去 1 天');
  await card('当天事项').click();
  await page.getByRole('button', { name: '删除纪念日', exact: true }).click();
  await dialog.getByRole('button', { name: '确认删除' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: '清除筛选：已过去' }).click();

  await card('在一起').click();
  await expect(page.getByText('起始日期 · 2025-03-11')).toBeVisible();
  await expect(page.getByText(legacy.note, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑纪念日', exact: true }).click();
  await expect(dialog.getByLabel('计时方式')).toHaveValue('cumulative');
  await expect(dialog.getByLabel('每年重复')).toBeChecked();
  await dialog.getByLabel('计时方式').selectOption('countdown');
  await dialog.getByRole('button', { name: '保存纪念日' }).click();
  await expect(dialog).toHaveCount(0);
  await page.evaluate(async () => {
    const models = '/src/data/backupModel.ts';
    const storage = '/src/data/backup.ts';
    const { decodeBackup } = await import(models);
    const { restoreBackup, exportBackup } = await import(storage);
    const { json } = await exportBackup();
    await restoreBackup(decodeBackup(json), 'replace');
  });
  await page.reload();
  const restored = await page.evaluate(async () => {
    const storage = '/src/data/backup.ts';
    return (await (await import(storage)).exportBackup()).backup.records.anniversaries;
  });
  expect(restored).toHaveLength(3);
  expect(restored.find((row: Anniversary) => row.id === legacy.id)).toMatchObject({
    date: legacy.date, note: legacy.note, color: legacy.color, icon: legacy.icon,
    theme: legacy.theme, yearly: true, timingMode: 'countdown',
  });
  await nav.getByRole('button', { name: '纪念日', exact: true }).click();
  await expect(card('在一起')).toHaveAccessibleDescription('还有 112 天');
});
