(function () {
  const { parseSb3File, parseProjectJson, compareProjects, renderAnnotatedScript, PRESETS } = window.ScratchDiff;

const BASE_SCALE = 0.85;
const MIN_ZOOM = 60;
const MAX_ZOOM = 150;
const ZOOM_STEP = 10;

const state = {
  studentProject: null,
  modelProject: null,
  comparison: null,
  activeSpriteIndex: 0,
  lang: 'ja',
  style: 'scratch3',
  dimMatched: true,
  zoomPercent: 100,
};

const els = {
  presetSelect: document.getElementById('preset-select'),
  langSelect: document.getElementById('lang-select'),
  styleSelect: document.getElementById('style-select'),
  studentDropZone: document.getElementById('student-drop-zone'),
  studentFileInput: document.getElementById('student-file-input'),
  studentBrowseBtn: document.getElementById('student-browse-btn'),
  studentFileName: document.getElementById('student-file-name'),
  modelDropZone: document.getElementById('model-drop-zone'),
  modelFileInput: document.getElementById('model-file-input'),
  modelBrowseBtn: document.getElementById('model-browse-btn'),
  modelFileName: document.getElementById('model-file-name'),
  matchRate: document.getElementById('match-rate'),
  matchProgress: document.getElementById('match-progress'),
  countMatch: document.getElementById('count-match'),
  countDiffParam: document.getElementById('count-diff-param'),
  countMissing: document.getElementById('count-missing'),
  countExtra: document.getElementById('count-extra'),
  zoomOutBtn: document.getElementById('zoom-out-btn'),
  zoomResetBtn: document.getElementById('zoom-reset-btn'),
  zoomInBtn: document.getElementById('zoom-in-btn'),
  dimMatchedToggle: document.getElementById('dim-matched-toggle'),
  spriteTabs: document.getElementById('sprite-tabs'),
  comparisonArea: document.getElementById('comparison-area'),
  diffTotalBadge: document.getElementById('diff-total-badge'),
  diffList: document.getElementById('diff-list'),
  tooltip: document.getElementById('block-tooltip'),
};

function init() {
  if (window.scratchblocks && typeof window.scratchblocks.appendStyles === 'function') {
    window.scratchblocks.appendStyles();
  }

  bindDropZone(els.studentDropZone, els.studentFileInput, els.studentBrowseBtn, 'student');
  bindDropZone(els.modelDropZone, els.modelFileInput, els.modelBrowseBtn, 'model');

  els.presetSelect.addEventListener('change', () => loadPreset(els.presetSelect.value));
  els.langSelect.addEventListener('change', () => {
    state.lang = els.langSelect.value;
    renderCurrentView();
  });
  els.styleSelect.addEventListener('change', () => {
    state.style = els.styleSelect.value;
    renderCurrentView();
  });
  els.zoomOutBtn.addEventListener('click', () => setZoom(state.zoomPercent - ZOOM_STEP));
  els.zoomResetBtn.addEventListener('click', () => setZoom(100));
  els.zoomInBtn.addEventListener('click', () => setZoom(state.zoomPercent + ZOOM_STEP));
  els.dimMatchedToggle.addEventListener('change', () => {
    state.dimMatched = els.dimMatchedToggle.checked;
    els.comparisonArea.classList.toggle('dim-matched', state.dimMatched);
  });

  els.comparisonArea.classList.toggle('dim-matched', state.dimMatched);
  updateZoomUI();
  loadPreset('square');
}

function setZoom(percent) {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, percent));
  if (clamped === state.zoomPercent) return;
  state.zoomPercent = clamped;
  updateZoomUI();
  renderCurrentView();
}

function updateZoomUI() {
  els.zoomResetBtn.textContent = `${state.zoomPercent}%`;
  els.zoomOutBtn.disabled = state.zoomPercent <= MIN_ZOOM;
  els.zoomInBtn.disabled = state.zoomPercent >= MAX_ZOOM;
}

