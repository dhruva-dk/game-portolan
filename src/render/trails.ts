// Trails (WP20): each ship's open trail as a pen stroke laid live behind it — world-anchored points every TRAIL_STEP u
// along the stern's path (as the wakes lay theirs), the newest riding the stern so the stroke never gaps, displaced by
// the swell and depth-tested a little nearer the eye. The nib's pressure swells and eases the stroke and its line
// wavers; each team draws its pattern (palette.ts TEAMS, glsl.ts trailPattern) in its colour, so every ship reads
// without colour. A rival's trail shows only where the player's sight allows (visibility.ts trailSeen). A stroke whose
// loop closed sinks into the flood; a broken or foundered one washes away in runs of ink along the sea, thinning and
// bleeding out. All strokes are one draw.
import * as THREE from 'three';
import { seas } from './sea.ts';
import { SWELL_GLSL, type Swell } from './swell.ts';
import type { RenderContext, RenderModule } from './world.ts';
import { inkMaterial, linearVec, transmittanceVec, type Style } from '../style/glsl.ts';
import { TEAMS, TRAIL_MIN_CSS, TRAIL_PATTERNS } from '../style/palette.ts';
import { seaFor, type Sea } from '../sim/environment.ts';
import { cellOf, R, TERRITORY } from '../sim/sphere.ts';
import { PHASE, SHIPS, type MatchState, type Ship } from '../sim/state.ts';
import { trailSeen } from '../sim/visibility.ts';

/** Strokes drawn at once: every ship's open trail and those still washing away. */
export const STROKES = 16;
/** Points per stroke and u between them: a stroke holds STROKE_PTS·TRAIL_STEP u of trail. */
export const STROKE_PTS = 1024, TRAIL_STEP = 0.7;
/** s a closed loop's stroke takes to sink into its flood, and a broken one to wash away. */
export const SETTLE_TIME = 1.6, WASH_AWAY_TIME = 3.6;
/** The band a pattern is drawn across at the deck, u; it doubles by octaves farther off, never under TRAIL_MIN_CSS. */
const BAND = 1.4;
/** The ribbon's width in bands: room for the nib's swell, the wobble and the runs. */
const PAD = 3;
/** u astern of the ship's centre the pen lays. */
const STERN = 3;
/** Frames between fog checks of rivals' trails. */
const SEEN_EVERY = 15;
/** The ship whose sight the trails are drawn for. */
const PLAYER = 0;
const DIE = { settle: 1, washAway: 2 } as const;

const VERTEX = /* glsl */ `
${SWELL_GLSL}
uniform float uTime;
uniform float uBand;
uniform vec4 uStroke[STROKES];
in vec4 aFwd;  // the heading there (tangent), and u along the trail
in vec4 aInfo; // side (−1, 1), stroke slot, 0, shown 1, hidden by fog 0, unused −1
out vec3 vRest;
out vec3 vWorld;
out vec2 vUv;
out float vShown;
out float vAge;
flat out int vSlot;
void main() {
  vec3 dir = normalize(position);
  vSlot = int(aInfo.y + 0.5);
  float hw = aInfo.w < -0.5 ? 0.0 : 0.5 * uBand * PAD;
  vec3 side = cross(dir, aFwd.xyz);
  side /= max(length(side), 1e-6);
  vec3 p = normalize(dir * SEA_R + side * aInfo.x * hw);
  vec4 f = seaField(p);
  vec3 n;
  float lift;
  vec3 d = swell(p, uTime, swellAmp(uSeaLevel - f.x), n, lift);
  vRest = p;
  vWorld = p * (SEA_R + uSeaLevel) + d;
  vUv = vec2(aInfo.x * 0.5 * PAD, aFwd.w / uBand);
  vShown = aInfo.w;
  vAge = uTime - uStroke[vSlot].z;
  vec3 e = cameraPosition - vWorld;
  float de = length(e);
  vec4 c = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  vec4 nearer = projectionMatrix * viewMatrix * vec4(vWorld + e * (min(0.4 + 0.01 * de, 0.5 * de) / de), 1.0);
  gl_Position = vec4(c.xy, nearer.z / nearer.w * c.w, c.w);
}
`;

