import { spawnSync, fork } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error('Set ANDROID_HOME');
const out = resolve('artifacts/delta-native');
const classes = join(out, 'classes'), dex = join(out, 'dex');
mkdirSync(classes, { recursive: true }); mkdirSync(dex, { recursive: true });
const bin = name => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : '')) : name;
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
  return result.stdout;
}
const pkg = 'com/littledays/app';
run(process.execPath, ['scripts/test-android-pack.mjs']);
const { temp } = JSON.parse(readFileSync('artifacts/delta-pack-fixture.json'));
const server = fork('tests-android/delta-network-server.mjs', [temp], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
const [{ port }] = await once(server, 'message');
const pem = readFileSync(join(temp, 'test.pem'), 'utf8');
try {
  writeFileSync(join(out, 'BuildConfig.java'), `package com.littledays.app; public final class BuildConfig { public static final int VERSION_CODE=3; public static final String WEB_UPDATE_ROOT="https://127.0.0.1:${port}/", WEB_UPDATE_QA_CA=${JSON.stringify(pem)}; }`);
  const source = resolve('android/app/src/main/java', pkg);
  const android = join(sdk, 'platforms/android-35/android.jar');
  run(bin('javac'), ['-encoding', 'UTF-8', '--release', '17', '-cp', android, '-d', classes,
    ...['WebFileManifest', 'DeltaWebUpdates', 'OnlineWebUpdates', 'GitHubWebReleases', 'WebBundles'].map(name => join(source, name + '.java')),
    'tests-android/DeltaUpdateProbe.java', 'tests-android/DeltaNetworkProbe.java', join(out, 'BuildConfig.java')]);
  run(bin('java'), ['-cp', join(sdk, 'build-tools/35.0.0/lib/d8.jar'), 'com.android.tools.r8.D8',
    '--lib', android, '--min-api', '23', '--output', dex,
    ...readdirSync(join(classes, pkg)).filter(name => name.endsWith('.class')).map(name => join(classes, pkg, name))]);
  const adb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  const serial = process.env.ANDROID_SERIAL;
  if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a disposable emulator');
  const remote = '/data/local/tmp/cozy-delta-probe.dex';
  run(adb, ['-s', serial, 'push', join(dex, 'classes.dex'), remote]);
  const native = run(adb, ['-s', serial, 'shell', `CLASSPATH=${remote} app_process /system/bin com.littledays.app.DeltaUpdateProbe`]);
  assert.match(native, /PASS \d+ Android delta assertions/);
  run(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  try {
    const network = run(adb, ['-s', serial, 'shell', `CLASSPATH=${remote} app_process /system/bin com.littledays.app.DeltaNetworkProbe`]);
    assert.match(network, /PASS HTTPS delta transport/);
  } finally { run(adb, ['-s', serial, 'reverse', '--remove', `tcp:${port}`]); }
  server.send('requests');
  const [{ requests }] = await once(server, 'message');
  const manifest = JSON.parse(readFileSync(join(temp, 'releases/shell-3/web-3/web-manifest.json')));
  const changed = manifest.files.find(file => file.path === 'assets/app.js');
  assert.deepEqual(requests.filter(path => path.startsWith('/normal/file-')), [`/normal/file-${changed.sha256}`]);
  assert.equal(requests.filter(path => path.startsWith('/normal/') && path.endsWith('.cozyupdate')).length, 0);
  console.log('PASS request log proves unchanged HTML/font were never downloaded and normal update skipped full package');
} finally { server.kill(); }
