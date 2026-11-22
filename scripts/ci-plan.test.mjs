import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { planTests } from './ci-plan.mjs';

test('ordinary UI changes use related tests and smoke without full or CloudBase', () => {
  const p = planTests(['src/styles/global.css']);
  assert.equal(p.full, false); assert.equal(p.cloud, false); assert.equal(p.smoke, true);
  assert.ok(p.webTests.includes('tests/decorations.spec.ts'));
  assert.ok(!p.webTests.includes('tests/period.spec.ts'));
});
test('candidate packages include Android update verification without full regression', () => {
  const p = planTests(['src/features/home/HomePage.tsx'], { tier: 'candidate' });
  assert.equal(p.full, false); assert.equal(p.android, true); assert.equal(p.cloud, false);
  assert.deepEqual(p.webTests, ['tests/home-ux.spec.ts']);
});
test('CloudBase logic adds corresponding checks without automatically running full', () => {
  const p = planTests(['src/data/cloudSync.ts']);
  assert.equal(p.full, false); assert.equal(p.cloud, true); assert.equal(p.androidCloudSuite, true);
});
test('SQL migrations and IndexedDB schema changes require the complete gate', () => {
  assert.equal(planTests(['cloudbase/003_changes.sql']).full, true);
  assert.equal(planTests(['src/data/database.ts'], { schemaChanged: true }).full, true);
});
test('formal releases cannot weaken the complete gate with a small changed scope', () => {
  const p = planTests(['README.md'], { tier: 'formal' });
  assert.equal(p.full, true); assert.equal(p.pages, true); assert.equal(p.cloud, true);
  assert.equal(p.android, true); assert.equal(p.androidCloudSuite, true);
});
test('critical architecture and explicit full requests remain supported', () => {
  assert.equal(planTests([], { fullRequested: true }).full, true);
  assert.equal(planTests([], { tier: 'full' }).full, true);
});
test('CI-only changes are build and smoke, not full regressions', () => {
  const p = planTests(['.github/workflows/verify-pr.yml', 'scripts/ci-run.mjs']);
  assert.equal(p.full, false); assert.equal(p.android, false); assert.deepEqual(p.webTests, []);
});
test('unknown profiles cannot silently disable the formal gate', () => {
  assert.throws(() => planTests([], { tier: 'quick-release' }), /Unknown validation tier/);
});

test('native update changes run focused checks; final formal releases retain the full gate', () => {
  const native = planTests(['android/app/src/main/java/com/littledays/app/OnlineWebUpdates.java']);
  assert.equal(native.full, false); assert.equal(native.nativeDelta, true); assert.equal(native.android, true);
  assert.equal(planTests(['android/app/src/main/java/com/littledays/app/OnlineWebUpdates.java'], { tier: 'formal' }).full, true);
  const p = planTests(['cloudbase/issue_invitations.sql']);
  assert.equal(p.cloud, true); assert.equal(p.full, false);
});

test('unmapped shared app logic retains a small regression set', () => {
  const p = planTests(['src/utils/dateMath.ts']);
  assert.equal(p.full, false); assert.ok(p.webTests.includes('tests/period-model.spec.ts'));
});

test('shared persistence and backup changes cover local and unified CloudBase paths', () => {
  for (const path of ['src/data/database.ts', 'src/data/localDatabase.ts', 'src/data/storageAccess.ts',
    'src/data/backupModel.ts', 'src/data/cloudStore.ts', 'src/data/cloudSync.ts']) {
    const plan = planTests([path]);
    assert.equal(plan.cloud, true, path);
    assert.equal(plan.androidCloudSuite, true, path);
    assert.ok(plan.webTests.includes('tests/todo-concurrency.spec.ts'), path);
  }
});

test('anniversary model selects calendar, date and cumulative-node contracts', () => {
  const plan = planTests(['src/features/anniversary/model.ts']);
  for (const name of ['anniversary-dates', 'anniversary-calendar', 'anniversary-timing-list'])
    assert.ok(plan.webTests.includes(`tests/${name}.spec.ts`), name);
  assert.equal(plan.full, false);
});

test('ART scope covers production updater, fixtures and the policy that controls its gate', () => {
  for (const path of ['android/app/src/main/java/com/littledays/app/MainActivity.java',
    'scripts/VerifyAndroidWeb.java', 'scripts/test-android-delta.mjs', 'scripts/write-web-inventory.mjs',
    'tests-android/web-update.spec.ts', '.github/workflows/verify-pr.yml',
    '.github/workflows/android-delta-tests.yml', 'scripts/ci-plan.mjs', 'scripts/ci-plan.test.mjs', 'scripts/ci-run.mjs'])
    assert.equal(planTests([path]).nativeDelta, true, path);
  assert.equal(planTests(['src/styles/global.css']).nativeDelta, false);
  assert.equal(planTests([], { fullRequested: true }).nativeDelta, true);
});

// Execute the exact gate scripts so a skipped/cancelled dependency cannot pass
// just because a text assertion found a needs declaration in the YAML.
function gateScript(path, job) {
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const block = text.split(`\n  ${job}:\n`)[1];
  assert.ok(block, job);
  const script = block.match(/node --input-type=module <<'JS'\n([\s\S]*?)\n          JS/);
  assert.ok(script, job);
  return script[1].replace(/^ {10}/gm, '');
}
function gatePasses(script, env) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', env: { ...process.env, ...env },
  });
  assert.ifError(result.error);
  return result.status === 0;
}
test('final verify fails for every non-success dependency', () => {
  const path = '.github/workflows/verify-pr.yml';
  const text = readFileSync(path, 'utf8');
  assert.match(text, /verify:\s+name: verify\s+if: always\(\)\s+needs: \[validation, native-delta\]/);
  const script = gateScript(path, 'verify');
  const statuses = ['success', 'failure', 'cancelled', 'skipped', ''];
  for (const validation of statuses) for (const native of statuses)
    assert.equal(gatePasses(script, { VALIDATION_RESULT: validation, NATIVE_RESULT: native }),
      validation === 'success' && native === 'success', `${validation}/${native}`);
});
test('reusable ART gate only permits an explicit inapplicable skip', () => {
  const path = '.github/workflows/android-delta-tests.yml';
  const text = readFileSync(path, 'utf8');
  assert.match(text, /result:\s+if: always\(\)\s+needs: \[scope, delta\]/);
  assert.match(text, /run: node scripts\/ci-plan\.mjs/);
  const script = gateScript(path, 'result');
  for (const scope of ['success', 'failure', 'cancelled', 'skipped', ''])
    for (const required of ['true', 'false', ''])
      for (const delta of ['success', 'failure', 'cancelled', 'skipped', ''])
        assert.equal(gatePasses(script, { SCOPE_RESULT: scope, NATIVE_REQUIRED: required, DELTA_RESULT: delta }),
          scope === 'success' && (required === 'true' && delta === 'success' || required === 'false' && delta === 'skipped'),
          `${scope}/${required}/${delta}`);
});
