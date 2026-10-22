import { taskAction } from './task-actions';
import { test, expect, type Page } from '@playwright/test';

async function addTodo(page: Page, text: string, date?: string) {
  await page.getByRole('button', {name:'新增待办',exact:true}).click();
  const dialog = page.getByRole('dialog', {name:'新建待办',exact:true});
  await dialog.getByRole('textbox', {name:'想做些什么？'}).fill(text);
  if (date) await dialog.getByLabel('归属日期', {exact:true}).fill(date);
  await dialog.getByRole('button', {name:'保存',exact:true}).click();
  await expect(dialog).not.toBeVisible();
}
const card = (page: Page, text: string) => page.getByTestId('todo-card').filter({has:page.getByRole('button',{name:`编辑：${text}`,exact:true})});

test('新增、刷新保留、完成与准确撤销', async ({page}) => {
  await page.goto('/');
  await addTodo(page, '已经完成的第一件');
  await addTodo(page, '需要准确撤销的第二件');
  await page.reload();
  await expect(card(page, '需要准确撤销的第二件')).toBeVisible();
  await taskAction(page, '已经完成的第一件', 'complete');
  await expect(page.getByRole('button', {name:'已完成 1',exact:true})).toBeVisible();
  await taskAction(page, '需要准确撤销的第二件', 'complete');
  await expect(page.getByRole('button', {name:'已完成 2',exact:true})).toBeVisible();
  await page.getByRole('button', {name:'撤销',exact:true}).click();
  await expect(page.getByRole('button',{name:'编辑：需要准确撤销的第二件',exact:true})).toBeVisible();
  await page.getByRole('button', {name:'已完成 1',exact:true}).click();
  await expect(page.getByRole('button',{name:'编辑：已经完成的第一件',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', {name:'已完成 1',exact:true})).toBeVisible();
});

test('编辑多行内容、修改日期、删除取消和确认', async ({page}) => {
  await page.goto('/');
  await addTodo(page, '需要修改');
  await page.getByRole('button',{name:'编辑：需要修改',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'编辑待办'});
  await editor.getByRole('textbox', {name:'想做些什么？'}).fill('修改后的第一行\n这是一段会自动换行的第二行任务内容');
  await editor.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByText('修改后的第一行', {exact:false})).toBeVisible();
  await page.getByRole('button',{name:/^更多操作：修改后的第一行/}).click();
  await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button',{name:/^更多操作：修改后的第一行/}).click();
  await page.getByRole('button',{name:/^删除：修改后的第一行/}).click();
  await expect(page.getByTestId('todo-card')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('todo-card')).toHaveCount(0);
});

test('全部未完成包含过去与未来，日期日历与今天入口可操作', async ({page}) => {
  await page.goto('/');
  await addTodo(page,'过去仍未完成','2020-01-01');
  await addTodo(page,'未来的小计划','2030-01-01');
  await page.getByRole('button',{name:/^全部未完成/}).click();
  await expect(card(page,'过去仍未完成')).toBeVisible();
  await expect(card(page,'未来的小计划')).toBeVisible();
  await expect(page.getByRole('button',{name:'选择日期',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'选择日期',exact:true}).click();
  await page.getByRole('button',{name:'上个月',exact:true}).click();
  await page.getByRole('button',{name:'下个月',exact:true}).click();
  await page.getByRole('button',{name:'回到今天',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'前一天',exact:true}).click();
  await addTodo(page,'默认归属浏览日期');
  await expect(card(page,'默认归属浏览日期')).toBeVisible();
  await page.getByRole('button',{name:'今天',exact:true}).click();
  await expect(card(page,'默认归属浏览日期')).toHaveCount(0);
  await page.getByRole('button',{name:/^全部未完成/}).click();
  await page.getByRole('button',{name:'编辑：未来的小计划',exact:true}).click();
  await page.getByLabel('归属日期',{exact:true}).fill('2020-01-01');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(card(page,'未来的小计划')).toContainText('1月1日');
});

test('空内容不能保存，弹窗焦点与模块入口', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'新增待办',exact:true}).click();
  await expect(page.getByRole('button',{name:'保存',exact:true})).toBeDisabled();
  await page.getByRole('textbox', {name:'想做些什么？'}).fill('   ');
  await expect(page.getByRole('button',{name:'保存',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'生理期',exact:true}).click();
  await expect(page.getByRole('heading',{name:'生理期日历'})).toBeVisible();
  await page.getByRole('button',{name:'纪念日',exact:true}).click();
  await expect(page.getByRole('heading',{name:'纪念日'})).toBeVisible();
  await page.getByRole('button',{name:'待办',exact:true}).click();
  await expect(page.getByRole('button',{name:'新增待办',exact:true})).toBeVisible();
});

test('页面加载后断网仍可新增，恢复网络刷新后保留', async ({page,context}) => {
  await page.goto('/');
  await expect(page.getByRole('button',{name:'新增待办',exact:true})).toBeVisible();
  await context.setOffline(true);
  await addTodo(page,'离线记下的一件小事');
  await expect(card(page,'离线记下的一件小事')).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(card(page,'离线记下的一件小事')).toBeVisible();
});

test('两种手机尺寸：长列表滚动、导航与截图', async ({page}) => {
  test.setTimeout(60_000);
  const errors:string[]=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.goto('/');
  for (const text of ['准备下周的设计稿','整理一下房间','看一本喜欢的书','晚上做十分钟拉伸']) await addTodo(page,text);
  for (const viewport of [{width:360,height:740},{width:430,height:932}]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByTestId('todo-card')).toHaveCount(4);
    await page.locator('.phone').evaluate(element => Promise.all(element.getAnimations({subtree:true}).map(animation => animation.finished.catch(() => {}))));
    await page.screenshot({path:`artifacts/todo-${viewport.width}x${viewport.height}.png`});
    await page.goto('/?preview=1&scenario=normal');
    await page.getByLabel('开发状态',{exact:true}).selectOption('long');
    const list=page.getByRole('region',{name:'待办列表',exact:true});
    await list.evaluate(element=>{element.scrollTop=element.scrollHeight;});
    await expect(page.getByRole('button',{name:'纪念日',exact:true})).toBeInViewport();
    await expect(page.getByRole('button',{name:'新增待办',exact:true})).toBeInViewport();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth',viewport.width);
  }
  expect(errors).toEqual([]);
});

