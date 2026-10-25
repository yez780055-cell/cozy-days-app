import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { emptyData, type PeriodData } from '../src/features/period/model';
import { taskAction } from './task-actions';

const evidence = 'artifacts/v022-ui';
async function settleVisuals(page: Page) {
  await expect.poll(() => page.evaluate(() => [...document.fonts].some(font => font.family === 'Yozai' && font.status === 'loaded'))).toBe(true);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => undefined)));
  });
  await page.waitForTimeout(300);
}
async function seedPeriod(page: Page) {
  const data: PeriodData = {
    ...emptyData(),
    periods: [
      { id: 'may', start: '2026-05-20', end: '2026-05-25' },
      { id: 'sep', start: '2026-09-20', end: '2026-09-25' },
      { id: 'oct', start: '2026-10-20' },
    ],
    days: {
      '2026-05-25': { date: '2026-05-25', flow: '适中', symptoms: ['疲惫'], mood: '平静' },
      '2026-10-25': { date: '2026-10-25', flow: '适中', symptoms: ['疲惫'], mood: '平静' },
    },
  };
  await page.clock.install({ time: new Date('2026-10-25T04:00:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('cozy-days.settings-hint-seen', '1');
    localStorage.setItem('cozy-days.font-family', 'yozai');
  });
  await page.goto('/');
  await page.evaluate(async value => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('cozy-days-period', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put({ id: 'local', value });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), data);
  await page.reload();
  await settleVisuals(page);
}

async function touchSwipe(page: Page, x: number, y: number, dx: number, dy = 0) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let step = 1; step <= 4; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 4, y: y + dy * step / 4, id: 1 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function touchMultiSwipe(page: Page, x: number, y: number, dx: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }, { x: x + 8, y: y + 8, id: 2 }] });
  for (let step = 1; step <= 4; step++) {
    const offset = dx * step / 4;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + offset, y, id: 1 }, { x: x + 8 + offset, y: y + 8, id: 2 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('touch date gestures are scoped, click safe, and month dates clamp', async ({ page }) => {
  await seedPeriod(page);
  await expect(page.locator('.date-browsing')).toBeVisible();
  const date = page.locator('.date-button'), box = await date.boundingBox();
  expect(box).not.toBeNull();
  await touchSwipe(page, box!.x + box!.width / 2, box!.y + box!.height / 2, -72);
  await expect(date).toContainText('10月26日');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await touchSwipe(page, box!.x + box!.width / 2, box!.y + box!.height / 2, -30);
  await expect(date).toContainText('10月26日');
  await touchSwipe(page, box!.x + box!.width / 2, box!.y + box!.height / 2, 0, -75);
  await expect(date).toContainText('10月26日');
  await touchSwipe(page, box!.x + box!.width / 2, box!.y + box!.height / 2, 72);
  await expect(date).toContainText('10月25日');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.waitForTimeout(140);
  await page.getByRole('button', { name: '选择日期', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '选择日期' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '新增待办', exact: true }).click();
  const todoDialog = page.getByRole('dialog', { name: '新建待办' });
  await todoDialog.getByRole('textbox', { name: '想做些什么？' }).fill('Swipe boundary check');
  await todoDialog.getByRole('button', { name: '保存', exact: true }).click();
  const todoCard = page.getByTestId('todo-card');
  const liveDateBox = await date.boundingBox();
  await touchSwipe(page, liveDateBox!.x + liveDateBox!.width / 2, liveDateBox!.y + liveDateBox!.height / 2, -72);
  await expect(date).toContainText('10月26日');
  await expect(todoCard).toHaveCount(0);
  await page.getByRole('button', { name: /^全部未完成/ }).click();
  await expect(todoCard).toBeVisible();
  const backDateBox = await date.boundingBox();
  await touchSwipe(page, backDateBox!.x + backDateBox!.width / 2, backDateBox!.y + backDateBox!.height / 2, 72);
  await expect(date).toContainText('10月25日');
  await expect(todoCard).toBeVisible();
  const cardBox = await todoCard.boundingBox();
  expect(cardBox).not.toBeNull();
  await touchSwipe(page, cardBox!.x + cardBox!.width / 2, cardBox!.y + cardBox!.height / 2, -72);
  await expect(date).toContainText('10月25日');
  await page.getByRole('button', { name: '编辑：Swipe boundary check', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '编辑待办' })).toBeVisible();
  await page.keyboard.press('Escape');
  await taskAction(page, 'Swipe boundary check', 'complete');
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑：Swipe boundary check', exact: true })).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: '生理期', exact: true }).click();
  await expect(page.locator('.period-calendar')).toBeVisible();
  const month = page.locator('.period-calendar h2'), selected = page.locator('.period-date.chosen');
  await page.getByRole('button', { name: /^2026-10-31/ }).click();
  const calendar = await page.locator('.period-calendar').boundingBox();
  expect(calendar).not.toBeNull();
  await touchSwipe(page, calendar!.x + calendar!.width / 2, calendar!.y + calendar!.height * .72, -72);
  await expect(month).toHaveText('2026年11月');
  await expect(selected).toHaveAttribute('aria-label', /^2026-11-30/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const monthBox = await page.locator('.period-calendar').boundingBox();
  await touchSwipe(page, monthBox!.x + monthBox!.width / 2, monthBox!.y + monthBox!.height * .72, -30);
  await expect(month).toHaveText('2026年11月');
  await touchSwipe(page, monthBox!.x + monthBox!.width / 2, monthBox!.y + monthBox!.height * .72, 0, -75);
  await expect(month).toHaveText('2026年11月');
  await touchMultiSwipe(page, monthBox!.x + monthBox!.width / 2, monthBox!.y + monthBox!.height * .72, -72);
  await expect(month).toHaveText('2026年11月');

  await page.getByRole('button', { name: '上个月', exact: true }).click();
  await expect(month).toHaveText('2026年10月');
  await expect(page.locator('.period-date.chosen')).toHaveAttribute('aria-label', /^2026-10-30/);
  await page.getByRole('button', { name: '今天', exact: true }).click();
  const cell = page.getByRole('button', { name: /^2026-10-25/ }), cellBox = await cell.boundingBox();
  expect(cellBox).not.toBeNull();
  await touchSwipe(page, cellBox!.x + cellBox!.width / 2, cellBox!.y + cellBox!.height / 2, 0, -75);
  await expect(month).toHaveText('2026年10月');
  await expect(page.locator('.period-date.chosen')).toHaveAttribute('aria-label', /^2026-10-25/);
});

for (const viewport of [{ width: 360, height: 740 }, { width: 393, height: 852 }, { width: 430, height: 932 }]) {
  test(`period controls fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedPeriod(page);
    await page.getByRole('navigation').getByRole('button', { name: '生理期', exact: true }).click();
    await expect(page.getByRole('button', { name: '较多', exact: true })).toBeVisible();
    const record = page.locator('.period-daily'), nav = page.getByRole('navigation');
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/period-${viewport.width}x${viewport.height}-fit-check.png`, animations: 'disabled' });
    for (const label of ['是', '否', '较多', '适中', '较少', '点滴', '无', '腹痛', '疲惫', '头痛', '胸部胀痛', '其他', '开心', '平静', '焦虑', '低落', '易怒']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeInViewport({ ratio: 1 });
    }
    const recordBox = await record.boundingBox(), navBox = await nav.boundingBox();
    expect(recordBox!.y + recordBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
    expect(await page.locator('.period-page').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);

    if (viewport.width === 360) {
      await page.getByRole('button', { name: '上个月', exact: true }).click();
      await page.getByRole('button', { name: '上个月', exact: true }).click();
      await page.getByRole('button', { name: '上个月', exact: true }).click();
      await page.getByRole('button', { name: '上个月', exact: true }).click();
      await page.getByRole('button', { name: '上个月', exact: true }).click();
      await expect(page.locator('.period-calendar h2')).toHaveText('2026年5月');
      await expect(page.getByRole('button', { name: '是', exact: true })).toHaveAttribute('aria-pressed', 'true');
      for (const label of ['是', '较多', '适中', '较少', '点滴', '无', '腹痛', '疲惫', '头痛', '胸部胀痛', '其他', '开心', '平静', '焦虑', '低落', '易怒']) {
        await expect(page.getByRole('button', { name: label, exact: true })).toBeInViewport({ ratio: 1 });
      }
      const rows = await page.locator('.period-grid').evaluate(el => getComputedStyle(el).gridTemplateRows.split(' ').length);
      expect(rows).toBe(6);
    }

    mkdirSync(evidence, { recursive: true });
    await page.getByRole('navigation').getByRole('button', { name: '待办', exact: true }).click();
    await page.screenshot({ path: `${evidence}/todo-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
    await page.getByRole('navigation').getByRole('button', { name: '纪念日', exact: true }).click();
    await page.screenshot({ path: `${evidence}/anniversary-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
    await page.getByRole('navigation').getByRole('button', { name: '生理期', exact: true }).click();
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/period-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
  });
}

test('six week calendar and 24px safe inset budget remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seedPeriod(page);
  await page.addStyleTag({ content: '.phone{padding-top:24px!important}.bottom-nav{height:96px!important;padding-bottom:29px!important}' });
  await page.getByRole('navigation').getByRole('button', { name: '生理期', exact: true }).click();
  await page.getByRole('button', { name: '上个月', exact: true }).click();
  await page.getByRole('button', { name: '上个月', exact: true }).click();
  await page.getByRole('button', { name: '上个月', exact: true }).click();
  await page.getByRole('button', { name: '上个月', exact: true }).click();
  await page.getByRole('button', { name: '上个月', exact: true }).click();
  await expect(page.locator('.period-calendar h2')).toHaveText('2026年5月');
  await expect(page.getByRole('button', { name: '是', exact: true })).toHaveAttribute('aria-pressed', 'true');
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/period-360x740-safe24-fit-check.png`, animations: 'disabled' });
  for (const label of ['是', '较多', '适中', '较少', '点滴', '无', '腹痛', '疲惫', '头痛', '胸部胀痛', '其他', '开心', '平静', '焦虑', '低落', '易怒']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeInViewport({ ratio: 1 });
  }
  const rows = await page.locator('.period-grid').evaluate(el => getComputedStyle(el).gridTemplateRows.split(' ').length);
  expect(rows).toBe(6);
  await expect(page.getByRole('button', { name: '今天', exact: true })).toBeInViewport();
  const nav = await page.locator('.bottom-nav').boundingBox(), record = await page.locator('.period-daily').boundingBox();
  expect(record!.y + record!.height).toBeLessThanOrEqual(nav!.y + 1);
  expect(await page.locator('.period-page').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
});

for (const viewport of [{ width: 360, height: 740 }, { width: 393, height: 852 }, { width: 430, height: 932 }]) {
  test(`empty cycle summary stays inside its card at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.install({ time: new Date('2026-10-25T04:00:00Z') });
    await page.addInitScript(() => {
      localStorage.setItem('cozy-days.settings-hint-seen', '1');
      localStorage.setItem('cozy-days.font-family', 'yozai');
    });
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: '生理期', exact: true }).click();
    await settleVisuals(page);
    const summary = page.locator('.period-summary'), heading = summary.getByRole('heading', { name: '从第一次记录，慢慢了解自己' });
    const add = summary.getByRole('button', { name: '记录第一次经期' });
    if (viewport.width === 360) {
      mkdirSync(evidence, { recursive: true });
      await page.screenshot({ path: `${evidence}/period-360x740-empty.png`, animations: 'disabled' });
    }
    await expect(heading).toBeVisible();
    await expect(add).toBeVisible();
    const card = await summary.boundingBox(), title = await heading.boundingBox(), button = await add.boundingBox();
    expect(title!.y).toBeGreaterThanOrEqual(card!.y);
    expect(title!.y + title!.height).toBeLessThanOrEqual(card!.y + card!.height);
    expect(button!.y + button!.height).toBeLessThanOrEqual(card!.y + card!.height);
    expect(await page.locator('.period-page').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  });
}
