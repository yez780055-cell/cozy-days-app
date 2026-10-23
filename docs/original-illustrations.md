# 原稿贴边插画集成

四组素材均来自原稿 `public/review/evidence/reference/original-design.png`（1024×1536）。SHA-256 为 `bf2eb322ccaa2736222770bcfeb4ca1d34da4bb8b2f0aa11d623be729da86b51`。用户已确认第一阶段贴边适配，并授权集成；盆栽、书本和猫的截断是原稿造型，不补全隐藏部分。

| PNG（相对 public/assets/cozy_days/raster/original/） | 尺寸 | 锚点 |
| --- | --- | --- |
| plant.png | 66×117 | 头图左下，限制高度以避开现有文案 |
| cheer.png | 91×77 | 头图右上 |
| books-bubble.png | 192×76 | 内容与底部导航交界左侧 |
| peeking-cat.png | 50×56 | 内容与底部导航交界右侧 |

通过素材登记表的 ready 门槛注册；这是用户批准后的本轮登记，不改写第一阶段历史审核状态。没有使用总览图作为背景。原稿纸纹、柔线和小尺寸像素感保留；气泡少量外缘亮像素作去色偏处理，猫移除一个极低 alpha 残点。对照图、修改前后 PNG 及哈希在 `public/review/evidence/illustrations/`。

新增样式仅控制装饰与装饰所需避让。图片与容器均 `pointer-events:none`，隐藏于辅助技术，不可拖动。头图、日期、分类和任务卡片的尺寸与逻辑不变。底部复用既有 82px 留白，不增加区块；旧列表尾部的书本/樱桃装饰及附带文案由本轮原稿书本气泡替代，避免空状态重叠。底边使用导航高度加 `env(safe-area-inset-bottom)`，加号仅横向左移给黑猫留出独立区域，撤销栈右缘随加号避让。装饰不进入任务滚动流，淡出遮罩限制在列表自身的层叠上下文内。

新增三视口真实页面测试覆盖空状态、五任务截图、十二任务滚动、左右滑动、加号命中、三条撤销、34px 安全区模拟和图片比例/边缘锚点。标准 E2E 和两项构建、Pages 检查仍执行。所有数据为独立临时浏览器上下文的合成数据；不接触已有用户数据。

真实页面截图在 `public/review/evidence/screenshots/illustrations-*.png`，由 Playwright 生成；34px 安全区图是浏览器模拟，不代表已完成 Android 真机测试。部署只使用既有 Cloudflare Pages 非 main 分支 Preview，生产设置不变，不自动合并。
