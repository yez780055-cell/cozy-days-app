# CloudBase 前端与 Android 网页暂存发布

## 发布边界

- 源码从 `960ec73`（邮箱验证码注册身份兼容修复）继续，PR 目标为 `main`。
- 正式 HTTPS 地址沿用 `https://yez780055-cell.github.io/cozy-days-app/`。只有批准合并 PR 后，main 的 Pages 工作流才构建启用 CloudBase 的正式前端。非 main 分支不能部署到正式 Pages。
- 合并前在现有 Cloudflare 项目 `cozy-days-app` 的独立分支 Preview 验收，避免触及正式源站的本地存储。
- Android 继续使用 `com.littledays.app`、外壳 2、0.2.2，正式证书 SHA-256 为 `c85fe70fff2425ad2b95d3dfa8f28ef7173027e744b03f57b721896fca40d3d8`。
- 新网页修订为 6，避开历史验收使用的 2–5。标签 `android-web-shell-2-web-6`，仅 Pre-release，禁止普通 Release 和 Latest。

## 签名与构建

`.github/workflows/android-web-staging.yml` 在 `release/android-cloudbase-staging` 上先运行完整单机回归、Pages/PWA 回归、Android 网页回归和 CloudBase 合成双账号回归，再以 `VITE_CLOUDBASE_ENABLED=true` 构建 Android 网页。签名任务只下载该已测试提交的网页资源，在现有 `android-release` 环境调用 `PackAndroidWeb.java`。

打包器强制校对正式证书，再签发 `Cozy-Days-Web-2-6.cozyupdate` 和 `latest.json`。没有 Gradle、Capacitor sync、APK 构建、原生修改或证书更换。CI 制品同时保存源提交和 SHA-256。不要把实验签名包上传到此外壳的更新标签。

发布前从制品下载包，使用归档正式 APK 的证书独立验签。先上传 Draft 的所有资产，核对完整后再标为 Pre-release。匿名读取 Release API 并下载清单和包，比较长度、SHA-256、签名及 shell/web，再做设备验收。

## 数据行为

网页安装沿用既有 `https://localhost` WebView 源站及更新回滚机制。旧单机 `little-days`、`cozy-days-period` 数据库保留。双人版登录后使用 `little-days-cloud-<space>-<user>`，不会自动导入旧单机数据；“数据仍保留”不等于“旧记录自动显示在双人空间”。不要清除应用数据或卸载正式 APK。验收前通过旧网页导出备份。

新增 CloudBase 回归用例对原单机待办、分类、纪念日及经期/日记数据库做注册和重载前后的完整记录比较。真实设备仍须在安装前后导出并比较；合成测试不能代替真机验收。

## 设备与公网验收清单

1. 公网 HTTPS 上由两位成员协助邮箱验证码，验证已有账号登录；新的真实注册需要未占用的席位和有效邀请码，不轮换现有邀请码或重置成员。
2. 验证共享纪念日、经期/日记双向同步；待办和分类保持账号隔离。断网写入、关闭重开、恢复网络后确认同步。
3. 真机保留现有正式 APK，不重新安装；记录包名、versionCode、证书、当前网页修订和数据基线。
4. 默认正式通道排除 Pre-release；在旧网页设置开启预发布后，在线检查显示网页 6，完成下载、哈希/签名校验和安装。
5. 验证欢迎页在未登录时也能完成 Android 启动握手；登录后重开和离线冷启动，比较旧单机数据库及账号记录。
6. 验收结束保持 Pre-release。没有实际连接的设备或邮箱验证码时，对应项目记为待验收，不声称通过。

## 回退

出现签名、外壳或启动兼容问题时停止安装并保留旧网页。保留当前 APK 内置恢复入口。需要撤回暂存时先转回 Draft；不要删除设备数据，不用低版本包覆盖已经稳定安装的高版本网页。若发现确需原生代码或 APK 签名变更，停止并向用户说明。
