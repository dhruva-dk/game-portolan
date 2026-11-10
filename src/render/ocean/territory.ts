// The captains' ink on the sea: the water each holds in their colour, a flood running out from a closed loop, a sunk
// captain's water draining, and the trail each is laying. inkField.ts bakes what the grid says into three textures when
// water changes hands; here those are sent to the GPU, a rectangle at a time, and read.
//
// A border is the 0.5 contour of a field carried by a quadratic B-spline over the bake's texels, so it stays a smooth
// curve however low the eye. Its edge is antialiased by how far the field moves across one pixel, worked out exactly
// from the field's gradient and the cube sphere's Jacobian, so it neither crawls nor blurs at a grazing angle.
//
// Open water and the inside of a holding cost one texture read; everything else here is near a border or a trail.
import { Color, DataArrayTexture, LinearFilter, NearestFilter, RGBAFormat, UnsignedByteType, Vector4, type Node, type WebGPURenderer } from 'three/webgpu';
import { If, abs, clamp, dot, exp, float, floor, int, ivec2, length, max, min, mix, mod, renderGroup, select, smoothstep, step, texture, uniform, uniformArray, vec2, vec3 } from 'three/tsl';
import { TERRITORY, cellDir } from '../../sim/sphere.ts';
import { v3, type V3 } from '../../sim/math.ts';
import { cubeFace } from '../gpu/cube.ts';
import { P } from '../gpu/uniforms.ts';
import { BN, GOING, InkField, RANGE, TILE, WIDTH_SCALE, type InkRun } from './inkField.ts';

type F = Node<'float'>;
type V3N = Node<'vec3'>;
type V4N = Node<'vec4'>;
type I2 = Node<'ivec2'>;

/** The colours there are, by ship index + 1. */
const COLOURS = 32;
/** Seconds a trail takes to go: soaked into water just claimed, washed out from a cut, or dissolving as its ship sinks. */
const GONE = { absorbed: 0.7, broken: 0.7, dissolving: 1.8 } as const;
/** How far off a closing or a break is still played, metres: past the planet's curve nobody sees it. */
const PLAYED = Math.cos(340 / 554);
const NOT_YET = -1e5;
/** A flood's crest, seconds wide. */
const CREST = 0.05;

/** Something for the sea to play. `at` is a point on the planet, any length. */
export type InkMark =
  | { k: 'claim'; ship: number; cells: readonly number[]; at: V3 }
  | { k: 'cut'; ship: number; cells: readonly number[]; at: V3; dry: boolean }
  | { k: 'freed'; ship: number; cells: readonly number[] };

export interface TerritoryInput {
  owner: Uint8Array;
  /** Each ship's trail, oldest cell first, by ship index. */
  laid: readonly (readonly number[])[];
  version: number;
  me: number;
  /** Each ship's ink, by ship index; read once, when it changes. */
  inks: readonly string[];
}

/** The ink over one point of the sea. */
export interface InkHere {
  /** The ink's colour here, and how much of the point it covers (0 on open sea). */
  hue: V3N;
  cover: F;
  /** How much of what is here is the player's. */
  mine: F;
  /** The border's line, and a flood's crest running over the water. */
  edge: F;
  crest: F;
  /** Water just returning to open sea. */
  drain: F;
  /** Whose trail runs here (ship index + 1, 0 for none) and how much of this point its line covers. */
  trail: F;
  line: F;
  /** Likewise a trail on its way out, and how pale it has gone. */
  ghost: F;
  ghostLine: F;
  ghostPale: F;
}

const D = v3();

/** The part of the GPU device a rectangle of texels goes up through. */
interface Device {
  queue: {
    writeTexture(to: { texture: object; origin: { x: number; y: number; z: number } }, data: Uint8Array, layout: { offset: number; bytesPerRow: number; rowsPerImage: number }, size: { width: number; height: number; depthOrArrayLayers: number }): void;
  };
}

/** A line of width `w` at distance `d`, widened to the pixel footprint `px` with its ink kept. */
const lineAt = (d: F, w: number, px: F): F => {
  const we = max(float(w), px);
  return exp(d.mul(d).div(we.mul(we)).negate()).mul(float(w).div(we));
};

