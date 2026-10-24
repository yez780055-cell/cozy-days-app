# M4 生理期视觉素材与响应式核验

## 结果与边界

M4 在本地完成：8 项已存在的项目素材接入生理期页面，11 项缺少独立可用素材的插画继续标为 `needs-redraw`，日历、心情、提醒三个功能图标继续复用已有组件。组件通过共享 `<Asset>` 呈现，保留其自带的离线 data URI fallback。没有改共享 Asset/registry、业务持久化或算法、数据库、待办代码、global CSS、原用户目录或旧测试。

源/UI commit 为 `280b4fecbf2314abd473e1a5bf660c2678c1984f`；新增素材断言更正及滚动截图 commit 为 `05ad5ae79f315eda81d38194ecccffcbd29282c6`。最终功能测试均绑定第二个 SHA。证据网页和本文档属于后续证据层，不改变功能代码。未进行 M4 Cloudflare Preview/线上视觉验收、Android 实机验收，也没有创建 M4 tag、推送或 PR。

## 素材与映射

来源均为仓库既有共享素材，重用依据为用户在本轮授权复用已审查项目素材；这不是第三方许可或独立版权清理声明。PNG 的宽高、alpha 通道、像素透明度比例及 SHA-256 按实际源文件/像素检查。SVG 用规范化内容 SHA-256，并记录 `git hash-object` blob，避免 Windows 行尾转换影响文件字节摘要。

| 资源 | 实际像素尺寸 | 可见 alpha 透明比例 | SHA-256（规范 SVG 内容） | 页面用途 |
|---|---:|---:|---|---|
| `cats_header.png` | 1602×884 | 0.41860；alpha 最大 254，完全不透明像素占比为 0 | `01c839801c4a78ce4c37433db0ee63e4a171fe3b19645c3b5756d37dde05e59a` | 页头双猫插画 |
| `cats_empty_state.png` | 1875×811 | 0.44547 | `96e7ea984b170bbdb78af03b74e3b3bb7360569cc706f0fd1d139c38f3bff829` | 日记纸条边角双猫 |
| `star_cream.svg` | 128×128 | 矢量透明背景 | `5d84edd7fbd1406e5cdc658c607c8a5c24607ef2aee4c52c8bfc31b79a84bd84`；git blob `3f6ac84084e356058404a4b3488d4f032ffad87d` | 页头星形点缀 |
| `sparkle_gold.svg` | 128×128 | 矢量透明背景 | `3119e0e755612e7125ad32de61168ef55b5e6e2035c5f6129931749b044fec57`；git blob `5aaefb901dc9759be37959998732c3d5751fc129` | 页头暖金星光 |
| `heart_pink_outline.svg` | 128×128 | 矢量透明背景 | `6137cc47a35ee8c05200ec41efb747efb6edb173dcedee5fa734655fb2c64927`；git blob `de9a4f7122e9fb284a0f7a32c2c2041ddba4ed49` | 页头和贴士小爱心 |
| `washi_pink.png` | 302×179 | 0.46424 | `67d472011ab6ed8e0df6876308fe9dbceb03e210246ecb7e5b03b01c12d7b3cb` | 日记卡片胶带 |
| `flower_pink.png` | 139×138 | 0.44422 | `563d9fe84ad9482987dcad02852c3fa80326fb084f1a500cfb7a3c6231e6f5f5` | 日历标题旁小花；不冒充参考中的郁金香 |
| `book_open_decor.png` | 394×258 | 0.46766 | `22a71d58b0992a999c4ffa2808e80ee928fec6839cc4fff4139cee19420840b2` | 贴士卡片书本 |

头图猫图没有 alpha=255 的像素，但其 alpha 最大值为 254，且存在大量部分 alpha 绘制像素。首轮新增断言误将“有不透明像素”当成透明素材质量条件，造成 49 pass / 1 fail；保留原失败 trace 后，按真实 alpha 语义改正为检查部分 alpha 绘制像素。没有改动原图或既有测试。

## 参考图来源与比较限制

对 `C:\Users\32582\.codex\attachments` 做了有界图片枚举，仅检查 PNG/JPG/JPEG/WEBP/HEIC；共找到 6 个文件，按 SHA 去重后为 3 张不同的图。另检查了仓库已有素材目录。找到用户提供的生理期参考图，941×1672，SHA-256 `9d19d52870789f086461e245cf8ad383ecd61ec0ebd965ef61dbf63870576a38`。原图留在本机附件目录，没有复制进仓库，也没有从整页截图抠图或用于应用插画。审查页只记录摘要并展示真实运行截图。

页面沿用参考图的粉紫、纸张拼贴和猫咪方向。现有素材不能复现参考图里独立的月亮、郁金香花束、抱暖水袋白猫、抱杯黑猫、便签/回形针场景等专属插画。manifest 的 11 个 redraw 缺口因此仍明确保留；小花仅作为日历装饰，不能替代郁金香。三种既有功能图标没有做插画替换。该比较是本地静态运行截图的视觉复核，不构成线上验收或授权结论。

