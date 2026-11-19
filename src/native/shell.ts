import { registerPlugin } from '@capacitor/core';

export type SafeArea = {
  top: number; right: number; bottom: number; left: number;
  keyboardVisible: boolean; keyboardViewportHeight: number;
};

export const AndroidShell = /* @__PURE__ */ registerPlugin<{
  getSafeArea(): Promise<SafeArea>;
  homeBack(options: { exit: boolean }): Promise<void>;
  ready(options: { darkStatusIcons: boolean; darkNavigationIcons: boolean }): Promise<void>;
  updateInfo(): Promise<{ shell: number; web: number }>;
  importUpdate(): Promise<void>;
  restoreBundled(): Promise<void>;
}>('CozyAndroidShell');
