# 当前开发检查点

更新时间：2026-11-25。开发规则见 [AGENTS.md](../../AGENTS.md)，完整台账和授权见 [ISSUE_LEDGER.md](ISSUE_LEDGER.md)。

## 当前 Git 与本批范围
- 唯一目录 cozy-days-app，本地 main。接管 HEAD f042e839422be3c6945ff2f942c2ec8b3c6c4bd6，origin/main a4a008a（PR #33）；已正常 fetch 核实。
- 接管时的 15 个修改文件和 2 个未跟踪文件均属 P1-04/P1-08/P2-05，保留已有实现。本轮另修 tests/home-ux.spec.ts 的旧日期操作并更新台账/交接；提交仅包含这些相关文件，不创建本地功能分支或 worktree。
- 本批提交 SHA、树、PR 与后续交付状态见 Git 和 artifacts/p1-batch-20261125/。历史 PR #17 不操作；不直接推送 main。

## 本批实现与验证
- P1-04：显式已提交 surface 和本地启动首读成功才发送 ready；欢迎/登录不等网络成功，坏缓存/ACK 失败不提前确认。保留 token、超时、原生试运行与回滚。启动13、首页4、待办9、Android交互/更新17、统一Android云7、Web云4通过（3个Android专用预期skip）。
- P1-08：计划、Draft写入前、公开前重新核对当前成功 Pages 和公开内容 ancestry；旧SHA、并发高修订、排队Draft重试受保护；公开原字节复核独立。真实只读API验证 a4a008a 当前部署/公开基线 identical，远端旧来源被拒绝。
- P2-05：按目标公开稳定 Release 选基线，Draft/预发布排除；无基线/API失败停止。formal/full 不缩小，dry run 核实完整执行范围。策略/发布保护32通过。
- local/unified Web/Android与TypeScript构建通过；隔离模拟器生产Java ART 39断言、HTTPS及整包故障兜底通过。完整实机 MainActivity 超时/升级验收仍待完成；本轮未构建正式APK。
- 普通失败已修复并重测，详细失败与证据见台账本批验证。验证均为合成/隔离数据；没有生产数据库操作，没有实施P1-01/03。

## 交付与后续
- 本地实现及影响集已验证；本批PR、最终verify、合并、Pages、签名内容公开、匿名复核分别跟踪，不混称完成。
- 既有已发布基准：PR #33 a4a008a，发布45003040535，shell3-web4共46资产；真实设备验收未做。
- 后续P1-01/03需单独开批，本轮不实施；生产SQL、异常数据、备份恢复能力未知，不假定旧端可安全联网回滚。
- 风险与恢复边界继续按AGENTS/台账：普通失败自行修；生产DB、数据丢失、签名/协议异常、不可恢复或越权须暂停相关操作并保留现场。
