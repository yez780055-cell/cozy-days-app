import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function selectPublishedWebBaseline(releases, shell = 3) {
  if (![2, 3].includes(shell)) throw new Error('Unsupported target shell');
  const pattern = new RegExp(`^android-web-shell-${shell}-web-([1-9][0-9]*)$`);
  const published = releases.filter(release => release.draft === false && release.prerelease === false)
    .map(release => ({ release, revision: Number(pattern.exec(release.tag_name)?.[1] ?? 0) }))
    .filter(entry => Number.isSafeInteger(entry.revision) && entry.revision > 0 && entry.revision <= 2147483647)
    .sort((a, b) => b.revision - a.revision);
  if (!published.length) throw new Error(`A published shell ${shell} baseline is required`);
  return published[0].release;
}

function publishedReleases() {
  return JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp',
    'repos/yez780055-cell/cozy-days-app/releases?per_page=100'], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })).flat();
}

export function planTests(paths, { tier = 'pr', fullRequested = false, schemaChanged = false } = {}) {
  if (!['pr', 'candidate', 'formal', 'full'].includes(tier)) throw new Error('Unknown validation tier');
  const changed = [...new Set(paths)];
  const migrations = changed.some(p => /^cloudbase\/\d+.*\.sql$/.test(p)
    || /^(src|migrations)\/.*(?:\/migrations?\/|migration|schema)/i.test(p));
  const criticalNative = changed.some(p => /^scripts\/(?:PackAndroidWeb|VerifyAndroidWeb)\.java$/.test(p) || /^android\/app\/src\/main\/java\/.*(?:OnlineWebUpdates|GitHubWebReleases|WebBundles)\.java$/.test(p));
  const full = tier === 'formal' || tier === 'full' || fullRequested || schemaChanged || migrations;
  const web = new Set();
  const modules = new Set();
  let cloud = false, android = tier === 'candidate' || criticalNative, nativeInteraction = false, pages = false;
  const add = (module, ...tests) => { modules.add(module); tests.forEach(t => web.add('tests/' + t + '.spec.ts')); };
  for (const p of changed) {
    if (/^src\/app\//.test(p)) add('app', 'home-ux', 'todo');
    if (/^src\/main\.tsx$/.test(p)) { cloud = true; modules.add('cloudbase'); }
    if (/^src\/(?:native\/(?:window|startupReadiness)|app\/App\.tsx|features\/home\/HomePage\.tsx|main\.tsx)|^tests\/startup-readiness/.test(p))
      add('startup', 'startup-readiness');
    if (/^src\/components\/(?:Modal|Sheet|DatePicker|Confirm)/.test(p)) add('shared-interaction', 'todo', 'anniversary-modal-guard');
    if (/^(?:vite|capacitor)\.config/.test(p)) android = true;
    if (/^src\/features\/todo\/|^tests\/(?:todo|swipe|categories-time)\./.test(p))
      add('todo', 'todo', 'todo-concurrency', 'categories-time', 'swipe');
    if (/^src\/features\/anniversary\/|^tests\/anniversary/.test(p)) {
      add('anniversary', 'anniversary', 'anniversary-storage');
      if (/date|timing|model\.ts$/i.test(p)) add('anniversary', 'anniversary-dates', 'anniversary-calendar', 'anniversary-timing-list');
      if (/photo|backup/i.test(p)) add('anniversary', 'anniversary-photo-backup');
    }
    if (/^src\/features\/period\/|^tests\/period/.test(p)) {
      add('period', 'period-model', 'period');
      if (/recovery/i.test(p)) add('period', 'period-recovery');
    }
    if (/^src\/features\/home\/|^tests\/home-ux/.test(p)) add('home', 'home-ux');
    if (/^src\/(?:components|styles|assets)\/|^public\/assets\//.test(p))
      add('appearance', 'apricot-foundation', 'decorations');
    if (/font/i.test(p) && /^src\//.test(p)) add('appearance', 'font-switcher');
    if (/^src\/data\/|^src\/features\/cloud\/|^cloudbase\/|^tests\/cloudbase|^playwright\.cloudbase/.test(p)) {
      cloud = true; modules.add('cloudbase');
    }
    if (/^src\/data\//.test(p)) add('data-concurrency', 'todo-concurrency');
    if (/^src\/data\//.test(p) && !/^src\/data\/cloud/.test(p)
      || /^src\/features\/settings\/Backup/.test(p)) add('data', 'data-safety', 'todo-concurrency');
    if (/^src\/features\/settings\//.test(p) && !/Backup/.test(p)) add('settings', 'font-switcher', 'data-safety');
    if (/^src\/native\/|^tests-android\/|^android\//.test(p)) { android = true; modules.add('android'); }
    if (/^src\/native\/(?:back|window)|^tests-android\/interaction/.test(p)) nativeInteraction = true;
    if (/^src\/PwaUpdate|^src\/pwa|^scripts\/pwa-|^tests\/pwa/.test(p)) add('pwa', 'pwa-update');
    if (/^src\/pwa|^src\/PwaUpdate|^scripts\/pwa-|^tests\/(?:pages|pwa)|^public\/(?:review|icons|manifest)|^vite\.config/.test(p))
      pages = true;
    if (/^tests\/.*\.spec\.ts$/.test(p) && !/\/(?:cloudbase|ci-smoke|pages|pwa)\.spec\.ts$/.test(p)) web.add(p);
  }
  if (!modules.size && changed.some(p => /^src\//.test(p))) add('shared-logic', 'todo', 'period-model', 'anniversary-dates');
  if (full) { cloud = true; android = true; pages = true; }
  const reasons = [
    ...(tier === 'formal' ? ['formal release'] : []),
    ...(tier === 'full' ? ['explicit full regression'] : []),
    ...(fullRequested ? ['critical change / architecture label'] : []),
    ...(migrations || schemaChanged ? ['database migration / schema change'] : []),
  ];
  // Shared by the PR gate and the reusable ART workflow, including gate changes.
  const nativeDelta = full || changed.some(p => /^android\/|^tests-android\/|^scripts\/(?:PackAndroidWeb|VerifyAndroidWeb|test-android|write-web-inventory)|^scripts\/ci-(?:plan|run)(?:\.test)?\.mjs$|^\.github\/workflows\/(?:verify-pr|android-delta-tests)\.yml$/.test(p));
  return { tier, full, reasons, modules: [...modules].sort(), smoke: true, cloud, android, pages, nativeDelta,
    webTests: [...web].sort(), androidInteraction: nativeInteraction || full,
    androidCloudSuite: full || cloud };
}

function git(...args) { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
export function collectPlan(env = process.env, readReleases = publishedReleases) {
  const event = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {};
  const labels = (event.pull_request?.labels ?? []).map(label => label.name);
  const fullRequested = env.CI_FULL === 'true' || labels.some(label => ['ci:full', 'critical-change', 'architecture'].includes(label));
  const shell = Number(env.CI_TARGET_SHELL ?? 3);
  if (![2, 3].includes(shell)) throw new Error('Unsupported target shell');
  let base = env.CI_CHANGE_BASE || event.pull_request?.base?.sha;
  if (!base) {
    // Explicit full validation needs no release baseline and never narrows its tests.
    base = ['formal', 'full'].includes(env.CI_TEST_TIER) || fullRequested
      ? 'HEAD' : selectPublishedWebBaseline(readReleases(), shell).tag_name;
  }
  const baseSha = git('rev-parse', '--verify', '--end-of-options', base + '^{commit}');
  const paths = git('diff', '--name-only', '-z', baseSha, 'HEAD', '--').split('\0').filter(Boolean);
  const schemaDiff = git('diff', '--unified=0', baseSha, 'HEAD', '--',
    'src/data/database.ts', 'src/data/localDatabase.ts', 'src/data/periodDatabase.ts', 'cloudbase');
  const schemaChanged = schemaDiff.split('\n').some(line => /^[+-](?![+-])/.test(line)
    && /(?:\.version\s*\(|\.stores\s*\(|\.upgrade\s*\(|\b(?:DATABASE_VERSION|SCHEMA_VERSION)\b|\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|SCHEMA|COLUMN)\b)/i.test(line));
  const plan = planTests(paths, { tier: env.CI_TEST_TIER || 'pr', schemaChanged,
    fullRequested });
  return { ...plan, targetShell: shell, base: baseSha, source: git('rev-parse', 'HEAD'), changedFiles: paths };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = collectPlan();
  writeFileSync('ci-test-plan.json', JSON.stringify(plan, null, 2) + '\n');
  console.log(JSON.stringify(plan, null, 2));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `native=${plan.nativeDelta}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '## Validation plan\n\nTier: **' + (plan.full ? 'full' : plan.tier) + '**\n\nModules: '
    + (plan.modules.join(', ') || 'build and smoke only') + '\n\nFull gate: '
    + (plan.reasons.join('; ') || 'not requested') + '\n');
}
