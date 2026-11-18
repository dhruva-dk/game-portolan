// The full map: the live planet itself, seen from space through a round window in a parchment panel laid over the
// game, opened from the minimap (the old game's, screens/fullmap.ts and planet.ts there). The frame draws the world
// from the eye this hands it (snapshot.ts Eye, in space); this draws only the paper and what is inked over the window.
//
// The panel stands in the middle of the screen, PANEL of its height (inside the safe area), its window in the middle,
// a drawn roundel with a saltire at its top right corner that shuts it. Round the panel the game is still seen,
// dimmed: as the frame draws the world from one eye, and while the map is open that is the map's, what is seen there
// is the game's last frame before the map opened (hold: main.ts hands the canvas over the moment it is drawn).
//
// The eye is on an orbit about the planet's centre, looking at it, north up; it opens over her ship. One finger spins
// the planet and it runs on when let go; two pinch it, from the whole planet down to its coasts; a wheel does the
// same. A tap on the panel does nothing; a tap off it, or on the roundel, shuts it. The window is cut once, for the
// whole planet seen from the farthest the eye goes (the eye's field of view set to fit), and a pinch zooms within it.
//
// Over the window, placed each frame by projecting world points with the eye's numbers: the coasts (coasts.ts), inked
// lightly over their real ground; the Storm's edge in its violet (the Storm itself is the world's own, its cloud seen from
// above); her galleon, gilt. Whatever is on the planet's far side is not shown. Beside the window, the two readings
// that matter: ships afloat and the Storm's clock.

import type { Cap } from '../sim/storm';
import { lookingAt, type Eye as Seen } from '../snapshot';
import { R, cross, dot, normalize, scale, type Vec3 } from '../world/sphere';
import type { Coast } from './coasts';
import { GLYPHS, type Prim } from './glyphs';
import { clock, type HudState } from './hud';
import { CUT, INK, PAPER, WASH, figure, galleon, glyph, roughCircle, roughRect, slip, svg } from './ink';
import { stormRing } from './minimap';
import { onTap, uiLayer } from './ui';

/** The panel's height, a share of the screen's; the room each side of the window for a reading, CSS px; the window's
 *  radius, a share of the panel's height; the close roundel's side, CSS px (over 44 pt to the touch). */
const PANEL = 0.8, SIDE = 112, WINDOW = 0.37, CLOSE = 50;
/** The eye's distance from the planet's centre at its farthest (where it opens) and nearest, in radii: from the
 *  farthest the whole planet fills the window; the nearest stays over the Storm's top (sky/storm.ts, 320 m). */
const FARTHEST = 3.2;
const NEAREST = 1 + 380 / R;
/** How fast the eye goes to the distance the fingers ask, per second; how fast a let-go spin dies, per second. */
const FLY = 12;
const DRAG = 2.5;
/** How far north or south the planet can be turned, radians: short of where north up loses its meaning. */
const MOST_LAT = 1.3;
/** A press that travels less than this is a tap, CSS px. */
const TAP = 8;

