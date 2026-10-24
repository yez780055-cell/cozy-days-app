import { test, expect, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
  await expect(page.getByRole('button', { name:'新增纪念日', exact:true })).toBeEnabled();
}
async function failNextRead(page: Page) {
  await page.evaluate(async () => {
    const modulePath = '/src/data/database.ts';
    const { anniversaryRepository: repo } = await import(modulePath);
    const all = repo.all;
    repo.all = () => { repo.all = all; return Promise.reject(new Error('Injected post-commit read failure')); };
  });
}
async function rows(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/data/database.ts';
    return (await import(modulePath)).anniversaryRepository.all();
  });
}
async function fill(page: Page, name: string) {
  await page.getByRole('button', { name:'新增纪念日', exact:true }).click();
  const dialog = page.getByRole('dialog', { name:'新增纪念日', exact:true });
  await dialog.getByLabel('纪念日名称').fill(name);
  await dialog.getByLabel('日期', { exact:true }).fill('2026-10-23');
  return dialog;
}

test('新增提交成功后刷新失败：明确已保存，刷新重试不会重复新增', async ({ page }) => {
  await open(page);
  const dialog = await fill(page, '只收藏一次');
  await failNextRead(page);
  await dialog.getByRole('button', { name:'保存纪念日', exact:true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  // Capture the old failure mode in the baseline log, including a realistic save retry.
  if (await dialog.isVisible()) {
    console.log('REPRO save committed but dialog reports:', await page.getByRole('alert').innerText());
    await dialog.getByRole('button', { name:'保存纪念日', exact:true }).click();
    console.log('REPRO record count after save retry:', (await rows(page)).length);
  }
  expect(await rows(page)).toHaveLength(1);
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('alert')).toContainText('已保存');
  await page.getByRole('button', { name:'重新读取收藏', exact:true }).click();
  await expect(page.getByRole('alert')).not.toBeVisible();
  await expect(page.getByTestId('anniversary-card')).toHaveCount(1);
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
  await expect(page.getByTestId('anniversary-card')).toHaveCount(1);
});

test('删除提交成功后刷新失败：明确已删除并提供只读重试', async ({ page }) => {
  await open(page);
  const dialog = await fill(page, '只删除一次');
  await dialog.getByRole('button', { name:'保存纪念日', exact:true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name:'删除：只删除一次', exact:true }).click();
  await failNextRead(page);
  await page.getByRole('button', { name:'确认删除', exact:true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  console.log('Delete result with persisted count', (await rows(page)).length, await page.getByRole('alert').innerText());
  expect(await rows(page)).toHaveLength(0);
  await expect(page.getByRole('dialog', { name:'删除纪念日', exact:true })).not.toBeVisible();
  await expect(page.getByRole('alert')).toContainText('已删除');
  await page.getByRole('button', { name:'重新读取收藏', exact:true }).click();
  await expect(page.getByRole('alert')).not.toBeVisible();
  await expect(page.getByTestId('anniversary-card')).toHaveCount(0);
});

test('写入真正失败保留草稿，重试保存仅产生一条记录', async ({ page }) => {
  await open(page);
  const dialog = await fill(page, '可恢复的草稿');
  await page.evaluate(async () => {
    const modulePath = '/src/data/database.ts';
    const { anniversaryRepository: repo } = await import(modulePath);
    const save = repo.save;
    repo.save = () => { repo.save = save; return Promise.reject(new Error('Injected write failure')); };
  });
  await dialog.getByRole('button', { name:'保存纪念日', exact:true }).click();
  await expect(dialog.getByRole('alert')).toContainText('保存失败');
  await expect(dialog.getByLabel('纪念日名称')).toHaveValue('可恢复的草稿');
  expect(await rows(page)).toHaveLength(0);
  await dialog.getByRole('button', { name:'保存纪念日', exact:true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await rows(page)).toHaveLength(1);
});

test('同一事件循环连续提交时仅提交一次', async ({ page }) => {
  await open(page);
  const dialog = await fill(page, '防止连续提交');
  await page.evaluate(async () => {
    const modulePath = '/src/data/database.ts';
    const { anniversaryRepository: repo } = await import(modulePath);
    const save = repo.save;
    repo.save = async (value: unknown) => { await new Promise(resolve => setTimeout(resolve, 100)); return save(value); };
  });
  await dialog.locator('form').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true }));
    form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true }));
  });
  await expect(dialog).not.toBeVisible();
  expect(await rows(page)).toHaveLength(1);
});

test('首次读取失败禁新增，切换模块后恢复并保留旧记录', async ({ page }) => {
  await open(page);
  const dialog = await fill(page, '之前的收藏');
  await dialog.getByRole('button', { name:'保存纪念日', exact:true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name:'待办', exact:true }).click();
  await page.evaluate(async () => {
    const modulePath = '/src/data/database.ts';
    const { anniversaryRepository: repo } = await import(modulePath);
    repo.all = Object.assign(() => Promise.reject(new Error('Injected initial read failure')), { restore:repo.all });
  });
  await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
  await expect(page.getByRole('alert')).toContainText('暂时无法读取收藏');
  await expect(page.getByRole('button', { name:'新增纪念日', exact:true })).toBeDisabled();
  await page.evaluate(async () => {
    const modulePath = '/src/data/database.ts';
    const { anniversaryRepository: repo } = await import(modulePath);
    repo.all = repo.all.restore;
  });
  await page.getByRole('navigation').getByRole('button', { name:'待办', exact:true }).click();
  await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
  await expect(page.getByRole('button', { name:'新增纪念日', exact:true })).toBeEnabled();
  await expect(page.getByTestId('anniversary-card')).toContainText('之前的收藏');
});
