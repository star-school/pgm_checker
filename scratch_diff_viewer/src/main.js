(function () {
  const {
    parseSb3File,
    parseProjectJson,
    compareProjects,
    renderAnnotatedScript,
    ModelStorage,
  } = window.ScratchDiff;
  const BUILTIN_MODELS = window.ScratchDiff.BUILTIN_MODELS || [];

  const BASE_SCALE = 0.85;
  const MIN_ZOOM = 60;
  const MAX_ZOOM = 150;
  const ZOOM_STEP = 10;

  const state = {
    studentProject: null,
    modelProject: null,
    selectedModelId: '',
    customModels: [],
    comparison: null,
    mode: 'empty', // 'compare' | 'preview-model' | 'preview-student' | 'empty'
    activeSpriteIndex: 0,
    lang: 'ja',
    style: 'scratch3',
    dimMatched: true,
    zoomPercent: 100,
  };

  const els = {
    modelSelect: document.getElementById('model-select'),
    deleteSavedModelBtn: document.getElementById('delete-saved-model-btn'),
    langSelect: document.getElementById('lang-select'),
    styleSelect: document.getElementById('style-select'),
    studentDropZone: document.getElementById('student-drop-zone'),
    studentFileInput: document.getElementById('student-file-input'),
    studentBrowseBtn: document.getElementById('student-browse-btn'),
    studentClearBtn: document.getElementById('student-clear-btn'),
    studentFileName: document.getElementById('student-file-name'),
    modelDropZone: document.getElementById('model-drop-zone'),
    modelFileInput: document.getElementById('model-file-input'),
    modelBrowseBtn: document.getElementById('model-browse-btn'),
    saveModelBtn: document.getElementById('save-model-btn'),
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
    toastBanner: document.getElementById('toast-banner'),
  };

  let toastTimer = null;

  async function init() {
    if (window.scratchblocks && typeof window.scratchblocks.appendStyles === 'function') {
      window.scratchblocks.appendStyles();
    }

    bindDropZone(els.studentDropZone, els.studentFileInput, els.studentBrowseBtn, 'student');
    bindDropZone(els.modelDropZone, els.modelFileInput, els.modelBrowseBtn, 'model');

    els.studentClearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearStudentProject();
    });
    els.saveModelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSaveModel();
    });
    els.deleteSavedModelBtn.addEventListener('click', handleDeleteSavedModel);

    els.modelSelect.addEventListener('change', () => {
      selectModelById(els.modelSelect.value);
    });
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

    if (ModelStorage) {
      state.customModels = await ModelStorage.list();
    }
    renderModelSelectOptions();

    if (BUILTIN_MODELS.length > 0) {
      selectModelById(BUILTIN_MODELS[0].id);
    } else if (state.customModels.length > 0) {
      selectModelById(state.customModels[0].id);
    } else {
      updateDropZoneUI();
      updateView();
    }
  }

  function showToast(message) {
    if (!els.toastBanner) return;
    els.toastBanner.textContent = message;
    els.toastBanner.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toastBanner.hidden = true;
    }, 2600);
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
      } else {
        state.modelProject = parsed;
        state.selectedModelId = '';
        els.modelSelect.value = '';
      }
      state.activeSpriteIndex = 0;
      updateDropZoneUI();
      updateView();
    } catch (err) {
      console.error(err);
      alert(`読み込みエラー: ${err.message}`);
    }
  }

  function clearStudentProject() {
    state.studentProject = null;
    state.activeSpriteIndex = 0;
    updateDropZoneUI();
    updateView();
  }

  function findModelById(id) {
    if (!id) return null;
    return BUILTIN_MODELS.find((m) => m.id === id)
      || state.customModels.find((m) => m.id === id)
      || null;
  }

  function renderModelSelectOptions() {
    const prevValue = state.selectedModelId;
    els.modelSelect.innerHTML = '';

    const directOpt = document.createElement('option');
    directOpt.value = '';
    directOpt.textContent = '（ファイルから直接読み込み）';
    els.modelSelect.appendChild(directOpt);

    if (BUILTIN_MODELS.length > 0) {
      const group = document.createElement('optgroup');
      group.label = '組み込みおてほん';
      for (const item of BUILTIN_MODELS) {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        group.appendChild(opt);
      }
      els.modelSelect.appendChild(group);
    }

    if (state.customModels.length > 0) {
      const group = document.createElement('optgroup');
      group.label = 'マイおてほん（ブラウザ保存）';
      for (const item of state.customModels) {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        group.appendChild(opt);
      }
      els.modelSelect.appendChild(group);
    }

    els.modelSelect.value = findModelById(prevValue) ? prevValue : '';
    updateModelHeaderButtons();
  }

  function selectModelById(id) {
    if (!id) {
      // 「（ファイルから直接読み込み）」が選ばれた場合は右側の既存ファイルを維持、なければ空にする
      state.selectedModelId = '';
      if (!state.modelProject) {
        updateDropZoneUI();
        updateView();
      } else {
        updateDropZoneUI();
      }
      updateModelHeaderButtons();
      return;
    }

    const entry = findModelById(id);
    if (!entry) return;

    state.selectedModelId = entry.id;
    els.modelSelect.value = entry.id;
    state.modelProject = parseProjectJson(entry.project, entry.fileName || entry.name);
    state.activeSpriteIndex = 0;

    updateModelHeaderButtons();
    updateDropZoneUI();
    updateView();
  }

  function updateModelHeaderButtons() {
    const isCustom = state.selectedModelId.startsWith('user:');
    els.deleteSavedModelBtn.hidden = !isCustom;
  }

  function updateDropZoneUI() {
    if (state.studentProject) {
      els.studentFileName.textContent = state.studentProject.sourceName || '読み込み済み';
      els.studentDropZone.classList.remove('is-empty');
      els.studentClearBtn.hidden = false;
    } else {
      els.studentFileName.textContent = 'ファイル未選択（.sb3 をドロップまたは選択）';
      els.studentDropZone.classList.add('is-empty');
      els.studentClearBtn.hidden = true;
    }

    if (state.modelProject) {
      els.modelFileName.textContent = state.modelProject.sourceName || 'おてほん読み込み済み';
      els.modelDropZone.classList.remove('is-empty');
      const isDirectUpload = !state.selectedModelId && Boolean(state.modelProject.compactProject);
      els.saveModelBtn.hidden = !isDirectUpload;
    } else {
      els.modelFileName.textContent = 'おてほん未選択';
      els.modelDropZone.classList.add('is-empty');
      els.saveModelBtn.hidden = true;
    }
    updateModelHeaderButtons();
  }

  async function handleSaveModel() {
    if (!ModelStorage || !state.modelProject?.compactProject) return;
    const rawName = state.modelProject.sourceName || 'マイおてほん';
    const cleanName = rawName.replace(/\.sb3$/i, '') || 'マイおてほん';

    try {
      const saved = await ModelStorage.save({
        name: cleanName,
        fileName: rawName,
        project: state.modelProject.compactProject,
      });
      state.customModels = await ModelStorage.list();
      state.selectedModelId = saved.id;
      renderModelSelectOptions();
      selectModelById(saved.id);
      showToast(`「${saved.name}」をマイおてほんに保存しました`);
    } catch (err) {
      console.error(err);
      alert(`保存エラー: ${err.message}`);
    }
  }

  async function handleDeleteSavedModel() {
    if (!ModelStorage || !state.selectedModelId.startsWith('user:')) return;
    const target = findModelById(state.selectedModelId);
    try {
      await ModelStorage.remove(state.selectedModelId);
      state.customModels = await ModelStorage.list();
      state.selectedModelId = '';
      renderModelSelectOptions();

      if (BUILTIN_MODELS.length > 0) {
        selectModelById(BUILTIN_MODELS[0].id);
      } else if (state.customModels.length > 0) {
        selectModelById(state.customModels[0].id);
      } else {
        state.modelProject = null;
        updateDropZoneUI();
        updateView();
      }
      if (target) {
        showToast(`「${target.name}」を削除しました`);
      }
    } catch (err) {
      console.error(err);
      alert(`削除エラー: ${err.message}`);
    }
  }

  function buildSingleSideComparison(project, side) {
    const sprites = project.targets.map((target) => ({
      name: target.name,
      isStage: target.isStage,
      costumeUrl: target.costumeUrl || null,
      scripts: target.scripts.map((sc, idx) => ({
        title: sc.headText || `スクリプト ${idx + 1}`,
        studentBlocks: side === 'student' ? sc.blocks : null,
        modelBlocks: side === 'model' ? sc.blocks : null,
      })),
      stats: { match: 0, diff_param: 0, missing: 0, extra: 0 },
      diffItems: [],
    }));
    return {
      sprites,
      stats: { match: 0, diff_param: 0, missing: 0, extra: 0 },
      matchRate: null,
      diffItems: [],
    };
  }

  function updateView() {
    if (state.studentProject && state.modelProject) {
      state.mode = 'compare';
      state.comparison = compareProjects(state.studentProject, state.modelProject);
    } else if (state.modelProject) {
      state.mode = 'preview-model';
      state.comparison = buildSingleSideComparison(state.modelProject, 'model');
    } else if (state.studentProject) {
      state.mode = 'preview-student';
      state.comparison = buildSingleSideComparison(state.studentProject, 'student');
    } else {
      state.mode = 'empty';
      state.comparison = {
        sprites: [],
        stats: { match: 0, diff_param: 0, missing: 0, extra: 0 },
        matchRate: null,
        diffItems: [],
      };
    }

    if (state.activeSpriteIndex >= state.comparison.sprites.length) {
      state.activeSpriteIndex = 0;
    }

    els.comparisonArea.classList.toggle('preview-mode', state.mode !== 'compare');
    renderSummary();
    renderSpriteTabs();
    renderCurrentView();
  }

  function renderSummary() {
    const isCompare = state.mode === 'compare';
    const { stats, matchRate } = state.comparison;

    if (isCompare && matchRate !== null) {
      els.matchRate.textContent = `${matchRate}%`;
      els.matchProgress.style.width = `${matchRate}%`;
      els.countMatch.textContent = stats.match;
      els.countDiffParam.textContent = stats.diff_param;
      els.countMissing.textContent = stats.missing;
      els.countExtra.textContent = stats.extra;
    } else {
      els.matchRate.textContent = '--%';
      els.matchProgress.style.width = '0%';
      els.countMatch.textContent = '-';
      els.countDiffParam.textContent = '-';
      els.countMissing.textContent = '-';
      els.countExtra.textContent = '-';
    }
  }

  function renderSpriteTabs() {
    const sprites = state.comparison.sprites;
    els.spriteTabs.innerHTML = '';

    sprites.forEach((sp, idx) => {
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
      if (state.mode === 'compare') {
        const diffCount = sp.stats.diff_param + sp.stats.missing + sp.stats.extra;
        badge.className = `sprite-tab-badge ${diffCount > 0 ? 'has-diff' : 'all-ok'}`;
        badge.textContent = diffCount > 0 ? `${diffCount}件の違い` : 'OK';
      } else {
        badge.className = 'sprite-tab-badge preview-only';
        badge.textContent = state.mode === 'preview-model' ? 'おてほん' : 'プレビュー';
      }
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
    els.comparisonArea.innerHTML = '';

    if (state.mode === 'empty') {
      const empty = document.createElement('div');
      empty.className = 'preview-hint-placeholder';
      empty.textContent = '比較するファイルを選択してください（ヘッダからおてほんを選ぶか、左右に .sb3 をドロップ）';
      els.comparisonArea.appendChild(empty);
      renderDiffSidebar([]);
      return;
    }

    const sprite = state.comparison.sprites[state.activeSpriteIndex];
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
      const isWaiting = (roleClass === 'student' && state.mode === 'preview-model')
        || (roleClass === 'model' && state.mode === 'preview-student');
      const ph = document.createElement('div');
      if (isWaiting) {
        ph.className = 'preview-hint-placeholder';
        ph.textContent = roleClass === 'student'
          ? 'あなたのプログラム (.sb3) を上で選択すると比較が始まります'
          : 'ヘッダのおてほんを選ぶか、右上に .sb3 をドロップすると比較が始まります';
      } else {
        ph.className = 'empty-script-placeholder';
        ph.textContent = roleClass === 'student'
          ? 'ここにスクリプトがありません（たりないよ！）'
          : 'おてほんにはこのスクリプトがありません';
      }
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
    if (state.mode !== 'compare') {
      els.diffTotalBadge.textContent = '-';
      els.diffList.innerHTML = '';
      const info = document.createElement('div');
      info.className = 'preview-hint-placeholder';
      info.textContent = state.mode === 'preview-model'
        ? '左側に「あなたのプログラム (.sb3)」を読み込むと、違いの一覧が表示されます。'
        : state.mode === 'preview-student'
          ? '右側に「おてほん (.sb3)」を読み込むと、違いの一覧が表示されます。'
          : '左右にファイルを読み込むと、違いの一覧が表示されます。';
      els.diffList.appendChild(info);
      return;
    }

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
