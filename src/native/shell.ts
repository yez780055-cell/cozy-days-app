import { registerPlugin } from '@capacitor/core';

export type SafeArea = { top: number; right: number; bottom: number; left: number };

export const AndroidShell = /* @__PURE__ */ registerPlugin<{
  getSafeArea(): Promise<SafeArea>;
  ready(options: { darkStatusIcons: boolean; darkNavigationIcons: boolean }): Promise<void>;
  updateInfo(): Promise<{ shell: number; web: number }>;
  importUpdate(): Promise<void>;
  restoreBundled(): Promise<void>;
}>('CozyAndroidShell');
