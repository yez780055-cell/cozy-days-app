# 小饱日常 Android 原生外壳实验

实验基于远端 `main` 的 `e7f488d2c70c344ac9b64035ffe80e4d02bba50a`。应用名为「小饱日常 · 原生测试」，独立包名为 `com.littledays.capacitorexperiment`。实验、TWA 和正式 PWA 各自使用自己的存储。

## 启动和存储

Capacitor 在 `https://localhost` 提供 APK 内置的 React、字体和插图。首次启动也可离线。现有 Dexie 和 IndexedDB 继续使用同一 WebView 来源，导入网页包和同证书覆盖安装均沿用此来源。卸载或清除应用数据会删除本机记录，需提前用现有备份功能导出。

Android 构建使用独立入口。它由原生窗口传入系统栏、屏幕缺口和手势区域的安全距离，React 只为正文和交互留出相应空间，页面背景延伸到透明系统栏背后。系统栏图标按当前页面使用的画布色和底栏色计算对比度。Android 7/7.1 的导航键仅支持亮色图标，因此这两个版本保留黑色导航背景。Android 17 兼容性以 API 37 运行验证为准，实验当前沿用 `targetSdk 35`。

正式 PWA 继续通过现有 Service Worker 提供离线和更新。Android 使用本地资源和签名网页包，无需注册 Service Worker。

## 用户更新流程

- 网页更新。在「设置 → Android 版本 → 导入网页更新」选择 `.cozyupdate` 文件。签名须匹配安装的 APK，且网页包须匹配当前外壳版本。验证通过后应用自动重新加载，首页重新打开。可在同一处恢复 APK 内置网页。启动握手超时或加载过程被中断时，外壳会恢复内置网页。
- 原生更新。将较高版本号、采用同一个实验签名的 APK 覆盖安装。新 APK 启用自己的内置网页，随后可导入为新外壳签发的网页包。原生插件、权限、启动页、窗口处理和网页包协议的改动通过 APK 更新。
- 内置网页通过文件分发网页包。导入启用在线检查的网页包后，可按[网页更新发布流程](android-web-update-release.md)检查并下载新版本。发布包应先在同版本外壳上验收。恢复内置网页依赖数据库向下兼容，所以网页包只用于与内置版本共用同一数据模型和原生 API 的 UI 和业务更新。

## 构建

使用 Node、JDK 21 和 Android SDK 35。为实验单独生成 RSA 2048 或更高强度的 PKCS#12 密钥，设置 `COZY_EXPERIMENT_KEYSTORE`、`COZY_EXPERIMENT_STORE_PASSWORD`、`COZY_EXPERIMENT_KEY_ALIAS`、`COZY_EXPERIMENT_KEY_PASSWORD`。同一个实验签名用于后续 APK 和网页包。版本号默认 4，可用 `COZY_EXPERIMENT_VERSION_CODE` 提升。

```powershell
npm ci
npm run android:sync
Push-Location android
try { .\gradlew.bat :app:assembleRelease } finally { Pop-Location }
```

Windows 工作目录路径含中文时，构建命令可加 `-Pandroid.overridePathCheck=true`。

网页包分别指定目标 APK 的 `versionCode` 和此 APK 要安装的网页修订号。内置网页修订号为 1。

```powershell
npm run build:android
java scripts/PackAndroidWeb.java dist-android 4 2 artifacts/Cozy-Days-Web-Update-2.cozyupdate
```

## Android 交互回归

先运行 `npm run build:android`，再运行 `npx playwright test --config playwright.android.config.ts`，检查键盘下的可视区域、滚动、草稿保护和逐层返回。实际系统键盘与返回键可在独立模拟器上验证。启动签名调试包并用 ADB 转发其 WebView 调试套接字后，运行 `node tests-android/device-qa.mjs <本地端口> <模拟器序列号>`。
