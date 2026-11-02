// Foam on fast water: tracers set loose on the sea round the focus ride the surface current and write foam into the
// water's wake map as they go, so a race runs streaked white downstream. Only water faster than the Great Current
// carries any: the lanes in spate under the Fjords' and Blossom Run's events, and the Maelstrom's whirl as its own
// event winds it up.
import { R, along, tangentAt } from '../sim/sphere.ts';
import { v3, type V3 } from '../sim/math.ts';
import { currentAt, heightAt } from '../sim/world/index.ts';
import type { Water } from './water.ts';

/** Tracers at most, and how many new ones are tried each frame. */
const N = 160, TRIES = 14;
/** Metres round the focus they are set loose in and followed to: inside the wake map's 130. */
const REACH = 115;
/** Metres a second: no foam at the Great Current's pace and below, full foam on a race in spate. */
const SLOW = 4.4, FAST = 8;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class FastWater {
  /** Each tracer's place (a unit vector), age and lifetime in seconds; a lifetime of 0 is a free slot. */
  private readonly at = new Float64Array(N * 3);
  private readonly age = new Float32Array(N);
  private readonly life = new Float32Array(N);
  private readonly p = v3();
  private readonly v = v3();
  private readonly f = v3();
  private readonly t = v3();

  /** Moves the tracers on by `dt` seconds round `focus` (metres), with the currents as the events drive them, and lays
   *  their foam; with no currents given they all go. */
  update(focus: V3, currents: { lanes: readonly number[]; vortex: number } | undefined, tide: number, dt: number, water: Water): void {
    if (!currents) {
      this.life.fill(0);
      return;
    }
    const { at, age, life, p, v } = this, f = this.unit(focus, this.f), far = Math.cos(REACH / R);
    let free = 0;
    for (let i = 0; i < N; i++) {
      if (life[i] === 0) {
        free++;
        continue;
      }
      const o = i * 3;
      currentAt(this.load(o, p), v, currents.lanes, currents.vortex);
      const speed = Math.hypot(v.x, v.y, v.z);
      age[i] += dt;
      // the current carries it along the surface; it goes once it slows, strands or drifts out of the map
      p.x += (v.x * dt) / R;
      p.y += (v.y * dt) / R;
      p.z += (v.z * dt) / R;
      this.unit(p, p);
      if (age[i] >= life[i] || speed < SLOW || p.x * f.x + p.y * f.y + p.z * f.z < far || heightAt(p) > tide - 0.5) {
        life[i] = 0;
        continue;
      }
      at[o] = p.x;
      at[o + 1] = p.y;
      at[o + 2] = p.z;
      // a streak as soon as the water outruns the Great Current, white on a race in spate
      const k = smooth(SLOW, FAST, speed), fade = Math.min(1, age[i] / 0.4, (life[i] - age[i]) / 0.6);
      water.stamp(p, 1 + 0.6 * k, (0.4 + 0.55 * k) * fade, 0.5 * k * fade);
    }
    if (free === 0) return;
    // new ones tried at random over the water round the focus, kept only where it runs fast
    for (let t = 0, i = 0; t < TRIES && free > 0; t++) {
      along(f, tangentAt(f, Math.random() * 2 * Math.PI, this.t), Math.sqrt(Math.random()) * REACH, p);
      currentAt(p, v, currents.lanes, currents.vortex);
      if (Math.hypot(v.x, v.y, v.z) < SLOW + 0.3 || heightAt(p) > tide - 0.5) continue;
      while (life[i] !== 0) i++;
      at[i * 3] = p.x;
      at[i * 3 + 1] = p.y;
      at[i * 3 + 2] = p.z;
      age[i] = 0;
      life[i] = 2 + 3 * Math.random();
      free--;
    }
  }

  private load(o: number, out: V3): V3 {
    out.x = this.at[o];
    out.y = this.at[o + 1];
    out.z = this.at[o + 2];
    return out;
  }

  private unit(q: V3, out: V3): V3 {
    const l = Math.hypot(q.x, q.y, q.z) || 1;
    out.x = q.x / l;
    out.y = q.y / l;
    out.z = q.z / l;
    return out;
  }
}
