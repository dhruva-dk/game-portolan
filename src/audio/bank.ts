// Every sound in the game, by name, and the bank that renders and keeps them. A sound's samples depend only on its
// name and variant, so the bank can be filled on a worker and the same renders checked in Node.
import { fade, hash, loudness, peak, rng, SR, type Buf } from './dsp.ts';
import type { SoundDef } from './def.ts';
import { BED_SOUNDS } from './sounds/beds.ts';
import { COMBAT_SOUNDS } from './sounds/combat.ts';
import { ITEM_SOUNDS } from './sounds/items.ts';
import { LIFE_SOUNDS } from './sounds/life.ts';
import { UI_SOUNDS } from './sounds/ui.ts';
import { WEAPON_SOUNDS } from './sounds/weapons.ts';
import { WORLD_SOUNDS } from './sounds/world.ts';

export const SOUNDS = {
  ...WEAPON_SOUNDS, ...COMBAT_SOUNDS, ...ITEM_SOUNDS, ...WORLD_SOUNDS, ...UI_SOUNDS, ...LIFE_SOUNDS, ...BED_SOUNDS,
} satisfies Record<string, SoundDef>;

/** Every sound's name. Integration maps simulation and interface events onto these. */
export type SoundName = keyof typeof SOUNDS;
export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];

/** The sounds grouped as the sound board shows them. */
export const GROUPS: Record<string, readonly SoundName[]> = {
  Weapons: Object.keys(WEAPON_SOUNDS) as SoundName[],
  'Shield and hull': Object.keys(COMBAT_SOUNDS) as SoundName[],
  'Moves and items': Object.keys(ITEM_SOUNDS) as SoundName[],
  World: Object.keys(WORLD_SOUNDS) as SoundName[],
  Interface: Object.keys(UI_SOUNDS) as SoundName[],
  'Region life': Object.keys(LIFE_SOUNDS) as SoundName[],
  Beds: Object.keys(BED_SOUNDS) as SoundName[],
};

export function render(name: SoundName, v = 0): Buf[] {
  const d: SoundDef = SOUNDS[name], out = d.make(rng((hash(name) ^ Math.imul(v + 1, 0x9e3779b1)) >>> 0), v);
  const chs = Array.isArray(out) ? out : [out];
  if (!d.loop) for (const c of chs) fade(c, 0, 0.02);
  return chs;
}

export class Bank {
  private readonly cache = new Map<string, Buf[]>();
  /** Milliseconds spent rendering on this thread. */
  ms = 0;
  get(name: SoundName, v: number): Buf[] {
    const key = `${name}:${v}`;
    let chs = this.cache.get(key);
    if (!chs) {
      const t0 = performance.now();
      chs = render(name, v);
      this.ms += performance.now() - t0;
      this.cache.set(key, chs);
    }
    return chs;
  }
  put(name: SoundName, v: number, chs: Buf[]): void { this.cache.set(`${name}:${v}`, chs); }
  has(name: SoundName, v: number): boolean { return this.cache.has(`${name}:${v}`); }
}

export function measure(chs: readonly Buf[]): { seconds: number; peak: number; loudness: number; finite: boolean } {
  let finite = true;
  for (const c of chs) for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) { finite = false; break; }
  return { seconds: chs[0].length / SR, peak: Math.max(...chs.map(peak)), loudness: loudness(chs), finite };
}
