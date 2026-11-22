import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
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

const signingSecrets = ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'];
const workflowText = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

test('caller passes exactly four named signing Secrets and callee requires all four', () => {
  const deploy = workflowText('.github/workflows/deploy-pages.yml');
  const caller = deploy.split('\n  android-web:\n')[1];
  assert.ok(caller); assert.doesNotMatch(caller, /secrets:\s*inherit/);
  const mappings = [...caller.matchAll(/^      (\w+): \$\{\{ secrets\.(\w+) \}\}$/gm)];
  assert.deepEqual(mappings.map(m => m[1]).sort(), [...signingSecrets].sort());
  for (const [, key, value] of mappings) assert.equal(key, value, 'Secret must map to its original name');
  const workflow = workflowText('.github/workflows/android-web-auto.yml');
  const declaration = workflow.split('\n  workflow_call:\n')[1]?.split('\npermissions:')[0];
  assert.ok(declaration);
  const required = [...declaration.matchAll(/^      (\w+):\n        required: true$/gm)].map(m => m[1]);
  assert.deepEqual(required.sort(), [...signingSecrets].sort());
  assert.doesNotMatch(workflow, /secrets:\s*inherit/);
  assert.match(workflow, /\npermissions:\n  contents: read\n/);
  const verifyPR = workflowText('.github/workflows/verify-pr.yml');
  assert.match(verifyPR, /run: npm run test:android:auto/);
  assert.doesNotMatch(verifyPR, /secrets\./, 'PR contract checks never need real signing Secrets');
});

test('signing preflight rejects every missing or empty Secret without printing any values', () => {
  const workflow = workflowText('.github/workflows/android-web-auto.yml');
  const sign = workflow.split('\n  sign:\n')[1]?.split('\n  publish:\n')[0];
  const gate = sign?.match(/      - name: Require all four signing Secrets[\s\S]*?(?=      - uses:)/)?.[0];
  assert.ok(gate, 'Signing preflight must run before checkout, downloads or keystore decoding');
  assert.match(sign, /steps:\n      - name: Require all four signing Secrets/);
  assert.match(gate, /if: needs.verify.outputs.published != 'true'/);
  for (const key of signingSecrets) assert.ok(gate.includes(`${key}: \${{ secrets.${key} }}`));
  const script = gate.split('        run: |\n')[1].replace(/^ {10}/gm, '');
  const gitBash = join(process.env.ProgramFiles || 'C:/Program Files', 'Git', 'bin', 'bash.exe');
  const bash = process.platform === 'win32' && existsSync(gitBash) ? gitBash : 'bash';
  const synthetic = Object.fromEntries(signingSecrets.map(key => [key, `synthetic-only-${key}`]));
  const run = overrides => spawnSync(bash, ['--noprofile', '--norc', '-c', script], {
    encoding: 'utf8', env: { ...process.env, ...synthetic, ...overrides },
  });
  const complete = run({});
  assert.ifError(complete.error); assert.equal(complete.status, 0); assert.equal(complete.stdout + complete.stderr, '');
  for (const key of signingSecrets) {
    for (const value of ['', undefined]) {
      const result = run({ [key]: value });
      assert.ifError(result.error); assert.equal(result.status, 1);
      assert.equal(result.stdout, ''); assert.equal(result.stderr.trim(), `Missing signing credential: ${key}`);
      assert.ok(!result.stderr.includes('synthetic-only-'));
    }
  }
});
