// WP22: the Great Current, a mighty river in the sea. Round the eye its stretch is laid on the sea as stream arcs
// (Sea.setStreams: the lanes' flow in the water itself) and drawn over as a ribbon of moving water: lanes of broken
// ink strokes shearing past each other, fastest down the middle; chevrons surging downstream; broken foam lines along
// both banks with eddies spilling beyond; a granulating ochre glow with gold glimmers riding it, brightest while the
// fleet rides it out at the opening. Ships riding it throw bow spray and leave foam streaks (fx.ts). One draw; its
// window follows the eye, the whole route in view from high up. While the eye stays low over the player's wreck the
// ribbon (a flat strip the swell would cut into hard-edged pools and ruled bars) dries off the sea in broken patches,
// a soft watercolour going, and comes back as the eye rises to the chart (S-019 (s)).
import * as THREE from 'three';
import { seaFor, type Sea as Waters } from '../sim/environment.ts';
import { R } from '../sim/sphere.ts';
import { afloat, PHASE, type MatchState } from '../sim/state.ts';
import { GREAT_CURRENT } from '../sim/tables.ts';
import { inkMaterial } from '../style/glsl.ts';
import { effects, FX, mix32, rng, TINT } from './fx.ts';
import { seas, type Arc } from './sea.ts';
import { fleets } from './ships/shipView.ts';
import type { MatchFrame, RenderContext, RenderModule } from './world.ts';

/**
 * The ribbon's segments, the stream arcs laid, its lift over the sea (u), its reach beyond the current's half-width
 * (the banks' foam spills over), the least reach round the eye (u; three times the eye's height above that), the
 * strokes' pace over the current's own speed, and the glow at rest and added while the whole fleet rides.
 */
export const CURRENT = { segments: 192, arcs: 8, lift: 0.25, bank: 1.3, reach: 160, pace: 1.25, glow: 0.5, ride: 0.6 } as const;

/** u: under this eye height (above the sinking's lift, CINE.liftUp) the ribbon holds off the player's wreck. */
const HOLD_ALT = 45;

const at = (pts: Float64Array, k: number) => ({ x: pts[3 * k], y: pts[3 * k + 1], z: pts[3 * k + 2] });

