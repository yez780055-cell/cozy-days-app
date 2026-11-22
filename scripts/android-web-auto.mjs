import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, verify, X509Certificate } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { anonymousGet } from './android-web-http.mjs';

const repository = 'yez780055-cell/cozy-days-app';
const certificate = 'c85fe70fff2425ad2b95d3dfa8f28ef7173027e744b03f57b721896fca40d3d8';
const prefix = 'android-web-shell-3-web-';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const gh = args => execFileSync('gh', args, { maxBuffer: 128 * 1024 * 1024 });
const api = (path, fields = {}, method = 'POST') => JSON.parse(execFileSync('gh',
  ['api', '--method', method, `repos/${repository}/${path}`, '--input', '-'],
  { input: JSON.stringify(fields), maxBuffer: 128 * 1024 * 1024 }).toString());
const list = path => JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repository}/${path}?per_page=100`]).toString()).flat();
const revision = tag => /^android-web-shell-3-web-([1-9][0-9]*)$/.exec(tag)?.[1] * 1 || 0;

// Include drafts AND tags so a partial run or a manually reserved revision is never reused.
export function planRelease(releases, tags, source) {
  assert.match(source, /^[a-f0-9]{40}$/);
  const candidates = releases.filter(r => revision(r.tag_name));
  const highest = Math.max(1, ...candidates.map(r => revision(r.tag_name)), ...tags.map(t => revision(t.name)));
  const published = candidates.filter(r => !r.draft && !r.prerelease)
    .sort((a, b) => revision(b.tag_name) - revision(a.tag_name));
  const same = candidates.filter(r => r.target_commitish === source && !r.prerelease)
    .sort((a, b) => revision(b.tag_name) - revision(a.tag_name))[0];
  if (same) assert.ok(revision(same.tag_name) >= revision(published[0]?.tag_name || ''), 'Obsolete deployment cannot replace a newer release');
  const web = same ? revision(same.tag_name) : highest + 1;
  assert.ok(Number.isSafeInteger(web) && web >= 2 && web <= 2147483647, 'Web revision exhausted');
  const base = published[0]?.tag_name;
  assert.ok(base, 'A published shell 3 baseline is required');
  return { schema: 1, shell: 3, web, tag: prefix + web, source, base, published: same ? !same.draft : false };
}

function checkPlan(plan, expectedSource = process.env.GITHUB_SHA) {
  assert.equal(plan.schema, 1); assert.equal(plan.shell, 3);
  assert.ok(Number.isInteger(plan.web) && plan.web >= 2 && plan.web <= 2147483647);
  assert.equal(plan.tag, prefix + plan.web);
  assert.match(plan.source, /^[a-f0-9]{40}$/);
  if (expectedSource) assert.equal(plan.source, expectedSource, 'Artifact source differs from deployed commit');
}

export function verifyRelease(dir, certBytes, plan, pinned = certificate, expectedSource = process.env.GITHUB_SHA) {
  checkPlan(plan, expectedSource);
  const cert = new X509Certificate(certBytes);
  assert.equal(sha(cert.raw), pinned, 'Original APK signing certificate required');
  const manifestBytes = readFileSync(join(dir, 'web-manifest.json'));
  assert.ok(manifestBytes.length <= 512 * 1024);
  assert.ok(verify('RSA-SHA256', manifestBytes, cert.publicKey, readFileSync(join(dir, 'web-manifest.sig'))), 'Invalid manifest signature');
  const manifest = JSON.parse(manifestBytes);
  const latest = json(join(dir, 'latest.json'));
  for (const data of [manifest, latest]) {
    assert.equal(data.schema, 1); assert.equal(data.shell, 3); assert.equal(data.web, plan.web);
  }
  const packageName = `Cozy-Days-Web-3-${plan.web}.cozyupdate`;
  const pkg = readFileSync(join(dir, packageName));
  assert.ok(pkg.length <= 64 * 1024 * 1024 + 8198);
  assert.equal(pkg.readUInt32BE(), 0x434f5a31);
  const length = pkg.readUInt16BE(4);
  assert.ok(length > 0 && length <= 8192);
  assert.ok(verify('RSA-SHA256', pkg.subarray(6 + length), cert.publicKey, pkg.subarray(6, 6 + length)), 'Invalid full package signature');
  assert.equal(latest.bytes, pkg.length); assert.equal(latest.sha256, sha(pkg));
  assert.equal(manifest.packageBytes, pkg.length); assert.equal(manifest.packageSha256, sha(pkg));
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= 1999);
  const paths = new Set(), objects = new Set();
  let total = 0;
  for (const file of manifest.files) {
    assert.match(file.path, /^(?:index\.html|(?:assets|icons)\/[A-Za-z0-9][A-Za-z0-9._/-]*)$/);
    assert.ok(file.path.split('/').every(p => p && p !== '.' && p !== '..'));
    assert.ok(!paths.has(file.path)); paths.add(file.path);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    const name = `file-${file.sha256}`;
    const bytes = readFileSync(join(dir, name));
    assert.equal(bytes.length, file.bytes); assert.equal(sha(bytes), file.sha256);
    objects.add(name); total += file.bytes;
  }
  assert.ok(paths.has('index.html') && total <= 96 * 1024 * 1024);
  const runtime = [packageName, 'latest.json', 'web-manifest.json', 'web-manifest.sig', ...objects];
  const allowed = new Set([...runtime, 'download.html', 'signer.cer', 'provenance.json', 'ci-test-plan.json', 'SHA256SUMS.txt']);
  assert.ok(readdirSync(dir).every(name => allowed.has(name)), 'Unexpected release asset');
  return runtime;
}

function seal(root) {
  const plan = json(join(root, 'android-web-auto-plan.json'));
  const dir = join(root, 'shell-3', `web-${plan.web}`);
  verifyRelease(dir, readFileSync(join(root, 'signer.cer')), plan);
  const tests = json(join(root, 'ci-test-plan.json'));
  assert.equal(tests.source, plan.source); assert.equal(tests.tier, 'candidate');
  assert.equal(tests.android, true); assert.equal(tests.smoke, true);
  writeFileSync(join(dir, 'signer.cer'), readFileSync(join(root, 'signer.cer')));
  writeFileSync(join(dir, 'ci-test-plan.json'), JSON.stringify(tests, null, 2) + '\n');
  writeFileSync(join(dir, 'provenance.json'), JSON.stringify({ ...plan,
    validation: tests.full ? 'full' : 'focused', cloudbase: true,
    workflow: `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  }, null, 2) + '\n');
  writeFileSync(join(dir, 'SHA256SUMS.txt'), readdirSync(dir).filter(n => n !== 'SHA256SUMS.txt').sort()
    .map(name => `${sha(readFileSync(join(dir, name)))}  ${name}\n`).join(''));
  console.log(`Verified original signer, COZ1, signed manifest and all file objects: ${plan.tag}`);
}

