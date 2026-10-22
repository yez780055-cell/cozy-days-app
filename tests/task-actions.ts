import { expect, type Page } from '@playwright/test';
export async function taskAction(page: Page, text: string, action: 'complete'|'restore'|'delete') {
  await page.getByRole('button',{name:`更多操作：${text}`,exact:true}).click();
  const name=`${action==='delete'?'删除':action==='restore'?'恢复':'完成'}：${text}`;
  await page.getByRole('button',{name,exact:true}).click();
  await expect(page.getByRole('dialog',{name:'这件小事'})).not.toBeVisible();
}