/** Swirls inked over the Storm: points spread evenly over the sphere (a Fibonacci lattice). */
const SWIRLS: Vec3[] = Array.from({ length: 60 }, (_, i) => {
  const n = 60, y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
  return [r * Math.cos(a), y, r * Math.sin(a)];
});
/** The Storm's glyph as one path: its eye and its four arms, each turned about the glyph's centre as its `tr` says. */
const SWIRL = (() => {
  const path = new Path2D();
  for (const p of GLYPHS['hud.storm'] as readonly Prim[]) {
    const turn = Number(/rotate\((\d+)/.exec(p.tr ?? '')?.[1] ?? 0);
    path.addPath(new Path2D(p.d), new DOMMatrix().translate(12, 12).rotate(turn).translate(-12, -12));
  }
  return path;
})();

/** Where the eye is turned: the point under it (radians, lat and lon as debug.ts reads them) and its spin. */
interface Turn { lat: number; lon: number; vLat: number; vLon: number }

/** The point under the eye, as a unit vector. */
const under = (t: Turn): Vec3 => [Math.cos(t.lat) * Math.cos(t.lon), Math.sin(t.lat), -Math.cos(t.lat) * Math.sin(t.lon)];

/** The eye for a frame: where it stands, its axes on the screen, and its focal length, CSS px. */
interface Eye { at: Vec3; c: Vec3; right: Vec3; up: Vec3; f: number; cx: number; cy: number; d: number }

/** The screen's safe area's insets, CSS px. */
interface Insets { top: number; right: number; bottom: number; left: number }

/** The map laid out on a screen `w` × `h`: the window (its centre, the screen's, and radius), the eye's focal length
 *  (CSS px) and field of view (degrees) that fit the whole planet in it from the farthest the eye goes, and the panel. */
interface Layout { w: number; h: number; x: number; y: number; r: number; f: number; fov: number; panel: { x: number; y: number; w: number; h: number } }

function layoutFor(w: number, h: number, safe: Insets): Layout {
  // centred on the screen (where the eye looks), inside the safe area on every side
  const roomH = h - 2 * Math.max(safe.top, safe.bottom) - 8, roomW = w - 2 * Math.max(safe.left, safe.right) - 8;
  const ph = Math.min(h * PANEL, roomH, roomW - 2 * SIDE), pw = Math.min(ph + 2 * SIDE, roomW);
  const r = ph * WINDOW, f = (r * Math.sqrt(FARTHEST * FARTHEST - 1)) / 1.03;
  return {
    w, h, x: w / 2, y: h / 2, r, f, fov: (2 * Math.atan(h / 2 / f) * 180) / Math.PI,
    panel: { x: (w - pw) / 2, y: (h - ph) / 2, w: pw, h: ph },
  };
}

function eyeFor(t: Turn, d: number, l: Layout): Eye {
  const c = under(t), fwd = scale(c, -1);
  const right = normalize(cross(fwd, [0, 1, 0]));
  return { at: scale(c, d * R), c, right, up: cross(right, fwd), f: l.f, cx: l.x, cy: l.y, d };
}

/** A point on the planet (unit vector, or any length) on the screen, and how far round the limb it is facing the
 *  eye: above 0 it is seen. */
function project(e: Eye, q: Vec3): { x: number; y: number; facing: number } {
  const u = normalize(q), p = scale(u, R), v: Vec3 = [p[0] - e.at[0], p[1] - e.at[1], p[2] - e.at[2]];
  const z = -dot(v, e.c);
  return { x: e.cx + (e.f * dot(v, e.right)) / z, y: e.cy - (e.f * dot(v, e.up)) / z, facing: dot(u, e.c) * e.d - 1 };
}

export function createGlobe(coasts: readonly Coast[]) {
  const root = document.createElement('div');
  root.className = 'screen press';
  // over the HUD; touches are the map's, not the page's
  root.style.cssText = 'display:none;z-index:2;touch-action:none';
  uiLayer().appendChild(root);
  const layer = (css: string) => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;${css}`;
    root.appendChild(el);
    return el;
  };

  // the safe area, as the page has it (--safe-* stand in for it off the phone: ui.ts)
  const safe = layer('visibility:hidden;top:var(--safe-top, env(safe-area-inset-top));right:var(--safe-right, env(safe-area-inset-right));'
    + 'bottom:var(--safe-bottom, env(safe-area-inset-bottom));left:var(--safe-left, env(safe-area-inset-left))');
  // the game round the panel, as last drawn before the map opened, dimmed; its window cut out
  const backdrop = document.createElement('canvas');
  backdrop.style.cssText = 'position:absolute;left:0;top:0';
  root.appendChild(backdrop);
  const dim = backdrop.getContext('2d')!;
  let held: HTMLCanvasElement | null = null;
  // the panel, with its window cut; laid out again only when the screen's size changes
  const sheet = layer('inset:0');
  // what is inked over the window
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;left:0;top:0';
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  // her mark
  const mark = layer('left:0;top:0;pointer-events:none');
  mark.innerHTML = svg(64, 64, `<circle cx="32" cy="32" r="27" fill="${WASH.vermilion}" fill-opacity=".9" stroke="${INK.iron}" stroke-width="1.2"/>`
    + `<circle cx="32" cy="32" r="30" fill="none" stroke="${INK.white}" stroke-opacity=".7" stroke-width="1.5"/>` + galleon(32, 28, 50, { hull: WASH.gold }));
  // the readings, each side of the window: ships afloat, and the Storm's clock
  const afloat = layer('transform:translate(-50%,-50%)'), storm = layer('transform:translate(-50%,-50%)');
  // the close roundel: a paper disc ringed in iron, a saltire inked across it
  const shut = layer(`width:${CLOSE}px;height:${CLOSE}px`);
  shut.classList.add('press');
  shut.dataset.close = '';
  const c = CLOSE / 2, a = CLOSE * 0.17, saltire = `M${c - a} ${c - a}L${c + a} ${c + a}M${c + a} ${c - a}L${c - a} ${c + a}`;
  shut.innerHTML = svg(CLOSE, CLOSE, `<path d="${roughCircle(c, c, c - 4, 11, 0.8)}" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>`
    + `<circle cx="${c}" cy="${c}" r="${c - 8}" fill="none" stroke="${INK.iron}" stroke-width=".6"/>`
    + `<path d="${saltire}" stroke="${INK.iron}" stroke-width="3.4" stroke-linecap="round"/>`
    + `<path d="${saltire}" stroke="${CUT}" stroke-width=".8" stroke-linecap="round"/>`);
  onTap(shut, () => close());

  const turn: Turn = { lat: 0, lon: 0, vLat: 0, vLon: 0 };
  let state: HudState | null = null, want = FARTHEST, d = FARTHEST, laid = '', read = '';
  let L = layoutFor(innerWidth, innerHeight, { top: 0, right: 0, bottom: 0, left: 0 });

  /** The panel: parchment framed in a double rule, its rhumb lines, and a round window cut in it inside a graduated
   *  ring; the readings beside the window and the roundel at its corner; the game round it, dimmed. */
  function lay(l: Layout) {
    const { x, y, r, w, h, panel: p } = l, band = 9;
    let rhumbs = '';
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16, ink = [INK.iron, INK.rubric, INK.green, INK.rubric][i % 4];
      rhumbs += `<path d="M${x} ${y}L${x + Math.cos(a) * p.w} ${y + Math.sin(a) * p.w}" stroke="${ink}" stroke-opacity=".22" stroke-width=".6"/>`;
    }
    let ticks = '';
    for (let i = 0; i < 72; i++) {
      const a = (i * Math.PI) / 36, l = i % 6 ? band * 0.45 : band * 0.9, c = Math.cos(a), s = Math.sin(a);
      ticks += `M${x + c * (r + 1)} ${y + s * (r + 1)}L${x + c * (r + 1 + l)} ${y + s * (r + 1 + l)}`;
    }
    const hole = `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`, edge = roughRect(p.x, p.y, p.w, p.h, 23);
    sheet.innerHTML = svg(w, h,
      `<defs><clipPath id="gl-c"><path clip-rule="evenodd" d="${edge}${hole}"/></clipPath></defs>`
      + `<path fill="url(#pg)" fill-rule="evenodd" d="${edge}${hole}" stroke="${INK.iron}" stroke-width="1.2" filter="url(#sh)"/>`
      + `<g clip-path="url(#gl-c)">${rhumbs}`
      + `<rect x="${p.x + 8}" y="${p.y + 8}" width="${p.w - 16}" height="${p.h - 16}" fill="none" stroke="${INK.iron}" stroke-width="1.2"/>`
      + `<rect x="${p.x + 12}" y="${p.y + 12}" width="${p.w - 24}" height="${p.h - 24}" fill="none" stroke="${INK.iron}" stroke-width=".5"/>`
      // the window's shade on the paper, its ring and its degrees
      + `<circle cx="${x}" cy="${y}" r="${r + band + 6}" fill="none" stroke="${INK.iron}" stroke-opacity=".12" stroke-width="10"/>`
      + `<circle cx="${x}" cy="${y}" r="${r + band / 2}" fill="${PAPER}" fill-opacity="0" stroke="${PAPER}" stroke-width="${band}"/>`
      + `<path d="${ticks}" stroke="${INK.iron}" stroke-width=".8"/>`
      + `<circle cx="${x}" cy="${y}" r="${r + 0.5}" fill="none" stroke="${INK.iron}" stroke-width="2"/>`
      + `<path d="${roughCircle(x, y, r + band + 1, 7, 0.5)}" fill="none" stroke="${INK.iron}" stroke-width="1"/></g>`);
    // each reading in the middle of the paper beside the window; the roundel over the panel's top right corner
    const side = (p.w / 2 + r + band) / 2;
    afloat.style.left = `${x - side}px`;
    storm.style.left = `${x + side}px`;
    afloat.style.top = storm.style.top = `${y}px`;
    shut.style.left = `${p.x + p.w - CLOSE * 0.72}px`;
    shut.style.top = `${p.y - CLOSE * 0.28}px`;
    const dpr = Math.min(devicePixelRatio, 3);
    for (const el of [canvas, backdrop]) {
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }
    paint();
  }

  /** The game round the panel: its last frame, dimmed, the window cut out of it (the planet is seen through it). */
  function paint() {
    const W = backdrop.width, H = backdrop.height, k = W / L.w;
    dim.globalCompositeOperation = 'source-over';
    dim.clearRect(0, 0, W, H);
    if (held) dim.drawImage(held, 0, 0, W, H);
    dim.fillStyle = 'rgba(26,16,8,.45)';
    dim.fillRect(0, 0, W, H);
    dim.globalCompositeOperation = 'destination-out';
    dim.fillStyle = '#000';
    dim.beginPath();
    dim.arc(L.x * k, L.y * k, (L.r + 2) * k, 0, Math.PI * 2);
    dim.fill();
  }

  /** A ring of points on the planet, inked as the runs of it that face the eye. */
  function trace(e: Eye, ring: readonly Vec3[], closed: boolean) {
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= ring.length - (closed ? 0 : 1); i++) {
      const p = project(e, ring[i % ring.length]);
      if (p.facing <= 0) pen = false;
      else if (pen) ctx.lineTo(p.x, p.y);
      else {
        ctx.moveTo(p.x, p.y);
        pen = true;
      }
    }
  }

  /** The ink over the window this frame. */
  function ink(e: Eye, cap: Cap, w: number, h: number) {
    const win = L, dpr = canvas.width / w;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(win.x, win.y, win.r, 0, Math.PI * 2);
    ctx.clip();
    ctx.lineJoin = 'round';
    // the coasts, a light hand over the ground
    ctx.strokeStyle = INK.iron;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    for (const coast of coasts) {
      if (dot(coast.centre, e.c) * e.d < 0.9) continue;
      trace(e, coast.ring, coast.closed);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // the Storm: swirls over its cloud, foreshortened toward the limb; its edge, a pale halo then its violet (none while
    // its calm is still the whole planet)
    if (cap.radius < Math.PI - 0.01) {
      const calm = Math.cos(cap.radius + 40 / R), s = Math.min(1.4, perRadian() / 250);
      ctx.fillStyle = 'rgba(252,246,230,.5)';
      ctx.strokeStyle = 'rgba(38,25,16,.55)';
      ctx.lineWidth = 0.8;
      for (const q of SWIRLS) {
        const p = project(e, q);
        if (p.facing < 0.15 || dot(q, cap.centre) > calm) continue;
        const k = s * Math.min(1, p.facing * 2) * 1.1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(k, k);
        ctx.rotate(p.x * 0.05);
        ctx.translate(-12, -12);
        ctx.fill(SWIRL);
        ctx.stroke(SWIRL);
        ctx.restore();
      }
      trace(e, stormRing({ centre: cap.centre, radius: cap.radius * R }, 180), true);
      ctx.strokeStyle = 'rgba(252,246,230,.75)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = INK.storm;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
    // her mark, on this side only, fading as it nears the limb
    const p = state ? project(e, state.at) : null;
    if (p && p.facing > 0 && Math.hypot(p.x - win.x, p.y - win.y) < win.r) {
      mark.style.display = 'block';
      mark.style.opacity = String(Math.min(1, p.facing / 0.04));
      mark.style.transform = `translate(${p.x - 32}px,${p.y - 32}px)`;
    } else {
      mark.style.display = 'none';
    }
  }

  function readout() {
    if (!state) return;
    const key = `${state.afloat} ${clock(state.storm)}`;
    if (key === read) return;
    read = key;
    const closing = state.storm < 30;
    afloat.innerHTML = svg(80, 96, slip(1, 1, 78, 94, { flat: true }) + glyph('hud.shipsLeft', 40, 30, 30) + figure(40, 70, state.afloat, 28));
    storm.innerHTML = svg(80, 96, slip(1, 1, 78, 94, { flat: true }) + glyph('hud.spiral', 40, 30, 30, { ink: closing ? 'storm' : 'iron' })
      + figure(40, 70, clock(state.storm), 24, { fill: closing ? INK.storm : INK.iron }));
  }

  // ── the fingers: one spins, two pinch; a press off the panel that did neither shuts the map ──
  const fingers = new Map<number, { x: number; y: number; t: number }>();
  let tap: { id: number; x: number; y: number; off: boolean } | null = null;
  /** Pixels a radian of the planet's surface spans under the eye. */
  const perRadian = () => L.f / (d - 1);
  /** Whether a point on the screen (CSS px) is off the panel. */
  const off = (x: number, y: number) => x < L.panel.x || x > L.panel.x + L.panel.w || y < L.panel.y || y > L.panel.y + L.panel.h;
  const carry = (dx: number, dy: number) => {
    const rp = perRadian(), lon = -dx / (rp * Math.max(0.2, Math.cos(turn.lat))), lat = dy / rp;
    turn.lon += lon;
    turn.lat = Math.max(-MOST_LAT, Math.min(MOST_LAT, turn.lat + lat));
    return { lon, lat };
  };

  root.addEventListener('pointerdown', (e) => {
    root.setPointerCapture(e.pointerId);
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    tap = fingers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, off: off(e.clientX, e.clientY) } : null;
    turn.vLat = turn.vLon = 0;
  });
  root.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP) tap = null;
    if (fingers.size === 1 && !tap) {
      // the ground under the finger goes with it; its speed, smoothed, is what it runs on with when let go
      const moved = carry(e.clientX - f.x, e.clientY - f.y), s = Math.max(0.004, (e.timeStamp - f.t) / 1000);
      turn.vLon = turn.vLon * 0.5 + (moved.lon / s) * 0.5;
      turn.vLat = turn.vLat * 0.5 + (moved.lat / s) * 0.5;
    } else if (fingers.size === 2) {
      let o = f;
      for (const [k, q] of fingers) if (k !== e.pointerId) o = q;
      const d0 = Math.hypot(f.x - o.x, f.y - o.y), d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      if (d0 > 8 && d1 > 8) want = 1 + Math.min(FARTHEST - 1, Math.max(NEAREST - 1, ((want - 1) * d0) / d1));
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
    // a finger held still before it lifts lets the planet go still
    if (e.timeStamp - f.t > 80 || fingers.size) turn.vLat = turn.vLon = 0;
    if (tap && tap.off && tap.id === e.pointerId && e.type === 'pointerup') close();
    tap = null;
  };
  root.addEventListener('pointerup', lift);
  root.addEventListener('pointercancel', lift);
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    want = 1 + Math.min(FARTHEST - 1, Math.max(NEAREST - 1, (want - 1) * Math.exp(e.deltaY * 0.002)));
  }, { passive: false });

  function close() {
    root.style.display = 'none';
    state = null;
    held = null;
    fingers.clear();
  }

  return {
    get open() {
      return state !== null;
    },
    /** Opens the map, the whole planet with her ship facing the eye. */
    show(s: HudState) {
      state = s;
      turn.lat = Math.asin(Math.max(-MOST_LAT, Math.min(MOST_LAT, s.at[1])));
      turn.lon = Math.atan2(-s.at[2], s.at[0]);
      turn.vLat = turn.vLon = 0;
      want = d = FARTHEST;
      read = '';
      held = null;
      // shown once the game's frame round it is held (hold)
      root.style.display = 'block';
      root.style.visibility = 'hidden';
      readout();
    },
    /** Whether the map, just opened, waits for the game's frame to show round it. */
    get waiting() {
      return state !== null && held === null;
    },
    /** The game's frame, the moment it is drawn (the world's canvas), held to show round the panel while it is open. */
    hold(picture: HTMLCanvasElement) {
      if (!state || held) return;
      held = document.createElement('canvas');
      held.width = picture.width;
      held.height = picture.height;
      held.getContext('2d')!.drawImage(picture, 0, 0);
      paint();
      root.style.visibility = '';
    },
    close,
    /** While open: follows what the HUD reads. */
    update(s: HudState) {
      if (!state) return;
      state = s;
      readout();
    },
    /**
     * Each frame, with the Storm's safe cap now: while open, turns the planet on by its spin, inks the window over it
     * and returns the eye the frame is to draw the world from; shut, null.
     */
    step(dt: number, cap: Cap): Seen | null {
      if (!state || !held) return null;
      const w = innerWidth, h = innerHeight, b = safe.getBoundingClientRect();
      const key = `${w}x${h} ${b.left},${b.top},${b.right},${b.bottom}`;
      if (laid !== key) {
        laid = key;
        L = layoutFor(w, h, { top: b.top, left: b.left, right: w - b.right, bottom: h - b.bottom });
        lay(L);
      }
      if (!fingers.size) {
        turn.lon += turn.vLon * dt;
        turn.lat = Math.max(-MOST_LAT, Math.min(MOST_LAT, turn.lat + turn.vLat * dt));
        const k = Math.exp(-DRAG * dt);
        turn.vLon *= k;
        turn.vLat *= k;
      }
      d += (want - d) * (1 - Math.exp(-FLY * dt));
      const e = eyeFor(turn, d, L);
      ink(e, cap, w, h);
      return { kind: 'space', position: e.at, orientation: lookingAt(e.at, [0, 0, 0], e.up), fov: L.fov };
    },
  };
}
