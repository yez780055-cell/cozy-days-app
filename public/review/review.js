void (async () => {
  const sizes = ['360x740', '393x852', '430x932'];
  const owner = 'yez780055-cell';
  const repository = 'cozy-days-app';
  const api = `https://api.github.com/repos/${owner}/${repository}`;
  const screens = document.querySelector('#screens');
  const videos = document.querySelector('#videos');

  for (const size of sizes) {
    const screenshot = document.createElement('figure');
    const image = document.createElement('img');
    image.src = `./evidence/screenshots/illustrations-${size}.png`;
    image.alt = `${size.replace('x', ' × ')} 实际浏览器截图`;
    screenshot.append(image, Object.assign(document.createElement('figcaption'), {
      textContent: size.replace('x', ' × '),
    }));
    screens.append(screenshot);

    const recording = document.createElement('figure');
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = `./evidence/videos/${size}.webm`;
    video.setAttribute('aria-label', `${size.replace('x', ' × ')} 真实交互录屏`);
    recording.append(video, Object.assign(document.createElement('figcaption'), {
      textContent: `${size.replace('x', ' × ')} · Playwright`,
    }));
    videos.append(recording);
  }

  for(const size of sizes) for(const [type,label] of [['date','日期'],['category','分类'],['time','时间'],['undo','独立撤销'],['completed','已完成'],['empty','空状态']]) {
    const figure=document.createElement('figure');
    const img=Object.assign(document.createElement('img'),{src:'./evidence/screenshots/'+type+'-'+size+'.png',alt:label+'面板 '+size,loading:'lazy'});
    figure.append(img,Object.assign(document.createElement('figcaption'),{textContent:label+' · '+size}));
    document.querySelector('#controls').append(figure);
  }
  fetch('./evidence/source.json').then(response=>response.json()).then(source=>{
    document.querySelector('#evidence-source').textContent='Playwright · 源码 '+source.sourceCommit.slice(0,12)+' · '+new Date(source.capturedAt).toLocaleString('zh-CN');
  }).catch(()=>{});

  for (const size of sizes) for (const [state,label] of [['empty','空任务'],['scrolled','多任务滚动'],['undo','三条独立撤销'],['safe-area','34px 模拟安全区']]) {
    const figure=document.createElement('figure');
    const img=Object.assign(document.createElement('img'),{src:`./evidence/screenshots/illustrations-${state}-${size}.png`,alt:`原创插画 · ${label} · ${size}`,loading:'lazy'});
    figure.append(img,Object.assign(document.createElement('figcaption'),{textContent:`${label} · ${size}`}));
    document.querySelector('#illustration-states').append(figure);
  }

  const read = async (path) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  };

  const renderFiles = (files) => {
    const list = document.querySelector('#change-files');
    const label = document.querySelector('#change-files-label');
    label.textContent = `变更文件 · 共 ${files.length} 项`;
    for (const file of files.slice(0, 20)) {
      const item = document.createElement('li');
      const path = document.createElement('code');
      path.textContent = file.filename;
      const detail = document.createElement('span');
      detail.textContent = ` · ${file.status} · +${file.additions} / −${file.deletions}`;
      item.append(path, detail);
      list.append(item);
    }
    if (files.length > 20) {
      const remaining = document.createElement('li');
      remaining.textContent = `还有 ${files.length - 20} 项，完整清单见 Pull Request。`;
      list.append(remaining);
    }
  };

  const actions = document.querySelector('#actions');
  actions.href = `https://github.com/${owner}/${repository}/actions`;

  try {
    const build = await read('./build-info.json');
    const commit = build.commit || 'unknown';
    const branch = build.branch || 'unknown';
    const isPreview = build.mode === 'preview';
    document.querySelector('#branch').textContent = `分支：${branch}`;
    document.querySelector('#built-at').textContent = `构建于 ${build.builtAt ? new Date(build.builtAt).toLocaleString('zh-CN') : '未知时间'}`;
    document.querySelector('#build-status').textContent = build.mode === 'local'
      ? '本地构建 · 尚未部署'
      : build.mode === 'preview' ? '独立分支 Preview 构建已完成' : 'Vite 构建已完成';

    const commitLink = document.createElement('a');
    commitLink.href = `https://github.com/${owner}/${repository}/commit/${encodeURIComponent(commit)}`;
    commitLink.target = '_blank';
    commitLink.rel = 'noreferrer';
    commitLink.textContent = commit.slice(0, 12);
    document.querySelector('#commit').replaceChildren(document.createTextNode('Commit：'), commitLink);

    const deploymentLink = document.querySelector('#deploy-url');
    deploymentLink.href = location.origin;
    deploymentLink.textContent = location.origin;
    document.querySelector('#preview').textContent = isPreview
      ? 'Preview：独立 PR 预览'
      : `站点：${branch === 'main' ? 'GitHub Pages 正式版' : '当前构建'}`;
    if (isPreview) document.querySelector('#preview-limit').remove();
    else document.querySelector('#preview-limit').textContent = branch === 'main'
      ? '当前页面是 main 正式版本；PR 需打开该 PR 的独立 Preview URL。'
      : '当前构建没有可用的独立 PR Preview URL。';

    const prLink = document.querySelector('#pr-link');
    let pullRequest = null;
    if (isPreview && commit !== 'local' && commit !== 'unknown') {
      const associated = await read(`${api}/commits/${encodeURIComponent(commit)}/pulls`);
      pullRequest = associated.find(item => item.state === 'open' && item.base?.ref === 'main' && item.head?.sha === commit) || null;
    }
    if (!pullRequest) {
      prLink.textContent = '无关联 PR';
      document.querySelector('#change-title').textContent = branch === 'main'
        ? 'main 正式版本'
        : `分支构建：${branch}`;
      document.querySelector('#change-description').textContent = '此版本没有关联的 Pull Request。';
      document.querySelector('#change-files-label').textContent = '本轮修改清单请查看对应 Pull Request。';
      document.querySelector('#test-status').textContent = branch === 'main'
        ? 'GitHub Pages 正式构建；各 PR 的检查详情保留在对应 Pull Request。'
        : '此构建未关联 Pull Request。';
      return;
    }

    const pull = pullRequest;
    const files = await read(`${api}/pulls/${encodeURIComponent(pull.number)}/files?per_page=100`);
    prLink.href = pull.html_url;
    prLink.target = '_blank';
    prLink.rel = 'noreferrer';
    prLink.textContent = `#${pull.number}`;
    document.querySelector('#change-title').textContent = `#${pull.number} · ${pull.title}`;
    document.querySelector('#change-description').textContent = pull.body || '此 PR 未填写说明。';
    renderFiles(files);

    const status = document.querySelector('#test-status');
    if (commit !== pull.head.sha) {
      status.textContent = '验收构建 SHA 与 PR 最新提交不一致，请重新运行最新预览。';
      status.dataset.state = 'failure';
      return;
    }

    const checkSuite = await read(`${api}/commits/${encodeURIComponent(commit)}/check-runs`);
    const validation = (checkSuite.check_runs || []).find(check => check.name === 'verify');
    if (validation?.html_url) actions.href = validation.html_url;
    status.textContent = validation
      ? `PR 检查：${validation.conclusion || validation.status} · ${commit.slice(0, 12)}`
      : '未找到此 Commit 的 PR 检查，等待 GitHub Actions 完成。';
    status.dataset.state = validation?.conclusion === 'success'
      ? 'success' : validation?.conclusion === 'failure' ? 'failure' : 'pending';
  } catch {
    document.querySelector('#test-status').textContent = 'GitHub 构建或 PR 元数据暂不可用；请查看 GitHub Actions 与 Pull Request。';
    document.querySelector('#test-status').dataset.state = 'pending';
    document.querySelector('#build-status').textContent = '构建元数据暂不可用';
    document.querySelector('#deploy-url').href = location.origin;
    document.querySelector('#deploy-url').textContent = location.origin;
    document.querySelector('#pr-link').textContent = '未检测到 PR 元数据';
    document.querySelector('#change-title').textContent = '本轮修改清单暂不可用。';
    document.querySelector('#change-description').textContent = '请打开 GitHub Pull Request 查看标题和说明。';
    document.querySelector('#change-files-label').textContent = '完整文件列表见 Pull Request。';
  }
})();
