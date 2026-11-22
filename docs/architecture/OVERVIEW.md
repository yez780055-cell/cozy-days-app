# 当前架构与安全边界

核对基准：`78716f1ee5d4fa929274253ac1d3a3d612fdcd64`（2026-11-22）。本文件描述实际实现；计划及问题状态见 [台账](ISSUE_LEDGER.md)，执行检查点见 [交接](AGENT_HANDOFF.md)。

## 入口与归属
- Web/PWA：`src/main.tsx` → CloudGate → App 页面导航。
- Android：MainActivity → 完整内置/已安装网页目录 → native/main、prepareAndroidWindow → 相同 React 应用。
- 正式默认 CloudBase；`VITE_CLOUDBASE_ENABLED=false` 是历史本地夹具/回归模式，不是第二条产品线。
- 待办/分类账号私有；纪念日、生理期、周期设置双人共享。预测经期是派生结果。
- 云缓存按 space/user 分离；历史 little-days v4、cozy-days-period v1 保留；账号库目前物理版本 v1，不等于逻辑备份版本。

## 写入、同步与恢复
页面/表单 → repository → withDataAccess（锁、恢复日志/版本）→ trackCloudChanges → 业务表与 outbox 同事务 → push/pull RPC → PostgreSQL 身份、成员、版本和幂等回执。

正式待办UI的编辑、完成和删除携带原始行基线，在同一业务/outbox事务比较。视图分类fallback不冒充存储基线。撤销采用自身已提交结果：本机分类删除返回事务内before/after凭证，旧期望完整匹配before才推进；恢复返回实际归一化后的行。云刷新和其他标签不自动授权覆盖；缺省baseline旧API及同值ABA不是完整保证。

syncRecords 的 value/desired/attempt/seen、操作ID、墓碑、游标及 syncConflicts 各有职责。当前普通写入仍前后扫描整种类，入站 materialize 仍直接类型断言；这些是待修问题，不能写成已优化。

备份协调器捕获业务/周期数据，替换前保存恢复材料；Web Locks、恢复日志、跨页恢复版本保护必须保留。格式与环境耦合、容量及历史数据入口见台账。

## 更新与发布
Android 文件更新优先、COZ1 整包兜底；完整目录校验/激活、试运行令牌、启动超时和回滚构成信任边界。当前 .phone 出现后过早 ready 尚待修复；PWA 保留平台自身更新实现。

PR验证 → main → Pages构建/实际制品smoke/部署 → Android内容验证 → 隔离签名 → Draft校验 → 公开Release → 匿名复核。

本批将浏览器验证与可复用ART汇入唯一最终verify，native范围共用ci-plan；范围失败、适用任务失败/取消/意外skip均拒绝。真实远端调用验证以对应PR/Actions为准。

shell等于APK versionCode；既有 shell/web/schema、签名Manifest原始字节、COZ1、证书绑定、白名单/限制、历史标签保持兼容。shell3唯一常规目标；shell2冻结功能但尚未退休。

基准线上快照：Android0.2.3构建3；公开内容修订3来源 `0826d70221bcfd3f9e5d73e49be0bafc28913277`，不等于基准main。后续实际发布状态维护在交接和证据中。

## 目标与操作入口
逐步采用携带编辑基线的命令、显式账号作用域、单事务、入站验证/隔离、按记录outbox、一致备份快照、独立逻辑格式及历史只读恢复适配器。不引入新状态框架，不一次合并所有物理库。

操作手册沿用 [测试策略](../ci-testing.md)、[CloudBase](../cloudbase.md)、[内容发布](../android-web-update-release.md)、[APK](../android-release.md)，不再复制一套。

仅在真实架构/契约变化时更新本文件；区分当前与目标，不积累运行流水账。
