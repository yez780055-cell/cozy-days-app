import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

let server: Server;
let url: string;
let revision: number;
let activationRequests: number;
let activationFailure: boolean;
let activationGate: Promise<void> | undefined;
const integrity = (body: string) => 'sha256-' + createHash('sha256').update(body).digest('base64');
const assetPath = (release: number) => 'assets/test-release-' + release + '.txt';

test.beforeEach(async () => {
  revision = 1;
  activationRequests = 0;
  activationFailure = false;
  activationGate = undefined;
  const root = resolve('dist-pages');
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const worker = await readFile(resolve(root, 'sw.js'), 'utf8');
  const buildHtml = (release: number) => html.replace('</head>', '<meta name="test-release" content="' + release + '"></head>');
  server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname).replace(/^\/cozy-days-app\/?/, '') || 'index.html';
      if (path === 'test-activation') {
        activationRequests++;
        await activationGate;
        res.writeHead(activationFailure ? 503 : 204).end();
        return;
      }
      const release = revision;
      const file = resolve(root, path);
      if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      let body: string | Buffer;
      if (path === 'sw.js') {
        body = worker.replace(/^const VERSION = (.*);/m, (_, version) => 'const VERSION = ' + JSON.stringify(JSON.parse(version) + '-' + release) + ';')
          .replace(/^const ASSETS = (.*);/m, (_, manifest) => {
            const assets = JSON.parse(manifest);
            assets.entries.find((entry: { path: string }) => entry.path === 'index.html').integrity = integrity(buildHtml(release));
            assets.entries.push({ path: assetPath(release), integrity: integrity(String(release)) });
            return 'const ASSETS = ' + JSON.stringify(assets) + ';';
          })
          .replace('event.waitUntil(self.skipWaiting())', 'event.waitUntil(fetch(new URL("test-activation", scope)).then(response => { if (!response.ok) throw new Error("Injected activation failure"); return self.skipWaiting(); }))');
      } else if (path === 'index.html') {
        body = buildHtml(release);
      } else if (path === assetPath(release)) {
        body = String(release);
      } else {
        body = await readFile(file);
      }
      const types: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
      res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(body);
    } catch { res.writeHead(404).end(); }
  }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  url = 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/cozy-days-app/';
});

test.afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Cozy Days 有新版本啦！' });
const addTodo = (page: Page) => page.getByRole('button', { name: '新增待办', exact: true });
const releaseMarker = (page: Page) => page.locator('meta[name="test-release"]');
const openTodos = (page: Page) => page.getByRole('navigation').getByRole('button', { name: '待办', exact: true }).click();

