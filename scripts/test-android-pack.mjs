import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, verify, X509Certificate } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { verifyRelease } from './android-web-auto.mjs';

const root = resolve('artifacts'); mkdirSync(root, { recursive: true });
const temp = mkdtempSync(join(root, 'delta-pack-'));
const dist = join(temp, 'dist');
mkdirSync(join(dist, 'assets'), { recursive: true }); mkdirSync(join(dist, 'icons'));
writeFileSync(join(dist, 'index.html'), '<html>offline fixture</html>');
writeFileSync(join(dist, 'assets/font.woff2'), 'unchanged font');
writeFileSync(join(dist, 'assets/app.js'), 'first revision');
const store = join(temp, 'test.jks'), cert = join(temp, 'test.cer');
const bin = name => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : '')) : name;
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.error || 'Command failed');
}
run(bin('keytool'), ['-genkeypair', '-alias', 'test', '-keyalg', 'RSA', '-keysize', '2048', '-dname', 'CN=Delta QA only',
  '-ext', 'SAN=ip:127.0.0.1', '-validity', '1', '-storetype', 'PKCS12', '-keystore', store, '-storepass', 'fixture-only', '-keypass', 'fixture-only']);
run(bin('keytool'), ['-exportcert', '-alias', 'test', '-keystore', store, '-storepass', 'fixture-only', '-file', cert]);
const publicKey = new X509Certificate(readFileSync(cert)).publicKey;
writeFileSync(join(temp, 'test.pem'), new X509Certificate(readFileSync(cert)).toString());
const env = { ...process.env, COZY_EXPERIMENT_KEYSTORE: store, COZY_EXPERIMENT_STORE_PASSWORD: 'fixture-only',
  COZY_EXPERIMENT_KEY_ALIAS: 'test', COZY_EXPERIMENT_KEY_PASSWORD: 'fixture-only' };
// Never inherit a production signing environment into isolated fixture generation.
for (const name of ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) delete env[name];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const web of [2, 3]) {
  if (web === 3) writeFileSync(join(dist, 'assets/app.js'), 'changed revision');
  const archive = join(temp, `${web}.cozyupdate`);
  run(bin('java'), ['scripts/PackAndroidWeb.java', dist, '3', String(web), archive, join(temp, 'releases')], env);
  const version = join(temp, 'releases/shell-3', `web-${web}`);
  const catalog = JSON.parse(readFileSync(join(temp, 'releases/shell-3/latest.json')));
  assert.equal(catalog.schema, 1);
  const packaged = readFileSync(archive);
  assert.equal(catalog.sha256, hash(packaged)); assert.equal(catalog.bytes, packaged.length);
  assert.equal(packaged.readUInt32BE(), 0x434f5a31);
  const sigSize = packaged.readUInt16BE(4);
  assert.ok(verify('RSA-SHA256', packaged.subarray(6 + sigSize), publicKey, packaged.subarray(6, 6 + sigSize)));
  const bytes = readFileSync(join(version, 'web-manifest.json'));
  assert.ok(verify('RSA-SHA256', bytes, publicKey, readFileSync(join(version, 'web-manifest.sig'))));
  const manifest = JSON.parse(bytes);
  // Exercise the production release verifier using an isolated, explicitly trusted test certificate.
  writeFileSync(join(version, 'latest.json'), JSON.stringify(catalog));
  const plan = { schema: 1, shell: 3, web, tag: `android-web-shell-3-web-${web}`, source: process.env.GITHUB_SHA || 'a'.repeat(40) };
  const certBytes = readFileSync(cert), pinned = hash(new X509Certificate(certBytes).raw);
  assert.doesNotThrow(() => verifyRelease(version, certBytes, plan, pinned));
  assert.throws(() => verifyRelease(version, certBytes, plan), /Original APK/);
  const sigPath = join(version, 'web-manifest.sig'), signature = readFileSync(sigPath);
  writeFileSync(sigPath, Buffer.alloc(signature.length));
  assert.throws(() => verifyRelease(version, certBytes, plan, pinned), /manifest signature/);
  writeFileSync(sigPath, signature);
  const objectPath = join(version, `file-${manifest.files[0].sha256}`), original = readFileSync(objectPath);
  writeFileSync(objectPath, 'tampered');
  assert.throws(() => verifyRelease(version, certBytes, plan, pinned));
  writeFileSync(objectPath, original);
  assert.equal(manifest.shell, 3); assert.equal(manifest.web, web); assert.equal(manifest.schema, 1);
  assert.equal(manifest.packageSha256, catalog.sha256); assert.equal(manifest.packageBytes, catalog.bytes);
  assert.equal(manifest.files.length, 3);
  for (const file of manifest.files) {
    const expected = readFileSync(join(dist, file.path));
    assert.equal(file.bytes, expected.length); assert.equal(file.sha256, hash(expected));
    assert.deepEqual(readFileSync(join(version, `file-${file.sha256}`)), expected);
  }
}
const manifests = [2, 3].map(web => JSON.parse(readFileSync(join(temp, `releases/shell-3/web-${web}/web-manifest.json`))));
const changed = manifests[1].files.filter(file => !manifests[0].files.some(old => old.path === file.path && old.sha256 === file.sha256));
assert.deepEqual(changed.map(file => file.path), ['assets/app.js']);
writeFileSync(join(root, 'delta-pack-fixture.json'), JSON.stringify({ temp }));
console.log('PASS signed manifests, exact object bytes, legacy COZ1 signatures/catalogs, unchanged font and changed JS');
