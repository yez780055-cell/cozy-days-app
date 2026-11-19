import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const stage = process.argv[2];
if (!['before', 'after', 'phase2', 'phase3', 'phase4', 'phase5'].includes(stage) || !process.argv[3]) {
  throw new Error('Usage: node tests/apricot-capture.mjs before|after|phase2|phase3|phase4|phase5 OUTPUT_DIRECTORY');
}
const destination = resolve(process.argv[3], stage);
const prototype = resolve(process.env.APRICOT_PROTOTYPE ?? '../warm-cozy-design');
const appUrl = process.env.APRICOT_APP_URL ?? 'http://127.0.0.1:5173';
const fixedTime = '2026-11-19T04:00:00Z';
const timezoneId = 'Asia/Shanghai';
const viewports = [{ width: 360, height: 740 }, { width: 393, height: 852 }, { width: 430, height: 932 }];
const routes = [['home', '首页'], ['todo', '待办'], ['period', '生理期'], ['ann', '纪念日'], ['settings', '设置']];
const tasks = ['买牛奶和燕麦', '给小饱梳毛', '整理周末出游清单', '晚饭后去散步', '给窗台的薄荷浇水'];
const events = ['我们搬进小家的日子', '小饱的生日', '第一次一起旅行'];

async function seed(page, dense) {
  await page.evaluate(async ({ tasks, events, dense }) => {
    const { database } = await import('/src/data/localDatabase.ts');
    const { periodRepository } = await import('/src/features/period/repository.ts');
    await database.open();
    const extraCategories = dense ? Array.from({ length: 18 }, (_, i) => '旅行分类' + (i + 1)) : [];
    const categoryNames = ['采购', ...extraCategories];
    await database.categories.bulkPut(categoryNames.map((name, i) => ({ id: 'sample-' + i, name, key: name, builtin: false, createdAt: 10 + i })));
    const todoRows = [...tasks, ...(dense ? ['长标题'.repeat(80)] : [])].map((text, i) => ({
      text, date: '2026-11-19', completed: i === 4, createdAt: i,
      ...(i < 5 ? { categoryId: i === 0 ? 'sample-0' : 'life', time: ['09:30', '12:00', '15:30', '19:00', '08:00'][i] } : {}),
    }));
    await database.todos.bulkAdd(todoRows);
    const photo = dense ? (() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#dda97f';
      ctx.fillRect(0, 0, 320, 180);
      ctx.fillStyle = '#674c67';
      ctx.fillRect(180, 0, 140, 180);
      return canvas.toDataURL('image/png');
    })() : undefined;
    await database.anniversaries.bulkAdd(events.map((name, i) => ({
      name: dense && i === 0 ? name.repeat(5) : name,
      date: ['2024-11-27', '2023-12-06', '2025-12-21'][i],
      theme: i === 1 ? '生日' : '生活', color: 'pink', icon: '♡', yearly: true,
      note: dense && i === 0 ? '合成长备注示例。'.repeat(65).slice(0, 500) : '',
      createdAt: i, updatedAt: i,
      ...(dense && i === 0 ? { backgroundImage: photo, backgroundX: 0.7, backgroundY: 0.4 } : {}),
    })));
    const existing = await periodRepository.load();
    await periodRepository.save({
      periods: [{ id: 'sample-period', start: '2026-11-01', end: '2026-11-05' }],
      days: {}, settings: { cycleLength: 28, periodLength: 5 },
    }, JSON.stringify(existing));
    if (dense) localStorage.setItem('cozy-days.font-family', 'xiaolai');
  }, { tasks, events, dense });
  await page.reload();
}

