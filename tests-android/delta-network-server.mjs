import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.argv[2];
const version = join(root, 'releases/shell-3/web-3');
const requests = [];
const server = createServer({ pfx: readFileSync(join(root, 'test.jks')), passphrase: 'fixture-only' }, (req, res) => {
  requests.push(req.url);
  const parts = req.url.split('/');
  const mode = parts[1], name = parts[2];
  if (name === 'signer.cer') return res.end(readFileSync(join(root, 'test.cer')));
  if (name === 'latest.json') return res.end(readFileSync(join(root, 'releases/shell-3/latest.json')));
  if (mode === 'missing' && name === 'web-manifest.json') return res.writeHead(404).end();
  try {
    let bytes = readFileSync(join(version, name));
    if ((mode === 'signature' || mode === 'fullfail') && name === 'web-manifest.sig') { bytes = Buffer.from(bytes); bytes[0] ^= 1; }
    if (mode === 'hash' && name.startsWith('file-')) bytes = Buffer.alloc(bytes.length);
    res.writeHead(200, { 'Content-Length': bytes.length });
    if ((mode === 'cut' && name.startsWith('file-')) || (mode === 'fullfail' && name.endsWith('.cozyupdate'))) {
      res.write(bytes.subarray(0, Math.floor(bytes.length / 2)));
      res.destroy();
    } else res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
process.on('message', () => process.send({ requests }));
