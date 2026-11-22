/**
 * Scratch 3.0 (.sb3 / project.json) パーサー
 * project.json のブロックツリーを解析し、scratchblocks 記法と比較用 AST を生成する。
 */

(function () {
async function parseSb3File(file) {
  const buffer = await file.arrayBuffer();
  const zip = await window.JSZip.loadAsync(buffer);
  const projectFile = zip.file('project.json');
  if (!projectFile) {
    throw new Error('有効な .sb3 ファイルではありません（project.json が見つかりません）。');
  }
  const jsonText = await projectFile.async('string');
  const projectJson = JSON.parse(jsonText);
  const parsed = parseProjectJson(projectJson, file.name);

  // 各ターゲットの現在のコスチューム画像を抽出して Data URL 化
  const targets = Array.isArray(projectJson.targets) ? projectJson.targets : [];
  for (const pt of parsed.targets) {
    const rawTarget = targets.find((t) => (t.name || 'Stage') === pt.rawName && Boolean(t.isStage) === pt.isStage);
    if (!rawTarget || !Array.isArray(rawTarget.costumes) || rawTarget.costumes.length === 0) continue;

    const idx = Math.min(Math.max(rawTarget.currentCostume || 0, 0), rawTarget.costumes.length - 1);
    const costume = rawTarget.costumes[idx];
    const assetName = costume.md5ext || (costume.assetId && costume.dataFormat ? `${costume.assetId}.${costume.dataFormat}` : null);
    if (!assetName) continue;

    const assetFile = zip.file(assetName);
    if (!assetFile) continue;

    const ext = (costume.dataFormat || assetName.split('.').pop() || '').toLowerCase();
    const mime = ext === 'svg'
      ? 'image/svg+xml'
      : ext === 'png'
        ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : 'application/octet-stream';

    const base64 = await assetFile.async('base64');
    pt.costumeUrl = `data:${mime};base64,${base64}`;
  }

  return parsed;
}

function parseProjectJson(projectJson, sourceName = 'project.json') {
  const targets = Array.isArray(projectJson.targets) ? projectJson.targets : [];
  const parsedTargets = targets.map((target) => {
    const blocks = target.blocks || {};
    const scripts = extractScripts(blocks);
    return {
      name: target.isStage ? 'ステージ' : (target.name || 'スプライト'),
      rawName: target.name || 'Stage',
      isStage: Boolean(target.isStage),
      costumeUrl: target.costumeUrl || null,
      scripts,
    };
  }).filter((t) => t.scripts.length > 0 || !t.isStage);

  return {
    sourceName,
    targets: parsedTargets,
  };
}

function extractScripts(blocks) {
  const scripts = [];
  for (const [id, block] of Object.entries(blocks)) {
    if (!block || Array.isArray(block) || block.shadow) continue;
    if (block.topLevel) {
      const chain = parseBlockChain(id, blocks);
      if (chain.length > 0) {
        scripts.push({
          id,
          headOpcode: chain[0].opcode,
          headText: chain[0].summaryJa,
          blocks: chain,
        });
      }
    }
  }
  // 座標順（上から下、左から右）に安定ソート
  scripts.sort((a, b) => {
    const ba = blocks[a.id];
    const bb = blocks[b.id];
    const dy = (ba?.y || 0) - (bb?.y || 0);
    if (Math.abs(dy) > 40) return dy;
    return (ba?.x || 0) - (bb?.x || 0);
  });
  return scripts;
}

function parseBlockChain(startId, blocks, visited = new Set()) {
  const list = [];
  let curId = startId;
  while (curId && blocks[curId] && !visited.has(curId)) {
    visited.add(curId);
    const block = blocks[curId];
    if (Array.isArray(block) || block.shadow) break;
    list.push(parseSingleBlock(curId, block, blocks, visited));
    curId = block.next;
  }
  return list;
}

function formatDropdownLabel(raw) {
  const str = String(raw ?? '');
  switch (str) {
    case '_mouse_': return 'マウスポインター';
    case '_edge_': return '端';
    case '_random_': return 'どこかの場所';
    case '_myself_': return '自分自身';
    case '_stage_': return 'ステージ';
    default: return str;
  }
}

function resolveInputSlot(inputs, name, mode, blocks, visited) {
  const inp = inputs[name];
  if (!Array.isArray(inp) || inp.length < 2) {
    return mode === 'boolean'
      ? { text: '<>', raw: '' }
      : { text: mode === 'string' ? '[]' : '()', raw: '' };
  }

  // inp[0]: 1=shadow only, 2=no shadow (block), 3=obscured shadow (block + shadow)
  const val = inp[1];
  if (typeof val === 'string' && blocks[val] && !blocks[val].shadow) {
    const rep = parseReporter(val, blocks, visited);
    return { text: rep.text, raw: rep.raw, isBlock: true };
  }

  if (Array.isArray(val)) {
    const typeCode = val[0];
    const rawVal = val[1] ?? '';
    const str = String(rawVal);

    // 12: 変数プリミティブ [12, varName, varId]
    if (typeCode === 12) {
      return { text: `(${escapeSb(str)})`, raw: `var:${str}`, isBlock: true };
    }
    // 13: リストプリミティブ [13, listName, listId]
    if (typeCode === 13) {
      return { text: `(${escapeSb(str)} :: list)`, raw: `list:${str}`, isBlock: true };
    }
    // 11: ブロードキャスト [11, msgName, msgId]
    if (typeCode === 11 && mode === 'dropdown') {
      return { text: `[${escapeSb(str)} v]`, raw: str };
    }

    if (mode === 'string') return { text: `[${escapeSb(str)}]`, raw: str };
    if (mode === 'color') return { text: `[${str}]`, raw: str };
    if (mode === 'dropdown') {
      const label = formatDropdownLabel(str);
      return { text: `[${escapeSb(label)} v]`, raw: label };
    }
    if (str !== '' && !Number.isNaN(Number(str))) {
      return { text: `(${str})`, raw: str };
    }
    return { text: `(${escapeSb(str)})`, raw: str };
  }

  // シャドウまたはメニューブロック参照の場合
  if (typeof val === 'string' && blocks[val]) {
    const shadowBlock = blocks[val];
    const firstField = Object.values(shadowBlock.fields || {})[0];
    const rawField = Array.isArray(firstField) ? String(firstField[0] ?? '') : '';
    const label = formatDropdownLabel(rawField);
    if (mode === 'dropdown') return { text: `[${escapeSb(label)} v]`, raw: label };
    if (mode === 'string') return { text: `[${escapeSb(label)}]`, raw: label };
    return { text: `(${escapeSb(label)})`, raw: label };
  }

  return mode === 'boolean' ? { text: '<>', raw: '' } : { text: '()', raw: '' };
}

function parseSingleBlock(id, block, blocks, visited) {
  const opcode = block.opcode || 'unknown';
  const inputs = block.inputs || {};
  const fields = block.fields || {};

  const getField = (name, fallback = '') => {
    const f = fields[name];
    if (Array.isArray(f) && f.length > 0) return String(f[0] ?? fallback);
    return fallback;
  };

  const getInput = (name, mode = 'number') => resolveInputSlot(inputs, name, mode, blocks, visited);

  const substack1Id = Array.isArray(inputs.SUBSTACK) ? inputs.SUBSTACK[1] : null;
  const substack2Id = Array.isArray(inputs.SUBSTACK2) ? inputs.SUBSTACK2[1] : null;

  const substacks = [];
  if (opcode === 'control_if_else') {
    substacks.push(substack1Id ? parseBlockChain(substack1Id, blocks, new Set(visited)) : []);
    substacks.push(substack2Id ? parseBlockChain(substack2Id, blocks, new Set(visited)) : []);
  } else if (
    opcode === 'control_repeat' ||
    opcode === 'control_forever' ||
    opcode === 'control_if' ||
    opcode === 'control_repeat_until'
  ) {
    substacks.push(substack1Id ? parseBlockChain(substack1Id, blocks, new Set(visited)) : []);
  }

  const info = formatStatementBlock(opcode, { getField, getInput, block, blocks });

  return {
    id,
    opcode,
    headerLine: info.headerLine,
    isCBlock: substacks.length > 0,
    isIfElse: opcode === 'control_if_else',
    params: info.params,
    substacks,
    summaryJa: info.summaryJa,
  };
}

function parseReporter(id, blocks, visited) {
  if (visited.has(id)) return { text: '(...)', raw: '...' };
  const nextVisited = new Set(visited);
  nextVisited.add(id);
  const block = blocks[id];
  if (!block) return { text: '()', raw: '' };

  const opcode = block.opcode;
  const inputs = block.inputs || {};
  const fields = block.fields || {};

  const getField = (name, fallback = '') => {
    const f = fields[name];
    return Array.isArray(f) && f.length > 0 ? String(f[0] ?? fallback) : fallback;
  };

  const getIn = (name, mode = 'number') => resolveInputSlot(inputs, name, mode, blocks, nextVisited);

  switch (opcode) {
    // 演算
    case 'operator_add': return wrapRep(`(${getIn('NUM1').text} + ${getIn('NUM2').text})`, `${getIn('NUM1').raw}+${getIn('NUM2').raw}`);
    case 'operator_subtract': return wrapRep(`(${getIn('NUM1').text} - ${getIn('NUM2').text})`, `${getIn('NUM1').raw}-${getIn('NUM2').raw}`);
    case 'operator_multiply': return wrapRep(`(${getIn('NUM1').text} * ${getIn('NUM2').text})`, `${getIn('NUM1').raw}*${getIn('NUM2').raw}`);
    case 'operator_divide': return wrapRep(`(${getIn('NUM1').text} / ${getIn('NUM2').text})`, `${getIn('NUM1').raw}/${getIn('NUM2').raw}`);
    case 'operator_random': return wrapRep(`(pick random ${getIn('FROM').text} to ${getIn('TO').text})`, `random(${getIn('FROM').raw},${getIn('TO').raw})`);
    case 'operator_gt': return wrapRep(`<${getIn('OPERAND1', 'string').text} > ${getIn('OPERAND2', 'string').text}>`, `${getIn('OPERAND1', 'string').raw}>${getIn('OPERAND2', 'string').raw}`);
    case 'operator_lt': return wrapRep(`<${getIn('OPERAND1', 'string').text} < ${getIn('OPERAND2', 'string').text}>`, `${getIn('OPERAND1', 'string').raw}<${getIn('OPERAND2', 'string').raw}`);
    case 'operator_equals': return wrapRep(`<${getIn('OPERAND1', 'string').text} = ${getIn('OPERAND2', 'string').text}>`, `${getIn('OPERAND1', 'string').raw}=${getIn('OPERAND2', 'string').raw}`);
    case 'operator_and': return wrapRep(`<${getIn('OPERAND1', 'boolean').text} and ${getIn('OPERAND2', 'boolean').text}>`, `(${getIn('OPERAND1', 'boolean').raw}&&${getIn('OPERAND2', 'boolean').raw})`);
    case 'operator_or': return wrapRep(`<${getIn('OPERAND1', 'boolean').text} or ${getIn('OPERAND2', 'boolean').text}>`, `(${getIn('OPERAND1', 'boolean').raw}||${getIn('OPERAND2', 'boolean').raw})`);
    case 'operator_not': return wrapRep(`<not ${getIn('OPERAND', 'boolean').text}>`, `!(${getIn('OPERAND', 'boolean').raw})`);
    case 'operator_join': return wrapRep(`(join ${getIn('STRING1', 'string').text} ${getIn('STRING2', 'string').text})`, `join(${getIn('STRING1', 'string').raw},${getIn('STRING2', 'string').raw})`);
    case 'operator_letter_of': return wrapRep(`(letter ${getIn('LETTER').text} of ${getIn('STRING', 'string').text})`, `letter(${getIn('LETTER').raw},${getIn('STRING', 'string').raw})`);
    case 'operator_length': return wrapRep(`(length of ${getIn('STRING', 'string').text})`, `strlen(${getIn('STRING', 'string').raw})`);
    case 'operator_contains': return wrapRep(`<${getIn('STRING1', 'string').text} contains ${getIn('STRING2', 'string').text}?>`, `str_contains(${getIn('STRING1', 'string').raw},${getIn('STRING2', 'string').raw})`);
    case 'operator_mod': return wrapRep(`(${getIn('NUM1').text} mod ${getIn('NUM2').text})`, `${getIn('NUM1').raw}%${getIn('NUM2').raw}`);
    case 'operator_round': return wrapRep(`(round ${getIn('NUM').text})`, `round(${getIn('NUM').raw})`);
    case 'operator_mathop': {
      const op = getField('OPERATOR', 'abs');
      return wrapRep(`([${escapeSb(op)} v] of ${getIn('NUM').text})`, `mathop(${op},${getIn('NUM').raw})`);
    }

    // 調べる
    case 'sensing_touchingobject': {
      const target = getIn('TOUCHINGOBJECTMENU', 'dropdown');
      return wrapRep(`<touching ${target.text}?>`, `touching(${target.raw})`);
    }
    case 'sensing_touchingcolor': {
      const color = getIn('COLOR', 'color');
      return wrapRep(`<touching color ${color.text}?>`, `touching_color(${color.raw})`);
    }
    case 'sensing_coloristouchingcolor': {
      const c1 = getIn('COLOR', 'color');
      const c2 = getIn('COLOR2', 'color');
      return wrapRep(`<color ${c1.text} is touching ${c2.text}?>`, `color_touching(${c1.raw},${c2.raw})`);
    }
    case 'sensing_distanceto': {
      const target = getIn('DISTANCETOMENU', 'dropdown');
      return wrapRep(`(distance to ${target.text})`, `distance(${target.raw})`);
    }
    case 'sensing_answer': return wrapRep('(answer)', 'answer');
    case 'sensing_keypressed': {
      const key = getIn('KEY_OPTION', 'dropdown');
      return wrapRep(`<key ${key.text} pressed?>`, `key(${key.raw})`);
    }
    case 'sensing_mousedown': return wrapRep('<mouse down?>', 'mousedown');
    case 'sensing_mousex': return wrapRep('(mouse x)', 'mousex');
    case 'sensing_mousey': return wrapRep('(mouse y)', 'mousey');
    case 'sensing_loudness': return wrapRep('(loudness)', 'loudness');
    case 'sensing_timer': return wrapRep('(timer)', 'timer');
    case 'sensing_of': {
      const prop = getField('PROPERTY', 'x position');
      const obj = getIn('OBJECT', 'dropdown');
      return wrapRep(`([${escapeSb(prop)} v] of ${obj.text})`, `of(${prop},${obj.raw})`);
    }
    case 'sensing_current': {
      const menu = getField('CURRENTMENU', 'YEAR').toLowerCase();
      return wrapRep(`(current [${escapeSb(menu)} v])`, `current(${menu})`);
    }
    case 'sensing_dayssince2000': return wrapRep('(days since 2000)', 'days2000');
    case 'sensing_username': return wrapRep('(username)', 'username');

    // 動き・見た目・音・音楽レポーター
    case 'motion_xposition': return wrapRep('(x position)', 'x_pos');
    case 'motion_yposition': return wrapRep('(y position)', 'y_pos');
    case 'motion_direction': return wrapRep('(direction)', 'direction');
    case 'looks_costumenumbername': {
      const opt = getField('NUMBER_NAME', 'number');
      return wrapRep(`(costume [${escapeSb(opt)} v])`, `costume_${opt}`);
    }
    case 'looks_backdropnumbername': {
      const opt = getField('NUMBER_NAME', 'number');
      return wrapRep(`(backdrop [${escapeSb(opt)} v])`, `backdrop_${opt}`);
    }
    case 'looks_size': return wrapRep('(size)', 'size');
    case 'sound_volume': return wrapRep('(volume)', 'volume');
    case 'music_getTempo': return wrapRep('(tempo)', 'tempo');

    // 変数・リスト・マイブロック引数
    case 'data_variable': {
      const vName = getField('VARIABLE', '変数');
      return wrapRep(`(${escapeSb(vName)})`, `var:${vName}`);
    }
    case 'data_listcontents': {
      const lName = getField('LIST', 'リスト');
      return wrapRep(`(${escapeSb(lName)} :: list)`, `list:${lName}`);
    }
    case 'data_itemoflist': {
      const lName = getField('LIST', 'リスト');
      const idx = getIn('INDEX');
      return wrapRep(`(item ${idx.text} of [${escapeSb(lName)} v])`, `item(${idx.raw},${lName})`);
    }
    case 'data_itemnumoflist': {
      const lName = getField('LIST', 'リスト');
      const item = getIn('ITEM', 'string');
      return wrapRep(`(item # of ${item.text} in [${escapeSb(lName)} v])`, `itemnum(${item.raw},${lName})`);
    }
    case 'data_lengthoflist': {
      const lName = getField('LIST', 'リスト');
      return wrapRep(`(length of [${escapeSb(lName)} v])`, `len:${lName}`);
    }
    case 'data_listcontainsitem': {
      const lName = getField('LIST', 'リスト');
      const item = getIn('ITEM', 'string');
      return wrapRep(`<[${escapeSb(lName)} v] contains ${item.text}?>`, `list_contains(${lName},${item.raw})`);
    }
    case 'argument_reporter_string_number': {
      const arg = getField('VALUE', '引数');
      return wrapRep(`(${escapeSb(arg)} :: custom-arg)`, `arg:${arg}`);
    }
    case 'argument_reporter_boolean': {
      const arg = getField('VALUE', '条件');
      return wrapRep(`<${escapeSb(arg)} :: custom-arg>`, `arg_bool:${arg}`);
    }

    default:
      return wrapRep(`(${opcode})`, opcode);
  }
}

function wrapRep(text, raw) {
  return { text, raw };
}

function formatSoundEffectName(raw) {
  const upper = String(raw ?? 'PITCH').toUpperCase();
  if (upper === 'PAN') return 'pan left/right';
  if (upper === 'PITCH') return 'pitch';
  return String(raw).toLowerCase();
}

function formatStatementBlock(opcode, { getField, getInput, block, blocks }) {
  switch (opcode) {
    // イベント
    case 'event_whenflagclicked':
      return { headerLine: 'when green flag clicked', params: [], summaryJa: '緑の旗が押されたとき' };
    case 'event_whenkeypressed': {
      const key = getField('KEY_OPTION', 'space');
      return { headerLine: `when [${escapeSb(key)} v] key pressed`, params: [key], summaryJa: `「${key}」キーが押されたとき` };
    }
    case 'event_whenthisspriteclicked':
      return { headerLine: 'when this sprite clicked', params: [], summaryJa: 'このスプライトが押されたとき' };
    case 'event_whenstageclicked':
      return { headerLine: 'when stage clicked', params: [], summaryJa: 'ステージが押されたとき' };
    case 'event_whenbackdropswitchesto': {
      const bd = getField('BACKDROP', 'backdrop1');
      return { headerLine: `when backdrop switches to [${escapeSb(bd)} v]`, params: [bd], summaryJa: `背景が「${bd}」になったとき` };
    }
    case 'event_whengreaterthan': {
      const menu = getField('WHENGREATERTHANMENU', 'LOUDNESS').toLowerCase();
      const val = getInput('VALUE');
      return { headerLine: `when [${escapeSb(menu)} v] > ${val.text}`, params: [menu, val.raw], summaryJa: `「${menu}」が ${val.raw} より大きいとき` };
    }
    case 'event_whenbroadcastreceived': {
      const msg = getField('BROADCAST_OPTION', 'message1');
      return { headerLine: `when I receive [${escapeSb(msg)} v]`, params: [msg], summaryJa: `「${msg}」を受け取ったとき` };
    }
    case 'event_broadcast': {
      const b = getInput('BROADCAST_INPUT', 'dropdown');
      return { headerLine: `broadcast ${b.text}`, params: [b.raw], summaryJa: `「${b.raw}」を送る` };
    }
    case 'event_broadcastandwait': {
      const b = getInput('BROADCAST_INPUT', 'dropdown');
      return { headerLine: `broadcast ${b.text} and wait`, params: [b.raw], summaryJa: `「${b.raw}」を送って待つ` };
    }

    // 動き
    case 'motion_movesteps': {
      const s = getInput('STEPS');
      return { headerLine: `move ${s.text} steps`, params: [s.raw], summaryJa: `${s.raw} 歩動かす` };
    }
    case 'motion_turnright': {
      const d = getInput('DEGREES');
      return { headerLine: `turn cw ${d.text} degrees`, params: [d.raw], summaryJa: `右に ${d.raw} 度回す` };
    }
    case 'motion_turnleft': {
      const d = getInput('DEGREES');
      return { headerLine: `turn ccw ${d.text} degrees`, params: [d.raw], summaryJa: `左に ${d.raw} 度回す` };
    }
    case 'motion_goto': {
      const to = getInput('TO', 'dropdown');
      return { headerLine: `go to ${to.text}`, params: [to.raw], summaryJa: `${to.raw} へ行く` };
    }
    case 'motion_gotoxy': {
      const x = getInput('X');
      const y = getInput('Y');
      return { headerLine: `go to x: ${x.text} y: ${y.text}`, params: [x.raw, y.raw], summaryJa: `x座標を ${x.raw}、y座標を ${y.raw} にする` };
    }
    case 'motion_glideto': {
      const sec = getInput('SECS');
      const to = getInput('TO', 'dropdown');
      return { headerLine: `glide ${sec.text} secs to ${to.text}`, params: [sec.raw, to.raw], summaryJa: `${sec.raw} 秒で ${to.raw} へ動く` };
    }
    case 'motion_glidesecstoxy': {
      const sec = getInput('SECS');
      const x = getInput('X');
      const y = getInput('Y');
      return { headerLine: `glide ${sec.text} secs to x: ${x.text} y: ${y.text}`, params: [sec.raw, x.raw, y.raw], summaryJa: `${sec.raw} 秒で x:${x.raw} y:${y.raw} へ動く` };
    }
    case 'motion_pointindirection': {
      const dir = getInput('DIRECTION');
      return { headerLine: `point in direction ${dir.text}`, params: [dir.raw], summaryJa: `${dir.raw} 度に向ける` };
    }
    case 'motion_pointtowards': {
      const to = getInput('TOWARDS', 'dropdown');
      return { headerLine: `point towards ${to.text}`, params: [to.raw], summaryJa: `${to.raw} へ向ける` };
    }
    case 'motion_changexby': {
      const dx = getInput('DX');
      return { headerLine: `change x by ${dx.text}`, params: [dx.raw], summaryJa: `x座標を ${dx.raw} ずつ変える` };
    }
    case 'motion_setx': {
      const x = getInput('X');
      return { headerLine: `set x to ${x.text}`, params: [x.raw], summaryJa: `x座標を ${x.raw} にする` };
    }
    case 'motion_changeyby': {
      const dy = getInput('DY');
      return { headerLine: `change y by ${dy.text}`, params: [dy.raw], summaryJa: `y座標を ${dy.raw} ずつ変える` };
    }
    case 'motion_sety': {
      const y = getInput('Y');
      return { headerLine: `set y to ${y.text}`, params: [y.raw], summaryJa: `y座標を ${y.raw} にする` };
    }
    case 'motion_ifonedgebounce':
      return { headerLine: 'if on edge, bounce', params: [], summaryJa: 'もし端に着いたら、跳ね返る' };
    case 'motion_setrotationstyle': {
      const style = getField('STYLE', 'all around');
      return { headerLine: `set rotation style [${escapeSb(style)} v]`, params: [style], summaryJa: `回転方法を「${style}」にする` };
    }

    // 見た目
    case 'looks_sayforsecs': {
      const msg = getInput('MESSAGE', 'string');
      const sec = getInput('SECS');
      return { headerLine: `say ${msg.text} for ${sec.text} seconds`, params: [msg.raw, sec.raw], summaryJa: `「${msg.raw}」と ${sec.raw} 秒言う` };
    }
    case 'looks_say': {
      const msg = getInput('MESSAGE', 'string');
      return { headerLine: `say ${msg.text}`, params: [msg.raw], summaryJa: `「${msg.raw}」と言う` };
    }
    case 'looks_thinkforsecs': {
      const msg = getInput('MESSAGE', 'string');
      const sec = getInput('SECS');
      return { headerLine: `think ${msg.text} for ${sec.text} seconds`, params: [msg.raw, sec.raw], summaryJa: `「${msg.raw}」と ${sec.raw} 秒考える` };
    }
    case 'looks_think': {
      const msg = getInput('MESSAGE', 'string');
      return { headerLine: `think ${msg.text}`, params: [msg.raw], summaryJa: `「${msg.raw}」と考える` };
    }
    case 'looks_switchcostumeto': {
      const c = getInput('COSTUME', 'dropdown');
      return { headerLine: `switch costume to ${c.text}`, params: [c.raw], summaryJa: `コスチュームを「${c.raw}」にする` };
    }
    case 'looks_nextcostume':
      return { headerLine: 'next costume', params: [], summaryJa: '次のコスチュームにする' };
    case 'looks_switchbackdropto': {
      const b = getInput('BACKDROP', 'dropdown');
      return { headerLine: `switch backdrop to ${b.text}`, params: [b.raw], summaryJa: `背景を「${b.raw}」にする` };
    }
    case 'looks_switchbackdroptoandwait': {
      const b = getInput('BACKDROP', 'dropdown');
      return { headerLine: `switch backdrop to ${b.text} and wait`, params: [b.raw], summaryJa: `背景を「${b.raw}」にして待つ` };
    }
    case 'looks_nextbackdrop':
      return { headerLine: 'next backdrop', params: [], summaryJa: '次の背景にする' };
    case 'looks_changesizeby': {
      const s = getInput('CHANGE');
      return { headerLine: `change size by ${s.text}`, params: [s.raw], summaryJa: `大きさを ${s.raw} ずつ変える` };
    }
    case 'looks_setsizeto': {
      const s = getInput('SIZE');
      return { headerLine: `set size to ${s.text}%`, params: [s.raw], summaryJa: `大きさを ${s.raw}% にする` };
    }
    case 'looks_changeeffectby': {
      const eff = getField('EFFECT', 'COLOR').toLowerCase();
      const val = getInput('CHANGE');
      return { headerLine: `change [${escapeSb(eff)} v] effect by ${val.text}`, params: [eff, val.raw], summaryJa: `「${eff}」の効果を ${val.raw} ずつ変える` };
    }
    case 'looks_seteffectto': {
      const eff = getField('EFFECT', 'COLOR').toLowerCase();
      const val = getInput('VALUE');
      return { headerLine: `set [${escapeSb(eff)} v] effect to ${val.text}`, params: [eff, val.raw], summaryJa: `「${eff}」の効果を ${val.raw} にする` };
    }
    case 'looks_cleargraphiceffects':
      return { headerLine: 'clear graphic effects', params: [], summaryJa: '画像効果をなくす' };
    case 'looks_show':
      return { headerLine: 'show', params: [], summaryJa: '表示する' };
    case 'looks_hide':
      return { headerLine: 'hide', params: [], summaryJa: '隠す' };
    case 'looks_gotofrontback': {
      const fb = getField('FRONT_BACK', 'front');
      return { headerLine: `go to [${escapeSb(fb)} v] layer`, params: [fb], summaryJa: `${fb === 'front' ? '最前面' : '最背面'}へ移動する` };
    }
    case 'looks_goforwardbackwardlayers': {
      const dir = getField('FORWARD_BACKWARD', 'forward');
      const num = getInput('NUM');
      return { headerLine: `go [${escapeSb(dir)} v] ${num.text} layers`, params: [dir, num.raw], summaryJa: `${num.raw} 層${dir === 'forward' ? '手前' : '奥'}へ移動する` };
    }

    // 音
    case 'sound_playuntildone': {
      const s = getInput('SOUND_MENU', 'dropdown');
      return { headerLine: `play sound ${s.text} until done`, params: [s.raw], summaryJa: `終わるまで「${s.raw}」の音を鳴らす` };
    }
    case 'sound_play': {
      const s = getInput('SOUND_MENU', 'dropdown');
      return { headerLine: `start sound ${s.text}`, params: [s.raw], summaryJa: `「${s.raw}」の音を鳴らす` };
    }
    case 'sound_stopallsounds':
      return { headerLine: 'stop all sounds', params: [], summaryJa: 'すべての音を止める' };
    case 'sound_changeeffectby': {
      const eff = formatSoundEffectName(getField('EFFECT', 'PITCH'));
      const val = getInput('VALUE');
      return { headerLine: `change [${escapeSb(eff)} v] effect by ${val.text}`, params: [eff, val.raw], summaryJa: `音の効果「${eff}」を ${val.raw} ずつ変える` };
    }
    case 'sound_seteffectto': {
      const eff = formatSoundEffectName(getField('EFFECT', 'PITCH'));
      const val = getInput('VALUE');
      return { headerLine: `set [${escapeSb(eff)} v] effect to ${val.text}`, params: [eff, val.raw], summaryJa: `音の効果「${eff}」を ${val.raw} にする` };
    }
    case 'sound_cleareffects':
      return { headerLine: 'clear sound effects', params: [], summaryJa: '音の効果をなくす' };
    case 'sound_changevolumeby': {
      const v = getInput('VOLUME');
      return { headerLine: `change volume by ${v.text}`, params: [v.raw], summaryJa: `音量を ${v.raw} ずつ変える` };
    }
    case 'sound_setvolumeto': {
      const v = getInput('VOLUME');
      return { headerLine: `set volume to ${v.text}%`, params: [v.raw], summaryJa: `音量を ${v.raw}% にする` };
    }

    // 制御
    case 'control_wait': {
      const d = getInput('DURATION');
      return { headerLine: `wait ${d.text} seconds`, params: [d.raw], summaryJa: `${d.raw} 秒待つ` };
    }
    case 'control_repeat': {
      const t = getInput('TIMES');
      return { headerLine: `repeat ${t.text}`, params: [t.raw], summaryJa: `${t.raw} 回繰り返す` };
    }
    case 'control_forever':
      return { headerLine: 'forever', params: [], summaryJa: 'ずっと' };
    case 'control_if': {
      const c = getInput('CONDITION', 'boolean');
      return { headerLine: `if ${c.text} then`, params: [c.raw], summaryJa: `もし ${c.raw || '(条件)'} なら` };
    }
    case 'control_if_else': {
      const c = getInput('CONDITION', 'boolean');
      return { headerLine: `if ${c.text} then`, params: [c.raw], summaryJa: `もし ${c.raw || '(条件)'} なら / でなければ` };
    }
    case 'control_wait_until': {
      const c = getInput('CONDITION', 'boolean');
      return { headerLine: `wait until ${c.text}`, params: [c.raw], summaryJa: `${c.raw || '(条件)'} まで待つ` };
    }
    case 'control_repeat_until': {
      const c = getInput('CONDITION', 'boolean');
      return { headerLine: `repeat until ${c.text}`, params: [c.raw], summaryJa: `${c.raw || '(条件)'} まで繰り返す` };
    }
    case 'control_stop': {
      const opt = getField('STOP_OPTION', 'all');
      return { headerLine: `stop [${escapeSb(opt)} v]`, params: [opt], summaryJa: `止める (${opt})` };
    }
    case 'control_start_as_clone':
      return { headerLine: 'when I start as a clone', params: [], summaryJa: 'クローンされたとき' };
    case 'control_create_clone_of': {
      const c = getInput('CLONE_OPTION', 'dropdown');
      return { headerLine: `create clone of ${c.text}`, params: [c.raw], summaryJa: `${c.raw} のクローンを作る` };
    }
    case 'control_delete_this_clone':
      return { headerLine: 'delete this clone', params: [], summaryJa: 'このクローンを削除する' };

    // 調べる
    case 'sensing_askandwait': {
      const q = getInput('QUESTION', 'string');
      return { headerLine: `ask ${q.text} and wait`, params: [q.raw], summaryJa: `「${q.raw}」と聞いて待つ` };
    }
    case 'sensing_setdragmode': {
      const mode = getField('DRAG_MODE', 'draggable');
      return { headerLine: `set drag mode [${escapeSb(mode)} v]`, params: [mode], summaryJa: `ドラッグモードを「${mode}」にする` };
    }
    case 'sensing_resettimer':
      return { headerLine: 'reset timer', params: [], summaryJa: 'タイマーをリセット' };

    // 変数
    case 'data_setvariableto': {
      const v = getField('VARIABLE', '変数');
      const val = getInput('VALUE', 'string');
      return { headerLine: `set [${escapeSb(v)} v] to ${val.text}`, params: [v, val.raw], summaryJa: `変数「${v}」を ${val.raw} にする` };
    }
    case 'data_changevariableby': {
      const v = getField('VARIABLE', '変数');
      const val = getInput('VALUE');
      return { headerLine: `change [${escapeSb(v)} v] by ${val.text}`, params: [v, val.raw], summaryJa: `変数「${v}」を ${val.raw} ずつ変える` };
    }
    case 'data_showvariable': {
      const v = getField('VARIABLE', '変数');
      return { headerLine: `show variable [${escapeSb(v)} v]`, params: [v], summaryJa: `変数「${v}」を表示する` };
    }
    case 'data_hidevariable': {
      const v = getField('VARIABLE', '変数');
      return { headerLine: `hide variable [${escapeSb(v)} v]`, params: [v], summaryJa: `変数「${v}」を隠す` };
    }

    // リスト
    case 'data_addtolist': {
      const l = getField('LIST', 'リスト');
      const item = getInput('ITEM', 'string');
      return { headerLine: `add ${item.text} to [${escapeSb(l)} v]`, params: [item.raw, l], summaryJa: `「${item.raw}」をリスト「${l}」に追加する` };
    }
    case 'data_deleteoflist': {
      const l = getField('LIST', 'リスト');
      const idx = getInput('INDEX');
      return { headerLine: `delete ${idx.text} of [${escapeSb(l)} v]`, params: [idx.raw, l], summaryJa: `リスト「${l}」の ${idx.raw} 番目を削除する` };
    }
    case 'data_deletealloflist': {
      const l = getField('LIST', 'リスト');
      return { headerLine: `delete all of [${escapeSb(l)} v]`, params: [l], summaryJa: `リスト「${l}」のすべてを削除する` };
    }
    case 'data_insertatlist': {
      const l = getField('LIST', 'リスト');
      const item = getInput('ITEM', 'string');
      const idx = getInput('INDEX');
      return { headerLine: `insert ${item.text} at ${idx.text} of [${escapeSb(l)} v]`, params: [item.raw, idx.raw, l], summaryJa: `リスト「${l}」の ${idx.raw} 番目に「${item.raw}」を挿入する` };
    }
    case 'data_replaceitemoflist': {
      const l = getField('LIST', 'リスト');
      const idx = getInput('INDEX');
      const item = getInput('ITEM', 'string');
      return { headerLine: `replace item ${idx.text} of [${escapeSb(l)} v] with ${item.text}`, params: [idx.raw, l, item.raw], summaryJa: `リスト「${l}」の ${idx.raw} 番目を「${item.raw}」で置き換える` };
    }
    case 'data_showlist': {
      const l = getField('LIST', 'リスト');
      return { headerLine: `show list [${escapeSb(l)} v]`, params: [l], summaryJa: `リスト「${l}」を表示する` };
    }
    case 'data_hidelist': {
      const l = getField('LIST', 'リスト');
      return { headerLine: `hide list [${escapeSb(l)} v]`, params: [l], summaryJa: `リスト「${l}」を隠す` };
    }

    // マイブロック（定義・呼び出し）
    case 'procedures_definition': {
      const customInput = block.inputs?.custom_block;
      const protoId = Array.isArray(customInput) ? customInput[1] : null;
      const proto = protoId && blocks ? blocks[protoId] : null;
      const proccode = proto?.mutation?.proccode || 'マイブロック';
      let argNames = [];
      try {
        if (proto?.mutation?.argumentnames) {
          argNames = JSON.parse(proto.mutation.argumentnames);
        }
      } catch (_) {
        argNames = [];
      }
      let argIdx = 0;
      const formatted = proccode.replace(/%[snb]/g, (ph) => {
        const name = escapeSb(argNames[argIdx++] || (ph === '%b' ? '条件' : '引数'));
        return ph === '%b' ? `<${name}>` : `(${name})`;
      });
      return { headerLine: `define ${formatted}`, params: [proccode], summaryJa: `定義: ${proccode}` };
    }
    case 'procedures_call': {
      const proccode = block.mutation?.proccode || 'マイブロック';
      let argIds = [];
      try {
        if (block.mutation?.argumentids) {
          argIds = JSON.parse(block.mutation.argumentids);
        }
      } catch (_) {
        argIds = [];
      }
      let argIdx = 0;
      const paramRaws = [proccode];
      const formatted = proccode.replace(/%[snb]/g, (ph) => {
        const argId = argIds[argIdx++];
        const slot = argId ? getInput(argId, ph === '%b' ? 'boolean' : 'string') : { text: ph === '%b' ? '<>' : '()', raw: '' };
        paramRaws.push(slot.raw);
        return slot.text;
      });
      return { headerLine: `${formatted} :: custom`, params: paramRaws, summaryJa: `ブロック「${proccode}」を実行` };
    }

    // ペン拡張
    case 'pen_clear':
      return { headerLine: 'erase all', params: [], summaryJa: '全部消す' };
    case 'pen_stamp':
      return { headerLine: 'stamp', params: [], summaryJa: 'スタンプ' };
    case 'pen_penDown':
      return { headerLine: 'pen down', params: [], summaryJa: 'ペンを下ろす' };
    case 'pen_penUp':
      return { headerLine: 'pen up', params: [], summaryJa: 'ペンを上げる' };
    case 'pen_setPenColorToColor': {
      const c = getInput('COLOR', 'color');
      return { headerLine: `set pen color to ${c.text}`, params: [c.raw], summaryJa: `ペンの色を ${c.raw} にする` };
    }
    case 'pen_changePenColorParamBy': {
      const p = getInput('COLOR_PARAM', 'dropdown');
      const v = getInput('VALUE');
      return { headerLine: `change pen ${p.text} by ${v.text}`, params: [p.raw, v.raw], summaryJa: `ペンの「${p.raw}」を ${v.raw} ずつ変える` };
    }
    case 'pen_setPenColorParamTo': {
      const p = getInput('COLOR_PARAM', 'dropdown');
      const v = getInput('VALUE');
      return { headerLine: `set pen ${p.text} to ${v.text}`, params: [p.raw, v.raw], summaryJa: `ペンの「${p.raw}」を ${v.raw} にする` };
    }
    case 'pen_changePenSizeBy': {
      const s = getInput('SIZE');
      return { headerLine: `change pen size by ${s.text}`, params: [s.raw], summaryJa: `ペンの太さを ${s.raw} ずつ変える` };
    }
    case 'pen_setPenSizeTo': {
      const s = getInput('SIZE');
      return { headerLine: `set pen size to ${s.text}`, params: [s.raw], summaryJa: `ペンの太さを ${s.raw} にする` };
    }
    case 'pen_changePenHueBy': {
      const h = getInput('HUE');
      return { headerLine: `change pen color by ${h.text}`, params: [h.raw], summaryJa: `ペンの色を ${h.raw} ずつ変える` };
    }
    case 'pen_setPenHueToNumber': {
      const h = getInput('HUE');
      return { headerLine: `set pen color to ${h.text}`, params: [h.raw], summaryJa: `ペンの色を ${h.raw} にする` };
    }
    case 'pen_changePenShadeBy': {
      const sh = getInput('SHADE');
      return { headerLine: `change pen shade by ${sh.text}`, params: [sh.raw], summaryJa: `ペンの濃さを ${sh.raw} ずつ変える` };
    }
    case 'pen_setPenShadeToNumber': {
      const sh = getInput('SHADE');
      return { headerLine: `set pen shade to ${sh.text}`, params: [sh.raw], summaryJa: `ペンの濃さを ${sh.raw} にする` };
    }

    // 音楽拡張
    case 'music_playDrumForBeats': {
      const drum = getInput('DRUM', 'dropdown');
      const beats = getInput('BEATS');
      return { headerLine: `play drum ${drum.text} for ${beats.text} beats`, params: [drum.raw, beats.raw], summaryJa: `${drum.raw} のドラムを ${beats.raw} 拍鳴らす` };
    }
    case 'music_restForBeats': {
      const beats = getInput('BEATS');
      return { headerLine: `rest for ${beats.text} beats`, params: [beats.raw], summaryJa: `${beats.raw} 拍休む` };
    }
    case 'music_playNoteForBeats': {
      const note = getInput('NOTE');
      const beats = getInput('BEATS');
      return { headerLine: `play note ${note.text} for ${beats.text} beats`, params: [note.raw, beats.raw], summaryJa: `${note.raw} の音符を ${beats.raw} 拍鳴らす` };
    }
    case 'music_setInstrument': {
      const inst = getInput('INSTRUMENT', 'dropdown');
      return { headerLine: `set instrument to ${inst.text}`, params: [inst.raw], summaryJa: `楽器を「${inst.raw}」にする` };
    }
    case 'music_setTempo': {
      const tempo = getInput('TEMPO');
      return { headerLine: `set tempo to ${tempo.text}`, params: [tempo.raw], summaryJa: `テンポを ${tempo.raw} にする` };
    }
    case 'music_changeTempo': {
      const tempo = getInput('TEMPO');
      return { headerLine: `change tempo by ${tempo.text}`, params: [tempo.raw], summaryJa: `テンポを ${tempo.raw} ずつ変える` };
    }

    // 音声合成拡張
    case 'text2speech_speakAndWait': {
      const words = getInput('WORDS', 'string');
      return { headerLine: `speak ${words.text}`, params: [words.raw], summaryJa: `「${words.raw}」と話す` };
    }
    case 'text2speech_setVoice': {
      const voice = getInput('VOICE', 'dropdown');
      return { headerLine: `set voice to ${voice.text}`, params: [voice.raw], summaryJa: `声を「${voice.raw}」にする` };
    }
    case 'text2speech_setLanguage': {
      const lang = getInput('LANGUAGE', 'dropdown');
      return { headerLine: `set language to ${lang.text}`, params: [lang.raw], summaryJa: `言語を「${lang.raw}」にする` };
    }

    default:
      return { headerLine: `${opcode} :: grey`, params: [], summaryJa: opcode };
  }
}

function escapeSb(str) {
  return String(str).replace(/[\[\]()<>]/g, (ch) => `\\${ch}`);
}

window.ScratchDiff = Object.assign(window.ScratchDiff || {}, { parseSb3File, parseProjectJson });
})();