export class Territory {
  readonly #field = new InkField();
  readonly #a = texel(this.#field.a, NearestFilter);
  readonly #b = texel(this.#field.b, NearestFilter);
  readonly #t = texel(this.#field.t, LinearFilter);
  #renderer: WebGPURenderer | null = null;
  #sent = false;
  /** Each captain's colour, by ship index + 1. */
  readonly colours = uniformArray(Array.from({ length: COLOURS }, (_, i) => new Color().setHSL((i * 0.618) % 1, 0.75, 0.5)), 'color').setGroup(renderGroup);
  /** Each captain's clocks, by ship index + 1: their last run's start and length, their last trail's going's start and length. */
  readonly #clocks = Array.from({ length: COLOURS }, () => new Vector4(NOT_YET, 1, NOT_YET, 1));
  readonly clocks = uniformArray(this.#clocks, 'vec4').setGroup(renderGroup);
  /** The player's ship index + 1; whether there is any territory to draw. */
  readonly me = uniform(0);
  readonly on = uniform(0);
  #version = -1;
  #inks: readonly string[] | null = null;
  readonly #marks: InkMark[] = [];
  /** When each captain's ghost of a trail is done with. */
  readonly #ghosts = new Float64Array(COLOURS).fill(Infinity);

  /** The renderer the fields are sent through. */
  attach(renderer: WebGPURenderer): void {
    this.#renderer = renderer;
  }

  /** A loop has closed, a trail has gone, or a sunk captain's water has gone free: played the next time the grid is read. */
  mark(m: InkMark): void {
    this.#marks.push(m);
  }

  /** Brings the fields up to the grid when it has changed. Null hides it. `time` is the sea's clock and `near` where the eye is. */
  set(v: TerritoryInput | null, time: number, near: V3): void {
    this.me.value = v?.me ?? 0;
    this.on.value = v ? 1 : 0;
    if (!v) {
      this.#marks.length = 0;
      return;
    }
    if (v.version < this.#version) this.#reset();
    if (v.inks !== this.#inks) this.#paint(v.inks);
    this.#field.settle(time);
    for (let m = 0; m < COLOURS; m++) {
      if (this.#ghosts[m] <= time) {
        this.#ghosts[m] = Infinity;
        this.#field.gone(m - 1);
      }
    }
    if (this.#marks.length > 0 || v.version !== this.#version) {
      this.#version = v.version;
      this.#read(v, time, near);
    }
    this.#send();
  }

  #read(v: TerritoryInput, time: number, near: V3): void {
    const runs: InkRun[] = [];
    const seen = (at: V3) => (at.x * near.x + at.y * near.y + at.z * near.z) / Math.hypot(at.x, at.y, at.z) >= PLAYED;
    for (const m of this.#marks) {
      if (m.k === 'freed') {
        if (m.cells.length === 0 || !seen(cellDir(TERRITORY, m.cells[0], D))) continue;
        runs.push({ ship: m.ship, kind: 'freed', from: m.cells });
        this.#go(m.ship, GOING.dissolving, -1, GONE.dissolving, time);
      } else if (!seen(m.at)) {
        continue;
      } else if (m.k === 'claim') {
        runs.push({ ship: m.ship, kind: 'claim', from: m.cells });
        this.#go(m.ship, GOING.absorbed, -1, GONE.absorbed, time);
      } else if (m.cells.length > 0) {
        this.#go(m.ship, GOING.broken, m.dry ? m.cells.length - 1 : nearest(m.cells, m.at), GONE.broken, time);
      }
    }
    this.#marks.length = 0;
    const played = this.#field.update(v.owner, runs, time);
    runs.forEach((r, k) => {
      const c = this.#clocks[(r.ship + 1) & (COLOURS - 1)];
      c.x = time + played[k].delay;
      c.y = played[k].len;
    });
    this.#field.trails(v.laid);
  }

  #go(ship: number, going: number, from: number, seconds: number, time: number): void {
    this.#field.go(ship, going, from);
    const m = (ship + 1) & (COLOURS - 1), c = this.#clocks[m];
    c.z = time;
    c.w = seconds;
    this.#ghosts[m] = time + seconds + 0.1;
  }

  /** Sends what has changed. The first time, the textures go whole and every rectangle waiting is already in them. */
  #send(): void {
    const r = this.#renderer, rects = this.#field.rects;
    if (!r || rects.length === 0) return;
    if (!this.#sent) {
      r.initTexture(this.#a);
      r.initTexture(this.#b);
      r.initTexture(this.#t);
      this.#sent = true;
      rects.length = 0;
      return;
    }
    const backend = r.backend as unknown as { device: Device; get(t: unknown): { texture: object } };
    const { a, b, t } = this.#field, data = { a, b, t }, tex = { a: this.#a, b: this.#b, t: this.#t };
    for (const q of rects) {
      backend.device.queue.writeTexture(
        { texture: backend.get(tex[q.tex]).texture, origin: { x: q.x, y: q.y, z: q.face } },
        data[q.tex],
        { offset: ((q.face * TILE + q.y) * TILE + q.x) * 4, bytesPerRow: TILE * 4, rowsPerImage: TILE },
        { width: q.w, height: q.h, depthOrArrayLayers: 1 },
      );
    }
    rects.length = 0;
  }

  #paint(inks: readonly string[]): void {
    this.#inks = inks;
    const list = (this.colours as unknown as { array: Color[] }).array;
    inks.forEach((c, i) => list[(i + 1) & (COLOURS - 1)].set(c));
  }

  /** A new match: nothing is flooding or breaking, and the clock has gone back. */
  #reset(): void {
    this.#field.reset();
    this.#clocks.forEach((c) => c.set(NOT_YET, 1, NOT_YET, 1));
    this.#ghosts.fill(Infinity);
    this.#marks.length = 0;
  }

  /** A captain's colour by ship index + 1. */
  colour(id: F): V3N {
    return (this.colours as unknown as { element(i: unknown): V3N }).element(id.toInt().bitAnd(COLOURS - 1));
  }

  #clock(id: F): V4N {
    return (this.clocks as unknown as { element(i: unknown): V4N }).element(id.toInt().bitAnd(COLOURS - 1));
  }

