# Android 0.2.1 发布

正式应用固定为 `com.littledays.app`，`versionName=0.2.1`，默认 `versionCode=1`。`ANDROID_VERSION_CODE` 可覆盖为不超过 2100000000 的正整数。Capacitor 默认源站保持 `https://localhost`；应用使用 APK 内置的 HTML、JS 和 CSS，不设置 `server.url`。不改变业务逻辑、数据库或权限。

## 长期签名与升级

正式签名证书 SHA-256：`C85FE70FFF2425AD2B95D3DFA8F28EF7173027E744B03F57B721896FCA40D3D8`。来源为首次 Android 交付时创建的固定 RSA 4096 发布证书（alias `cozy-days-release`，不是 debug 证书）。每次安装前比对 artifact 中的 `certificate.txt` 和 `release.json`。APK 的 SHA-256 在 `SHA256SUMS`；源码提交在 `release.json`。

签名凭据已存入受分支策略限制的 `android-release` Environment Secrets；本机仓库外有仅当前 Windows 用户可访问的加密 JKS 和 DPAPI 密码存档，并另存第二磁盘备份。DPAPI 备份依赖原 Windows 用户配置，不能当作跨机器密码恢复方案；更换系统前必须将密钥及密码转存个人安全密码库/离线介质，切勿把密码贴入聊天或公开文件。GitHub Secrets 可供后续 CI 签名，但不能从 GitHub 界面取回明文。

请长期离线保管同一签名密钥并安全备份密码。后续版本必须沿用同一包名、同一签名和更大的 versionCode，才能覆盖安装并保留应用数据。建议下一版 `0.2.2` 使用 code `2`（届时同步修改 Gradle versionName 和校验脚本预期值）。不要卸载后重装来升级；卸载会移除应用私有数据。正式版也无法覆盖不同证书的 debug 包。发布流程不接触用户真实 IndexedDB。

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

推送 `release/android-*` 分支会以 code 1 构建；也可在 **Signed Android APK** 的 `workflow_dispatch` 输入更高 version_code。仅对可信任、已审查源码触发正式签名。此工作流没有 PR/pull_request_target 触发，fork 仓库不运行签名 job，只申请 `contents: read`，第三方 actions 固定 commit SHA。完整 Web E2E、普通构建、Pages 构建及 Pages 测试通过后才运行签名 job。

下载 `little-days-0.2.1-code-…` artifact，包含 APK、SHA256SUMS、证书指纹、aapt 信息、工具版本与源 SHA。artifact 保留 **90 天**，过期后不能再从 Actions 下载；发布负责人应将已验证版本另存安全的长期发行归档。工作流可按同一源码和锁文件重复执行；不承诺 APK 字节级一致，JDK/Node 小版本、runner 镜像及依赖工具仍可能更新。

当前图标和启动图沿用现有有效的 Capacitor 模板资源，本轮没有替换。code 1 是仓库中首次已知正式签名包的起点，不代表已核实所有未连接设备上的安装历史。

此流程的静态 APK 校验和 Web E2E 不等于设备测试。当前工作流不执行模拟器安装、启动或覆盖升级，也没有 Android 真机数据保留证据。正式发布前应使用合成数据执行同签名 code 1 → code 2 覆盖安装，验证启动和 IndexedDB 数据保留，记录设备/API、源 SHA、证书和测试结果，切勿以真实个人数据库做发布测试。
