import { expect, test, type Locator, type Page } from '@playwright/test';
import { openPeriod, openPeriodEditor } from '../tests/period-actions';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const area = { top: 27, right: 0, bottom: 24, left: 0, keyboardVisible: false, keyboardViewportHeight: 0 };
    const exitCalls: boolean[] = [];
    Object.assign(window, {
      exitCalls,
      androidBridge: {},
      Capacitor: {
        PluginHeaders: [{
          name: 'CozyAndroidShell',
          methods: ['getSafeArea', 'ready', 'homeBack', 'updateInfo'].map(name => ({ name, rtype: 'promise' })),
        }],
        nativePromise: (_: string, method: string, options: { exit: boolean }) => {
          if (method === 'getSafeArea') return Promise.resolve(area);
          if (method === 'homeBack') exitCalls.push(options.exit);
          if (method === 'updateInfo') return Promise.resolve({ shell: 3, web: 1 });
          return Promise.resolve();
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-cozy-android', '');
});

const back = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('cozy-android-back')));
const exitCalls = (page: Page) => page.evaluate(() => (window as unknown as { exitCalls: boolean[] }).exitCalls);
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: '应用模块' }).getByRole('button', { name, exact: true });

async function keyboard(page: Page, shown: boolean, chromiumResizes = false, height = 420) {
  await page.evaluate(({ shown, chromiumResizes, height }) => {
    if (window.visualViewport) {
      Object.defineProperty(window.visualViewport, 'height', {
        configurable: true,
        value: shown && chromiumResizes ? height : 740,
      });
    }
    window.dispatchEvent(new CustomEvent('cozy-safe-area', { detail: {
      top: 27, right: 0, bottom: shown ? 0 : 24, left: 0,
      keyboardVisible: shown, keyboardViewportHeight: shown ? height : 0,
    }}));
  }, { shown, chromiumResizes, height });
  await expect(page.locator('html')).toHaveCSS('--android-visible-height', shown ? `${height}px` : '740px');
}

async function fullyVisible(control: Locator, limit = 420) {
  await expect(control).toBeVisible();
  const measure = () => control.evaluate((element, bottom) => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    const panel = element.closest('.modal');
    return {
      visible: bounds.top >= 0 && bounds.bottom <= bottom + 1 && element.contains(hit),
      top: bounds.top, bottom: bounds.bottom, hit: hit?.className,
      active: document.activeElement?.id, scroll: panel?.scrollTop,
      panelBottom: panel?.getBoundingClientRect().bottom,
      actionsTop: panel?.querySelector('.modal-actions')?.getBoundingClientRect().top,
    };
  }, limit);
  await expect.poll(async () => {
    const state = await measure();
    return state.visible ? 'visible' : JSON.stringify(state);
  }).toBe('visible');
}

test('todo fields scroll within the sheet while Save and Cancel stay above the keyboard', async ({ page }) => {
  await page.getByRole('button', { name: '添加待办', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '新建待办' });
  const text = editor.getByRole('textbox', { name: '想做些什么？' });
  await text.fill('键盘测试草稿');
  await keyboard(page, true);
  await fullyVisible(text);
  await fullyVisible(editor.getByRole('button', { name: '保存', exact: true }));
  await fullyVisible(editor.getByRole('button', { name: '取消', exact: true }));
  const time = editor.getByRole('textbox', { name: '计划时间' });
  await time.focus();
  await fullyVisible(time);
  await keyboard(page, true, true, 230);
  await fullyVisible(time, 230);
  await fullyVisible(editor.getByRole('button', { name: '保存', exact: true }), 230);
  await fullyVisible(editor.getByRole('button', { name: '取消', exact: true }), 230);
  await keyboard(page, false);
  await expect(text).toHaveValue('键盘测试草稿');
  await expect(nav(page, '待办')).toBeVisible();
});

