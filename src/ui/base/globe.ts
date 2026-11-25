import type { Status } from '../../play/player.ts';
import { lookingAt, type Eye, type StormDraw } from '../../render/snapshot.ts';
import { clamp, smoother } from '../../world/scalar.ts';
import { rotate } from '../../world/turn.ts';
import {
  R,
  add,
  along,
  arc,
  cross,
  dot,
  length,
  normalize,
  scale,
  type Vec3,
} from '../../world/sphere.ts';
import {
  createRings,
  head,
  strokeNext,
  strokeWay,
  traceWay,
  wayHead,
  wayIn,
} from './calm.ts';
import type { Coast } from './coasts.ts';
import { GLYPHS, stormMark } from './glyphs.ts';
import { clock } from './clock.ts';
import {
  CUT,
  INK,
  PAPER,
  SHADOW,
  alpha,
  figure,
  glyph,
  roughCircle,
  roughRect,
  slip,
  svg,
  svgNode,
  uid,
} from './ink.ts';
import { rhumbs } from './marks.ts';
import { dragged, onTap } from './touch.ts';
import { insets, onResize, screen, view, type Insets } from './ui.ts';

type GlobeState = Pick<
  Status,
  'at' | 'heading' | 'afloat' | 'storm' | 'closing' | 'eye' | 'next'
>;

const PANEL = 0.8,
  SIDE = 112,
  WINDOW = 0.37,
  CLOSE = 50;
const MARK = 10;
const WAY_STEP = 12;
const FARTHEST = 3.2,
  NEAREST = 1 + 380 / R;
const FLY = 12,
  DRAG = 2.5;
const MOST_LAT = 1.3;
const latitude = (lat: number) => clamp(lat, -MOST_LAT, MOST_LAT);
const reach = (d: number) => clamp(d, NEAREST, FARTHEST);
const INKS = {
  swirl: alpha(INK.white, 0.5),
  swirlLine: alpha(INK.iron, 0.55),
  halo: alpha(INK.white, 0.75),
} as const;
const DEGREES = 180 / Math.PI;

