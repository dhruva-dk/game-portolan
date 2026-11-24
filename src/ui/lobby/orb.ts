import type { Chart } from '../../play/player.ts';
import { clamp } from '../../world/scalar.ts';
import { INK, LAND, WASH, alpha } from '../base/ink.ts';
import { onDrag } from '../base/touch.ts';
import { view } from '../base/ui.ts';

const MOST_LAT = 1.2,
  DRAG = 2.2,
  STILL = 0.01;
const TILT = 0.25;

const GRATICULE = (() => {
  const points: number[] = [],
    runs = [0];
  const ring = (at: (t: number) => [number, number, number]) => {
    for (let i = 0; i <= 72; i++) points.push(...at((i / 72) * Math.PI * 2));
    runs.push(points.length / 3);
  };
  for (const lat of [-60, -30, 0, 30, 60].map((d) => (d * Math.PI) / 180))
    ring((t) => [
      Math.cos(lat) * Math.cos(t),
      Math.sin(lat),
      Math.cos(lat) * Math.sin(t),
    ]);
  for (let m = 0; m < 6; m++) {
    const lon = (m * Math.PI) / 6;
    ring((t) => [
      Math.cos(t) * Math.cos(lon),
      Math.sin(t),
      -Math.cos(t) * Math.sin(lon),
    ]);
  }
  return { points: Float32Array.from(points), runs: Uint32Array.from(runs) };
})();

export function createOrb() {
  const el = document.createElement('canvas');
  el.className = 'press';
  el.style.cssText =
    'position:absolute;touch-action:none;border-radius:50%;transition:opacity .35s ease';
  const ctx = el.getContext('2d');
  let size = 0,
    chart: Chart | null = null,
    moving = false,
    last = 0;
  const spin = { lat: TILT, lon: 0, vLat: 0, vLon: 0 };
  let held = false;
  const c: [number, number, number] = [1, 0, 0],
    right: [number, number, number] = [0, 0, -1],
    up: [number, number, number] = [0, 1, 0];
  const axes = () => {
    const cl = Math.cos(spin.lat),
      sl = Math.sin(spin.lat),
      co = Math.cos(spin.lon),
      so = Math.sin(spin.lon);
    [c[0], c[1], c[2]] = [cl * co, sl, -cl * so];
    [right[0], right[1], right[2]] = [-so, 0, -co];
    [up[0], up[1], up[2]] = [-sl * co, cl, sl * so];
  };

  const trace = (
    g: CanvasRenderingContext2D,
    points: Float32Array,
    runs: Uint32Array,
    r: number
  ) => {
    g.beginPath();
    for (let k = 0; k + 1 < runs.length; k++) {
      let pen = false;
      for (let i = runs[k] ?? 0; i < (runs[k + 1] ?? 0); i++) {
        const x = points[3 * i] ?? 0,
          y = points[3 * i + 1] ?? 0,
          z = points[3 * i + 2] ?? 0;
        if (x * c[0] + y * c[1] + z * c[2] <= 0) {
          pen = false;
          continue;
        }
        const sx = r + r * (x * right[0] + z * right[2]),
          sy = r - r * (x * up[0] + y * up[1] + z * up[2]);
        if (pen) g.lineTo(sx, sy);
        else g.moveTo(sx, sy);
        pen = true;
      }
    }
    g.stroke();
  };

  function draw() {
    if (!ctx || !size) return;
    const dpr = el.width / size,
      r = size / 2,
      k = view.k;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    axes();
    const sea = ctx.createRadialGradient(r * 0.8, r * 0.75, r * 0.1, r, r, r);
    sea.addColorStop(0, alpha(WASH.sea, 0.25));
    sea.addColorStop(1, alpha(WASH.sea, 0.75));
    ctx.fillStyle = sea;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = alpha(INK.iron, 0.2);
    ctx.lineWidth = 0.6 * k;
    trace(ctx, GRATICULE.points, GRATICULE.runs, r);
    if (chart) {
      const land = chart.land,
        d = 1.3 * k;
      ctx.fillStyle = alpha(LAND.high, 0.7);
      for (let i = 0; i < land.length; i += 3) {
        const x = land[i] ?? 0,
          y = land[i + 1] ?? 0,
          z = land[i + 2] ?? 0;
        const facing = x * c[0] + y * c[1] + z * c[2];
        if (facing <= 0.02 || ((i / 3) * 0.618034) % 1 > facing * 1.3) continue;
        ctx.fillRect(
          r + r * (x * right[0] + z * right[2]) - d / 2,
          r - r * (x * up[0] + y * up[1] + z * up[2]) - d / 2,
          d,
          d
        );
      }
      ctx.strokeStyle = INK.iron;
      ctx.lineWidth = 0.9 * k;
      trace(ctx, chart.points, chart.runs, r);
      const [x, y, z] = chart.start;
      if (x * c[0] + y * c[1] + z * c[2] > 0) {
        ctx.beginPath();
        ctx.arc(
          r + r * (x * right[0] + z * right[2]),
          r - r * (x * up[0] + y * up[1] + z * up[2]),
          3.2 * k,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = INK.white;
        ctx.fill();
        ctx.strokeStyle = INK.scarlet;
        ctx.lineWidth = 1.6 * k;
        ctx.stroke();
      }
    }
    const limb = ctx.createRadialGradient(r, r, r * 0.7, r, r, r);
    limb.addColorStop(0, alpha(INK.iron, 0));
    limb.addColorStop(1, alpha(INK.iron, 0.22));
    ctx.fillStyle = limb;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function run(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!held) {
      spin.lon += spin.vLon * dt;
      spin.lat = clamp(spin.lat + spin.vLat * dt, -MOST_LAT, MOST_LAT);
      const fade = Math.exp(-DRAG * dt);
      spin.vLon *= fade;
      spin.vLat *= fade;
    }
    draw();
    moving = held || Math.hypot(spin.vLon, spin.vLat) > STILL;
    if (moving) requestAnimationFrame(run);
  }
  const go = () => {
    if (moving) return;
    moving = true;
    last = performance.now();
    requestAnimationFrame(run);
  };

  onDrag(el, {
    move(dx, dy, ms) {
      held = true;
      const r = size / 2 || 1,
        lon = -dx / (r * Math.max(0.2, Math.cos(spin.lat))),
        lat = dy / r;
      spin.lon += lon;
      spin.lat = clamp(spin.lat + lat, -MOST_LAT, MOST_LAT);
      const s = Math.max(4, ms) / 1000;
      spin.vLon = ms ? spin.vLon * 0.5 + (lon / s) * 0.5 : 0;
      spin.vLat = ms ? spin.vLat * 0.5 + (lat / s) * 0.5 : 0;
      go();
    },
    lift(still) {
      held = false;
      if (still > 80) spin.vLat = spin.vLon = 0;
      go();
    },
  });

  return {
    el,
    place(left: number, top: number, across: number) {
      size = across;
      const dpr = Math.min(view.dpr, 2);
      el.width = Math.round(across * dpr);
      el.height = Math.round(across * dpr);
      Object.assign(el.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${across}px`,
        height: `${across}px`,
      });
      draw();
    },
    show(next: Chart | null, waiting: boolean) {
      el.style.opacity = waiting ? '0.3' : '1';
      if (waiting || next === chart) return;
      chart = next;
      if (next && !held) {
        const [x, y, z] = next.start;
        spin.lat = clamp(
          Math.asin(clamp(y, -1, 1)) + TILT,
          -MOST_LAT,
          MOST_LAT
        );
        spin.lon = Math.atan2(-z, x);
        spin.vLat = spin.vLon = 0;
      }
      draw();
    },
  };
}
