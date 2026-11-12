// The full map: the planet as the globe it is, drawn on a parchment sheet over the whole screen, opened from the
// minimap. North up, first turned to her; a drag spins it, a tap (a press that does not drag) closes it.
//
// Orthographic, in canvas 2D: the sea in its wash under a graticule, each island's coast in sand, the Storm as a dark
// wash with storm-swirls over everything outside its calm and a rubric edge round the calm, and her galleon's mark,
// gilt, where she is. Beside the globe, the two readings that matter: ships afloat and the Storm's clock.

import { R as PLANET, add, dot, frameAt, normalize, type Vec3 } from '../world/sphere';
import type { Coast } from './coasts';
import { GLYPHS, type Prim } from './glyphs';
import { clock, type HudState } from './hud';
import { INK, WASH, figure, galleon, glyph, slip, svg } from './ink';
import { stormRing } from './minimap';
import { uiLayer } from './ui';

/** Swirls laid over the Storm: points spread evenly over the sphere (a Fibonacci lattice). */
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

export function createGlobe(coasts: readonly Coast[]) {
  const root = document.createElement('div');
  root.className = 'screen press';
  // over the HUD
  root.style.cssText = 'display:none;z-index:2';
  uiLayer().appendChild(root);

  // the sheet: parchment and its rhumb lines, over everything
  const sheet = document.createElement('div');
  sheet.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%, #f7eedb 0%, #f0e2c4 60%, #d8bf90 100%)';
  root.appendChild(sheet);
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;left:0;top:0';
  root.appendChild(canvas);
  const marks = document.createElement('div');
  marks.style.cssText = 'position:absolute;left:0;top:0';
  root.appendChild(marks);
  const readings = document.createElement('div');
  readings.style.cssText = 'position:absolute;right:calc(var(--safe-right, env(safe-area-inset-right)) + 10px);top:50%;transform:translateY(-50%)';
  root.appendChild(readings);
  const ctx = canvas.getContext('2d')!;

  // what the globe is turned to: its centre, and north there
  let centre: Vec3 = [0, 0, 1], state: HudState | null = null, eye: Vec3[] = [];
  let drawn = '', read = '';

  function draw() {
    if (!state) return;
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio, 3);
    const R = Math.min(h * 0.46, w * 0.3), cx = w / 2, cy = h / 2;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const { east, north } = frameAt(centre);
    /** Screen px of a point; behind the globe, pushed out onto its limb. */
    const at = (q: Vec3): [number, number, boolean] => {
      const front = dot(q, centre) >= 0;
      let x = dot(q, east), y = dot(q, north);
      if (!front) {
        const l = Math.hypot(x, y) || 1;
        x /= l;
        y /= l;
      }
      return [cx + x * R, cy - y * R, front];
    };
    const trace = (ring: readonly Vec3[]) => {
      ctx.beginPath();
      ring.forEach((q, i) => {
        const [x, y] = at(q);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // the rhumb lines of the sheet, from a rose at the globe's centre
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16;
      ctx.strokeStyle = ['rgba(42,26,16,.22)', 'rgba(192,69,44,.22)', 'rgba(74,124,76,.22)', 'rgba(192,69,44,.22)'][i % 4];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w);
      ctx.stroke();
    }

    // the globe: the sea, shaded as a sphere
    const sea = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    sea.addColorStop(0, '#dcebe0');
    sea.addColorStop(0.7, '#a9c9c4');
    sea.addColorStop(1, '#6f9c9e');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.shadowColor = 'rgba(26,16,8,.5)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = sea;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // the graticule, every 30°
    ctx.strokeStyle = 'rgba(61,95,158,.28)';
    ctx.lineWidth = 0.8;
    const line = (f: (t: number) => Vec3) => {
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 96; i++) {
        const q = f((i / 96) * Math.PI * 2), [x, y, front] = at(q);
        if (front && pen) ctx.lineTo(x, y);
        else if (front) ctx.moveTo(x, y);
        pen = front;
      }
      ctx.stroke();
    };
    for (let lat = -60; lat <= 60; lat += 30) {
      const p = (lat * Math.PI) / 180;
      line((t) => [Math.cos(p) * Math.cos(t), Math.sin(p), -Math.cos(p) * Math.sin(t)]);
    }
    for (let lon = 0; lon < 180; lon += 30) {
      const l = (lon * Math.PI) / 180;
      line((t) => [Math.cos(t) * Math.cos(l), Math.sin(t), -Math.cos(t) * Math.sin(l)]);
    }

    // the islands
    for (const coast of coasts) {
      if (dot(coast.centre, centre) < -0.2) continue;
      trace(coast.ring);
      ctx.fillStyle = WASH.sand;
      ctx.fill();
      ctx.strokeStyle = WASH.shore;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // the Storm: everything outside the calm, darkened and swirling; the calm's edge in rubric
    if (state.eye) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      eye.forEach((q, i) => {
        const [x, y] = at(q);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(70,44,86,.55)';
      ctx.fill('evenodd');
      ctx.clip('evenodd');
      const calm = Math.cos(state.eye.radius / PLANET);
      for (const q of SWIRLS) {
        if (dot(q, centre) < 0.15 || dot(q, state.eye.centre) > calm - 0.05) continue;
        const [x, y] = at(q), k = 1.1 * dot(q, centre) + 0.5;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(k, k);
        ctx.rotate(x * 0.05);
        ctx.translate(-12, -12);
        ctx.fillStyle = 'rgba(252,246,230,.55)';
        ctx.strokeStyle = 'rgba(38,25,16,.6)';
        ctx.lineWidth = 0.8;
        ctx.fill(SWIRL);
        ctx.stroke(SWIRL);
        ctx.restore();
      }
      ctx.restore();
      trace(eye);
      ctx.strokeStyle = 'rgba(252,246,230,.8)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = INK.rubric;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();

    // the globe's rim, ruled twice
    ctx.strokeStyle = INK.iron;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 5, 0, Math.PI * 2);
    ctx.stroke();

    // her mark, gilt, while she is on this side
    const [x, y, front] = at(state.at);
    marks.innerHTML = front ? svg(w, h, `<circle cx="${x}" cy="${y}" r="24" fill="${WASH.gold}" fill-opacity=".35" stroke="${INK.iron}" stroke-width="1"/>`
      + galleon(x, y - 4, 44, { hull: WASH.gold })) : '';
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

  // a drag spins the globe; a press that never drags closes it
  let press: { id: number; x: number; y: number; moved: boolean } | null = null;
  root.addEventListener('pointerdown', (e) => {
    root.setPointerCapture(e.pointerId);
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  });
  root.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.moved && Math.hypot(dx, dy) < 8) return;
    press.moved = true;
    press.x = e.clientX;
    press.y = e.clientY;
    const R = Math.min(innerHeight * 0.46, innerWidth * 0.3), { east, north } = frameAt(centre);
    // drag the surface under the finger: the centre moves against it
    centre = normalize(add(add(centre, east, -dx / R), north, dy / R));
    draw();
  });
  root.addEventListener('pointerup', (e) => {
    if (press && e.pointerId === press.id && !press.moved) close();
    press = null;
  });

  function close() {
    root.style.display = 'none';
    state = null;
  }

  return {
    get open() {
      return state !== null;
    },
    /** Opens the map, turned to her. */
    show(s: HudState) {
      state = s;
      centre = s.at;
      eye = s.eye ? stormRing(s.eye, 128) : [];
      drawn = read = '';
      root.style.display = 'block';
      draw();
      readout();
    },
    close,
    /** While open: follows what the HUD reads. */
    update(s: HudState) {
      if (!state) return;
      state = s;
      const key = `${s.at.map((v) => v.toFixed(4))}`;
      if (key !== drawn) {
        drawn = key;
        draw();
      }
      readout();
    },
  };
}

