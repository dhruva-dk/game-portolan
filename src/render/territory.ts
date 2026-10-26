import * as THREE from 'three';
import { seas } from './sea.ts';
import { cubeTexture } from './swell.ts';
import type { RenderContext, RenderModule } from './world.ts';
import { transmittanceVec } from '../style/glsl.ts';
import { TEAMS } from '../style/palette.ts';
import type { V3 } from '../sim/math.ts';
import { cellDir, cellOf, neighbor, R, TERRITORY } from '../sim/sphere.ts';
import { EVENT, SHIPS, type MatchState } from '../sim/state.ts';
import { calmNow } from '../sim/storm.ts';

const N = TERRITORY.n, NN = N * N, CELLS = 6 * NN;
export const MOMENT_SLOTS = 8;
export const floodTime = (reach: number): number => 1.3 + 0.55 * Math.sqrt(reach / 8);
export const DRY_TIME = 2.2, WASH_OUT_TIME = 3.4;
const KERNEL = [1, 4, 6, 4, 1].map((w) => w / 16);
const MOMENT = { flood: 1, washOut: 2 } as const;
const smooth01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export interface Claim {
  readonly ship: number;
  readonly kind: 'loop' | 'home';
  readonly area: number;
  readonly reach: number;
  readonly duration: number;
  readonly at: V3;
  readonly clock: number;
}

interface Moment { readonly kind: number; readonly start: number; readonly duration: number; readonly reach: number; readonly cells: Int32Array }

function texelOf(c: number, out: number[]): void {
  const f = (c / NN) | 0, rem = c - f * NN, row = (rem / N) | 0;
  out[0] = f;
  out[1] = rem - row * N;
  out[2] = N - 1 - row;
}

export class Territory {
  readonly wash: THREE.CubeTexture;
  readonly moments: THREE.CubeTexture;
  readonly slots = Array.from({ length: MOMENT_SLOTS }, () => new THREE.Vector4());
  uploaded = 0;
  private readonly washFaces: Uint8Array[] = [];
  private readonly momentFaces: Uint8Array[] = [];
  private readonly known = new Uint8Array(CELLS);
  private readonly drawn = new Uint8Array(CELLS);
  private readonly mark = new Int32Array(CELLS);
  private readonly live: (Moment | null)[] = new Array<Moment | null>(MOMENT_SLOTS).fill(null);
  private readonly dirty = Array.from({ length: 6 }, () => [N, N, -1, -1]);
  private readonly tints = new Uint8Array((SHIPS + 1) * 3).fill(255);
  private readonly held = new Float64Array(SHIPS);
  private readonly listeners = new Set<(c: Claim) => void>();
  private readonly t = [0, 0, 0];
  private readonly p: V3 = { x: 0, y: 0, z: 0 };
  private readonly q: V3 = { x: 0, y: 0, z: 0 };
  private readonly renderer: THREE.WebGLRenderer | null;
  private state: MatchState | null = null;
  private tick = -1;

  constructor(renderer: THREE.WebGLRenderer | null) {
    this.renderer = renderer;
    for (let f = 0; f < 6; f++) {
      const wash = new Uint8Array(NN * 4);
      new Uint32Array(wash.buffer).fill(0x00ffffff);
      this.washFaces.push(wash);
      this.momentFaces.push(new Uint8Array(NN * 4));
    }
    this.wash = cubeTexture(this.washFaces, THREE.UnsignedByteType);
    this.moments = cubeTexture(this.momentFaces, THREE.UnsignedByteType);
    TEAMS.slice(0, SHIPS).forEach((team, i) => {
      const t = transmittanceVec(team.primary);
      this.tints.set([t.x, t.y, t.z].map((v) => Math.round(v * 255)), (i + 1) * 3);
    });
  }

