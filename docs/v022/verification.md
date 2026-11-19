# v0.2.2 验证与来源

版本：0.2.2。验证分支：`feature/v022-verification`。仅使用临时浏览器上下文及合成数据，未访问真实 IndexedDB、远端、main 或 Android 工程。

## 源码与夹具

- 首轮修复提交：`6db64d0251d4dc5df3d36f65c814dfc03b635a49`（近90天补录保护、跨午夜确认保护、版本和旧测试更新）。
- 布局与边界提交：`4879002460dab17ece33f9181a1a467f010122b2`（放大字体自然增高、月外灰字无背景、双向月历手势及严格几何断言）。标题及底部留量提交：`7fc573b3052e4b4d94676063a225be3885966880`。最终截图绑定下述最后实际运行的源码 SHA，详见 `public/review/v022/source.json`。
- 修改前基线：`bbeaa4cc608e0f0036a15143db65b28a8d74050a`；原图及原始 `source.json` 来自 `D:/cozy-days-v022/artifacts/v022-before`，三图 SHA-256 已逐项与源清单核对。
- 三档前后对照统一夹具：`Asia/Shanghai`，`2026-10-25T04:00:00Z`；9月20日至25日、10月20日起进行中；10月25日流量适中、症状疲惫、心情平静；设置周期30天、经期6天。最终截图先等待 Yozai font-face 实际 `loaded` 和所有图片 `decode()`。
- 最后两次修复：`8ec24ddeffe6664651e5d96943b5865c0005bda3`（花朵/hero几何）、`afc908261f20646e2307c119dc32e9c02f5eecbc`（恢复待办日期原grid直接子关系及命中目标）。最终实际测试及捕获源码为 `afc908261f20646e2307c119dc32e9c02f5eecbc`。
- 主代理 cherry-pick 后的整合等价源码为 `eda099dfc92d913562581bbc5a6b4e3138162ed2`。已独立用 Git diff 比较两者的 `src`、`tests`、`package.json`、`package-lock.json`，内容完全相同，完整 blob 清单在 `public/review/v022/source-blobs.txt`。这不表示测试在整合 SHA 上重复运行。
- 六周+安全区采用既有 `v022-interactions` 的独立五月夹具，包含五月、九月及十月记录，仅验证布局；不得用于三档前后对照或声称30天统计。
- 安全区是 CSS 模拟：顶部24px，底部导航增加24px预算；150%字体按各文本节点原计算值乘1.5，保持矮屏自然滚动，不缩小字体。

## F1–F12 覆盖

| 类别 | 验证内容 | 测试 |
|---|---|---|
| F1 | 待办日期左右触控、阈值、垂直/多指隔离、卡片操作与撤销 | `v022-interactions` 第一例、既有 `swipe`/`todo` |
| F2 | 月历左右真实触控、按钮同步、月末选中日期钳制、短手势不误选 | `v022-interactions` 第一例 |
| F3 | 360×740、393×852、430×932真实“是”状态下所有流量、症状、心情一屏 | `v022-evidence` 三档、`v022-interactions` 三档 |
| F4 | 六周月历+是状态+safe24，以及空记录+safe24组合一屏 | `v022-interactions` 六周例、`v022-evidence` 空态组合例 |
| F5 | 360×480/640普通及150%字体自然滚动；日期/legend不重叠，摘要末项在卡片内，标题不裁切，控件和文字不压导航 | `v022-evidence` 两个 short screen 例 |
| F6 | 跨周跨月色带收口、月外灰字、真实伪元素背景几何相接 | `v022-evidence` bands、393/900 today例 |
| F7 | 今天与选中轮廓不切断背景、真实优先、四种状态与图例精确同色 | `v022-evidence`、`period-model` |
| F8 | 今天否→是/是→否、截昨天、单日移除、相邻独立分段 | `v022-period-logic`、`period-model` |
| F9 | 历史取消先显示明确受影响范围，取消不写；跨本地午夜拒绝且零持久化调用 | `v022-period-logic` removal/midnight |
| F10 | 历史补录后续/近90天强制结束日期；90天含首尾边界、无效/未来/倒序/重叠拒绝、保护近期 | `period-model`、`v022-period-logic` |
| F11 | 保存失败保留最新状态、重试、刷新及模块切换 | `v022-period-logic`、既有 `period-recovery` |
| F12 | 旧数据形状、未知根/区间/设置/日记字段原样保留；旧flow隐藏后刷新重新是恢复 | `v022-period-logic`、既有 `period-recovery`/migration |

## 原失败与修复

