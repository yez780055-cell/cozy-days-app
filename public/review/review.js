void (async () => {
const sizes = ['360x740', '393x852', '430x932'];
const screens = document.querySelector('#screens');
const videos = document.querySelector('#videos');
for (const size of sizes) {
  const screenshot = document.createElement('figure');
  const image = document.createElement('img');
  image.src = `./evidence/screenshots/${size}.png`;
  image.alt = `${size.replace('x', ' × ')} 实际浏览器截图`;
  screenshot.append(image, Object.assign(document.createElement('figcaption'), { textContent: size.replace('x', ' × ') }));
  screens.append(screenshot);
  const recording = document.createElement('figure');
  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = `./evidence/videos/${size}.webm`;
  video.setAttribute('aria-label', `${size.replace('x', ' × ')} 真实交互录屏`);
  recording.append(video, Object.assign(document.createElement('figcaption'), { textContent: `${size.replace('x', ' × ')} · Playwright` }));
  videos.append(recording);
}
const owner = 'yez780055-cell';
const repository = 'cozy-days-app';
const api = `https://api.github.com/repos/${owner}/${repository}`;
const actions = document.querySelector('#actions');
actions.href = `https://github.com/${owner}/${repository}/actions`;
const read = async (path) => { const response = await fetch(path); if (!response.ok) throw new Error(String(response.status)); return response.json(); };
try {
  const build = await read('./build-info.json');
  const commit = build.commit || 'unknown';
  document.querySelector('#commit').textContent = `Commit：${commit.slice(0, 12)}`;
  document.querySelector('#branch').textContent = `分支：${build.branch || 'unknown'}`;
  document.querySelector('#built-at').textContent = `构建于 ${build.builtAt ? new Date(build.builtAt).toLocaleString('zh-CN') : '未知时间'}`;
  document.querySelector('#build-status').textContent = build.mode === 'local' ? '本地构建 · 尚未部署' : 'Vite 构建已完成';
  document.querySelector('#deploy-url').textContent = location.origin;
  const shaAnchor = document.createElement('a');
  shaAnchor.href = `https://github.com/${owner}/${repository}/commit/${encodeURIComponent(commit)}`;
  shaAnchor.target = '_blank'; shaAnchor.rel = 'noreferrer'; shaAnchor.textContent = commit.slice(0, 12);
  document.querySelector('#commit').replaceChildren(document.createTextNode('Commit：'), shaAnchor);
  if (build.pullRequest) {
    const pr = document.querySelector('#pr-link');
    pr.href = `https://github.com/${owner}/${repository}/pull/${encodeURIComponent(build.pullRequest)}`;
    pr.textContent = `#${build.pullRequest}`;
    const status = await read(`${api}/commits/${encodeURIComponent(commit)}/check-runs`);
    const checks = status.check_runs || [];
    const validation = checks.find(check => check.name === 'verify' || check.name === 'PR validation / verify');
    const label = document.querySelector('#test-status');
    label.textContent = validation ? `PR 检查：${validation.conclusion || validation.status}` : `Commit 检查：${checks.length} 项 · 查看 GitHub Actions 获取最新结果`;
    label.dataset.state = validation?.conclusion === 'success' ? 'success' : validation?.conclusion === 'failure' ? 'failure' : 'pending';
  } else {
    document.querySelector('#pr-link').textContent = '无关联 PR';
    document.querySelector('#test-status').textContent = build.mode === 'local' ? '本地预览：请以 PR validation 工作流结果为准。' : '此构建未关联 Pull Request。';
  }
} catch {
  document.querySelector('#test-status').textContent = '当前静态托管服务未提供构建元数据；请查看 GitHub Actions 与 PR 检查。';
  document.querySelector('#build-status').textContent = '构建元数据暂不可用';
  document.querySelector('#deploy-url').textContent = location.origin;
  document.querySelector('#pr-link').textContent = '未检测到 PR 元数据';
}
})();