await mkdir(destination, { recursive: true });
const referenceFiles = ['app.html', 'app.js', 'components.html', 'tokens.css', 'app.css', 'warm.css', 'assets/room.png', 'assets/bedcats.png', 'assets/cats.png'];
const sha256 = Object.fromEntries(await Promise.all(referenceFiles.map(async file => [
  file, createHash('sha256').update(await readFile(join(prototype, file))).digest('hex'),
])));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const manifest = { stage, fixedTime, timezoneId, browser: browser.version(), sha256, routes, tasks, events, captures: [] };
async function capture(page, name, viewport) {
  if (stage === 'phase5') await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  const metrics = await page.evaluate(() => {
    const measure = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
        background: style.backgroundColor, backgroundImage: style.backgroundImage,
        color: style.color, font: style.fontFamily, fontSize: style.fontSize,
        padding: style.padding, borderRadius: style.borderRadius,
      };
    };
    return {
      dpr: devicePixelRatio, documentWidth: document.documentElement.scrollWidth,
      body: measure('body'), shell: measure('#phone,.phone'), nav: measure('nav'),
      selectedNav: measure('nav [aria-current="page"]'), title: measure('h1'),
      scroller: measure('main:not(.app-content, .phone),.home-page,.task-area,.period-page,.ann-page,.settings-page'),
      primary: measure('.primary,.button--primary'), field: measure('dialog input,.modal textarea'),
      dialog: measure('dialog[open],.modal'),
      home: {
        hero: measure('.hero,.home-scene'),
        cats: measure('.scene img,.home-cats'),
        stamp: measure('.stamp,.home-stamp'),
        shortcuts: measure('.quick button,.home-actions button'),
      },
      settings: {
        group: measure('.group,.settings-group'),
        groups: document.querySelectorAll('.group,.settings-group').length,
      },
      todo: {
        week: measure('.week,.todo-week'), row: measure('.task,.task-card'),
        viewControls: measure('.todo-view-controls'), category: measure('.filters,.category-row'),
        rowsInView: [...document.querySelectorAll('.task,.task-card')].filter(row => {
          const bounds = row.getBoundingClientRect();
          const nav = document.querySelector('nav').getBoundingClientRect();
          return bounds.top >= 0 && bounds.bottom <= nav.top;
        }).length,
      },
      period: {
        summary: measure('.cycle,.period-overview'),
        day: measure('.calendar button,.period-date'),
        marker: measure('.calendar button > span,.period-date > span'),
        pickerDay: measure('.period-end-dialog .period-date'),
        actual: measure('.calendar .actual > span,.period-date.actual > span'),
        forecast: measure('.calendar .forecast > span,.period-date.predicted > span'),
        diary: measure('.record,.period-daily'),
      },
      anniversary: {
        cover: measure('.book,.ann-featured'),
        ticket: measure('.ticket,.ann-ticket'),
        art: measure('.detailart,.ann-detail .ann-art'),
        preview: measure('.ann-modal .ann-art'),
        count: measure('.book .big,.ann-featured-count strong'),
      },
    };
  });
  const file = `${viewport.width}-${name}.png`;
  await page.screenshot({ path: join(destination, file), animations: 'disabled' });
  manifest.captures.push({ file, viewport, ...metrics });
}

