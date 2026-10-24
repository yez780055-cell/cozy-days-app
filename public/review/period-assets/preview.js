const manifestUrl = new URL('../../assets/cozy_days/period/manifest.json', window.location.href);
const readyNode = document.querySelector('#ready');
const pendingNode = document.querySelector('#pending');

function card(asset) {
  const element = document.createElement('article');
  element.className = 'card';
  const preview = document.createElement('div');
  preview.className = 'preview';
  if (asset.path) {
    const image = document.createElement('img');
    image.src = new URL(asset.path, window.location.origin).href;
    image.alt = asset.id;
    image.onerror = () => { preview.replaceChildren(Object.assign(document.createElement('p'), { className: 'placeholder', textContent: '图片路径无效' })); };
    preview.append(image);
  } else {
    const placeholder = document.createElement('p');
    placeholder.className = 'placeholder';
    placeholder.textContent = asset.redraw ? '待重绘 · 当前无可用原图' : '使用页面现有 SVG 图标组件';
    preview.append(placeholder);
  }
  const details = document.createElement('div');
  details.className = 'details';
  const title = document.createElement('h3'); title.textContent = asset.id;
  const meta = document.createElement('div'); meta.className = 'meta';
  for (const value of [asset.format || '待制作', asset.width && asset.height ? `${asset.width} × ${asset.height}` : '尺寸待定', asset.transparent === true ? '透明背景' : asset.transparent === false ? '不透明' : '透明待确认']) {
    const tag = document.createElement('span'); tag.textContent = value; meta.append(tag);
  }
  const use = document.createElement('p'); use.textContent = `用途：${asset.use}`;
  const quality = document.createElement('p'); quality.className = asset.redraw ? '' : 'status'; quality.textContent = asset.redraw ? `待处理：${asset.reason || asset.quality} ${asset.redrawRecommendation || ''}` : asset.quality;
  details.append(title, meta, use, quality); element.append(preview, details); return element;
}

fetch(manifestUrl).then(response => {
  if (!response.ok) throw new Error(`manifest ${response.status}`);
  return response.json();
}).then(data => {
  const ready = data.assets.filter(asset => asset.path);
  const pending = data.assets.filter(asset => !asset.path);
  document.querySelector('#source-note').textContent = data.sourceNote;
  const summary = document.querySelector('#summary');
  for (const label of [`${data.assets.length} 项登记`, `${ready.length} 项可直接使用`, `${pending.filter(asset => asset.redraw).length} 项待重绘`, `${pending.filter(asset => !asset.redraw).length} 项使用现有组件`]) {
    const badge = document.createElement('span'); badge.textContent = label; summary.append(badge);
  }
  ready.forEach(asset => readyNode.append(card(asset)));
  pending.forEach(asset => pendingNode.append(card(asset)));
}).catch(error => {
  document.querySelector('#source-note').textContent = `素材清单读取失败：${error.message}`;
});

document.querySelectorAll('[data-bg]').forEach(button => button.addEventListener('click', () => {
  document.body.dataset.bg = button.dataset.bg;
  document.querySelectorAll('[data-bg]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
}));