function bindDropZone(zone, input, btn, role) {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    input.click();
  });
  zone.addEventListener('click', () => input.click());

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleSb3Upload(file, role);
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handleSb3Upload(file, role);
    input.value = '';
  });
}

async function handleSb3Upload(file, role) {
  if (!file.name.toLowerCase().endsWith('.sb3')) {
    alert('.sb3 形式の Scratch ファイルを選択してください。');
    return;
  }
  try {
    const parsed = await parseSb3File(file);
    if (role === 'student') {
      state.studentProject = parsed;
      els.studentFileName.textContent = file.name;
    } else {
      state.modelProject = parsed;
      els.modelFileName.textContent = file.name;
    }
    runComparison();
  } catch (err) {
    console.error(err);
    alert(`読み込みエラー: ${err.message}`);
  }
}

function loadPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;
  state.studentProject = parseProjectJson(preset.student, preset.studentLabel);
  state.modelProject = parseProjectJson(preset.model, preset.modelLabel);
  els.studentFileName.textContent = preset.studentLabel;
  els.modelFileName.textContent = preset.modelLabel;
  state.activeSpriteIndex = 0;
  runComparison();
}

function runComparison() {
  if (!state.studentProject || !state.modelProject) return;
  state.comparison = compareProjects(state.studentProject, state.modelProject);
  if (state.activeSpriteIndex >= state.comparison.sprites.length) {
    state.activeSpriteIndex = 0;
  }
  renderSummary();
  renderSpriteTabs();
  renderCurrentView();
}

function renderSummary() {
  const { stats, matchRate } = state.comparison;
  els.matchRate.textContent = `${matchRate}%`;
  els.matchProgress.style.width = `${matchRate}%`;
  els.countMatch.textContent = stats.match;
  els.countDiffParam.textContent = stats.diff_param;
  els.countMissing.textContent = stats.missing;
  els.countExtra.textContent = stats.extra;
}

function renderSpriteTabs() {
  const sprites = state.comparison.sprites;
  els.spriteTabs.innerHTML = '';

  sprites.forEach((sp, idx) => {
    const diffCount = sp.stats.diff_param + sp.stats.missing + sp.stats.extra;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `sprite-tab ${idx === state.activeSpriteIndex ? 'active' : ''}`;

    const thumbBox = document.createElement('div');
    thumbBox.className = 'sprite-thumb-box';
    if (sp.costumeUrl) {
      const img = document.createElement('img');
      img.src = sp.costumeUrl;
      img.alt = sp.name;
      img.className = 'sprite-thumb-img';
      thumbBox.appendChild(img);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'sprite-thumb-fallback';
      fallback.textContent = sp.isStage ? '🖼️' : '🐱';
      thumbBox.appendChild(fallback);
    }
    btn.appendChild(thumbBox);

    const metaCol = document.createElement('div');
    metaCol.className = 'sprite-tab-meta';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'sprite-tab-name';
    nameSpan.textContent = sp.name;
    metaCol.appendChild(nameSpan);

    const badge = document.createElement('span');
    badge.className = `sprite-tab-badge ${diffCount > 0 ? 'has-diff' : 'all-ok'}`;
    badge.textContent = diffCount > 0 ? `${diffCount}件の違い` : 'OK';
    metaCol.appendChild(badge);

    btn.appendChild(metaCol);

    btn.addEventListener('click', () => {
      state.activeSpriteIndex = idx;
      renderSpriteTabs();
      renderCurrentView();
    });

    els.spriteTabs.appendChild(btn);
  });
}

