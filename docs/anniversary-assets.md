# 纪念日素材提取质量报告

## 结论

本轮优先复用了已有透明双猫、花朵、爱心、星星、闪光和纸胶带素材，没有复制或重命名相同公共资源。参考图中的顶部猫咪、生日蛋糕、毕业帽、相框、猫爪和蝴蝶结均与粉色纸纹/卡片或其他物件交叠；直接抠取会留下底色、缺损轮廓或 UI 碎片，因此没有登记成正式透明素材，状态标为 `needs-redraw`。

## 素材清单

完整机器可读清单：[`public/assets/cozy_days/anniversary/manifest.json`](../public/assets/cozy_days/anniversary/manifest.json)。

| 文件名 / ID | 用途 | 尺寸与格式 | 来源 / 透明检查 | 状态 | 复用 | 推荐显示尺寸 |
| --- | --- | --- | --- | --- | --- | --- |
| `cats-hugging` | 卡片、空状态双猫 | 1875×811 PNG | `public/assets/cozy_days/raster/characters/cats_empty_state.png`；RGBA 透明 | ready-reuse | 是 | 150×65 CSS px |
| `cats-heart` | 恋爱纪念卡片 | 未提取 | 用户参考图；背景与猫重叠 | needs-redraw | 否 | 88×88 CSS px |
| `cats-header` | 顶部横幅猫咪主视觉 | 未提取 | 用户参考图；猫咪与被褥、背景交叠 | needs-redraw | 否 | 320×200 CSS px |
| `birthday-cake` | 生日卡片 | 未提取 | 用户参考图；背景纹理不可可靠去除 | needs-redraw | 否 | 92×100 CSS px |
| `graduation` | 毕业卡片 | 未提取 | 用户参考图；与证书、花朵组合 | needs-redraw | 否 | 150×105 CSS px |
| `photo-frame` | 卡片/拍立得装饰 | 未提取 | 用户参考图；叠在场景背景上 | needs-redraw | 否 | 88×95 CSS px |
| `flower-pink` | 卡片小花 | 139×138 PNG | `public/assets/cozy_days/raster/decor/flower_pink.png`；RGBA 透明 | ready-reuse | 是 | 24×24 CSS px |
| `pink-heart` | 爱心点缀 | SVG | `public/assets/cozy_days/vectors/symbols/heart_pink_outline.svg`；矢量透明 | ready-reuse | 是 | 18×18 CSS px |
| `tiny-star` | 星星点缀 | SVG | `public/assets/cozy_days/vectors/symbols/star_cream.svg`；矢量透明 | ready-reuse | 是 | 16×16 CSS px |
| `sparkle-gold` | 闪光点缀 | SVG | `public/assets/cozy_days/vectors/symbols/sparkle_gold.svg`；矢量透明 | ready-reuse | 是 | 18×18 CSS px |
| `washi-pink` | 相片胶带装饰 | 302×179 PNG | `public/assets/cozy_days/raster/decor/washi_pink.png`；RGBA 透明 | ready-reuse | 是 | 56×32 CSS px |
| `cat-paws` | 宠物纪念卡片 | 未提取 | 用户参考图；小尺寸且有纹理底色 | needs-redraw | 否 | 22×22 CSS px |
| `pink-bow` | 礼物与相框 | 未提取 | 用户参考图；与相框、背景线条重叠 | needs-redraw | 否 | 30×24 CSS px |
| `event-flowers` | 顶部花束 | 未提取 | 用户参考图；花枝与背景线条交叠 | needs-redraw | 否 | 80×120 CSS px |
| `hand-drawn-lines` | 场景装饰线 | 未提取 | 用户参考图；线条与纸纹及 UI 混合 | needs-redraw | 否 | 视场景而定 |

## 原图裁切定位

参考图为 852×1847 像素。`manifest.json` 中 `crop` 用 `[x, y, width, height]` 表示该参考图上的定位框，供后续重绘/人工编辑定位。定位框只是工作指引，不是透明 PNG，也不能直接当素材使用。原始参考图保存在 [`public/review/anniversary-assets/reference.png`](../public/review/anniversary-assets/reference.png)，仅作为来源证据，不得用作应用背景或页面插图。

## 质量检查

- 复用资源保留现有源文件，不覆盖公共素材。
- PNG 使用 RGBA 通道；SVG 使用矢量透明背景。图册可在浅色和深色棋盘对照底色间切换观察边缘。
- 不对纹理截图执行色键抠图，因此没有引入白边、锯齿、去色偏或锐化伪影。
- `needs-redraw` 项在图册中仅展示参考图局部定位，并显著注明“原图局部 / 非透明素材”。
- 没有可供 PR 独立预览部署的 Cloudflare Pages 工作流；仓库现有流程仅含 GitHub Pages main 部署和 PR 快速验证。验收图册可从分支静态预览或本地打开。

## 资源映射

`manifest.json` 同时作为稳定 ID 到既有素材路径的统一映射。引用路径相对 manifest 所在目录，以便继续兼容项目静态资源结构。尚未完成绘制的 ID 使用 `file: null`，调用方需跳过这些项，不能把预览裁图当作资源加载。