const SWIRLS: Vec3[] = Array.from({ length: 60 }, (_, i) => {
  const n = 60,
    y = 1 - (2 * (i + 0.5)) / n,
    r = Math.sqrt(1 - y * y),
    a = i * Math.PI * (3 - Math.sqrt(5));
  return [r * Math.cos(a), y, r * Math.sin(a)];
});
export const SWIRL = (() => {
  const path = new Path2D();
  for (const p of GLYPHS.storm) {
    const turn = Number(/rotate\((\d+)/.exec(p.tr ?? '')?.[1] ?? 0);
    path.addPath(
      new Path2D(p.d),
      new DOMMatrix().translate(12, 12).rotate(turn).translate(-12, -12)
    );
  }
  return path;
})();

interface Spin {
  lat: number;
  lon: number;
  vLat: number;
  vLon: number;
}

const under = (t: Spin): Vec3 => [
  Math.cos(t.lat) * Math.cos(t.lon),
  Math.sin(t.lat),
  -Math.cos(t.lat) * Math.sin(t.lon),
];

export interface Sight {
  at: Vec3;
  c: Vec3;
  right: Vec3;
  up: Vec3;
  f: number;
  cx: number;
  cy: number;
  d: number;
}

interface Layout {
  w: number;
  h: number;
  k: number;
  x: number;
  y: number;
  r: number;
  f: number;
  fov: number;
  panel: { x: number; y: number; w: number; h: number };
}

function layoutFor(w: number, h: number, k: number, safe: Insets): Layout {
  const roomH = h - 2 * Math.max(safe.top, safe.bottom) - 8,
    roomW = w - 2 * Math.max(safe.left, safe.right) - 8;
  const ph = Math.min(h * PANEL, roomH, roomW - 2 * SIDE * k),
    pw = Math.min(ph + 2 * SIDE * k, roomW);
  const r = ph * WINDOW,
    f = (r * Math.sqrt(FARTHEST * FARTHEST - 1)) / 1.03;
  return {
    w,
    h,
    k,
    x: w / 2,
    y: h / 2,
    r,
    f,
    fov: 2 * Math.atan(h / 2 / f) * DEGREES,
    panel: { x: (w - pw) / 2, y: (h - ph) / 2, w: pw, h: ph },
  };
}

function eyeFor(t: Spin, d: number, l: Layout): Sight {
  const c = under(t),
    fwd = scale(c, -1);
  const right = normalize(cross(fwd, [0, 1, 0]));
  return {
    at: scale(c, d * R),
    c,
    right,
    up: cross(right, fwd),
    f: l.f,
    cx: l.x,
    cy: l.y,
    d,
  };
}

export interface Seen {
  x: number;
  y: number;
  facing: number;
}
const toward: [number, number, number] = [0, 0, 0];

export function project(e: Sight, q: Vec3, out: Seen): Seen {
  const n = length(q),
    s = R / n;
  toward[0] = q[0] * s - e.at[0];
  toward[1] = q[1] * s - e.at[1];
  toward[2] = q[2] * s - e.at[2];
  const z = -dot(toward, e.c);
  out.x = e.cx + (e.f * dot(toward, e.right)) / z;
  out.y = e.cy - (e.f * dot(toward, e.up)) / z;
  out.facing = (dot(q, e.c) / n) * e.d - 1;
  return out;
}

export const focal = (radius: number) =>
  (radius * Math.sqrt(FARTHEST * FARTHEST - 1)) / 1.03;

export const seenRadius = (sight: Sight) =>
  sight.f / Math.sqrt(sight.d * sight.d - 1);

export function sightOf(
  orbit: Orbit,
  f: number,
  cx: number,
  cy: number
): Sight {
  const c = under(orbit.spin),
    fwd = scale(c, -1);
  const right = normalize(cross(fwd, [0, 1, 0]));
  return {
    at: scale(c, orbit.d * R),
    c,
    right,
    up: cross(right, fwd),
    f,
    cx,
    cy,
    d: orbit.d,
  };
}

export function spaceEye(
  sight: Sight,
  h: number,
  center: readonly [number, number]
): Eye {
  return {
    kind: 'space',
    position: sight.at,
    orientation: lookingAt(sight.at, [0, 0, 0], sight.up),
    fov: 2 * Math.atan(h / 2 / sight.f) * DEGREES,
    center,
  };
}

const AIR = 200;

export function flight(from: Eye, to: Eye, s: number): Eye {
  const r0 = Math.log(length(from.position)),
    r1 = Math.log(length(to.position)),
    r = r0 + (r1 - r0) * s;
  const position = scale(
    arc(normalize(from.position), normalize(to.position), s),
    Math.exp(r)
  );
  const ahead = rotate([0, 0, -1], from.orientation),
    target0 = add(from.position, ahead, 60),
    look = smoother(clamp((s - 0.1) / 0.75)),
    target = scale(target0, 1 - look);
  const up = normalize(
    add(
      scale(normalize(from.position), 1 - look),
      rotate([0, 1, 0], to.orientation),
      look
    )
  );
  const c0 = from.center ?? [0, 0],
    c1 = to.center ?? [0, 0],
    k0 = from.size ?? 1,
    k1 = to.size ?? 1;
  return {
    kind: Math.exp(r) - R > AIR ? 'space' : 'air',
    position,
    orientation: lookingAt(position, target, up),
    fov: from.fov + (to.fov - from.fov) * s,
    center: [c0[0] + (c1[0] - c0[0]) * s, c0[1] + (c1[1] - c0[1]) * s],
    size: k0 + (k1 - k0) * s,
  };
}

export interface Orbit {
  readonly spin: Spin;
  readonly d: number;
  readonly held: boolean;
  aim(at: Vec3): void;
  reset(at: Vec3): void;
  clear(): void;
  step(dt: number): void;
}

export function createOrbit(
  root: HTMLElement,
  o: { f(): number; tap?(x: number, y: number): void }
): Orbit {
  const spin: Spin = { lat: 0, lon: 0, vLat: 0, vLon: 0 };
  let want = FARTHEST,
    d = FARTHEST;
  const fingers = new Map<number, { x: number; y: number; t: number }>();
  let tap: { id: number; x: number; y: number } | null = null;
  const perRadian = () => o.f() / (d - 1);
  const carry = (dx: number, dy: number) => {
    const rp = perRadian(),
      lon = -dx / (rp * Math.max(0.2, Math.cos(spin.lat))),
      lat = dy / rp;
    spin.lon += lon;
    spin.lat = latitude(spin.lat + lat);
    return { lon, lat };
  };

  root.addEventListener('pointerdown', (e) => {
    root.setPointerCapture(e.pointerId);
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    tap =
      fingers.size === 1
        ? { id: e.pointerId, x: e.clientX, y: e.clientY }
        : null;
    spin.vLat = spin.vLon = 0;
  });
  root.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    if (tap && dragged(tap.x, tap.y, e.clientX, e.clientY)) tap = null;
    if (fingers.size === 1 && !tap) {
      const moved = carry(e.clientX - f.x, e.clientY - f.y),
        s = Math.max(0.004, (e.timeStamp - f.t) / 1000);
      spin.vLon = spin.vLon * 0.5 + (moved.lon / s) * 0.5;
      spin.vLat = spin.vLat * 0.5 + (moved.lat / s) * 0.5;
    } else if (fingers.size === 2) {
      let other = f;
      for (const [k, q] of fingers) if (k !== e.pointerId) other = q;
      const d0 = Math.hypot(f.x - other.x, f.y - other.y),
        d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (d0 > 8 && d1 > 8) want = reach(1 + ((want - 1) * d0) / d1);
      carry((e.clientX - f.x) / 2, (e.clientY - f.y) / 2);
    }
    f.x = e.clientX;
    f.y = e.clientY;
    f.t = e.timeStamp;
  });
  const lift = (e: PointerEvent) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    fingers.delete(e.pointerId);
    if (e.timeStamp - f.t > 80 || fingers.size) spin.vLat = spin.vLon = 0;
    if (tap && tap.id === e.pointerId && e.type === 'pointerup')
      o.tap?.(tap.x, tap.y);
    tap = null;
  };
  root.addEventListener('pointerup', lift);
  root.addEventListener('pointercancel', lift);
  root.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      want = reach(1 + (want - 1) * Math.exp(e.deltaY * 0.002));
    },
    { passive: false }
  );

  const aim = (at: Vec3) => {
    const u = normalize(at);
    spin.lat = latitude(Math.asin(u[1]));
    spin.lon = Math.atan2(-u[2], u[0]);
    spin.vLat = spin.vLon = 0;
  };

  return {
    spin,
    get d() {
      return d;
    },
    get held() {
      return fingers.size > 0;
    },
    aim,
    reset(at) {
      aim(at);
      want = d = FARTHEST;
    },
    clear() {
      fingers.clear();
      tap = null;
    },
    step(dt) {
      if (!fingers.size) {
        spin.lon += spin.vLon * dt;
        spin.lat = latitude(spin.lat + spin.vLat * dt);
        const k = Math.exp(-DRAG * dt);
        spin.vLon *= k;
        spin.vLat *= k;
      }
      d += (want - d) * (1 - Math.exp(-FLY * dt));
    },
  };
}

