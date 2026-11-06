// The captains' ink on the sea: the water each holds, in their colour, and the trail each is laying round the
// water they mean to take, from the simulation's territory grid (sim/sphere.ts GRID cells a cube face). The grid is
// a texture array read texel by texel, without a sampler; the cells' edges are wobbled by noise into a drawn line,
// and a captain's coast is inked more deeply than the water inside it.
import { Color, DataArrayTexture, NearestFilter, RGFormat, UnsignedByteType, type Node } from 'three/webgpu';
import { clamp, floor, ivec2, step, abs, texture, uniform, uniformArray, vec2 } from 'three/tsl';
import { GRID } from '../../sim/sphere.ts';
import { cubeFace } from '../gpu/cube.ts';

type F = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;

/** The colours there are, by ship index + 1. */
const COLOURS = 32;

export class Territory {
  readonly texture: DataArrayTexture;
  /** Each captain's colour, by ship index + 1. */
  readonly colours = uniformArray(Array.from({ length: COLOURS }, (_, i) => new Color().setHSL((i * 0.618) % 1, 0.75, 0.5)), 'color');
  /** The player's ship index + 1; whether there is any territory to draw. */
  readonly me = uniform(0);
  readonly on = uniform(0);
  #version = -1;

  constructor() {
    const t = new DataArrayTexture(new Uint8Array(GRID * GRID * 6 * 2), GRID, GRID, 6);
    t.format = RGFormat;
    t.type = UnsignedByteType;
    t.magFilter = t.minFilter = NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    this.texture = t;
  }

  /** Copies the territory in when it has changed: owner and trail hold ship index + 1 per cell of the grid, and `me`
   *  is the player's. Null hides it. */
  set(owner: Uint8Array | null, trail: Uint8Array | null, version: number, me = 0): void {
    this.me.value = me;
    this.on.value = owner ? 1 : 0;
    if (!owner || version === this.#version) return;
    this.#version = version;
    const d = this.texture.image.data as Uint8Array, n = Math.min(owner.length, GRID * GRID * 6);
    for (let i = 0; i < n; i++) {
      d[i * 2] = owner[i];
      d[i * 2 + 1] = trail ? trail[i] : 0;
    }
    this.texture.needsUpdate = true;
  }

  /** A captain's colour by ship index + 1. */
  colour(id: F): V3 {
    return (this.colours as unknown as { element(i: unknown): V3 }).element(id.toInt().bitAnd(COLOURS - 1));
  }

  /**
   * The ink over `up`: whose water it is and whose trail runs there (ship index + 1, 0 for none), and how much of
   * the water round it is another's (0 inside, toward 1 on its coast). `jitter` (−0.5…0.5 a cell) wobbles the
   * cells' edges into a drawn line.
   */
  at(up: V3, jitter: V2): { owner: F; trail: F; edge: F } {
    const { face, eq } = cubeFace(up);
    const cell = 2 / GRID;
    const base = eq.add(jitter.mul(cell * 1.1));
    const read = (o: V2) =>
      texture(this.texture).load(ivec2(clamp(floor(base.add(o).add(1).mul(GRID / 2)), 0, GRID - 1))).depth(face).rg.mul(255).add(0.5).floor() as unknown as V2;
    const ids = read(vec2(0, 0));
    const o = cell * 0.3;
    const other = (x: number, y: number): F => step(0.5, abs(read(vec2(x, y)).x.sub(ids.x)));
    const edge = clamp(other(o, 0).add(other(-o, 0)).add(other(0, o)).add(other(0, -o)), 0, 1);
    return { owner: ids.x, trail: ids.y, edge };
  }
}
