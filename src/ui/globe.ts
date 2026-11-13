// The full map: the live planet itself, seen from space through a round window in a parchment sheet over the whole
// screen, opened from the minimap (the old game's, screens/fullmap.ts and planet.ts there). The frame draws the world
// from the eye this hands it (snapshot.ts Eye, in space); this draws only the paper and what is inked over the window.
//
// The eye is on an orbit about the planet's centre, looking at it, north up; it opens over her ship. One finger spins
// the planet and it runs on when let go; two pinch it, from the whole planet down to its coasts; a wheel does the
// same; a tap (a press that neither spun nor pinched) shuts it. The window is cut once, for the whole planet seen
// from the farthest the eye goes, and a pinch zooms within it.
//
// Over the window, placed each frame by projecting world points with the eye's numbers: the islands' coasts, inked
// lightly over their real ground; the Storm's edge in rubric (the Storm itself is the world's own, its cloud seen from
// above); her galleon, gilt. Whatever is on the planet's far side is not shown. Beside the window, the two readings
// that matter: ships afloat and the Storm's clock.

import type { Cap } from '../sim/storm';
import { lookingAt, type Eye as Seen } from '../snapshot';
import { R, cross, dot, normalize, scale, type Vec3 } from '../world/sphere';
import type { Coast } from './coasts';
import { GLYPHS, type Prim } from './glyphs';
import { clock, type HudState } from './hud';
import { INK, PAPER, WASH, figure, galleon, glyph, roughCircle, slip, svg } from './ink';
import { stormRing } from './minimap';
import { uiLayer } from './ui';

/** The eye's vertical field of view, degrees. */
const FOV = 40;
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

function eyeFor(t: Turn, d: number, w: number, h: number): Eye {
  const c = under(t), fwd = scale(c, -1);
  const right = normalize(cross(fwd, [0, 1, 0]));
  return { at: scale(c, d * R), c, right, up: cross(right, fwd), f: h / 2 / Math.tan((FOV * Math.PI) / 360), cx: w / 2, cy: h / 2, d };
}

/** A point on the planet (unit vector, or any length) on the screen, and how far round the limb it is facing the
 *  eye: above 0 it is seen. */
function project(e: Eye, q: Vec3): { x: number; y: number; facing: number } {
  const u = normalize(q), p = scale(u, R), v: Vec3 = [p[0] - e.at[0], p[1] - e.at[1], p[2] - e.at[2]];
  const z = -dot(v, e.c);
  return { x: e.cx + (e.f * dot(v, e.right)) / z, y: e.cy - (e.f * dot(v, e.up)) / z, facing: dot(u, e.c) * e.d - 1 };
}

/** The window: centred, round, as wide as the whole planet from the farthest the eye goes. */
function windowFor(w: number, h: number) {
  const f = h / 2 / Math.tan((FOV * Math.PI) / 360);
  return { x: w / 2, y: h / 2, r: (f / Math.sqrt(FARTHEST * FARTHEST - 1)) * 1.03 };
}

