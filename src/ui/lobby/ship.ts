import type { GunKind, Line } from '../../career/commands.ts';
import type {
  BuildView,
  KindView,
  ShipRowView,
  ShipView,
} from '../../career/views/ship.ts';
import { pressable, roundButton } from '../base/button.ts';
import { grouped } from '../base/grouped.ts';
import { portrait, uncle } from '../base/gull.ts';
import { FAINT, MOTION, SIZE, SPACE, TYPE } from '../base/house.ts';
import { GILT, INK, WASH, figure, glyph, slip, svgNode } from '../base/ink.ts';
import { STAT, least } from '../base/lexicon.ts';
import { dyePot } from '../base/marks.ts';
import { sheet } from '../base/sheet.ts';
import { piece, screen } from '../base/ui.ts';
import { measured, word } from '../base/word.ts';
import type { LobbyPort } from './port.ts';

const SIDE = { w: 216, h: 360 } as const;
const PAD = SPACE.pad;
const INNER = SIDE.w - 2 * PAD;
const HEAD = { y: 27, glyph: 28, size: 34, bar: 56, barH: 9 } as const;
const KINDS = { y: 80, glyph: 24, progress: 100, h: 44 } as const;
const PLAIN = { top: 76, h: 116, line: 16, build: 40, buildH: 40 } as const;
const GUNNED = {
  top: 110,
  h: 96,
  line: 14,
  fits: 42,
  fitH: 26,
  fitW: 31,
  fitX: 40,
  build: 60,
  buildH: 32,
} as const;
const ROW = { sailor: 24, numeral: 66, barX: 76, barH: 8 } as const;
const FOCUS = { h: 42, portrait: 24 } as const;
const ARROW = { r: 20, size: 22 } as const;
const STOPS = { r: 18, step: 46, glyph: 22, portrait: 18 } as const;
const PAINT = { w: 64, h: 82, r: SIZE.disc } as const;
const BURST = { size: 200, rays: 13, chips: 10 } as const;

const LINES: readonly Line[] = [
  'sails',
  'rigging',
  'rudder',
  'hull',
  'keel',
  'mounts',
  'gun',
];

const r2 = (n: number) => Math.round(n * 100) / 100;

const kindGlyph = (kind: GunKind) => `weapon.${kind}` as const;

function tile(seed: number | null, cx: number, cy: number, size: number) {
  const s = size + 4;
  return (
    slip(cx - s / 2, cy - s / 2, s, s, { rule: false, flat: true }) +
    `<g transform="translate(${r2(cx - size / 2)} ${r2(cy - size / 2)})">${seed === null ? uncle(size) : portrait(seed, size)}</g>`
  );
}

const outline = (cx: number, cy: number, size: number) =>
  `<rect x="${r2(cx - size / 2 - 2)}" y="${r2(cy - size / 2 - 2)}" width="${size + 4}" height="${size + 4}" fill="none" stroke="${INK.iron}" stroke-width="1" stroke-dasharray="3 2.4" opacity=".75"/>`;