export class CurrentView implements RenderModule {
  readonly mesh: THREE.Mesh;
  /** The stream arcs last laid on the sea. */
  readonly arcs: Arc[] = [];
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: THREE.BufferAttribute;
  private readonly flow: THREE.BufferAttribute;
  private waters: Waters | null = null;
  private seed = -1;
  private key = '';
  private slot = -1;
  private readonly c = new THREE.Vector3();
  private readonly t = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  private readonly ctx: RenderContext;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
    const n = CURRENT.segments + 1, index: number[] = [];
    this.pos = new THREE.BufferAttribute(new Float32Array(6 * n), 3).setUsage(THREE.DynamicDrawUsage);
    this.flow = new THREE.BufferAttribute(new Float32Array(6 * n), 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('aFlow', this.flow);
    for (let j = 0; j < CURRENT.segments; j++) index.push(2 * j, 2 * j + 1, 2 * j + 2, 2 * j + 1, 2 * j + 3, 2 * j + 2);
    this.geo.setIndex(index);
    this.uniforms = {
      uCurClock: { value: 0 }, uCurSpeed: { value: GREAT_CURRENT.speed * CURRENT.pace }, uCurGlow: { value: CURRENT.glow + CURRENT.ride },
      uCurLength: { value: 1 }, uCurTaper: { value: GREAT_CURRENT.taper }, uCurHold: { value: 1 },
      uCurInk: { value: TINT.deep }, uCurFoam: { value: TINT.foam }, uCurWash: { value: TINT.ochre }, uCurGold: { value: TINT.gold },
    };
    const m = inkMaterial(ctx.pipeline.style, { uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, veil: true, side: THREE.DoubleSide });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    this.mesh = new THREE.Mesh(this.geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    ctx.scene.add(this.mesh);
  }

  /** Triangles drawn. */
  get triangles(): number {
    return this.mesh.visible ? 2 * CURRENT.segments : 0;
  }

  frame(f: MatchFrame): void {
    const st = f.state;
    if (st.seed !== this.seed || !this.waters) { this.seed = st.seed; this.waters = seaFor(this.ctx.world, st.seed); this.key = ''; }
    const route = this.waters.current;
    this.uniforms.uCurLength.value = route.length;
    this.lay(route.points, route.length);
    const fleet = st.ships.filter(afloat).length, riding = st.ships.filter((s) => s.phase === PHASE.riding).length / Math.max(1, fleet);
    const glow = this.uniforms.uCurGlow;
    glow.value += (CURRENT.glow + CURRENT.ride * riding - glow.value) * Math.min(1, 1.5 * f.dt);
    this.uniforms.uCurClock.value = f.clock;
    // the player sunk and the eye low over her: the ribbon dries off in about 1.5 s; it comes back as the eye rises
    const hold = this.uniforms.uCurHold, low = st.ships[0]?.phase === PHASE.sunk && this.ctx.camera.position.length() - R < HOLD_ALT;
    hold.value = Math.min(1, Math.max(0, (hold.value as number) + (low ? -1 : 1) * f.dt / 1.5));
    this.mesh.visible &&= (hold.value as number) > 0;
    this.ride(st, f.clock);
  }

  dispose(): void {
    this.ctx.scene.remove(this.mesh);
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  /** The window of the route round the eye's foot: the ribbon's vertices and the stream arcs, when it moves. */
  private lay(pts: Float64Array, length: number): void {
    const n = pts.length / 3, step = length / (n - 1), eye = this.ctx.camera.position, foot = this.p.copy(eye).normalize();
    let best = 0, near = -2;
    for (let k = 0; k < n; k++) {
      const d = pts[3 * k] * foot.x + pts[3 * k + 1] * foot.y + pts[3 * k + 2] * foot.z;
      if (d > near) { near = d; best = k; }
    }
    const reach = Math.max(CURRENT.reach, 3 * Math.max(0, eye.length() - R));
    if (Math.acos(Math.min(1, near)) * R > reach + GREAT_CURRENT.width) {
      if (this.key !== '') { this.key = ''; this.arcs.length = 0; seas.get(this.ctx.scene)?.setStreams(this.arcs); }
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const half = Math.ceil(reach / step), k0 = Math.max(0, best - half), k1 = Math.min(n - 1, best + half), key = `${k0}:${k1}`;
    if (key === this.key) return;
    this.key = key;
    const P = this.pos.array as Float32Array, F = this.flow.array as Float32Array, S = CURRENT.segments, w = 0.5 * GREAT_CURRENT.width * CURRENT.bank;
    for (let j = 0; j <= S; j++) {
      const kf = k0 + ((k1 - k0) * j) / S, k = Math.min(n - 2, Math.floor(kf)), u = kf - k, a = Math.max(0, k - 1), b = Math.min(n - 1, k + 2);
      const c = this.c.set(pts[3 * k] + u * (pts[3 * k + 3] - pts[3 * k]), pts[3 * k + 1] + u * (pts[3 * k + 4] - pts[3 * k + 1]), pts[3 * k + 2] + u * (pts[3 * k + 5] - pts[3 * k + 2])).normalize();
      const t = this.t.set(pts[3 * b] - pts[3 * a], pts[3 * b + 1] - pts[3 * a + 1], pts[3 * b + 2] - pts[3 * a + 2]);
      const side = this.s.crossVectors(c, t).normalize().multiplyScalar(w);
      c.multiplyScalar(R + CURRENT.lift);
      const i = 6 * j, along = kf * step, fade = Math.min(1, (5 * j) / S, (5 * (S - j)) / S);
      P[i] = c.x - side.x; P[i + 1] = c.y - side.y; P[i + 2] = c.z - side.z;
      P[i + 3] = c.x + side.x; P[i + 4] = c.y + side.y; P[i + 5] = c.z + side.z;
      F[i] = along; F[i + 1] = -CURRENT.bank; F[i + 2] = fade;
      F[i + 3] = along; F[i + 4] = CURRENT.bank; F[i + 5] = fade;
    }
    this.pos.needsUpdate = true;
    this.flow.needsUpdate = true;
    this.arcs.length = 0;
    for (let j = 0; j < CURRENT.arcs; j++) {
      const ka = Math.round(k0 + ((k1 - k0) * j) / CURRENT.arcs), kb = Math.round(k0 + ((k1 - k0) * (j + 1)) / CURRENT.arcs);
      if (kb > ka) this.arcs.push({ a: at(pts, ka), b: at(pts, kb), width: GREAT_CURRENT.width, speed: GREAT_CURRENT.speed });
    }
    seas.get(this.ctx.scene)?.setStreams(this.arcs);
  }

  /** Ships riding the current throw spray off both bows and leave streaks of foam sliding down it. */
  private ride(st: MatchState, clock: number): void {
    const slot = Math.floor(clock / 0.15), fx = effects.get(this.ctx.scene), fleet = fleets.get(this.ctx.scene);
    if (slot === this.slot || !fx || !fleet) return;
    this.slot = slot;
    const r = rng(mix32(st.seed, slot, 911));
    st.ships.forEach((s, i) => {
      const v = fleet.views[i];
      if (s.phase !== PHASE.riding || !v) return;
      const up = this.c.copy(v.ship.position).normalize(), side = this.s.crossVectors(v.forward, up).normalize();
      const bow = this.p.copy(v.ship.position).addScaledVector(v.forward, 0.45 * v.length).addScaledVector(up, 0.4);
      for (const sign of [-1, 1]) {
        this.t.copy(up).multiplyScalar(3 + 2 * r()).addScaledVector(side, sign * (2 + 2 * r())).addScaledVector(v.forward, 2 + 2 * r());
        fx.put(FX.spray, bow, this.t, 0.07 * r(), 0.7, 0.2, 0.32, TINT.foam, { g: 10 });
      }
      this.t.copy(v.ship.position).addScaledVector(side, (r() - 0.5) * 2.5 * v.beam).addScaledVector(v.forward, -0.4 * v.length).setLength(R);
      fx.put(FX.streak, this.t, v.forward, 0, 1.6, 1.4, 2.6, TINT.foam, { g: 0.6 * GREAT_CURRENT.speed });
    });
  }
}

export const createCurrents = (ctx: RenderContext): RenderModule => new CurrentView(ctx);

const VERT = /* glsl */ `
attribute vec3 aFlow;
varying vec3 vFlow; // u down the route, across in the current's half-widths, the window's fade
void main() {
  vFlow = aFlow;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uCurClock, uCurSpeed, uCurGlow, uCurLength, uCurTaper, uCurHold;
uniform vec3 uCurInk, uCurFoam, uCurWash, uCurGold;
varying vec3 vFlow;
float cuHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cuNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cuHash(i), cuHash(i + vec2(1.0, 0.0)), f.x), mix(cuHash(i + vec2(0.0, 1.0)), cuHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float cuLine(float d, float w) { float f = fwidth(d); return 1.0 - smoothstep(w, w + 1.5 * f, abs(d)); }
void main() {
  float s = vFlow.x, x = vFlow.y, ax = abs(x), side = sign(x);
  float ends = clamp(min(s, uCurLength - s) / uCurTaper, 0.0, 1.0) * vFlow.z;
  float core = clamp(1.0 - x * x, 0.0, 1.0);
  float flow = s - uCurClock * uCurSpeed * (0.55 + 0.45 * core); // fastest down the middle: the strokes shear
  float far = clamp(0.5 * fwidth(s), 0.0, 1.0); // u a pixel: far off the fine strokes give way to the broad marks
  // lanes of broken ink strokes, each its own length and pace
  float lane = (x * 0.5 + 0.5) * 12.0, li = floor(lane), lf = fract(lane) - 0.5;
  float ph = flow / (5.0 + 4.0 * cuHash(vec2(li, 3.0))) + cuHash(vec2(li, 7.0)), sf = fract(ph);
  float stroke = step(0.42, cuHash(vec2(li, floor(ph)))) * step(ax, 0.95) * cuLine(lf - 0.15 * sin(s * 0.21 + li * 1.7), 0.05)
    * smoothstep(0.0, 0.15, sf) * smoothstep(1.0, 0.6, sf) * (1.0 - far);
  // chevrons surging downstream down the middle
  float v = flow / 16.0 + ax * 1.1;
  float chev = cuLine(fract(v) - 0.5, 0.035) * step(ax, 0.6) * step(0.45, cuHash(vec2(floor(v), 1.0))) * (1.0 - 0.6 * far);
  // broken foam along both banks, eddies spilling beyond
  float foam = cuLine(ax - 0.92 - 0.04 * sin(s * 0.27 + uCurClock * 0.8 + side * 2.0), 0.035) * step(0.38, cuNoise(vec2(flow * 0.18, side * 5.0)));
  float eddy = cuLine(ax - 1.12 - 0.05 * cuNoise(vec2(s * 0.1, side)), 0.02) * step(0.62, cuNoise(vec2(flow * 0.07, side * 9.0 + 3.0)));
  // the glow: a warm wash flowing with the water, granulating, gold glimmers riding the middle
  float glow = uCurGlow * pow(core, 1.3) * (0.65 + 0.55 * cuNoise(vec2(flow * 0.04, x * 2.2)));
  float glim = step(0.985, cuHash(floor(vec2(flow * 0.5, x * 9.0)))) * core * uCurGlow;
  vec3 col = mix(mix(uCurWash, uCurGold, 0.6 * glim), uCurInk, clamp(stroke + chev, 0.0, 1.0));
  float a = max(0.32 * glow + 0.6 * glim, 0.75 * stroke + 0.55 * chev);
  col = mix(col, uCurFoam, max(foam, eddy));
  a = max(a, 0.9 * foam + 0.6 * eddy) * ends * (1.0 - smoothstep(1.15, 1.3, ax));
  // held off the wreck: it dries off in broken, soft-edged patches (two octaves of noise in the water's own frame)
  if (uCurHold < 1.0) {
    float dry = 0.65 * cuNoise(vec2(s * 0.09, x * 1.7)) + 0.35 * cuNoise(vec2(s * 0.31 + 5.0, x * 5.3));
    a *= smoothstep(1.0 - uCurHold, 1.0 - uCurHold + 0.3, dry) * smoothstep(0.0, 0.5, uCurHold);
  }
  if (a < 0.01) discard;
  writeVeil(col, min(a, 1.0));
}`;