async function openApp(page: Page) {
  await page.goto(url);
  await openTodos(page);
  await expect(addTodo(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');
}

async function publish(page: Page, release: number) {
  revision = release;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
  await expect(dialog(page)).toBeVisible();
}

async function update(page: Page, button = '立即更新') {
  await Promise.all([page.waitForEvent('load'), dialog(page).getByRole('button', { name: button }).click()]);
}

const fixtures = {
  category: { id: 'pwa-test', name: '测试分类', key: '测试分类', builtin: false, createdAt: 1234 },
  todo: {
    id: 99, text: '更新前保留的待办', date: '2025-01-03', completed: false,
    createdAt: 1235, categoryId: 'pwa-test', time: '09:15', favorite: true,
    decoration: { version: 1, illustrationId: 'heart', stickerId: 'heart', theme: 'rose', seed: 42 },
  },
  anniversary: { id: 99, name: '测试纪念日', date: '2025-01-03', theme: '宠物', note: '测试备注', icon: '🐱', yearly: true, color: 'mint', createdAt: 1236, updatedAt: 1237 },
  periods: [{ id: 'pwa-period', start: '2025-01-01', end: '2025-01-05' }],
  days: { '2025-01-03': { date: '2025-01-03', flow: '中', symptoms: ['腹痛'], mood: '平静' } },
  settings: { cycleLength: 31, periodLength: 6 },
  font: 'system',
};

async function persistentData(page: Page, write = false) {
  return page.evaluate(async ({ fixtures, write }) => {
    const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const local = await request(indexedDB.open('little-days'));
    const period = await request(indexedDB.open('cozy-days-period'));
    try {
      const mode = write ? 'readwrite' : 'readonly';
      const localTx = local.transaction(['todos', 'categories', 'anniversaries'], mode);
      const periodTx = period.transaction('state', mode);
      if (write) {
        await Promise.all([
          request(localTx.objectStore('categories').put(fixtures.category)),
          request(localTx.objectStore('todos').put(fixtures.todo)),
          request(localTx.objectStore('anniversaries').put(fixtures.anniversary)),
          request(periodTx.objectStore('state').put({ id: 'local', value: {
            periods: fixtures.periods, days: fixtures.days, settings: fixtures.settings,
          } })),
        ]);
        localStorage.setItem('cozy-days.font-family', fixtures.font);
        return;
      }
      const [category, todo, anniversary, record] = await Promise.all([
        request(localTx.objectStore('categories').get(fixtures.category.id)),
        request(localTx.objectStore('todos').get(fixtures.todo.id)),
        request(localTx.objectStore('anniversaries').get(fixtures.anniversary.id)),
        request(periodTx.objectStore('state').get('local')),
      ]);
      return { category, todo, anniversary, ...record?.value, font: localStorage.getItem('cozy-days.font-family') };
    } finally {
      local.close();
      period.close();
    }
  }, { fixtures, write });
}

test('update preserves all six data types and can still reopen offline', async ({ page, context }) => {
  await openApp(page);
  await expect(dialog(page)).toHaveCount(0);
  // Open Period once so the app creates its normal stores before seeding them.
  await page.getByRole('button', { name: '生理期', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).map(db => db.name))).toContain('cozy-days-period');
  await persistentData(page, true);
  expect(await persistentData(page)).toEqual(fixtures);

  await publish(page, 2);
  await dialog(page).getByRole('button', { name: '稍后再说' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(releaseMarker(page)).toHaveAttribute('content', '1');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await update(page);
  await expect(releaseMarker(page)).toHaveAttribute('content', '2');
  expect(await persistentData(page)).toEqual(fixtures);

  await context.setOffline(true);
  await page.reload();
  await openTodos(page);
  await expect(addTodo(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  expect(await persistentData(page)).toEqual(fixtures);
});

test('competing tabs activate once and retain old assets until the tabs close', async ({ page, context }) => {
  await openApp(page);
  await addTodo(page).click();
  const text = '双标签页保留的待办';
  await page.getByRole('textbox', { name: '想做些什么？' }).fill(text);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const savedTodo = (tab: Page) => tab.getByRole('button', { name: '编辑：' + text });
  await expect(savedTodo(page)).toBeVisible();

  const other = await context.newPage();
  await openApp(other);
  await expect(savedTodo(other)).toBeVisible();
  let releaseActivation!: () => void;
  activationGate = new Promise<void>(resolve => { releaseActivation = resolve; });
  try {
    await publish(page, 2);
    await expect(dialog(other)).toBeVisible();
    await dialog(page).getByRole('button', { name: '立即更新' }).click();
    await expect.poll(() => activationRequests).toBe(1);
    await dialog(other).getByRole('button', { name: '立即更新' }).click();
    await expect(dialog(other)).toHaveCount(0);
    expect(activationRequests).toBe(1);
    await expect(releaseMarker(other)).toHaveAttribute('content', '1');
    const loaded = page.waitForEvent('load');
    releaseActivation();
    await loaded;
  } finally {
    releaseActivation();
  }
  await expect(releaseMarker(page)).toHaveAttribute('content', '2');
  await openTodos(page);
  await expect(savedTodo(page)).toBeVisible();
  await expect(savedTodo(other)).toBeVisible();
  await addTodo(other).click();
  const draft = other.getByRole('textbox', { name: '想做些什么？' });
  await draft.fill('未保存的草稿');

  await publish(page, 3);
  await expect(dialog(other)).toHaveCount(0);
  await update(page);
  await expect(releaseMarker(page)).toHaveAttribute('content', '3');
  await openTodos(page);
  await expect(savedTodo(page)).toBeVisible();
  await expect(draft).toHaveValue('未保存的草稿');
  await expect(releaseMarker(other)).toHaveAttribute('content', '1');
  expect(await other.evaluate(path => fetch(path).then(response => response.text()), assetPath(1))).toBe('1');

  await other.close();
  await page.close();
  const fresh = await context.newPage();
  await openApp(fresh);
  await expect.poll(() => fresh.evaluate(async () => (await caches.keys()).filter(key => key.startsWith('cozy-days-shell:')).map(key => key.slice(-2)))).toEqual(['-2', '-3']);
  await expect(savedTodo(fresh)).toBeVisible();
});

test('failed activation request leaves the old release usable and can be retried', async ({ page }) => {
  await page.clock.install();
  await openApp(page);
  activationFailure = true;
  await publish(page, 2);
  await dialog(page).getByRole('button', { name: '立即更新' }).click();
  await expect.poll(() => activationRequests).toBe(1);
  await page.clock.fastForward(15001);
  await expect(dialog(page).getByRole('alert')).toContainText('更新暂时没有完成', { timeout: 20000 });
  await expect(releaseMarker(page)).toHaveAttribute('content', '1');
  await dialog(page).getByRole('button', { name: '稍后再说' }).click();
  await addTodo(page).click();
  await page.getByRole('textbox', { name: '想做些什么？' }).fill('更新失败后保存的待办');
  await page.getByRole('button', { name: '保存', exact: true }).click();

  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await dialog(page).getByRole('button', { name: '立即更新' }).click();
  await expect.poll(() => activationRequests).toBe(2);
  await page.clock.fastForward(15001);
  await expect(dialog(page).getByRole('button', { name: '重试更新' })).toBeVisible({ timeout: 20000 });
  activationFailure = false;
  await update(page, '重试更新');
  await expect(releaseMarker(page)).toHaveAttribute('content', '2');
  await openTodos(page);
  await expect(page.getByRole('button', { name: '编辑：更新失败后保存的待办' })).toBeVisible();
  expect(activationRequests).toBe(3);
});
