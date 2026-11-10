// What a wreck leaves on the water: a film of pitch and oil that spreads from where she went down, dulling the sea under
// it and carrying the colours of thin-film interference in what it reflects, patchy, and gone in half a minute. Drawn in
// the sea's own shader, so it rides every wave for nothing; and while no wreck is fresh it costs one uniform's test.
import { Vector4, type Node, type Texture } from 'three/webgpu';
import { If, abs, cameraPosition, cos, cross, dot, float, length, max, mix, normalize, positionWorld, pow, renderGroup, select, smoothstep, sqrt, texture, uniform, uniformArray, vec2, vec3 } from 'three/tsl';
import { R } from '../../sim/sphere.ts';
import { P } from '../gpu/uniforms.ts';
import type { V3 } from '../../sim/math.ts';

type V3N = Node<'vec3'>;

/** How many wrecks are fresh at once; a later one takes the oldest's place. */
const SLOTS = 4;
/** Seconds: how long a film takes to show, when it starts to thin, and when it has gone. */
const LIFE = { shows: 2, thins: 18, gone: 32 } as const;
/** Its radius, metres: `start` at once and growing as the square root of `grows` a second. */
const SPREAD = { start: 2, grows: 2.6 } as const;
const FAR = Math.cos((SPREAD.start + SPREAD.grows * Math.sqrt(LIFE.gone) + 2) / R);
const NOT_YET = -1e5;

export class Slicks {
  readonly #where = Array.from({ length: SLOTS }, () => new Vector4(0, 1, 0, NOT_YET));
  readonly #uniform = uniformArray(this.#where, 'vec4').setGroup(renderGroup);
  /** Whether any film is on the water. */
  readonly #any = uniform(0);
  #next = 0;
  #pending: V3[] = [];
  #time = 0;

  /** A wreck has gone down at `at` (any length). */
  add(at: V3): void {
    this.#pending.push(at);
  }

  /** Once a frame, with the sea's clock. */
  update(time: number): void {
    // a new match's clock has gone back
    if (time < this.#time) for (const w of this.#where) w.w = NOT_YET;
    this.#time = time;
    for (const at of this.#pending) {
      const l = Math.hypot(at.x, at.y, at.z);
      this.#where[this.#next].set(at.x / l, at.y / l, at.z / l, time);
      this.#next = (this.#next + 1) % SLOTS;
    }
    this.#pending.length = 0;
    let any = 0;
    for (const w of this.#where) if (time - w.w < LIFE.gone) any = 1;
    this.#any.value = any;
  }

  /** The water's colour `lit` at unit direction `u`, under whatever film lies there, with `sky` the light it mirrors. */
  over(lit: V3N, u: V3N, sky: V3N, noise: Texture): V3N {
    const out = lit.toVar();
    const map = texture(noise);
    If(this.#any.greaterThan(0.5), () => {
      for (let i = 0; i < SLOTS; i++) {
        const w = (this.#uniform as unknown as { element(i: number): Node<'vec4'> }).element(i).toVar();
        const age = P.time.sub(w.w).toVar();
        If(age.lessThan(LIFE.gone).and(dot(u, w.xyz).greaterThan(FAR)), () => {
          const across = normalize(cross(w.xyz, select(abs(w.y).lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0)))).toVar();
          const along = cross(w.xyz, across).toVar();
          const seed = float(i).mul(0.37).add(0.11);
          const q = vec2(dot(u, across), dot(u, along)).mul(R).div(sqrt(max(age, 0)).mul(SPREAD.grows).add(SPREAD.start)).toVar();
          const r = length(q).toVar();
          const n = map.sample(q.mul(0.45).add(seed)).level(float(0)).r.toVar();
          const n2 = map.sample(q.mul(1.1).sub(seed).add(age.mul(0.004))).level(float(0)).g.toVar();
          // how thick the film is: far broader than its ragged outline
          const thick = map.sample(q.mul(0.1).add(seed)).level(float(0)).r.mul(0.5).add(map.sample(q.mul(0.22).sub(seed).add(age.mul(0.001))).level(float(0)).g.mul(0.8)).toVar();
          // patchy and broken, thicker toward the wreck, and fading as it spreads
          const m = smoothstep(0.55, 0.75, n.mul(0.7).add(n2.mul(0.3)).add(0.7).sub(r))
            .mul(smoothstep(0, LIFE.shows, age)).mul(float(1).sub(smoothstep(LIFE.thins, LIFE.gone, age))).toVar();
          const view = normalize(positionWorld.sub(cameraPosition)).toVar();
          const cv = abs(dot(view, u)).toVar();
          const fres = pow(float(1).sub(cv), 5).mul(0.96).add(0.04);
          // broad bands that shift with the film's thickness and with the angle it is seen at
          const phase = thick.add(r.mul(0.4)).mul(1.1).div(max(cv, 0.4));
          const film = cos(vec3(phase).add(vec3(0, 0.33, 0.67)).mul(6.2832)).mul(0.5).add(0.5).toVar();
          const tinted = mix(vec3(dot(film, vec3(0.333))), film, 0.6);
          // the oil darkens the water under it; only its reflection carries colour, and that only of the sky
          out.assign(mix(out, out.mul(0.4), m.mul(0.75)).add(tinted.mul(sky).mul(fres.add(0.06)).mul(1.6).mul(m)));
        });
      }
    });
    return out as unknown as V3N;
  }
}