test('状态预览、模态框与键盘可视高度模拟', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/?preview=1&scenario=empty');
  await page.screenshot({path:'artifacts/empty-390x844.png'});
  const select=page.getByLabel('开发状态',{exact:true});
  await select.selectOption('completed');
  await expect(page.getByText('太棒了，都完成啦！')).toBeVisible();
  await page.screenshot({path:'artifacts/completed-390x844.png'});
  await select.selectOption('add');
  await expect(page.getByRole('dialog',{name:'新建待办'})).toBeVisible();
  await page.locator('.modal').evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished)));
  await page.screenshot({path:'artifacts/add-390x844.png'});
  await page.setViewportSize({width:390,height:440});
  await page.getByRole('textbox', {name:'想做些什么？'}).fill('模拟键盘缩小可视区');
  await expect(page.getByRole('textbox', {name:'想做些什么？'})).toBeInViewport();
  await expect(page.getByRole('button',{name:'保存',exact:true})).toBeInViewport();
  await page.screenshot({path:'artifacts/keyboard-height-simulation.png'});
  await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  for(const scenario of ['edit','delete','undo','components']) {
    await select.selectOption(scenario);
    if(scenario==='edit') await expect(page.getByRole('dialog',{name:'编辑待办'})).toBeVisible();
    if(scenario==='delete') await expect(page.getByRole('dialog',{name:'删除这件待办？'})).toBeVisible();
    if(scenario==='undo') await expect(page.getByRole('button',{name:'撤销',exact:true})).toBeVisible();
    if(scenario==='components') await expect(page.getByRole('button',{name:'禁用',exact:true})).toBeDisabled();
    // Switch states through a fresh URL so a modal never blocks the preview control.
    if(scenario==='edit'||scenario==='delete') await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
  }
});

test('减少动态效果偏好与桌面设备切换',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:1280,height:1000});
  await page.goto('/?preview=1&scenario=normal');
  await page.getByRole('button',{name:'小屏 360 × 740'}).click();
  await expect(page.locator('.phone')).toHaveCSS('width','360px');
  await page.getByRole('button',{name:'大屏 430 × 932'}).click();
  await expect(page.locator('.phone')).toHaveCSS('width','430px');
  await page.screenshot({path:'artifacts/desktop-preview.png'});
  await page.getByRole('button',{name:'新增待办',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'新建待办'})).toBeVisible();
});
