import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

export default defineConfig({
  plugins: [react(), reviewBuildInfo()],
  server: { host: '0.0.0.0' },
});

