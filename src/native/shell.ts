import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type SafeArea = {
  top: number; right: number; bottom: number; left: number;
  keyboardVisible: boolean; keyboardViewportHeight: number;
  startupToken?: number;
};

export type WebUpdateProgress = {
  stage: 'downloading' | 'verifying' | 'installing'; received: number; total: number;
};

let resolvePageReady: () => void;
export const androidPageReady = new Promise<void>(resolve => { resolvePageReady = resolve; });
export function signalAndroidPageReady() { resolvePageReady(); }

export const AndroidShell = /* @__PURE__ */ registerPlugin<{
  getSafeArea(): Promise<SafeArea>;
  homeBack(options: { exit: boolean }): Promise<void>;
  ready(options: { startupToken?: number; darkStatusIcons: boolean; darkNavigationIcons: boolean }): Promise<void>;
  updateInfo(): Promise<{ shell: number; web: number; outcome?: 'installed' | 'rolledBack' }>;
  checkOnlineUpdate(options: { retryFailed: boolean; prerelease: boolean }): Promise<{ configured: boolean; release?: { web: number; bytes: number } }>;
  installOnlineUpdate(options: { web: number }): Promise<void>;
  addListener(event: 'webUpdateProgress', handler: (value: WebUpdateProgress) => void): Promise<PluginListenerHandle>;
  importUpdate(): Promise<void>;
  restoreBundled(): Promise<void>;
}>('CozyAndroidShell');
