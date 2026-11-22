# 当前执行交接

更新时间：2026-11-22。当前检查点；长期任务/授权见ISSUE_LEDGER，架构见OVERVIEW。恢复先核对git与PR/Actions真实状态，不依赖聊天记忆。

## 分支、权限与所有权
- 唯一目录cozy-days-app，本地main，起点本地/远端78716f1ee5d4fa929274253ac1d3a3d612fdcd64；保留全部原未提交改动，无reset/覆盖。
- 用户已授权恢复普通失败并自行修复；普通Bug/测试/可恢复构建错误不再逐次询问，失败期间不合并发布。反复失败或安全修法不确定集中报告；生产数据库、数据丢失风险、签名/更新协议异常、不可恢复、权限不足立即暂停相关操作待确认。
- 实际代理：主集成/最终验收；GPT-6.1 Terra high业务数据；GPT-6.1 Sol medium测试工程；GPT-6 Luna high独立UX。用量恢复后实际续派并收到实现及交叉复核。
- 当前代码/测试冻结：T独占database.ts、TodoForm/useTodos/TodoPage；S独占此前CI/配置/测试及ci-testing文档；主独占AGENTS与architecture三文档；L只读。转交前需主确认。

## 本批完成与验证
- 范围P0-01、P1-05/06/07、P2-04及治理落盘。代码已写，尚待本批提交/PR/远端验证，不标发布。
- P0：同事务原始行CAS、冲突保留输入；本机分类迁移commit后返回精确before/after，undoExpected完整匹配才推进；restore用实际存储row。外部变化继续拒绝；optional baseline旧API及ABA限制保留。
- 原分类删除→撤销失败用例1/1通过。相关41项完成：categories7、data-safety6、swipe9复用本轮修复后早先22项通过；todo-concurrency10、todo9最终19项通过。故障注入测试一次提交等待race已修，没有降低回滚断言。
- policy15、CloudBase4（1平台skip）、TypeScript/云Web构建通过；anniversary/period专用配置实际UI smoke各1通过；publisher7未改源码证据复用。T/S交叉审查、L按主控结果独立UX验收通过，不等于实机/公网/真实账号验收。
- 未重复无关full176；原全量早停结果不是全通过证据。本批不涉及schema迁移，按最新指示使用影响集。远端适用ART/最终verify必须通过，不能用本地policy替代。

## 下一步
1. 核对最终diff/工作区，保存冻结源文件哈希；本地main提交，推一次性远端PR分支（不创建本地分支）。记录实际PR链接，验证latest head/基线/ART/最终verify。
2. merge commit合并后fetch/ff-only；同步前不开始下一轮提交。跟踪实际Pages→Android验证/签名/公开/匿名复核各状态，不能把合并当发布。普通内容不构建APK。
3. 下一工程批P1-08/P2-05先有只读设计，待本批合并快进后实施：正常发布核来源/主线顺序及并发；按目标公开Release选择基线；原字节只读复核保留。
4. 数据批P1-01/03尚未实现，需设计服务端完整农历换算验证、全入口入站隔离及引用一致性，先本地隔离验证。生产SQL/备份未知且操作需确认，不能猜测上线。

## 证据与状态恢复
- 首次失败原件保存在artifacts/governance-first-batch/failure；新增fixture race原件保存在resume-fixture-race；原始测试patch/哈希也在同目录。后续测试不要把旧失败证据重新标成当前通过。
- 新验证在基准HEAD+未提交改动上运行；提交后以文件哈希/树身份确认复用范围，不能只标基准干净SHA。专用配置输出在anniversary-config-results、period-config-results。
- 基准公开shell3-web3来源0826d70221bcfd3f9e5d73e49be0bafc28913277；原run44990551368失败、复核运行44992183427成功。本批发布版本必须重新核对。
- 当前没有生产DB操作、APK构建或真实设备验收。PR/合并/Pages/内容/匿名复核状态随实际运行更新；发生高风险暂停写SHA、日志、现场、证据范围与安全恢复步骤。
