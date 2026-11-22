/**
 * Scratch ブロックツリー差分比較エンジン
 * スプライト > スクリプト > ブロック列（C型ブロック内を再帰含む）をアラインメントし、
 * match / diff_param / missing / extra のステータスと差分リストを生成する。
 */

(function () {
let nextPairSeq = 1;
function genPairId() {
  return `pair-${nextPairSeq++}`;
}

function compareProjects(studentProj, modelProj) {
  nextPairSeq = 1;

  const spriteComparisons = matchSprites(studentProj.targets, modelProj.targets).map(
    ({ name, studentTarget, modelTarget }) => compareSprite(name, studentTarget, modelTarget)
  );

  const stats = {
    match: 0,
    diff_param: 0,
    missing: 0,
    extra: 0,
  };
  const allDiffItems = [];

  for (const sp of spriteComparisons) {
    stats.match += sp.stats.match;
    stats.diff_param += sp.stats.diff_param;
    stats.missing += sp.stats.missing;
    stats.extra += sp.stats.extra;
    allDiffItems.push(...sp.diffItems);
  }

  const totalModelAndExtra = stats.match + stats.diff_param + stats.missing + stats.extra;
  const matchRate = totalModelAndExtra === 0
    ? 100
    : Math.round(((stats.match + stats.diff_param * 0.5) / totalModelAndExtra) * 100);

  return {
    sprites: spriteComparisons,
    stats,
    matchRate,
    diffItems: allDiffItems,
  };
}

function matchSprites(studentTargets, modelTargets) {
  const result = [];
  const usedStudent = new Set();

  for (const mt of modelTargets) {
    let idx = studentTargets.findIndex((st, i) => !usedStudent.has(i) && st.rawName === mt.rawName && st.isStage === mt.isStage);
    if (idx === -1 && !mt.isStage) {
      // 名前が変わっている場合、未割り当ての非ステージスプライトをフォールバックで対応づけ
      idx = studentTargets.findIndex((st, i) => !usedStudent.has(i) && !st.isStage);
    }
    if (idx !== -1) {
      usedStudent.add(idx);
      result.push({ name: mt.name, studentTarget: studentTargets[idx], modelTarget: mt });
    } else {
      result.push({ name: mt.name, studentTarget: null, modelTarget: mt });
    }
  }

  studentTargets.forEach((st, i) => {
    if (!usedStudent.has(i)) {
      result.push({ name: st.name, studentTarget: st, modelTarget: null });
    }
  });

  return result;
}

function compareSprite(spriteName, studentTarget, modelTarget) {
  const sScripts = studentTarget ? studentTarget.scripts : [];
  const mScripts = modelTarget ? modelTarget.scripts : [];

  const pairedScripts = pairScripts(sScripts, mScripts);
  const stats = { match: 0, diff_param: 0, missing: 0, extra: 0 };
  const diffItems = [];

  const scriptResults = pairedScripts.map((pair, idx) => {
    const title = pair.modelScript?.headText || pair.studentScript?.headText || `スクリプト ${idx + 1}`;
    const sAnnotated = pair.studentScript ? cloneBlocks(pair.studentScript.blocks) : null;
    const mAnnotated = pair.modelScript ? cloneBlocks(pair.modelScript.blocks) : null;

    if (sAnnotated && mAnnotated) {
      alignBlockLists(sAnnotated, mAnnotated, spriteName, stats, diffItems);
    } else if (mAnnotated && !sAnnotated) {
      markAllBlocks(mAnnotated, 'missing', spriteName, stats, diffItems);
    } else if (sAnnotated && !mAnnotated) {
      markAllBlocks(sAnnotated, 'extra', spriteName, stats, diffItems);
    }

    return {
      title,
      studentBlocks: sAnnotated,
      modelBlocks: mAnnotated,
    };
  });

  return {
    name: spriteName,
    isStage: Boolean(modelTarget?.isStage ?? studentTarget?.isStage),
    costumeUrl: modelTarget?.costumeUrl || studentTarget?.costumeUrl || null,
    scripts: scriptResults,
    stats,
    diffItems,
  };
}

function pairScripts(sScripts, mScripts) {
  const pairs = [];
  const usedS = new Set();

  for (const ms of mScripts) {
    let bestIdx = -1;
    let bestScore = -1;
    sScripts.forEach((ss, i) => {
      if (usedS.has(i)) return;
      let score = 0;
      if (ss.headOpcode === ms.headOpcode) score += 10;
      if (ss.blocks[0] && ms.blocks[0] && paramsEqual(ss.blocks[0].params, ms.blocks[0].params)) {
        score += 5;
      }
      // ブロック数の近さ
      score -= Math.abs(ss.blocks.length - ms.blocks.length) * 0.2;
      if (score > bestScore && score >= 5) {
        bestScore = score;
        bestIdx = i;
      }
    });

    if (bestIdx !== -1) {
      usedS.add(bestIdx);
      pairs.push({ studentScript: sScripts[bestIdx], modelScript: ms });
    } else {
      pairs.push({ studentScript: null, modelScript: ms });
    }
  }

  sScripts.forEach((ss, i) => {
    if (!usedS.has(i)) {
      pairs.push({ studentScript: ss, modelScript: null });
    }
  });

  return pairs;
}

function alignBlockLists(sList, mList, spriteName, stats, diffItems) {
  const n = sList.length;
  const m = mList.length;

  // DP テーブル: dp[i][j] = sList[0..i-1] と mList[0..j-1] の最小コスト
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const choice = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(''));

  for (let i = 1; i <= n; i++) {
    dp[i][0] = i * 2;
    choice[i][0] = 'extra';
  }
  for (let j = 1; j <= m; j++) {
    dp[0][j] = j * 2;
    choice[0][j] = 'missing';
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sb = sList[i - 1];
      const mb = mList[j - 1];

      let bestCost = dp[i - 1][j] + 2;
      let bestOp = 'extra';

      const missCost = dp[i][j - 1] + 2;
      if (missCost < bestCost) {
        bestCost = missCost;
        bestOp = 'missing';
      }

      if (sb.opcode === mb.opcode) {
        const sameParams = paramsEqual(sb.params, mb.params);
        const pairCost = dp[i - 1][j - 1] + (sameParams ? 0 : 1);
        if (pairCost <= bestCost) {
          bestCost = pairCost;
          bestOp = sameParams ? 'match' : 'diff_param';
        }
      }

      dp[i][j] = bestCost;
      choice[i][j] = bestOp;
    }
  }

  // バックトラック
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const op = choice[i][j];
    if (op === 'match' || op === 'diff_param') {
      ops.push({ op, sIdx: i - 1, mIdx: j - 1 });
      i--;
      j--;
    } else if (op === 'extra') {
      ops.push({ op, sIdx: i - 1, mIdx: -1 });
      i--;
    } else {
      ops.push({ op: 'missing', sIdx: -1, mIdx: j - 1 });
      j--;
    }
  }
  ops.reverse();

  for (const step of ops) {
    const pairId = genPairId();
    if (step.op === 'match' || step.op === 'diff_param') {
      const sb = sList[step.sIdx];
      const mb = mList[step.mIdx];
      sb.diffStatus = step.op;
      mb.diffStatus = step.op;
      sb.pairId = pairId;
      mb.pairId = pairId;

      if (step.op === 'match') {
        stats.match++;
      } else {
        stats.diff_param++;
        const detail = `あなた: ${sb.summaryJa} ／ おてほん: ${mb.summaryJa}`;
        sb.diffDetail = detail;
        mb.diffDetail = detail;
        diffItems.push({
          pairId,
          type: 'diff_param',
          spriteName,
          title: '値がちがうブロック',
          detail,
        });
      }

      // C型ブロックの中身も再帰的に比較
      const subCount = Math.max(sb.substacks.length, mb.substacks.length);
      for (let k = 0; k < subCount; k++) {
        const sSub = sb.substacks[k] || [];
        const mSub = mb.substacks[k] || [];
        alignBlockLists(sSub, mSub, spriteName, stats, diffItems);
      }
    } else if (step.op === 'extra') {
      const sb = sList[step.sIdx];
      markSingleAndChildren(sb, 'extra', pairId, spriteName, stats, diffItems);
    } else {
      const mb = mList[step.mIdx];
      markSingleAndChildren(mb, 'missing', pairId, spriteName, stats, diffItems);
    }
  }
}

