import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const [port, device, exitGesture] = process.argv.slice(2);
assert.match(device, /^emulator-\d+$/, 'Use a dedicated test emulator');
const adb = (...args) => execFileSync('adb', ['-s', device, ...args], { encoding: 'utf8' });
const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 15000, noDefaults: true });
const page = browser.contexts()[0].pages().find(page => page.url().startsWith('https://localhost'));
assert.ok(page);
const keyboard = shown => page.waitForFunction(shown =>
  document.documentElement.hasAttribute('data-cozy-keyboard') === shown, shown, { timeout: 10000 });
const nav = name => page.getByRole('navigation', { name: '应用模块' }).getByRole('button', { name, exact: true });
const back = () => adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
const tap = async locator => {
  await locator.scrollIntoViewIfNeeded();
  const bounds = await locator.boundingBox();
  assert.ok(bounds);
  const ratio = await page.evaluate(() => devicePixelRatio);
  adb('shell', 'input', 'tap', String(Math.floor((bounds.x + bounds.width / 2) * ratio)),
    String(Math.floor((bounds.y + bounds.height / 2) * ratio)));
};
const assertAboveIme = async locator => {
  const info = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const app = document.querySelector('.app-shell').getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { top: rect.top, bottom: rect.bottom, viewportBottom: app.bottom,
      realVisibleBottom: visualViewport.offsetTop + visualViewport.height, hittable: element.contains(hit) };
  });
  assert.ok(info.top >= 0 && info.bottom <= Math.min(info.viewportBottom, info.realVisibleBottom) + 1 && info.hittable, JSON.stringify(info));
};
const edit = async (field, actions = []) => {
  await tap(field);
  await keyboard(true);
  await page.waitForTimeout(350);
  await assertAboveIme(field);
  for (const action of actions) await assertAboveIme(action);
};

try {
  await nav('首页').waitFor();
  const width = await page.evaluate(() => innerWidth);
  const initialHeight = await page.locator('.app-shell').evaluate(node => node.getBoundingClientRect().height);
  console.log('WebView:', await page.evaluate(() => navigator.userAgent), 'viewport:', width, initialHeight);
  await page.getByRole('button', { name: '添加待办', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建待办' });
  const field = dialog.getByRole('textbox', { name: '想做些什么？' });
  await edit(field, [dialog.getByRole('button', { name: '保存', exact: true }), dialog.getByRole('button', { name: '取消', exact: true })]);
  await field.fill('Android interaction QA draft');
  await edit(dialog.getByRole('textbox', { name: '计划时间' }), [dialog.getByRole('button', { name: '保存', exact: true })]);
  back();
  await keyboard(false);
  await dialog.waitFor();
  assert.equal(await field.inputValue(), 'Android interaction QA draft');
  await page.waitForFunction(height => Math.abs(document.querySelector('.app-shell').getBoundingClientRect().height - height) < 1, initialHeight);
  back();
  await dialog.getByRole('button', { name: '放弃修改', exact: true }).waitFor();
  back();
  await dialog.getByRole('button', { name: '放弃修改', exact: true }).waitFor({ state: 'detached' });
  await dialog.waitFor();
  back();
  await dialog.getByRole('button', { name: '放弃修改', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  console.log('PASS IME, todo scrolling and actions, viewport restoration, draft and warning steps');

  await page.getByRole('button', { name: '添加或管理分类' }).click();
  const category = page.getByRole('dialog', { name: '管理分类' });
  await edit(category.getByRole('textbox', { name: '分类名称' }), [category.getByRole('button', { name: '添加分类' })]);
  back();
  await keyboard(false);
  await category.waitFor();
  back();
  await category.waitFor({ state: 'detached' });
  console.log('PASS category keyboard and one-step back');

  await nav('纪念日').click();
  const search = page.getByRole('searchbox', { name: '搜索纪念日' });
  await edit(search);
  back();
  await keyboard(false);
  await search.waitFor();
  await page.getByRole('button', { name: '新增纪念日', exact: true }).click();
  const anniversary = page.getByRole('dialog', { name: '新增纪念日' });
  await edit(anniversary.getByRole('textbox', { name: '备注' }), [
    anniversary.getByRole('button', { name: '取消', exact: true }),
    anniversary.getByRole('button', { name: '保存纪念日', exact: true }),
  ]);
  back();
  await keyboard(false);
  back();
  await anniversary.waitFor({ state: 'detached' });
  console.log('PASS anniversary search, remarks, actions and two back events');

  await nav('首页').click();
  await page.getByRole('button', { name: '打开应用设置' }).click();
  await page.getByRole('button', { name: '周期信息', exact: true }).click();
  await page.getByRole('button', { name: '周期设置', exact: true }).click();
  const cycle = page.getByRole('dialog', { name: '周期设置与预测规则' });
  await edit(cycle.getByRole('spinbutton', { name: '默认经期长度（天）' }), [
    cycle.getByRole('button', { name: '保存周期设置' }),
    cycle.getByRole('button', { name: '关闭弹窗' }),
  ]);
  back();
  await keyboard(false);
  await cycle.waitFor();
  back();
  await cycle.waitFor({ state: 'detached' });
  await page.getByRole('heading', { name: '周期信息', exact: true }).waitFor();
  back();
  await page.getByRole('heading', { name: '设置', exact: true }).waitFor();
  back();
  await page.getByRole('button', { name: '打开应用设置' }).waitFor();
  console.log('PASS numeric IME and single-level nested back');

  const homeBack = exitGesture ? () => adb('shell', 'input', 'swipe', '1', '850', '220', '850', '180') : back;
  homeBack();
  assert.match(adb('shell', 'dumpsys', 'window'), /mCurrentFocus=.*com\.littledays\.capacitorexperiment/);
  homeBack();
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.doesNotMatch(adb('shell', 'dumpsys', 'window'), /mCurrentFocus=.*com\.littledays\.capacitorexperiment/);
  const logs = adb('logcat', '-d', '-s', 'Capacitor');
  assert.match(logs, /methodName: homeBack, methodData: \{"exit":false\}/);
  assert.match(logs, /methodName: homeBack, methodData: \{"exit":true\}/);
  console.log('PASS home first back prompts, second back closes the activity');
} finally {
  await browser.close();
}
