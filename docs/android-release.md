# Android 0.2.1 发布

正式应用固定为 `com.littledays.app`，`versionName=0.2.1`，默认 `versionCode=1`。`ANDROID_VERSION_CODE` 可覆盖为不超过 2100000000 的正整数。Capacitor 默认源站保持 `https://localhost`；应用使用 APK 内置的 HTML、JS 和 CSS，不设置 `server.url`。不改变业务逻辑、数据库或权限。

## 长期签名与升级

正式签名证书 SHA-256：`C85FE70FFF2425AD2B95D3DFA8F28EF7173027E744B03F57B721896FCA40D3D8`。来源为首次 Android 交付时创建的固定 RSA 4096 发布证书（alias `cozy-days-release`，不是 debug 证书）。每次安装前比对 artifact 中的 `certificate.txt` 和 `release.json`。APK 的 SHA-256 在 `SHA256SUMS`；源码提交在 `release.json`。

签名凭据已存入受分支策略限制的 `android-release` Environment Secrets；本机仓库外有仅当前 Windows 用户可访问的加密 JKS 和 DPAPI 密码存档，并另存第二磁盘备份。DPAPI 备份依赖原 Windows 用户配置，不能当作跨机器密码恢复方案；更换系统前必须将密钥及密码转存个人安全密码库/离线介质，切勿把密码贴入聊天或公开文件。GitHub Secrets 可供后续 CI 签名，但不能从 GitHub 界面取回明文。

请长期离线保管同一签名密钥并安全备份密码。后续版本必须沿用同一包名、同一签名和更大的 versionCode，才能覆盖安装并保留应用数据。建议下一版 `0.2.2` 使用 code `2`；届时须同步修改 Gradle versionName、默认 versionCode、workflow_dispatch 的 version_code 默认值、验证器预期版本和 artifact 名称。不要卸载后重装来升级；卸载会移除应用私有数据。正式版也无法覆盖不同证书的 debug 包。发布流程不接触用户真实 IndexedDB。

回退也不能降低 versionCode：从已确认的 checkpoint 取回旧业务源码，沿用同一包名和签名，以高于已安装版本的 versionCode 重新打包并覆盖安装。回退过程不卸载应用、不清空数据库。

## 本地正式打包

安装 Node 22、JDK 21 和 Android SDK platform 35 / build-tools 35.0.0，配置 `ANDROID_HOME`。在仓库根目录运行：

```powershell
npm ci
npm run test:e2e
npm run build
npm run build:pages
npm run test:pages
npx cap sync android
# 使用本机安全凭据管理方式设置以下环境变量，不把密码写入仓库或日志。
$env:ANDROID_KEYSTORE_PATH = 'C:\secure\little-days-release.jks'
$env:ANDROID_KEYSTORE_PASSWORD = '<从安全存储注入>'
$env:ANDROID_KEY_ALIAS = '<正式别名>'
$env:ANDROID_KEY_PASSWORD = '<从安全存储注入>'
$env:ANDROID_VERSION_CODE = '1'
Push-Location android
try { .\gradlew.bat --no-daemon :app:assembleRelease } finally { Pop-Location }
python scripts/android-verify-apk.py android/app/build/outputs/apk/release/app-release.apk
```

Python 3 用于 ZIP、签名和资源检查。签名变量仅用于 release；任何 release 任务缺少完整凭据或密钥文件都直接失败，不回退为 debug/unsigned。密钥错误由 Android 签名工具拒绝。debug 日常构建不需要正式凭据。APK 路径为 `android/app/build/outputs/apk/release/app-release.apk`，无 ABI/density splits，为通用 APK。验证器仅允许 INTERNET 和 AndroidX Core 自动合并的应用内接收器保护权限 `com.littledays.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`，并拒绝 debug 证书、错误版本、远程 server.url、源站变更和缺失内置 JS/CSS。

## GitHub Actions

GitHub Environment `android-release` 的 Secrets 由发布负责人设置：`ANDROID_KEYSTORE_BASE64`（上述长期密钥的 Base64）、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。该 Environment 仅允许 `release/android-*` 和 `main` 分支部署；其他分支的手动运行会被 Environment 策略阻止签名。绝不上传到代码、Issue、日志或 artifact。CI 将密钥解码到 runner 临时目录，设置私有权限，构建后通过 trap 和 always 步骤清理。

推送 `release/android-*` 分支会以 code 1 构建；也可在 **Signed Android APK** 的 `workflow_dispatch` 输入更高 version_code。仅对可信任、已审查源码触发正式签名。此工作流没有 PR/pull_request_target 触发，fork 仓库不运行签名 job，只申请 `contents: read`，第三方 actions 固定 commit SHA。完整 Web E2E、普通构建、Pages 构建及 Pages 测试与 APK 签名和模拟器验收并行运行。上传的 artifact 仅为候选制品，只有完整工作流全部通过后才能验收交付或合并。

下载 `little-days-0.2.1-code-…` artifact，包含 APK、SHA256SUMS、证书指纹、aapt 信息、工具版本与源 SHA。artifact 保留 **90 天**，过期后不能再从 Actions 下载；发布负责人应将已验证版本另存安全的长期发行归档。工作流可按同一源码和锁文件重复执行；不承诺 APK 字节级一致，JDK/Node 小版本、runner 镜像及依赖工具仍可能更新。

当前图标和启动图沿用现有有效的 Capacitor 模板资源，本轮没有替换。code 1 是仓库中首次已知正式签名包的起点，不代表已核实所有未连接设备上的安装历史。

code 1 发布工作流还配置真实 API35 x86_64 模拟器验收：构建同证书的 release 测试 APK 和临时 code 2 包，删除临时密钥后安装 code 1、启动内置 WebView，通过只指定的新 instrumentation 类在应用已创建的 IndexedDB 中写入合成待办、纪念日和生理期 state；随后 `adb install -r` 覆盖安装 code 2，重新启动并验证三类数据及 `https://localhost` 源站。既不卸载也不清空数据，不启用 release 调试，不修改业务 schema。正式下载 artifact 始终只含原始 code 1，临时测试 APK 不上传，另行上传真实测试输出、设备属性、证书与日志 90 天；更高 version_code 跳过这个固定 1→2 场景。配置提交不等于测试已通过，只有对应 CI 的 instrumentation 输出和 result.txt 同时成功才是模拟器证据；当前没有 Android 真机测试结论。仅限新建的 CI 模拟器，禁止在个人设备或真实数据库运行。
