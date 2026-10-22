# 小饱日常 Cozy Days · Android 应用

2026-10-22 卡片交互更新：左滑删除、右滑完成/恢复，移除任务复选框；三种操作均支持 5 秒纸质读条撤销。点击文字编辑，右侧“更多”提供可访问操作，收藏在编辑面板设置且仅收藏任务显示星标。最新验收和实际录屏见 [滑动交互报告](artifacts/cozy-swipe-report.md)。同局域网查看 [手机录屏验收页](http://192.168.3.24:4173/review/)。尚未提交或推送本次改动。

React + TypeScript + Vite 前端，Dexie/IndexedDB 本地存储，Capacitor 安卓容器。当前实现待办模块；生理期日历、纪念日仅有独立页面入口。已接入 16 项 ready 素材，新增按标题匹配、种子持久化和手动更换的任务卡片装饰。最新规则、数据迁移、测试与截图见 [动态卡片装饰验收](artifacts/cozy-decoration-report.md)；此前素材接入与原稿说明见 [素材接入验收](artifacts/COZY_ASSETS_REPORT.md)。

GitHub Pages 远程预览部署说明见下文。APK 构建仍受本机缺少 Java 限制。

## GitHub Pages 远程预览

目标仓库：`yez780055-cell/cozy-days-app`（Public）。部署完成后的预期地址：
https://yez780055-cell.github.io/cozy-days-app/

首次创建仓库和推送前需确认上传清单；之后推送 `main` 自动执行 `.github/workflows/deploy-pages.yml`，也可在 Actions 手动运行。仓库 Settings → Pages 的 Source 需选择 GitHub Actions。

```powershell
npm run build:pages
npm run preview:pages
npm run test:pages
# 部署后复用同一套生产验收：
$env:PAGES_URL='https://yez780055-cell.github.io/cozy-days-app/'
npm run test:pages
Remove-Item Env:PAGES_URL
```

Pages 专用命令使用 `/cozy-days-app/` 基础路径和 `dist-pages/` 输出目录；不改动默认 Vite 配置、`npm run build`、`dist/` 或 `android:sync`。Capacitor 继续从本地 `dist/` 加载。Actions 仅上传 `dist-pages/`，不会构建或同步 Android。流程先安装锁定依赖、构建、验证三种手机视口的素材和交互，再部署。

源码仓库包含应用需要的 16 项 ready 素材副本，不修改上游素材仓库。`.gitignore` 排除环境变量、凭据、签名文件、依赖、构建产物、截图报告和 Android 生成文件。本文中的 `artifacts/` 验收记录只保留在本机，不上传到公开仓库。

网页数据保存在当前浏览器的 IndexedDB，不会从本机或 Android 导出用户记录。生理期和纪念日目前仅提供占位页面。

## 本地启动

建议使用 Node.js 22 或更高版本。

```powershell
cd D:\daylight-app
npm ci
npm run dev
```

预览地址：http://localhost:5173/ 。开发服务器监听所有网卡，同一局域网手机可使用终端输出的 Network 地址访问。

```powershell
npm run build
npm run preview
```

产物在 `dist/`。网页预览默认 393px 手机宽度；桌面开发工具栏可切换 360×740、393×852、430×932，窗口不足时自动缩短高度。手机端铺满可视区域，顶部日期与底部导航保持可用，任务区域单独滚动。

## 待办功能

- 默认浏览本地时区的今天，日历选择、前后一天与回到今天。
- 当前日期与全部未完成；后者包括过去和未来日期。
- 内容必填，归属日期默认使用当前浏览日期，支持多行文本、编辑；左滑或更多面板删除，删除后可撤销。
- 右滑完成后移入可折叠的已完成区，可展开右滑恢复；删除、完成和恢复均支持 5 秒撤销最近一次操作，保留完整原记录。
- IndexedDB 持久化，刷新后保留。真实列表初始为空，不写入演示待办。
- 无后端、账号或云同步；本地数据仅存在当前浏览器来源或安卓应用容器中。浏览器清理站点数据、清除应用数据或卸载会删除记录。
- 浏览器开发地址、生产预览地址和安卓容器属于不同存储来源，彼此不会自动同步。

## 工程结构

```text
src/
  app/                    全局布局、底部模块切换、键盘可视区处理
  features/
    todo/                 页面、日期日历、任务卡片、表单与业务 Hook
    period/               生理期占位入口
    anniversary/          纪念日占位入口
  components/             按钮、复选框、弹窗、素材组件
  styles/                 设计变量、全局布局、集中动效参数
  assets/
    manifest.ts           素材映射与比例、透明度、锚点、裁切规则
    placeholders/         本地 SVG 占位素材
  data/database.ts        数据模型、IndexedDB 仓库
  dev/                    独立内存演示状态，只在开发构建引入
tests/                    Playwright 交互验证
android/                  已生成的 Capacitor 原生工程
artifacts/                截图、验证记录、素材清单
```

页面通过 `useTodos` 与数据访问仓库交互，不直接操作 Dexie。颜色等视觉参数位于 `src/styles/tokens.css`，动效时长位于 `src/styles/motion.ts`。Pointer Events 处理滑动方向与跟手，Web Animations API 实现 300ms 卡片退场/收缩；支持 `prefers-reduced-motion`。

## 开发状态页

打开 http://localhost:5173/?preview=1 ，或使用桌面工具栏“组件与状态”。

可查看普通列表、空列表、全部完成、长列表/多行、新增、编辑、删除确认、撤销提示，以及公共组件默认/按下/选中/禁用状态。演示数据存在独立内存中，切换场景重置，不影响真实数据库。

该页面与预览工具栏只在 `npm run dev` 存在；生产 JS 不包含演示状态代码。生产环境访问相同查询参数仍显示普通应用。

## 安卓打包

`android/` 已创建，无需再次执行 add。应用 ID：`com.littledays.app`；名称：小日子；最低 API 23，编译与目标 API 35。

准备 Android Studio、JDK 21、Android SDK Platform 35 和对应构建工具。将 `JAVA_HOME` 指向 JDK，在 Android Studio 中选择 SDK，或在本机 `android/local.properties` 设置 `sdk.dir`。该本机路径文件不应纳入版本控制。

```powershell
npm run android:sync
npm run android:open
# 或在项目根目录直接构建调试包：
.\android\gradlew.bat -p android assembleDebug
```

成功后调试 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。首次 Gradle 构建需要网络下载构建依赖。正式发布请在 Android Studio 中配置自己的签名。

`npm run android:add` 仅用于安卓目录不存在时重新创建工程。每次前端改动后执行 `npm run android:sync`。当前包从本地 `dist` 加载，没有配置远程 server URL；安装后的基础页面不依赖网络素材。浏览器版本未添加 Service Worker，首次加载网页及断网刷新网页仍需要本地预览服务器可达。

安卓已配置软键盘调整尺寸、Keyboard 插件、Android 15 自动系统栏边距以及 CSS 安全区。原生主题使用浅色。Android 系统自动备份关闭，当前版本没有实现数据导出。

本次已生成并成功同步原生工程；APK 构建尝试因机器未提供 Java/`JAVA_HOME` 而失败，未生成 APK。安卓真机启动、真实软键盘与刘海/手势导航效果尚未验证。

## 素材替换

完整清单见 [素材清单](artifacts/ASSETS.md)。

正式 PNG/SVG 放在 `public/assets/cozy_days/`，仅使用上游质量清单 ready 项。`src/assets/manifest.ts` 提供真实 URL 与原尺寸，`src/styles/cozy.css` 实现纸纹、卡片和正式素材布局。详情见 [验收清单](artifacts/COZY_ASSETS_REPORT.md)，哈希与尺寸见 `artifacts/selected-assets.json`。Lucide 继续用于交互图标，字体使用系统字体，无 CDN、远程字体或图片。

装饰组件设置 `pointer-events:none`、不可拖动，并限制在预留区域。请保留透明边缘与安全留白，避免正式插画覆盖左侧标题。参考图中的分类、时间和重要星标没有加入。

## 验证

标准安装方式：

```powershell
npx playwright install chromium
npm run test:e2e
```

若已安装 Chrome，可跳过 Chromium 下载：

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run test:e2e
```

Playwright 使用独立浏览器上下文，不污染你正常预览的数据。测试包括新增与持久化、完成/准确撤销、编辑删除、跨日期汇总、模块入口、已加载页面的离线写入、两种手机尺寸、组件状态、缩小可视高度及减少动态效果。真实软键盘不能由桌面缩放模拟代替。

本次使用系统 Chrome 完成浏览器交互和截图；截图位于 `artifacts/`，测试记录见 [验收记录](artifacts/VERIFICATION.md)。
