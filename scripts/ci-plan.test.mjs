import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { planTests, selectPublishedWebBaseline, collectPlan } from './ci-plan.mjs';

test('ordinary UI changes use related tests and smoke without full or CloudBase', () => {
  const p = planTests(['src/styles/global.css']);
  assert.equal(p.full, false); assert.equal(p.cloud, false); assert.equal(p.smoke, true);
  assert.ok(p.webTests.includes('tests/decorations.spec.ts'));
  assert.ok(!p.webTests.includes('tests/period.spec.ts'));
});
test('candidate packages include Android update verification without full regression', () => {
  const p = planTests(['src/features/home/HomePage.tsx'], { tier: 'candidate' });
  assert.equal(p.full, false); assert.equal(p.android, true); assert.equal(p.cloud, false);
  assert.deepEqual(p.webTests, ['tests/home-ux.spec.ts', 'tests/startup-readiness.spec.ts']);
});

test('candidate baseline uses only public releases for the selected shell', () => {
  const release = (shell, web, extra = {}) => ({ tag_name: `android-web-shell-${shell}-web-${web}`, draft: false, prerelease: false, ...extra });
  const releases = [release(2, 9), release(3, 3), release(3, 15, { draft: true }),
    release(3, 14, { prerelease: true }), release(3, 4), release(4, 99),
    { tag_name: 'android-web-shell-3-web-20' }];
  assert.equal(selectPublishedWebBaseline(releases).tag_name, 'android-web-shell-3-web-4');
  assert.equal(selectPublishedWebBaseline(releases, 2).tag_name, 'android-web-shell-2-web-9');
  assert.throws(() => selectPublishedWebBaseline([release(2, 9)], 3), /baseline/);
  assert.throws(() => selectPublishedWebBaseline(releases, 4), /Unsupported/);
  assert.throws(() => selectPublishedWebBaseline([release(3, '01'), release(3, '2147483648')]), /baseline/);
});

test('formal and explicit full collection stays complete without a release lookup', () => {
  for (const env of [{ CI_TEST_TIER: 'formal' }, { CI_TEST_TIER: 'full' }, { CI_FULL: 'true' }]) {
    const plan = collectPlan(env);
    assert.equal(plan.full, true);
    assert.equal(plan.cloud, true); assert.equal(plan.android, true); assert.equal(plan.pages, true);
    assert.equal(plan.base, plan.source);
  }
  const explicit = collectPlan({ CI_TEST_TIER: 'formal', CI_CHANGE_BASE: 'HEAD' });
  assert.equal(explicit.full, true);
});

test('collection resolves the selected public target and fails closed before planning without one', () => {
  const releases = [
    { tag_name: 'android-web-shell-2-web-9', draft: false, prerelease: false },
    { tag_name: 'android-web-shell-3-web-4', draft: false, prerelease: false },
    { tag_name: 'android-web-shell-3-web-99', draft: true, prerelease: false },
  ];
  for (const shell of [2, 3]) {
    const tag = releases[shell - 2].tag_name;
    const expected = spawnSync('git', ['rev-parse', tag + '^{commit}'], { encoding: 'utf8' });
    assert.equal(expected.status, 0);
    const plan = collectPlan({ CI_TEST_TIER: 'candidate', CI_TARGET_SHELL: String(shell) }, () => releases);
    assert.equal(plan.base, expected.stdout.trim());
    assert.equal(plan.targetShell, shell);
    assert.equal(plan.full, false);
  }
  assert.throws(() => collectPlan({ CI_TEST_TIER: 'candidate' }, () => releases.slice(0, 1)), /baseline/);
  assert.throws(() => collectPlan({ CI_TEST_TIER: 'candidate' }, () => { throw new Error('API unavailable'); }), /API unavailable/);
  const noLookup = () => { throw new Error('Unexpected release lookup'); };
  for (const env of [{ CI_TEST_TIER: 'formal' }, { CI_TEST_TIER: 'full' }, { CI_FULL: 'true' }])
    assert.equal(collectPlan(env, noLookup).full, true);
  assert.equal(collectPlan({ CI_TEST_TIER: 'candidate', CI_CHANGE_BASE: 'HEAD' }, noLookup).base,
    collectPlan({ CI_TEST_TIER: 'formal' }, noLookup).source);
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

test('startup health owners select the readiness contract tests', () => {
  for (const path of ['src/native/window.ts', 'src/native/startupReadiness.ts', 'src/app/App.tsx', 'src/features/home/HomePage.tsx'])
    assert.ok(planTests([path]).webTests.includes('tests/startup-readiness.spec.ts'), path);
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