1. 近90天已结束记录早于所选补录日时，原逻辑错误返回 `ready`。`logs/review-before-fix.log` 保留失败；模型现在对区间与 `[today-89,today]` 的相交判断含首尾，今天不适用该窗。
2. 上海10月23日23:59打开历史截断，快进2分钟后原确认会扩大至24日。`logs/midnight-before-fix.log` 保留失败；弹窗存打开时本地日期，确认先检查日期和重新推导的显示范围，拒绝时不调用 update。
3. 空记录+safe24原有19px纵向溢出。`logs/visual-first-run.log` 保留失败；压缩空态重复辅助文案的行距/间距与最小高度，未缩字体。
4. 放大字体视觉审查发现固定 dashboard/grid 高度造成行/图例与摘要/日记重叠。原480px上下图保留在 `public/review/v022/failures`，明确为失败证据。改为内在高度、em最小日期行、标题/控件自然换行，并增加真实几何断言。中间日志记录过 safe24 5px溢出与放大月历按钮极小裁边，均保留，最终结果另记。
5. 待办保存弹窗动画未结束即发下一次触控曾导致一个手势测试失败。新增等待保存弹窗实际消失，保留业务断言，不增加盲目重试。
6. 首次完整160项结果为156通过、4失败：两档花朵装饰压月历按钮、430宽hero art不足原比例断言、连续卡片手势未完成。前两种用最小CSS恢复间距/尺寸，所有原断言保留。卡片问题在新源码独立3/3失败、bbe基线独立端口原例通过。只读pointerdown探针证实新增日期wrapper把日期导航从与tabs同行挤到上一独占行，使task-area从97px降为53px；最后C卡中心y487实际命中撤销提示，基线y470命中丙。移除wrapper，将同一日期hook分别绑定原date-row/date-navigation，恢复原grid直接子关系；修复后rect与基线完全相同，原用例3/3及带探针3/3均通过，未改Card/Swipe或原测试业务断言。命中JSON与日志在logs，探针源保留为diagnostics/swipe-hit-probe.txt，不纳入自动测试套件。
7. 日期wrapper恢复后，新增交互测试的“卡片横拖后立即新点击编辑”触发了既有 TodoCard 的400ms防误触窗口。保留横拖不误开编辑/不改日期断言，并用已安装虚拟时钟推进401ms后测试独立新点击；没有增加真实等待、放宽原swipe测试或更改卡片代码。最终8项交互通过。
8. 最终源afc9082的原30秒总预算完整轮在快照回归 `tests/swipe.spec.ts:119` 的reload等待load超时：reload开始前已用19.221秒，等待11.046秒后触发整例30秒上限。保留整轮结果及原始trace，日志为`full-e2e-30s-timeout.log`，量化见`snapshot-timeout-analysis.json`。最终同源码使用CLI `--timeout=60000` 重跑全部160项；业务expect仍为6秒、重试0次，没有修改源码、原断言或跳过案例。

## 验证运行

原始命令输出在 `docs/v022/logs`。`full-e2e-first.log` 为源范围更新时安全中止的中间运行；`full-e2e-interrupted-by-session.log` 在118/160时会话终止且原handle丢失，没有最终结果，两者均不能视作通过。最终同一源码重新完整运行；完整 E2E、普通构建、Pages 构建与 Pages 交互结果在 `public/review/v022/source.json` 记录。

旧测试会生成历史 public/review 图像及来源文件。运行前备份187个跟踪文件并记录 SHA-256；运行后仅恢复被重生成的历史文件，并再核对哈希；保留有意修改的验收入口及新增 v022 证据，不把旧生成图混入提交。

最终本地状态为 **PASS_WITH_RETRY**，不宣称某次完整轮160/160全绿：

| 源码/命令 | 原始结果 | 原始日志 |
|---|---|---|
| afc9082，默认30秒完整轮 | 159/160；snapshot整例预算超时 | `logs/full-e2e-30s-timeout.log` |
| afc9082，CLI `--timeout=60000`完整轮 | 159/160；todo多尺寸原例显式60秒预算超时 | `logs/full-e2e-60s-mobile-timeout.log` |
| afc9082，以上两个原例按原预算定向一次 | 2/2，17.3秒；snapshot仍30秒，todo仍显式60秒 | `logs/original-budgets-directed.log` |
| Web / Pages构建 | 通过 | `logs/build.log`、`logs/build-pages.log` |
| Pages资产及交互 | 4/4通过 | `logs/pages.log` |
| 最终18图/元数据打包后双构建复验 | 通过 | `logs/build-final-package.log`、`logs/build-pages-final-package.log` |
| 新v022静态验收页 | 1/1通过；全部图片解码、18张图SHA-256、全部相对链接、来源SHA均核对 | `logs/v022-review-smoke.log` |

两个完整轮失败的是不同加载总预算案例，160个unique案例均有通过证据，业务expect保持6秒、重试0次、原源码及断言没有变更。todo超时发生在第二个尺寸末次goto：之前已耗52.359秒，剩余约8秒后触发总上限；量化及未完成资源列表见`logs/todo-mobile-timeout-analysis.json`、`logs/todo-mobile-resource-timing.json`。完成后无遗留本任务Playwright浏览器根进程，机器状态另存`logs/mobile-timeout-machine-state.json`。独立远端Linux完整回归由主代理执行，本地不等待、不冒称远端通过。

187个旧产物已逐项恢复/核验：56个被测试重生成的文件从备份精确恢复，其余131个哈希原本相同。所有187项均核对原SHA-256；核对后仅有意更新`public/review/index.html`的v0.2.2入口。详见`logs/old-review-restoration.json`。

## 限制

Android 原生安全区、软键盘与真机手势尚未验证。预测沿用现有估算规则，不作医疗诊断或避孕用途。远端 PR、Cloudflare Preview 与正式部署由主代理另行执行。
