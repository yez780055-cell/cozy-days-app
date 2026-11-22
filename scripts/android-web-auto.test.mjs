import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { planRelease, checkAssets } from './android-web-auto.mjs';

const source = 'a'.repeat(40), old = 'b'.repeat(40);
const release = (web, extra = {}) => ({ tag_name: `android-web-shell-3-web-${web}`,
  target_commitish: old, draft: false, prerelease: false, ...extra });
test('only shell 3 is allocated, above published releases, drafts and reserved tags', () => {
  const p = planRelease([release(2), release(7, { draft: true }), { tag_name: 'android-web-shell-2-web-99' }],
    [{ name: 'android-web-shell-3-web-10' }], source);
  assert.equal(p.web, 11); assert.equal(p.shell, 3); assert.equal(p.base, release(2).tag_name);
  assert.equal(p.published, false);
});
test('retry reuses matching draft, and a published retry only verifies original bytes', () => {
  assert.equal(planRelease([release(2), release(3, { draft: true, target_commitish: source })], [], source).web, 3);
  const p = planRelease([release(2), release(3, { target_commitish: source })], [], source);
  assert.equal(p.web, 3); assert.equal(p.published, true);
});
test('obsolete deployments, unknown baselines and overflow fail closed', () => {
  assert.throws(() => planRelease([release(2, { target_commitish: source }), release(3)], [], source), /Obsolete/);
  assert.throws(() => planRelease([], [], source), /baseline/);
  assert.throws(() => planRelease([release(2147483647)], [], source), /exhausted/);
  assert.throws(() => planRelease([release(2)], [], 'main'));
});
test('draft asset gate rejects missing, extra, incomplete and altered uploads', () => {
  const bytes = Buffer.from('signed file');
  const expected = new Map([['file-example', bytes]]);
  const asset = { name: 'file-example', size: bytes.length, state: 'uploaded',
    digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex') };
  assert.doesNotThrow(() => checkAssets([asset], expected));
  assert.throws(() => checkAssets([], expected));
  assert.throws(() => checkAssets([asset, asset], expected));
  for (const change of [{ name: 'extra' }, { size: 1 }, { state: 'new' }, { digest: 'sha256:bad' }])
    assert.throws(() => checkAssets([{ ...asset, ...change }], expected));
});
test('automatic publisher is gated by Pages success and credentials stay in signing job', () => {
  const deploy = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
  assert.match(deploy, /android-web:\s+needs: deploy/);
  const workflow = readFileSync('.github/workflows/android-web-auto.yml', 'utf8');
  assert.match(workflow, /workflow_call:/); assert.doesNotMatch(workflow, /pull_request_target:|assembleRelease|cap sync/);
  const [verify, rest] = workflow.split(/\n  sign:\n/);
  const [sign, publish] = rest.split(/\n  publish:\n/);
  assert.doesNotMatch(verify, /secrets\./); assert.doesNotMatch(publish, /secrets\./);
  assert.match(sign, /environment: android-release/); assert.match(sign, /trap .*EXIT/);
  assert.match(publish, /contents: write/);
});
