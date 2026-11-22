/**
 * scratchblocks を用いた Scratch 3.0 ビジュアルブロック SVG レンダラー & 差分ハイライト描画
 */

(function () {
const SVG_NS = 'http://www.w3.org/2000/svg';

function renderAnnotatedScript(blocks, options = {}) {
  const {
    lang = 'ja',
    style = 'scratch3',
    scale = 0.85,
    onBlockHover = null,
    onBlockLeave = null,
  } = options;

  const enLines = [];
  serializeAstToScratchblocks(blocks, 0, enLines);
  const enCode = enLines.join('\n');

  const sb = window.scratchblocks;
  const doc = sb.parse(enCode, { languages: ['en'] });
  if (lang !== 'en' && sb.allLanguages[lang]) {
    doc.translate(sb.allLanguages[lang]);
  }

  const view = sb.newView(doc, { style, scale });
  const svg = view.render();

  // DocumentView -> scale <g> -> ScriptView <g> を取得
  const rootScaleG = Array.from(svg.children).find((el) => el.tagName.toLowerCase() === 'g');
  const topScriptG = rootScaleG
    ? Array.from(rootScaleG.children).find((el) => el.tagName.toLowerCase() === 'g')
    : null;

  if (topScriptG && view.scripts && view.scripts[0]) {
    annotateScriptGroup(topScriptG, view.scripts[0], blocks, { onBlockHover, onBlockLeave });
  }

  // 右端のバッジやハイライト枠が切れないよう viewBox と width/height に余白を持たせる
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.split(/\s+/).map(Number);
    if (parts.length === 4) {
      const padLeft = Math.round(8 * scale);
      const padTop = Math.round(12 * scale);
      const padRight = Math.round(56 * scale);
      const padBottom = Math.round(10 * scale);
      const newX = parts[0] - padLeft;
      const newY = parts[1] - padTop;
      const newW = parts[2] + padLeft + padRight;
      const newH = parts[3] + padTop + padBottom;
      svg.setAttribute('viewBox', `${newX} ${newY} ${newW} ${newH}`);
      svg.setAttribute('width', String(newW));
      svg.setAttribute('height', String(newH));
      svg.style.maxWidth = 'none';
      svg.style.width = `${newW}px`;
      svg.style.height = `${newH}px`;
    }
  }

  return svg;
}

function annotateScriptGroup(scriptG, scriptView, astBlocks, handlers) {
  scriptG.classList.add('diff-script-group');
  const childGroups = Array.from(scriptG.children).filter(
    (el) => el.tagName.toLowerCase() === 'g'
  );
  const blockViews = scriptView.blocks || [];
  const count = Math.min(astBlocks.length, blockViews.length, childGroups.length);

  for (let i = 0; i < count; i++) {
    const node = astBlocks[i];
    const bv = blockViews[i];
    const g = childGroups[i];

    const status = node.diffStatus || 'match';
    g.classList.add(`diff-block-${status}`);
    if (node.pairId) {
      g.dataset.pairId = node.pairId;
    }

    if (status !== 'match') {
      decorateDiffBlock(g, bv, node);
      g.style.cursor = 'pointer';

      if (handlers.onBlockHover) {
        g.addEventListener('mouseenter', (e) => {
          e.stopPropagation();
          handlers.onBlockHover(e, node);
        });
      }
      if (handlers.onBlockLeave) {
        g.addEventListener('mouseleave', (e) => {
          e.stopPropagation();
          handlers.onBlockLeave(e, node);
        });
      }
    }

    // C型ブロック内のサブスタックを再帰的に処理
    if (node.isCBlock && bv.children) {
      const subScriptViews = bv.children.filter((c) => c && c.isScript);
      // blockG 直下の <g> のうち、直接の図形要素 (path/rect/text) を持たないものが ScriptView の <g>
      const subScriptGs = Array.from(g.children).filter(
        (el) =>
          el.tagName.toLowerCase() === 'g' &&
          !el.classList.contains('diff-badge-group') &&
          !Array.from(el.children).some((c) => {
            const tag = c.tagName.toLowerCase();
            return tag === 'path' || tag === 'rect' || tag === 'text';
          })
      );

      const subCount = Math.min(node.substacks.length, subScriptViews.length, subScriptGs.length);
      for (let k = 0; k < subCount; k++) {
        annotateScriptGroup(subScriptGs[k], subScriptViews[k], node.substacks[k], handlers);
      }
    }
  }
}

function serializeAstToScratchblocks(blocks, indent, outLines) {
  const pad = '  '.repeat(indent);
  for (const b of blocks) {
    outLines.push(`${pad}${b.headerLine}`);
    if (b.isCBlock) {
      const sub1 = b.substacks[0] || [];
      serializeAstToScratchblocks(sub1, indent + 1, outLines);
      if (b.isIfElse) {
        outLines.push(`${pad}else`);
        const sub2 = b.substacks[1] || [];
        serializeAstToScratchblocks(sub2, indent + 1, outLines);
      }
      outLines.push(`${pad}end`);
    }
  }
}

function decorateDiffBlock(g, bv, node) {
  const status = node.diffStatus;
  const w = Math.max(bv.width || 120, 60);
  // C型ブロックの「値が違う」は上のヘッダ部だけを囲み、中のブロックと重ならないようにする
  const h = node.isCBlock && status === 'diff_param'
    ? 44
    : Math.max(bv.height || 40, 36);

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', '-4');
  rect.setAttribute('y', '-4');
  rect.setAttribute('width', String(w + 8));
  rect.setAttribute('height', String(h + 8));
  rect.setAttribute('rx', '8');
  rect.setAttribute('ry', '8');
  rect.setAttribute('class', `diff-overlay-rect diff-overlay-${status}`);
  g.appendChild(rect);

  // ステータスバッジ
  const badgeInfo = {
    diff_param: { text: '値がちがう', fill: '#ea580c', bw: 66 },
    missing: { text: 'たりない', fill: '#dc2626', bw: 56 },
    extra: { text: '余分', fill: '#9333ea', bw: 40 },
  }[status];

  if (badgeInfo) {
    const badgeG = document.createElementNS(SVG_NS, 'g');
    badgeG.setAttribute('transform', `translate(${w - 14}, -11)`);
    badgeG.setAttribute('class', 'diff-badge-group');

    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('width', String(badgeInfo.bw));
    bg.setAttribute('height', '18');
    bg.setAttribute('rx', '9');
    bg.setAttribute('ry', '9');
    bg.setAttribute('fill', badgeInfo.fill);
    bg.setAttribute('stroke', '#ffffff');
    bg.setAttribute('stroke-width', '1.5');
    badgeG.appendChild(bg);

    const txt = document.createElementNS(SVG_NS, 'text');
    txt.setAttribute('x', String(badgeInfo.bw / 2));
    txt.setAttribute('y', '12.5');
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('class', 'diff-pill-text');
    txt.textContent = badgeInfo.text;
    badgeG.appendChild(txt);

    g.appendChild(badgeG);
  }
}

window.ScratchDiff = Object.assign(window.ScratchDiff || {}, { renderAnnotatedScript });
})();