  onClaim(listener: (c: Claim) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sync(state: MatchState, clock: number): void {
    if (state !== this.state) this.reset(state);
    if (state.tick === this.tick) return;
    this.tick = state.tick;
    let moved = false;
    for (let i = 0; i < SHIPS; i++) {
      if (state.ships[i].held === this.held[i]) continue;
      this.held[i] = state.ships[i].held;
      moved = true;
    }
    if (moved) this.diff(state, clock);
  }

  frame(clock: number): void {
    for (let k = 1; k < MOMENT_SLOTS; k++) {
      const m = this.live[k], u = this.slots[k];
      if (!m) continue;
      const age = clock - m.start;
      if (m.kind === MOMENT.flood) {
        u.set(1, (m.reach + 3) * (1 - (1 - Math.min(age / m.duration, 1)) ** 3), Math.max(m.reach, 1e-3),
          smooth01((age - 0.7 * m.duration) / (0.3 * m.duration + DRY_TIME)));
        if (age > m.duration + DRY_TIME) this.finish(k);
      } else {
        u.set(2, age / m.duration, 0, 0);
        if (age > 1.3 * m.duration) this.finish(k);
      }
    }
    for (let f = 0; f < 6; f++) {
      const d = this.dirty[f];
      if (d[2] < 0) continue;
      const x0 = Math.max(d[0], 0), y0 = Math.max(d[1], 0), x1 = Math.min(d[2], N - 1), y1 = Math.min(d[3], N - 1);
      this.bake(f, x0, y0, x1, y1);
      this.upload(this.wash, this.washFaces, f, x0, y0, x1, y1);
      this.upload(this.moments, this.momentFaces, f, x0, y0, x1, y1);
      d[0] = d[1] = N;
      d[2] = d[3] = -1;
    }
  }

  dispose(): void {
    this.wash.dispose();
    this.moments.dispose();
  }

  private reset(state: MatchState): void {
    this.state = state;
    this.tick = -1;
    this.live.fill(null);
    for (const s of this.slots) s.set(0, 0, 0, 0);
    this.known.set(state.owner);
    this.drawn.set(state.owner);
    for (let i = 0; i < SHIPS; i++) this.held[i] = state.ships[i].held;
    for (let f = 0; f < 6; f++) {
      this.momentFaces[f].fill(0);
      if (this.drawn.subarray(f * NN, (f + 1) * NN).some((o) => o !== 0)) this.bake(f, 0, 0, N - 1, N - 1);
      else new Uint32Array(this.washFaces[f].buffer).fill(0x00ffffff);
    }
    this.wash.needsUpdate = this.moments.needsUpdate = true;
  }

  private diff(state: MatchState, clock: number): void {
    const owner = state.owner, known = this.known, gained = new Map<number, number[]>(), lost: number[] = [];
    for (let c = 0; c < CELLS; c++) {
      const o = owner[c];
      if (o === known[c]) continue;
      known[c] = o;
      if (o === 0) {
        lost.push(c);
        continue;
      }
      this.drawn[c] = o;
      const g = gained.get(o);
      if (g) g.push(c);
      else gained.set(o, [c]);
    }
    for (const [o, cells] of gained) {
      const i = o - 1, ev = state.events.find((e) => (e.kind === EVENT.loop || e.kind === EVENT.home) && e.ship === i);
      const reach = this.flood(cells, ev?.kind === EVENT.loop ? ev.cells : [cellOf(TERRITORY, ev?.at ?? state.ships[i].pos)], clock);
      this.touch(cells);
      if (!ev) continue;
      const claim: Claim = { ship: i, kind: ev.kind === EVENT.loop ? 'loop' : 'home', area: ev.amount, reach, duration: floodTime(reach), at: ev.at, clock };
      for (const listener of this.listeners) listener(claim);
    }
    if (lost.length === 0) return;
    const storm = state.events.some((e) => e.kind === EVENT.swallow), wreck = state.events.find((e) => e.kind === EVENT.freed);
    const from = storm ? calmNow(state).at : wreck?.at ?? state.ships[0].pos, order = new Float32Array(lost.length), p = this.p;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < lost.length; k++) {
      cellDir(TERRITORY, lost[k], p);
      const a = Math.acos(Math.min(1, Math.max(-1, p.x * from.x + p.y * from.y + p.z * from.z)));
      order[k] = storm ? -a : a;
      lo = Math.min(lo, order[k]);
      hi = Math.max(hi, order[k]);
    }
    const slot = this.slot();
    for (let k = 0; k < lost.length; k++) this.momentAt(lost[k], hi > lo ? (order[k] - lo) / (hi - lo) : 0, slot);
    this.live[slot] = { kind: MOMENT.washOut, start: clock, duration: WASH_OUT_TIME, reach: 0, cells: Int32Array.from(lost) };
    this.touch(lost);
  }

  private flood(cells: number[], seeds: ArrayLike<number>, clock: number): number {
    const n = cells.length, mark = this.mark, near = new Int32Array(n), dist = new Float32Array(n).fill(Infinity), queue = new Int32Array(n);
    for (let k = 0; k < n; k++) mark[cells[k]] = k + 1;
    let tail = 0;
    for (let s = 0; s < seeds.length; s++) {
      const k = mark[seeds[s]] - 1;
      if (k < 0 || dist[k] === 0) continue;
      dist[k] = 0;
      near[k] = k;
      queue[tail++] = k;
    }
    if (tail === 0) {
      dist[0] = 0;
      queue[tail++] = 0;
    }
    const a = this.p, b = this.q;
    for (let head = 0; head < tail; head++) {
      const k = queue[head];
      cellDir(TERRITORY, cells[near[k]], b);
      for (let m = 0; m < 4; m++) {
        const x = mark[neighbor(TERRITORY, cells[k], m)] - 1;
        if (x < 0) continue;
        cellDir(TERRITORY, cells[x], a);
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * R;
        if (d >= dist[x] - 1e-4) continue;
        if (dist[x] === Infinity) queue[tail++] = x;
        dist[x] = d;
        near[x] = near[k];
      }
    }
    let reach = 0;
    for (let k = 0; k < n; k++) if (dist[k] < Infinity) reach = Math.max(reach, dist[k]);
    const slot = this.slot();
    for (let k = 0; k < n; k++) {
      mark[cells[k]] = 0;
      this.momentAt(cells[k], reach > 0 ? Math.min(dist[k], reach) / reach : 0, slot);
    }
    this.live[slot] = { kind: MOMENT.flood, start: clock, duration: floodTime(reach), reach, cells: Int32Array.from(cells) };
    return reach;
  }