## 真实运行截图

审阅入口：`/review/period-assets/evidence.html`，来源索引及每张图 SHA 在同目录 `evidence.json`。截图由 Playwright Chromium、`playwright.period.config.ts` 在功能 source SHA `05ad5ae79f315eda81d38194ecccffcbd29282c6` 生成，合成日期为 2026-10-23。每种尺寸使用独立浏览器 context。

| 视口 | 初始顶部普通截图 | 实际滚动到日记后的截图 | 实际滚动到贴士后的截图 |
|---|---|---|---|
| 360×740 | `public/review/period-assets/evidence/header-360x740.png` | `.../diary-360x740.png` | `.../tips-360x740.png` |
| 393×852 | `public/review/period-assets/evidence/header-393x852.png` | `.../diary-393x852.png` | `.../tips-393x852.png` |
| 430×932 | `public/review/period-assets/evidence/header-430x932.png` | `.../diary-430x932.png` | `.../tips-430x932.png` |

顶部截图来自初始页面位置；日记/贴士截图由测试先对 `.period-page` 内部滚动容器执行真实 `scrollIntoViewIfNeeded` 后截取，不是 `fullPage`。旧的 document-only `fullPage` 尝试明确放在 `artifacts/integration/m4/failed-attempt-01/document-fullPage-no-inner-scroll-*`，不作为全页证据。浅色棋盘格和深底素材展示图分别为 `evidence/assets-light.png`、`evidence/assets-dark.png`。所有最终证据的文件级 SHA-256 在 `evidence.json`。

截图矩阵检查页头、日历、日记、贴士卡片文字可读，装饰不遮挡文本/控件；三个视口都记录滚动截图和几何不重叠断言。装饰层 `pointer-events: none`。总控还逐张查看了 360px 顶部、日记与贴士图，认可可读性与避让。浅/深图用于素材边缘对照，不替代实际页面截图。

## 验证记录

功能 SHA `05ad5ae79f315eda81d38194ecccffcbd29282c6` 的最终串行检查均成功：

| 命令 | 结果 | transcript SHA-256 |
|---|---:|---|
| `npm ci` | exit 0；安装成功，报告 2 项 dependency advisories（moderate/high） | `5b616d2913a5e5ac76de42221101b1229e3f231555d9f5ed35eb885a0ca75c02` |
| `npm run build` | exit 0 | `868353bef9096ea9ae4a1c727a47d7216b0b0faa481d51e51b56498526aa9b47` |
| `npm run build:pages` | exit 0 | `7077d02ec0cd9aef5aeeee14987ea963378c6e8f8dd7204b98cf5ec983cf6b23` |
| `npx playwright test --config playwright.period.config.ts` | 50 passed | `b93ef85c876fe175681560b200a0598826e6e84156635373a2258dcfad072504` |
| `npx playwright test tests/swipe.spec.ts tests/audit-regressions.spec.ts tests/font-switcher.spec.ts` | 17 passed | `0e41692821faf356385ba360a6d946f39fd262aca3f1af71060d6a43a76dbe2e` |
| `npm run test:pages` | 4 passed | `7d3e03ab085ad381bd00432f83ca78628e4b84ee66dd4dc22e786e27da14c3ec` |

Period 50 tests包含新增图像尺寸/alpha/hash、三尺寸边界和遮挡、真实滚动截图、浅深素材展示以及失败请求后 fallback 与离线交互检查，也包含现有 period 功能测试。失败首轮的 trace/context/log 已复制并校验到 `artifacts/integration/m4/failed-attempt-01/`；trace SHA-256 `bdd6de909134f42a823818c833eb95074aef7db5c581f12d1495a0c650024e0c`，error context `de6310836ec8b0957e475e704dc46d6ccf9cafc9cb7758739a14ed55d058ae51`，初次失败日志 `f34226e3e9006727e4538f0e5e28cc7bf0640d741600d88e29796caede9b7a03`。最终 period suite 在修正断言与滚动截图后通过。测试运行生成的 M2 路径截图已归档到 ignored artifacts，tracked M2 图片恢复原样。

本地审阅静态页新增后再执行的两种构建及 Pages 检查，应以 `m4-results.json` 中的 follow-up transcript 与 hash 为准。这些检查不会把本地证据页称为 Cloudflare Preview。M3 Cloudflare 成功证据属于此前纪念日 checkpoint，与 M4 无关；见 `status.md`。

## 未完成事项

- 11 个专属插画素材仍待提供原始分层稿或透明重绘稿；当前 UI 使用可用的共享猫图、纸胶带、花朵、书本和符号装饰。
- 未进行 Android 真机、M4 Cloudflare Preview 或线上浏览器验收。
- 未做素材第三方许可清理；复用范围以用户本轮授权为依据。
- M4 未创建阶段 tag，也没有 push/PR；总控负责后续集成门槛。
