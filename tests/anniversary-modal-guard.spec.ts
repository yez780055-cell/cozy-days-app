import { test, expect } from '@playwright/test';

for(const operation of ['save','remove'] as const) test(`anniversary ${operation}: busy close attempt cannot lock dialog after a failed write`,async({page})=>{
  await page.setViewportSize({width:393,height:852});await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'纪念日',exact:true}).click();
  await page.getByRole('button',{name:'新增纪念日',exact:true}).click();await page.getByLabel('纪念日名称').fill('关闭守护测试');await page.getByRole('button',{name:'保存纪念日',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:operation==='save'?'编辑：关闭守护测试':'删除：关闭守护测试',exact:true}).click();
  await page.evaluate(async operation=>{const path='/src/data/database.ts';const {anniversaryRepository}=await import(path);anniversaryRepository[operation]=()=>new Promise((_,reject)=>{(window as unknown as {failWrite:()=>void}).failWrite=()=>reject(new Error('Synthetic delayed failure'));});},operation);
  const dialog=page.getByRole('dialog');
  if(operation==='save')await page.getByLabel('纪念日名称').fill('未保存的修改');
  await dialog.getByRole('button',{name:operation==='save'?'保存纪念日':'确认删除',exact:true}).click();
  await dialog.getByRole('button',{name:'关闭弹窗',exact:true}).click();
  await page.waitForTimeout(350);await expect(dialog).toBeVisible();
  await page.evaluate(()=>(window as unknown as {failWrite:()=>void}).failWrite());await expect(dialog.getByRole('alert')).toContainText(operation==='save'?'保存失败':'删除失败');
  await page.screenshot({path:`artifacts/integration/m5-modal-guard/${operation}-failure.png`});
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:operation==='save'?'编辑：关闭守护测试':'删除：关闭守护测试',exact:true}).click();await expect(dialog).toBeVisible();
  // Start closing while idle, then begin a write during the close animation.
  await dialog.evaluate((el,operation)=>{(el.querySelector('[aria-label="关闭弹窗"]') as HTMLButtonElement).click();if(operation==='save')(el.querySelector('form') as HTMLFormElement).requestSubmit();else Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='确认删除')!.click();},operation);
  await page.waitForTimeout(350);await expect(dialog).toBeVisible();
  await page.evaluate(()=>(window as unknown as {failWrite:()=>void}).failWrite());await expect(dialog.getByRole('alert')).toContainText(operation==='save'?'保存失败':'删除失败');
  await dialog.getByRole('button',{name:'关闭弹窗',exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:operation==='save'?'编辑：关闭守护测试':'删除：关闭守护测试',exact:true}).click();
  await page.locator('.modal-backdrop').click({position:{x:20,y:20}});await expect(dialog).toHaveCount(0);
});
