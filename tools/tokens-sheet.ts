// The chartroom's tokens on one page, for looking at: every custom property of
// tokens.ts as the kit sets it (papers, inks, meanings, the quality ladder,
// type, space, strokes, fills, motion), the cut papers of paper.ts, every
// woodcut glyph, and ink.ts's palettes beneath them. Built from the modules
// themselves, so it never drifts from them. node tools/tokens-sheet.ts →
// captures/tokens.html

import { mkdirSync, writeFileSync } from 'node:fs';
import { GLYPHS, type Glyph } from '../src/ui/glyphs.ts';
import {
  BRASS,
  CHARTROOM,
  CUT,
  DEFS,
  DUSK,
  GILT,
  INK,
  LAND,
  LIGHT,
  OFFICE,
  PAPER,
  PARCHMENT,
  PLUMAGE,
  RARITY,
  SHADOW,
  WASH,
  glyph,
} from '../src/ui/ink.ts';
import { PAPER_CSS } from '../src/ui/chartroom/paper.ts';
import { LADDER, TOKENS, UNIT } from '../src/ui/chartroom/tokens.ts';

const OUT = 'captures/tokens.html';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** WCAG contrast of two opaque #rrggbb colours. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const ratio = (fg: string, bg: string) => {
  const r = contrast(fg, bg);
  const grade = r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'large' : 'fail';
  return `<span class="cn ${grade}">${r.toFixed(1)}:1 ${grade}</span>`;
};

