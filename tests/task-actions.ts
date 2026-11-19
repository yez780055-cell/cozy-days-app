import { expect, type Page } from '@playwright/test';
export function openTodos(page: Page) {
  return page.getByRole('navigation').getByRole('button', { name: '待办', exact: true }).click();
}

export async function taskAction(page: Page, text: string, action: 'complete'|'restore'|'delete') {
  await page.getByRole('button',{name:`更多操作：${text}`,exact:true}).click();
  const name=`${action==='delete'?'删除':action==='restore'?'恢复':'完成'}：${text}`;
  await page.getByRole('button',{name,exact:true}).click();
  await expect(page.getByRole('dialog',{name:'这件小事'})).not.toBeVisible();
  if (action === 'delete') {
    const confirm = page.getByRole('dialog', { name: '删除这件待办？' });
    await confirm.getByRole('button', { name: '确认删除' }).click();
    await expect(confirm).toHaveCount(0);
  }
}