export function checkAssets(assets, expected) {
  assert.equal(assets.length, expected.size, 'Release asset count differs');
  assert.equal(new Set(assets.map(a => a.name)).size, expected.size);
  for (const asset of assets) {
    const bytes = expected.get(asset.name);
    assert.ok(bytes, `Unexpected asset ${asset.name}`);
    assert.equal(asset.state, 'uploaded'); assert.equal(asset.size, bytes.length);
    if (asset.digest) assert.equal(asset.digest, 'sha256:' + sha(bytes));
  }
}

async function retry(operation) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); } catch (error) {
      if (attempt === 4) throw error;
      await new Promise(done => setTimeout(done, 3000 * (attempt + 1)));
    }
  }
}

async function publish(root) {
  const plan = json(join(root, 'android-web-auto-plan.json'));
  const dir = resolve(root, 'shell-3', `web-${plan.web}`);
  verifyRelease(dir, readFileSync(join(dir, 'signer.cer')), plan);
  const provenance = json(join(dir, 'provenance.json'));
  assert.equal(provenance.source, plan.source); assert.equal(provenance.tag, plan.tag);
  const expected = new Map(readdirSync(dir).sort().map(name => [name, readFileSync(join(dir, name))]));
  const releases = list('releases');
  assert.ok(!releases.some(r => !r.draft && !r.prerelease && revision(r.tag_name) > plan.web),
    'A newer web release is already public; cannot move Latest backwards');
  let release = releases.find(r => r.tag_name === plan.tag);
  if (release) {
    assert.equal(release.target_commitish, plan.source, 'Existing release points at another source');
    assert.equal(release.prerelease, false);
  } else {
    // Fail closed if another publisher has already reserved a newer revision.
    const higher = list('releases').some(r => revision(r.tag_name) >= plan.web);
    assert.ok(!higher, 'A newer revision was reserved during validation; rerun deployment');
    release = api('releases', { tag_name: plan.tag, target_commitish: plan.source,
      name: `Cozy Days Android web 3.${plan.web}`, draft: true, prerelease: false,
      body: `Automatic web update after successful GitHub Pages deployment.\n\nSource: ${plan.source}\nValidation: ${provenance.validation}\nActions: ${provenance.workflow}\n\nExisting APK shell 3 only; no APK rebuild. Signed manifest, file objects and COZ1 fallback included.` });
  }
  if (release.draft) {
    // Only a matching unpublished draft may be resumed. Never change public assets.
    const existing = list(`releases/${release.id}/assets`);
    assert.ok(existing.every(a => expected.has(a.name)), 'Draft contains unexpected assets');
    gh(['release', 'upload', plan.tag, ...[...expected.keys()].map(name => join(dir, name)), '--clobber', '--repo', repository]);
    const assets = list(`releases/${release.id}/assets`);
    checkAssets(assets, expected);
    for (const asset of assets) {
      const bytes = await retry(() => gh(['api', '-H', 'Accept: application/octet-stream', `repos/${repository}/releases/assets/${asset.id}`]));
      assert.equal(sha(bytes), sha(expected.get(asset.name)), `Draft download hash differs: ${asset.name}`);
    }
    api(`releases/${release.id}`, { draft: false, prerelease: false, make_latest: 'true' }, 'PATCH');
  }
  await verifyPublicDownloads(plan, expected);
  const url = `https://github.com/${repository}/releases/tag/${plan.tag}`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Android web published\n\n[Shell 3 / web ${plan.web}](${url})\n\nSource: ${plan.source}\n\nOriginal signer, manifest, full package and every file verified before and after publication.\n`);
  console.log(`Published and anonymously verified ${url}`);
}

async function verifyPublicDownloads(plan, expected) {
  // A Release API error and an asset download error have distinct diagnostics/retry budgets.
  const published = JSON.parse(await anonymousGet(`https://api.github.com/repos/${repository}/releases/tags/${plan.tag}`,
    { kind: 'release-api' }));
  assert.equal(published.draft, false); assert.equal(published.prerelease, false);
  assert.equal(published.tag_name, plan.tag); assert.equal(published.target_commitish, plan.source);
  checkAssets(published.assets, expected);
  for (const asset of published.assets) {
    const url = `https://github.com/${repository}/releases/download/${plan.tag}/${asset.name}`;
    assert.equal(asset.browser_download_url, url);
    const bytes = await anonymousGet(url, { kind: 'release-asset' });
    assert.equal(sha(bytes), sha(expected.get(asset.name)), `Public hash differs: ${asset.name}`);
    console.log(`PASS anonymous asset ${asset.name}: ${bytes.length} bytes sha256=${sha(bytes)}`);
  }
  console.log(`PASS anonymous Release API and ${expected.size} exact asset downloads; original certificate, Manifest and COZ1 signatures verified`);
}

