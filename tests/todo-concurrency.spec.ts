import { test, expect, type Page } from '@playwright/test';
import { openTodos, taskAction } from './task-actions';

const conflict = '这条待办已发生变化或被删除';
async function add(page: Page, text: string, category?: string) {
  await page.getByRole('button', { name: '新增待办', exact: true }).click();
  const form = page.getByRole('dialog', { name: '新建待办', exact: true });
  await form.getByRole('textbox', { name: '想做些什么？' }).fill(text);
  if (category) {
    await form.getByRole('button', { name: '所属分类', exact: true }).click();
    await form.getByRole('group', { name: '选择所属分类' }).getByRole('button', { name: category, exact: true }).click();
  }
  await form.getByRole('button', { name: '保存', exact: true }).click();
  await expect(form).toHaveCount(0);
}

async function categoryManager(page: Page) {
  await page.getByRole('button', { name: '添加或管理分类', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '管理分类', exact: true })).toBeVisible();
}
async function closeManager(page: Page) {
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function createCategory(page: Page, name: string) {
  await categoryManager(page);
  await page.getByRole('textbox', { name: '分类名称' }).fill(name);
  await page.getByRole('button', { name: '添加分类', exact: true }).click();
  await expect(page.getByRole('button', { name: `修改分类：${name}`, exact: true })).toBeVisible();
  await closeManager(page);
}
async function deleteCategory(page: Page, name: string) {
  await categoryManager(page);
  await page.getByRole('button', { name: `删除分类：${name}`, exact: true }).click();
  await page.getByRole('button', { name: '确认删除分类', exact: true }).click();
  await expect(page.getByRole('button', { name: `修改分类：${name}`, exact: true })).toHaveCount(0);
  await closeManager(page);
}
async function storedTodos(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/data/localDatabase.ts';
    return (await import(path)).database.todos.toArray();
  });
}
async function completeCommitted(page: Page, text: string) {
  await taskAction(page, text, 'complete');
  // Closing the action menu precedes the animation and business transaction.
  await expect.poll(async () => (await storedTodos(page)).find((row: { text: string }) => row.text === text)?.completed).toBe(true);
  await expect(page.locator('.undo-toast').filter({ hasText: text })).toBeVisible();
}

test('local category deletion before completion permits completion undo', async ({ page }) => {
  await page.goto('/'); await openTodos(page);
  await createCategory(page, '临时分类');
  await add(page, '本机分类迁移后完成', '临时分类');
  await deleteCategory(page, '临时分类');
  await completeCommitted(page, '本机分类迁移后完成');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑：本机分类迁移后完成', exact: true })).toBeVisible();
  expect((await storedTodos(page))[0]).toMatchObject({ completed: false, categoryId: 'life' });
});

test('restoring a deleted task uses its normalized category for the next undo', async ({ page }) => {
  await page.goto('/'); await openTodos(page);
  await createCategory(page, '临时分类');
  await add(page, '连续撤销的任务', '临时分类');
  await completeCommitted(page, '连续撤销的任务');
  await page.getByRole('button', { name: '已完成 1', exact: true }).click();
  await taskAction(page, '连续撤销的任务', 'delete');
  await deleteCategory(page, '临时分类');
  await page.getByRole('button', { name: '撤销', exact: true }).last().click();
  await expect.poll(async () => (await storedTodos(page))[0]?.categoryId).toBe('life');
  expect((await storedTodos(page))[0]).toMatchObject({ completed: true, categoryId: 'life' });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑：连续撤销的任务', exact: true })).toBeVisible();
  expect((await storedTodos(page))[0]).toMatchObject({ completed: false, categoryId: 'life' });
});

