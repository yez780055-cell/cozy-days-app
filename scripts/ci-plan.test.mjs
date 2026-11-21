import test from 'node:test';
import assert from 'node:assert/strict';
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

test('native signature loader changes are critical while invitation scripts remain scoped', () => {
  assert.equal(planTests(['android/app/src/main/java/com/littledays/app/OnlineWebUpdates.java']).full, true);
  const p = planTests(['cloudbase/issue_invitations.sql']);
  assert.equal(p.cloud, true); assert.equal(p.full, false);
});

test('unmapped shared app logic retains a small regression set', () => {
  const p = planTests(['src/utils/dateMath.ts']);
  assert.equal(p.full, false); assert.ok(p.webTests.includes('tests/period-model.spec.ts'));
});