const FRAGMENT = /* glsl */ `
in vec3 vRest;
in vec3 vWorld;
in vec2 vUv;
in float vShown;
in float vAge;
flat in int vSlot;
uniform vec4 uStroke[STROKES];
uniform vec3 uTeamLin[STROKES];
uniform vec3 uTeamT[STROKES];
const float SEA_R = ${R.toFixed(1)}, SETTLE = ${SETTLE_TIME.toFixed(2)}, WASH = ${WASH_AWAY_TIME.toFixed(2)};
float hash(float x) { return fract(sin(x * 127.1 + 31.7) * 43758.5453); }
void main() {
  if (vShown < 0.5) discard;
  vec4 st = uStroke[vSlot];
  vec3 dir = normalize(vRest), P = dir * SEA_R;
  Paper q = paperAt(P, dir, 1.0);
  float s = vUv.y;
  // the nib: pressure swelling and easing along the stroke, its line wavering a little
  float press = 0.86 + 0.14 * sin(0.57 * s + 1.9 * sin(0.21 * s)) + 0.1 * (q.mottle - 0.5);
  float t = (vUv.x - 0.05 * sin(0.83 * s + 2.3 * sin(0.29 * s))) / press;
  float age = max(vAge, 0.0), fade = 1.0, bleed = 1.0, run = 0.0;
  if (st.y > 1.5) {
    // washing away: ink runs out of the stroke across the sea, and the stroke thins and bleeds into the water
    float k = clamp(age / WASH, 0.0, 1.0), seg = floor(s * 1.6), h = hash(seg + 13.0 * float(vSlot));
    float x = t * (hash(seg * 1.7 + 5.0) > 0.5 ? 1.0 : -1.0) - 0.15;
    float len = step(0.4, h) * (0.4 + 1.6 * h) * smoothstep(0.0, 0.6, k);
    float wide = 0.12 * (1.0 + 0.8 * max(x, 0.0)) * (0.6 + 0.8 * hash(seg + 0.5));
    run = step(0.0, x) * (1.0 - smoothstep(len - 0.12, len, x)) * (1.0 - smoothstep(0.7 * wide, wide, abs(fract(s * 1.6) - 0.5) / 1.6));
    bleed = 1.0 + 0.8 * k;
    fade = (1.0 - smoothstep(0.5, 1.0, k)) * smoothstep(-0.1, 0.25, q.grain + 0.35 - 0.9 * k);
  } else if (st.y > 0.5) {
    // the loop closed: the stroke sinks into the flood
    fade = 1.0 - smoothstep(0.0, SETTLE, age);
    bleed = 1.0 + 0.4 * age / SETTLE;
  }
  float tb = t / bleed, ink = trailPattern(int(st.x + 0.5), s, tb, max(fwidth(tb), 1e-4));
  ink *= mix(1.0, smoothstep(0.2, 0.5, q.grain), smoothstep(0.84, 0.74, press)); // a dry nib where the pressure eases
  vec3 lin = uTeamLin[vSlot], tr = uTeamT[vSlot];
  vec3 col = wash(trailColour(lin, tr), tr, 0.35 * smoothstep(0.08, 0.26, abs(tb))); // ink pooling toward its edges
  float a = max(ink, 0.7 * run) * fade / bleed;
  if (a < 0.004) discard;
  writeVeil(candle(mix(col, wash(uPaper, tr, 0.9), run * (1.0 - ink)), vWorld), a);
}
`;

interface Stroke {
  readonly ship: number;
  die: number;
  start: number;
  /** Points laid; the head (riding the stern) is the next. */
  count: number;
  /** u laid to the last point. */
  odo: number;
  /** The trail's length (Ship.laid) when each point was laid, less one: its index for trailSeen. */
  readonly k: Int32Array;
  readonly last: THREE.Vector3;
  laid: number;
}

export class Trails {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(STROKES * STROKE_PTS * 2 * 3);
  private readonly fwd = new Float32Array(STROKES * STROKE_PTS * 2 * 4);
  private readonly info = new Float32Array(STROKES * STROKE_PTS * 2 * 4);
  private readonly strokes: (Stroke | null)[] = new Array<Stroke | null>(STROKES).fill(null);
  private readonly live = new Int32Array(SHIPS).fill(-1);
  private readonly touched = Array.from({ length: STROKES }, () => [STROKE_PTS, -1]);
  private readonly uniforms = {
    uBand: { value: BAND },
    uStroke: { value: Array.from({ length: STROKES }, () => new THREE.Vector4()) },
    uTeamLin: { value: Array.from({ length: STROKES }, () => new THREE.Vector3()) },
    uTeamT: { value: Array.from({ length: STROKES }, () => new THREE.Vector3()) },
  };
  private readonly at = new THREE.Vector3();
  private readonly f = new THREE.Vector3();
  private state: MatchState | null = null;
  private frames = 0;

