# 小饱日常 Cozy Days

双人版的 CloudBase 配置、邀请码和测试说明见 [CloudBase 双人空间](docs/cloudbase.md)。

一个本地存储的手机手账。待办支持分类、收藏、日期、时间、滑动与撤销；生理期支持经期区间、月历、统计和每日记录；纪念日支持倒计时、年度重复和月历。三个模块均可使用真实数据，初始不写入示例记录。

## 本地运行

使用 Node.js 22 或更高版本。在仓库根目录运行：

```powershell
npm ci
npm run dev
npm run build
```

开发地址为 `http://localhost:5173/`。在开发模式打开 `/?preview=1` 可查看独立的组件演示。Web 正式版部署在 [GitHub Pages](https://yez780055-cell.github.io/cozy-days-app/)，PR 使用独立域名预览。

## 安装与离线

在线打开正式站点后，使用浏览器的安装菜单。桌面 Chrome 和 Edge 可安装为独立窗口，Android Chrome 可安装到主屏幕，iPhone Safari 可通过分享菜单添加到主屏幕。

首次在线加载并缓存应用后，可以断网重新打开并读写本地记录。自定义字体按需缓存，离线时尚未缓存的字体会使用系统字体。新版本在线下载完成后，关闭此站点的所有应用窗口或浏览器标签页，再打开即可使用新版本。版本切换只清理旧版应用资源缓存，现有 IndexedDB 记录会保留。

## 数据备份与恢复

打开底部「设置」→「数据备份与恢复」。完整 JSON 备份包含已保存的待办、分类、生理期区间／日记／周期设置和纪念日，以及应用、备份和数据库版本。文件可能包含敏感信息，请保存在个人设备或受保护的存储中。应用在本地读写文件。

选择 JSON 后先校验并显示记录数量。支持 20 MB 以内、格式 v1、Dexie `little-days` v4 与 `cozy-days-period` v1 的备份。导入需要支持 Web Locks 的安全上下文，例如正式 HTTPS、localhost 或支持该 API 的 Android WebView。恢复前关闭已打开的旧版页面；其他打开的新版本页面再次访问记录时会提示重新打开。

- **默认合并**保留本机记录，跳过内容相同的记录，处理冲突 ID 并保留任务分类映射。同日或重叠的生理期数据和冲突设置优先保留本机版本。
- **替换**需明确确认。应用先保存最近一次替换前的完整备份，恢复完成后可从同一入口下载。请另外保留重要备份文件，清除浏览器或应用数据也会清除这份自动备份。
- 导入使用持久化回滚日志协调两个 IndexedDB 数据库。写入失败会回滚；若页面或存储在中途出错，下一次读取或写入前会尝试完成回滚。
- 未提交的生理期草稿和冲突副本仍由生理期页面的恢复区管理。浏览器、开发地址、预览和 Android 应用各自拥有独立的记录库，没有账户或云同步。

## 代码与验证

`src/features/` 含待办、生理期、纪念日和设置。共用组件在 `src/components/`，存储和备份在 `src/data/`。Android 通过 Capacitor 加载 `dist/`，GitHub Pages 使用 `dist-pages/` 和 `/cozy-days-app/` 基础路径。

```powershell
npx playwright install chromium
npx playwright test tests/data-safety.spec.ts
npm run build:pages
npm run test:pages -- tests/pwa.spec.ts
npm run test:pages
```

浏览器测试使用独立上下文和合成记录。完整浏览器回归可用 `npm run test:e2e` 或 Actions 的 Full regression。PR 自动检查运行 Web 和 Pages 构建。

## Android

项目已包含原生工程。安装 JDK 21、Android Studio 和 Android SDK Platform 35 后，用 `npm run android:sync` 同步 Web 产物，再用 `npm run android:open` 打开工程。APK 内置网页资源，发布签名、覆盖升级和离线模拟器记录见 [Android 发布说明](docs/android-release.md) 与 [0.2.1 交付记录](docs/android-deliveries/v0.2.1-android.1.md)。换设备或卸载前请先导出备份。

Android 自网页修订 9 起统一为现有正式 APK、一个含 CloudBase 的正式网页版本和正式更新通道。默认构建包含邮箱登录/注册、双人共享、云端同步和 IndexedDB 缓存；发布见 [统一 Android 网页发布](docs/android-web-update-release.md)。