  /**
   * The ink over `up` (a unit direction), with `dx` and `dy` its derivatives across the screen, taken where control flow
   * is still uniform. `noise` (0…1) breaks up the lines' ink and dissolves a sunk captain's trail.
   */
  at(up: V3N, dx: V3N, dy: V3N, noise: F): InkHere {
    const { face, eq, q, project } = cubeFace(up);
    const A = texture(this.#a), B = texture(this.#b), T = texture(this.#t);
    const x = eq.add(1).mul(BN / 2).sub(0.5).toVar();
    const c0 = clamp(floor(x.add(0.5)), 0, BN - 1).toVar();
    const t0 = ivec2(c0.add(1)).toVar();
    const tap = (tex: typeof A, i: number, j: number) => tex.load(t0.add(ivec2(i - 1, j - 1)) as I2).depth(face).toVar() as unknown as V4N;
    const ids = (t: V4N) => t.rg.mul(255).add(0.5).floor();

    // texels of the bake per pixel across the screen, along x and along y
    const g = q.xy.div(q.z).toVar();
    const k = float((2 * BN) / Math.PI).div(g.mul(g).add(1).mul(q.z)).toVar();
    const px = project(dx).toVar(), py = project(dy).toVar();
    const jx = px.xy.sub(g.mul(px.z)).mul(k).toVar(), jy = py.xy.sub(g.mul(py.z)).mul(k).toVar();

    const near = tap(A, 1, 1);
    const own = near.r.mul(255).add(0.5).floor().toVar();
    const hue = this.colour(own).toVar(), cover = step(0.5, own).toVar();
    const isMe = (id: F) => float(1).sub(step(0.5, abs(id.sub(this.me))));
    const mine = isMe(own).mul(cover).toVar();
    const edge = float(0).toVar(), crest = float(0).toVar(), drain = float(0).toVar();

    const flat = near.a.lessThan(0.5 / 255).and(near.b.greaterThan(1 - 0.5 / 255)).and(abs(near.r.sub(near.g)).lessThan(0.5 / 255));
    If(flat.not(), () => {
      const u = x.sub(c0).toVar();
      const w0 = u.mul(u).mul(0.5).add(u.mul(-0.5)).add(0.125), w1 = float(0.75).sub(u.mul(u)), w2 = u.mul(u).mul(0.5).add(u.mul(0.5)).add(0.125);
      const d0 = u.sub(0.5), d1 = u.mul(-2), d2 = u.add(0.5);
      const wx = [w0.x, w1.x, w2.x].map((n) => n.toVar()), wy = [w0.y, w1.y, w2.y].map((n) => n.toVar());
      const gx = [d0.x, d1.x, d2.x], gy = [d0.y, d1.y, d2.y];

      /** One field: the owners either side of it, and its value and the change in it per pixel across the screen. */
      const field = (tex: typeof A, a: F, b: F, s: V3N, withFront?: { p: F; since: F; gs: Node<'vec2'> }) => {
        const nearId = ids(tap(tex, 1, 1)).toVar();
        a.assign(nearId.x);
        b.assign(select(nearId.y.notEqual(nearId.x), nearId.y, float(-1)));
        const taps: { t: V4N; id: Node<'vec2'> }[] = [];
        for (let j = 0; j < 3; j++) {
          for (let i = 0; i < 3; i++) {
            const t = tap(tex, i, j), id = ids(t).toVar();
            taps.push({ t, id });
            b.assign(select(b.lessThan(0).and(id.x.notEqual(a)), id.x, b));
            b.assign(select(b.lessThan(0).and(id.y.notEqual(a)), id.y, b));
          }
        }
        const lone = b.lessThan(0);
        const of = (t: V4N, id: Node<'vec2'>, o: F) => select(id.x.equal(o), t.b, float(0)).add(select(id.y.equal(o).and(id.x.notEqual(id.y)), float(1).sub(t.b), float(0)));
        let f: F = float(0);
        let gf: Node<'vec2'> = vec2(0, 0);
        taps.forEach(({ t, id }, n) => {
          const i = n % 3, j = (n - i) / 3;
          const m = select(lone, of(t, id, a), of(t, id, a).sub(of(t, id, b))).toVar();
          const w = wx[i].mul(wy[j]);
          const dw = vec2(gx[i].mul(wy[j]), wx[i].mul(gy[j]));
          f = f.add(w.mul(m));
          gf = gf.add(dw.mul(m));
          if (withFront) {
            withFront.since.addAssign(w.mul(withFront.p.sub(t.a)));
            withFront.gs.subAssign(dw.mul(t.a));
          }
        });
        const scale = select(lone, float(2), float(1));
        const v = select(lone, f.mul(2).sub(1), f).toVar();
        const grad = gf.mul(scale).toVar();
        s.assign(vec3(v, dot(grad, jx), dot(grad, jy)));
      };

      const aF = float(0).toVar(), bF = float(-1).toVar(), sF = vec3(0).toVar();
      field(A, aF, bF, sF);
      const aP = aF.toVar(), bP = bF.toVar(), sP = sF.toVar();

      // the highest mark of any flood reaching here
      let moving: F = float(0);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) moving = max(moving, tap(A, i, j).a);
      const mark = moving.mul(255).add(0.5).floor().toVar();
      const since = float(9).toVar(), gs = vec2(0, 0).toVar(), len = float(1).toVar();
      If(mark.greaterThan(0.5), () => {
        const c = this.#clock(mark).toVar();
        len.assign(c.y);
        since.assign(0);
        field(B, aP, bP, sP, { p: P.time.sub(c.x).div(c.y), since, gs });
      });

      const shade = (a: F, b: F, s: V3N) => {
        const t = clamp(s.x.div(max(length(s.yz), 1e-6)).add(0.5), 0, 1).toVar();
        const la = step(0.5, a), lb = step(0.5, b);
        const ca = select(a.greaterThan(0.5), this.colour(a), this.colour(max(b, 0))), cb = select(b.greaterThan(0.5), this.colour(max(b, 0)), this.colour(a));
        return { hue: mix(cb, ca, t), cover: mix(lb, la, t), mine: mix(isMe(b).mul(lb), isMe(a).mul(la), t), inked: step(0.5, max(a, b)) };
      };
      const f = shade(aF, bF, sF), p = shade(aP, bP, sP);
      const seconds = since.mul(len).toVar();
      const pxT = length(vec2(dot(gs, jx), dot(gs, jy))).mul(len).toVar();
      const tf = clamp(seconds.div(max(pxT, 1e-6)).add(0.5), 0, 1).toVar();
      // land returning to open sea fades out ahead of the receding front
      const fade = mix(float(1), smoothstep(0, 0.6, seconds.negate()), float(1).sub(f.cover)).toVar();
      hue.assign(select(p.cover.greaterThan(0.001), mix(p.hue, f.hue, tf), f.hue));
      cover.assign(mix(p.cover.mul(fade), f.cover, tf));
      mine.assign(mix(p.mine.mul(fade), f.mine, tf));
      const lF = lineAt(abs(sF.x), 0.09, length(sF.yz)).mul(f.inked), lP = lineAt(abs(sP.x), 0.09, length(sP.yz)).mul(p.inked).mul(fade);
      edge.assign(mix(lP, lF, tf).mul(float(0.55).add(noise.mul(0.9))));
      const changed = step(0.001, length(f.hue.sub(p.hue)).add(abs(f.cover.sub(p.cover))));
      crest.assign(lineAt(seconds, CREST, pxT).mul(f.cover).mul(changed).mul(step(0.5, mark)));
      drain.assign(float(1).sub(f.cover).mul(p.cover).mul(select(seconds.lessThan(0), float(1).sub(fade), exp(seconds.mul(-3)))).mul(step(0.5, mark)));
    });

    // a trail is a distance from its line: the mark is read at the nearest texel and the distance between them
    const trail = float(0).toVar(), line = float(0).toVar(), ghost = float(0).toVar(), ghostLine = float(0).toVar(), ghostPale = float(0).toVar();
    const nt = tap(T, 1, 1);
    const stamp = nt.r.mul(255).add(0.5).floor().toVar();
    If(stamp.greaterThan(0.5), () => {
      const mark = mod(stamp, 32).toVar(), going = floor(stamp.div(32)).toVar();
      const uv = x.add(1.5).div(TILE);
      const here = T.sample(uv).depth(face).level(int(0)).toVar() as unknown as V4N;
      const d = here.g.mul(RANGE).toVar();
      const half = here.b.mul(255 / WIDTH_SCALE).div(7).mul(0.85).add(0.15).toVar();
      const gd = vec2(tap(T, 2, 1).g.sub(tap(T, 0, 1).g), tap(T, 1, 2).g.sub(tap(T, 1, 0).g)).mul(RANGE / 2).toVar();
      const fw = max(length(vec2(dot(gd, jx), dot(gd, jy))), 1e-3).toVar();
      const inked = clamp(half.sub(d).div(fw).add(0.5), 0, 1).mul(min(float(1), half.mul(2).div(fw))).toVar();
      If(going.lessThan(0.5), () => {
        trail.assign(mark);
        line.assign(inked);
      }).Else(() => {
        const c = this.#clock(mark).toVar();
        const pr = P.time.sub(c.z).div(c.w).toVar();
        ghost.assign(mark);
        If(going.lessThan(GOING.absorbed + 0.5), () => {
          ghostLine.assign(inked.mul(float(1).sub(smoothstep(0, 1, pr))));
        }).ElseIf(going.lessThan(GOING.broken + 0.5), () => {
          const left = nt.a.sub(pr).toVar();
          ghostLine.assign(inked.mul(step(0, left)).mul(clamp(left.mul(6).add(0.25), 0, 1)));
        }).Else(() => {
          ghostLine.assign(inked.mul(step(noise.mul(0.9).add(0.05), float(1).sub(pr))));
          ghostPale.assign(smoothstep(0, 0.7, pr));
        });
      });
    });
    return { hue, cover, mine, edge, crest, drain, trail, line, ghost, ghostLine, ghostPale };
  }
}

function texel(data: Uint8Array, filter: typeof NearestFilter | typeof LinearFilter): DataArrayTexture {
  const t = new DataArrayTexture(data as Uint8Array<ArrayBuffer>, TILE, TILE, 6);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.magFilter = t.minFilter = filter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Which of a trail's cells lies nearest a point. */
function nearest(cells: readonly number[], at: V3): number {
  let best = -2, from = cells.length - 1;
  const l = Math.hypot(at.x, at.y, at.z);
  cells.forEach((c, k) => {
    cellDir(TERRITORY, c, D);
    const d = (D.x * at.x + D.y * at.y + D.z * at.z) / l;
    if (d > best) {
      best = d;
      from = k;
    }
  });
  return from;
}

