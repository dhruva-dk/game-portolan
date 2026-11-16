// The office's own look, over the kit's (kit/style.ts): the page on the desk, the top bar, and what the screens share.
// Every colour is ink.ts's, and the screens' files name none (tools/capture.ts checks).

import { DESK, INK, PALE, PAPER, TEXT, TYPE } from '../ink';

const CSS = `
.o-root { position: absolute; inset: 0; background: ${DESK}; overflow: hidden; }
.o-top { position: absolute; left: 0; top: 0; width: 1180px; height: 64px; display: grid; grid-template-columns: 220px 680px 280px;
  background: ${PAPER}; border-bottom: 3px double ${INK.iron}; z-index: 20; }
.o-who { display: flex; align-items: center; gap: 8px; padding: 0 2px 0 8px; min-width: 0; margin-right: 8px; }
.o-id { min-width: 0; line-height: 1.15; }
.o-id > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.o-crew { display: flex; align-items: center; gap: 4px; color: ${TEXT.faint}; }
.o-crew svg { flex: none; }
.o-tabs { display: grid; grid-template-columns: repeat(8, 85px); border-left: 1px solid ${INK.iron}; border-right: 1px solid ${INK.iron}; }
.o-tab { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  font-size: ${TYPE.small}px; border-bottom: 5px solid transparent; padding-top: 4px; }
.o-tab.open { border-bottom-color: var(--crew, ${INK.iron}); font-weight: 700; background: ${PALE.sand}; }
.o-count { position: absolute; top: 3px; right: 14px; font-size: ${TYPE.small}px; font-weight: 700; }
.o-count.sealed { color: ${TEXT.harm}; }
.o-right { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; align-items: center; column-gap: 10px;
  padding: 0 10px 0 12px; }
.o-date { grid-column: 1; text-align: left; white-space: nowrap; }
.o-right .k-coin { grid-column: 1; grid-row: 2; }
.o-go { grid-column: 2; grid-row: 1 / 3; }
.o-gear { position: absolute; z-index: 5; }

.o-field-row { display: flex; gap: 12px; align-items: flex-end; }
.o-field-row .k-field { flex: 1; }
.o-swatches { display: grid; grid-template-columns: repeat(12, 44px); gap: 8px; }
.o-swatch { width: 44px; height: 44px; border: 1.5px solid ${INK.iron}; position: relative; }
.o-swatch.on { outline: 3px double ${INK.iron}; outline-offset: 2px; }
.o-swatch.on::after { content: ''; position: absolute; inset: 12px; border: 3px solid ${PAPER}; outline: 1.5px solid ${INK.iron}; }
.o-emblems { display: grid; grid-template-columns: repeat(6, 52px); gap: 8px; }
.o-emblem { width: 52px; height: 52px; border: 1px solid ${INK.iron}; background: ${PAPER}; display: flex; align-items: center; justify-content: center; }
.o-emblem.on { outline: 3px double ${INK.iron}; outline-offset: 2px; background: ${PALE.sand}; }
.o-label { font-size: ${TYPE.small}px; color: ${TEXT.faint}; font-variant: small-caps; letter-spacing: .05em; margin: 10px 0 6px; }
.o-lines { display: grid; grid-template-columns: 1fr auto; column-gap: 12px; row-gap: 8px; align-items: baseline; }
.o-lines + .o-lines { margin-top: 8px; }
.o-ways { display: flex; flex-direction: column; gap: 10px; align-items: stretch; }
.o-ways .k-btn { justify-content: flex-start; }
.o-sub { position: absolute; left: 0; top: 0; }
.k-tr.o-head { background: ${PALE.sand}; font-variant: small-caps; font-weight: 700; letter-spacing: .05em; }
.k-tr.o-open { color: ${TEXT.faint}; font-style: italic; }
.o-who-cell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.o-who-cell > div { min-width: 0; line-height: 1.15; }
.o-who-cell > div > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k-stat.o-mini { grid-template-columns: 0 minmax(40px, 1fr) 2.6em; column-gap: 6px; width: 100%; }
.k-stat.o-mini > span:first-child { display: none; }
.k-meter.o-bare > span { display: none; }
.o-terms { display: grid; grid-template-columns: 150px 1fr 96px; row-gap: 10px; column-gap: 12px; align-items: center; margin: 14px 0 4px; }
.o-term { display: contents; }
.o-term-l { font-variant: small-caps; letter-spacing: .04em; white-space: nowrap; }
.o-term > :nth-child(2) { justify-self: start; }
.o-term > :nth-child(3) { text-align: right; }
.o-locked { opacity: .55; pointer-events: none; }
.o-costs { display: grid; grid-template-columns: repeat(3, 1fr); column-gap: 20px; padding-top: 10px; margin-top: 8px; border-top: 1px solid ${INK.iron}; }
.o-costs > .o-lines { grid-template-columns: 1fr; row-gap: 2px; margin-top: 0; }
.o-costs > .o-lines > span:first-child { font-variant: small-caps; color: ${TEXT.faint}; }
.o-costs .k-fig { justify-self: start; text-align: left; }
.k-seg.o-vseg { display: flex; flex-direction: column; }
.k-seg.o-vseg > div { text-align: left; }
.k-seg.o-vseg > div + div { border-left: 0; border-top: 1px solid ${INK.iron}; }
.k-seg.o-wrap > div { padding-left: 9px; padding-right: 9px; }
.o-pin { padding: 6px 0; border-bottom: 1px solid ${INK.iron}; cursor: pointer; }
.o-seats i { width: 20px; height: 20px; }
.o-signed { position: absolute; right: 40px; top: 120px; font-size: ${TYPE.title}px; }
.o-row { display: grid; align-items: center; column-gap: 10px; }
.o-pips { display: inline-flex; gap: 4px; }
.o-pips i { width: 12px; height: 12px; border: 1.5px solid ${INK.iron}; border-radius: 50%; }
.o-pips i.on { background: ${INK.iron}; }
.o-big { font-size: ${TYPE.title}px; font-weight: 700; line-height: 1.1; }
.k-range { width: 100%; height: 44px; accent-color: ${INK.iron}; pointer-events: auto; }
`;

let set = false;
/** Sets the office's stylesheet into the page, once. */
export function officeStyle() {
  if (set) return;
  set = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}
