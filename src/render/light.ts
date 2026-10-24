// The light over the world (WP14). The sun and the moon of the match hour stand in the eye's own sky (A8: lighting
// is computed in the player's local frame from the global hour), and Lights.set lays the style's light uniforms that
// every material reads: the hour's palette (style.setHour, sky washes included), the direction everything is lit from
// (uSun: the sun by day, the moon by night, never from below the horizon) and the lamps. The lamp registry holds every
// light the night shows — the lighthouses' lamps (Beams registers them) and ships' lanterns (their package adds them)
// — and feeds the nearest to uGlows, whose warm pools every material lays through candle() (style/glsl.ts), and to the
// painted glow washes round each lamp. Beams: the lighthouse beams, hatched cones of lamplight that turn by night.
import * as THREE from 'three';
import { inkMaterial, MAX_GLOWS, type Style } from '../style/glsl.ts';
import { hex, toLinear, type RGB } from '../style/palette.ts';
import { localFrame, R } from '../sim/sphere.ts';
import { sunDir } from '../sim/weather.ts';
import { heightAt, type Geography } from '../sim/world/geography.ts';

const { smoothstep } = THREE.MathUtils;

/** A GLSL literal of an sRGB colour in linear light. */
export function glslLinear(c: RGB): string {
  return `vec3(${toLinear(c).map((x) => x.toFixed(4)).join(', ')})`;
}

// ---------------------------------------------------------------------------------------------------------------
// The sky's light

/** The sky's light at an hour over a point, as skyLight fills it. Directions are world unit vectors. */
export interface SkyLight {
  readonly up: THREE.Vector3;
  readonly east: THREE.Vector3;
  readonly north: THREE.Vector3;
  /** Where the sun and the moon stand, below the horizon when set. The moon is full, opposite the sun. */
  readonly sun: THREE.Vector3;
  readonly moon: THREE.Vector3;
  /** What everything is lit from (uSun): the sun by day, the moon by night, never lower than LIGHT_MIN. */
  readonly light: THREE.Vector3;
  /** Sine of the sun's elevation. */
  sunHeight: number;
  /** 0 by night … 1 by day: how far the light has gone over from the moon to the sun. */
  day: number;
  /** 0 … 1: how far the lamps are lit. They come on at dusk and go out after dawn. */
  lit: number;
}

export function newSkyLight(): SkyLight {
  const v = () => new THREE.Vector3();
  return { up: v(), east: v(), north: v(), sun: v(), moon: v(), light: v(), sunHeight: 0, day: 1, lit: 0 };
}

/** Sines of the lowest elevations things are lit from, by the sun and by the moon: shadows never run off the page. */
export const LIGHT_MIN = { sun: 0.2, moon: 0.5 };
const local = new THREE.Vector3(), sunLift = new THREE.Vector3(), moonLift = new THREE.Vector3();

/** d raised to at least `min` (sine of elevation) above the horizon of `up`, into out. */
function lift(d: THREE.Vector3, up: THREE.Vector3, min: number, out: THREE.Vector3): THREE.Vector3 {
  const h = d.dot(up);
  if (h >= min) return out.copy(d);
  out.copy(d).addScaledVector(up, -h);
  const l = out.length();
  return l < 1e-6 ? out.copy(up) : out.multiplyScalar(Math.sqrt(1 - min * min) / l).addScaledVector(up, min);
}

