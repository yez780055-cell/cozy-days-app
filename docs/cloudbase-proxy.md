# CloudBase 受限代理：staging 验收检查点

## 当前状态与边界

基线为 Web 6 合并提交 `e69c7797779f8dc615ff8477014fe37e0feaae84`（PR #35）。2026-11-26 已核对远端 main 与本地 main 一致，开始时工作区干净。仅在唯一开发目录的本地 main 实施，没有创建子代理、worktree 或本地功能分支。

独立 Worker 在 `workers/cloudbase-proxy/`；测试部署地址为 <https://cozy-days-cloudbase-proxy-staging.yez780055.workers.dev>。只部署 staging，没有设置生产 Worker、自定义域名、付费服务、Git 自动构建或 GitHub Cloudflare Secrets。使用现有 Wrangler OAuth；没有复制凭据进仓库。Worker 无 Secret 或其他绑定，不需要 CloudBase 管理密钥。

**尚未接入正式 Pages。** 用户确认尚未准备专用测试邮箱和隔离测试空间，因此真实账号完整验收暂停，前端修改也按顺序暂停。`src/data/cloudbase.ts`、Vite、应用根包/锁文件、Android、IndexedDB、备份、离线功能和签名网页更新链路均未修改。没有构建 APK、发验证码、注册真实账号、绑定空间或写入生产数据库。

本批须保留为草稿 PR，不合并或发布。现有 Pages 工作流在 main 推送后自动部署，并调用 Shell 3 网页发布器；即使本批没有前端改动，直接合并也可能触发发布，不能把“只有 Worker 改动”当作无发布影响。

## 代理契约

固定上游：`https://vicarious-cardinal-d6c5m0ec4d9c0.api.tcloudbasegateway.com`。严格对齐当前 `cloudbase.ts` 的 9 个 POST 路径，测试会比较源码调用清单，新增调用必须显式审查：

| 类别 | 路径 |
| --- | --- |
| 发送验证码 | `/auth/v1/verification` |
| 校验验证码 | `/auth/v1/verification/verify` |
| 注册 | `/auth/v1/signup` |
| 登录 | `/auth/v1/signin` |
| 刷新 Token | `/auth/v1/token` |
| 登出 | `/auth/v1/user/signout` |
| 双人空间 | `/v1/rdb/rest/rpc/cozy_days_space` |
| 拉取 | `/v1/rdb/rest/rpc/cozy_days_pull` |
| 推送 | `/v1/rdb/rest/rpc/cozy_days_push` |

- 只接受 Origin `https://yez780055-cell.github.io`。无 Origin、`null`、其他域名、`https://localhost` 均返回 403，且不带 `Access-Control-Allow-Origin`；Android 继续直连。CORS 限制浏览器来源，不能替代 CloudBase 身份校验，也不能阻止脚本伪造 Origin。
- 只接受 POST、OPTIONS。合法预检返回 204，允许 `Content-Type, Authorization, apikey, x-device-id`，缓存 600 秒；`Vary` 包含 Origin 和预检方法/头。普通响应 `Vary: Origin`，不启用凭据 Cookie。
- POST 只接受 JSON Content-Type，只转发上述四个头。Authorization、Publishable Key、设备 ID 和请求体保持原值；不注入 Worker 身份。Host、Origin、Cookie、转发头、任意管理头不会传给上游。
- 固定主机 + 规范化后逐项匹配的路径；拒绝非空 query、fragment、编码路径和路径后缀，不接受目标 URL 参数。URL 解析器可先消解字面 dot segment，但最终只能命中固定主机上的精确白名单路径，不能走任意 RPC/管理端点。
- 请求体按实际流字节限制 1 MiB，不能通过缺省/伪造 Content-Length 绕过；允许现有最大约 650 KB 的单条业务记录及封装。头值限制长度并拒绝控制字符。
- 整次处理 12 秒截止，覆盖客户端读流、连接、上游读流；主动中止/取消流。异常返回固定 502，超时 504，不序列化异常信息。上游重定向不跟随、不暴露 Location，转为 502。
- 上游状态、业务响应体逐字节保留，包括 401、403、429、500；仅选择 Content-Type、Retry-After 响应头，覆盖上游 CORS/缓存并去除 Cookie。全部业务响应 `Cache-Control: no-store`。响应体限制 16 MiB，高于当前拉取 16 条、每条最多 650,000 字节的业务上限。
- 无 console、请求体日志、Token 日志或 Secret。关闭 Worker 持久 Observability，部署和测试不使用真实账号资料。Worker 自身错误只含固定代码；合法的 Token 响应和 CloudBase 业务错误仍按协议传给原调用者，不能把正常 Token 返回误称为泄漏，也不能承诺过滤上游自身的敏感正文。

