import { type Page } from '@playwright/test';

type Outcome = 'installed' | 'rolledBack';
export type Fixture = {
  web: number; checks: boolean[]; prereleaseChecks: boolean[]; installs: number[];
  offers: boolean; checkError: boolean; manualError: boolean;
  update(stage: string, received?: number): void;
  fail(message: string): void;
};

export async function mockShell(page: Page, options: { offline?: boolean; outcome?: Outcome; current?: boolean; checkDelay?: number; checkError?: boolean } = {}, navigate = true) {
  await page.addInitScript(({ offline, outcome, current, checkDelay, checkError }) => {
    if (offline) Object.defineProperty(navigator, 'onLine', { get: () => false });
    let offeredOutcome = outcome;
    let progress: ((value: unknown) => void) | undefined;
    let rejectInstall: ((error: Error) => void) | undefined;
    const bytes = 8 * 1024 * 1024;
    const fixture: Fixture = {
      web: 2, checks: [], prereleaseChecks: [], installs: [], offers: !current, checkError: !!checkError, manualError: false,
      update: (stage, received = 0) => progress?.({ stage, received, total: bytes }),
      fail: message => rejectInstall?.(new Error(message)),
    };
    Object.assign(window, {
      fixture, androidBridge: {},
      Capacitor: {
        PluginHeaders: [{ name: 'CozyAndroidShell', methods: [
          ...['getSafeArea', 'ready', 'updateInfo', 'checkOnlineUpdate', 'installOnlineUpdate', 'importUpdate', 'restoreBundled']
            .map(name => ({ name, rtype: 'promise' })),
          { name: 'addListener', rtype: 'callback' },
        ] }],
        async nativeCallback(_: string, method: string, _args: unknown, handler: (value: unknown) => void) {
          progress = method === 'addListener' ? handler : undefined;
          return 'fixture-listener';
        },
        async nativePromise(_: string, method: string, args: { retryFailed: boolean; prerelease: boolean; web: number }) {
          if (method === 'getSafeArea') return { top: 30, right: 0, bottom: 24, left: 0, startupToken: 0, keyboardVisible: false, keyboardViewportHeight: 0 };
          if (method === 'updateInfo') {
            const result = { shell: 4, web: fixture.web, outcome: offeredOutcome };
            offeredOutcome = undefined;
            return result;
          }
          if (method === 'checkOnlineUpdate') {
            fixture.checks.push(args.retryFailed);
            if (checkDelay) await new Promise(resolve => setTimeout(resolve, checkDelay));
            fixture.prereleaseChecks.push(args.prerelease);
            if (fixture.checkError) throw new Error('暂时无法连接更新源。');
            return { configured: true, release: fixture.offers ? { web: 3, bytes } : undefined };
          }
          if (method === 'installOnlineUpdate') {
            fixture.installs.push(args.web);
            return new Promise((_, reject) => { rejectInstall = reject; });
          }
          if (method === 'importUpdate') {
            if (fixture.manualError) throw new Error('更新未安装。');
            fixture.web = 3;
          }
          if (method === 'restoreBundled') fixture.web = 1;
        },
      },
    });
  }, options);
  if (navigate) await page.goto('/');
}