/** The sky's light at `hour` over `foot` (any length), into out. */
export function skyLight(hour: number, foot: THREE.Vector3, out: SkyLight): SkyLight {
  out.up.copy(foot).normalize();
  localFrame(out.up, out.east, out.north);
  sunDir(hour, local);
  out.sun.copy(out.east).multiplyScalar(local.x).addScaledVector(out.north, local.y).addScaledVector(out.up, local.z);
  out.moon.copy(out.sun).negate();
  const h = (out.sunHeight = out.sun.dot(out.up));
  out.day = smoothstep(h, -0.3, 0.1);
  out.lit = 1 - smoothstep(h, -0.08, 0.1);
  lift(out.sun, out.up, LIGHT_MIN.sun, sunLift);
  lift(out.moon, out.up, LIGHT_MIN.moon, moonLift);
  out.light.copy(moonLift).lerp(sunLift, out.day).normalize();
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Lamps

/** A light the night shows — a lighthouse lamp, a ship's lantern — and how far (u) its warm pool reaches. */
export interface Lamp {
  readonly pos: THREE.Vector3;
  reach: number;
}

/** How many lamps get a painted glow wash at once (the nearest to the eye), and its radius as a share of the reach. */
export const MAX_HALOS = 64;
const HALO = 0.3;
const CANDLE = glslLinear(hex('#ffc46a')), FLAME = glslLinear(hex('#fff2cc'));

const HALO_VERTEX = /* glsl */ `
in vec4 aLamp; // world position, radius (0 = unlit)
out vec2 vUv;
void main() {
  vUv = position.xy;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  gl_Position = projectionMatrix * viewMatrix * vec4(aLamp.xyz + (right * position.x + up * position.y) * aLamp.w, 1.0);
}`;

// a glow wash: a soft pool of candle colour with the frilled, darker ring where the wash dried, and the flame
const HALO_FRAGMENT = /* glsl */ `
in vec2 vUv;
void main() {
  float r = length(vUv);
  float wob = texture(tPaper, normalize(vUv + 1e-5) * 0.18 + 0.5).b - 0.5;
  float body = pow(max(1.0 - r, 0.0), 1.6);
  float rim = (1.0 - smoothstep(0.0, 0.07, abs(r - 0.72 - 0.14 * wob))) * step(r, 0.95);
  float flame = 1.0 - smoothstep(0.06, 0.1, r);
  writeVeil(mix(${CANDLE}, ${FLAME}, max(flame, body * body)), clamp(body * 0.55 + rim * 0.2 + flame, 0.0, 1.0));
}`;

/** The registry of lamps and the light uniforms; one per sky. */
export class Lights {
  readonly sky = newSkyLight();
  /** The painted glow washes round the nearest lamps by night: one draw call. */
  readonly halos: THREE.Mesh;
  private readonly style: Style;
  private readonly lamps: Lamp[] = [];
  private readonly order: number[] = [];
  private readonly dist: number[] = [];
  private readonly byDistance = (a: number, b: number): number => this.dist[a] - this.dist[b];
  private readonly attribute = new THREE.InstancedBufferAttribute(new Float32Array(MAX_HALOS * 4), 4);
  private readonly geometry = new THREE.InstancedBufferGeometry();

  constructor(style: Style) {
    this.style = style;
    const quad = new THREE.PlaneGeometry(2, 2);
    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    this.geometry.setAttribute('aLamp', this.attribute.setUsage(THREE.DynamicDrawUsage));
    this.geometry.instanceCount = 0;
    this.halos = new THREE.Mesh(this.geometry, inkMaterial(style, { vertexShader: HALO_VERTEX, fragmentShader: HALO_FRAGMENT, veil: true }));
    this.halos.frustumCulled = false;
  }

  add(lamp: Lamp): Lamp {
    this.lamps.push(lamp);
    return lamp;
  }

  remove(lamp: Lamp): void {
    const i = this.lamps.indexOf(lamp);
    if (i >= 0) this.lamps.splice(i, 1);
  }

  /** The hour over the eye: the style's palette and light, and the lamps nearest the eye, lit as far as the hour says. */
  set(hour: number, eye: THREE.Vector3): void {
    const s = skyLight(hour, eye, this.sky), u = this.style.uniforms, n = this.lamps.length;
    this.style.setHour(hour);
    u.uSun.value.copy(s.light);
    this.order.length = n;
    this.dist.length = n;
    for (let i = 0; i < n; i++) {
      this.order[i] = i;
      this.dist[i] = this.lamps[i].pos.distanceToSquared(eye);
    }
    this.order.sort(this.byDistance);
    for (let k = 0; k < MAX_GLOWS; k++) {
      const g = u.uGlows.value[k];
      if (k < n) {
        const l = this.lamps[this.order[k]];
        g.set(l.pos.x, l.pos.y, l.pos.z, l.reach * s.lit);
      } else g.set(0, 0, 0, 0);
    }
    const m = s.lit > 0 ? Math.min(n, MAX_HALOS) : 0, a = this.attribute.array as Float32Array;
    for (let k = 0; k < m; k++) {
      const l = this.lamps[this.order[k]];
      a[k * 4] = l.pos.x;
      a[k * 4 + 1] = l.pos.y;
      a[k * 4 + 2] = l.pos.z;
      a[k * 4 + 3] = l.reach * HALO * s.lit;
    }
    this.attribute.needsUpdate = m > 0;
    this.geometry.instanceCount = m;
    this.halos.visible = m > 0;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.halos.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Lighthouse beams

/** A beam's length and end radius (u), its cone's rings and segments; lamps stand `tower` u above the ground. */
export const BEAM = { length: 48, radius: 4.5, rings: 4, segments: 12, tower: 6, reach: 18 };

const BEAM_VERTEX = /* glsl */ `
uniform float uTime;
in vec3 aLamp;
in vec3 aFacing;
in vec2 aTurn; // seconds a turn, phase
out vec2 vBeam;
void main() {
  vec3 up = normalize(aLamp), f = normalize(aFacing - dot(aFacing, up) * up), s = cross(up, f);
  float th = 6.2831853 * (uTime / aTurn.x + aTurn.y);
  vec3 dir = normalize((cos(th) * f + sin(th) * s) * position.z - 0.06 * up);
  vec3 side = normalize(cross(up, dir)), rise = cross(dir, side);
  float t = position.x;
  vec3 w = aLamp + dir * (t * ${BEAM.length.toFixed(1)}) + (cos(position.y) * side + sin(position.y) * rise) * (t * ${BEAM.radius.toFixed(1)});
  vBeam = vec2(t, position.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

// lamplight laid as a thin veil, hatched along the cone, fading as it reaches out
const BEAM_FRAGMENT = /* glsl */ `
in vec2 vBeam;
uniform float uLit;
void main() {
  float t = vBeam.x;
  vec2 hc = vec2(vBeam.y * ${BEAM.radius.toFixed(1)} * max(t, 0.05) * 1.3, t * ${BEAM.length.toFixed(1)});
  float strokes = hatching(hc, dFdx(hc), dFdy(hc), 0.32, 5.0);
  float body = pow(1.0 - t, 1.4) * smoothstep(0.0, 0.06, t);
  writeVeil(mix(${CANDLE}, ${FLAME}, strokes), uLit * body * (0.2 + 0.45 * strokes));
}`;

/** Every lighthouse's beam, turning with its period: one draw call, shown by night only. */
export class Beams {
  readonly mesh: THREE.Mesh;
  private readonly uLit = { value: 0 };

  constructor(style: Style, geo: Geography, lights: Lights) {
    const { rings, segments } = BEAM, per = (rings + 1) * (segments + 1), n = geo.lights.length * 2 * per;
    const pos = new Float32Array(n * 3), lamp = new Float32Array(n * 3), facing = new Float32Array(n * 3);
    const turn = new Float32Array(n * 2), index: number[] = [];
    let v = 0;
    geo.lights.forEach((l, i) => {
      const dir = new THREE.Vector3(l.pos.x, l.pos.y, l.pos.z).normalize();
      const at = dir.clone().multiplyScalar(R + Math.max(heightAt(geo, dir), 0) + BEAM.tower);
      lights.add({ pos: at, reach: BEAM.reach });
      for (const side of [1, -1]) {
        const first = v;
        for (let a = 0; a <= rings; a++) {
          for (let b = 0; b <= segments; b++, v++) {
            pos.set([a / rings, -Math.PI + (2 * Math.PI * b) / segments, side], v * 3);
            lamp.set([at.x, at.y, at.z], v * 3);
            facing.set([l.facing.x, l.facing.y, l.facing.z], v * 3);
            turn.set([l.period, i * 0.137], v * 2);
          }
        }
        for (let a = 0; a < rings; a++) {
          for (let b = 0; b < segments; b++) {
            const k = first + a * (segments + 1) + b;
            index.push(k, k + segments + 1, k + 1, k + 1, k + segments + 1, k + segments + 2);
          }
        }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aLamp', new THREE.BufferAttribute(lamp, 3));
    g.setAttribute('aFacing', new THREE.BufferAttribute(facing, 3));
    g.setAttribute('aTurn', new THREE.BufferAttribute(turn, 2));
    g.setIndex(index);
    this.mesh = new THREE.Mesh(g, inkMaterial(style, {
      vertexShader: BEAM_VERTEX, fragmentShader: BEAM_FRAGMENT, uniforms: { uLit: this.uLit }, veil: true, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
  }

  /** How far the lamps are lit (Lights.sky.lit): the beams show and fade with them. */
  setLit(lit: number): void {
    this.uLit.value = lit;
    this.mesh.visible = lit > 0.01;
  }

  get triangles(): number {
    return this.mesh.geometry.index!.count / 3;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Hooks for the regions' night lights

/**
 * The aurora (GLSL; the sky dome calls it, WP16 sets its strength through Sky.setAurora): ribbons of verdigris
 * fringed with rose madder hung in the high sky, folding slowly, their lower hems inked. Needs the style uniforms.
 */
export const AURORA_GLSL = /* glsl */ `
vec3 aurora(vec3 col, vec3 d, vec3 up, float strength) {
  if (strength <= 0.0) return col;
  vec3 e = normalize(cross(up, abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  float el = dot(d, up), az = atan(dot(d, e), dot(d, cross(e, up)));
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float h = el - 0.2 - 0.09 * fi - 0.05 * sin(az * (2.0 + fi) + uTime * (0.05 + 0.03 * fi) + fi * 2.1);
    float folds = (0.55 + 0.45 * sin(az * (11.0 + 5.0 * fi) + 3.0 * sin(az * 2.0 + uTime * 0.1) + uTime * 0.15)) * strength;
    float band = smoothstep(0.0, 0.012, h) * (1.0 - smoothstep(0.015, 0.14 + 0.04 * sin(az * 4.0 + fi), h)) * folds;
    float hem = (1.0 - smoothstep(0.3, 0.9, abs(h) / max(fwidth(h), 1e-6) / uRenderPx)) * folds;
    col = mix(col, mix(${glslLinear(hex('#7cc8a2'))}, ${glslLinear(hex('#d8869f'))}, smoothstep(0.02, 0.12, h)), 0.7 * band);
    col = mix(col, uInk, 0.35 * hem);
  }
  return col;
}
`;

/**
 * Bioluminescence (GLSL, for WP17's wakes and whales on the Glass Sea): glowing blue-green ink laid over col along a
 * trace (0…1 coverage), shining as night falls. Needs the style uniforms.
 */
export const BIOLUMINESCENCE_GLSL = /* glsl */ `
vec3 bioluminescence(vec3 col, float trace) {
  return mix(col, ${glslLinear(hex('#5ee0c8'))}, clamp(trace, 0.0, 1.0) * (0.25 + 0.75 * uNight));
}
`;