test('search, anniversary remarks, category names and numeric fields remain reachable', async ({ page }) => {
  await nav(page, '纪念日').click();
  const search = page.getByRole('searchbox', { name: '搜索纪念日' });
  await search.fill('搜索测试');
  await keyboard(page, true, true);
  await fullyVisible(search);
  await keyboard(page, false);
  await page.getByRole('button', { name: '新增纪念日', exact: true }).click();
  const anniversary = page.getByRole('dialog', { name: '新增纪念日' });
  await anniversary.getByRole('textbox', { name: '纪念日名称' }).fill('测试纪念日');
  const note = anniversary.getByRole('textbox', { name: '备注' });
  await note.fill('保留备注');
  await keyboard(page, true, true);
  await fullyVisible(note);
  await fullyVisible(anniversary.getByRole('button', { name: '保存纪念日' }));
  await fullyVisible(anniversary.getByRole('button', { name: '取消' }));
  await keyboard(page, false);
  await expect(note).toHaveValue('保留备注');
  await back(page);
  await anniversary.getByRole('button', { name: '放弃修改' }).click();

  await nav(page, '待办').click();
  await page.getByRole('button', { name: '添加或管理分类' }).click();
  const categories = page.getByRole('dialog', { name: '管理分类' });
  const name = categories.getByRole('textbox', { name: '分类名称' });
  await name.fill('新分类');
  await keyboard(page, true);
  await fullyVisible(name);
  await fullyVisible(categories.getByRole('button', { name: '添加分类' }));
  await keyboard(page, false);
  await back(page);
  await expect(categories).toHaveCount(0);

  await nav(page, '首页').click();
  await page.getByRole('button', { name: '打开应用设置' }).click();
  await page.getByRole('button', { name: '周期信息' }).click();
  await page.getByRole('button', { name: '周期设置', exact: true }).click();
  const cycle = page.getByRole('dialog', { name: '周期设置与预测规则' });
  const number = cycle.getByRole('spinbutton', { name: '默认经期长度（天）' });
  await number.focus();
  await keyboard(page, true);
  await fullyVisible(number);
  await fullyVisible(cycle.getByRole('button', { name: '保存周期设置' }));
  await fullyVisible(cycle.getByRole('button', { name: '关闭弹窗' }));
});

test('Back dismisses only the active picker, warning, editor or page at a time', async ({ page }) => {
  await page.getByRole('button', { name: '添加待办', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '新建待办' });
  await editor.getByRole('textbox', { name: '想做些什么？' }).fill('仍在编辑');
  await editor.getByRole('button', { name: '选择归属日期' }).click();
  await expect(editor.getByRole('group', { name: '归属日期日历' })).toBeVisible();
  await back(page);
  await expect(editor.getByRole('group', { name: '归属日期日历' })).toHaveCount(0);
  await back(page);
  await expect(editor.getByText('还有未保存的修改，是否放弃？')).toBeVisible();
  await back(page);
  await expect(editor.getByText('还有未保存的修改，是否放弃？')).toHaveCount(0);
  await expect(editor.getByRole('textbox', { name: '想做些什么？' })).toHaveValue('仍在编辑');
  await back(page);
  await editor.getByRole('button', { name: '放弃修改' }).click();
  await expect(nav(page, '待办')).toHaveAttribute('aria-current', 'page');
  await back(page);
  await expect(nav(page, '首页')).toHaveAttribute('aria-current', 'page');
  expect(await exitCalls(page)).toEqual([]);
});

test('Back returns from cycle settings one level at a time and requires two recent presses to exit', async ({ page }) => {
  await page.getByRole('button', { name: '打开应用设置' }).click();
  await page.getByRole('button', { name: '周期信息' }).click();
  await page.getByRole('button', { name: '周期设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '周期设置与预测规则' });
  await expect(dialog).toBeVisible();
  await back(page);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '周期信息', exact: true })).toBeVisible();
  await back(page);
  await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
  await back(page);
  await expect(page.getByRole('button', { name: '打开应用设置' })).toBeVisible();
  expect(await exitCalls(page)).toEqual([]);
  await page.clock.install();
  await back(page);
  await expect.poll(() => exitCalls(page)).toEqual([false]);
  await page.clock.fastForward(2100);
  await back(page);
  await expect.poll(() => exitCalls(page)).toEqual([false, false]);
  await back(page);
  await expect.poll(() => exitCalls(page)).toEqual([false, false, true]);
});

test('Back from the history editor returns to history before leaving cycle information', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-19T12:00:00+08:00'));
  await openPeriod(page);
  await page.getByRole('switch', { name: '经期中', exact: true }).click();
  await expect(page.locator('.period-storage')).toBeEmpty();
  await openPeriodEditor(page, '2026-11-19');
  await expect(page.getByRole('dialog', { name: '修改经期记录' })).toBeVisible();
  await back(page);
  await expect(page.getByRole('dialog', { name: '历史经期记录' })).toBeVisible();
  await back(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '周期信息', exact: true })).toBeVisible();
});