// Recovery uses the original signed artifact and original run SHA, never the repair commit as its source.
// This path contains no release mutation, asset upload, key access or signing operation.
async function verifyPublished(root, expectedSource) {
  assert.match(expectedSource || '', /^[a-f0-9]{40}$/);
  const plan = json(join(root, 'android-web-auto-plan.json'));
  checkPlan(plan, expectedSource);
  const dir = resolve(root, 'shell-3', `web-${plan.web}`);
  verifyRelease(dir, readFileSync(join(dir, 'signer.cer')), plan, certificate, expectedSource);
  const provenance = json(join(dir, 'provenance.json'));
  assert.equal(provenance.source, expectedSource); assert.equal(provenance.tag, plan.tag);
  const expected = new Map(readdirSync(dir).sort().map(name => [name, readFileSync(join(dir, name))]));
  await verifyPublicDownloads(plan, expected);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Existing release verified anonymously\n\nTag: ${plan.tag}\n\nOriginal source: ${expectedSource}\n\n${expected.size} assets matched the original signed artifact; Manifest and COZ1 signatures verified. No signing or release mutations.\n`);
}

async function restore(tested, root) {
  const plan = json(join(tested, 'android-web-auto-plan.json'));
  checkPlan(plan); assert.equal(plan.published, true);
  const release = JSON.parse(await anonymousGet(`https://api.github.com/repos/${repository}/releases/tags/${plan.tag}`,
    { kind: 'release-api' }));
  assert.equal(release.draft, false); assert.equal(release.prerelease, false);
  assert.equal(release.target_commitish, plan.source);
  const dir = join(root, 'shell-3', `web-${plan.web}`);
  mkdirSync(dir, { recursive: true });
  for (const asset of release.assets) {
    assert.match(asset.name, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
    const url = `https://github.com/${repository}/releases/download/${plan.tag}/${asset.name}`;
    assert.equal(asset.browser_download_url, url);
    writeFileSync(join(dir, asset.name), await anonymousGet(url, { kind: 'release-asset' }));
  }
  verifyRelease(dir, readFileSync(join(dir, 'signer.cer')), plan);
  writeFileSync(join(root, 'android-web-auto-plan.json'), JSON.stringify(plan, null, 2) + '\n');
  console.log('Resuming public verification without signing or modifying published assets');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, root] = process.argv.slice(2);
  if (command === 'plan') {
    assert.equal(process.env.GITHUB_REPOSITORY, repository);
    assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
    const plan = planRelease(list('releases'), list('tags'), process.env.GITHUB_SHA);
    writeFileSync('android-web-auto-plan.json', JSON.stringify(plan, null, 2) + '\n');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `web=${plan.web}\nbase=${plan.base}\npublished=${plan.published}\n`);
    console.log(JSON.stringify(plan));
  } else if (command === 'seal') seal(root);
  else if (command === 'restore') await restore(root, process.argv[4]);
  else if (command === 'publish') await publish(root);
  else if (command === 'verify-published') await verifyPublished(root, process.argv[4]);
  else throw new Error('Expected plan, seal, publish or verify-published');
}
