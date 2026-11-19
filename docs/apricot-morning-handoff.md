# 杏桃晨光 · 阶段 0–5 收口

冻结版本以远端 `main` 的 `a9a3aa6` 为基线。该提交是移动端易用性与 PWA 更新的合并点，文件树与装修开工时所在的 `ead5041` 一致。装修成果从原工作区的最终快照转入独立分支，逐文件比对了 73 个文件内容和 3 项旧样式删除。

## 提交分界

- `282e56b` 单独记录开工前已有的数据层行为，包括纪念日累计与倒计时、照片和焦点的备份兼容、周期区间校验与同值更新跳过写入。
- `e744f59` 收录冻结的应用源码和回归用例。开工前已有的首页入口、周期信息、纪念日列表与照片编辑，有部分与装修共用文件，随最终界面一并保留。早期各阶段的本地分支都指向同一个开工提交，阶段间未形成独立 Git 快照。

## 阶段对照

| 阶段 | 交付范围 | 源码与验证入口 |
| --- | --- | --- |
| 0–1 | gold 原型基线、共用样式与控件 | `src/styles/tokens.css`、`src/styles/global.css`、`src/components/`、`tests/apricot-foundation.spec.ts` |
| 2 | 待办周条、分类、编辑、滑动与撤销 | `src/features/todo/`、`tests/todo.spec.ts`、`tests/categories-time.spec.ts`、`tests/swipe.spec.ts` |
| 3 | 周期摘要、月历、日记、经期和恢复流程 | `src/features/period/`、`tests/period-ux.spec.ts`、`tests/period-recovery.spec.ts` |
| 4 | 纪念日收藏、列表、详情、照片裁切与备份 | `src/features/anniversary/`、`tests/anniversary-timing-list.spec.ts`、`tests/anniversary-photo-backup.spec.ts` |
| 5 | 首页摘要、设置、字体、备份与 PWA 提示 | `src/features/home/`、`src/features/settings/`、`src/PwaUpdate.tsx`、`tests/home-ux.spec.ts`、`tests/font-switcher.spec.ts`、`tests/data-safety.spec.ts`、`tests/pwa-update.spec.ts` |

本地 `warm-cozy-design` 目录保留实施计划和各阶段验收记录。需要复核三档截图时，启动本机 Vite，使用 `node tests/apricot-capture.mjs phase5 <输出目录>`。脚本会记录原型输入哈希与浏览器测量值。历史截图、构建产物、原型文件和其他工作区均留在本地。

## 收口回归

源码提交 `e744f59` 在独立工作树按锁文件安装后，`npm run build` 和 `npm run build:pages` 均通过。Edge 定向回归通过 26 项，涵盖首页、字体、待办与撤销、经期区间、旧纪念日备份、照片裁切与恢复、数据合并与替换、Pages 子路径和 PWA 离线与更新。此前阶段 5 的 100 项通过为独立的本地验收结果。

## 发布范围

现有 Android 工程、依赖锁、CI 配置、服务工作线程和静态评审页保持在基线版本。该分支用于独立草稿 PR 审查，提交采用 Cloudflare Pages 跳过部署的标记。iOS Safari 与 Android WebView 的输入法、键盘、触控、系统字体和安全区仍需真机验收。