export function createGlobe(coasts: readonly Coast[]) {
  const root = screen(true);
  root.style.zIndex = '2';
  root.style.touchAction = 'none';
  const layer = (css: string) => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;${css}`;
    root.appendChild(el);
    return el;
  };

  const backdrop = document.createElement('canvas');
  backdrop.style.cssText = 'position:absolute;left:0;top:0';
  root.appendChild(backdrop);
  const dim = backdrop.getContext('2d')!;
  let held: HTMLCanvasElement | null = null;
  const sheet = layer('inset:0');
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;left:0;top:0';
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const mark = layer(`left:-${MARK}px;top:-${MARK}px`);
  mark.innerHTML = svg(
    MARK * 2,
    MARK * 2,
    `<path transform="translate(${MARK} ${MARK})" d="${head(6)}" fill="${INK.white}" stroke="${INK.iron}" stroke-width="1.3" stroke-linejoin="round"/>`
  );
  const afloat = layer(''),
    storm = layer('');
  afloat.className = storm.className = 'mark';
  const shut = layer('');
  shut.className = 'mark press';
  shut.dataset.close = '';
  const c = CLOSE / 2,
    a = CLOSE * 0.17,
    saltire = `M${c - a} ${c - a}L${c + a} ${c + a}M${c + a} ${c - a}L${c - a} ${c + a}`;
  shut.innerHTML = svg(
    CLOSE,
    CLOSE,
    `<path d="${roughCircle(c, c, c - 4, 11, 0.8)}" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>` +
      `<circle cx="${c}" cy="${c}" r="${c - 8}" fill="none" stroke="${INK.iron}" stroke-width=".6"/>` +
      `<path d="${saltire}" stroke="${INK.iron}" stroke-width="3.4" stroke-linecap="round"/>` +
      `<path d="${saltire}" stroke="${CUT}" stroke-width=".8" stroke-linecap="round"/>`
  );
  onTap(shut, () => close());

  let state: GlobeState | null = null,
    read = '';
  let L = layoutFor(1, 1, 1, { top: 0, right: 0, bottom: 0, left: 0 });
  const seen: Seen = { x: 0, y: 0, facing: 0 };
  const rings = createRings(4);
  const ahead: Seen = { x: 0, y: 0, facing: 0 };

  function lay() {
    L = layoutFor(view.w, view.h, view.k, insets());
    const { w, h, k } = L,
      x = L.x / k,
      y = L.y / k,
      r = L.r / k,
      band = 9,
      clip = uid('globe');
    const p = {
      x: L.panel.x / k,
      y: L.panel.y / k,
      w: L.panel.w / k,
      h: L.panel.h / k,
    };
    let ticks = '';
    for (let i = 0; i < 72; i++) {
      const a = (i * Math.PI) / 36,
        l = i % 6 ? band * 0.45 : band * 0.9,
        c = Math.cos(a),
        s = Math.sin(a);
      ticks += `M${x + c * (r + 1)} ${y + s * (r + 1)}L${x + c * (r + 1 + l)} ${y + s * (r + 1 + l)}`;
    }
    const hole = `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`,
      edge = roughRect(p.x, p.y, p.w, p.h, 23);
    const drawn = svgNode(
      w / k,
      h / k,
      `<defs><clipPath id="${clip}"><path clip-rule="evenodd" d="${edge}${hole}"/></clipPath></defs>` +
        `<path fill="url(#pg)" fill-rule="evenodd" d="${edge}${hole}" stroke="${INK.iron}" stroke-width="1.2" filter="url(#sh)"/>` +
        `<g clip-path="url(#${clip})">${rhumbs(x, y, p.w, 0.22)}` +
        `<rect x="${p.x + 8}" y="${p.y + 8}" width="${p.w - 16}" height="${p.h - 16}" fill="none" stroke="${INK.iron}" stroke-width="1.2"/>` +
        `<rect x="${p.x + 12}" y="${p.y + 12}" width="${p.w - 24}" height="${p.h - 24}" fill="none" stroke="${INK.iron}" stroke-width=".5"/>` +
        `<circle cx="${x}" cy="${y}" r="${r + band + 6}" fill="none" stroke="${INK.iron}" stroke-opacity=".12" stroke-width="10"/>` +
        `<circle cx="${x}" cy="${y}" r="${r + band / 2}" fill="${PAPER}" fill-opacity="0" stroke="${PAPER}" stroke-width="${band}"/>` +
        `<path d="${ticks}" stroke="${INK.iron}" stroke-width=".8"/>` +
        `<circle cx="${x}" cy="${y}" r="${r + 0.5}" fill="none" stroke="${INK.iron}" stroke-width="2"/>` +
        `<path d="${roughCircle(x, y, r + band + 1, 7, 0.5)}" fill="none" stroke="${INK.iron}" stroke-width="1"/></g>`
    );
    drawn.setAttribute('width', `${w}`);
    drawn.setAttribute('height', `${h}`);
    sheet.replaceChildren(drawn);
    const side = ((p.w / 2 + r + band) / 2) * k;
    afloat.style.left = `${L.x - side}px`;
    storm.style.left = `${L.x + side}px`;
    afloat.style.top = storm.style.top = `${L.y}px`;
    shut.style.left = `${L.panel.x + L.panel.w - CLOSE * 0.22 * k}px`;
    shut.style.top = `${L.panel.y + CLOSE * 0.22 * k}px`;
    const dpr = Math.min(view.dpr, 3);
    for (const el of [canvas, backdrop]) {
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }
    paint();
  }
  onResize(() => {
    if (state) lay();
  });

  function paint() {
    const W = backdrop.width,
      H = backdrop.height,
      k = W / L.w;
    dim.globalCompositeOperation = 'source-over';
    dim.clearRect(0, 0, W, H);
    if (held) dim.drawImage(held, 0, 0, W, H);
    dim.fillStyle = alpha(SHADOW, 0.45);
    dim.fillRect(0, 0, W, H);
    dim.globalCompositeOperation = 'destination-out';
    dim.fillStyle = INK.iron;
    dim.beginPath();
    dim.arc(L.x * k, L.y * k, (L.r + 2) * k, 0, Math.PI * 2);
    dim.fill();
  }

  function trace(e: Sight, ring: readonly Vec3[], closed: boolean) {
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= ring.length - (closed ? 0 : 1); i++) {
      const p = project(e, ring[i % ring.length], seen);
      if (p.facing <= 0) pen = false;
      else if (pen) ctx.lineTo(p.x, p.y);
      else {
        ctx.moveTo(p.x, p.y);
        pen = true;
      }
    }
  }

  function ink(e: Sight, cap: StormDraw) {
    const win = L,
      dpr = canvas.width / L.w,
      k = L.k;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.w, L.h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(win.x, win.y, win.r, 0, Math.PI * 2);
    ctx.clip();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK.iron;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = k;
    for (const coast of coasts) {
      if (dot(coast.center, e.c) * e.d < 0.9) continue;
      trace(e, coast.ring, false);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (cap.radius < Math.PI - 0.01) {
      const calm = Math.cos(cap.radius + 40 / R),
        s = Math.min(1.4, perRadian() / 250);
      ctx.fillStyle = INKS.swirl;
      ctx.strokeStyle = INKS.swirlLine;
      ctx.lineWidth = 0.8;
      for (const q of SWIRLS) {
        const p = project(e, q, seen);
        if (p.facing < 0.15 || dot(q, cap.center) > calm) continue;
        const size = s * Math.min(1, p.facing * 2) * 1.1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(size, size);
        ctx.rotate(p.x * 0.05);
        ctx.translate(-12, -12);
        ctx.fill(SWIRL);
        ctx.stroke(SWIRL);
        ctx.restore();
      }
      trace(e, rings(cap.center, cap.radius * R), true);
      ctx.strokeStyle = INKS.halo;
      ctx.lineWidth = 6 * k;
      ctx.stroke();
      ctx.strokeStyle = INK.storm;
      ctx.lineWidth = 3 * k;
      ctx.stroke();
    }
    if (state) calms(e, state, k);
    ctx.restore();
    const p = state ? project(e, state.at, seen) : null;
    const shown =
      !!p && p.facing > 0 && Math.hypot(p.x - win.x, p.y - win.y) < win.r;
    mark.hidden = !shown;
    if (state && p && shown) {
      const q = project(e, along(state.at, state.heading, 1).p, ahead),
        turn = Math.atan2(q.x - p.x, p.y - q.y) * DEGREES;
      mark.style.opacity = Math.min(1, p.facing / 0.04).toFixed(2);
      mark.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) scale(${k.toFixed(3)}) rotate(${turn.toFixed(1)}deg)`;
    }
  }

  function calms(e: Sight, s: GlobeState, k: number) {
    const next = s.next && s.next.radius < R * Math.PI * 0.99 ? s.next : null;
    if (next) {
      trace(e, rings(next.center, next.radius), true);
      strokeNext(ctx, k);
    }
    const calm = s.eye.radius < R * Math.PI * 0.99 ? s.eye : null,
      goal = next ?? calm,
      w = goal && wayIn(s.at, goal);
    if (!w) return;
    const tip = traceWay(ctx, s.at, w, WAY_STEP, (q) => {
      const p = project(e, q, seen);
      return p.facing > 0 ? p : null;
    });
    strokeWay(ctx, k);
    if (tip) wayHead(ctx, tip, k);
  }

  function readout() {
    if (!state) return;
    const key = `${state.afloat} ${clock(state.storm)} ${state.closing}`;
    if (key === read) return;
    read = key;
    const closing = state.closing || state.storm < 30;
    afloat.innerHTML = svg(
      80,
      96,
      slip(1, 1, 78, 94, { flat: true }) +
        glyph('ship', 40, 30, 30) +
        figure(40, 70, state.afloat, 28)
    );
    storm.innerHTML = svg(
      80,
      96,
      slip(1, 1, 78, 94, { flat: true }) +
        glyph(stormMark(state.closing), 40, 30, 32, {
          ink: closing ? 'storm' : 'iron',
        }) +
        figure(40, 70, clock(state.storm), 24, {
          fill: closing ? INK.storm : INK.iron,
        })
    );
  }

  const off = (x: number, y: number) =>
    x < L.panel.x ||
    x > L.panel.x + L.panel.w ||
    y < L.panel.y ||
    y > L.panel.y + L.panel.h;
  const orbit = createOrbit(root, {
    f: () => L.f,
    tap: (x, y) => {
      if (off(x, y)) close();
    },
  });
  const perRadian = () => L.f / (orbit.d - 1);

  function close() {
    root.hidden = true;
    state = null;
    held = null;
    orbit.clear();
  }

  return {
    get open() {
      return state !== null;
    },
    show(s: GlobeState) {
      state = s;
      orbit.reset(s.at);
      read = '';
      held = null;
      lay();
      readout();
    },
    get waiting() {
      return state !== null && held === null;
    },
    hold(picture: HTMLCanvasElement) {
      if (!state || held) return;
      held = document.createElement('canvas');
      held.width = picture.width;
      held.height = picture.height;
      held.getContext('2d')!.drawImage(picture, 0, 0);
      paint();
      root.hidden = false;
    },
    close,
    update(s: GlobeState) {
      if (!state) return;
      state = s;
      readout();
    },
    step(dt: number, cap: StormDraw): Eye | null {
      if (!state || !held) return null;
      orbit.step(dt);
      const e = eyeFor(orbit.spin, orbit.d, L);
      ink(e, cap);
      return {
        kind: 'space',
        position: e.at,
        orientation: lookingAt(e.at, [0, 0, 0], e.up),
        fov: L.fov,
      };
    },
  };
}
