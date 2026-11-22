/**
 * 動作確認・学習デモ用のサンプル Scratch プロジェクトデータ（project.json 互換）
 */

(function () {
  window.ScratchDiff = window.ScratchDiff || {};

function makeBlock(opcode, { next = null, parent = null, topLevel = false, inputs = {}, fields = {}, x = 20, y = 20 } = {}) {
  return { opcode, next, parent, inputs, fields, shadow: false, topLevel, x, y };
}

function numIn(v) {
  return [1, [4, String(v)]];
}

function strIn(v) {
  return [1, [10, String(v)]];
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const CAT_COSTUME_URL = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <polygon points="14,24 18,8 30,18" fill="#ff9f1c" stroke="#222" stroke-width="2.5" stroke-linejoin="round"/>
  <polygon points="50,24 46,8 34,18" fill="#ff9f1c" stroke="#222" stroke-width="2.5" stroke-linejoin="round"/>
  <ellipse cx="32" cy="36" rx="22" ry="18" fill="#ff9f1c" stroke="#222" stroke-width="2.5"/>
  <ellipse cx="32" cy="41" rx="13" ry="10" fill="#ffffff"/>
  <circle cx="24" cy="32" r="3.2" fill="#222"/>
  <circle cx="40" cy="32" r="3.2" fill="#222"/>
  <polygon points="32,39 29,36 35,36" fill="#e76f51"/>
  <path d="M27,43 Q32,47 37,43" fill="none" stroke="#222" stroke-width="2" stroke-linecap="round"/>
</svg>`);

const COIN_COSTUME_URL = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="24" fill="#ffd166" stroke="#d97706" stroke-width="3"/>
  <circle cx="32" cy="32" r="17" fill="#fde68a" stroke="#f59e0b" stroke-width="2"/>
  <rect x="29" y="20" width="6" height="24" rx="3" fill="#d97706"/>
</svg>`);

window.ScratchDiff.PRESETS = {
  square: {
    label: '正方形をかこう',
    studentLabel: 'サンプル: あなたの作品（正方形）',
    modelLabel: 'サンプル: おてほん（正方形）',
    student: {
      targets: [
        {
          isStage: false,
          name: 'ネコ',
          costumeUrl: CAT_COSTUME_URL,
          blocks: {
            b1: makeBlock('event_whenflagclicked', { next: 'b2', topLevel: true }),
            b2: makeBlock('pen_penDown', { next: 'b3', parent: 'b1' }),
            b3: makeBlock('control_repeat', {
              next: 'b7',
              parent: 'b2',
              inputs: {
                TIMES: numIn(3),
                SUBSTACK: [2, 'b4'],
              },
            }),
            b4: makeBlock('motion_movesteps', { next: 'b5', parent: 'b3', inputs: { STEPS: numIn(100) } }),
            b5: makeBlock('control_wait', { next: 'b6', parent: 'b4', inputs: { DURATION: numIn(1) } }),
            b6: makeBlock('motion_turnright', { next: null, parent: 'b5', inputs: { DEGREES: numIn(60) } }),
            b7: makeBlock('pen_penUp', { next: null, parent: 'b3' }),
          },
        },
      ],
    },
    model: {
      targets: [
        {
          isStage: false,
          name: 'ネコ',
          costumeUrl: CAT_COSTUME_URL,
          blocks: {
            m1: makeBlock('event_whenflagclicked', { next: 'm2', topLevel: true }),
            m2: makeBlock('pen_clear', { next: 'm3', parent: 'm1' }),
            m3: makeBlock('pen_penDown', { next: 'm4', parent: 'm2' }),
            m4: makeBlock('control_repeat', {
              next: 'm7',
              parent: 'm3',
              inputs: {
                TIMES: numIn(4),
                SUBSTACK: [2, 'm5'],
              },
            }),
            m5: makeBlock('motion_movesteps', { next: 'm6', parent: 'm4', inputs: { STEPS: numIn(100) } }),
            m6: makeBlock('motion_turnright', { next: null, parent: 'm5', inputs: { DEGREES: numIn(90) } }),
            m7: makeBlock('pen_penUp', { next: null, parent: 'm4' }),
          },
        },
      ],
    },
  },

  arrow_move: {
    label: '矢印キーで動かそう',
    studentLabel: 'サンプル: あなたの作品（矢印キー）',
    modelLabel: 'サンプル: おてほん（矢印キー）',
    student: {
      targets: [
        {
          isStage: false,
          name: 'ネコ',
          costumeUrl: CAT_COSTUME_URL,
          blocks: {
            s1: makeBlock('event_whenflagclicked', { next: 's2', topLevel: true }),
            s2: makeBlock('motion_gotoxy', { next: 's3', parent: 's1', inputs: { X: numIn(0), Y: numIn(0) } }),
            s3: makeBlock('control_forever', { parent: 's2', inputs: { SUBSTACK: [2, 's4'] } }),
            s4: makeBlock('control_if', {
              parent: 's3',
              inputs: {
                CONDITION: [2, 's4_cond'],
                SUBSTACK: [2, 's5'],
              },
            }),
            s4_cond: makeBlock('sensing_keypressed', { parent: 's4', inputs: { KEY_OPTION: [1, 's4_key'] } }),
            s4_key: { opcode: 'sensing_keypressed', shadow: true, fields: { KEY_OPTION: ['right arrow'] }, inputs: {} },
            s5: makeBlock('motion_changexby', { parent: 's4', inputs: { DX: numIn(5) } }),
          },
        },
      ],
    },
    model: {
      targets: [
        {
          isStage: false,
          name: 'ネコ',
          costumeUrl: CAT_COSTUME_URL,
          blocks: {
            m1: makeBlock('event_whenflagclicked', { next: 'm2', topLevel: true }),
            m2: makeBlock('motion_gotoxy', { next: 'm3', parent: 'm1', inputs: { X: numIn(0), Y: numIn(0) } }),
            m3: makeBlock('control_forever', { parent: 'm2', inputs: { SUBSTACK: [2, 'm4'] } }),
            m4: makeBlock('control_if', {
              next: 'm6',
              parent: 'm3',
              inputs: {
                CONDITION: [2, 'm4_cond'],
                SUBSTACK: [2, 'm5'],
              },
            }),
            m4_cond: makeBlock('sensing_keypressed', { parent: 'm4', inputs: { KEY_OPTION: [1, 'm4_key'] } }),
            m4_key: { opcode: 'sensing_keypressed', shadow: true, fields: { KEY_OPTION: ['right arrow'] }, inputs: {} },
            m5: makeBlock('motion_changexby', { parent: 'm4', inputs: { DX: numIn(10) } }),
            m6: makeBlock('control_if', {
              parent: 'm4',
              inputs: {
                CONDITION: [2, 'm6_cond'],
                SUBSTACK: [2, 'm7'],
              },
            }),
            m6_cond: makeBlock('sensing_keypressed', { parent: 'm6', inputs: { KEY_OPTION: [1, 'm6_key'] } }),
            m6_key: { opcode: 'sensing_keypressed', shadow: true, fields: { KEY_OPTION: ['left arrow'] }, inputs: {} },
            m7: makeBlock('motion_changexby', { parent: 'm6', inputs: { DX: numIn(-10) } }),
          },
        },
      ],
    },
  },

  coin_score: {
    label: 'コインでスコアを増やそう',
    studentLabel: 'サンプル: あなたの作品（コイン）',
    modelLabel: 'サンプル: おてほん（コイン）',
    student: {
      targets: [
        {
          isStage: false,
          name: 'ネコ',
          costumeUrl: CAT_COSTUME_URL,
          blocks: {
            c1: makeBlock('event_whenflagclicked', { next: 'c2', topLevel: true }),
            c2: makeBlock('looks_sayforsecs', { next: null, parent: 'c1', inputs: { MESSAGE: strIn('コインを集めよう！'), SECS: numIn(2) } }),
          },
        },
        {
          isStage: false,
          name: 'コイン',
          costumeUrl: COIN_COSTUME_URL,
          blocks: {
            k1: makeBlock('event_whenflagclicked', { next: 'k2', topLevel: true }),
            k2: makeBlock('data_setvariableto', { next: 'k3', parent: 'k1', fields: { VARIABLE: ['スコア'] }, inputs: { VALUE: strIn('10') } }),
            k3: makeBlock('control_forever', { parent: 'k2', inputs: { SUBSTACK: [2, 'k4'] } }),
            k4: makeBlock('control_if', {
              parent: 'k3',
              inputs: { CONDITION: [2, 'k4_cond'], SUBSTACK: [2, 'k5'] },
            }),
            k4_cond: makeBlock('sensing_touchingobject', { parent: 'k4', inputs: { TOUCHINGOBJECTMENU: [1, 'k4_obj'] } }),
            k4_obj: { opcode: 'sensing_touchingobject', shadow: true, fields: { TOUCHINGOBJECTMENU: ['ネコ'] }, inputs: {} },
            k5: makeBlock('data_changevariableby', { next: 'k6', parent: 'k4', fields: { VARIABLE: ['スコア'] }, inputs: { VALUE: numIn(1) } }),
            k6: makeBlock('looks_hide', { next: null, parent: 'k5' }),
          },
        },
      ],
    },
    model: {
      targets: [
        {
          isStage: false,
          name: 'ネコ',
          costumeUrl: CAT_COSTUME_URL,
          blocks: {
            mc1: makeBlock('event_whenflagclicked', { next: 'mc2', topLevel: true }),
            mc2: makeBlock('looks_sayforsecs', { next: null, parent: 'mc1', inputs: { MESSAGE: strIn('コインを集めよう！'), SECS: numIn(2) } }),
          },
        },
        {
          isStage: false,
          name: 'コイン',
          costumeUrl: COIN_COSTUME_URL,
          blocks: {
            mk1: makeBlock('event_whenflagclicked', { next: 'mk2', topLevel: true }),
            mk2: makeBlock('data_setvariableto', { next: 'mk3', parent: 'mk1', fields: { VARIABLE: ['スコア'] }, inputs: { VALUE: strIn('0') } }),
            mk3: makeBlock('control_forever', { parent: 'mk2', inputs: { SUBSTACK: [2, 'mk4'] } }),
            mk4: makeBlock('control_if', {
              parent: 'mk3',
              inputs: { CONDITION: [2, 'mk4_cond'], SUBSTACK: [2, 'mk5'] },
            }),
            mk4_cond: makeBlock('sensing_touchingobject', { parent: 'mk4', inputs: { TOUCHINGOBJECTMENU: [1, 'mk4_obj'] } }),
            mk4_obj: { opcode: 'sensing_touchingobject', shadow: true, fields: { TOUCHINGOBJECTMENU: ['ネコ'] }, inputs: {} },
            mk5: makeBlock('data_changevariableby', { next: 'mk6', parent: 'mk4', fields: { VARIABLE: ['スコア'] }, inputs: { VALUE: numIn(1) } }),
            mk6: makeBlock('sound_play', { next: 'mk7', parent: 'mk5', inputs: { SOUND_MENU: [1, 'mk6_snd'] } }),
            mk6_snd: { opcode: 'sound_play', shadow: true, fields: { SOUND_MENU: ['Coin'] }, inputs: {} },
            mk7: makeBlock('looks_hide', { next: null, parent: 'mk6' }),
          },
        },
      ],
    },
  },
};
})();