function renderCurrentView() {
  if (!state.comparison) return;
  const sprite = state.comparison.sprites[state.activeSpriteIndex];
  els.comparisonArea.innerHTML = '';

  if (!sprite || sprite.scripts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-script-placeholder';
    empty.textContent = 'このスプライトにはブロックがありません。';
    els.comparisonArea.appendChild(empty);
    renderDiffSidebar([]);
    return;
  }

  sprite.scripts.forEach((pair, idx) => {
    const card = document.createElement('div');
    card.className = 'script-pair-card';

    const header = document.createElement('div');
    header.className = 'script-pair-header';
    header.textContent = `スクリプト ${idx + 1}: ${pair.title}`;
    card.appendChild(header);

    const cols = document.createElement('div');
    cols.className = 'script-columns';

    cols.appendChild(createScriptColumn('あなたのプログラム', 'student', pair.studentBlocks));
    cols.appendChild(createScriptColumn('解答例（おてほん）', 'model', pair.modelBlocks));

    card.appendChild(cols);
    els.comparisonArea.appendChild(card);
  });

  renderDiffSidebar(sprite.diffItems);
}

function createScriptColumn(labelText, roleClass, blocks) {
  const col = document.createElement('div');
  col.className = 'script-col';

  const label = document.createElement('div');
  label.className = `col-label ${roleClass}`;
  label.textContent = labelText;
  col.appendChild(label);

  if (!blocks || blocks.length === 0) {
    const ph = document.createElement('div');
    ph.className = 'empty-script-placeholder';
    ph.textContent = roleClass === 'student'
      ? 'ここにスクリプトがありません（たりないよ！）'
      : 'おてほんにはこのスクリプトがありません';
    col.appendChild(ph);
    return col;
  }

  const container = document.createElement('div');
  container.className = 'svg-container';
  const scale = Number((BASE_SCALE * (state.zoomPercent / 100)).toFixed(3));
  const svg = renderAnnotatedScript(blocks, {
    lang: state.lang,
    style: state.style,
    scale,
    onBlockHover: handleBlockHover,
    onBlockLeave: handleBlockLeave,
  });
  container.appendChild(svg);
  col.appendChild(container);
  return col;
}

function renderDiffSidebar(diffItems) {
  els.diffTotalBadge.textContent = `${diffItems.length}件`;
  els.diffList.innerHTML = '';

  if (diffItems.length === 0) {
    const ok = document.createElement('div');
    ok.className = 'diff-empty-ok';
    ok.textContent = '🎉 おてほんとピッタリ同じです！';
    els.diffList.appendChild(ok);
    return;
  }

  const tagMap = {
    diff_param: '値がちがう',
    missing: 'たりない',
    extra: '余分',
  };

  for (const item of diffItems) {
    const li = document.createElement('li');
    li.className = `diff-item type-${item.type}`;
    li.innerHTML = `
      <div class="diff-item-tag">${tagMap[item.type] || item.type}</div>
      <div class="diff-item-title">${escapeHtml(item.title)}</div>
      <div class="diff-item-detail">${escapeHtml(item.detail)}</div>
    `;
    li.addEventListener('mouseenter', () => highlightPair(item.pairId, true));
    li.addEventListener('mouseleave', () => highlightPair(item.pairId, false));
    li.addEventListener('click', () => focusPair(item.pairId));
    els.diffList.appendChild(li);
  }
}

function handleBlockHover(event, node) {
  if (node.pairId) highlightPair(node.pairId, true);
  if (!node.diffDetail) return;

  els.tooltip.textContent = node.diffDetail;
  els.tooltip.hidden = false;
  const x = Math.min(event.clientX + 14, window.innerWidth - 300);
  const y = Math.min(event.clientY + 14, window.innerHeight - 80);
  els.tooltip.style.left = `${x}px`;
  els.tooltip.style.top = `${y}px`;
}

function handleBlockLeave(event, node) {
  if (node.pairId) highlightPair(node.pairId, false);
  els.tooltip.hidden = true;
}

function highlightPair(pairId, active) {
  if (!pairId) return;
  const targets = document.querySelectorAll(`[data-pair-id="${pairId}"]`);
  targets.forEach((el) => el.classList.toggle('diff-linked-active', active));
}

function focusPair(pairId) {
  const targets = document.querySelectorAll(`[data-pair-id="${pairId}"]`);
  if (targets.length === 0) return;
  targets[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  targets.forEach((el) => {
    el.classList.remove('diff-pulse');
    void el.offsetWidth;
    el.classList.add('diff-pulse');
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

init();
})();