  constructor(style: Style, swell: Swell) {
    const idx = new Uint32Array(STROKES * (STROKE_PTS - 1) * 6);
    for (let s = 0, k = 0; s < STROKES; s++) {
      for (let j = 0; j < STROKE_PTS - 1; j++, k += 6) {
        const a = (s * STROKE_PTS + j) * 2;
        idx[k] = a; idx[k + 1] = idx[k + 4] = a + 1; idx[k + 2] = idx[k + 3] = a + 2; idx[k + 5] = a + 3;
      }
    }
    this.geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    for (let v = 0; v < STROKES * STROKE_PTS * 2; v++) {
      this.pos[v * 3 + 2] = 1;
      this.info.set([v & 1 ? 1 : -1, Math.floor(v / (2 * STROKE_PTS)), 0, -1], v * 4);
    }
    for (const [name, a, n] of [['position', this.pos, 3], ['aFwd', this.fwd, 4], ['aInfo', this.info, 4]] as const) {
      this.geometry.setAttribute(name, new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage));
    }
    this.mesh = new THREE.Mesh(this.geometry, inkMaterial(style, {
      vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: { ...swell.uniforms, ...this.uniforms },
      defines: { STROKES, PAD: PAD.toFixed(1) }, veil: true, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
  }

  /** Triangles the strokes submit. */
  get triangles(): number {
    return this.geometry.index!.count / 3;
  }

  /**
   * Lay the trails of `state` drawn at `alpha` between its last two ticks at render-clock `clock`, the band sized for
   * an eye at `eye`; `seen(owner, k)` says whether the player sees cell k of a rival's trail.
   */
  frame(state: MatchState, alpha: number, clock: number, eye: THREE.Vector3, seen: (owner: number, k: number) => boolean): void {
    if (state !== this.state) {
      this.state = state;
      this.live.fill(-1);
      for (let s = 0; s < STROKES; s++) if (this.strokes[s]) this.clear(s);
    }
    const fog = this.frames++ % SEEN_EVERY === 0;
    for (let i = 0; i < SHIPS; i++) {
      const ship = state.ships[i], laid = ship.laid.length;
      let s = this.live[i];
      if (s >= 0 && (laid < this.strokes[s]!.laid || laid === 0 || ship.phase === PHASE.sunk)) {
        this.end(s, state.owner[cellOf(TERRITORY, ship.pos)] === i + 1 ? DIE.settle : DIE.washAway, clock);
        s = -1;
      }
      if (laid === 0 || ship.phase === PHASE.sunk) continue;
      this.stern(ship, alpha);
      const k = laid - 1, shown = i === PLAYER || seen(i, k) ? 1 : 0;
      if (s < 0) s = this.begin(i, clock);
      const st = this.strokes[s]!;
      st.laid = laid;
      const d = st.last.angleTo(this.at) * R;
      if (d >= TRAIL_STEP && st.count < STROKE_PTS - 1) {
        st.odo += d;
        st.k[st.count] = k;
        this.put(s, st.count++, st.odo, shown);
        st.last.copy(this.at);
        st.k[st.count] = k;
        this.put(s, st.count, st.odo, shown);
      } else {
        st.k[st.count] = k;
        this.put(s, st.count, st.odo + d, shown);
      }
      if (st.count + 1 < STROKE_PTS) this.put(s, st.count + 1, st.odo + d, -1); // the next point waits collapsed on the head
      if (fog && i !== PLAYER) this.fog(s, seen);
    }
    for (let s = 0; s < STROKES; s++) {
      const st = this.strokes[s];
      if (st && st.die && clock - st.start > (st.die === DIE.settle ? SETTLE_TIME : WASH_AWAY_TIME)) this.clear(s);
    }
    const least = (TRAIL_MIN_CSS * 1.4 * Math.max(eye.length() - R, 1)) / 905; // u that span the narrowest trail at the view's distance
    this.uniforms.uBand.value = BAND * 2 ** Math.max(0, Math.ceil(Math.log2(least / BAND)));
    this.commit();
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  /** The stern's point on the sphere (at) and the heading (f), drawn at alpha between the last two ticks. */
  private stern(ship: Ship, alpha: number): void {
    const p = this.at.set(ship.was.x + (ship.pos.x - ship.was.x) * alpha, ship.was.y + (ship.pos.y - ship.was.y) * alpha,
      ship.was.z + (ship.pos.z - ship.was.z) * alpha).normalize();
    const f = this.f.set(ship.wasHead.x + (ship.head.x - ship.wasHead.x) * alpha, ship.wasHead.y + (ship.head.y - ship.wasHead.y) * alpha,
      ship.wasHead.z + (ship.head.z - ship.wasHead.z) * alpha);
    f.addScaledVector(p, -p.dot(f)).normalize();
    p.multiplyScalar(R).addScaledVector(f, -STERN).normalize();
  }

  private begin(ship: number, clock: number): number {
    let s = this.strokes.indexOf(null);
    if (s < 0) {
      for (let j = 0; j < STROKES; j++) if (this.strokes[j]!.die && (s < 0 || this.strokes[j]!.start < this.strokes[s]!.start)) s = j;
    }
    const team = TEAMS[ship % TEAMS.length];
    this.strokes[s] = { ship, die: 0, start: clock, count: 0, odo: 0, k: new Int32Array(STROKE_PTS), last: this.at.clone(), laid: 0 };
    this.live[ship] = s;
    this.uniforms.uStroke.value[s].set(TRAIL_PATTERNS.indexOf(team.pattern), 0, 0, 0);
    this.uniforms.uTeamLin.value[s].copy(linearVec(team.primary));
    this.uniforms.uTeamT.value[s].copy(transmittanceVec(team.primary));
    for (let j = 0; j < STROKE_PTS; j++) this.put(s, j, 0, -1);
    return s;
  }

  private end(s: number, die: number, clock: number): void {
    const st = this.strokes[s]!;
    st.die = die;
    st.start = clock;
    this.live[st.ship] = -1;
    this.uniforms.uStroke.value[s].y = die;
    this.uniforms.uStroke.value[s].z = clock;
  }

  /** Collapse stroke s and free its slot. */
  private clear(s: number): void {
    for (let v = s * STROKE_PTS * 2; v < (s + 1) * STROKE_PTS * 2; v++) this.info[v * 4 + 3] = -1;
    this.touch(s, 0, STROKE_PTS - 1);
    this.strokes[s] = null;
  }

  /** Show or hide each point of rival stroke s as the player's sight allows. */
  private fog(s: number, seen: (owner: number, k: number) => boolean): void {
    const st = this.strokes[s]!;
    let k = -1, shown = 1;
    for (let j = 0; j <= st.count; j++) {
      if (st.k[j] !== k) shown = seen(st.ship, (k = st.k[j])) ? 1 : 0;
      this.info[((s * STROKE_PTS + j) * 2) * 4 + 3] = this.info[((s * STROKE_PTS + j) * 2 + 1) * 4 + 3] = shown;
    }
    this.touch(s, 0, st.count);
  }

  /** Point j of stroke s at the stern (at, f), `odo` u along, shown 1, hidden 0 or unused −1. */
  private put(s: number, j: number, odo: number, shown: number): void {
    const p = this.at, f = this.f;
    for (let side = 0; side < 2; side++) {
      const v = (s * STROKE_PTS + j) * 2 + side;
      this.pos[v * 3] = p.x; this.pos[v * 3 + 1] = p.y; this.pos[v * 3 + 2] = p.z;
      this.fwd[v * 4] = f.x; this.fwd[v * 4 + 1] = f.y; this.fwd[v * 4 + 2] = f.z; this.fwd[v * 4 + 3] = odo;
      this.info[v * 4 + 3] = shown;
    }
    this.touch(s, j, j);
  }

  private touch(s: number, j0: number, j1: number): void {
    const t = this.touched[s];
    t[0] = Math.min(t[0], j0);
    t[1] = Math.max(t[1], j1);
  }

  /** Send the points that changed (only their ranges). */
  private commit(): void {
    for (let s = 0; s < STROKES; s++) {
      const t = this.touched[s];
      if (t[1] < t[0]) continue;
      const v = (s * STROKE_PTS + t[0]) * 2, n = (t[1] - t[0] + 1) * 2;
      for (const name of ['position', 'aFwd', 'aInfo']) {
        const a = this.geometry.getAttribute(name) as THREE.BufferAttribute;
        a.addUpdateRange(v * a.itemSize, n * a.itemSize);
        a.needsUpdate = true;
      }
      t[0] = STROKE_PTS;
      t[1] = -1;
    }
  }
}

/** The composition root's trails (MODULES): drawn for the player's sight on the scene's sea. */
export function createTrails(ctx: RenderContext): RenderModule {
  const sea = seas.get(ctx.scene);
  if (!sea) throw new Error('createTrails: the scene has no sea (createSea comes first in MODULES)');
  const trails = new Trails(ctx.pipeline.style, sea.swell);
  ctx.scene.add(trails.mesh);
  let sight: { seed: number; sea: Sea } | null = null;
  return {
    frame(f) {
      const state = f.state;
      if (sight?.seed !== state.seed) sight = { seed: state.seed, sea: seaFor(ctx.world, state.seed) };
      const sim = sight.sea;
      trails.frame(state, f.alpha, f.clock, ctx.camera.position, (owner, k) => trailSeen(sim, state, PLAYER, owner, k));
    },
    dispose() {
      ctx.scene.remove(trails.mesh);
      trails.dispose();
    },
  };
}
