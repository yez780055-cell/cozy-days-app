import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { planRelease, checkAssets, assertNormalReleaseSource, assertNoNewerPublicRevision, selectCurrentPagesDeployment, releaseSourceEvidence } from './android-web-auto.mjs';

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

const deployment = (id, sha, state = 'success', extra = {}) => ({ id, sha, ref: 'main', environment: 'github-pages',
  latestStatus: { state, environment_url: 'https://yez780055-cell.github.io/cozy-days-app/' }, ...extra });
test('normal release requires current Pages identity and forward published ancestry', () => {
  assert.doesNotThrow(() => assertNormalReleaseSource({ source, currentPagesSha: source, latestPublishedSource: old, relation: 'ahead' }));
  assert.doesNotThrow(() => assertNormalReleaseSource({ source, currentPagesSha: source, latestPublishedSource: source, relation: 'identical' }));
  // An unpublished old source can get a new revision, but cannot pass this source gate.
  assert.equal(planRelease([release(7)], [], source).web, 8);
  assert.throws(() => assertNormalReleaseSource({ source, currentPagesSha: old, latestPublishedSource: old, relation: 'ahead' }), /current successful Pages/);
  for (const relation of ['behind', 'diverged', '', undefined])
    assert.throws(() => assertNormalReleaseSource({ source, currentPagesSha: source, latestPublishedSource: old, relation }));
  assert.throws(() => assertNormalReleaseSource({ source, currentPagesSha: source, latestPublishedSource: old, relation: 'identical' }), /inconsistent/);
});
test('Pages selection ignores failed/pending replacements and superseded success statuses', () => {
  const active = deployment(2, source);
  assert.equal(selectCurrentPagesDeployment([deployment(5, old, 'failure'), deployment(4, old, 'pending'),
    deployment(3, old, 'inactive'), active, deployment(1, old)]).id, 2);
  assert.equal(selectCurrentPagesDeployment([active, deployment(6, old)]).sha, old);
  assert.throws(() => selectCurrentPagesDeployment([deployment(1, old, 'inactive')]), /No current/);
  assert.throws(() => selectCurrentPagesDeployment([deployment(1, source, 'success', {
    latestStatus: { state: 'success', environment_url: 'https://example.test/' },
  })]), /URL/);
});
test('a higher public revision blocks an older upload even when both have the same source', () => {
  assert.doesNotThrow(() => assertNoNewerPublicRevision([release(3), release(4, { draft: true })], 3));
  assert.throws(() => assertNoNewerPublicRevision([release(3, { target_commitish: source }),
    release(4, { target_commitish: source })], 3), /newer web release/);
  assert.doesNotThrow(() => assertNoNewerPublicRevision([release(3)], 3));
});
test('source evidence is reread and rejects a newer deployment or unresolvable baseline', () => {
  let currentSha = source;
  const paths = [];
  const paginate = path => {
    paths.push(path);
    if (path === 'deployments?environment=github-pages') return [deployment(10, currentSha)];
    if (path === 'deployments/10/statuses') return [deployment(10, currentSha).latestStatus];
    throw new Error('Unexpected path ' + path);
  };
  const read = path => {
    if (path.startsWith('commits/')) return { sha: old };
    if (path === `compare/${old}...${source}`) return { status: 'ahead', base_commit: { sha: old } };
    throw new Error('Unexpected path ' + path);
  };
  const evidence = releaseSourceEvidence(source, [release(3)], read, paginate);
  assert.equal(evidence.deploymentId, 10); assert.equal(evidence.baselineSource, old);
  currentSha = old;
  assert.throws(() => releaseSourceEvidence(source, [release(3)], read, paginate), /current successful Pages/);
  assert.equal(paths.filter(path => path.endsWith('/statuses')).length, 2);
  assert.throws(() => releaseSourceEvidence(source, [release(3, { target_commitish: 'main' })], read, paginate), /source SHA/);
  assert.throws(() => releaseSourceEvidence(source, [release(3)], () => { throw new Error('API unavailable'); }, paginate), /API unavailable/);
  assert.throws(() => releaseSourceEvidence(source, [release(3)], () => ({ sha: source }), paginate), /tag differs/);
});
test('guards run before draft mutation and public transition, while read-only recovery stays independent', () => {
  const script = readFileSync('scripts/android-web-auto.mjs', 'utf8');
  const publishing = script.split('async function publish(root) {')[1].split('async function verifyPublicDownloads')[0];
  assert.ok(publishing.indexOf('releaseSourceEvidence') < publishing.indexOf("api('releases'"));
  assert.ok(publishing.lastIndexOf('releaseSourceEvidence') < publishing.indexOf('make_latest:'));
  assert.ok(publishing.lastIndexOf('releaseSourceEvidence') > publishing.indexOf('Draft download hash differs'));
  assert.match(publishing, /const freshReleases = list\('releases'\);\s+assertNoNewerPublicRevision\(freshReleases, plan.web\);\s+releaseSourceEvidence\(plan.source, freshReleases\)/);
  const recovery = script.split('async function verifyPublished(')[1].split('async function restore(')[0];
  assert.doesNotMatch(recovery, /releaseSourceEvidence|assertNormalReleaseSource/);
  const workflow = readFileSync('.github/workflows/android-web-auto.yml', 'utf8');
  assert.equal((workflow.match(/deployments: read/g) ?? []).length, 2);
  assert.match(readFileSync('.github/workflows/deploy-pages.yml', 'utf8'), /android-web:[\s\S]*deployments: read/);
});

test('queued retries and concurrent publication recheck live evidence rather than a saved plan', () => {
  let releases = [release(4)];
  let deployed = source;
  const read = path => path.startsWith('commits/') ? { sha: old }
    : { status: 'ahead', base_commit: { sha: old } };
  const paginate = path => path.endsWith('/statuses') ? [deployment(10, deployed).latestStatus]
    : [deployment(10, deployed)];
  const plan = planRelease(releases, [], source);
  releaseSourceEvidence(plan.source, releases, read, paginate);
  // Upload was interrupted; the saved draft still has the same source/revision.
  releases = [...releases, release(plan.web, { draft: true, target_commitish: source })];
  assert.deepEqual(planRelease(releases, [], source), plan);
  deployed = 'c'.repeat(40);
  assert.throws(() => releaseSourceEvidence(plan.source, releases, read, paginate), /current successful Pages/);
  // Even if Pages has the same bytes/source, a concurrent higher public revision
  // must block this run from moving Latest backwards at the public transition.
  deployed = source;
  releases.push(release(plan.web + 1, { target_commitish: source }));
  assert.throws(() => assertNoNewerPublicRevision(releases, plan.web), /newer web release/);
  for (const workflow of ['android-web-auto', 'android-web-release', 'android-web-publish-retry']) {
    const text = readFileSync(`.github/workflows/${workflow}.yml`, 'utf8');
    assert.match(text, /concurrency:\s+group: android-web-release\s+cancel-in-progress: false/);
  }
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
