import { type Page } from '@playwright/test';

type Outcome = 'installed' | 'rolledBack';
export type Fixture = {
  web: number; checks: boolean[]; prereleaseChecks: boolean[]; installs: number[];
  offers: boolean; checkError: boolean; manualError: boolean;
  readyCalls: { startupToken?: number | null; darkStatusIcons?: boolean; darkNavigationIcons?: boolean }[];
  readyAcknowledged: number; safeAreaRequested: boolean; releaseSafeArea(): void;
  update(stage: string, received?: number, total?: number): void;
  fail(message: string): void;
};

export async function mockShell(page: Page, options: { offline?: boolean; outcome?: Outcome; current?: boolean; checkDelay?: number; checkError?: boolean;
  holdSafeArea?: boolean; safeAreaError?: boolean; startupToken?: number | null; omitStartupToken?: boolean; readyError?: boolean } = {}, navigate = true) {
  await page.addInitScript(({ offline, outcome, current, checkDelay, checkError, holdSafeArea, safeAreaError, startupToken = 0, omitStartupToken, readyError }) => {
    if (offline) Object.defineProperty(navigator, 'onLine', { get: () => false });
    let offeredOutcome = outcome;
    let progress: ((value: unknown) => void) | undefined;
    let rejectInstall: ((error: Error) => void) | undefined;
    const bytes = 8 * 1024 * 1024;
    let releaseArea: (() => void) | undefined;
    let areaReleased = !holdSafeArea;
    const fixture: Fixture = {
      web: 2, checks: [], prereleaseChecks: [], installs: [], offers: !current, checkError: !!checkError, manualError: false,
      readyCalls: [], readyAcknowledged: 0, safeAreaRequested: false,
      releaseSafeArea: () => { areaReleased = true; releaseArea?.(); },
      update: (stage, received = 0, total = bytes) => progress?.({ stage, received, total }),
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
        async nativePromise(_: string, method: string, args: { retryFailed: boolean; prerelease: boolean; web: number; startupToken?: number | null; darkStatusIcons?: boolean; darkNavigationIcons?: boolean }) {
          if (method === 'getSafeArea') {
            fixture.safeAreaRequested = true;
            if (!areaReleased) await new Promise<void>(resolve => { releaseArea = resolve; });
            if (safeAreaError) throw new Error('Synthetic safe area failure');
            return { top: 30, right: 0, bottom: 24, left: 0, ...(omitStartupToken ? {} : { startupToken }), keyboardVisible: false, keyboardViewportHeight: 0 };
          }
          if (method === 'ready') {
            fixture.readyCalls.push(structuredClone(args));
            if (readyError) throw new Error('Synthetic ready rejection');
            fixture.readyAcknowledged++;
            return;
          }
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