/** A token's size in drawn units, and its floor in CSS px if it has one. */
function measure(name: string) {
  const v = TOKENS[name];
  const n = /calc\(([\d.]+) \* var\(--u\)\)/.exec(v);
  const floor = /max\((\d+)px/.exec(v);
  return { u: n ? Number(n[1]) : 0, floor: floor ? Number(floor[1]) : 0 };
}
/** A size's cell: its units and its px at the shown scale (set by the page's script). */
const sized = (name: string) => {
  const { u, floor } = measure(name);
  return `<td class="num">${u}u</td><td class="num px" data-u="${u}" data-floor="${floor}"></td>`;
};

const code = (s: string) => `<code>${esc(s)}</code>`;
const tokenName = (n: string) => code(`--${n}`);

// ── colour sections ─────────────────────────────────────────────────────────

type Row = readonly [token: string, source: string, use: string];

const PAPERS: readonly Row[] = [
  ['paper', 'PAPER', 'the sheet: panels, folios, the page’s papers'],
  [
    'paper-raised',
    'PARCHMENT[0]',
    'a paper on a paper: card, input, letter, popover',
  ],
  [
    'paper-sunk',
    'blend(PAPER, PARCHMENT[2], .5)',
    'a well cut into a sheet: table head, region, track',
  ],
  ['parchment', '#pg gradient', 'hand-cut papers only, never behind a table'],
  ['gilt', 'GILT', 'chosen, hers, won: a row, a segment, a banner'],
  ['plate', 'INK.iron', 'ink laid solid under words: title bar, headline'],
  ['plate-ink', 'CUT', 'words on a plate'],
  ['plate-faint', 'CHARTROOM.plateFaint', 'labels on a plate'],
  ['brass', 'BRASS', 'the round rim of a window onto the world'],
  ['dim', 'SHADOW @ 35%', 'the world round a folio or a modal (G4)'],
];
const INKS: readonly Row[] = [
  ['ink', 'INK.iron', 'text, outlines, figures'],
  ['ink-2', 'CHARTROOM.label', 'labels, captions, a figure’s unit (D6)'],
  ['rule', 'iron @ 20%', 'the line between rows'],
  ['line', 'iron @ 55%', 'inner rules, a track’s edge'],
  ['on-ink', 'INK.white', 'text on a solid ink'],
];
const MEANINGS: readonly Row[] = [
  ['act', 'INK.blue', 'you can do this: a button, a link, the needle'],
  ['harm', 'INK.rubric', 'loss, damage, danger, a refusal, dismiss'],
  ['good', 'INK.green', 'gain, on target, sound'],
  ['warn', 'WASH.ochre', 'under way, caution, running out (ink on it)'],
  ['won', 'INK.gold', 'stars, a win, a place earned'],
  ['won-wash', 'WASH.gold', 'a won thing’s wash'],
  ['storm', 'INK.storm', 'the Storm. Nothing else is violet.'],
  ['note', 'INK.sepia', 'neutral emphasis, no judgement'],
  ['sea', 'WASH.sea', 'the sea behind a face or a globe'],
];
const LADDER_NAMES = ['silver', 'verdigris', 'azurite', 'purpure', 'gold'];
const LADDER_RANGE = ['0–5', '6–9', '10–13', '14–17', '18–20'];
const LADDER_SAMPLE = [4, 8, 12, 16, 19];

const opaque = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

function paperRows() {
  return PAPERS.map(([t, src, use]) => {
    const v = TOKENS[t];
    const onPlate = t.startsWith('plate');
    const chip =
      t === 'plate-ink' || t === 'plate-faint'
        ? `<div class="chip" style="background:var(--plate);color:var(--${t})">Aa 12</div>`
        : t === 'dim'
          ? `<div class="chip dimchip"><div style="background:var(--dim)"></div></div>`
          : `<div class="chip" style="background:var(--${t})"></div>`;
    const cn =
      onPlate && t !== 'plate'
        ? ratio(v, TOKENS.plate)
        : opaque(v) && t !== 'plate' && t !== 'brass'
          ? ratio(TOKENS.ink, v)
          : '';
    return `<tr><td>${chip}</td><td>${tokenName(t)}</td><td>${code(src)}</td><td>${code(opaque(v) ? v : v.length > 30 ? 'gradient' : v)}</td><td>${cn}</td><td class="use">${use}</td></tr>`;
  }).join('');
}
function inkRows() {
  return INKS.map(([t, src, use]) => {
    const v = TOKENS[t];
    const bg = t === 'on-ink' ? 'var(--plate)' : 'transparent';
    const sample =
      t === 'rule' || t === 'line'
        ? `<div class="rulechip" style="border-top:var(--w-fine) solid var(--${t})"></div>`
        : `<div class="inksample" style="color:var(--${t});background:${bg}">Ana Ferreira 1,250</div>`;
    const cn = opaque(v)
      ? t === 'on-ink'
        ? ratio(v, TOKENS.plate)
        : `${ratio(v, TOKENS.paper)} <span class="cnlab">on paper</span><br>${ratio(v, TOKENS['paper-sunk'])} <span class="cnlab">on sunk</span>`
      : '';
    return `<tr><td>${sample}</td><td>${tokenName(t)}</td><td>${code(src)}</td><td>${code(v)}</td><td>${cn}</td><td class="use">${use}</td></tr>`;
  }).join('');
}
function meaningRows() {
  return MEANINGS.map(([t, src, use]) => {
    const v = TOKENS[t];
    const on =
      t === 'warn' || t === 'won-wash' || t === 'sea' ? 'ink' : 'on-ink';
    const fill = `<div class="fillchip" style="background:var(--${t});color:var(--${on})">Renew</div>`;
    const text = `<span class="meantext" style="color:var(--${t})">−340</span>`;
    const cn = `${ratio(TOKENS[on], v)} <span class="cnlab">${on} on it</span><br>${ratio(v, TOKENS.paper)} <span class="cnlab">as text on paper</span>`;
    return `<tr><td>${fill}</td><td>${text}</td><td>${tokenName(t)}</td><td>${code(src)}</td><td>${code(v)}</td><td>${cn}</td><td class="use">${use}</td></tr>`;
  }).join('');
}
function ladderTiles() {
  return LADDER.map((q, i) => {
    const on = i === 1 ? 'on-ink' : 'ink';
    return `<div class="rung">
      <div class="tile" style="background:var(--q${i});border-color:var(--q${i}-rim);color:var(--q${i}-on)">${LADDER_SAMPLE[i]}</div>
      <div class="rimbar" style="background:var(--q${i}-rim)"></div>
      <div class="rungname">q${i} · ${LADDER_NAMES[i]}</div>
      <div class="rungrange">stat ${LADDER_RANGE[i]}</div>
      <div class="rungvals">${code(`--q${i}`)} ${code(q.wash)}<br>${code(`--q${i}-rim`)} ${code(q.rim)}<br>${code(`--q${i}-on`)} ${on}</div>
      <div>${ratio(q.on, q.wash)}</div>
    </div>`;
  }).join('');
}

// ── type, space, strokes ────────────────────────────────────────────────────

const TYPE: readonly [string, string, string, string][] = [
  [
    't-label',
    'italic 500, ink-2, floor 13 px',
    'labels, captions, table heads',
    '<span class="t-label">Contract ends after season 3</span>',
  ],
  [
    't-body',
    'roman 500',
    'text, table cells',
    '<span class="t-body">Sails beside Ana Ferreira since the spring regatta.</span>',
  ],
  [
    't-name',
    'roman 600',
    'a person’s or thing’s name',
    '<span class="t-name">Isabel Cordeiro</span>',
  ],
  [
    't-head',
    'roman 700, capitals, .12em',
    'a panel’s head',
    '<span class="t-head">Abilities</span>',
  ],
  [
    't-title',
    'roman 700, capitals, .14em',
    'the screen’s title, a plate',
    '<span class="t-title cr-plate">Captain</span>',
  ],
  [
    'fig-s',
    'italic 400, old-style',
    'a stat tile',
    '<span class="fig old" style="font-size:var(--fig-s)">14 · 1,250</span>',
  ],
  [
    'fig-m',
    'italic 400, old-style',
    'a key figure in a panel',
    '<span class="fig old" style="font-size:var(--fig-m)">17 · 3,480</span>',
  ],
  [
    'fig-l',
    'italic 400, lining (G2)',
    'the headline figure of a screen',
    '<span class="fig lin" style="font-size:var(--fig-l)">12 · 86.4%</span>',
  ],
  [
    'fig-xl',
    'italic 400, lining',
    'HUD vitals',
    '<span class="fig lin" style="font-size:var(--fig-xl)">218</span>',
  ],
  [
    'fig-xxl',
    'italic 400, lining',
    'HUD counts',
    '<span class="fig lin" style="font-size:var(--fig-xxl)">27</span>',
  ],
];
const typeRows = () =>
  TYPE.map(
    ([t, style, use, sample]) =>
      `<tr><td>${tokenName(t)}</td>${sized(t)}<td class="use">${style}</td><td class="use">${use}</td><td class="sample">${sample}</td></tr>`
  ).join('');

const SPACE: readonly [string, string][] = [
  ['s1', 'inset, a figure’s gap'],
  ['s2', 'inside a control'],
  ['s3', 'between items in a panel'],
  ['s4', 'panel padding; gap between panels'],
  ['s5', 'between groups'],
  ['s6', 'the gutter'],
  ['gutter', 'screen edge to content'],
];
const spaceRows = () =>
  SPACE.map(
    ([t, use]) =>
      `<tr><td>${tokenName(t)}</td>${sized(t)}<td><div class="spacebar" style="width:var(--${t})"></div></td><td class="use">${use}</td></tr>`
  ).join('');
const SIZES: readonly [string, string][] = [
  ['touch', 'least side of anything that takes a tap'],
  ['row', 'a table row'],
  ['row-tap', 'a row that takes a tap'],
];
const sizeRows = () =>
  SIZES.map(
    ([t, use]) =>
      `<tr><td>${tokenName(t)}</td>${sized(t)}<td><div class="sizebox" style="height:var(--${t});width:var(--${t})"></div></td><td class="use">${use}</td></tr>`
  ).join('');
const STROKES: readonly [string, string][] = [
  ['w-hair', 'inner rule (at 55%: --line)'],
  ['w-fine', 'slip outline, bar outline'],
  ['w-rule', 'a folio’s rule, a chosen thing’s outline'],
  ['w-bold', 'bold slip, banner, disc, the screen’s main paper'],
];
const strokeRows = () =>
  STROKES.map(
    ([t, use]) =>
      `<tr><td>${tokenName(t)}</td>${sized(t)}<td><div class="stroke" style="border-top:var(--${t}) solid var(--ink)"></div></td><td class="use">${use}</td></tr>`
  ).join('');

// ── fills, papers, motion ───────────────────────────────────────────────────

const FILLS: readonly [string, string][] = [
  ['stripes', 'work under way: a build, a scout, a design'],
  ['range', 'a value not yet known, in a thin track'],
  ['hatch', 'a value not yet known, in a tile'],
];
const fillCards = () =>
  FILLS.map(
    ([t, use]) =>
      `<figure class="fillcard"><div class="fillbox" style="background:var(--${t})"></div><figcaption>${tokenName(t)}<br><span class="use">${use}</span></figcaption></figure>`
  ).join('') +
  `<figure class="fillcard"><div class="track"><div class="trackfill" style="width:62%;background:var(--q2)"></div><div class="trackrange"></div></div>
    <figcaption>bar <span class="use">(main’s <code>bar</code>): <code>--paper</code> track in <code>--w-fine</code>, a wash @ 85% inset 1.5u; a scouted range hatched</span></figcaption></figure>
   <figure class="fillcard"><div class="track"><div class="trackfill busy" style="width:40%"></div></div>
    <figcaption>busy <span class="use"><code>--stripes</code> as far as the work has got</span></figcaption></figure>`;

const PAPER_KINDS: readonly [string, string, string][] = [
  ['cr-paper', '', 'plain: fine cut, inner rule, shadow'],
  ['cr-paper bold', '', 'bold: the screen’s main paper'],
  ['cr-paper formal', '', 'formal: two rules (contract, modal, folio)'],
  ['cr-paper', 'gilt', 'chosen: gilt fill'],
  ['cr-paper filled press', 'act', 'act button (press it)'],
  ['cr-paper filled press', 'harm', 'harm button (press it)'],
  ['cr-paper flat', 'paper-raised', 'flat: no shadow'],
  ['cr-paper press off', '', 'off: 42%, deaf'],
];
const paperCards = () =>
  PAPER_KINDS.map(([cls, fill, label]) => {
    const style = fill
      ? ` style="--fill:var(--${fill})${cls.includes('filled') ? ';color:var(--on-ink)' : ''}"`
      : '';
    return `<div class="${cls} papercard"${style}><span>${label}</span></div>`;
  }).join('');

const MOTION: readonly [string, string, string][] = [
  ['press', 'a press', 'down'],
  ['quick', 'popover, menu, a tab', 'pop'],
  ['fade', 'a screen in or out; screens never cut', 'fade'],
  ['settle', 'a thing landing: a stamp, a needle, a pip', 'settle'],
];
const motionRows = () =>
  MOTION.map(
    ([t, use, kind]) =>
      `<tr><td>${tokenName(t)}</td><td>${code(TOKENS[t])}</td><td class="use">${use}</td><td><button class="play" data-kind="${kind}" style="--how:var(--${t})"><span class="mover"></span>play</button></td></tr>`
  ).join('');

// ── glyphs and the palettes ─────────────────────────────────────────────────

const glyphs = Object.keys(GLYPHS) as Glyph[];
const glyphCards = () =>
  glyphs
    .map(
      (g) =>
        `<figure class="glyph"><svg viewBox="0 0 72 72" width="72" height="72">${glyph(g, 36, 36, 56)}</svg><svg viewBox="0 0 28 28" width="28" height="28">${glyph(g, 14, 14, 24)}</svg><figcaption>${code(g)}</figcaption></figure>`
    )
    .join('');

const PALETTES: readonly [string, string, Readonly<Record<string, string>>][] =
  [
    ['INK', 'inks', INK],
    ['WASH', 'washes laid over paper', WASH],
    ['single', 'papers and shades', { PAPER, CUT, GILT, BRASS, SHADOW, DUSK }],
    [
      'PARCHMENT',
      'light, middle, edge',
      Object.fromEntries(PARCHMENT.entries()),
    ],
    [
      'RARITY',
      'gun rarities’ inks, 0–4 (rims of the ladder)',
      Object.fromEntries(RARITY.entries()),
    ],
    ['CHARTROOM', 'the chartroom’s own', CHARTROOM],
    ['LAND', 'the minimap’s land', LAND],
    ['LIGHT', 'light on the world: race only, never the office', LIGHT],
    ['PLUMAGE', 'the gull', PLUMAGE],
    ['OFFICE', 'the old office kit: what the chartroom replaces', OFFICE],
  ];
const paletteBlocks = () =>
  PALETTES.map(
    ([name, what, p]) =>
      `<div class="palette"><h3>${code(name)} <span class="use">${what}</span></h3><div class="swatches">${Object.entries(
        p
      )
        .map(
          ([k, v]) =>
            `<div class="sw"><div class="swc" style="background:${v}"></div><div>${code(k)}</div><div class="hex">${v}</div></div>`
        )
        .join('')}</div></div>`
  ).join('');

// ── the page ────────────────────────────────────────────────────────────────

const declared = Object.entries(TOKENS)
  .map(([n, v]) => `--${n}: ${v};`)
  .join(' ');
const count = Object.keys(TOKENS).length;

const CSS = `
.cr { --u: ${UNIT.toFixed(4)}px; ${declared}
  font: 500 var(--t-body)/1.3 var(--face); color: var(--ink); -webkit-font-smoothing: antialiased; }
.cr *, .cr *::before, .cr *::after { box-sizing: border-box; }
${PAPER_CSS}
html { background: var(--paper-sunk, ${PAPER}); }
body { margin: 0; background: ${PAPER}; min-height: 100vh; }
main { max-width: 1180px; margin: 0 auto; padding: 24px 16px 64px; }
header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
h1 { margin: 0; font: 700 28px/1.1 var(--face); letter-spacing: .14em; text-transform: uppercase; }
h1 + p { margin: 6px 0 0; color: var(--ink-2); font-style: italic; }
h2 { font: 700 18px/1.1 var(--face); letter-spacing: .12em; text-transform: uppercase; margin: 0 0 4px; }
h2 + p.rule-note { margin: 0 0 12px; color: var(--ink-2); font-style: italic; font-size: 14px; }
h3 { font: 600 15px var(--face); margin: 0 0 8px; }
section { background: var(--paper-raised); border: 1px solid var(--rule); padding: 18px 18px 20px; margin: 0 0 18px; }
code { font: 13px ui-monospace, Menlo, monospace; background: ${alphaHex(PAPER)}; padding: 1px 4px; white-space: nowrap; }
.use { color: var(--ink-2); font-style: italic; font-size: 14px; }
.wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 15px; }
th { text-align: left; font: italic 500 13px var(--face); color: var(--ink-2); padding: 6px 10px; border-bottom: 1px solid var(--line); background: var(--paper-sunk); }
td { padding: 8px 10px; border-bottom: 1px solid var(--rule); vertical-align: middle; }
td.num { font-variant-numeric: lining-nums tabular-nums; white-space: nowrap; }
.status { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.status div { background: var(--paper); border-left: 4px solid var(--good); padding: 10px 12px; font-size: 15px; }
.status div.part { border-left-color: var(--warn); }
.status div.no { border-left-color: var(--harm); }
.status b { display: block; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 2px; }
.scale { display: inline-flex; border: 1px solid var(--ink); }
.scale button { font: 500 14px var(--face); color: var(--ink); background: var(--paper-raised); border: 0; padding: 8px 12px; min-height: 44px; cursor: pointer; }
.scale button + button { border-left: 1px solid var(--ink); }
.scale button[aria-pressed=true] { background: var(--gilt); font-weight: 700; }
.chip { width: 72px; height: 44px; border: 1px solid var(--line); display: grid; place-items: center; font: italic 18px var(--face); }
.dimchip { background: repeating-linear-gradient(90deg, var(--paper) 0 12px, var(--act) 12px 24px); position: relative; }
.dimchip div { position: absolute; inset: 0; }
.rulechip { width: 120px; }
.inksample { font-size: 17px; padding: 4px 8px; white-space: nowrap; }
.fillchip { padding: 8px 14px; font: 600 16px var(--face); display: inline-block; white-space: nowrap; }
.meantext { font: italic 400 26px var(--face); font-variant-numeric: lining-nums; }
.cn { font: 12px ui-monospace, Menlo, monospace; padding: 1px 5px; white-space: nowrap; }
.cn.AAA, .cn.AA { background: ${alphaHex(INK.green, 0.15)}; }
.cn.large { background: ${alphaHex(WASH.ochre, 0.3)}; }
.cn.fail { background: ${alphaHex(INK.rubric, 0.2)}; }
.cnlab { font-size: 12px; color: var(--ink-2); }
.ladder { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; }
.tile { height: 88px; display: grid; place-items: center; border: var(--w-rule) solid; font: italic 400 var(--fig-s) var(--face); font-variant-numeric: oldstyle-nums; }
.rimbar { height: 6px; margin: 6px 0; }
.rungname { font-weight: 700; }
.rungrange, .rungvals { color: var(--ink-2); font-size: 14px; margin: 2px 0 6px; line-height: 1.7; }
.sample { white-space: nowrap; }
.t-label { font: italic 500 var(--t-label) var(--face); color: var(--ink-2); }
.t-body { font: 500 var(--t-body)/1.3 var(--face); }
.t-name { font: 600 var(--t-name) var(--face); }
.t-head { font: 700 var(--t-head) var(--face); letter-spacing: .12em; text-transform: uppercase; }
.t-title { display: inline-block; }
.fig { font-family: var(--face); font-style: italic; font-weight: 400; line-height: 1; }
.fig.old { font-variant-numeric: oldstyle-nums proportional-nums; }
.fig.lin { font-variant-numeric: lining-nums proportional-nums; }
.column { display: inline-grid; grid-template-columns: auto auto; gap: 2px 18px; font: 500 var(--t-body) var(--face); font-variant-numeric: lining-nums tabular-nums; }
.column span:nth-child(even) { text-align: right; }
.spacebar { height: 14px; background: var(--act); }
.sizebox { border: var(--w-fine) solid var(--ink); background: var(--paper); }
.stroke { width: 220px; }
.fills { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
.fillcard { margin: 0; }
.fillbox { height: 72px; border: var(--w-fine) solid var(--ink); }
.fillcard figcaption { margin-top: 6px; font-size: 14px; }
.track { position: relative; height: calc(10 * var(--u)); margin: 31px 0; background: var(--paper); border: var(--w-fine) solid var(--ink); }
.trackfill { position: absolute; left: calc(1.5 * var(--u)); top: calc(1.5 * var(--u)); bottom: calc(1.5 * var(--u)); opacity: .85; }
.trackfill.busy { background: var(--stripes); opacity: 1; }
.trackrange { position: absolute; left: 62%; width: 22%; top: 0; bottom: 0; background: var(--range); }
.papers { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 28px; padding: 8px; }
.papercard { min-height: 96px; display: grid; place-items: center; text-align: center; padding: 18px; font: 600 15px var(--face); }
.papercard.press { cursor: pointer; user-select: none; }
.play { position: relative; font: 500 14px var(--face); min-width: 140px; min-height: 44px; border: var(--w-fine) solid var(--ink); background: var(--paper); color: var(--ink); cursor: pointer; padding: 0 12px 0 52px; text-align: left; }
.mover { position: absolute; left: 12px; top: 10px; width: 24px; height: 24px; background: var(--act); transition: transform var(--how), opacity var(--how); }
.play.on[data-kind=down] .mover { transform: translateY(6px); }
.play.on[data-kind=pop] .mover { transform: scale(1.35); }
.play.on[data-kind=fade] .mover { opacity: 0; }
.play.on[data-kind=settle] .mover { transform: rotate(45deg); }
.glyphs { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
.glyph { margin: 0; background: ${CUT}; border: 1px solid var(--rule); padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.glyph svg { overflow: visible; }
.palettes { display: grid; gap: 18px; }
.swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
.sw { font-size: 13px; }
.swc { height: 40px; border: 1px solid var(--rule); margin-bottom: 4px; }
.hex { font: 12px ui-monospace, Menlo, monospace; color: var(--ink-2); }
nav.toc { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0 0 18px; font-size: 15px; }
nav.toc a { color: var(--act); }
@media (max-width: 640px) { main { padding: 16px; } .use { font-size: 13px; } }
`;

function alphaHex(hex: string, a = 0.6) {
  return `${hex}${Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

const SECTIONS = [
  ['scale', 'Scale'],
  ['papers', 'Papers'],
  ['inks', 'Inks'],
  ['meaning', 'Meaning'],
  ['ladder', 'Quality ladder'],
  ['type', 'Type'],
  ['space', 'Space'],
  ['strokes', 'Strokes'],
  ['edges', 'Cut papers'],
  ['fills', 'Fills'],
  ['motion', 'Motion'],
  ['glyphs', 'Glyphs'],
  ['palettes', 'ink.ts palettes'],
] as const;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chartroom Tokens</title><style>${CSS}</style></head>
<body class="cr"><svg width="0" height="0" style="position:absolute">${DEFS}</svg><main>
<header><div><h1>Chartroom tokens</h1><p>Every value from <code>src/ui/chartroom/tokens.ts</code> and <code>src/ui/ink.ts</code>, generated by <code>tools/tokens-sheet.ts</code>.</p></div>
<div class="scale" role="group" aria-label="Scale"><button data-u="${UNIT.toFixed(4)}" aria-pressed="true">iPad office · 1u = ${UNIT.toFixed(3)} px</button><button data-u="1" aria-pressed="false">1u = 1 px</button></div></header>

<section><h2>What’s built</h2><div class="status">
<div><b>Built</b>${count} custom properties in <code>TOKENS</code>, every colour read from <code>ink.ts</code>: scale, papers, inks, meanings, the ladder (q0–q4 × wash, rim, on), type, space, strokes, fills, motion.</div>
<div><b>Built as a kit piece, not a token</b><code>--edge-cut</code>, <code>--rule-in</code>, <code>--rule-twice</code>, <code>--shadow</code> are the cut tiles of <code>paper.ts</code> (<code>--cut-*</code> border images). <code>--cut</code> is in <code>TONE</code> only.</div>
<div class="part"><b>Glyphs</b>${glyphs.length} woodcuts drawn; UI-TOKENS.md D9 asks for about 45 subjects (tabs, parts, buildings, roles, mail kinds).</div>
<div class="no"><b>Not built</b><code>--team</code> / <code>--team-2</code> (livery dyes) and <code>--halo</code> (HUD only, <code>figure({ halo })</code>).</div>
</div></section>

<nav class="toc">${SECTIONS.map(([id, name]) => `<a href="#${id}">${name}</a>`).join('')}</nav>

<section id="scale"><h2>Scale</h2><p class="rule-note">Every size is drawn units × <code>--u</code>. On the office page 1u = size(1180, 820) = ${UNIT.toFixed(4)} px. Floors in CSS px where a size must not shrink.</p>
<div class="wrap"><table><tr><th>token</th><th>units</th><th>px now</th><th>shown</th><th>use</th></tr>${sizeRows()}</table></div></section>

<section id="papers"><h2>Papers</h2><p class="rule-note">Four papers and the plate. Nothing else fills a panel. Contrast is iron ink on the paper, or the ink on the plate.</p>
<div class="wrap"><table><tr><th></th><th>token</th><th>from</th><th>value</th><th>contrast</th><th>use</th></tr>${paperRows()}</table></div></section>

<section id="inks"><h2>Inks</h2><p class="rule-note">Text and lines.</p>
<div class="wrap"><table><tr><th>sample</th><th>token</th><th>from</th><th>value</th><th>contrast</th><th>use</th></tr>${inkRows()}</table></div></section>

<section id="meaning"><h2>Meaning</h2><p class="rule-note">A meaning ink on a thing says the thing’s meaning. Decoration never uses one.</p>
<div class="wrap"><table><tr><th>filled</th><th>as text</th><th>token</th><th>from</th><th>value</th><th>contrast</th><th>means</th></tr>${meaningRows()}</table></div></section>

<section id="ladder"><h2>Quality ladder</h2><p class="rule-note">Washes, not inks: magnitude, no judgement. A stat of 4 is silver, not red. Text on a wash is <code>--fig-s</code> and up only.</p>
<div class="ladder">${ladderTiles()}</div></section>

<section id="type"><h2>Type</h2><p class="rule-note">One face: ${code('Iowan Old Style, Palatino, Georgia')}. Lone figures italic old-style to <code>--fig-m</code>, lining from <code>--fig-l</code> (G2). Nothing under 13 px.</p>
<div class="wrap"><table><tr><th>token</th><th>units</th><th>px now</th><th>style</th><th>use</th><th>sample</th></tr>${typeRows()}</table></div>
<p class="use" style="margin:14px 0 6px">Figures in a column: roman, tabular lining.</p>
<div class="column"><span>Prize money</span><span>12,480</span><span>Wages</span><span>−3,115</span><span>Repairs</span><span>−870</span><span>Balance</span><span>8,495</span></div></section>

<section id="space"><h2>Space</h2>
<div class="wrap"><table><tr><th>token</th><th>units</th><th>px now</th><th>shown</th><th>use</th></tr>${spaceRows()}</table></div></section>

<section id="strokes"><h2>Strokes</h2><p class="rule-note">Paper things are hand-cut; data is ruled. Nothing has rounded corners.</p>
<div class="wrap"><table><tr><th>token</th><th>units</th><th>px now</th><th>shown</th><th>use</th></tr>${strokeRows()}
<tr><td>${tokenName('rule')}</td><td></td><td></td><td><div class="stroke" style="border-top:var(--w-fine) solid var(--rule)"></div></td><td class="use">the line between rows (iron @ 20%)</td></tr>
<tr><td>${tokenName('line')}</td><td></td><td></td><td><div class="stroke" style="border-top:var(--w-fine) solid var(--line)"></div></td><td class="use">inner rules, a track’s edge (iron @ 55%)</td></tr>
</table></div></section>

<section id="edges"><h2>Cut papers</h2><p class="rule-note">paper.ts: one drawn tile sliced nine ways as a border image and a mask; its shadow a layer of its own, so a pressed paper loses its shadow and keeps its edge. Press the buttons.</p>
<div class="papers">${paperCards()}</div></section>

<section id="fills"><h2>Fills</h2>
<div class="fills">${fillCards()}</div></section>

<section id="motion"><h2>Motion</h2><p class="rule-note">Opacity and transform only. Tap play to run each curve.</p>
<div class="wrap"><table><tr><th>token</th><th>value</th><th>use</th><th></th></tr>${motionRows()}</table></div></section>

<section id="glyphs"><h2>Glyphs</h2><p class="rule-note">${glyphs.length} woodcuts from glyphs.ts, at 56 (dense hatch) and 24 units.</p>
<div class="glyphs">${glyphCards()}</div></section>

<section id="palettes"><h2>ink.ts palettes</h2><p class="rule-note">The raw constants the tokens are named onto.</p>
<div class="palettes">${paletteBlocks()}</div></section>
</main>
<script>
const body = document.body;
function setScale(u) {
  body.style.setProperty('--u', u + 'px');
  for (const td of document.querySelectorAll('.px')) {
    const n = Number(td.dataset.u), floor = Number(td.dataset.floor);
    const px = Math.max(n * u, floor);
    td.textContent = n ? px.toFixed(1) + ' px' + (floor && floor >= n * u ? ' (floor)' : '') : '';
  }
  for (const b of document.querySelectorAll('.scale button')) b.setAttribute('aria-pressed', String(b.dataset.u == u));
}
for (const b of document.querySelectorAll('.scale button')) b.addEventListener('click', () => setScale(Number(b.dataset.u)));
setScale(${UNIT.toFixed(4)});
for (const b of document.querySelectorAll('.play')) b.addEventListener('click', () => {
  b.classList.add('on');
  setTimeout(() => b.classList.remove('on'), 700);
});
</script></body></html>
`;

mkdirSync('captures', { recursive: true });
writeFileSync(OUT, html);
console.log(`${OUT}: ${count} tokens, ${glyphs.length} glyphs`);
