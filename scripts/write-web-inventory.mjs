import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// APK baseline inventory only; authentication comes from the APK signature.
const root = resolve(process.argv[2] || 'dist-android');
const paths = ['index.html', ...['assets', 'icons'].flatMap(folder =>
  readdirSync(join(root, folder), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath ?? entry.path, entry.name).slice(root.length + 1).replaceAll('\\', '/')))];
const files = paths.sort().map(path => {
  if (path !== 'index.html' && !/^(assets|icons)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)) throw new Error('Unsafe web file');
  const content = readFileSync(join(root, path));
  return { path, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') };
});
if (files.length > 1999 || files.reduce((n, file) => n + file.bytes, 0) > 96 * 1024 * 1024) throw new Error('Web inventory exceeds limits');
writeFileSync(join(root, 'cozy-files.json'), JSON.stringify({ schema: 1, files }) + '\n');
