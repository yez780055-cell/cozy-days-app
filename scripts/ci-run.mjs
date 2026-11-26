import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { collectPlan } from './ci-plan.mjs';

const plan = collectPlan();
writeFileSync('ci-test-plan.json', JSON.stringify(plan, null, 2) + '\n');
console.log('Validation:', JSON.stringify(plan));
const npm = process.env.npm_execpath;
if (!npm || !existsSync(npm)) throw new Error('Run through npm run test:ci');
const dry = process.env.CI_DRY_RUN === 'true';
if (dry && process.env.CI === 'true') throw new Error('Dry runs cannot satisfy a CI quality gate');
function run(args, env = {}) {
  console.log('> npm', ...args);
  if (dry) return;
  const result = spawnSync(process.execPath, [npm, ...args], {
    stdio: 'inherit', env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const legacy = { VITE_CLOUDBASE_ENABLED: 'false' };
const unified = { VITE_CLOUDBASE_ENABLED: 'true' };
const playwright = (...args) => ['exec', '--', 'playwright', 'test', ...args, '--reporter=line'];
run(['run', 'build'], unified);
run(playwright('--config', 'playwright.smoke.config.ts'));
// Full Web includes PWA update tests which read the Pages output directly.
if (plan.pages) run(['run', 'build:pages'], legacy);
if (plan.full || plan.webTests.length) {
  run(['run', 'build'], legacy);
  run(plan.full ? ['run', 'test:e2e', '--', '--reporter=line'] : playwright(...plan.webTests));
}
if (plan.pages) {
  run(['run', 'test:pages', '--', '--reporter=line']);
}
if (plan.android) {
  run(['run', 'build:android'], legacy);
  run(playwright('--config', 'playwright.android.config.ts',
    ...(plan.androidInteraction ? [] : ['web-update.spec.ts'])));
}
if (plan.cloud) run(['run', 'test:cloudbase', '--', '--reporter=line']);
if (plan.android || plan.cloud) {
  run(['run', 'build:android'], unified);
  run(playwright('--config', 'playwright.cloudbase.android.config.ts',
    ...(plan.androidCloudSuite ? [] : ['--grep', 'unified Android'])));
}
if (plan.tier === 'candidate' || plan.tier === 'formal')
  console.log('Only the tested unified dist-android resources may enter the signing job.');
