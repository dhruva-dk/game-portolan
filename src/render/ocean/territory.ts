// The captains' ink on the sea: the water each holds, in their colour, and the trail each is laying round the
// water they mean to take, from the simulation's territory grid (sim/sphere.ts GRID cells a cube face). The grid is
// a texture array read texel by texel, without a sampler; the cells' edges are wobbled by noise into a drawn line,
// and a captain's coast is inked more deeply than the water inside it.
//
// A second texture holds what is only for the eye, and is written only when a loop closes or a trail breaks: how long
// after a closing each newly taken cell floods, whose it was until then, and the ghost of a trail that has just been
// washed out, each cell with how long it lasts. The cells carry times as shares of a run, and one clock per captain
// says when the run began, so a flood costs no upload while it plays.
import { Color, DataArrayTexture, NearestFilter, RGBAFormat, RGFormat, UnsignedByteType, Vector4, type Node } from 'three/webgpu';
import { If, abs, clamp, float, floor, fract, ivec2, length, max, min, mix, mod, smoothstep, step, texture, uniform, uniformArray, vec2, renderGroup } from 'three/tsl';
import { GRID, TERRITORY, cellDir, neighbor } from '../../sim/sphere.ts';
import { INK } from '../../sim/tables.ts';
import { v3, type V3 } from '../../sim/math.ts';
import { cubeFace } from '../gpu/cube.ts';
import { P } from '../gpu/uniforms.ts';

type F = Node<'float'>;
type V2 = Node<'vec2'>;
type V3N = Node<'vec3'>;
type V4N = Node<'vec4'>;

/** The colours there are, by ship index + 1. */
const COLOURS = 32;
const CELLS = GRID * GRID * 6;
/** Seconds: a loop's flood, however large (a cell of depth takes `perCell`), a washed-out trail's going, and how long
 *  the bright edge of a flood lasts on a cell it has reached. */
const FLOOD = { min: 1, max: 2, perCell: 0.08, front: 0.35 } as const;
const BREAK = 0.7;
/** How far off a closing or a break is still played, metres: past the planet's curve nobody sees it. */
const PLAYED = Math.cos(340 / 554);
/** The trail's width code runs 1 (a hair) to 7 (the full line), kept in the top bits of its cell over the ship's mark. */
const WIDTHS = 7;
const NOT_YET = -1e5;

/** A loop closed or a trail washed out, for the sea to play. `at` is a point on the planet, any length. */
export type InkMark =
  | { k: 'claim'; ship: number; cells: readonly number[]; at: V3 }
  | { k: 'cut'; ship: number; cells: readonly number[]; at: V3; dry: boolean };

export interface TerritoryInput {
  owner: Uint8Array;
  /** Each ship's trail, oldest cell first, by ship index. */
  laid: readonly (readonly number[])[];
  version: number;
  me: number;
  /** Each ship's ink, by ship index; read once, when it changes. */
  inks: readonly string[];
}

const QUEUE = new Int32Array(CELLS);
const DEPTH = new Int32Array(CELLS);
const D = v3();

