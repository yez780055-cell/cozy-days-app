import { createHash } from 'node:crypto';
import { createServer } from 'node:https';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

const [directory, pfx, shellArg, portArg] = process.argv.slice(2);
const shell = Number(shellArg);
const port = Number(portArg);
if (!directory || !pfx || !Number.isInteger(shell) || !Number.isInteger(port)) {
  throw new Error('Usage: node tests-android/update-fixture.mjs <fixture-root> <tls.p12> <shell> <port>');
}

const prefix = `/shell-${shell}`;
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
  current = { web, mode, bytes, sha256, payload, path: `${prefix}/web-${web}/${name}` };
  return current;
}

const server = createServer({ pfx: readFileSync(pfx), passphrase: process.env.COZY_FIXTURE_TLS_PASSWORD }, async (req, res) => {
  try {
    const release = scenario();
    if (release && req.url === `${prefix}/latest.json`) {
      const { web, bytes, sha256 } = release;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ schema: 1, shell, web, bytes, sha256 }));
    } else if (release && req.url === release.path) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': release.bytes });
      const chunk = release.mode === 'cut' ? Math.min(256 * 1024, Math.ceil(release.bytes / 4)) : 256 * 1024;
      for (let offset = 0; offset < release.bytes && !res.destroyed; offset += chunk) {
        if (release.mode === 'cut' && offset >= Math.min(4 * chunk, release.bytes / 2)) {
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
