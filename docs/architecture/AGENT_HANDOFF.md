# 当前开发检查点

更新时间：2026-11-23。开发规则见 [AGENTS.md](../../AGENTS.md)，22 项问题、技术约束、历史证据和授权见 [ISSUE_LEDGER.md](ISSUE_LEDGER.md)。

## 当前真实 Git 状态
- 唯一目录：`D:\Codex项目 - Codex Projects\Cozy Days\cozy-days-app`；分支 main。本轮文档提交前 HEAD 与本地 origin/main 引用均为 `a4a008a0f174b19cad4229125f7cd8236a1b6552`（PR #33 合并）；远端引用为本地快照，本轮未 fetch。
- a4a008a 不含后续工作区修改。开始时 17 个已修改文件含本台账和交接；本轮只提交 AGENTS.md、ISSUE_LEDGER.md、AGENT_HANDOFF.md。提交后 main 增加文档提交，另 15 个已修改文件和 2 个未跟踪文件继续原样保留；实际提交 SHA 见 Git 和本轮交付报告。
- 保留的修改：android-web-auto/android-web-release/deploy-pages 三个工作流；android-web-update-release/ci-testing 两个文档；android-web-auto、ci-plan 脚本及测试；App、CloudGate、HomePage、native/window；tests-android/support/shell-fixture.ts、tests/cloudbase.spec.ts。
- 未跟踪：`src/native/startupReadiness.ts`、`tests/startup-readiness.spec.ts`。不执行 reset、clean、stash 或覆盖。本轮不推送、合并或发布。

## 已完成工作
- P0-01、P1-05/06/07、P2-04 已由 [PR #33](https://github.com/yez780055-cell/cozy-days-app/pull/33) 合并；head 31071d5 的 [CI 45002593000](https://github.com/yez780055-cell/cozy-days-app/actions/runs/45002593000) 全绿，含真实 ART、云/统一 Android 和最终 verify。
- [发布 45003040535](https://github.com/yez780055-cell/cozy-days-app/actions/runs/45003040535) 完成 Pages、签名内容公开与匿名复核；[shell3-web4](https://github.com/yez780055-cell/cozy-days-app/releases/tag/android-web-shell-3-web-4) 来源 a4a008a、46 资产。未构建 APK、未操作生产 DB、未做实机验收。
- 本轮恢复单模型、按批次直接执行，三个治理文档单独提交。首批失败修复和验证证据保留在台账，不重复实施。

## 当前未完成与下一批
- 指定模型：当前 GPT-6 单模型。下一批先收尾已有本地 P1-04（显式启动就绪）、P1-08（拒绝过时发布）、P2-05（按目标公开基线选测试）修改：检查 Diff、运行影响集、自行修复普通失败，再按既有 Git/PR 规范提交交付。本轮不实施。
- 三项仍待本批有效验证、提交、PR 和发布；技术约束见台账“下一批已有实现的技术约束”。首批真实设备验收仍待完成。
- 后续 P1-01/03：先本地隔离验证服务端农历契约、全入口入站隔离和引用一致性；生产 SQL、异常数据、备份与恢复能力未知。其余项目按台账依赖推进。

## 必要风险与恢复
- 普通 Bug/测试失败自行修复重测；数据丢失、生产 DB、签名/协议异常、不可恢复、权限不足或越权时暂停相关操作并准备恢复方案。具体共享导入/替换/冲突及实际回退目标仍需确认。
- `artifacts/governance-first-batch/` 保留 patch、SHA256、失败 trace、修复验证和 `current-delivery.json`；新批验证绑定新源码/制品，修订4不能证明未提交实现正确。
- 不升 Dexie 物理版本不等于旧端可安全联网回滚。迁移保留备份/失败恢复/旧端兼容；禁止卸载清库。shell2 冻结未退休、shell3 当前维护；账号隔离、outbox 原子性、历史字段/ID/草稿/冲突/待发队列及签名/更新/回滚边界依 AGENTS 和台账保留。