try {
  for (const viewport of viewports) {
    const options = { viewport, deviceScaleFactor: 1, timezoneId, reducedMotion: 'reduce' };
    const reference = await browser.newContext(options);
    const gold = await reference.newPage();
    const goldUrl = pathToFileURL(join(prototype, 'app.html')).href + '?theme=gold';
    const referenceRoutes = stage === 'phase4' ? [['ann'], ['detail']]
      : stage === 'phase3' ? [['period']] : stage === 'phase2' ? [['todo']] : [...routes, ['detail']];
    for (const [route] of referenceRoutes) {
      await gold.goto(goldUrl + '#' + route);
      await gold.reload();
      await capture(gold, 'gold-' + route, viewport);
    }
    if (stage === 'phase3') {
      await gold.locator('.record').first().scrollIntoViewIfNeeded();
      await capture(gold, 'gold-period-diary', viewport);
    } else if (stage === 'phase4') {
      await gold.locator('[data-a^="event:"]').first().click();
      await capture(gold, 'gold-ann-editor', viewport);
    } else if (stage !== 'phase5') {
      await gold.goto(goldUrl + '#todo');
      await gold.reload();
      await gold.locator('[data-a="newTask"]').click();
      await capture(gold, 'gold-sheet', viewport);
      await gold.goto(goldUrl + '#todo');
      await gold.reload();
      await gold.locator('[data-a="task:1"]').click();
      await gold.locator('[data-a="remove:task:1"]').click();
      await capture(gold, 'gold-confirm', viewport);
      await gold.goto(pathToFileURL(join(prototype, 'components.html')).href + '?theme=gold');
      await capture(gold, 'gold-components', viewport);
    }
    await reference.close();

    for (const sample of stage === 'phase3' ? ['empty', 'gold-data'] : ['empty', 'gold-data', 'dense']) {
      const context = await browser.newContext(options);
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date(fixedTime));
      await page.goto(appUrl);
      if (sample !== 'empty') await seed(page, sample === 'dense');
      const appRoutes = stage === 'phase4' ? [['ann', '纪念日']]
        : stage === 'phase3' ? [['period', '生理期']] : stage === 'phase2' ? [['todo', '待办']] : routes;
      for (const [route, label] of appRoutes) {
        if (route === 'settings') {
          await page.getByRole('navigation').getByRole('button', { name: '首页', exact: true }).click();
          await page.locator('.home-settings').click();
        } else if (route !== 'home') {
          await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();
        }
        if (stage === 'phase2') await page.locator('.loading-message').waitFor({ state: 'hidden' });
        if (stage === 'phase3') await page.locator('.period-content').waitFor();
        if (stage === 'phase4') await page.locator('.ann-bar button[aria-label="新增纪念日"]:enabled').waitFor();
        if (stage === 'phase5') {
          if (route === 'home') await page.getByRole('heading', { name: '今日待办' }).waitFor();
          if (route === 'todo') await page.locator('.loading-message').waitFor({ state: 'hidden' });
          if (route === 'period') await page.locator('.period-content').waitFor();
          if (route === 'ann') await page.locator('.ann-bar button[aria-label="新增纪念日"]:enabled').waitFor();
        }
        await capture(page, sample + '-' + route, viewport);
        if (stage === 'phase5' && route === 'settings' && sample === 'gold-data') {
          await page.getByRole('button', { name: /外观与字体/ }).click();
          await capture(page, 'app-fonts', viewport);
          await page.getByRole('button', { name: '返回设置' }).click();
          await page.getByRole('button', { name: '周期信息', exact: true }).click();
          await page.locator('.cycle-info-page .period-summary').waitFor();
          await capture(page, 'app-cycle-info', viewport);
          await page.getByRole('button', { name: '返回设置' }).click();
          await page.getByRole('button', { name: '数据备份与恢复', exact: true }).click();
          await capture(page, 'app-backup', viewport);
          const json = await page.evaluate(async () => {
            const { exportBackup } = await import('/src/data/backup.ts');
            return (await exportBackup()).json;
          });
          await page.getByLabel('选择备份文件').setInputFiles({
            name: '小饱日常备份.json', mimeType: 'application/json', buffer: Buffer.from(json),
          });
          await page.getByRole('heading', { name: '确认导入' }).waitFor();
          await capture(page, 'app-backup-review', viewport);
        }
        if (stage === 'phase2' && sample === 'gold-data') {
          await page.getByRole('button', { name: '已完成 1', exact: true }).click();
          await capture(page, 'gold-data-todo-expanded', viewport);
          await page.getByRole('button', { name: '更多操作：买牛奶和燕麦', exact: true }).click();
          await capture(page, 'app-menu', viewport);
          await page.getByRole('button', { name: '删除：买牛奶和燕麦', exact: true }).click();
          await capture(page, 'app-live-confirm', viewport);
        }
        if (stage === 'phase3' && sample === 'gold-data') {
          const calendar = page.locator('.period-content > .period-calendar');
          await page.getByRole('button', { name:'点滴', exact:true }).click();
          await page.getByRole('button', { name:'腹痛', exact:true }).click();
          await page.getByRole('button', { name:'平静', exact:true }).click();
          await page.getByRole('button', { name:'平静', exact:true }).scrollIntoViewIfNeeded();
          await capture(page, 'app-period-diary', viewport);
          await calendar.getByRole('button', { name:/^2026-11-08/ }).click();
          await page.getByRole('switch', { name:'经期中' }).click();
          await capture(page, 'app-period-end-picker', viewport);
          await page.getByRole('dialog').getByRole('button', { name:'关闭弹窗' }).click();
          await page.getByRole('navigation').getByRole('button', { name:'首页', exact:true }).click();
          await page.getByRole('button', { name:'打开应用设置' }).click();
          await page.getByRole('button', { name:'周期信息', exact:true }).click();
          await page.locator('.cycle-info-page .period-summary').waitFor();
          await capture(page, 'app-cycle-info', viewport);
          await page.getByRole('button', { name:'周期设置', exact:true }).click();
          await capture(page, 'app-cycle-settings', viewport);
          await page.getByRole('dialog').getByRole('button', { name:'关闭弹窗' }).click();
          await page.getByRole('navigation').getByRole('button', { name:'生理期', exact:true }).click();
          await page.evaluate(async () => {
            const { periodRepository } = await import('/src/features/period/repository.ts');
            const data = await periodRepository.load();
            await periodRepository.save({ ...data, settings:{ ...data.settings, cycleLength:31 } }, JSON.stringify(data));
          });
          await page.getByRole('button', { name:'开心', exact:true }).click();
          await page.getByRole('button', { name:'恢复草稿版本', exact:true }).click();
          await capture(page, 'app-period-replace', viewport);
          await page.getByRole('button', { name:'取消替换' }).click();
          await page.getByRole('button', { name:'查看恢复备份' }).click();
          await page.getByText('查看完整内容', { exact:true }).first().click();
          await capture(page, 'app-period-recovery', viewport);
        }
        if (route === 'ann' && sample !== 'empty') {
          await page.getByRole('button', { name: new RegExp(events[0]) }).first().click();
          await capture(page, sample + '-detail', viewport);
          if (stage === 'phase4') {
            if (sample === 'gold-data') {
              await page.getByRole('button', {name:'编辑纪念日', exact:true}).click();
              await capture(page, 'app-ann-editor', viewport);
              await page.getByRole('dialog').getByRole('button', {name:'取消', exact:true}).click();
              await page.getByRole('button', {name:'删除纪念日', exact:true}).click();
              await capture(page, 'app-ann-delete', viewport);
              await page.getByRole('button', {name:'再想想', exact:true}).click();
            } else {
              await page.getByRole('button', {name:'更换或调整背景', exact:true}).click();
              await capture(page, 'app-ann-photo', viewport);
              await page.getByRole('dialog').getByRole('button', {name:'取消', exact:true}).click();
            }
            await page.getByRole('button', {name:'返回纪念日列表', exact:true}).click();
            await page.getByRole('button', {name:'网格视图', exact:true}).click();
            await capture(page, sample + '-ann-grid', viewport);
          }
        }
      }
      await context.close();
    }

    if (stage === 'phase3' || stage === 'phase4') continue;
    const components = await browser.newContext(options);
    const page = await components.newPage();
    await page.clock.setFixedTime(new Date(fixedTime));
    for (const scenario of ['components', 'add', 'edit', 'delete', 'undo']) {
      await page.goto(appUrl + '/?preview=1&scenario=' + scenario);
      await page.locator('.preview-selector').waitFor();
      if (['add', 'edit', 'delete'].includes(scenario)) await page.getByRole('dialog').waitFor();
      await capture(page, 'app-' + scenario, viewport);
      if (stage === 'phase2' && scenario === 'add') {
        for (const [name, label] of [['calendar', '选择归属日期'], ['time', '选择时间'], ['category', '所属分类']]) {
          const toggle = page.getByRole('button', { name: label, exact: true });
          await toggle.click();
          await capture(page, 'app-' + name, viewport);
          await toggle.click();
        }
      }
    }
    await components.close();
  }
} finally {
  await browser.close();
  await writeFile(join(destination, 'measurements.json'), JSON.stringify(manifest, null, 2));
}
