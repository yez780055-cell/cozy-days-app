import { expect, test, type Download, type Page } from '@playwright/test';
import { makeBackup, type Backup, type BackupRecords } from '../src/data/backupModel';

function fixture(label: string, month: string): BackupRecords {
  return {
    categories: [{ id: 'life', name: label, key: label, builtin: false, createdAt: 1 }],
    todos: [{ id: 1, text: label + '待办', date: '2026-01-01', completed: true, categoryId: 'life', favorite: true, time: '08:05', createdAt: 1 }],
    anniversaries: [{ id: 1, name: label + '纪念日', date: '2026-01-01', yearly: true, color: 'pink', theme: '生活', note: '回忆', icon: '♡', createdAt: 1, updatedAt: 2 }],
    period: {
      periods: [{ id: 'same-id', start: `2026-${month}-01`, end: `2026-${month}-04` }],
      days: {
        '2026-01-01': { date: '2026-01-01', symptoms: ['腹痛'], mood: label },
        [`2026-${month}-02`]: { date: `2026-${month}-02`, symptoms: ['疲惫'] },
      },
      settings: { cycleLength: 28, periodLength: 5 },
      ...{ legacyField: { keep: true } },
    },
  };
}

async function snapshot(page: Page): Promise<Backup> {
  return page.evaluate(async () => {
    const path = '/src/data/backup.ts';
    return (await (await import(path)).exportBackup()).backup;
  });
}

async function seed(page: Page, data: BackupRecords) {
  await page.goto('/');
  await page.evaluate(async data => {
    const access = '/src/data/storageAccess.ts', period = '/src/data/periodDatabase.ts';
    const { writePrimary, withDataAccess } = await import(access);
    const { periodDatabase } = await import(period);
    await withDataAccess(async () => {
      await writePrimary(data);
      await periodDatabase.state.put({ id: 'local', value: data.period });
    });
  }, data);
  await page.reload();
  await expect(page.getByRole('button', { name: '打开应用设置' })).toBeVisible();
}

async function openBackup(page: Page) {
  await page.getByRole('button', { name: '打开应用设置' }).click();
  await page.getByRole('button', { name: '数据备份与恢复' }).click();
}

function upload(page: Page, contents: string) {
  return page.getByLabel('选择备份文件').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(contents),
  });
}

