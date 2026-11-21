# CI 与网页发布的分层验证

## 默认策略

| 场景 | 自动执行 | 完整全量回归 |
| --- | --- | --- |
| 普通 UI、文案、局部逻辑或 CI 配置 PR | 生产构建、手机/桌面基础 smoke、按 diff 选中的模块用例、测试策略单元验证 | 不执行 |
| 候选网页包 | 上述检查、Android 更新链路、实际统一 Android 资源的一条登录后更新/离线 smoke，以及本次涉及模块 | 默认不执行 |
| CloudBase 登录、同步或权限逻辑 | 额外运行 CloudBase 对应回归及统一 Android 的 CloudBase 集成用例 | 非迁移改动不自动执行 |
| SQL 迁移、IndexedDB schema/version/stores/upgrade 变化 | 自动升级为完整门禁 | 必须 |
| 原生签名/网页安装开发与 PR | 相关 Android 更新用例、签名打包测试、Android ART 增量故障测试、构建及 smoke | 不自动全量 |
| 正式 APK（必要验证模式） | 构建、smoke、Android 更新界面、统一 Android 更新/离线 smoke、ART 故障测试、正式签名及实际 APK 升级/回滚/离线验收 | 默认不执行；只有显式设置 full_regression=true 才执行完整回归 |
| 重大架构改动、合并关键功能 | PR 加 ci:full、critical-change 或 architecture 标签；或显式选择完整检查 | 必须 |
| 正式 Release | validation=formal，Web 全量、Pages/PWA、Android、CloudBase、实际 Android 集成及 smoke | 必须，不能通过 changed_base 缩小 |

完整浏览器回归中的 Review 证据只随完整用例执行，普通 PR 不额外生成整套截图或录屏。

## 选择与证据

scripts/ci-plan.mjs 根据 PR base SHA 到当前提交的 diff 选择测试，输出 ci-test-plan.json 和 Actions Summary；候选包默认比较最新已发布网页 tag，也可指定 changed_base。SQL 迁移和 IndexedDB 结构改动由路径和 schema diff 检测。重大架构/关键功能由维护者添加完整检查标签，标签变化会重新验证。

scripts/ci-run.mjs 是各工作流共用的执行入口。测试老数据/旧交互时仅使用隔离构建；正式产物始终按 CloudBase 默认开启重新构建，并在实际待签名 Android 资源上验证。测试中的隔离构建不会成为交付的另一条产品线。

本地使用 npm run test:ci:policy 验证策略。npm run test:ci 执行所选测试。可用 CI_TEST_TIER=full 显式完整验证，或 CI_DRY_RUN=true 预览命令；CI 环境禁止使用 dry run 充当质量门禁。

## 候选制品和正式发布

签名网页包工作流仅手动运行，没有普通 push 触发器。默认 validation=candidate，输入下一网页修订号，生成 candidate-web-* 制品供导入验收。候选制品不创建 GitHub Pre-release，不新增客户端更新通道。

正式发布明确选择 validation=formal。同一工作流必须先完成完整门禁，再签名唯一的统一网页包。签名任务复核计划中的 tier=formal 和 full=true；正式制品名为 signed-web-*，保留计划和 provenance.validation。只允许将正式门禁通过的制品公开为正式 Release / Latest。候选制品不得直接公开；修改代码后重新分配更高修订号，不复用已安装修订号。

重大改动的候选包也可以选 full_regression=true。两个验证等级不会产生不同产品功能或客户端通道；外壳 2/3 使用各自兼容的 CloudBase 统一网页制品，仍只有正式更新通道。

## 各工作流

- PR validation：按改动范围验证，不默认全量。
- Deploy GitHub Pages：构建实际正式 Pages 产物并运行基础 smoke；相关模块由 PR 检查，完整 Pages/PWA 保留在对应改动和正式门禁。
- Android web package：候选包按范围检查，正式包完整检查，再签发唯一统一包。
- Full regression：仅手动显式完整验证。
- Signed Android APK：按用户指定的必要验证范围准备 APK，保留原生故障、正式签名、包验证及实际设备验收；完整回归仅通过 full_regression=true 显式开启，不因普通网页提交自动运行。
