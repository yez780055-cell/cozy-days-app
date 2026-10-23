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
      const info = {
        commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local',
        branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || 'local',
        pullRequest: process.env.VERCEL_GIT_PULL_REQUEST_ID || null,
        builtAt: new Date().toISOString(),
        mode: process.env.VERCEL_ENV || (process.env.CI ? 'ci' : 'local'),
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

