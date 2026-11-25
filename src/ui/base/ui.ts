import { DEFS, INK, WASH, cssInks, svgNode } from './ink.ts';
import { FADE, MOTION } from './house.ts';

const DRAWN = {
  w: 956,
  h: 440,
  insets: { top: 0, right: 62, bottom: 20, left: 62 },
} as const;
const LEAST = 680;
const GUTTER = 16,
  INSET = 2;

export const size = (width: number, height: number) =>
  Math.min(height / DRAWN.h, width / LEAST);

export const view = { w: 0, h: 0, k: 1, dpr: 1 };

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Page {
  w: number;
  h: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function pageFor(width: number, height: number, safe: Insets): Page {
  const k = size(width, height),
    w = width / k,
    h = height / k;
  const edge = (px: number) => Math.max(px / k + INSET, GUTTER);
  return {
    w,
    h,
    left: edge(safe.left),
    top: edge(safe.top),
    right: w - edge(safe.right),
    bottom: h - edge(safe.bottom),
  };
}

const PAGE = pageFor(DRAWN.w, DRAWN.h, DRAWN.insets);

export function at(
  p: Page,
  x: 'left' | 'center' | 'right',
  y: 'top' | 'middle' | 'bottom',
  body: string
) {
  const dx =
    x === 'left'
      ? p.left - PAGE.left
      : x === 'right'
        ? p.right - PAGE.right
        : (p.left + p.right - PAGE.left - PAGE.right) / 2;
  const dy =
    y === 'top'
      ? p.top - PAGE.top
      : y === 'bottom'
        ? p.bottom - PAGE.bottom
        : (p.top + p.bottom - PAGE.top - PAGE.bottom) / 2;
  return dx === 0 && dy === 0
    ? body
    : `<g transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)})">${body}</g>`;
}

const edge = (side: string) =>
  `max(calc(var(--safe-${side}, env(safe-area-inset-${side})) + ${INSET}px * var(--k)), calc(${GUTTER}px * var(--k)))`;
const STYLE = `
.ui { position: fixed; inset: 0; pointer-events: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; font-family: "Iowan Old Style", Georgia, serif; }
.ui * { pointer-events: none; }
.ui [hidden] { display: none !important; }
.ui .press, .ui .press * { pointer-events: auto; cursor: pointer; touch-action: manipulation; }
.ui .piece { position: absolute; }
.ui svg { display: block; }
.ui .top { top: ${edge('top')}; }
.ui .bottom { bottom: ${edge('bottom')}; }
.ui .left { left: ${edge('left')}; }
.ui .right { right: ${edge('right')}; }
.ui .center { left: 50%; translate: -50% 0; }
.ui .middle { top: 50%; translate: 0 -50%; }
.ui .sized { scale: var(--k); }
.ui .mark { position: absolute; transform: translate(-50%, -50%) scale(var(--k)); }
.ui .screen { position: absolute; inset: 0; }
.ui .screen.press { pointer-events: auto; }
.ui .gone, .ui .gone * { pointer-events: none !important; }
.ui .tap { transform-box: fill-box; transform-origin: center;
  transition: transform ${MOTION.press.release}ms ${MOTION.press.ease}, filter ${MOTION.press.release}ms ease; }
.ui .tap.down { transform: scale(${MOTION.press.scale}); filter: brightness(.93);
  transition-duration: ${MOTION.press.ms}ms; }
.ui .pop { transform-box: fill-box; transform-origin: center;
  animation: pop ${MOTION.dot.ms}ms ${MOTION.dot.ease} both; }
@keyframes pop { from { transform: scale(0); opacity: 0 } }
@keyframes uncle-in { from { transform: translateY(${MOTION.uncle.bob}px) scale(0); opacity: 0 }
  55% { transform: translateY(-${MOTION.uncle.bob}px) scale(${MOTION.uncle.swell}); opacity: 1 }
  80% { transform: translateY(${MOTION.uncle.bob * 0.3}px) scale(.98) } }
@keyframes uncle-out { to { transform: translateY(${MOTION.uncle.bob}px) scale(0); opacity: 0 } }
@keyframes uncle-unroll { from { transform: scaleX(0); opacity: 0 } 30% { opacity: 1 } }
@keyframes uncle-furl { to { transform: scaleX(0); opacity: 0 } }
@keyframes uncle-words { from { opacity: 0 } }
@keyframes uncle-blink { 0%, 94%, 100% { transform: none } 96.5% { transform: scaleY(${MOTION.uncle.shut}) } }
@keyframes uncle-tilt { 0%, 72%, 100% { transform: none } 78%, 90% { transform: rotate(${MOTION.uncle.turn}deg) } }
.ui .said .sitter { transform-box: fill-box; transform-origin: 50% 100%;
  animation: uncle-in ${MOTION.uncle.ms}ms ${MOTION.uncle.ease} both; }
.ui .said .scroll { transform-box: fill-box; transform-origin: 0 50%;
  animation: uncle-unroll ${MOTION.uncle.unroll}ms ${MOTION.sheet.ease} ${MOTION.uncle.after}ms both; }
.ui .said.right .scroll { transform-origin: 100% 50%; }
.ui .said .words { animation: uncle-words ${MOTION.uncle.words}ms ease ${MOTION.uncle.after + MOTION.uncle.unroll * 0.6}ms both; }
.ui .said .lid { transform-box: fill-box; transform-origin: center;
  animation: uncle-blink ${MOTION.uncle.blink}ms linear ${MOTION.uncle.ms}ms infinite; }
.ui .said .tilt { transform-box: fill-box; transform-origin: 50% 90%;
  animation: uncle-tilt ${MOTION.uncle.tilt}ms ease-in-out ${MOTION.uncle.ms * 3}ms infinite; }
.ui .folding .said .scroll { animation: uncle-furl ${MOTION.uncle.fold}ms ${MOTION.sheet.leaveEase} both; }
.ui .folding .said .sitter { animation: uncle-out ${MOTION.uncle.away}ms ${MOTION.sheet.leaveEase} ${MOTION.uncle.fold * 0.6}ms both; }
.ui .folding { pointer-events: none !important; }
.ui .said.settled .sitter, .ui .said.settled .scroll, .ui .said.settled .words { animation: none; }
@keyframes beckon { 50% { filter: drop-shadow(0 0 ${MOTION.beckon.glow}px ${INK.gold}) drop-shadow(0 0 ${MOTION.beckon.glow / 3}px ${INK.gold}); } }
.ui .beckon { animation: beckon ${MOTION.beckon.ms}ms ease-in-out infinite; }
.ui .two .sure, .ui .two .unsure { transform-box: fill-box; transform-origin: center;
  transition: opacity ${MOTION.fade.ms}ms ${MOTION.fade.ease}, transform ${MOTION.arm.ms}ms ${MOTION.arm.ease}; }
.ui .two .sure { opacity: 0; transform: scale(${MOTION.arm.from}); }
.ui .two.armed .sure { opacity: 1; transform: none; }
.ui .two.armed .unsure { opacity: 0; transform: scale(${2 - MOTION.arm.from}); }
.ui .arrive { transform-box: fill-box; transform-origin: center top;
  animation: arrive ${MOTION.deal.ms}ms ${MOTION.deal.ease} both; }
@keyframes arrive { from { transform: translateY(-10px); opacity: 0 } }
.ui .fan { transform-box: fill-box; transform-origin: center;
  animation: fan ${MOTION.fan.ms}ms ${MOTION.fan.ease} both; }
@keyframes fan { from { transform: rotate(var(--r)) translateX(var(--x)); } }
.ui .glide { animation: glide ${MOTION.glide.ms}ms ${MOTION.glide.ease} both; }
@keyframes glide { from { transform: translateX(var(--x)); } }
.ui .stamp { transform-box: fill-box; transform-origin: center;
  animation: stamp ${MOTION.stamp.ms}ms ${MOTION.stamp.ease} both; }
@keyframes stamp { from { transform: scale(${MOTION.stamp.from}) rotate(-12deg); opacity: 0 } }
.ui .denied { animation: refuse ${MOTION.refuse.ms}ms ease-in-out ${MOTION.stamp.ms}ms both; }
.ui .refuse { animation: refuse ${MOTION.refuse.ms}ms ease-in-out both; }
@keyframes refuse { 20% { transform: translateX(-${MOTION.refuse.shift}px) } 45% { transform: translateX(${MOTION.refuse.shift}px) }
  70% { transform: translateX(-${MOTION.refuse.shift / 2}px) } }
.ui .dealt { transform-origin: 0 0; animation: dealt ${MOTION.deal.ms}ms ${MOTION.deal.ease} both; }
@keyframes dealt { from { transform: translate(var(--x), var(--y)) rotate(${MOTION.dealt.turn}deg) scale(${MOTION.dealt.from}); opacity: 0 } }
.ui .picked { pointer-events: none; transition: transform ${MOTION.glide.ms}ms ${MOTION.glide.ease}; }
.ui .bar { transform-box: fill-box; transform-origin: left center; transition: transform ${MOTION.bar.ms}ms ${MOTION.bar.ease}; }
.ui .ticked { animation: ticked ${MOTION.tick.ms}ms ${MOTION.tick.ease}; }
@keyframes ticked { from { transform: translateY(-${MOTION.tick.rise}px); opacity: .55 } }
.ui .ping { transform-box: fill-box; transform-origin: center; animation: ping ${MOTION.dot.ms}ms ${MOTION.dot.ease}; }
@keyframes ping { 40% { transform: scale(1.5, 1.25) } }
.ui .sealed { transform-box: view-box; transform: rotate(${MOTION.seal.rest}deg);
  animation: sealed ${MOTION.seal.ms}ms ${MOTION.seal.ease} ${MOTION.seal.after}ms both; }
@keyframes sealed { from { transform: scale(${MOTION.seal.from}) rotate(${MOTION.seal.turn}deg); opacity: 0 } }
.ui .flourish { transform-box: view-box; opacity: 0;
  animation: flourish ${MOTION.flourish.ms}ms ${MOTION.flourish.ease} ${MOTION.flourish.after}ms both; }
@keyframes flourish { from { transform: scale(${MOTION.flourish.from}); opacity: 1 } 40% { opacity: .9 } to { transform: scale(${MOTION.flourish.reach}); opacity: 0 } }
.ui .flourish.rays { animation-name: rays; }
@keyframes rays { from { transform: scale(${MOTION.flourish.from}); opacity: 0 } 25% { opacity: 1 } to { transform: scale(${MOTION.flourish.reach} ); opacity: 0 } }
.ui .struck { animation: struck ${MOTION.blow.ms}ms ${MOTION.blow.ease} ${MOTION.blow.after}ms; }
@keyframes struck { 30% { transform: translateY(${MOTION.blow.drop}px) scale(${MOTION.blow.give}) rotate(-.7deg) } 70% { transform: scale(1.012) } }
.ui .field .lit { opacity: 0; transition: opacity ${MOTION.fade.ms}ms ease; }
.ui .field.typing .lit { opacity: 1; }
.ui .dyed * { transition: fill ${MOTION.glide.ms}ms ${MOTION.glide.ease}; }
.ui .answer { transform-box: fill-box; transform-origin: center; animation: answer ${MOTION.answer.ms}ms ${MOTION.answer.ease}; }
@keyframes answer { 35% { transform: scale(${MOTION.answer.swell}) } }
.ui .rolling { transform-box: fill-box; transform-origin: center; animation: rolling ${MOTION.roll.ms}ms ${MOTION.roll.ease}; }
@keyframes rolling { 45% { transform: translateY(-${MOTION.roll.hop}px) rotate(${MOTION.roll.turn * 0.7}deg) scale(1.1) } to { transform: rotate(${MOTION.roll.turn}deg) } }
.ui .waking { transform-box: fill-box; transform-origin: center; animation: waking ${MOTION.wake.ms}ms ${MOTION.wake.ease}; }
@keyframes waking { 40% { transform: scale(${MOTION.wake.swell}) rotate(-1.5deg) } }
.ui .lively { transition: opacity ${MOTION.wake.ms}ms ease; }
.ui .inked-rose { transform-box: fill-box; transform-origin: center;
  animation: inked-rose ${MOTION.title.rose}ms ${MOTION.title.pop} ${MOTION.title.after}ms both; }
@keyframes inked-rose { from { transform: rotate(${MOTION.title.turn}deg) scale(.4); opacity: 0 } }
.ui .inked-rhumbs { transform-box: view-box; animation: inked-rhumbs ${MOTION.title.rhumbs}ms ${MOTION.title.ease} ${MOTION.title.after}ms both; }
@keyframes inked-rhumbs { from { transform: scale(.15); opacity: 0 } }
.ui .inked-word { transform-box: fill-box; transform-origin: center;
  animation: inked-word ${MOTION.title.word}ms ${MOTION.title.ease} ${MOTION.title.after * 2}ms both; }
@keyframes inked-word { from { transform: translateY(6px) scaleX(1.18); opacity: 0; filter: blur(1.5px) } }
.ui .inked-rule { transform-box: fill-box; transform-origin: center;
  animation: inked-rule ${MOTION.title.rule}ms ${MOTION.title.ease} ${MOTION.title.after * 4}ms both; }
@keyframes inked-rule { from { transform: scaleX(0); opacity: 0 } }
.ui .bar.level { transition-duration: ${MOTION.number.ms}ms; }
.ui .burst { transform-box: view-box; animation: burst ${MOTION.built.burst}ms ${MOTION.built.ease} both; }
@keyframes burst { from { transform: scale(.35); opacity: 1 } 55% { opacity: .95 } to { transform: scale(1.25); opacity: 0 } }
.ui .floated { transform-box: fill-box; animation: floated ${MOTION.built.float}ms ${MOTION.built.ease} both; }
@keyframes floated { from { transform: translateY(0) scale(.7); opacity: 0 } 18% { transform: translateY(-4px) scale(1.15); opacity: 1 } to { transform: translateY(-${MOTION.built.rise}px); opacity: 0 } }
.ui .seated { animation: seated ${MOTION.seated.ms}ms ${MOTION.seated.ease} both; }
@keyframes seated { from { transform: translateY(-${MOTION.seated.drop}px) scale(1.04) rotate(-2deg); opacity: 0 } }
.ui .waiting { transform-box: fill-box; transform-origin: center; animation: waiting ${MOTION.suspense.ms}ms ease-in-out infinite; }
@keyframes waiting { 50% { transform: rotate(180deg) } 100% { transform: rotate(180deg) } }
.ui .pennant { transform-origin: 50% 0; transition: transform ${MOTION.press.release}ms ${MOTION.press.ease}, translate ${MOTION.lift.ms}ms ${MOTION.lift.ease}, scale ${MOTION.lift.ms}ms ${MOTION.lift.ease}, filter ${MOTION.lift.ms}ms ease, opacity ${MOTION.fade.ms}ms ease; }
.ui .pennant.swing { animation: swing ${MOTION.sway.ms}ms cubic-bezier(.35,.5,.45,1) var(--d, 0ms) both; }
.ui .pennant.breeze { animation: breeze ${MOTION.breeze.ms}ms ease-in-out var(--d, 0ms) infinite; }
.ui .pennant.swing.breeze { animation: swing ${MOTION.sway.ms}ms cubic-bezier(.35,.5,.45,1) var(--d, 0ms) both, breeze ${MOTION.breeze.ms}ms ease-in-out calc(var(--d, 0ms) + ${MOTION.sway.ms}ms) infinite; }
@keyframes swing { 0% { rotate: var(--a, ${MOTION.sway.swing}deg) } 24% { rotate: calc(var(--a, ${MOTION.sway.swing}deg) * -.6) } 48% { rotate: calc(var(--a, ${MOTION.sway.swing}deg) * .32) } 72% { rotate: calc(var(--a, ${MOTION.sway.swing}deg) * -.12) } 100% { rotate: 0deg } }
@keyframes breeze { 0%, 100% { rotate: 0deg } 25% { rotate: ${MOTION.breeze.swing}deg } 75% { rotate: -${MOTION.breeze.swing}deg } }
.ui .pennant.lifted { translate: 0 -${MOTION.lift.rise}px; scale: ${MOTION.lift.swell}; filter: drop-shadow(0 ${MOTION.lift.rise}px 7px rgba(26,16,8,.38)); animation: none; }
.ui .pennant.inviting .hollow { animation: invite ${MOTION.invite.ms}ms ease-in-out infinite; }
.ui .pennant.inviting { animation: breathe ${MOTION.invite.ms}ms ease-in-out infinite; }
@keyframes invite { 0%, 100% { stroke-opacity: .45; fill-opacity: .4; stroke-dashoffset: 0 } 50% { stroke-opacity: 1; fill-opacity: 1.6; stroke-dashoffset: -9 } }
@keyframes breathe { 50% { scale: 1.025 } }
.ui .pennant.flown { animation: flown ${MOTION.flown.ms}ms ${MOTION.flown.ease} both; }
@keyframes flown { from { translate: var(--fx) var(--fy); scale: var(--fs) } 30% { translate: calc(var(--fx) * .78) calc(var(--fy) * .78 - ${MOTION.flown.rise}px); scale: calc(var(--fs) * .92 + .08) } to { translate: 0 0; scale: 1 } }
.ui .pennant.flown .furl { transform-box: view-box; animation: furl ${MOTION.flown.ms + MOTION.sway.ms * 0.3}ms ${MOTION.flown.ease} both; }
@keyframes furl { 0% { transform: none } 18% { transform: scaleY(${MOTION.flown.furl}) } 58% { transform: scaleY(${MOTION.flown.furl}) } 80% { transform: scaleY(1.07) } 100% { transform: none } }
.ui .paid { transform-box: fill-box; animation: paid ${MOTION.paid.ms}ms ${MOTION.built.ease} ${MOTION.paid.after}ms both; }
@keyframes paid { from { transform: translateY(6px) scale(.6); opacity: 0 } 14% { transform: translateY(0) scale(1.12); opacity: 1 } 70% { transform: translateY(-${MOTION.paid.rise * 0.5}px); opacity: 1 } to { transform: translateY(-${MOTION.paid.rise}px); opacity: 0 } }
.ui .still .sealed, .ui .still .flourish { animation: none; }
.ui .landing .sealed { animation-delay: ${MOTION.flown.ms}ms; }
.ui .landing .flourish { animation-delay: ${MOTION.flown.ms + MOTION.blow.after - MOTION.seal.after}ms; }
.ui .inked-row { animation: inked-row ${MOTION.rows.ms}ms ${MOTION.rows.ease} var(--d, 0ms) both; }
@keyframes inked-row { from { transform: translateX(-${MOTION.rows.shift}px); opacity: 0 } }
.ui .moved { transform-box: fill-box; transform-origin: center; animation: moved ${MOTION.moved.ms}ms ${MOTION.moved.ease} calc(var(--d, 0ms) + ${MOTION.moved.after}ms) both; }
@keyframes moved { from { transform: translateY(var(--hop, 0px)) scale(.55); opacity: 0 } }
.ui .drawn { transform-box: fill-box; transform-origin: left center; animation: drawn ${MOTION.drawn.ms}ms ${MOTION.drawn.ease} calc(var(--d, 0ms) + ${MOTION.drawn.after}ms) both; }
@keyframes drawn { from { transform: scaleX(0); opacity: .4 } }
.ui .ticked-in { animation: ticked-in ${MOTION.drawn.ms}ms ease calc(var(--d, 0ms) + ${MOTION.drawn.after + MOTION.drawn.ms * 0.6}ms) both; }
@keyframes ticked-in { from { opacity: 0 } }
.ui .swap-in { animation: swap-in ${MOTION.swap.ms}ms ${MOTION.swap.ease} var(--d, 0ms) both; }
@keyframes swap-in { from { transform: translateX(${MOTION.swap.shift}px); opacity: 0 } 35% { opacity: 1 } }
.ui .swap-out { pointer-events: none; animation: swap-out ${MOTION.swap.leave}ms ${MOTION.swap.leaveEase} both; }
.ui .swap-out * { pointer-events: none !important; }
@keyframes swap-out { to { transform: translate(-${MOTION.swap.shift / 4}px, ${MOTION.swap.drop}px) rotate(${MOTION.swap.turn}deg) scale(.96); opacity: 0; filter: brightness(.85) } }
.ui .swap-away { pointer-events: none; animation: swap-away ${MOTION.swap.leave}ms ${MOTION.swap.leaveEase} both; }
@keyframes swap-away { to { transform: translateX(${MOTION.swap.shift}px); opacity: 0 } }
.ui .row .chosen { opacity: 0; transition: opacity ${MOTION.chosen.ms}ms ${MOTION.chosen.ease}; }
.ui .row .chosen .point { transform-box: fill-box; transition: transform ${MOTION.chosen.ms}ms ${MOTION.chosen.ease}; transform: translateX(-6px); }
.ui .row.on .chosen { opacity: 1; }
.ui .row.on .chosen .point { transform: none; }
.ui .tied .knot { transform-box: fill-box; transform-origin: center; animation: inked ${MOTION.inked.ms}ms ${MOTION.inked.ease} calc(${MOTION.flown.ms}ms + var(--i, 0) * ${MOTION.inked.stagger / 2}ms) both; }
.ui .inked { transform-box: fill-box; transform-origin: center; animation: inked ${MOTION.inked.ms}ms ${MOTION.inked.ease} calc(${MOTION.inked.after}ms + var(--i, 0) * ${MOTION.inked.stagger}ms) both; }
@keyframes inked { from { transform: scale(1.9) rotate(-30deg); opacity: 0 } }
.ui .landed { animation: landed ${MOTION.landed.ms}ms ${MOTION.landed.ease} var(--d, 0ms) both; }
@keyframes landed { from { transform: translateY(-${MOTION.landed.drop}px) rotate(${MOTION.landed.turn}deg) scale(${MOTION.landed.from}); opacity: 0 } 40% { opacity: 1 } }
.ui .tossed, .ui .tossed * { pointer-events: none !important; }
.ui .tossed { animation: tossed ${MOTION.tossed.ms}ms ${MOTION.tossed.ease} both; }
@keyframes tossed { to { transform: translate(-${MOTION.tossed.shift}px, ${MOTION.tossed.drop}px) rotate(${MOTION.tossed.turn}deg); opacity: 0 } }
.ui .dealt-row { transform-box: fill-box; transform-origin: left center; animation: dealt-row ${MOTION.ranked.dealt.ms}ms ${MOTION.ranked.dealt.ease} var(--d, 0ms) both; }
@keyframes dealt-row { from { transform: translateX(-${MOTION.ranked.dealt.shift}px) rotate(${MOTION.ranked.dealt.turn}deg); opacity: 0 } }
.ui .stamped { transform-box: fill-box; transform-origin: center; animation: stamp ${MOTION.ranked.place.stamp}ms ${MOTION.stamp.ease} var(--d, 0ms) both; }
.ui .punched { transform-box: fill-box; transform-origin: center; animation: punched ${MOTION.ranked.punch.ms}ms ${MOTION.ranked.punch.ease} var(--d, 0ms) var(--n, 1) both; }
@keyframes punched { 0% { transform: none } 1% { transform: scale(${MOTION.ranked.punch.from}) } 100% { transform: none } }
.ui .struck-in { stroke-dasharray: 1; animation: struck-in ${MOTION.ranked.strike.ms}ms ${MOTION.ranked.strike.ease} var(--d, 0ms) both; }
@keyframes struck-in { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
.ui .stamp-in { transform-box: fill-box; transform-origin: center; animation: stamp ${MOTION.stamp.ms}ms ${MOTION.stamp.ease} var(--d, 0ms) both; }
.ui .appear { animation: appear ${MOTION.fade.ms}ms ease var(--d, 0ms) both; }
@keyframes appear { from { opacity: 0 } }
.ui .risen { animation: risen ${MOTION.ranked.podium.ms}ms ${MOTION.ranked.podium.ease} var(--d, 0ms) both; }
@keyframes risen { from { transform: translateY(var(--rise, 0px)) } }
.ui .burst-in { transform-box: fill-box; transform-origin: center; animation: burst-in ${MOTION.ranked.burst.ms}ms ${MOTION.ranked.burst.ease} var(--d, 0ms) both; }
@keyframes burst-in { from { transform: scale(0) rotate(-120deg); opacity: 0 } 60% { transform: scale(1.3) rotate(8deg); opacity: 1 } }
.ui .ring-out { transform-box: fill-box; transform-origin: center; animation: ring-out ${MOTION.ranked.burst.ring}ms ${MOTION.ranked.dealt.ease} var(--d, 0ms) both; }
@keyframes ring-out { from { transform: scale(.4); opacity: 0 } 15% { opacity: .9 } to { transform: scale(1.7); opacity: 0 } }
.ui .sealed-in { transform-box: fill-box; transform-origin: center; transform: rotate(${MOTION.ledger.seal.rest}deg); animation: sealed-in ${MOTION.ledger.seal.ms}ms ${MOTION.ledger.seal.ease} var(--d, 0ms) both; }
@keyframes sealed-in { from { transform: scale(${MOTION.ledger.seal.from}) rotate(${MOTION.ledger.seal.turn}deg); opacity: 0 } }
.ui .ruled { transform-box: fill-box; transform-origin: left center; animation: ruled ${MOTION.ledger.rule.ms}ms ${MOTION.ledger.rule.ease} var(--d, 0ms) both; }
@keyframes ruled { from { transform: scaleX(0) } }
.ui .totaled { transform-box: fill-box; transform-origin: center; animation: totaled ${MOTION.ledger.total.ms}ms ${MOTION.ledger.total.ease} var(--d, 0ms) both; }
@keyframes totaled { from { transform: translateY(-${MOTION.ledger.total.drop}px) scale(${MOTION.ledger.total.from}); opacity: 0 } }
.ui .thud { animation: thud ${MOTION.ledger.thud.ms}ms ease-out var(--d, 0ms) both; }
@keyframes thud { 30% { transform: translateY(${MOTION.ledger.thud.drop}px) scale(${MOTION.ledger.thud.give}) } }
.ui .thrown { transform: rotate(${MOTION.thrown.rest}deg); animation: thrown ${MOTION.thrown.ms}ms ${MOTION.thrown.ease} both; }
@keyframes thrown { from { transform: rotate(${-360 * MOTION.thrown.turns}deg) scale(${MOTION.thrown.from}); opacity: 0 } 12% { opacity: 1 }
  76% { transform: rotate(${MOTION.thrown.rest - 4}deg) scale(1.08) } 88% { transform: rotate(${MOTION.thrown.rest}deg) scale(${MOTION.thrown.slap}) } to { transform: rotate(${MOTION.thrown.rest}deg) } }
.ui .puff { animation: puff ${MOTION.thrown.ms * 0.6}ms ease-out ${MOTION.thrown.ms * 0.8}ms both; }
@keyframes heavy { from { transform: translateY(-${MOTION.repossessed.drop}px) rotate(${-360 * MOTION.repossessed.turns}deg) scale(${MOTION.repossessed.from}); opacity: 0 } 10% { opacity: 1 }
  ${MOTION.repossessed.lands * 92}% { transform: rotate(${MOTION.repossessed.rest - 5}deg) scale(1.03) } ${MOTION.repossessed.lands * 100}% { transform: rotate(${MOTION.repossessed.rest}deg) scale(${MOTION.repossessed.slap}) }
  ${MOTION.repossessed.lands * 100 + 12}% { transform: rotate(${MOTION.repossessed.rest}deg) scale(1.02) } to { transform: rotate(${MOTION.repossessed.rest}deg) } }
.ui .thrown.heavy { transform: rotate(${MOTION.repossessed.rest}deg); animation: heavy ${MOTION.repossessed.ms}ms ${MOTION.sheet.leaveEase} both; }
.ui .heavy .puff { animation: puff-heavy ${MOTION.repossessed.quake * 1.6}ms ease-out ${MOTION.repossessed.ms * MOTION.repossessed.lands}ms both; }
@keyframes puff-heavy { from { transform: scale(.95); opacity: 0 } 20% { opacity: .8 } to { transform: scale(1.3); opacity: 0 } }
.ui .quaking { animation: quake ${MOTION.repossessed.quake}ms ease-out ${MOTION.repossessed.ms * MOTION.repossessed.lands}ms both; }
@keyframes quake { 12% { transform: translate(-${MOTION.repossessed.shift}px, ${MOTION.repossessed.shift * 0.6}px) } 28% { transform: translate(${MOTION.repossessed.shift * 0.8}px, -${MOTION.repossessed.shift * 0.4}px) }
  45% { transform: translate(-${MOTION.repossessed.shift * 0.45}px, ${MOTION.repossessed.shift * 0.25}px) } 65% { transform: translate(${MOTION.repossessed.shift * 0.2}px, 0) } }
.ui .stamp-in.slam { animation-name: slam; animation-duration: ${MOTION.stamp.ms * 1.4}ms; }
@keyframes slam { from { transform: scale(${MOTION.repossessed.stamp}) rotate(-7deg); opacity: 0 } 55% { transform: scale(.95); opacity: 1 } 75% { transform: scale(1.02) } }
.ui .said .sitter.peek { animation-delay: ${MOTION.repossessed.ms + MOTION.repossessed.peek}ms; }
.ui .said .peek .lid, .ui .said .peek .tilt { animation-delay: ${MOTION.repossessed.ms + MOTION.repossessed.peek + MOTION.uncle.ms}ms; }
@keyframes debt-stamp { from { transform: scale(${MOTION.debt.from}) rotate(${MOTION.debt.turn}deg); opacity: 0 } 60% { transform: scale(.94) rotate(1deg); opacity: 1 } }
@keyframes debt-throb { 0%, 100% { filter: none } 14% { filter: drop-shadow(0 0 ${MOTION.debt.glow}px ${INK.rubric}) } 38% { filter: none }
  52% { filter: drop-shadow(0 0 ${MOTION.debt.glow / 2}px ${INK.rubric}) } 70% { filter: none } }
.ui .debt-in { transform-box: fill-box; transform-origin: center;
  animation: debt-stamp ${MOTION.debt.stamp}ms ${MOTION.stamp.ease} both, debt-throb ${MOTION.debt.throb}ms ease-out ${MOTION.debt.stamp}ms both; }
@keyframes puff { from { transform: scale(.92); opacity: 0 } 25% { opacity: .55 } to { transform: scale(1.12); opacity: 0 } }
.ui .printed { animation: printed ${MOTION.printed.ms}ms ${MOTION.printed.ease} calc(${MOTION.printed.after}ms + var(--i, 0) * ${MOTION.printed.stagger}ms) both; }
@keyframes printed { from { transform: translateY(${MOTION.printed.shift}px); opacity: 0; filter: blur(1.2px) } }
.ui .turning { transform-box: fill-box; transform-origin: center; animation: turning ${MOTION.turning.ms}ms linear infinite; }
@keyframes turning { to { transform: rotate(360deg) } }
.ui .leafed, .ui .leafed * { pointer-events: none !important; }
.ui .leafed { animation: leafed ${MOTION.leafed.ms}ms ${MOTION.leafed.ease} both; }
@keyframes leafed { 30% { transform: translateY(-${MOTION.leafed.rise * 0.3}px) rotate(${MOTION.leafed.turn * 0.3}deg) scale(${MOTION.leafed.swell}); opacity: 1 } to { transform: translate(${MOTION.leafed.rise}px, -${MOTION.leafed.rise * 2}px) rotate(${MOTION.leafed.turn}deg) scale(${MOTION.leafed.swell}); opacity: 0 } }
.ui .traced { stroke-dasharray: 1; animation: struck-in var(--ms, ${MOTION.ranked.strike.ms}ms) ${MOTION.ranked.strike.ease} var(--d, 0ms) both; }
.ui .traced-back { stroke-dasharray: 1; animation: traced-back var(--ms, ${MOTION.ranked.strike.ms}ms) ${MOTION.ranked.strike.ease} var(--d, 0ms) both; }
@keyframes traced-back { from { stroke-dashoffset: -1 } to { stroke-dashoffset: 0 } }
.ui .crowned { transform-box: fill-box; transform-origin: center; animation: crowned ${MOTION.ceremony.champion.ms}ms ${MOTION.ceremony.champion.ease} var(--d, 0ms) both; }
@keyframes crowned { from { transform: scale(${MOTION.ceremony.champion.from}) rotate(-14deg); opacity: 0 } 35% { opacity: 1 } }
.ui .leaf { transform-box: fill-box; transform-origin: center; animation: leaf ${MOTION.ceremony.wreath.leaf}ms ${MOTION.ceremony.champion.ease} var(--d, 0ms) both; }
@keyframes leaf { from { transform: scale(${MOTION.ceremony.wreath.from}); opacity: 0 } }
.ui .flanked { transform-box: fill-box; transform-origin: center; animation: flanked ${MOTION.ceremony.flank.ms}ms ${MOTION.ceremony.flank.ease} var(--d, 0ms) both; }
@keyframes flanked { from { transform: translateX(var(--shift, 0px)) scale(.7); opacity: 0 } 50% { opacity: 1 } }
.ui .slid { animation: slid ${MOTION.ceremony.row.ms}ms ${MOTION.ceremony.row.ease} var(--d, 0ms) both; }
@keyframes slid { from { transform: translateX(-${MOTION.ceremony.row.shift}px); opacity: 0 } 40% { opacity: 1 } }
.ui .dealt-card { transform-box: fill-box; transform-origin: center; animation: dealt-card ${MOTION.season.deal.ms}ms ${MOTION.season.deal.ease} var(--d, 0ms) both; }
@keyframes dealt-card { from { transform: translateY(-${MOTION.season.deal.drop}px) rotate(var(--turn, ${MOTION.season.deal.turn}deg)) scale(1.08); opacity: 0 } 40% { opacity: 1 } }
.ui .aside { transform-box: fill-box; transform-origin: center; animation: aside ${MOTION.season.aside.ms}ms ${MOTION.season.aside.ease} var(--d, 0ms) both; }
@keyframes aside { from { transform: none } to { transform: translate(-${MOTION.season.aside.shift}px, -${MOTION.season.aside.drop}px) rotate(${MOTION.season.aside.turn}deg) } }
.ui .frost { transform-box: fill-box; transform-origin: center; animation: frost ${MOTION.frost.glyph.ms}ms ${MOTION.frost.glyph.ease} var(--d, 0ms) both; }
@keyframes frost { from { transform: translateY(-${MOTION.frost.glyph.drop}px) rotate(${MOTION.frost.glyph.turn}deg) scale(${MOTION.frost.glyph.from}); opacity: 0; filter: blur(${MOTION.frost.glyph.blur}px) } 60% { opacity: 1; filter: blur(.6px) } }
.ui .slider .knob { transition: transform ${MOTION.slider.settle.ms}ms ${MOTION.slider.settle.ease}; }
.ui .slider.held .knob { transform: translateY(-${MOTION.slider.grab.lift}px) scale(${MOTION.slider.grab.swell}); transition: transform ${MOTION.slider.grab.ms}ms ${MOTION.slider.grab.ease}; }
.ui .slider .lifted-shade { opacity: 0; transform: translateY(${MOTION.slider.grab.lift}px); transition: opacity ${MOTION.slider.grab.ms}ms ease; }
.ui .slider.held .lifted-shade { opacity: ${MOTION.slider.shade}; }
.ui .switch .throw { transition: transform ${MOTION.flip.ms}ms ${MOTION.flip.ease}; }
.ui .switch.on .throw { transform: translateX(var(--throw)); }
.ui .switch .nub { transform-box: fill-box; transform-origin: center; }
.ui .switch.snap .nub { animation: snap ${MOTION.flip.ms}ms ${MOTION.flip.ease}; }
@keyframes snap { 35% { transform: scaleX(${1 / MOTION.flip.squash}) scaleY(${MOTION.flip.squash}) } }
.ui .switch .dye { transform-box: fill-box; transform-origin: left center; transform: scaleX(.25); opacity: 0; transition: transform ${MOTION.flip.dye}ms ${MOTION.flip.ease}, opacity ${MOTION.flip.dye}ms ease; }
.ui .switch.on .dye { transform: none; opacity: .9; }
.ui .switch .lit { opacity: 0; transition: opacity ${MOTION.flip.mark}ms ease; }
.ui .switch.on .lit { opacity: 1; transition-delay: ${MOTION.flip.ms * 0.5}ms; }
.ui .answer { transform-box: fill-box; transform-origin: center; }
.ui .answer.copied { animation: copied ${MOTION.copied.hold}ms ease both; }
@keyframes copied { 0% { opacity: 0; transform: scale(${MOTION.stamp.from}) rotate(-20deg) } 20% { opacity: 1; transform: none } 75% { opacity: 1 } to { opacity: 0 } }
.ui .vitals { transform-origin: 30% 50%; }
.ui .vitals .fill, .ui .vitals .lost { transform-box: fill-box; transform-origin: 0 50%; }
.ui .vitals .fill { transition: transform ${MOTION.bar.ms}ms ${MOTION.bar.ease}; }
.ui .vitals .sheen { opacity: 0; }
.ui .vitals.refilling .sheen { opacity: 1; animation: sheen ${MOTION.vitals.shimmer.ms}ms linear infinite; }
@keyframes sheen { from { transform: translateX(-${Math.round(57 * MOTION.vitals.shimmer.band)}px) } to { transform: translateX(57px) } }
.ui .vitals .plus { opacity: 0; transform-box: fill-box; transform-origin: center; transition: opacity ${MOTION.fade.ms}ms ease; }
.ui .vitals.refilling .plus { opacity: 1; animation: plus ${MOTION.vitals.plus.ms}ms ease-in-out infinite; }
@keyframes plus { 50% { transform: scale(${MOTION.vitals.plus.swell}) } }
.ui .vitals .crack { opacity: 0; stroke-dasharray: 1; stroke-dashoffset: 1; }
.ui .vitals .cracked .crack { animation: crack ${MOTION.vitals.crack.ms}ms ${MOTION.vitals.crack.ease} both; }
.ui .vitals .cracked { animation: cracked ${MOTION.vitals.crack.ms * 0.5}ms ease-out; }
@keyframes crack { 0% { opacity: 1; stroke-dashoffset: 1 } 25% { opacity: 1; stroke-dashoffset: 0 } 100% { opacity: 0; stroke-dashoffset: 0 } }
@keyframes cracked { 20% { transform: translate(-${MOTION.vitals.crack.shake}px, 1px) } 45% { transform: translate(${MOTION.vitals.crack.shake}px, -1px) } 70% { transform: translate(-1px, 0) } }
.ui .vitals .alarm { opacity: 0; }
.ui .vitals.low { animation: throb ${MOTION.vitals.throb.ms}ms ease-in-out infinite; }
.ui .vitals.low .alarm { animation: alarm ${MOTION.vitals.throb.ms}ms ease-in-out infinite; }
@keyframes throb { 50% { transform: scale(${MOTION.vitals.throb.swell}) } }
@keyframes alarm { 0%, 100% { opacity: .2 } 50% { opacity: .95 } }
.ui #r-sea, .ui #r-wing-face, .ui #r-wing-cross { transform-box: fill-box; transform-origin: center; }
.ui .wing-fill { transform-box: fill-box; transform-origin: 0 50%; transition: transform ${MOTION.bar.ms}ms ${MOTION.bar.ease}; }
.ui #r-wing-cross { opacity: 0; }
.ui #r-wing.sunk #r-wing-cross { opacity: 1; animation: stamp ${MOTION.stamp.ms}ms ${MOTION.stamp.ease} both; }
.ui #r-wing.sunk #r-wing-face { opacity: .45; filter: grayscale(1); }
.ui .gust .on, .ui .gust .halo { opacity: 0; }
.ui .gust .sign { opacity: .4; transition: opacity ${MOTION.fade.ms}ms ease; }
.ui .gust.ready .sign { opacity: 1; }
.ui .gust.blowing .on { opacity: 1; }
.ui .gust.blowing .meter { stroke: ${WASH.gold}; }
.ui .gust.blowing .halo { animation: glow ${MOTION.glow.ms}ms ease-in-out infinite; }
@keyframes glow { 0%, 100% { opacity: ${MOTION.glow.low} } 50% { opacity: ${MOTION.glow.high} } }
.ui .slot .glint { opacity: 0; }
.ui .link .under { transition: stroke-width ${MOTION.press.ms}ms ease; }
.ui .link.down .under { stroke-width: 2.4; }
`;

export function show(el: HTMLElement, on: boolean) {
  if (el.hidden === on) el.hidden = !on;
}

const fading = new WeakMap<HTMLElement, number>();

export function fade(el: HTMLElement, on: boolean, ms = FADE) {
  if (on === (!el.hidden && !el.classList.contains('gone'))) return;
  clearTimeout(fading.get(el));
  el.style.transition = `opacity ${ms}ms ease`;
  if (on) {
    el.classList.remove('gone');
    if (el.hidden) {
      el.style.opacity = '0';
      el.hidden = false;
      reflow(el);
    }
    el.style.opacity = '1';
  } else {
    el.classList.add('gone');
    el.style.opacity = '0';
    fading.set(
      el,
      window.setTimeout(() => {
        el.hidden = true;
      }, ms)
    );
  }
}

export function reflow(el: HTMLElement) {
  void el.offsetWidth;
}

export const boxOf = (el: Element): DOMRect => el.getBoundingClientRect();

const resizes = new Set<() => void>();

export function onResize(fn: () => void): () => void {
  resizes.add(fn);
  return () => resizes.delete(fn);
}

let layer: HTMLElement | null = null;
export function uiLayer(): HTMLElement {
  if (layer) return layer;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  for (const [name, value] of cssInks)
    document.documentElement.style.setProperty(name, value);
  const defs = svgNode(0, 0, DEFS);
  defs.style.position = 'absolute';
  const el = document.createElement('div');
  el.className = 'ui';
  el.append(defs);
  document.body.appendChild(el);
  layer = el;
  const resized = () => {
    const typing = document.activeElement instanceof HTMLInputElement;
    if (typing && innerWidth === view.w && innerHeight < view.h) return;
    [view.w, view.h, view.k, view.dpr] = [
      innerWidth,
      innerHeight,
      size(innerWidth, innerHeight),
      devicePixelRatio,
    ];
    el.style.setProperty('--k', view.k.toFixed(4));
    for (const fn of resizes) fn();
  };
  resized();
  addEventListener('resize', resized);
  return el;
}

let probe: HTMLElement | null = null;
export function insets(): Insets {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;visibility:hidden;padding:var(--safe-top, env(safe-area-inset-top)) ' +
      'var(--safe-right, env(safe-area-inset-right)) var(--safe-bottom, env(safe-area-inset-bottom)) var(--safe-left, env(safe-area-inset-left))';
    uiLayer().appendChild(probe);
  }
  const s = getComputedStyle(probe),
    px = (v: string) => parseFloat(v) || 0;
  return {
    top: px(s.paddingTop),
    right: px(s.paddingRight),
    bottom: px(s.paddingBottom),
    left: px(s.paddingLeft),
  };
}

export const page = () => pageFor(view.w, view.h, insets());

export function screen(press = false): HTMLDivElement {
  const el = document.createElement('div');
  el.className = press ? 'screen press' : 'screen';
  el.hidden = true;
  uiLayer().appendChild(el);
  return el;
}

export function piece(
  parent: HTMLElement,
  place: string,
  press = false,
  sized = false
): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `piece ${place}${press ? ' press' : ''}${sized ? ' sized' : ''}`;
  const has = (c: string) => place.split(' ').includes(c);
  if (sized)
    el.style.transformOrigin = `${has('left') ? '0' : has('right') ? '100%' : '50%'} ${has('top') ? '0' : has('bottom') ? '100%' : '50%'}`;
  parent.appendChild(el);
  return el;
}

export function placed(
  parent: HTMLElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  parent.append(el);
  return el;
}