test('failed category migration keeps the previous undo baseline and rolls back its writes', async ({ page }) => {
  await page.goto('/'); await openTodos(page);
  await createCategory(page, '保留分类');
  await add(page, '失败后仍可撤销', '保留分类');
  await completeCommitted(page, '失败后仍可撤销');
  const before = await storedTodos(page);
  await page.evaluate(async () => {
    const path = '/src/data/localDatabase.ts'; const { database } = await import(path);
    const remove = database.categories.delete;
    database.categories.delete = async (id: string) => {
      database.categories.delete = remove;
      await remove.call(database.categories, id);
      throw new Error('Synthetic failure after category deletion');
    };
  });
  await categoryManager(page);
  await page.getByRole('button', { name: '删除分类：保留分类', exact: true }).click();
  await page.getByRole('button', { name: '确认删除分类', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('分类暂时无法删除');
  expect(await storedTodos(page)).toEqual(before);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('button', { name: '修改分类：保留分类', exact: true })).toBeVisible();
  await closeManager(page);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑：失败后仍可撤销', exact: true })).toBeVisible();
  expect((await storedTodos(page))[0]).toMatchObject({ completed: false, categoryId: before[0].categoryId });
});

for (const changed of ['category', 'text'] as const) test(`cloud ${changed} change cannot be blessed by a later local category deletion`, async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开应用设置' })).toBeVisible();
  await page.evaluate(async () => {
    const localPath = '/src/data/localDatabase.ts', storePath = '/src/data/cloudStore.ts';
    const local = await import(localPath), { applyPull } = await import(storePath);
    await local.openCloudDatabase({ userId: 'synthetic-user', spaceId: 'undo-cloud', members: 2 });
    await local.database.categories.bulkPut([
      { id: 'life', name: '生活', key: '生活', builtin: false, createdAt: 1 },
      { id: 'work', name: '工作', key: '工作', builtin: false, createdAt: 2 },
    ]);
    await applyPull([{ kind: 'todo', id: '42', version: 1, value: {
      id: 42, text: '远端修改前', date: new Date().toLocaleDateString('sv-SE'), completed: false, createdAt: 1, categoryId: 'work',
    } }]);
  });
  await openTodos(page);
  await completeCommitted(page, '远端修改前');
  await page.evaluate(async changed => {
    const storePath = '/src/data/cloudStore.ts', localPath = '/src/data/localDatabase.ts';
    const { nextAttempt, acceptPush, applyPull } = await import(storePath);
    const { database } = await import(localPath);
    const pending = await nextAttempt();
    if (!pending || pending.kind !== 'todo') throw new Error('Expected the completion outbox entry');
    await acceptPush(pending.kind, pending.id, pending.attempt.operation, { status: 'applied', version: 2, value: pending.attempt.value });
    const current = await database.todos.get(42);
    await applyPull([{ kind: 'todo', id: '42', version: 3, value: {
      ...current, ...(changed === 'category' ? { categoryId: 'life' } : { text: '远端新文本' }),
    } }]);
  }, changed);
  // The local transaction may normalize category, but must not authorize remote changes.
  await deleteCategory(page, '工作');
  const before = await page.evaluate(async () => {
    const path = '/src/data/localDatabase.ts'; const { database } = await import(path);
    return { row: await database.todos.get(42), records: await database.syncRecords.toArray(), conflicts: await database.syncConflicts.toArray() };
  });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: conflict }).first()).toBeVisible();
  const after = await page.evaluate(async () => {
    const path = '/src/data/localDatabase.ts'; const { database } = await import(path);
    return { row: await database.todos.get(42), records: await database.syncRecords.toArray(), conflicts: await database.syncConflicts.toArray() };
  });
  expect(after).toEqual(before);
  expect(after.row).toMatchObject({ completed: true, categoryId: 'life', text: changed === 'text' ? '远端新文本' : '远端修改前' });
});

test('an old editor preserves its draft and another tab’s saved content', async ({ page, context }) => {
  await page.goto('/');
  await openTodos(page);
  await add(page, '打开时的内容');
  await page.getByRole('button', { name: '编辑：打开时的内容', exact: true }).click();
  const oldForm = page.getByRole('dialog', { name: '编辑待办', exact: true });
  await oldForm.getByRole('textbox', { name: '想做些什么？' }).fill('尚未保存的旧草稿');
  const other = await context.newPage();
  await other.goto('/');
  await openTodos(other);
  await other.getByRole('button', { name: '编辑：打开时的内容', exact: true }).click();
  const newForm = other.getByRole('dialog', { name: '编辑待办', exact: true });
  await newForm.getByRole('textbox', { name: '想做些什么？' }).fill('另一标签已保存');
  await newForm.getByRole('button', { name: '保存', exact: true }).click();
  await expect(newForm).toHaveCount(0);
  await oldForm.getByRole('button', { name: '保存', exact: true }).click();
  await expect(oldForm).toContainText(conflict);
  await expect(oldForm.getByRole('textbox', { name: '想做些什么？' })).toHaveValue('尚未保存的旧草稿');
  await other.reload();
  await openTodos(other);
  await expect(other.getByRole('button', { name: '编辑：另一标签已保存', exact: true })).toBeVisible();
});