  private slot(): number {
    let k = this.live.indexOf(null, 1);
    if (k < 0) {
      k = 1;
      for (let j = 2; j < MOMENT_SLOTS; j++) if (this.live[j]!.start < this.live[k]!.start) k = j;
      this.finish(k);
    }
    return k;
  }

  private finish(k: number): void {
    const m = this.live[k]!, t = this.t;
    this.live[k] = null;
    this.slots[k].set(0, 0, 0, 0);
    for (const c of m.cells) {
      texelOf(c, t);
      const out = this.momentFaces[t[0]], o = (t[2] * N + t[1]) * 4;
      if (out[o + 1] === k * 32) out.fill(0, o, o + 4);
      this.drawn[c] = this.known[c];
    }
    this.touch(m.cells);
  }

  private momentAt(c: number, r: number, slot: number): void {
    texelOf(c, this.t);
    const out = this.momentFaces[this.t[0]], o = (this.t[2] * N + this.t[1]) * 4;
    out[o] = Math.round(255 * r);
    out[o + 1] = slot * 32;
    out[o + 2] = out[o + 3] = 255;
  }

  private touch(cells: ArrayLike<number>): void {
    const t = this.t;
    for (let k = 0; k < cells.length; k++) {
      texelOf(cells[k], t);
      const d = this.dirty[t[0]];
      d[0] = Math.min(d[0], t[1] - 2);
      d[1] = Math.min(d[1], t[2] - 2);
      d[2] = Math.max(d[2], t[1] + 2);
      d[3] = Math.max(d[3], t[2] + 2);
    }
  }

  private bake(f: number, x0: number, y0: number, x1: number, y1: number): void {
    const drawn = this.drawn, out = this.washFaces[f], tints = this.tints, base = f * NN + (N - 1) * N;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = drawn[base - y * N + x];
        let same = 0, any = 0, best = 0, bestW = 0;
        for (let j = -2; j <= 2; j++) {
          const row = base - Math.min(N - 1, Math.max(0, y + j)) * N;
          for (let i = -2; i <= 2; i++) {
            const v = drawn[row + Math.min(N - 1, Math.max(0, x + i))];
            if (v === 0) continue;
            const w = KERNEL[i + 2] * KERNEL[j + 2];
            any += w;
            if (v === o) same += w;
            if (w > bestW) {
              bestW = w;
              best = v;
            }
          }
        }
        const k = (y * N + x) * 4, tint = (o || best) * 3, a = o ? 2 * same - any : any;
        out[k] = tints[tint];
        out[k + 1] = tints[tint + 1];
        out[k + 2] = tints[tint + 2];
        out[k + 3] = Math.round(255 * Math.min(1, Math.max(0, a)));
      }
    }
  }

  private upload(tex: THREE.CubeTexture, faces: Uint8Array[], f: number, x0: number, y0: number, x1: number, y1: number): void {
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    this.uploaded += w * h * 4;
    if (!this.renderer) return;
    const props = this.renderer.properties.get(tex) as { __webglTexture?: WebGLTexture; __version?: number };
    if (!props.__webglTexture || props.__version !== tex.version) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    this.renderer.state.bindTexture(gl.TEXTURE_CUBE_MAP, props.__webglTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, N);
    gl.texSubImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, faces[f], (y0 * N + x0) * 4);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
  }
}

export const territories = new WeakMap<THREE.Object3D, Territory>();

export function createTerritory(ctx: RenderContext): RenderModule {
  const sea = seas.get(ctx.scene);
  if (!sea) throw new Error('createTerritory: the scene has no sea (createSea comes first in MODULES)');
  const territory = new Territory(ctx.pipeline.renderer);
  territories.set(ctx.scene, territory);
  sea.setTerritory(territory.wash, territory.moments, territory.slots);
  return {
    frame(f) {
      territory.sync(f.state, f.clock);
      territory.frame(f.clock);
    },
    dispose() {
      sea.setTerritory(null);
      territories.delete(ctx.scene);
      territory.dispose();
    },
  };
}