export function createGlobe(coasts: readonly Coast[]) {
  const root = document.createElement('div');
  root.className = 'screen press';
  // over the HUD; touches are the map's, not the page's
  root.style.cssText = 'display:none;z-index:2;touch-action:none';
  uiLayer().appendChild(root);

  // the sheet, with its window cut; laid out again only when the screen's size changes
  const sheet = document.createElement('div');
  sheet.style.cssText = 'position:absolute;inset:0';
  root.appendChild(sheet);
  // what is inked over the window
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;left:0;top:0';
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  // her mark
  const mark = document.createElement('div');
  mark.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
  mark.innerHTML = svg(64, 64, `<circle cx="32" cy="32" r="27" fill="${WASH.gold}" fill-opacity=".45" stroke="${INK.iron}" stroke-width="1.2"/>`
    + `<circle cx="32" cy="32" r="30" fill="none" stroke="${INK.white}" stroke-opacity=".7" stroke-width="1.5"/>` + galleon(32, 28, 50, { hull: WASH.gold }));
  root.appendChild(mark);
  const readings = document.createElement('div');
  readings.style.cssText = 'position:absolute;right:calc(var(--safe-right, env(safe-area-inset-right)) + 10px);top:50%;transform:translateY(-50%)';
  root.appendChild(readings);

  const turn: Turn = { lat: 0, lon: 0, vLat: 0, vLon: 0 };
  let state: HudState | null = null, want = FARTHEST, d = FARTHEST, laid = '', read = '';

  /** The sheet: parchment over the screen, its rhumb lines, and a round window cut in it inside a graduated ring. */
  function lay(w: number, h: number) {
    const win = windowFor(w, h), { x, y, r } = win, band = 9;
    let rhumbs = '';
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16, ink = [INK.iron, INK.rubric, INK.green, INK.rubric][i % 4];
      rhumbs += `<path d="M${x} ${y}L${x + Math.cos(a) * w * 1.2} ${y + Math.sin(a) * w * 1.2}" stroke="${ink}" stroke-opacity=".22" stroke-width=".6"/>`;
    }
    let ticks = '';
    for (let i = 0; i < 72; i++) {
      const a = (i * Math.PI) / 36, l = i % 6 ? band * 0.45 : band * 0.9, c = Math.cos(a), s = Math.sin(a);
      ticks += `M${x + c * (r + 1)} ${y + s * (r + 1)}L${x + c * (r + 1 + l)} ${y + s * (r + 1 + l)}`;
    }
    const hole = `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    sheet.innerHTML = svg(w, h,
      '<defs><radialGradient id="gl-p" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#f7eedb"/><stop offset=".6" stop-color="#f0e2c4"/><stop offset="1" stop-color="#d8bf90"/></radialGradient>'
      + `<clipPath id="gl-c"><path clip-rule="evenodd" d="M-9 -9H${w + 9}V${h + 9}H-9Z${hole}"/></clipPath></defs>`
      + `<path fill="url(#gl-p)" fill-rule="evenodd" d="M-9 -9H${w + 9}V${h + 9}H-9Z${hole}"/>`
      + `<g clip-path="url(#gl-c)">${rhumbs}`
      // the window's shade on the paper, its ring and its degrees
      + `<circle cx="${x}" cy="${y}" r="${r + band + 6}" fill="none" stroke="${INK.iron}" stroke-opacity=".12" stroke-width="10"/>`
      + `<circle cx="${x}" cy="${y}" r="${r + band / 2}" fill="${PAPER}" fill-opacity="0" stroke="${PAPER}" stroke-width="${band}"/>`
      + `<path d="${ticks}" stroke="${INK.iron}" stroke-width=".8"/>`
      + `<circle cx="${x}" cy="${y}" r="${r + 0.5}" fill="none" stroke="${INK.iron}" stroke-width="2"/>`
      + `<path d="${roughCircle(x, y, r + band + 1, 7, 0.5)}" fill="none" stroke="${INK.iron}" stroke-width="1"/></g>`);
    const dpr = Math.min(devicePixelRatio, 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
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
    const win = windowFor(w, h), dpr = canvas.width / w;
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
      trace(e, coast.ring, true);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // the Storm: swirls over its cloud, foreshortened toward the limb; its edge, a pale halo then rubric (none while
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
      ctx.strokeStyle = INK.rubric;
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
    readings.innerHTML = svg(120, 110, slip(1, 1, 118, 108, {})
      + glyph('hud.shipsLeft', 30, 34, 30) + figure(80, 34, state.afloat, 28)
      + glyph('hud.spiral', 30, 76, 30, { ink: closing ? 'rubric' : 'iron' }) + figure(80, 76, clock(state.storm), 26, { fill: closing ? INK.rubric : INK.iron }));
  }

  // ── the fingers: one spins, two pinch, a press that did neither shuts the map ──
  const fingers = new Map<number, { x: number; y: number; t: number }>();
  let tap: { id: number; x: number; y: number } | null = null;
  /** Pixels a radian of the planet's surface spans under the eye. */
  const perRadian = () => innerHeight / 2 / Math.tan((FOV * Math.PI) / 360) / (d - 1);
  const carry = (dx: number, dy: number) => {
    const rp = perRadian(), lon = -dx / (rp * Math.max(0.2, Math.cos(turn.lat))), lat = dy / rp;
    turn.lon += lon;
    turn.lat = Math.max(-MOST_LAT, Math.min(MOST_LAT, turn.lat + lat));
    return { lon, lat };
  };

  root.addEventListener('pointerdown', (e) => {
    root.setPointerCapture(e.pointerId);
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    tap = fingers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
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
    if (tap && tap.id === e.pointerId && e.type === 'pointerup') close();
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
      root.style.display = 'block';
      readout();
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
      if (!state) return null;
      const w = innerWidth, h = innerHeight;
      if (laid !== `${w}x${h}`) {
        laid = `${w}x${h}`;
        lay(w, h);
      }
      if (!fingers.size) {
        turn.lon += turn.vLon * dt;
        turn.lat = Math.max(-MOST_LAT, Math.min(MOST_LAT, turn.lat + turn.vLat * dt));
        const k = Math.exp(-DRAG * dt);
        turn.vLon *= k;
        turn.vLat *= k;
      }
      d += (want - d) * (1 - Math.exp(-FLY * dt));
      const e = eyeFor(turn, d, w, h);
      ink(e, cap, w, h);
      return { kind: 'space', position: e.at, orientation: lookingAt(e.at, [0, 0, 0], e.up), fov: FOV };
    },
  };
}