## 已完成的验证

隔离测试与真实联通必须分别解读：

| 验收项 | 当前证据 |
| --- | --- |
| 路径清单、CORS、头部、大小、重定向、失败及超时 | 共 63 项独立 Node/workerd 测试通过（全部为合成上游） |
| 401/403/429/500 状态和错误正文保留 | 合成上游测试通过；没有向真实服务制造 429/500 |
| 发送、校验、注册、登录、刷新、登出、3 个 RPC | 完整合成请求序列通过，仅为隔离夹具 |
| workerd 运行时 | Miniflare + 真实 workerd、合成上游集成测试通过；并非公网 CloudBase |
| staging 9 个路径预检 | 真实 HTTPS 均为 204，正确 Origin/Max-Age/Vary |
| staging 非授权/无 Origin | 真实 HTTPS POST/OPTIONS 均为 403，均无 CORS 授权 |
| 真实 CloudBase 登录拒绝 | 空请求 `/auth/v1/signin` 经 Worker 返回 400，业务错误码与服务端直连一致 |
| 真实 CloudBase RPC 拒绝 | 匿名 `cozy_days_space` 经 Worker 返回 401，业务错误码与直连一致；未绑定或写记录 |
| 真正发送/接收验证码、校验、账号登录成功、刷新、登出 | **待专用测试账号**；不得将上述拒绝探针记作成功登录 |
| 已认证双人空间同步、实际 Shell 3 登录及离线功能 | **待隔离空间/真机**；应用未改动不等于已做真机验收 |

首轮公网拒绝探针时间为北京时间 2026-11-26 14:46。脱敏命令证据保存在本机忽略目录 `artifacts/cloudbase-proxy/`；部署最终版本和 PR/CI 结果以本批交接记录为准。

最终 staging version 为 `e62a6d7d-e24a-4cb1-a47d-501d6da27e5e`，已针对该版本重跑公网拒绝探针，Worker Secret 列表为空。正式 Pages 公网 HTML、入口及懒加载 CloudGate 脚本均为 200，build-info 仍为 e69c779，原网关存在、Worker 地址不存在。另通过本地 TypeScript/生产构建、手机/桌面 smoke 2 项、CI 策略21项、发布器13项、匿名HTTP6项。首次直接调用策略文件缺少 npm_execpath，改用仓库规定 npm 命令后通过；没有降低断言。PR适用CI另行核对。

复现独立测试（Node 22.12+）：

```powershell
npm --prefix workers/cloudbase-proxy ci --ignore-scripts --no-audit --no-fund
npm --prefix workers/cloudbase-proxy test
$env:WRANGLER_SEND_METRICS = 'false'
$env:CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
$env:WRANGLER_LOG_PATH = Join-Path (Get-Location) 'workers/cloudbase-proxy/.wrangler/logs'
npm --prefix workers/cloudbase-proxy run check
```

`check` 只执行 staging 打包 dry-run，无上传或部署。Wrangler 及其依赖的 Miniflare（当前发布依赖为 5.x beta）在独立锁文件固定版本，不升级应用技术栈。Windows 沙箱若拒绝本地 socket，workerd 测试需有本地 socket 权限；不能删断言或跳过来制造通过。

真实无写入探针：

