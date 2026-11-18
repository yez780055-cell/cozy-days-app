import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

export function pwaBuild(): Plugin {
  let outDir: string;
  let workerPath: string;
  return {
    name: 'cozy-days-pwa',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      workerPath = resolve(config.root, 'scripts/pwa-worker.js');
    },
    closeBundle() {
      const paths = readdirSync(outDir, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => resolve(entry.parentPath, entry.name).slice(outDir.length + 1).replaceAll('\\', '/'))
        .filter(path => /^(assets|icons)\//.test(path))
        .sort();
      // Large optional fonts are cached on use. They cannot delay offline readiness.
      const fonts = paths.filter(path => path.endsWith('.woff2'));
      const shell = ['index.html', 'manifest.webmanifest', ...paths.filter(path => !path.endsWith('.woff2'))];
      const entries = shell.map(path => ({
        path,
        integrity: `sha256-${createHash('sha256').update(readFileSync(resolve(outDir, path))).digest('base64')}`,
      }));
      const worker = readFileSync(workerPath, 'utf8');
      const assets = JSON.stringify({ entries, fonts });
      const version = createHash('sha256').update(worker).update(assets).digest('hex');
      writeFileSync(resolve(outDir, 'sw.js'), `const VERSION = ${JSON.stringify(version)};\nconst ASSETS = ${assets};\n${worker}`);
    },
  };
}