test('undo refuses to overwrite a later edit after completion', async ({ page }) => {
  await page.goto('/');
  await openTodos(page);
  await add(page, '完成后又修改');
  await completeCommitted(page, '完成后又修改');
  await page.evaluate(async () => {
    const path = '/src/data/database.ts';
    const { todoRepository, todoBaseline } = await import(path);
    const row = (await todoRepository.all()).find((row: { text: string }) => row.text === '完成后又修改');
    await todoRepository.update(row.id, { text: '更新后的已完成内容' }, todoBaseline(row));
  });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: conflict }).first()).toBeVisible();
  const stored = await page.evaluate(async () => {
    const path = '/src/data/database.ts';
    return (await (await import(path)).todoRepository.all())[0];
  });
  expect(stored).toMatchObject({ text: '更新后的已完成内容', completed: true });
});

test('an editor opened before cloud pull keeps its input and does not queue a false write or conflict', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开应用设置' })).toBeVisible();
  await page.evaluate(async () => {
    const localPath = '/src/data/localDatabase.ts', storePath = '/src/data/cloudStore.ts';
    const local = await import(localPath);
    const { applyPull } = await import(storePath);
    await local.openCloudDatabase({ userId: 'synthetic-user', spaceId: 'synthetic-space', members: 2 });
    await local.database.categories.put({ id: 'life', name: '生活', key: '生活', builtin: false, createdAt: 1 });
    await applyPull([{ kind: 'todo', id: '42', version: 1, value: {
      id: 42, text: '云端初始内容', date: new Date().toLocaleDateString('sv-SE'), completed: false, createdAt: 1, categoryId: 'life',
    } }]);
  });
  await openTodos(page);
  await page.getByRole('button', { name: '编辑：云端初始内容', exact: true }).click();
  const form = page.getByRole('dialog', { name: '编辑待办', exact: true });
  await form.getByRole('textbox', { name: '想做些什么？' }).fill('旧表单的未保存草稿');
  const before = await page.evaluate(async () => {
    const localPath = '/src/data/localDatabase.ts', storePath = '/src/data/cloudStore.ts';
    const { database } = await import(localPath);
    const { applyPull } = await import(storePath);
    const row = await database.todos.get(42);
    await applyPull([{ kind: 'todo', id: '42', version: 4, value: { ...row, text: '云端更新内容' } }]);
    return { records: await database.syncRecords.toArray(), conflicts: await database.syncConflicts.toArray() };
  });
  await form.getByRole('button', { name: '保存', exact: true }).click();
  await expect(form).toContainText(conflict);
  await expect(form.getByRole('textbox', { name: '想做些什么？' })).toHaveValue('旧表单的未保存草稿');
  const after = await page.evaluate(async () => {
    const localPath = '/src/data/localDatabase.ts';
    const { database } = await import(localPath);
    return { row: await database.todos.get(42), records: await database.syncRecords.toArray(), conflicts: await database.syncConflicts.toArray() };
  });
  expect(after.row).toMatchObject({ text: '云端更新内容' });
  expect(after.records).toEqual(before.records);
  expect(after.conflicts).toEqual(before.conflicts);
});

