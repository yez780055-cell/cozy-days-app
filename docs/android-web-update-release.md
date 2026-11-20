# 小饱日常 Android 网页更新发布流程

外壳 `4` 内置一键网页更新。使用同签名 APK 覆盖安装后，应用启动时检查对应外壳的发布清单。点「立即更新」后，应用内下载、校验、安装并重新打开网页。设置可查看修订号和状态，也可手动检查或导入签名包。

## 生成与发布

1. 确认目标 APK 的 `versionCode` 和当前最高已发布网页修订号。下例用外壳 `4` 和网页修订 `2`。网页修订号应高于此目标外壳的所有已发布版本。内置修订号为 `1`。
2. 按现有签名流程在本地配置 `COZY_EXPERIMENT_KEYSTORE`、`COZY_EXPERIMENT_STORE_PASSWORD`、`COZY_EXPERIMENT_KEY_ALIAS` 和 `COZY_EXPERIMENT_KEY_PASSWORD`。网页包须使用目标 APK 对应的 RSA 签名密钥。
3. 首次构建目标 APK 时，用 `COZY_ANDROID_WEB_UPDATE_ROOT` 指定该外壳的 HTTPS 发布根目录。后续签发网页包时，在项目根目录执行下列命令。替换示例版本号。此步骤只构建网页资源。

   ```powershell
   npm run build:android
   java scripts/PackAndroidWeb.java dist-android 4 2 artifacts/Cozy-Days-Web-4-2.cozyupdate artifacts/android-web-release
   ```

4. 在隔离模拟器用现有同签名 APK 导入该包，验证网页修订号、数据读写、离线重启和手动恢复。核对本地包、在线包及清单中的 SHA-256 一致。
5. 先上传 `shell-4/web-2/Cozy-Days-Web-4-2.cozyupdate`，再发布 `shell-4/latest.json`。版本目录使用不可变 URL。清单使用 `Cache-Control: no-store`，包含 `schema`、`shell`、`web`、`bytes` 和 `sha256`。根目录、清单和文件都通过 HTTPS 直接响应。
6. 用目标 APK 从应用内检查并安装，核对进度、成功提示和当前版本。可以直接分发同一个签名网页包供手动导入。外壳 `3` 仍使用旧的手动安装流程。

## 安装、失败与恢复

- 原生层下载到缓存目录，校验整个 `.cozyupdate` 的长度和 SHA-256，再按 APK 的证书校验签名。下载或校验失败时，应用继续使用当前网页版本，并提供重试入口。
- 手动入口仍可直接导入既有签名包。外壳验证签名和版本，写入临时目录并解包到暂存目录，验证后切换资源目录。安装保留原 WebView 源 `https://localhost` 和 IndexedDB 架构。
- 新页面未在 15 秒内完成启动握手，或试运行被进程中断时，外壳会恢复上一稳定版本。没有可用的上一稳定版本时，使用 APK 内置修订 `1`。回滚后可在设置重新检查。出现线上回归时，可撤下问题清单，并将上一稳定内容以更高修订号重新签发。

## 本地验证命令

```powershell
npm run build:android
npx playwright test --config playwright.android.config.ts
npx playwright test tests/data-safety.spec.ts --config playwright.config.ts
```

网页测试模拟 Capacitor 桥接。Windows 使用本机 Edge 时可先设置 `$env:PLAYWRIGHT_CHANNEL = 'msedge'`。原生测试使用 `tests-android/update-fixture.mjs` 和 `tests-android/native-update-qa.ps1`，只连接模拟器及回环 HTTPS。生产构建使用系统信任链，清除 `COZY_ANDROID_WEB_UPDATE_QA_CA` 并设置正式 HTTPS 根目录。

## 外壳 4 验收

- 测试 APK 为 `0.2.1-experiment.4`，`versionCode` 为 `4`。包名为 `com.littledays.capacitorexperiment`，签名证书与外壳 `3` 一致。统一构建的 APK 使用 `https://127.0.0.1:4474/` 和本地验收证书。模拟器通过 `adb reverse tcp:4474 tcp:4474` 访问测试源。
- Android API 37 模拟器覆盖安装 `3 → 4`，再依次在线安装网页修订 `1 → 2 → 3`。每次升级后重新导出备份，待办、纪念日、生理期记录与升级前逐项一致。
- 测试源分别中断下载、返回错误 SHA-256 和提供签名不匹配的包。三次更新均被拦截，应用保留修订 `3`。随后安装签名有效但缺少启动握手的修订 `4`，应用自动回到上一稳定网页修订 `3`，三类数据仍与基线一致。
- 模拟器无默认网络时冷启动，应用继续运行网页修订 `3`。在同一离线环境通过设置手动导入签名包，成功安装修订 `5`。两次导出的三类数据均与基线一致。
- 模拟器下载修订 `3` 时实际显示 `16%` 和 `48%`，对应 `6.8 MB / 41.1 MB` 与 `19.8 MB / 41.1 MB`。Android 网页 Playwright 12 项通过，另验证校验与安装等待、动画开启、减少动态效果和小屏键盘下的可视区域。
- Web 和 Pages 生产构建通过。Pages 与 PWA 回归 5 项通过。
- 全量 Web E2E 共 168 项，140 项通过、28 项失败。按用例 ID 在本轮开发前的提交 `48b1e27` 复测，28 项均复现失败。日志位于 `artifacts/native-update-v4-qa/web-e2e-final.log` 和 `artifacts/native-update-v4-qa/baseline-last-failed.log`。正式发布待全量回归通过后再准备。

## 外壳 3 历史验证结果

| 验证 | 结果 |
| --- | --- |
| Android 网页构建 | 通过。构建 HTML、JS、CSS 和静态资源。 |
| Android 网页 Playwright | 9 项通过。覆盖启动版本比较、稍后更新、设置页复查、外壳不匹配、离线、导入入口、连接中断、文件截断和 SHA-256 不匹配。原生桥接在浏览器测试中使用模拟实现。 |
| IndexedDB 数据安全回归 | 6 项通过。覆盖待办、纪念日及生理期记录的备份、恢复和中断回滚。 |
| Pages 和 PWA 回归 | 5 项通过。覆盖三档屏幕、静态验收页及 PWA 离线重开和保存。 |
| 网页发布打包 | 使用独立测试证书生成签名包。手动包、发布包和清单的 SHA-256 一致。 |
| Android API 37 模拟器，现有外壳 3 | 通过。无默认网络时冷启动并导入同签名修订 `101`，合成待办仍可读取。篡改包被拒绝并保留 `101`。签名有效但缺少启动握手的修订 `102` 触发回退，恢复到内置修订 `1`，合成待办仍可读取。 |