export class Territory {
  readonly texture: DataArrayTexture;
  readonly flood: DataArrayTexture;
  /** Each captain's colour, by ship index + 1. */
  readonly colours = uniformArray(Array.from({ length: COLOURS }, (_, i) => new Color().setHSL((i * 0.618) % 1, 0.75, 0.5)), 'color').setGroup(renderGroup);
  /** Each captain's clocks, by ship index + 1: their last flood's start and length, their last break's start and length. */
  readonly #clocks = Array.from({ length: COLOURS }, () => new Vector4(NOT_YET, 1, NOT_YET, 1));
  readonly clocks = uniformArray(this.#clocks, 'vec4').setGroup(renderGroup);
  /** The player's ship index + 1; whether there is any territory to draw. */
  readonly me = uniform(0);
  readonly on = uniform(0);
  #version = -1;
  #inks: readonly string[] | null = null;
  readonly #marks: InkMark[] = [];
  /** The cells each captain's last flood and break wrote, to be cleared before their clock starts again. */
  readonly #flooded: number[][] = Array.from({ length: COLOURS }, () => []);
  readonly #ghosts: number[][] = Array.from({ length: COLOURS }, () => []);

  constructor() {
    const layered = (bytes: number, format: typeof RGFormat | typeof RGBAFormat) => {
      const t = new DataArrayTexture(new Uint8Array(CELLS * bytes), GRID, GRID, 6);
      t.format = format;
      t.type = UnsignedByteType;
      t.magFilter = t.minFilter = NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    this.texture = layered(2, RGFormat);
    this.flood = layered(4, RGBAFormat);
  }

  /** A loop has closed or a trail has gone: played the next time the grid is read. */
  mark(m: InkMark): void {
    this.#marks.push(m);
  }

  /** Copies the territory in when it has changed. Null hides it. `time` is the sea's clock and `near` where the eye is. */
  set(v: TerritoryInput | null, time: number, near: V3): void {
    this.me.value = v?.me ?? 0;
    this.on.value = v ? 1 : 0;
    if (!v) {
      this.#marks.length = 0;
      return;
    }
    if (v.version < this.#version) this.#reset();
    if (v.inks !== this.#inks) this.#paint(v.inks);
    const marked = this.#marks.length > 0;
    if (!marked && v.version === this.#version) return;
    this.#version = v.version;
    for (const m of this.#marks) {
      const seen = (m.at.x * near.x + m.at.y * near.y + m.at.z * near.z) / Math.hypot(m.at.x, m.at.y, m.at.z) >= PLAYED;
      if (!seen) continue;
      if (m.k === 'claim') this.#claim(m, v.owner, time);
      else this.#broke(m, time);
    }
    this.#marks.length = 0;
    const d = this.texture.image.data as Uint8Array, owner = v.owner;
    for (let i = 0; i < CELLS; i++) {
      d[i * 2] = owner[i];
      d[i * 2 + 1] = 0;
    }
    for (let s = 0; s < v.laid.length; s++) {
      const laid = v.laid[s], mark = s + 1;
      for (let k = 0; k < laid.length; k++) {
        // the ink runs dry along the trail: full at the water it left, a hair by the time it gives out
        const w = Math.max(1, Math.round(WIDTHS * (1 - k / INK.trail)));
        d[laid[k] * 2 + 1] = mark | (w << 5);
      }
    }
    this.texture.needsUpdate = true;
  }

  #paint(inks: readonly string[]): void {
    this.#inks = inks;
    const list = (this.colours as unknown as { array: Color[] }).array;
    inks.forEach((c, i) => list[(i + 1) & (COLOURS - 1)].set(c));
  }

  /** A new match: nothing is flooding or breaking, and the clock has gone back. */
  #reset(): void {
    (this.flood.image.data as Uint8Array).fill(0);
    this.flood.needsUpdate = true;
    this.#clocks.forEach((c) => c.set(NOT_YET, 1, NOT_YET, 1));
    this.#flooded.forEach((l) => (l.length = 0));
    this.#ghosts.forEach((l) => (l.length = 0));
    this.#marks.length = 0;
  }

  /** The water a closed loop took floods in from the trail: each cell's depth from it, walked through the cells this
   *  loop changed, read against the grid as it stood before the loop (still in the texture). */
  #claim(m: Extract<InkMark, { k: 'claim' }>, owner: Uint8Array, time: number): void {
    const mark = m.ship + 1, was = this.texture.image.data as Uint8Array, f = this.flood.image.data as Uint8Array;
    const past = this.#flooded[mark];
    for (const c of past) f[c * 4] = 0;
    past.length = 0;
    let n = 0;
    for (const c of m.cells) {
      if (owner[c] !== mark || DEPTH[c] !== 0) continue;
      DEPTH[c] = 1;
      QUEUE[n++] = c;
    }
    let deepest = 1;
    for (let k = 0; k < n; k++) {
      const c = QUEUE[k], depth = DEPTH[c];
      deepest = Math.max(deepest, depth);
      for (let j = 0; j < 4; j++) {
        const x = neighbor(TERRITORY, c, j);
        if (DEPTH[x] !== 0 || owner[x] !== mark || was[x * 2] === mark) continue;
        DEPTH[x] = depth + 1;
        QUEUE[n++] = x;
      }
    }
    for (let k = 0; k < n; k++) {
      const c = QUEUE[k];
      f[c * 4] = 1 + Math.round((254 * (DEPTH[c] - 1)) / deepest);
      f[c * 4 + 1] = was[c * 2];
      DEPTH[c] = 0;
      past.push(c);
    }
    this.flood.needsUpdate = true;
    this.#clocks[mark].x = time;
    this.#clocks[mark].y = Math.min(FLOOD.max, Math.max(FLOOD.min, deepest * FLOOD.perCell));
  }

  /** A trail washed out: it goes from where it was crossed outward both ways, or from its head if it ran dry. */
  #broke(m: Extract<InkMark, { k: 'cut' }>, time: number): void {
    const mark = m.ship + 1, f = this.flood.image.data as Uint8Array, cells = m.cells, past = this.#ghosts[mark];
    for (const c of past) f[c * 4 + 2] = f[c * 4 + 3] = 0;
    past.length = 0;
    if (cells.length === 0) return;
    let from = cells.length - 1;
    if (!m.dry) {
      let best = -2;
      const l = Math.hypot(m.at.x, m.at.y, m.at.z);
      cells.forEach((c, k) => {
        cellDir(TERRITORY, c, D);
        const d = (D.x * m.at.x + D.y * m.at.y + D.z * m.at.z) / l;
        if (d > best) { best = d; from = k; }
      });
    }
    const far = Math.max(1, from, cells.length - 1 - from);
    cells.forEach((c, k) => {
      f[c * 4 + 2] = mark;
      f[c * 4 + 3] = 1 + Math.round((254 * Math.abs(k - from)) / far);
      past.push(c);
    });
    this.flood.needsUpdate = true;
    this.#clocks[mark].z = time;
    this.#clocks[mark].w = BREAK;
  }

  /** A captain's colour by ship index + 1. */
  colour(id: F): V3N {
    return (this.colours as unknown as { element(i: unknown): V3N }).element(id.toInt().bitAnd(COLOURS - 1));
  }

  #clock(id: F): V4N {
    return (this.clocks as unknown as { element(i: unknown): V4N }).element(id.toInt().bitAnd(COLOURS - 1));
  }

