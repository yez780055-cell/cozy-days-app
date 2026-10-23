# 小饱日常开发约定

## 分支与交付
- `main` 是正式稳定分支，只由经过批准的 Pull Request 更新；任何情况下都不要直接推送 `main` 或自动合并。
- 每项功能或视觉任务使用独立的 `feature/*` 分支，并以 `main` 为 PR 目标。完成后运行 `npm run test:e2e`、`npm run build`、`npm run build:pages` 和 `npm run test:pages`；通过后仅暂存本轮明确修改的文件，提交并推送对应 feature 分支，创建或更新 PR。
- 禁止强制推送。提交前检查 `git status` 和 staged diff；发现非本轮改动时，保护并保留其原状态，不得混入提交、清理或覆盖。
- 不自动合并。合并前确认 PR 检查成功、没有冲突且 SHA 是最新；只有用户在 ChatGPT 明确批准后，才能通过已连接 GitHub 的 ChatGPT 执行合并。
- 每轮结束告知 PR 编号和链接、在线验收地址、测试结果、修改摘要和遗留问题。Vercel 连接完成后将 PR 自带的 HTTPS Preview URL 作为验收地址。

## 数据与 Android 安全
- 不编辑 `D:\index.html`，不删除或重置已有待办数据、IndexedDB、滑动/撤销机制、分类系统或现有 Android 工程配置。
- 不发布密钥、环境变量、私密数据、本机数据库或无关文件。PR 代码的浏览器验证使用全新临时浏览器上下文和合成数据。
- GitHub Pages 只部署 `main`。PR 使用独立 HTTPS Preview 源站；不要把未审查的 PR 部署到正式 Pages 同源，以免访问正式站点的本地存储。
- 首次连接 Vercel/GitHub App 或其他外部服务前，先向用户说明并取得明确授权。Vercel 生产分支必须是 `main`，feature/PR 仅生成独立 Preview。

## 在线验收与检查
- 保持 `/review/` 为纯静态页面；使用相对资源路径，以兼容 GitHub Pages 子路径、Vercel 和 Capacitor。
- 验收截图和录屏必须来自实际 Playwright 测试。PR 检查必须包括原有 E2E、浏览器生产构建、Pages 构建和静态 Pages 交互检查；失败即不可验收。
- 保留证据来源对应的 commit SHA、测试结果、构建/部署状态、变更摘要与已知限制。不要展示伪造或占位的验收证据。