test('pulled changes reject stale edit, completion, delete and restore without changing the outbox', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const localPath = '/src/data/localDatabase.ts', repoPath = '/src/data/database.ts', storePath = '/src/data/cloudStore.ts';
    const local = await import(localPath);
    const { todoRepository, todoBaseline, TodoConflictError } = await import(repoPath);
    const { applyPull } = await import(storePath);
    await local.openCloudDatabase({ userId: 'synthetic-user', spaceId: 'synthetic-space', members: 2 });
    const db = local.database;
    await db.categories.put({ id: 'life', name: '生活', key: '生活', builtin: false, createdAt: 1 });
    const original = { id: 42, text: '原始内容', date: '2026-11-22', completed: false, createdAt: 1, categoryId: 'life', legacy: { keep: true } };
    await applyPull([{ kind: 'todo', id: '42', version: 1, value: original }]);
    const stale = todoBaseline((await todoRepository.all())[0]);
    const cases = [
      { ...original, text: '另一设备新内容' },
      { ...original, completed: true },
      { ...original, legacy: { keep: false } },
      null,
    ];
    const checks = [];
    for (const [index, latest] of cases.entries()) {
      await applyPull([{ kind: 'todo', id: '42', version: index + 2, value: latest }]);
      const before = await db.syncRecords.toArray();
      for (const action of [
        () => todoRepository.update(42, { text: '旧表单保存' }, stale),
        () => todoRepository.update(42, { completed: true }, stale),
        () => todoRepository.remove(42, stale),
      ]) {
        let rejected = false;
        try { await action(); } catch (error) { rejected = error instanceof TodoConflictError; }
        checks.push({ rejected, row: await db.todos.get(42) ?? null, outboxUnchanged: JSON.stringify(before) === JSON.stringify(await db.syncRecords.toArray()), expected: latest });
      }
    }
    // Missing IDs can be restored; an existing ID must never be overwritten.
    await todoRepository.restore(original);
    const beforeRestore = await db.syncRecords.toArray();
    let restoreRejected = false;
    try { await todoRepository.restore({ ...original, text: '覆盖现有记录' }); }
    catch (error) { restoreRejected = error instanceof TodoConflictError; }
    const restored = await db.todos.get(42);
    const put = db.syncRecords.put;
    let writeRejected = false;
    db.syncRecords.put = async () => { throw new Error('Synthetic outbox failure'); };
    try { await todoRepository.update(42, { text: '必须整体回滚' }, restored); }
    catch (error) { writeRejected = (error as Error).message === 'Synthetic outbox failure'; }
    finally { db.syncRecords.put = put; }
    return { checks, restoreRejected, restored: await db.todos.get(42),
      writeRejected, rollbackPreserved: JSON.stringify(restored) === JSON.stringify(await db.todos.get(42)),
      restoreOutboxUnchanged: JSON.stringify(beforeRestore) === JSON.stringify(await db.syncRecords.toArray()) };
  });
  for (const check of result.checks) {
    expect(check.rejected).toBe(true);
    expect(check.row).toEqual(check.expected);
    expect(check.outboxUnchanged).toBe(true);
  }
  expect(result.restoreRejected).toBe(true);
  expect(result.restoreOutboxUnchanged).toBe(true);
  expect(result.writeRejected).toBe(true);
  expect(result.rollbackPreserved).toBe(true);
  expect(result.restored).toMatchObject({ text: '原始内容', legacy: { keep: true } });
});

test('cloud display fallback keeps the raw category baseline for a valid completion', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const localPath = '/src/data/localDatabase.ts', repoPath = '/src/data/database.ts', storePath = '/src/data/cloudStore.ts';
    const local = await import(localPath);
    const { todoRepository, todoBaseline } = await import(repoPath);
    const { applyPull } = await import(storePath);
    await local.openCloudDatabase({ userId: 'synthetic-user', spaceId: 'fallback-space', members: 2 });
    await local.database.categories.put({ id: 'life', name: '生活', key: '生活', builtin: false, createdAt: 1 });
    await applyPull([{ kind: 'todo', id: '42', version: 1, value: {
      id: 42, text: '分类已删除', date: '2026-11-22', completed: false, createdAt: 1, categoryId: 'gone', legacy: { keep: true },
    } }]);
    const display = (await todoRepository.all())[0];
    const baseline = todoBaseline(display);
    await todoRepository.update(42, { completed: true }, baseline);
    const completed = await local.database.todos.get(42);
    const fresh = (await todoRepository.all())[0];
    await todoRepository.update(42, { text: '正常编辑', categoryId: fresh.categoryId }, todoBaseline(fresh));
    return { displayCategory: display.categoryId, baselineCategory: baseline.categoryId, completed, edited: await local.database.todos.get(42) };
  });
  expect(result.displayCategory).toBe('life');
  expect(result.baselineCategory).toBe('gone');
  expect(result.completed).toMatchObject({ completed: true, categoryId: 'gone', legacy: { keep: true } });
  expect(result.edited).toMatchObject({ text: '正常编辑', categoryId: 'life', legacy: { keep: true } });
});
