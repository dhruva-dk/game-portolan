// The sea's currents and its calms, where the surface is drawn.
//
// The currents: the Great Current east along the equator and the Maelstrom's whirl are worked out here as the
// simulation does (sim/world currentAt, vortexAt); the lanes come from a field laid over the planet in a worker
// (flowField.ts), scaled region by region as the events send them into spate. The surface streams its ripples and
// its foam along them by Vlachos's flow map ("Water Flow in Portal 2", SIGGRAPH 2010): each is read twice, carried
// down the flow for a period's two halves offset by half a period, and the two blended so whichever has been
// carried furthest is gone when it jumps back.
//
// The calms: where a calm system sits the wind drops away and the sea goes glassy, its waves and ripples stilled
// toward the middle of it.
import { ClampToEdgeWrapping, DataArrayTexture, HalfFloatType, LinearFilter, RGBAFormat, Vector2, Vector4, type Node } from 'three/webgpu';
import { abs, cross, dot, float, int, length, max, select, smoothstep, sqrt, texture, uniform, uniformArray, vec3 } from 'three/tsl';
import { CURRENTS, GREAT_CURRENT, REGION_COUNT, VORTEX } from '../../sim/world/index.ts';
import { R } from '../../sim/sphere.ts';
import { cubeFace } from '../gpu/cube.ts';
import { FLOW_NODES } from './flowField.ts';
import type { WeatherSystem } from '../stage.ts';

type F = Node<'float'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

const ROW = FLOW_NODES, N = ROW - 1;
/** Calm systems the sea can still at once. */
const CALMS = 4;

export class Flow {
  readonly texture: DataArrayTexture;
  /** 1 once the lanes have arrived. */
  readonly on = uniform(0);
  readonly ready: Promise<void>;
  /** Each region's lanes' speed against their charted one. */
  readonly #scale = uniformArray(new Array<number>(REGION_COUNT).fill(1), 'float');
  readonly #vortex = uniform(1);
  /** Each calm: its centre and how still (x, y, z, w), and the cosines of its edge and of where it is stillest. */
  readonly #calm = uniformArray(Array.from({ length: CALMS }, () => new Vector4()), 'vec4');
  readonly #calmEdge = uniformArray(Array.from({ length: CALMS }, () => new Vector2(2, 2)), 'vec2');

  constructor() {
    const t = new DataArrayTexture(new Uint16Array(ROW * ROW * 6 * 4), ROW, ROW, 6);
    t.format = RGBAFormat;
    t.type = HalfFloatType;
    t.magFilter = t.minFilter = LinearFilter;
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    this.texture = t;
    this.ready = new Promise((done) => {
      const w = new Worker(new URL('./flow-worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<Uint16Array>) => {
        (t.image as { data: Uint16Array }).data = e.data;
        t.needsUpdate = true;
        this.on.value = 1;
        w.terminate();
        done();
      };
      w.onerror = (e) => {
        console.error('the flow worker failed', e.message);
        w.terminate();
        done();
      };
      w.postMessage(0);
    });
  }

  /** The events' hold on the currents: each lane's speed scale (by its index in CURRENTS) and the vortex's. */
  set(currents?: { lanes: readonly number[]; vortex: number }): void {
    const s = this.#scale.array as number[];
    if (!currents) s.fill(1);
    else {
      s.fill(0);
      CURRENTS.forEach((l, i) => (s[l.region] = Math.max(s[l.region], currents.lanes[i] ?? 1)));
      for (let r = 0; r < s.length; r++) if (!CURRENTS.some((l) => l.region === r)) s[r] = 1;
    }
    this.#vortex.value = currents?.vortex ?? 1;
  }

  /** The calm systems over the planet now, the nearest the eye first when there are more than the sea can hold. */
  calms(systems: readonly WeatherSystem[], eye: { x: number; y: number; z: number }): void {
    const l = Math.hypot(eye.x, eye.y, eye.z) || 1;
    const near = systems.filter((s) => s.kind === 'calm' && s.strength > 0)
      .map((s) => ({ s, d: (s.at.x * eye.x + s.at.y * eye.y + s.at.z * eye.z) / l }))
      .sort((a, b) => b.d - a.d);
    const c = this.#calm.array as Vector4[], e = this.#calmEdge.array as Vector2[];
    for (let k = 0; k < CALMS; k++) {
      const s = near[k]?.s;
      if (!s) {
        c[k].set(0, 1, 0, 0);
        e[k].set(2, 2);
        continue;
      }
      c[k].set(s.at.x, s.at.y, s.at.z, Math.min(1, s.strength));
      e[k].set(Math.cos(Math.min(Math.PI, s.radius / R)), Math.cos(Math.min(Math.PI, (s.radius * 0.55) / R)));
    }
  }

  /** How still the sea is at `up` (a unit direction), 0…1. */
  calmAt(up: V3): F {
    const c = this.#calm as unknown as { element(i: number): V4 };
    const e = this.#calmEdge as unknown as { element(i: number): Node<'vec2'> };
    let still: F = float(0);
    for (let k = 0; k < CALMS; k++) {
      const s = c.element(k), edge = e.element(k);
      still = max(still, smoothstep(edge.x, edge.y, dot(up, s.xyz)).mul(s.w));
    }
    return still;
  }

  /** The water's flow at `up` (a unit direction from the planet's centre), metres a second along the surface. */
  at(up: V3): V3 {
    // the Great Current, east along the equator
    const de = abs(up.y).mul(R).mul(float(1).add(up.y.mul(up.y).div(6)));
    const gs = float(GREAT_CURRENT.speed).mul(float(1).sub(smoothstep(GREAT_CURRENT.half, GREAT_CURRENT.fade, de)));
    const east = vec3(up.z, 0, up.x.negate());
    const great = east.div(max(length(east), 1e-6)).mul(gs);
    // the lanes, each region's at its events' pace
    const { face, eq } = cubeFace(up);
    const uv = eq.add(1).mul(N / 2).add(0.5).div(ROW);
    const l = texture(this.texture, uv).depth(face).level(float(0));
    const scale = (this.#scale as unknown as { element(i: Node<'int'>): F }).element(int(l.w.add(0.5)));
    const lanes = l.xyz.mul(scale);
    // the Maelstrom: round the Eye clockwise seen from above the pole and in toward it, stilled in the eye itself
    const c = vec3(VORTEX.pos.x, VORTEX.pos.y, VORTEX.pos.z);
    const d = dot(up, c);
    const lim = 1 - (VORTEX.r * VORTEX.r) / (2 * R * R);
    const toward = c.sub(up.mul(d));
    const radial = toward.div(max(length(toward), 1e-6));
    const rho = sqrt(max(float(2).sub(d.mul(2)), 0)).mul(R);
    const u = rho.div(VORTEX.r);
    const rim = float(1).sub(smoothstep(0.75, 1, u));
    const still = smoothstep(VORTEX.eye * 0.6, VORTEX.eye * 1.6, rho);
    const swirl = this.#vortex.mul(VORTEX.swirl).mul(rim).mul(still).mul(float(1).sub(u).mul(0.55).add(0.45));
    const inflow = this.#vortex.mul(VORTEX.inflow).mul(rim).mul(still);
    const whirl = select(d.greaterThanEqual(lim), cross(up, radial).mul(swirl).add(radial.mul(inflow)), vec3(0));
    return great.add(lanes).add(whirl) as V3;
  }
}
