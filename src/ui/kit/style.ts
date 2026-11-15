// The kit's look, one stylesheet set into the page once (kitStyle). Every colour is ink.ts's; every size the office's
// type scale (TYPE: 28, 20, 16, 13, nothing smaller). Square corners, no shadows, no sans: papers on a desk, ruled.

import { DESK, FACE, INK, MOTION, PALE, PAPER, TEXT, TYPE } from '../ink';

/** The iron ink at an alpha, for rules finer than a line. */
const iron = (a: number) => INK.iron.replace('rgb(', 'rgba(').replace(')', `,${a})`);

const CSS = `
.office { position: absolute; left: 0; top: 0; width: 1180px; height: 820px; transform-origin: 0 0; overflow: hidden;
  background: ${DESK}; color: ${TEXT.iron}; font-family: ${FACE}; font-size: ${TYPE.body}px; line-height: 1.3;
  font-variant-numeric: tabular-nums lining-nums; pointer-events: auto; }
.office * { box-sizing: border-box; }
.office .small { font-size: ${TYPE.small}px; }
.office .faint { color: ${TEXT.faint}; }
.office .harm { color: ${TEXT.harm}; }
.office .good { color: ${TEXT.good}; }
.office .num { text-align: right; font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
.office .caps { font-variant: small-caps; letter-spacing: .04em; }
.office b, .office .bold { font-weight: 700; }
.office .off { opacity: .45; }
.office .off, .office .off * { cursor: default; }
.office .title { font-size: ${TYPE.title}px; font-variant: small-caps; letter-spacing: .03em; line-height: 1.1; }
.office .grid { position: absolute; left: 16px; top: 80px; width: 1148px; height: 724px; }
.office .grid > * { position: absolute; }

.k-panel { background: ${PAPER}; border: 1.5px solid ${INK.iron}; display: flex; flex-direction: column; overflow: hidden; }
.k-panel::after { content: ''; position: absolute; inset: 3px; border: .5px solid ${iron(0.4)}; pointer-events: none; }
.k-panel { position: absolute; }
.k-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 8px 14px 6px;
  border-bottom: 1px solid ${INK.iron}; margin: 0 4px; font-size: ${TYPE.heading}px; font-variant: small-caps; letter-spacing: .04em; }
.k-head .k-note { font-size: ${TYPE.small}px; color: ${TEXT.faint}; letter-spacing: .02em; }
.k-body { position: relative; flex: 1; padding: 10px 14px; overflow: hidden; }

.k-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-width: 44px; min-height: 44px;
  padding: 0 16px; background: ${PAPER}; color: ${TEXT.iron}; border: 1.5px solid ${INK.iron}; font: inherit;
  font-size: ${TYPE.body}px; font-variant: small-caps; letter-spacing: .05em; white-space: nowrap; }
.k-btn.primary { background: ${INK.iron}; color: ${INK.white}; }
.k-btn.danger { color: ${TEXT.harm}; border: 3px double ${TEXT.harm}; }
.k-btn.quiet { border-color: transparent; text-decoration: underline; text-underline-offset: 4px; }
.k-btn svg { flex: none; }

.k-subtabs { display: flex; gap: 8px; border-bottom: 1px solid ${INK.iron}; }
.k-subtab { min-height: 44px; min-width: 88px; padding: 10px 14px 6px; font-variant: small-caps; letter-spacing: .05em;
  border-bottom: 4px solid transparent; text-align: center; }
.k-subtab.open { border-bottom-color: var(--crew, ${INK.iron}); font-weight: 700; }

.k-seg { display: inline-flex; border: 1.5px solid ${INK.iron}; background: ${PAPER}; }
.k-seg > div { min-height: 44px; min-width: 44px; padding: 10px 14px 0; text-align: center; font-variant: small-caps; letter-spacing: .04em; }
.k-seg > div + div { border-left: 1px solid ${INK.iron}; }
.k-seg > div.on { background: ${INK.iron}; color: ${INK.white}; }

.k-table { display: flex; flex-direction: column; height: 100%; }
.k-tr { display: grid; align-items: center; column-gap: 12px; padding: 0 8px; border-bottom: .5px solid ${iron(0.35)}; }
.k-th { font-size: ${TYPE.small}px; color: ${TEXT.faint}; font-variant: small-caps; letter-spacing: .05em; min-height: 28px; border-bottom: 1px solid ${INK.iron}; }
.k-rows { position: relative; flex: 1; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; }
.k-rows .k-tr { position: absolute; left: 0; right: 0; }
.k-tr.sel { background: ${PALE.sand}; }
.k-tr.mine { font-weight: 700; }
.k-tr > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.k-face { display: block; flex: none; }
.k-stars { display: inline-flex; gap: 1px; vertical-align: middle; }

.k-stat { display: grid; grid-template-columns: 1fr 120px 44px; align-items: center; gap: 10px; min-height: 26px; }
.k-bar { position: relative; height: 12px; border: 1px solid ${INK.iron}; background: ${PAPER}; }
.k-bar > i { position: absolute; left: 1px; top: 1px; bottom: 1px; width: 0; transition: width ${MOTION.bar}ms ease-out; }
.k-bar > b { position: absolute; top: -4px; bottom: -4px; width: 0; border-left: 2px solid ${INK.iron}; }

.k-meter { display: grid; grid-template-columns: 1fr auto; row-gap: 4px; align-items: baseline; }
.k-meter .k-bar { grid-column: 1 / 3; height: 14px; }

.k-fig { display: inline-grid; grid-template-columns: auto; row-gap: 0; }
.k-fig .v { font-size: ${TYPE.heading}px; font-weight: 700; text-align: right; }
.k-fig .c { font-size: ${TYPE.small}px; color: ${TEXT.faint}; text-align: right; }
.k-fig.press .v { text-decoration: underline dotted; text-underline-offset: 4px; }

.k-slip { position: absolute; z-index: 30; min-width: 240px; max-width: 360px; background: ${PAPER}; border: 1.5px solid ${INK.iron}; padding: 10px 14px; }
.k-slip h4 { margin: 0 0 6px; font-size: ${TYPE.body}px; font-weight: 700; font-variant: small-caps; letter-spacing: .04em; border-bottom: 1px solid ${INK.iron}; }
.k-slip .l { display: grid; grid-template-columns: 1fr auto; gap: 12px; }
.k-slip .l.sum { border-top: 1px solid ${INK.iron}; margin-top: 4px; font-weight: 700; }

.k-coin { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; }
.k-coin.neg { color: ${TEXT.harm}; }

.k-tag { display: inline-block; font-size: ${TYPE.small}px; font-variant: small-caps; letter-spacing: .06em; padding: 0 6px;
  border: 1px solid currentColor; line-height: 18px; margin: 0 4px 2px 0; }
.k-tag.good { color: ${TEXT.good}; } .k-tag.harm { color: ${TEXT.harm}; } .k-tag.sea { color: ${TEXT.sea}; }

.k-plate, .k-card, .k-letter, .k-contract { position: relative; background: ${PAPER}; border: 1px solid ${INK.iron}; padding: 8px 12px; }
.k-plate { display: grid; grid-template-columns: 40px 1fr; column-gap: 10px; row-gap: 4px; }
.k-plate .k-stat { grid-column: 1 / 3; }
.k-card { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; align-items: start; }
.k-card .lines { display: grid; grid-template-columns: 1fr auto; column-gap: 12px; }
.k-letter { border-left: 6px double ${INK.iron}; }
.k-letter.unread .subj { font-weight: 700; }
.k-letter .seal { color: ${TEXT.harm}; }
.k-letter .meta { display: flex; justify-content: space-between; font-size: ${TYPE.small}px; color: ${TEXT.faint}; }
.k-contract { border: 3px double ${INK.iron}; padding: 14px 18px; }
.k-contract h4 { margin: 0 0 8px; text-align: center; font-size: ${TYPE.heading}px; font-variant: small-caps; letter-spacing: .06em; }
.k-contract .l { display: grid; grid-template-columns: 1fr auto; border-bottom: .5px dotted ${INK.iron}; padding: 2px 0; }
.k-contract .sign { display: flex; justify-content: space-between; margin-top: 18px; gap: 24px; }
.k-contract .sign > div { flex: 1; border-top: 1px solid ${INK.iron}; padding-top: 2px; font-size: ${TYPE.small}px; color: ${TEXT.faint}; }

.k-stamp { display: inline-block; padding: 4px 12px; border: 3px double currentColor; color: ${TEXT.harm}; font-size: ${TYPE.heading}px;
  font-weight: 700; font-variant: small-caps; letter-spacing: .08em; transform: rotate(-6deg); background: ${PAPER}; }
.k-stamp.good { color: ${TEXT.good}; }
.k-stamp.pressed { animation: k-press ${MOTION.stamp}ms ease-in both; }
@keyframes k-press { from { transform: rotate(-6deg) scale(1.7); opacity: 0; } to { transform: rotate(-6deg) scale(1); opacity: 1; } }

.k-step { display: inline-flex; align-items: center; border: 1.5px solid ${INK.iron}; background: ${PAPER}; }
.k-step > .k-btn { border: 0; min-width: 44px; padding: 0; font-size: ${TYPE.heading}px; }
.k-step > .v { min-width: 96px; text-align: center; border-left: 1px solid ${INK.iron}; border-right: 1px solid ${INK.iron}; line-height: 44px; font-weight: 700; }

.k-veil { position: absolute; inset: 0; z-index: 40; background: ${iron(0.5)}; }
.k-dialog { position: absolute; z-index: 41; }
.k-dialog .k-foot { display: flex; justify-content: flex-end; gap: 12px; padding: 10px 14px; border-top: 1px solid ${INK.iron}; margin: 0 4px; }

.k-notices { position: absolute; z-index: 60; right: 16px; top: 72px; width: 420px; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
.k-notice { background: ${PAPER}; border: 1.5px solid ${INK.iron}; border-left: 8px solid ${INK.iron}; padding: 10px 14px; }
.k-notice.harm { border-left-color: ${TEXT.harm}; }
.k-notice.good { border-left-color: ${TEXT.good}; }

.k-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; height: 100%; text-align: center; padding: 24px; }
.k-empty p { margin: 0; max-width: 460px; }
.k-empty .h { font-size: ${TYPE.heading}px; }
.k-fig.press { min-height: 44px; min-width: 44px; }

.k-field { display: flex; flex-direction: column; gap: 4px; }
.k-field label { font-size: ${TYPE.small}px; color: ${TEXT.faint}; font-variant: small-caps; letter-spacing: .05em; }
.k-field input { font: inherit; font-size: ${TYPE.body}px; min-height: 44px; padding: 0 12px; background: ${PAPER}; color: ${TEXT.iron};
  border: 0; border-bottom: 1.5px solid ${INK.iron}; outline: none; pointer-events: auto; user-select: text; -webkit-user-select: text; }
.k-field .err { font-size: ${TYPE.small}px; color: ${TEXT.harm}; min-height: 17px; }
.k-field.bad input { background: ${PALE.rose}; }
`;

let set = false;
/** Sets the kit's stylesheet into the page, once. */
export function kitStyle() {
  if (set) return;
  set = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}