function levelBar(
  id: string,
  x: number,
  cy: number,
  w: number,
  h: number,
  value: number,
  most: number,
  tick: number | null
) {
  const top = cy - h / 2,
    inset = 1.5,
    inner = w - 2 * inset;
  let s =
    `<rect x="${r2(x)}" y="${r2(top)}" width="${r2(w)}" height="${r2(h)}" fill="${GILT}" fill-opacity=".45" stroke="${INK.iron}" stroke-width=".9"/>` +
    `<rect id="${id}" class="bar level" x="${r2(x + inset)}" y="${r2(top + inset)}" width="${r2(inner)}" height="${r2(h - 2 * inset)}" fill="${WASH.ochre}" opacity=".9" style="transform:scaleX(${r2(value / most)})"/>`;
  for (let i = 1; i < 4; i++)
    s += `<path d="M${r2(x + (w * i) / 4)} ${r2(top)}v${r2(h * 0.35)}" stroke="${INK.iron}" stroke-width=".6" opacity=".5"/>`;
  if (tick !== null) {
    const tx = x + inset + (inner * tick) / most;
    s += `<path d="M${r2(tx)} ${r2(top - 3.5)}V${r2(top + h + 3.5)}" stroke="${INK.iron}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  return s;
}

function buildFace(b: BuildView, y: number, h: number) {
  const x = PAD,
    w = INNER,
    cy = y + h / 2,
    coin = least('coin'),
    size = TYPE.figure - 3,
    said = word(x + PAD, cy, 'Build', TYPE.word + 1, {
      anchor: 'start',
      weight: 600,
    });
  if (b.why === 'same')
    return (
      slip(x, y, w, h) +
      `<g opacity="${FAINT + 0.1}">${said}</g>` +
      `<g class="done">${glyph('tick', x + w - PAD - 9, cy, least('tick') + 2)}</g>`
    );
  const cost = grouped(b.cost),
    gain = `+${grouped(b.gain)}`,
    gainW =
      b.gain > 0 ? measured(gain, size, { italic: true, weight: 700 }) : 0,
    costW =
      coin + SPACE.hair + measured(cost, size, { italic: true, weight: 600 }),
    right = x + w - PAD,
    cx = right - (gainW > 0 ? gainW + SPACE.gap : 0) - costW;
  const body =
    said +
    glyph('coin', cx + coin / 2, cy, coin) +
    figure(cx + costW, cy, cost, size, { anchor: 'end', weight: 600 }) +
    (b.gain > 0
      ? figure(right, cy, gain, size, {
          anchor: 'end',
          weight: 700,
          fill: INK.green,
        })
      : '');
  return (
    slip(x, y, w, h, b.faint ? {} : { fill: GILT }) +
    (b.faint ? `<g opacity="${FAINT + 0.1}">${body}</g>` : body) +
    (b.why === 'funds'
      ? glyph('cross', cx + coin / 2, cy, coin + 3, { ink: 'rubric' })
      : '')
  );
}

function burstArt() {
  const c = BURST.size / 2;
  let rays = '',
    chips = '';
  for (let i = 0; i < BURST.rays; i++) {
    const a = (i / BURST.rays) * Math.PI * 2 + 0.2,
      from = 22 + (i % 3) * 5,
      to = 58 + (i % 4) * 11;
    rays += `<path d="M${r2(c + from * Math.cos(a))} ${r2(c + from * Math.sin(a))}L${r2(c + to * Math.cos(a))} ${r2(c + to * Math.sin(a))}" stroke="${INK.iron}" stroke-width="${i % 2 ? 1.3 : 2.3}" stroke-linecap="round"/>`;
  }
  for (let i = 0; i < BURST.chips; i++) {
    const a = (i / BURST.chips) * Math.PI * 2 + 0.55,
      d = 46 + (i % 3) * 18,
      x = c + d * Math.cos(a),
      y = c + d * Math.sin(a);
    chips += `<rect x="${r2(x - 3.5)}" y="${r2(y - 1.8)}" width="7" height="3.6" rx="1" fill="${i % 3 ? WASH.ochre : WASH.gold}" stroke="${INK.iron}" stroke-width=".6" transform="rotate(${(i * 47) % 180} ${r2(x)} ${r2(y)})"/>`;
  }
  const origin = `transform-origin:${c}px ${c}px`;
  return (
    `<g class="burst" style="${origin}"><circle cx="${c}" cy="${c}" r="34" fill="none" stroke="${INK.iron}" stroke-width="1.6" stroke-dasharray="5 4"/>${rays}</g>` +
    `<g class="burst" style="${origin};animation-delay:50ms">${chips}</g>`
  );
}

type Act = { slot: 0 | 1; build: BuildView } | 'focus' | null;

export type ShipPricing = (line: Line) => ShipView;

const stopX = (i: number) => STOPS.r + 6 + i * STOPS.step;
const STOP_Y = STOPS.portrait + STOPS.r - 2;

export function createShip(port: LobbyPort) {
  const el = screen();
  el.hidden = true;
  const side = piece(el, 'bottom right', false, true);
  side.style.width = `${SIDE.w}px`;
  side.style.height = `${SIDE.h}px`;
  const scene = `calc(${-(SIDE.w + SPACE.margin) / 2}px * var(--k))`;
  const prev = piece(el, 'left middle', false, true);
  const next = piece(el, 'right middle', false, true);
  next.style.marginRight = `calc(${SIDE.w + SPACE.gap}px * var(--k))`;
  const stops = piece(el, 'bottom center', false, true);
  stops.style.marginLeft = scene;
  const paint = piece(el, 'top left', false, true);
  const burst = document.createElement('div');
  burst.className = 'mark';
  burst.style.left = `calc(50% + ${scene})`;
  burst.style.top = '46%';
  el.append(burst);

  let price: ShipPricing | null = null,
    view: ShipView | null = null,
    line: Line = 'sails',
    svg: SVGSVGElement | null = null,
    stopSvg: SVGSVGElement | null = null,
    chosen: [GunKind | null, GunKind | null] = [null, null],
    acted: Act = null,
    counting = 0;

  const part = (id: string) => svg?.querySelector<SVGElement>(`#${id}`) ?? null;

  function replay(target: Element | null | undefined, name: string) {
    if (!target) return;
    target.classList.remove(name);
    void target.getBoundingClientRect();
    target.classList.add(name);
  }

  const refuse = (target: Element | null) =>
    replay(target?.querySelector('.face') ?? target, 'refuse');

  const layout = (v: ShipView) => (v.kinds ? GUNNED : PLAIN);

  function effective(row: ShipRowView): BuildView {
    const kind = chosen[row.slot];
    return row.fits?.find((f) => f.kind === kind)?.build ?? row.build;
  }

  function designerAt(v: ShipView) {
    const at = v.stops.findIndex((st) => st.focused);
    return `transform:translateX(${r2(Math.max(0, at) * STOPS.step)}px);opacity:${at < 0 ? 0 : 1};transition-property:transform,opacity`;
  }

  function stopRow(v: ShipView) {
    let s = '';
    v.stops.forEach((stop, i) => {
      const cx = stopX(i);
      s += `<g id="stop-${i}"><g class="face">${roundButton(cx, STOP_Y, STOPS.r, glyph(STAT[stop.line].glyph, cx, STOP_Y, STOPS.glyph))}</g></g>`;
    });
    s += `<g id="stop-ring" class="picked" style="transform:translateX(${r2(v.stop * STOPS.step)}px)"><circle cx="${r2(stopX(0))}" cy="${STOP_Y}" r="${STOPS.r + 2.5}" fill="none" stroke="${INK.gold}" stroke-width="3.2"/><circle cx="${r2(stopX(0))}" cy="${STOP_Y}" r="${STOPS.r + 4.8}" fill="none" stroke="${INK.iron}" stroke-width=".9"/></g>`;
    if (v.designer !== null)
      s += `<g id="stop-designer" class="picked" style="${designerAt(v)}">${tile(v.designer, stopX(0) + STOPS.r * 0.72, STOP_Y - STOPS.r - 1, STOPS.portrait)}</g>`;
    return s;
  }

  function drawStops(v: ShipView) {
    const w = stopX(LINES.length - 1) + STOPS.r + 8,
      h = STOP_Y + STOPS.r + 6;
    stopSvg = svgNode(w, h, stopRow(v));
    stops.replaceChildren(stopSvg);
    stops.style.width = `${w}px`;
    v.stops.forEach((_, i) =>
      pressable(
        stopSvg?.querySelector<SVGElement>(`#stop-${i}`) ?? null,
        () => go(i),
        `stop-${i}`
      )
    );
  }

  function moveStops(v: ShipView) {
    const ring = stopSvg?.querySelector<SVGElement>('#stop-ring'),
      designer = stopSvg?.querySelector<SVGElement>('#stop-designer');
    if (ring) ring.style.transform = `translateX(${r2(v.stop * STOPS.step)}px)`;
    if (designer) designer.setAttribute('style', designerAt(v));
    else if (v.designer !== null) drawStops(v);
  }

  function arrow(id: string, back: boolean) {
    const d = 2 * ARROW.r + 6,
      c = d / 2,
      art = glyph('arrow', c, c, ARROW.size);
    const node = svgNode(
      d,
      d,
      `<g id="${id}"><g class="face">${roundButton(c, c, ARROW.r, back ? `<g transform="rotate(180 ${c} ${c})">${art}</g>` : art)}</g></g>`
    );
    pressable(node.querySelector(`#${id}`), () => step(back ? -1 : 1), id);
    return node;
  }

  function paintButton() {
    const cx = PAINT.w / 2,
      cy = PAINT.r + 2;
    const art = svgNode(
      PAINT.w,
      PAINT.h,
      `<g id="paint">${roundButton(cx, cy, PAINT.r, dyePot(cx, cy + 3, 30, WASH.vermilion))}` +
        word(cx, cy + PAINT.r + 13, 'Paint', TYPE.word, {
          weight: 600,
          halo: 'rgba(247,238,219,.92)',
        }) +
        '</g>'
    );
    paint.replaceChildren(art);
    pressable(art.querySelector('#paint'), () => port.open('paint'), 'paint');
  }

  function head(v: ShipView) {
    const mark = STAT[v.line];
    return (
      glyph(mark.glyph, PAD + HEAD.glyph / 2, HEAD.y, HEAD.glyph) +
      word(PAD + HEAD.glyph + SPACE.gap, HEAD.y, mark.word, TYPE.name + 1, {
        anchor: 'start',
        weight: 600,
      }) +
      figure(SIDE.w - PAD, HEAD.y + 1, grouped(v.design), HEAD.size, {
        anchor: 'end',
        weight: 700,
      }) +
      levelBar(
        'design-bar',
        PAD,
        HEAD.bar,
        INNER,
        HEAD.barH,
        v.design,
        v.scale.most,
        null
      )
    );
  }

  function kindCell(v: ShipView, k: KindView, i: number, n: number) {
    const cw = INNER / n,
      cx = PAD + cw * (i + 0.5);
    return (
      `<g id="kind-${i}"><rect x="${r2(cx - cw / 2)}" y="${KINDS.y - KINDS.h / 2 + 8}" width="${r2(cw)}" height="${KINDS.h}" fill="transparent"/><g class="face">` +
      `<g opacity="${k.faint ? FAINT + 0.12 : 1}">${glyph(kindGlyph(k.kind), cx, KINDS.y, KINDS.glyph)}</g>` +
      (k.unlocked
        ? ''
        : figure(
            cx,
            KINDS.progress,
            `${grouped(k.progress)}/${grouped(k.needed)}`,
            TYPE.small + 1,
            { weight: 600, fill: k.unlocking ? INK.iron : INK.sepia }
          )) +
      (k.unlocking && v.designer !== null
        ? `<g class="pop">${tile(v.designer, cx + 14, KINDS.y - 8, 14)}</g>`
        : '') +
      '</g></g>'
    );
  }

  function kindsRow(v: ShipView) {
    const kinds = v.kinds;
    if (!kinds) return '';
    return (
      `<path d="M${PAD} ${HEAD.bar + 12}H${SIDE.w - PAD}" stroke="${INK.iron}" stroke-width=".5" opacity=".45"/>` +
      kinds.map((k, i) => kindCell(v, k, i, kinds.length)).join('')
    );
  }

  function sailor(row: ShipRowView, cx: number, cy: number) {
    if (row.sailor.who === 'you')
      return (
        slip(cx - 14, cy - 14, 28, 28, { rule: false, flat: true }) +
        glyph('role.owner', cx, cy, ROW.sailor - 2)
      );
    return tile(
      row.sailor.who === 'driver' ? row.sailor.portrait : null,
      cx,
      cy,
      ROW.sailor
    );
  }

  function fitsArt(row: ShipRowView, top: number) {
    const fits = row.fits;
    if (!fits) return '';
    const L = GUNNED,
      fy = top + L.fits,
      pick = chosen[row.slot] ?? fits.find((f) => f.fitted)?.kind,
      index = Math.max(
        0,
        fits.findIndex((f) => f.kind === pick)
      );
    let s = `<g id="fit-mark-${row.slot}" class="picked" style="transform:translateX(${r2(index * L.fitW)}px)">${slip(PAD + L.fitX + 2, fy - L.fitH / 2, L.fitW - 4, L.fitH, { fill: GILT, bold: true, flat: true, rule: false })}</g>`;
    fits.forEach((f, i) => {
      const cx = PAD + L.fitX + L.fitW * (i + 0.5);
      s +=
        `<g id="fit-${row.slot}-${i}"><rect x="${r2(cx - L.fitW / 2)}" y="${r2(fy - L.fitH / 2 - 5)}" width="${L.fitW}" height="${L.fitH + 10}" fill="transparent"/><g class="face">` +
        glyph(kindGlyph(f.kind), cx, fy, 19) +
        (f.fitted
          ? `<circle cx="${r2(cx)}" cy="${fy}" r="13.5" fill="none" stroke="${INK.iron}" stroke-width="1.4"/>`
          : '') +
        '</g></g>';
    });
    return s;
  }

  function rowArt(v: ShipView, row: ShipRowView) {
    const L = layout(v),
      top = L.top + row.slot * L.h,
      ly = top + L.line;
    return (
      `<g id="row-${row.slot}">` +
      sailor(row, PAD + ROW.sailor / 2 + 2, ly) +
      `<g id="fitted-${row.slot}">${figure(PAD + ROW.numeral, ly + 1, grouped(row.fitted), TYPE.figure, { anchor: 'end', weight: 600 })}</g>` +
      levelBar(
        `fitted-bar-${row.slot}`,
        PAD + ROW.barX,
        ly,
        INNER - ROW.barX,
        ROW.barH,
        row.fitted,
        v.scale.most,
        v.design
      ) +
      fitsArt(row, top) +
      `<g id="build-${row.slot}"><g class="face">${buildFace(effective(row), top + L.build, L.buildH)}</g></g>` +
      '</g>'
    );
  }

  function focusArt(v: ShipView) {
    const y = SIDE.h - PAD - FOCUS.h,
      cy = y + FOCUS.h / 2,
      px = PAD + INNER * 0.56,
      on = v.focus.on;
    const body =
      word(PAD + PAD, cy, 'Focus', TYPE.word + 1, {
        anchor: 'start',
        weight: 600,
      }) +
      (v.designer === null
        ? outline(px, cy, FOCUS.portrait)
        : tile(v.designer, px, cy, FOCUS.portrait)) +
      figure(
        SIDE.w - 2 * PAD,
        cy,
        `+${grouped(v.focus.gain, 1)}`,
        TYPE.figure - 3,
        { anchor: 'end', weight: 700, fill: INK.green }
      );
    return (
      `<g id="focus"><g class="face">` +
      slip(PAD, y, INNER, FOCUS.h, on ? { fill: GILT, bold: true } : {}) +
      (on
        ? `<rect x="${PAD + 4}" y="${y + 4}" width="${INNER - 8}" height="${FOCUS.h - 8}" fill="${INK.iron}" opacity=".1"/>`
        : '') +
      (v.focus.faint ? `<g opacity="${FAINT + 0.1}">${body}</g>` : body) +
      '</g></g>'
    );
  }

  function content(v: ShipView) {
    const L = layout(v),
      split = L.top + L.h - (v.kinds ? 4 : 10);
    return (
      head(v) +
      kindsRow(v) +
      `<path d="M${PAD + 20} ${split}H${SIDE.w - PAD - 20}" stroke="${INK.iron}" stroke-width=".5" opacity=".4"/>` +
      `<g id="rows">${v.rows.map((row) => rowArt(v, row)).join('')}</g>` +
      `<g id="focus-box">${focusArt(v)}</g>`
    );
  }

  function draw(v: ShipView, turn: 'next' | 'prev' | null) {
    svg = svgNode(
      SIDE.w,
      SIDE.h,
      sheet(0, 0, SIDE.w, SIDE.h, { seed: 37 }) +
        `<g id="content"${turn ? ` class="turn-${turn}"` : ''}>${content(v)}</g>`
    );
    side.replaceChildren(svg);
    bindRows(v);
    bindFocus();
    v.kinds?.forEach((k, i) => {
      const target = part(`kind-${i}`);
      pressable(target, () => unlock(k, target), `kind-${i}`);
    });
  }

  function bindRows(v: ShipView) {
    v.rows.forEach((row) => {
      const b = part(`build-${row.slot}`);
      pressable(b, () => build(row.slot, b), `build-${row.slot}`);
      row.fits?.forEach((f, i) =>
        pressable(
          part(`fit-${row.slot}-${i}`),
          () => fit(row.slot, f.kind),
          `fit-${row.slot}-${i}`
        )
      );
    });
  }

  function bindFocus() {
    const focus = part('focus');
    pressable(focus, () => focusOn(focus), 'focus');
  }

  function build(slot: 0 | 1, target: SVGElement | null) {
    const row = view?.rows[slot];
    if (!row) return;
    const b = effective(row);
    if (b.faint) {
      refuse(target);
      return;
    }
    acted = { slot, build: b };
    const refused = port.send(
      b.fit
        ? { type: 'FitGun', team: 0, slot, kind: b.fit }
        : { type: 'Build', team: 0, slot, line }
    );
    if (refused) {
      acted = null;
      refuse(target);
    }
  }

  function fit(slot: 0 | 1, kind: GunKind) {
    const row = view?.rows[slot],
      fits = row?.fits;
    if (!row || !fits) return;
    const fitted = fits.find((f) => f.fitted)?.kind ?? null;
    chosen[slot] = kind === fitted ? null : kind;
    const index = fits.findIndex((f) => f.kind === kind),
      mark = part(`fit-mark-${slot}`);
    if (mark) mark.style.transform = `translateX(${r2(index * GUNNED.fitW)}px)`;
    const face = part(`build-${slot}`)?.querySelector<SVGElement>('.face');
    if (!face) return;
    face.innerHTML = buildFace(
      effective(row),
      GUNNED.top + slot * GUNNED.h + GUNNED.build,
      GUNNED.buildH
    );
    replay(face, 'answer');
    replay(part(`fit-${slot}-${index}`)?.querySelector('.face'), 'answer');
  }

  function setFocus(focus: { line: Line } | { gun: GunKind } | null) {
    acted = 'focus';
    if (port.send({ type: 'SetFocus', team: 0, focus })) {
      acted = null;
      return false;
    }
    return true;
  }

  function unlock(k: KindView, target: SVGElement | null) {
    if (k.unlocked) return;
    if (
      view?.designer == null ||
      !setFocus(k.unlocking ? null : { gun: k.kind })
    )
      refuse(target);
  }

  function focusOn(target: SVGElement | null) {
    const v = view;
    if (!v) return;
    if (v.focus.faint || !setFocus(v.focus.on ? null : { line }))
      refuse(target);
  }

  function countUp(id: string, from: number, to: number) {
    const text = part(id)?.querySelector('text');
    if (!text || from === to) return;
    const began = performance.now();
    cancelAnimationFrame(counting);
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / MOTION.number.ms),
        e = 1 - (1 - t) ** 3;
      text.textContent = grouped(Math.round(from + (to - from) * e));
      if (t < 1) counting = requestAnimationFrame(tick);
    };
    text.textContent = grouped(from);
    counting = requestAnimationFrame(tick);
  }

  function grow(id: string, from: number, to: number, most: number) {
    const bar = part(id);
    if (!bar) return;
    bar.style.transition = 'none';
    bar.style.transform = `scaleX(${r2(from / most)})`;
    void bar.getBoundingClientRect();
    bar.style.transition = '';
    bar.style.transform = `scaleX(${r2(to / most)})`;
  }

  function floated(v: ShipView, slot: 0 | 1, b: BuildView) {
    const L = layout(v),
      y = L.top + slot * L.h + L.line,
      x = PAD + ROW.numeral + 8,
      g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'floated');
    g.innerHTML =
      b.gain > 0
        ? figure(x, y - 4, `+${grouped(b.gain)}`, TYPE.figure, {
            anchor: 'start',
            weight: 700,
            fill: INK.green,
            halo: GILT,
            haloWidth: 3.5,
          })
        : glyph(kindGlyph(b.fit ?? 'cannon'), x + 12, y - 4, 26);
    svg?.append(g);
    window.setTimeout(() => g.remove(), MOTION.built.float);
  }

  function fling() {
    const art = svgNode(BURST.size, BURST.size, burstArt());
    art.style.cssText = `position:absolute;left:${-BURST.size / 2}px;top:${-BURST.size / 2}px`;
    burst.replaceChildren(art);
    window.setTimeout(() => {
      if (burst.firstChild === art) art.remove();
    }, MOTION.built.burst + 120);
  }

  function landBuild(v: ShipView, before: ShipView, slot: 0 | 1, b: BuildView) {
    const rows = part('rows');
    if (rows) rows.innerHTML = v.rows.map((row) => rowArt(v, row)).join('');
    bindRows(v);
    const was = before.rows[slot].fitted,
      now = v.rows[slot].fitted;
    grow(`fitted-bar-${slot}`, was, now, v.scale.most);
    countUp(`fitted-${slot}`, was, now);
    floated(v, slot, b);
    if (v.rows[slot].build.why === 'same')
      replay(part(`build-${slot}`)?.querySelector('.done'), 'stamp');
    if (b.fit) {
      const i = v.rows[slot].fits?.findIndex((f) => f.kind === b.fit) ?? -1;
      replay(part(`fit-${slot}-${i}`)?.querySelector('.face'), 'ping');
    }
    fling();
    port.scene.jolt('built');
  }

  function landFocus(v: ShipView) {
    const box = part('focus-box');
    if (box) box.innerHTML = focusArt(v);
    bindFocus();
    replay(part('focus')?.querySelector('.face'), 'answer');
    moveStops(v);
    port.scene.jolt('focused');
  }

  function go(index: number) {
    const to = LINES[(index + LINES.length) % LINES.length];
    if (!price || to === line) return;
    const from = LINES.indexOf(line),
      ahead = (LINES.indexOf(to) - from + LINES.length) % LINES.length;
    line = to;
    chosen = [null, null];
    port.scene.stop(LINES.indexOf(to));
    const v = price(to);
    view = v;
    draw(v, ahead <= LINES.length / 2 ? 'next' : 'prev');
    moveStops(v);
  }

  function step(by: number) {
    go(LINES.indexOf(line) + by);
  }

  return {
    el,
    open(stop = 0) {
      line = LINES[stop] ?? 'sails';
      chosen = [null, null];
      view = null;
      svg = null;
      acted = null;
    },
    show(pricing: ShipPricing) {
      price = pricing;
      const v = price(line),
        before = view,
        did = acted;
      acted = null;
      view = v;
      if (!svg || !before) {
        prev.replaceChildren(arrow('prev-stop', true));
        next.replaceChildren(arrow('next-stop', false));
        paintButton();
        drawStops(v);
        draw(v, null);
        return;
      }
      if (JSON.stringify(before) === JSON.stringify(v)) return;
      if (did && did !== 'focus') {
        chosen[did.slot] = null;
        landBuild(v, before, did.slot, did.build);
        return;
      }
      if (did === 'focus') {
        if (v.kinds) draw(v, null);
        landFocus(v);
        return;
      }
      draw(v, null);
      moveStops(v);
    },
    stop: () => LINES.indexOf(line),
    reset() {
      svg = null;
      view = null;
      acted = null;
      chosen = [null, null];
      cancelAnimationFrame(counting);
    },
  };
}
