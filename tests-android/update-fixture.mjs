import { createHash } from 'node:crypto';
import { createServer } from 'node:https';
import { createServer as createProxy } from 'node:http';
import { connect } from 'node:net';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

const [directory, pfx, shellArg, portArg, proxyArg] = process.argv.slice(2);
const shell = Number(shellArg);
const port = Number(portArg);
const proxyPort = proxyArg === undefined ? undefined : Number(proxyArg);
if (!directory || !pfx || !Number.isInteger(shell) || !Number.isInteger(port)) {
  throw new Error('Usage: node tests-android/update-fixture.mjs <fixture-root> <tls.p12> <shell> <port> [local-github-proxy-port]');
}

const prefix = `/shell-${shell}`;
const repository = 'yez780055-cell/cozy-days-app';
const releasesApi = `/repos/${repository}/releases`;
const cdn = 'release-assets.githubusercontent.com';
let current;

function scenario() {
  const value = JSON.parse(readFileSync(resolve(directory, 'scenario.json'), 'utf8'));
  const { web, mode = 'normal' } = value;
  if (!Number.isInteger(web) || web < 2 || !['normal', 'cut', 'hash', 'signature'].includes(mode)) return;
  if (current?.web === web && current.mode === mode) return current;
  const name = `Cozy-Days-Web-${shell}-${web}.cozyupdate`;
  const archive = resolve(directory, `shell-${shell}`, `web-${web}`, name);
  const bytes = statSync(archive).size;
  const payload = readFileSync(archive);
  if (mode === 'signature') payload[payload.length - 1] ^= 1;
  const sha256 = mode === 'hash' ? '0'.repeat(64) : createHash('sha256').update(payload).digest('hex');
  const tag = `android-web-shell-${shell}-web-${web}`;
  const manifest = JSON.stringify({ schema: 1, shell, web, bytes, sha256 });
  const assetRoot = `/${repository}/releases/download/${tag}/`;
  const asset = (name, size) => ({ name, size, state: 'uploaded', browser_download_url: `https://github.com${assetRoot}${name}` });
  const github = { tag_name: tag, draft: false, prerelease: false,
    assets: [asset('latest.json', Buffer.byteLength(manifest)), { ...asset(name, bytes), digest: `sha256:${sha256}` }] };
  current = { web, mode, bytes, sha256, payload, path: `${prefix}/web-${web}/${name}`, manifest, github, assetRoot, name };
  return current;
}

const server = createServer({ pfx: readFileSync(pfx), passphrase: process.env.COZY_FIXTURE_TLS_PASSWORD }, async (req, res) => {
  try {
    const release = scenario();
    const host = req.headers.host;
    const githubAsset = proxyPort && host === 'github.com' && release && req.url.startsWith(release.assetRoot);
    if (proxyPort && host === 'api.github.com' && req.url === `${releasesApi}/latest`) {
      res.writeHead(release ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(release?.github ?? {}));
    } else if (proxyPort && host === 'api.github.com' && req.url === `${releasesApi}?per_page=100`) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(release ? [release.github] : []));
    } else if (githubAsset) {
      const name = req.url.slice(release.assetRoot.length);
      if (name === 'latest.json' || name === release.name) res.writeHead(302, { Location: `https://${cdn}/fixture/${name}` }).end();
      else res.writeHead(404).end();
    } else if (release && (req.url === `${prefix}/latest.json` ||
      (proxyPort && host === cdn && req.url === '/fixture/latest.json'))) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(release.manifest);
    } else if (release && (req.url === release.path || (proxyPort && host === cdn && req.url === `/fixture/${release.name}`))) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': release.bytes });
      const chunk = release.mode === 'cut' ? Math.min(256 * 1024, Math.ceil(release.bytes / 4)) : 256 * 1024;
      for (let offset = 0; offset < release.bytes && !res.destroyed; offset += chunk) {
        if (release.mode === 'cut' && offset >= Math.min(4 * chunk, release.bytes / 2)) {
          process.stdout.write(`${req.url} cut after ${offset} of ${release.bytes} bytes\n`);
          res.destroy();
          return;
        }
        res.write(release.payload.subarray(offset, offset + chunk));
        await pause(75);
      }
      res.end();
    } else {
      res.writeHead(404).end();
    }
    process.stdout.write(`${req.url} ${release?.mode ?? 'none'} ${res.statusCode}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

server.listen(port, '127.0.0.1', () => process.stdout.write(`Fixture HTTPS server on 127.0.0.1:${port}\n`));

if (proxyPort !== undefined) {
  const proxy = createProxy((req, res) => res.writeHead(403).end());
  const hosts = new Set(['api.github.com:443', 'github.com:443', `${cdn}:443`]);
  proxy.on('connect', (req, client, head) => {
    client.on('error', () => client.destroy());
    if (!hosts.has(req.url)) return client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    const upstream = connect(port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client).pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
    client.on('close', () => upstream.destroy());
  });
  proxy.listen(proxyPort, '127.0.0.1', () => process.stdout.write(`Isolated GitHub fixture proxy on 127.0.0.1:${proxyPort}\n`));
}
