# PR 开发与在线验收

## 日常功能任务

1. 从最新 `main` 建立独立的 `feature/*` 分支，开始前检查工作区；保留不属于当前任务的修改。
2. 完成修改后运行 `npm run test:e2e`、`npm run build`、`npm run build:pages`、`npm run test:pages`。
3. 只暂存本轮文件，提交并推送 feature 分支，以 `main` 为目标创建或更新 PR。
4. GitHub Actions 的 **PR validation / verify** 通过后，查看 PR 的最新 SHA、差异和部署预览。`main` 只由用户明确批准后的人工合并更新。

PR 验收页路径为 `/review/`。该页根据当前构建元数据从 GitHub 读取对应 PR 标题、说明、改动文件和最新 `verify` 状态，并提供当前开发版本入口、360×740 / 393×852 / 430×932 浏览器实际截图和 WebM 录屏、原始参考图对照、构建 SHA、部署链接和已知限制。浏览器证据由 Playwright 在空的临时上下文中生成，使用合成演示任务，不读取真实用户数据。GitHub Actions 保留本轮测试视频、截图及跟踪文件 30 天。

## Cloudflare Pages Preview 首次连接

Vercel 手机验证不可用，因此 PR 独立预览改用 Cloudflare Pages。仓库目前尚未连接 Cloudflare；首次连接需仓库所有者登录 Cloudflare，创建 Pages 项目并通过 GitHub App 仅授权 `yez780055-cell/cozy-days-app`。选择 Git 集成，构建命令 `npm run build`、输出目录 `dist`，Production branch 设为 `main`，并在 Branch deployments 中关闭 main 的自动生产部署、为其他分支开启 Preview 部署。这样 main 正式版仍只由 GitHub Pages 发布，各 PR/feature 分支由 Cloudflare 生成独立 HTTPS Preview；无需密钥或环境变量。确保 Preview 访问保护关闭，以便手机直接打开验收页。Cloudflare Pages 会为 PR 分支提供独立 URL；首次授权完成前，PR 页面不会有预览链接。

## 验收证据路径

- PR 上的 Preview 中，打开 `/review/` 查看静态验收页。
- 每次 PR 检查的真实截图、WebM 和失败时 Playwright 诊断文件可从 PR 对应 GitHub Actions Artifact 下载，保留 30 天。
- GitHub Pages 正式路径为 `https://yez780055-cell.github.io/cozy-days-app/`；主站部署由 `.github/workflows/deploy-pages.yml` 管理。
- 默认 Vite build 输出 `dist/`，Capacitor 从 `dist/` 读取网页；Pages 专用构建使用 `/cozy-days-app/` base 与 `dist-pages/`，不会改 Android 配置。

## 合并规则

任何 PR 合并前都须确认 required check 为成功、PR 无冲突、提交 SHA 是最新。仓库关闭 Auto-merge；Codex 不直接推送 `main`、不强制推送、不自动合并。只有用户通过 ChatGPT 明确批准，才能执行 PR 合并。