function markAllBlocks(list, status, spriteName, stats, diffItems) {
  for (const b of list) {
    markSingleAndChildren(b, status, genPairId(), spriteName, stats, diffItems);
  }
}

function markSingleAndChildren(block, status, pairId, spriteName, stats, diffItems) {
  block.diffStatus = status;
  block.pairId = pairId;

  if (status === 'missing') {
    stats.missing++;
    block.diffDetail = `おてほんにある「${block.summaryJa}」が足りません`;
    diffItems.push({
      pairId,
      type: 'missing',
      spriteName,
      title: `たりない: ${block.summaryJa}`,
      detail: 'おてほんのブロックを参考に足してみよう',
    });
  } else {
    stats.extra++;
    block.diffDetail = `「${block.summaryJa}」はおてほんにありません`;
    diffItems.push({
      pairId,
      type: 'extra',
      spriteName,
      title: `余分: ${block.summaryJa}`,
      detail: 'このブロックが本当に必要か確認しよう',
    });
  }

  for (const sub of block.substacks) {
    markAllBlocks(sub, status, spriteName, stats, diffItems);
  }
}

function cloneBlocks(blocks) {
  return blocks.map((b) => ({
    ...b,
    params: [...b.params],
    substacks: b.substacks.map((sub) => cloneBlocks(sub)),
  }));
}

function paramsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => String(v).trim() === String(b[i]).trim());
}

window.ScratchDiff = Object.assign(window.ScratchDiff || {}, { compareProjects });
})();
