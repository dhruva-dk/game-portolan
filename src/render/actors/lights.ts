// The lights the fight throws on itself: every ship's lantern, her fires, the flash of each gun, shot striking home
// and shells bursting. They are real point lights, clustered (gpu/clusters.ts), so a broadside lights the smoke, the
// sails and the water round the guns for a moment, a burning ship lights her own canvas and the sea under her, and
// at night every lantern lights the deck and the water round its ship.
//
// A fixed pool of three's PointLights is made once and handed out: a flash rises in a few milliseconds and dies away
// over its life; a held light (a lantern, a fire) lasts while it is asked for each frame and goes when it is not. A
// light not in use is hidden, which takes it out of the frame's list of lights without touching any material.
import * as THREE from 'three';

/** Lights at once: a full broadside from every ship in sight with their lanterns lit stays under it. */
const POOL = 64;

interface Slot {
  light: THREE.PointLight;
  /** For a flash: seconds lived and its life; for a held light, its key and the frame it was last asked for. */
  age: number;
  life: number;
  power: number;
  key: string | null;
  seen: number;
}

export class Lights {
  readonly group = new THREE.Group();
  readonly #slots: Slot[] = [];
  readonly #held = new Map<string, Slot>();
  #frame = 0;
  #next = 0;

  constructor() {
    for (let i = 0; i < POOL; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2);
      light.visible = false;
      this.group.add(light);
      this.#slots.push({ light, age: 0, life: 0, power: 0, key: null, seen: 0 });
    }
  }

  /** Lights in use. */
  get count(): number {
    let n = 0;
    for (const s of this.#slots) if (s.light.visible) n++;
    return n;
  }

  /**
   * A flash at `at`: `power` candela at its peak, reaching `reach` metres, gone over `life` seconds. The oldest
   * flash gives way when the pool is full; a held light never does.
   */
  flash(at: THREE.Vector3, colour: THREE.ColorRepresentation, power: number, reach: number, life: number): void {
    const s = this.#free(true);
    if (!s) return;
    s.light.position.copy(at);
    s.light.color.set(colour);
    s.light.distance = reach;
    s.light.decay = 2;
    s.light.visible = true;
    s.age = 0;
    s.life = life;
    s.power = power;
    s.key = null;
    this.#shine(s);
  }

  /** A light held at `at` for as long as it is asked for each frame, under `key`. */
  hold(key: string, at: THREE.Vector3, colour: THREE.ColorRepresentation | THREE.Color, power: number, reach: number, decay = 2): void {
    let s = this.#held.get(key);
    if (!s) {
      const free = this.#free(false);
      if (!free) return;
      s = free;
      s.key = key;
      s.life = 0;
      this.#held.set(key, s);
    }
    s.light.position.copy(at);
    if (colour instanceof THREE.Color) s.light.color.copy(colour);
    else s.light.color.set(colour);
    s.light.intensity = power;
    s.light.distance = reach;
    s.light.decay = decay;
    s.light.visible = power > 0;
    s.seen = this.#frame;
  }

  update(dt: number): void {
    for (const s of this.#slots) {
      if (!s.light.visible && s.key === null) continue;
      if (s.key !== null) {
        // a held light not asked for this frame goes
        if (s.seen !== this.#frame) this.#release(s);
        continue;
      }
      s.age += dt;
      if (s.age >= s.life) { this.#release(s); continue; }
      this.#shine(s);
    }
    this.#frame++;
  }

  clear(): void {
    for (const s of this.#slots) this.#release(s);
  }

  /** A flash's strength now: up in the first few milliseconds, then dying away faster than a straight line. */
  #shine(s: Slot): void {
    const k = s.age / s.life;
    const rise = Math.min(1, s.age / 0.012 + 0.35);
    s.light.intensity = s.power * rise * (1 - k) * (1 - k);
  }

  #release(s: Slot): void {
    if (s.key !== null) this.#held.delete(s.key);
    s.key = null;
    s.light.visible = false;
    s.light.intensity = 0;
  }

  /** A slot to use: an idle one, or, for a flash, the flash nearest its end. */
  #free(flash: boolean): Slot | null {
    for (let i = 0; i < POOL; i++) {
      const s = this.#slots[(this.#next + i) % POOL];
      if (!s.light.visible && s.key === null) {
        this.#next = (this.#next + i + 1) % POOL;
        return s;
      }
    }
    if (!flash) return null;
    let best: Slot | null = null;
    for (const s of this.#slots) if (s.key === null && (!best || s.age / s.life > best.age / best.life)) best = s;
    return best;
  }
}
