# 小饱日常 Android 网页更新发布流程

适用于已有「导入网页更新」功能的 Capacitor 实验外壳。首次启用在线检查时，在现有 APK 内手动导入一次包含在线检查功能的签名 `.cozyupdate`。之后每次启动都检查对应外壳的发布清单。设置也可手动检查并查看当前网页修订号、外壳版本和状态。

## 生成与发布

1. 确认目标 APK 的 `versionCode` 和当前最高已发布网页修订号。下例用外壳 `3` 和网页修订 `3`。网页修订号应高于此目标外壳的所有已发布版本。内置修订号为 `1`。
2. 按现有签名流程在本地配置 `COZY_EXPERIMENT_KEYSTORE`、`COZY_EXPERIMENT_STORE_PASSWORD`、`COZY_EXPERIMENT_KEY_ALIAS` 和 `COZY_EXPERIMENT_KEY_PASSWORD`。网页包须使用目标 APK 对应的 RSA 签名密钥。
3. 设置已有静态 HTTPS 发布目录的根 URL。在项目根目录执行下列命令。替换示例地址和版本号。构建只输出网页资源。

   ```powershell
   $env:VITE_ANDROID_WEB_UPDATE_ROOT = 'https://updates.example.com/cozy-days/'
   npm run build:android
   java scripts/PackAndroidWeb.java dist-android 3 3 artifacts/Cozy-Days-Web-3-3.cozyupdate artifacts/android-web-release
   ```

4. 在隔离模拟器用现有同签名 APK 导入该包，验证网页修订号、数据读写、离线重启和手动恢复。核对本地包、在线包及清单中的 SHA-256 一致。
5. 将 `artifacts/android-web-release/shell-3/web-3/` 上传到发布根目录。先用浏览器访问 `download.html`，验证自动下载、SHA-256 校验和文件保存。已发布的版本目录使用不可变 URL。发布端必须提供 HTTPS，并把下载页和该版本的包置于同一源。
6. 最后发布 `shell-3/latest.json`，为清单设置 `Cache-Control: no-store` 和 `Access-Control-Allow-Origin: https://localhost`。清单响应应直接返回 JSON。下载页和网页包也应通过各自的 URL 直接响应。此更新检查使用匿名跨域请求。
7. 给仍使用内置网页或更早手动包的用户提供签名 `.cozyupdate`。启用在线检查的用户在启动或手动检查时看到提示。点「立即更新」打开系统浏览器并自动下载。SHA-256 通过后，选「保存网页包」，再返回应用点「选择网页包」，从下载目录选取该文件。设置中的手动导入入口继续可用。

## 安装、失败与恢复

- 浏览器校验整个 `.cozyupdate` 的长度和 SHA-256。下载中断、清单与下载页摘要不一致或校验失败时，浏览器不会提供保存入口。应用继续使用当前网页版本。
- 手动入口仍可直接导入既有签名包。外壳验证签名和版本，写入临时目录并解包到暂存目录，验证后切换资源目录。安装保留原 WebView 源 `https://localhost` 和 IndexedDB 架构。
- 原生外壳在新页面未完成启动握手时回退到 APK 内置网页修订 `1`。上一已下载的网页目录会在成功安装下一包时被清理。出现线上回归时，先下架问题清单，再将上一稳定网页内容以更高修订号重新签发并发布，供已安装问题版本的用户升级。
- 现有 APK 仅提供系统文件选择器安装接口。全自动安装和自动回退到上一已下载修订需要新增原生能力。本轮未重新构建 APK，未配置正式更新源，也未上传发布文件。

## 本地验证命令

```powershell
$env:VITE_ANDROID_WEB_UPDATE_ROOT = 'https://cozy-update.test/releases/'
npm run build:android
npx playwright test --config playwright.android.config.ts
npx playwright test tests/data-safety.spec.ts --config playwright.config.ts
```

测试会拦截示例域名的发布清单、下载页和包请求。Windows 使用本机 Edge 时可先设置 `$env:PLAYWRIGHT_CHANNEL = 'msedge'`。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| Android 网页构建 | 通过。构建 HTML、JS、CSS 和静态资源。 |
| Android 网页 Playwright | 9 项通过。覆盖启动版本比较、稍后更新、设置页复查、外壳不匹配、离线、导入入口、连接中断、文件截断和 SHA-256 不匹配。原生桥接在浏览器测试中使用模拟实现。 |
| IndexedDB 数据安全回归 | 6 项通过。覆盖待办、纪念日及生理期记录的备份、恢复和中断回滚。 |
| Pages 和 PWA 回归 | 5 项通过。覆盖三档屏幕、静态验收页及 PWA 离线重开和保存。 |
| 网页发布打包 | 使用独立测试证书生成签名包。手动包、发布包和清单的 SHA-256 一致。 |
| Android API 37 模拟器，现有外壳 3 | 通过。无默认网络时冷启动并导入同签名修订 `101`，合成待办仍可读取。篡改包被拒绝并保留 `101`。签名有效但缺少启动握手的修订 `102` 触发回退，恢复到内置修订 `1`，合成待办仍可读取。 |
