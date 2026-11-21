import { chooseDate } from './anniversary-actions';
import { test, expect, type Page } from '@playwright/test';
async function add(page:Page,name:string,date:string,yearly:boolean) {
 await page.getByRole('button',{name:'新增纪念日',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'新增纪念日'});
 await dialog.getByLabel('纪念日名称').fill(name);
 await chooseDate(dialog, date);
 await dialog.getByLabel('每年重复').setChecked(yearly);
 await dialog.getByRole('button',{name:'保存纪念日'}).click();
 await expect(dialog).toHaveCount(0);
}
test.beforeEach(async({page})=>{
 await page.clock.setFixedTime(new Date('2026-02-20T04:00:00Z'));
 await page.goto('/');
 await page.getByRole('navigation').getByRole('button',{name:'纪念日'}).click();
});
test('sort, repeat, leap day, shared dates and editing',async({page})=>{
 await expect(page.getByText('还没有纪念日', { exact: true })).toBeVisible();
 await add(page,'过去','2026-02-01',false);
 await add(page,'闰日','2020-02-29',true);
 await add(page,'当天甲','2026-02-20',false);
 await add(page,'当天乙','2026-02-20',true);
 const cards=page.getByTestId('anniversary-card');
 await expect(cards).toHaveCount(4);
 await expect(cards.nth(0)).toContainText('当天甲');
 await expect(cards.nth(1)).toContainText('当天乙');
 await expect(cards.nth(2)).toContainText('闰日');
 await expect(cards.nth(2)).toContainText('8');
 await expect(cards.nth(3)).toContainText('过去');
 const menu = page.getByRole('button', { name:'纪念日菜单', exact:true });
 await menu.click();
 await page.getByRole('button',{name:'已过去',exact:true}).click();
 await expect(cards).toHaveCount(1);
 await expect(cards.first()).toContainText('过去');
 await page.getByRole('button',{name:'清除筛选：已过去'}).click();
 await page.getByRole('button',{name:'查看详情：闰日'}).click();
 await expect(page.getByText('纪念日期 · 2026-02-28')).toBeVisible();
 await page.getByRole('button',{name:'编辑纪念日',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'编辑纪念日'}).getByRole('button',{name:'选择日期',exact:true})).toContainText('2020 / 02 / 29');
 await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();
 await page.reload();
 await page.getByRole('navigation').getByRole('button',{name:'纪念日'}).click();
 await expect(cards).toHaveCount(4);
});
for(const width of [360,390,430]) test('mobile '+width,async({page})=>{
 await page.setViewportSize({width,height:800});
 await add(page,'重要的日子','2026-02-21',false);
 await expect(page.getByTestId('anniversary-card')).toBeVisible();
 expect(await page.locator('.ann-page').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await expect(page.locator('.ann-date-panel')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'新增纪念日',exact:true})).toBeVisible();
});
