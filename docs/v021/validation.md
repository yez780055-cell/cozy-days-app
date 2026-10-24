# v0.2.1 G5 验证

源码基线：`ffbcae2b7ed688b3be21e6591d33083b3b475539`。本阶段未修改应用源码，只更新版本至 0.2.1、适配恢复测试中已改为两行的起止日期显示、等待素材完成解码后检查，并增加验收资料。

最终结果见 `public/review/v021/results.json`；完整日志在 `artifacts/v021-final/`。所有现有测试保持原业务断言；日期显示改为对 `<b>` 日期容器的精确文本匹配，仍同时验证起止日期。

| 检查 | 结果 |
| --- | --- |
| npm ci | 通过；168 packages，0 vulnerabilities |
| 完整 test:e2e | 131/132；1 项 reload 30s 超时，原样 swipe 组重跑 9/9 通过 |
| build / build:pages | 通过；含最终静态验收资料 |
| test:pages | 4/4 通过（串行、独立输出目录） |
| 待办源码冻结 | 对 6a36762 的 `src/features/todo`、`src/components`、`src/app`、`src/styles`、`src/data` diff 为 0 |
| 待办三尺寸精确 RGBA 比较 | 360×740 / 393×852 / 430×932：changedPixels 均为 0，PNG SHA256 与稳定基线完全一致 |

首轮完整 E2E 为 127/132：两项待办测试的关闭阶段 trace 文件被同时运行的 Pages 清理（ENOENT，非业务断言失败）；三项恢复测试使用旧日期分隔符。首轮 Pages 为 3/4，同样出现 trace ENOENT。原始日志保留为 `test-e2e.log` / `test-pages.log`，最终运行使用独立输出目录并串行完成。

第二轮完整 E2E 为 131/132：`period-assets` 的 360px 用例只等待图片可见便检查 `complete`，图片解码存在竞态。补充 `await img.decode()` 后保留全部图片数量、加载与 pointer-events 断言；日志保留为 `test-e2e-second.log`。最终数量只取完整最终日志。

最终完整 E2E 为 131/132：`swipe.spec.ts:98` 的 `page.reload` 等待 load 时耗尽 30 秒；同轮多个相邻用例也明显变慢。该冻结用例在前两轮均通过，随后原样重跑完整 swipe 组 9/9 通过，快照用例耗时 5.3 秒。未修改冻结源码、测试或超时。132 个唯一 E2E 用例均已有通过证据，但未取得单次完整 132/132 全绿，因此机读状态为 `PASS_WITH_RETRY`，保留这一运行限制。

验收入口：`/review/v021/`。29 张真实图片包含两张只用于 review 的原始参考、三尺寸顶部与经期每日记录、三尺寸四类纪念日卡片滚动位置、393px 月视图/编辑/删除确认，以及三档待办。截图使用临时浏览器上下文、独立合成 IndexedDB 数据、2026-10-24 12:00 北京时间、Yozai 字体，等待字体与所有图片解码后捕获；应用不会自动加入示例数据。经期包含两段历史和三个已选记录项；纪念日均含备注，覆盖每年重复及已过去的单次日期。

来源记录：`source.json` 保留实际源码 SHA、捕获时 HEAD、源码与图片 SHA256、合成数据说明、时区与视口；没有把尚未产生的提交写成截图来源。固定测试时钟为北京时间 12:00；实际系统捕获时间独立记录为 `capturedAt`。

复现：从仓库根目录构建，启动 `npm run preview -- --host 127.0.0.1 --port 5197 --strictPort`，再运行 `node docs/v021/capture.mjs` 与 `node docs/v021/compare-todo.mjs`。比较脚本默认读取 `D:/cozy-days-v021-design/artifacts/v021-todo-baseline`，也支持 `TODO_BASELINE_DIR` 指向稳定基线目录。`artifacts/v021-final/todo-baseline.mjs` 保留原基线捕获方法（稳定构建端口 5182）；静态入口检查脚本与完整日志位于 `artifacts/v021-final/`。

限制：浏览器视口及 CSS 安全区模拟，未进行 Android 真机验证。完整测试验证旧数据兼容、刷新持久化、写入失败草稿保留、重试、冲突及恢复；未访问真实个人数据库。本阶段未执行 PR、远端推送、部署或 main 操作。

主代理收尾核验：G5 子代理在最终资料落盘后因用量限制停止，未创建提交。主代理读取原始日志核验上述数量，并校验最终 29 张图片、全部应用源码和捕获脚本的 SHA256；与 source.json 全部匹配。原始构建及三轮 E2E、滑动复测、Pages 日志的可审查副本位于 [logs/](./logs/)，原 artifacts 日志仍保留。没有将最后一次全量运行描述为单次全绿。