async function downloaded(page: Page, name: string): Promise<string> {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
  const stream = await (file as Download).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function reopen(page: Page) {
  await page.getByRole('button', { name: '重新打开应用', exact: true }).click();
  await expect(page.getByRole('navigation').getByRole('button', { name: '首页', exact: true })).toHaveAttribute('aria-current', 'page');
}

test('a long backup filename wraps and cancel leaves stored records intact', async ({page}) => {
  await page.setViewportSize({width:360,height:480});
  await seed(page,fixture('已有', '03'));
  const before = await snapshot(page);
  const incoming = makeBackup(fixture('外部', '04'),before.appVersion);
  await openBackup(page);
  const name = '备份文件'.repeat(32) + '.json';
  await page.getByLabel('选择备份文件').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming))});
  await expect(page.getByText(name,{exact:true})).toBeVisible();
  await expect(page.locator('.backup-review dl')).toContainText('生理期日记');
  expect(await page.locator('.backup-page').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('radio',{name:'替换本机数据'}).check();
  await expect(page.getByRole('button',{name:'确认替换',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await expect(page.getByRole('heading',{name:'确认导入'})).toHaveCount(0);
  expect((await snapshot(page)).records).toEqual(before.records);
});

test('downloads all modules, merges without replacing, then restores and downloads the pre-replacement backup', async ({ page, browser }) => {
  await seed(page, fixture('来源', '02'));
  const source = await snapshot(page);
  await openBackup(page);
  const json = await downloaded(page, '导出完整 JSON');
  expect(JSON.parse(json)).toMatchObject({ version: 1, appVersion: '0.2.1', databases: { littleDays: 4, period: 1 }, records: source.records });

  const target = await browser.newContext();
  try {
    const receiver = await target.newPage();
    await seed(receiver, fixture('本机', '03'));
    const before = await snapshot(receiver);
    const secondTab = await target.newPage();
    await secondTab.goto('/');
    await snapshot(secondTab);

    await openBackup(receiver);
    await upload(receiver, json);
    await expect(receiver.getByRole('heading', { name: '确认导入' })).toBeVisible();
    await expect(receiver.getByRole('radio', { name: '合并并保留本机数据' })).toBeChecked();
    expect((await snapshot(receiver)).records).toEqual(before.records);
    await receiver.getByRole('button', { name: '确认合并' }).click();
    await expect(receiver.getByRole('status')).toContainText('已保留 1 项');
    await reopen(receiver);

    const merged = (await snapshot(receiver)).records;
    expect(merged.todos).toHaveLength(2);
    expect(merged.anniversaries.map(row => row.name).sort()).toEqual(['本机纪念日', '来源纪念日']);
    expect(new Set(merged.todos.map(row => row.id)).size).toBe(2);
    for (const row of merged.todos) {
      expect(merged.categories.find(category => category.id === row.categoryId)?.name + '待办').toBe(row.text);
    }
    expect(merged.period?.days['2026-01-01'].mood).toBe('本机');
    expect(merged.period?.periods).toHaveLength(2);
    expect(new Set(merged.period?.periods.map(row => row.id)).size).toBe(2);
    expect(merged.period?.days['2026-02-02'].symptoms).toEqual(['疲惫']);

    expect(await secondTab.evaluate(async () => {
      const path = '/src/data/database.ts';
      try { await (await import(path)).todoRepository.remove(1); return false; }
      catch { return true; }
    })).toBe(true);
    await expect(secondTab.getByRole('alert')).toContainText('本机数据已恢复');
    expect((await snapshot(receiver)).records).toEqual(merged);

    await openBackup(receiver);
    await upload(receiver, json);
    await receiver.getByRole('button', { name: '确认合并' }).click();
    await reopen(receiver);
    expect((await snapshot(receiver)).records).toEqual(merged);

    await openBackup(receiver);
    await upload(receiver, json);
    await receiver.getByRole('radio', { name: '替换本机数据' }).check();
    await receiver.getByRole('button', { name: '确认替换' }).click();
    await expect(receiver.getByRole('status')).toContainText('恢复完成');
    await reopen(receiver);
    expect((await snapshot(receiver)).records).toEqual(source.records);
    await openBackup(receiver);
    const recovery = await downloaded(receiver, '下载最近一次替换前的备份');
    expect(JSON.parse(recovery).records).toEqual(merged);
  } finally {
    await target.close();
  }
});

test('rejects corrupted JSON, unsupported versions and invalid references before confirmation', async ({ page }) => {
  await seed(page, fixture('本机', '03'));
  const baseline = await snapshot(page);
  await openBackup(page);
  for (const [input, error] of [
    ['{"format":', '文件不是有效的 JSON'],
    [JSON.stringify({ ...baseline, databases: { littleDays: 5, period: 1 } }), '备份版本与当前应用不兼容'],
    [JSON.stringify({ ...baseline, version: 3 }), '备份版本与当前应用不兼容'],
    [JSON.stringify({ ...baseline, version: 2 }), '记录结构无效'],
    [JSON.stringify({ ...baseline, records: { ...baseline.records, categories: [] } }), '记录结构无效'],
    [JSON.stringify({ ...baseline, records: { ...baseline.records, todos: [{ ...baseline.records.todos[0], id: Number.MAX_SAFE_INTEGER }] } }), '记录结构无效'],
  ]) {
    await upload(page, input);
    await expect(page.getByRole('alert')).toContainText(error);
    await expect(page.getByRole('heading', { name: '确认导入' })).toHaveCount(0);
  }
  expect((await snapshot(page)).records).toEqual(baseline.records);
});

test('rolls both databases back on a late failure and recovers a persisted interrupted import', async ({ page }) => {
  const updated = fixture('来源', '02');
  await seed(page, fixture('本机', '03'));
  const baseline = await snapshot(page);
  await openBackup(page);
  await upload(page, JSON.stringify({ ...baseline, records: updated }));
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name === 'cozy-days-period' && args[0]?.id === 'backup:revision-v1') {
        throw new DOMException('Injected late period transaction failure', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
  });
  await page.getByRole('radio', { name: '替换本机数据' }).check();
  await page.getByRole('button', { name: '确认替换' }).click();
  await expect(page.getByRole('alert')).toContainText('三个模块的原数据均已恢复');
  expect((await snapshot(page)).records).toEqual(baseline.records);

  await page.evaluate(async ({ before, updated }) => {
    const access = '/src/data/storageAccess.ts', period = '/src/data/periodDatabase.ts';
    const { writePrimary, restoreJournal, withDataAccess } = await import(access);
    const { periodDatabase } = await import(period);
    await withDataAccess(async () => {
      await periodDatabase.state.put({ id: restoreJournal, value: before });
      await writePrimary(updated);
    });
  }, { before: baseline.records, updated });
  await page.reload();
  expect((await snapshot(page)).records).toEqual(baseline.records);
});

test('deletes the final 生活 category and preserves its tasks in a fresh fallback', async ({ page }) => {
  const values = fixture('生活', '01');
  await seed(page, values);
  await page.getByRole('navigation').getByRole('button', { name: '待办', exact: true }).click();
  await expect(page.getByRole('button', { name: '分类：生活' })).toBeVisible();
  await page.getByRole('button', { name: '添加或管理分类' }).click();
  await page.getByRole('button', { name: '删除分类：生活' }).click();
  await page.getByRole('button', { name: '确认删除分类' }).click();
  await expect(page.getByText('删除「生活」分类？')).toHaveCount(0);
  const { records } = await snapshot(page);
  expect(records.categories).toMatchObject([{ id: 'life-fallback', name: '生活' }]);
  expect(records.todos).toMatchObject([{ id: 1, text: '生活待办', categoryId: 'life-fallback' }]);
});

test('starts and saves an actual period when crypto.randomUUID is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined });
    Object.defineProperty(Navigator.prototype, 'locks', { value: undefined });
  });
  await page.goto('/');
  await expect(page.getByRole('navigation').getByRole('button', { name: '首页', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('navigation').getByRole('button', { name: '生理期', exact: true }).click();
  const firstPeriod = page.getByRole('switch', { name: '经期中' });
  await expect(firstPeriod).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('cozy-days-period-recovery-v1')))).toBe(false);
  await firstPeriod.click();
  await expect(firstPeriod).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await snapshot(page)).records.period?.periods).toHaveLength(1);
});
