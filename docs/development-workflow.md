# PR 开发与在线验收

## 日常功能任务

1. 从最新 `main` 建立独立的 `feature/*` 分支，开始前检查工作区；保留不属于当前任务的修改。
2. 完成修改后运行 `npm run test:e2e`、`npm run build`、`npm run build:pages`、`npm run test:pages`。
3. 只暂存本轮文件，提交并推送 feature 分支，以 `main` 为目标创建或更新 PR。
4. GitHub Actions 的 **PR validation / verify** 通过后，查看 PR 的最新 SHA、差异和部署预览。`main` 只由用户明确批准后的人工合并更新。

PR 验收页路径为 `/review/`。该页提供当前开发版本入口、360×740 / 393×852 / 430×932 浏览器实际截图和 WebM 录屏、原始参考图对照、GitHub 检查状态、构建 SHA、PR 链接、修改摘要和已知限制。浏览器证据由 Playwright 在空的临时上下文中生成，使用合成演示任务，不读取真实用户数据。GitHub Actions 保留本轮测试视频、截图及跟踪文件 30 天。

## Vercel Preview 首次连接

仓库目前未连接 Vercel。首次设置需要仓库所有者在 [Vercel 新建项目](https://vercel.com/new) 中使用 GitHub 导入 `yez780055-cell/cozy-days-app`，批准/安装 Vercel GitHub App，并将 Production Branch 设为 `main`。本项目 `vercel.json` 使用 Vite、`npm ci`、`npm run build` 和 `dist/`；无需添加环境变量或密钥。导入后 Vercel 为 PR 自动创建独立 HTTPS Preview，并在 PR 中反馈部署结果。Vercel 连接完成前不能保证 PR 有独立 Preview URL；GitHub Pages 仍只部署 `main`，不承载 PR 代码。

## 验收证据路径

- PR 上的 Preview 中，打开 `/review/` 查看静态验收页。
- 每次 PR 检查的真实截图、WebM 和失败时 Playwright 诊断文件可从 PR 对应 GitHub Actions Artifact 下载，保留 30 天。
- GitHub Pages 正式路径为 `https://yez780055-cell.github.io/cozy-days-app/`；主站部署由 `.github/workflows/deploy-pages.yml` 管理。
- 默认 Vite build 输出 `dist/`，Capacitor 从 `dist/` 读取网页；Pages 专用构建使用 `/cozy-days-app/` base 与 `dist-pages/`，不会改 Android 配置。

## 合并规则

任何 PR 合并前都须确认 required check 为成功、PR 无冲突、提交 SHA 是最新。仓库关闭 Auto-merge；Codex 不直接推送 `main`、不强制推送、不自动合并。只有用户通过 ChatGPT 明确批准，才能执行 PR 合并。