```powershell
$env:COZY_PROXY_TEST_URL = 'https://cozy-days-cloudbase-proxy-staging.yez780055.workers.dev'
npm --prefix workers/cloudbase-proxy run probe:live
```

此命令只检查 CORS，并以空登录、匿名空间请求比较直连和 Worker 的业务拒绝；不会发邮箱验证码或接受会话凭据。机器若需要代理，按本机 Node 网络配置运行。探针只打印脱敏结果，不打印上游正文、Token 或异常原文。

## 后续账号验收与前端接入

1. 准备可收信的专用测试邮箱、新账号及已有测试账号，并确认固定 CloudBase 环境内有安全可用的测试空间；若需建空间、邀请码或其他生产数据库操作，先准备具体操作供用户审批。不可占用正式两人席位代测，不重复使用真实用户邮箱。
2. 在 staging 依次验发送、校验、注册、已有账号登录、Token 刷新、登出、空间 lookup/pull/push，以及双端同步。保留仅状态/断言/请求数的脱敏记录，通过 CloudBase 响应或控制台脱敏请求记录确认上游。验证码、Token、密码、邀请码不进 Git/日志/聊天。
3. 完成独立 Worker 真实验收后，另做最小前端接入：建议使用 `VITE_CLOUDBASE_API_BASE` 和明确的 Pages 构建 mode/target；默认和 Android 强制原网关。环境变量只在 Pages build step 设置，不能放在全局/Android/签名可复用工作流。当前变量和 target 尚未实施，不能直接配置后声称生效。
4. 覆盖默认 Web、Pages（有/无地址）、Android 被误注入 Worker 地址、非法地址、开发/预览的目标选择测试，并检查真实构建产物。保留原认证路径/请求体/会话键、Token 锁和刷新逻辑；不得更改 IndexedDB、备份、离线或 Shell 3 更新协议。
5. Pages 只需要公开的 HTTPS Worker 地址，放 GitHub Actions Variables 即可，不需要新的前端 Secret 或 CloudBase 管理 Key。生产 Worker 和 Pages 变量启用须获具体授权。新 Worker 的 Git 自动生产部署保持关闭，不能将现有 Cloudflare Pages 项目改为正式入口。
6. 现有 PR `contents: read` 权限保留，新增步骤仅本地测试/打包，不读 Cloudflare Secrets，不部署。Pages build 的 `contents:read/pages:read`、deploy 的 `pages:write/id-token:write` 不新增权限；Android 发布器仍在原有隔离签名任务使用原 Secrets。

## Web 6 保留与回退

已核实正式 Pages 部署 `8076735885` 来源为 `e69c7797779f8dc615ff8477014fe37e0feaae84`，Shell 3 Web 6 的公开非 Draft、非预发布资产仍在 [原 Release](https://github.com/yez780055-cell/cozy-days-app/releases/tag/android-web-shell-3-web-6)，包括 `Cozy-Days-Web-3-6.cozyupdate`、签名 manifest、证书、SHA256SUMS 和 provenance。

本批未改入口、未发布新网页，无需回退，不能用清库、卸载或 reset 撤销。后续若只撤销代理接入，应通过新提交恢复默认直连，并注意这会恢复原 Pages CORS 问题。若要正式重发 Web 6 内容，须先确认具体回退目标、备份及旧代码/当前数据兼容性，再走显式回退流程；Pages 和 Android 签名网页分开处理，原自动发布器的源码守卫不允许把历史源码当普通新发布。Android 必须以更高网页修订、原证书、原外壳协议发布历史内容，不覆盖 Web 6 tag/资产，不降修订号、不重建 APK。数据库和备份格式不能因前端回退假设可逆。

移除 staging 服务是独立操作；当前没有正式客户端依赖它，无需为回退正式站删除或覆盖任何既有服务。本批不执行删除。

Cloudflare 配置参考：[命名环境](https://developers.cloudflare.com/workers/wrangler/environments/)、[workers.dev 路由](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)、[Observability 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)。
