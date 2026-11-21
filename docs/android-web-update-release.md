# 小饱日常 Android 网页更新发布流程

## 后续 Android 版本默认交互

- 启动只在后台检查一次，不显示检查动画、遮罩、检查结果或网络错误，也不锁定正常使用。仅发现兼容、可安装的新网页版本时展示现有样式的更新提示。
- 点击「立即更新」才开始下载，显示原生回传的字节进度、现有动画、校验及安装状态。安装后的完成或自动回滚结果继续沿用现有反馈。
- 点击「稍后更新」后，本次页面运行不再自动检查或重复提示；切换更新通道也不触发自动复查。用户仍可主动在设置点击「检查更新」，查看检查状态、无更新、离线或失败结果，并再次选择更新。
- 自动检查失败时保留当前网页正常运行；不自动下载或安装。签名校验、自动安装、试运行失败回滚、离线启动、手动导入和恢复内置网页继续使用现有原生实现。
- 此规则是以后所有 Android 网页包及 APK 内置网页的默认行为。本轮仅修改网页层，无需更改原生外壳。已安装旧网页须先接收包含此变更的签名网页包才会采用新交互。

## 正式外壳 2 验收

正式候选包为 `com.littledays.app`，`versionName=0.2.2`，`versionCode=2`。正式签名沿用外壳 1 的证书 `c85fe70fff2425ad2b95d3dfa8f28ef7173027e744b03f57b721896fca40d3d8`。正式构建在现有 GitHub `android-release` 环境进行，沿用 `ANDROID_KEYSTORE_PATH`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS` 和 `ANDROID_KEY_PASSWORD`。构建前会签名随机数据并用固定证书验证。Gradle 同时核对待用密钥库的证书，正式构建使用默认 GitHub 更新源。

覆盖验收使用归档的同签名外壳 1。先在旧包的界面录入合成待办、纪念日、经期和流量日记，再用 `adb install -r` 安装正式候选包。更新后的应用导出记录供后续网页安装、失败回滚和离线启动逐项对比。

本轮正式候选包和正式签名测试网页包通过 Actions 制品交付。验证使用全新隔离模拟器。模拟器的本地代理模拟 GitHub Release API、资产地址和 CDN HTTPS 重定向，验收同一正式 APK 的默认网络路径。临时 TLS 信任仅存在于隔离模拟器。测试网页包的签名匹配正式 APK 证书，验收结束前没有新增 GitHub Release。

正式外壳的第一个网页包使用 `shell=2`，修订号从 2 开始。将来得到发布许可后，正式版清单和包应同属 `android-web-shell-2-web-<修订号>`。制品生成命令由 `.github/workflows/android-apk.yml` 保存。

正式签名使用 `release/android-*` 分支，在 Actions 手动运行 **Signed Android APK** 并传入目标 `version_code`。完整网页回归和正式签名挑战均通过后才组装 APK。工作流生成 `formal-apk` 制品；开启 `sign_qa_fixtures` 才额外生成隔离验收用网页包。

已验收制品 `Cozy-Days-Android-0.2.2-2.apk` 的 SHA-256 为 `ed013395ce76df4c16f2aa93cd8b0bf28a970ea408423d97b0f91e030036d7a9`，构建源码为 `9b787f83092bbff0686a9d33287f2332adc4a81c`。CI 通过 Web E2E 168 项、Android 网页回归 13 项、Pages 与 PWA 5 项。 [签名构建及回归记录](https://github.com/yez780055-cell/cozy-days-app/actions/runs/44666634717)

API 37 模拟器使用同一 APK 验证正式外壳 `1 → 2` 直接覆盖安装、网页 `1 → 2 → 3` 连续更新、断网后恢复、校验和签名失败拦截、启动失败自动回滚、离线冷启动和手动导入。旧版合成待办、纪念日、经期和日记均保留，各阶段的完整导出记录一致。在线故障用例使用隔离的 HTTPS 更新源。

## 实验外壳 5 历史流程

外壳 `5` 使用公开 GitHub Releases 作为网页更新源。验收 APK 覆盖上一轮外壳 `4`，沿用 `com.littledays.capacitorexperiment` 和同一证书。应用默认检查普通 Release。需要验收 Pre-release 时，可在「设置 → Android 版本」打开「接收预发布网页更新」，然后点「检查更新」。同一 APK 可切换通道。通道偏好保存在本机。

## 生成和暂存

1. 先完成全量回归，并核对目标外壳的 `versionCode`。下面用外壳 `5` 及其首个网页修订 `2`。同一外壳后续发布须递增网页修订号。APK 内置修订号为 `1`。
2. 使用上一轮 APK 对应的发布 RSA 密钥。按现有本机签名流程注入 `COZY_EXPERIMENT_KEYSTORE`、`COZY_EXPERIMENT_STORE_PASSWORD`、`COZY_EXPERIMENT_KEY_ALIAS` 和 `COZY_EXPERIMENT_KEY_PASSWORD`。签名前对照上轮 APK 的证书 SHA-256 `04b3957c60fdbe0e05f257a1fce99c4d501df58dfec76777aaea032aefda9a9c`。签名材料留在安全的本机存储。
3. 在项目根目录生成网页包。此步骤只构建网页资源。

   ```powershell
   npm run build:android
   java scripts/PackAndroidWeb.java dist-android 5 2 artifacts/Cozy-Days-Web-5-2.cozyupdate artifacts/android-web-release
   ```

4. 将签发的 `Cozy-Days-Web-5-2.cozyupdate` 和 `shell-5/latest.json` 作为同一 Pre-release 的资产上传。标签为 `android-web-shell-5-web-2`，应指向生成网页包的已审阅提交。先在草稿中上传两个资产和核验，再发布为 Pre-release。
5. 匿名打开 [发布列表 API](https://api.github.com/repos/yez780055-cell/cozy-days-app/releases?per_page=100)。确认标签、`draft=false`、`prerelease=true` 及两个资产均存在。通过资产的 `browser_download_url` 下载两份文件，检查清单中的 `schema`、`shell`、`web`、`bytes` 和 `sha256`，校验下载的包与本地签发包一致。
6. 确认本地和暂存验证通过，清除本地夹具变量 `COZY_ANDROID_WEB_UPDATE_ROOT` 和 `COZY_ANDROID_WEB_UPDATE_QA_CA`。使用相同密钥及 `COZY_EXPERIMENT_VERSION_CODE=5` 同步 Web 资源并构建一次签名 APK。
7. 在隔离设备覆盖安装外壳 `4 → 5`。先验证默认通道不会收到 Pre-release，再开启预发布，检查并安装已验证的网页更新。对照覆盖安装前后导出的待办、纪念日和生理期记录，并验证离线冷启动、手动导入、更新中断及试运行回滚。
8. 验收结束后保持 Pre-release，等待发布批准。正式通道使用普通 Release。为同一外壳发布较高修订时，将其设为 Latest；当 Latest 是其他类型的发布时，应用会在最近 100 条公开发布中查找兼容版本。

APK 通过 [正式 Release API](https://api.github.com/repos/yez780055-cell/cozy-days-app/releases/latest) 检查正式版本，不携带 GitHub Token。它从仓库的 Release 下载路径请求资产，仅跟随到受限的 GitHub CDN HTTPS 地址。更新包大小和 SHA-256 必须与清单一致，RSA 签名须匹配 APK 证书。GitHub API 暂不可用或限流时继续使用本地网页。

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

网页测试模拟 Capacitor 桥接。Windows 使用本机 Edge 时可先设置 `$env:PLAYWRIGHT_CHANNEL = 'msedge'`。原生测试使用 `tests-android/update-fixture.mjs` 和 `tests-android/native-update-qa.ps1`，只连接模拟器及回环 HTTPS。生产构建使用系统信任链，清除 `COZY_ANDROID_WEB_UPDATE_QA_CA` 和 `COZY_ANDROID_WEB_UPDATE_ROOT` 后使用默认 GitHub 源。可用 `tests-android/GitHubWebReleaseProbe.java` 在已联网的隔离 Android 模拟器验证原生 API 和 CDN 数据传输。

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