  /**
   * The ink over `up`: whose water it shows (ship index + 1, 0 for none; the old owner until a flood reaches it), how
   * much of the water round it is another's (0 inside, toward 1 on its coast), how bright the flood's edge is on it,
   * whose trail runs there and how much of this point the line covers, and likewise the ghost of a trail just broken.
   * `jitter` (−0.5…0.5 a cell) wobbles the cells' edges into a drawn line.
   */
  at(up: V3N, jitter: V2): { owner: F; edge: F; front: F; trail: F; line: F; ghost: F; ghostLine: F } {
    const { face, eq } = cubeFace(up);
    const cell = 2 / GRID;
    const base = eq.add(jitter.mul(cell * 1.1));
    const grid = base.add(1).mul(GRID / 2).toVar();
    const texel = (o: V2) => ivec2(clamp(floor(grid.add(o)), 0, GRID - 1));
    const read = (o: V2) => texture(this.texture).load(texel(o)).depth(face).rg.mul(255).add(0.5).floor() as unknown as V2;
    const ids = read(vec2(0, 0)).toVar();
    const fl = texture(this.flood).load(texel(vec2(0, 0))).depth(face).toVar();
    const clock = this.#clock(ids.x).toVar();
    const since = P.time.sub(clock.x).div(clock.y).toVar();
    const arrived = step(fl.r, since).toVar();
    const owner = mix(fl.g.mul(255).add(0.5).floor(), ids.x, arrived).toVar();
    const o = 0.3;
    const other = (x: number, y: number): F => step(0.5, abs(read(vec2(x, y)).x.sub(ids.x)));
    const edge = clamp(other(o, 0).add(other(-o, 0)).add(other(0, o)).add(other(0, -o)), 0, 1).mul(arrived);
    const front = float(1).sub(clamp(since.sub(fl.r).mul(clock.y).div(FLOOD.front), 0, 1)).mul(arrived).mul(step(0.5 / 255, fl.r));

    // the trail, a line through the middles of its cells to each neighbouring cell of the same trail, as wide as its
    // ink has left in it
    const local = fract(grid).sub(0.5).toVar();
    const trail = mod(ids.y, 32).toVar(), line = float(0).toVar();
    If(trail.greaterThan(0.5), () => {
      const nd = length(local).toVar();
      const link = (x: number, y: number) => {
        const near = mod(read(vec2(x, y)).y, 32);
        const along = x !== 0 ? local.x.mul(x) : local.y.mul(y), across = x !== 0 ? local.y : local.x;
        const d = length(vec2(along.sub(clamp(along, 0, 0.5)), across));
        nd.assign(min(nd, d.add(step(0.5, abs(near.sub(trail))).mul(9))));
      };
      link(1, 0);
      link(-1, 0);
      link(0, 1);
      link(0, -1);
      const half = floor(ids.y.div(32)).div(WIDTHS).mul(0.5).add(0.04);
      line.assign(float(1).sub(smoothstep(half.sub(0.12), half.add(0.12), nd)));
    });

    // a trail just washed out, going cell by cell
    const ghost = fl.b.mul(255).add(0.5).floor().toVar(), ghostLine = float(0).toVar();
    If(ghost.greaterThan(0.5).and(trail.lessThan(0.5)), () => {
      const g = this.#clock(ghost).toVar(), left = fl.a.sub(P.time.sub(g.z).div(g.w));
      ghostLine.assign(step(0, left).mul(float(1).sub(smoothstep(0.42, 0.62, max(abs(local.x), abs(local.y))))).mul(clamp(left.mul(6).add(0.25), 0, 1)));
    });
    return { owner, edge, front, trail, line, ghost, ghostLine };
  }
}
