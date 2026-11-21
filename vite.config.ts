import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pwaBuild } from './scripts/pwa-build';

function reviewBuildInfo() {
  let outDir = resolve(process.cwd(), 'dist');
  return {
    name: 'review-build-info',
    apply: 'build' as const,
    configResolved(config: { build: { outDir: string }; root: string }) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const cloudflarePages = ['1', 'true'].includes((process.env.CF_PAGES || '').toLowerCase());
      const branch = process.env.CF_PAGES_BRANCH || process.env.GITHUB_REF_NAME || 'local';
      const info = {
        commit: process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || 'local',
        branch,
        mode: cloudflarePages ? (branch === 'main' ? 'production' : 'preview') : (process.env.CI ? 'ci' : 'local'),
        builtAt: new Date().toISOString(),
        previewUrl: process.env.CF_PAGES_URL || null,
      };
      const path = resolve(outDir, 'review', 'build-info.json');
      mkdirSync(resolve(outDir, 'review'), { recursive: true });
      writeFileSync(path, `${JSON.stringify(info, null, 2)}\n`);
    },
  };
}

const androidEntry: Plugin = {
  name: 'cozy-days-android',
  transformIndexHtml: {
    order: 'pre',
    handler: html => html
      .replace('src="/src/main.tsx"', 'src="/src/native/main.ts"')
      .replace(/^\s*<link rel="manifest"[^>]+>$/m, ''),
  },
};

function androidPublicAssets(): Plugin {
  let root: string;
  let outDir: string;
  return {
    name: 'cozy-days-android-assets',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(root, config.build.outDir);
    },
    closeBundle() {
      for (const folder of ['assets', 'icons']) {
        cpSync(resolve(root, 'public', folder), resolve(outDir, folder), { recursive: true });
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  publicDir: mode === 'android' ? false : 'public',
  plugins: [react(), ...(mode === 'android' ? [androidEntry, androidPublicAssets()] : [reviewBuildInfo(), pwaBuild()])],
  server: { host: '0.0.0.0', watch: process.env.COZY_E2E_NO_WATCH === '1' ? null : undefined },
}));

