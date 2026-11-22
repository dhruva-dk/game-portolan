// The kit's look, one stylesheet set into the page once (kitStyle): parchment
// panels with inked borders, navy for the strip and nav, the fills that say what
// a thing is. Every colour is ink.ts's, read here as custom properties so a
// screen's own layout names none; every size is the office's type scale (TYPE),
// nothing under 13 px; every control 44 px to the touch.

import {
  FIGURES,
  INK,
  NARROW,
  OFFICE,
  SANS,
  SHADOW,
  TYPE,
  alpha,
  blend,
} from '../ink.ts';

/** Stylesheets already set into the page, by their text. */
const set = new Set<string>();

/** Sets `css` into the page, once however often it is asked. */
export function stylesheet(css: string) {
  if (set.has(css)) return;
  set.add(css);
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

/** The hazard stripes of work under way: the warn fill and a deeper one. */
const STRIPES = `repeating-linear-gradient(-45deg, ${OFFICE.warn} 0 9px, ${blend(OFFICE.warn, OFFICE.ink, 0.22)} 9px 18px)`;

const CSS = `
.office { --bar: ${OFFICE.bar}; --chip: ${OFFICE.chip}; --bar-ink: ${OFFICE.barInk}; --bar-faint: ${OFFICE.barFaint};
  --panel: ${OFFICE.panel}; --dark: ${OFFICE.dark}; --light: ${OFFICE.light}; --ink: ${OFFICE.ink}; --faint: ${OFFICE.faint};
  --on-fill: ${OFFICE.onFill}; --go: ${OFFICE.go}; --bad: ${OFFICE.bad}; --good: ${OFFICE.good}; --fair: ${OFFICE.fair};
  --warn: ${OFFICE.warn}; --gold: ${OFFICE.gold}; --on: ${OFFICE.on}; --rule: ${alpha(OFFICE.ink, 0.18)};
  --track: ${alpha(OFFICE.ink, 0.12)}; --shade: ${alpha(SHADOW, 0.4)}; --plate: ${alpha(OFFICE.bar, 0.84)};
  --stripes: ${STRIPES}; --serif: ${FIGURES}; --narrow: ${NARROW};
  font: 500 ${TYPE.body}px/1.25 ${SANS}; color: var(--ink); font-variant-numeric: tabular-nums lining-nums;
  -webkit-font-smoothing: antialiased; cursor: default; }
.office *, .office *::before, .office *::after { box-sizing: border-box; }
.office .k-icon { flex: none; }
.office .off { opacity: .42; }
.office .off, .office .off * { cursor: default; }
.office .num { text-align: right; white-space: nowrap; }
.office .serif { font-family: var(--serif); }

.t-go { --tone: var(--go); --on-tone: var(--on-fill); }
.t-bad { --tone: var(--bad); --on-tone: var(--on-fill); }
.t-good { --tone: var(--good); --on-tone: var(--on-fill); }
.t-fair { --tone: var(--fair); --on-tone: var(--on-fill); }
.t-warn { --tone: var(--warn); --on-tone: var(--ink); }
.t-gold { --tone: var(--gold); --on-tone: var(--ink); }

/* a panel: parchment, inked, ruled inside its edge; its title in the condensed caps; its body the screen's */
.k-panel { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--panel);
  border: 1.5px solid var(--ink); box-shadow: inset 0 0 0 3px var(--panel), inset 0 0 0 4px var(--rule), 0 2px 0 var(--shade); }
.k-head { position: relative; flex: none; padding: 13px 44px 9px; text-align: center; font: 600 ${TYPE.head}px/1.1 var(--narrow);
  letter-spacing: .1em; text-transform: uppercase; }
.k-head > .k-aside { position: absolute; right: 10px; top: 0; height: 100%; display: flex; align-items: center; gap: 6px;
  font: 500 ${TYPE.small}px ${SANS}; letter-spacing: 0; text-transform: none; color: var(--faint); }
.k-body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0 12px 12px; }
.k-band { flex: none; background: var(--dark); padding: 4px 8px; text-align: center; font-size: ${TYPE.small}px; color: var(--faint); }
.k-mark { width: 24px; height: 24px; display: grid; place-items: center; background: var(--dark); color: var(--faint); }

/* a button: go (the kit's blue), plain, danger, and the one way on */
.k-btn { height: 44px; min-width: 44px; padding: 0 16px; display: inline-flex; align-items: center; justify-content: center;
  gap: 8px; flex: none; background: var(--go); color: var(--on-fill); border: 1.5px solid var(--ink);
  font: 600 ${TYPE.body}px ${SANS}; letter-spacing: .01em; white-space: nowrap; }
.k-btn.plain { background: var(--light); color: var(--ink); }
.k-btn.danger { background: var(--bad); }
.k-btn.on { background: var(--on); }
.k-btn.wide { display: flex; width: 100%; }

/* a choice of a few, side by side: the chosen filled; wide, a tab strip across its panel */
.k-seg { display: inline-flex; flex: none; background: var(--dark); border: 1.5px solid var(--ink); }
.k-seg > div { height: 41px; min-width: 88px; padding: 0 16px; display: grid; place-items: center; color: var(--faint);
  white-space: nowrap; }
.k-seg > div + div { border-left: 1px solid var(--rule); }
.k-seg > .chosen { background: var(--go); color: var(--on-fill); font-weight: 600; }
.k-seg.wide { display: flex; }
.k-seg.wide > div { flex: 1; min-width: 0; }

/* a chip that opens a list under it */
.k-drop { position: relative; height: 44px; min-width: 44px; padding: 0 10px 0 14px; display: inline-flex; align-items: center;
  justify-content: center; gap: 6px; flex: none; background: var(--dark); white-space: nowrap; }
.k-drop.wide { display: flex; }
.k-menu { position: absolute; z-index: 20; left: 0; top: 100%; min-width: 100%; background: var(--light);
  border: 1.5px solid var(--ink); box-shadow: 0 3px 0 var(--shade); }
.k-menu > div { height: 44px; padding: 0 14px; display: flex; align-items: center; white-space: nowrap; }
.k-menu > div + div { border-top: 1px solid var(--rule); }
.k-menu > .chosen { font-weight: 700; color: var(--go); }
.k-catch { position: absolute; z-index: 19; inset: 0; }

/* a value stepped down or up */
.k-step { display: inline-flex; align-items: stretch; align-self: flex-start; flex: none; height: 44px;
  border: 1.5px solid var(--ink); background: var(--light); }
.k-step > .k-arrow { width: 44px; display: grid; place-items: center; background: var(--go); color: var(--on-fill); }
.k-step > .k-value { flex: 1; min-width: 96px; padding: 0 12px; display: grid; place-items: center; font-weight: 600;
  white-space: nowrap; }

/* a stat's tile: its name over its figure, on its tone, the lighter part its share of the best */
.k-tile { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 7px 6px 8px; background: var(--dark); }
.k-tile > .k-name { text-align: center; font-size: ${TYPE.small}px; color: var(--faint); white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; }
.k-tile > .k-fig { position: relative; height: 42px; display: grid; place-items: center; overflow: hidden; background: var(--tone);
  color: var(--on-tone); border: 1.5px solid var(--ink); font: 500 25px/1 ${SANS}; }
.k-tile > .k-fig::before { content: ''; position: absolute; inset: 0 0 0 var(--share); background: var(--ink); opacity: .2; }
.k-tile > .k-fig::after { content: ''; position: absolute; inset: 2px; border: 1px solid var(--on-fill); opacity: .35; }
.k-tile > .k-fig > span { position: relative; }
.k-tile.unknown > .k-fig { background: var(--panel); color: var(--ink); font-size: 19px; }
.k-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }

/* stars: five, by halves; the possible past the known shown hollow */
.k-stars { display: inline-flex; flex: none; vertical-align: middle; }

/* a meter: a track and its share of it */
.k-meter { position: relative; flex: none; height: 10px; background: var(--track); }
.k-meter > i { position: absolute; left: 0; top: 0; bottom: 0; width: var(--share); background: var(--tone, var(--go)); }

/* a word on a tone: filled; boxed, a stamp; bare, the word alone */
.k-tag { display: inline-block; flex: none; padding: 2px 8px; background: var(--tone); color: var(--on-tone);
  font: 700 ${TYPE.small}px/1.4 var(--narrow); letter-spacing: .09em; text-transform: uppercase; white-space: nowrap; }
.k-tag.boxed { padding: 5px 14px; background: none; color: var(--tone); border: 2px solid var(--tone); font-size: ${TYPE.head}px; }
.k-tag.bare { padding: 0; background: none; color: var(--tone); font-size: ${TYPE.head}px; }
.t-warn.k-tag.boxed, .t-warn.k-tag.bare, .t-gold.k-tag.boxed, .t-gold.k-tag.bare { color: ${blend(OFFICE.warn, OFFICE.ink, 0.35)}; }

/* a round frame, the gull in it */
.k-face { position: relative; flex: none; border-radius: 50%; overflow: hidden; background: var(--chip);
  border: 1.5px solid var(--ink); box-shadow: inset 0 0 0 2px var(--panel); }
.k-face > svg, .k-face > img { position: absolute; left: 0; top: 0; border-radius: 50%; }

/* the dial: a half disc, its needle on a share of it, a word at each end */
.k-dial { display: inline-flex; flex-direction: column; align-items: center; align-self: center; flex: none; }
.k-dial > .k-ends { display: flex; justify-content: space-between; align-self: stretch; margin-top: 2px;
  font-size: ${TYPE.small}px; color: var(--faint); }

/* the bar chart: a bar a thing, by its tone; the best a line across, the average a mark at its side */
.k-bars { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.k-bars > .k-key { display: flex; justify-content: space-between; align-items: center; padding: 0 2px 5px;
  border-bottom: 1.5px solid var(--ink); font-size: ${TYPE.small}px; }
.k-bars > .k-key > span { display: inline-flex; align-items: center; gap: 6px; }
.k-bars .k-best { display: inline-block; width: 14px; height: 3px; background: var(--go); }
.k-bars .k-avg { display: inline-block; width: 0; height: 0; border: 6px solid transparent; border-left: 0;
  border-right: 9px solid var(--ink); }
.k-bars > .k-plot { flex: 1; min-height: 0; display: flex; align-items: stretch; }
.k-bars .k-col { position: relative; flex: 1; margin: 0 1px; background: linear-gradient(var(--track), transparent); }
.k-bars .k-col > i { position: absolute; left: 22%; right: 22%; bottom: 0; height: var(--share); background: var(--tone);
  border: 1.5px solid var(--ink); border-bottom: 0; }
.k-bars .k-col > .k-best { position: absolute; left: 12%; right: 12%; bottom: var(--at); width: auto; margin-bottom: -1.5px; }
.k-bars .k-col > .k-avg { position: absolute; right: 2%; bottom: var(--at); margin-bottom: -6px; }
.k-bars > .k-names { display: flex; border-top: 1.5px solid var(--ink); }
.k-bars > .k-names > div { flex: 1; padding: 7px 0 0; text-align: center; font: 600 ${TYPE.small}px var(--narrow);
  letter-spacing: .05em; white-space: nowrap; }

/* a job under way: the row is its bar, striped as far as it has got; who or what, the days left, what may be done */
.k-job { position: relative; flex: none; height: 52px; display: flex; align-items: center; gap: 8px; padding: 0 4px 0 8px;
  background: var(--dark); border: 1px solid var(--rule); }
.k-job > i { position: absolute; left: 0; top: 0; bottom: 0; width: var(--share); background: var(--stripes); }
.k-job > * { position: relative; }
.k-job > .k-who { display: flex; align-items: center; gap: 8px; padding: 4px 10px; min-width: 0; background: var(--plate);
  color: var(--bar-ink); font-size: ${TYPE.small}px; white-space: nowrap; }
.k-job > .k-who > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.k-job > .k-days { flex: none; margin-left: auto; padding: 0 4px; font-weight: 600; white-space: nowrap; }
.k-job > .k-btn { padding: 0 12px; }

/* a table: a small header, ruled rows, the list scrolling inside its panel; a row's colour bar; her own row lit */
.k-table { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.k-tr { position: relative; display: grid; align-items: center; column-gap: 10px; padding: 0 10px 0 16px; }
.k-th { flex: none; min-height: 26px; background: var(--dark); font-size: ${TYPE.small}px; color: var(--faint); }
.k-th.sorts { min-height: 44px; }
.k-th > div { display: flex; align-items: center; gap: 2px; align-self: stretch; white-space: nowrap; }
.k-th > .num { justify-content: flex-end; }
.k-th > .sorted { color: var(--ink); font-weight: 700; }
.k-rows { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; }
.k-rows > .k-tr { border-bottom: 1px solid var(--rule); }
.k-rows > .k-tr > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.k-rows > .k-tr > i { position: absolute; left: 0; top: 3px; bottom: 3px; width: 5px; background: var(--team); }
.k-rows > .k-tr.own { background: var(--light); font-weight: 700; box-shadow: inset 0 0 0 1.5px var(--ink); }
.k-rows > .k-tr.cut { border-bottom: 2px solid var(--bad); }

/* a card: a picture with a headline's plate on it, and a foot with its way on */
.k-card { position: relative; display: flex; flex-direction: column; min-height: 0; overflow: hidden; background: var(--light);
  border: 1.5px solid var(--ink); }
.k-card > .k-art { position: relative; flex: 1; min-height: 96px; overflow: hidden; background: var(--light); }
.k-card > .k-art > .k-slash { position: absolute; top: -10%; bottom: -10%; background: var(--team); transform: skewX(-24deg); }
.k-card > .k-art > .k-pic { position: absolute; left: 6%; top: 0; bottom: 0; width: 38%; display: grid; place-items: center;
  color: var(--ink); }
.k-card .k-plate { position: absolute; right: 12px; top: 14px; padding: 5px 16px; background: var(--plate); color: var(--bar-ink);
  font: 700 ${TYPE.head}px/1.2 var(--narrow); letter-spacing: .1em; text-transform: uppercase; }
.k-card .k-what { position: absolute; right: 12px; top: 58px; width: 52%; text-align: center; font-weight: 600; }
.k-card > .k-foot { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 6px 8px 6px 14px; background: var(--plate); color: var(--bar-ink); }

/* a dialog: the page dimmed, a panel in its middle, its ways on at its foot */
.k-veil { position: absolute; z-index: 40; inset: 0; display: grid; place-items: center; background: ${alpha(INK.iron, 0.55)}; }
.k-dialog { min-width: 420px; max-width: 720px; }
.k-dialog > .k-foot { flex: none; display: flex; justify-content: flex-end; gap: 12px; padding: 10px 12px 12px; }
`;

/** Sets the kit's stylesheet into the page, once. */
export const kitStyle = () => stylesheet(CSS);
