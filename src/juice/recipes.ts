// One recipe per moment. Each names its camera, hit-stop, haptic, flash, vignette, marker, interface response,
// particle hook and sound layers, so the integration fires one call per event: `juice.fire('shieldBreak', ctx)`.
//
// Particle hooks and sound layers are names, not effects: the actors and sound owners map them to emitters and
// voices. The names are listed in PARTICLE_HOOKS and SOUND_LAYERS below, so those owners can check they cover them.
//
// How the numbers were set (all at 60 fps, from frame strips of the bench):
// - Hit-stops scale with the moment: a hull hit freezes 3 frames, a crit 5, a shield break 7, a sink slows to 20%
//   for a third of a second, the win slows to 25% for a second. Your own hits are short because you're still
//   steering; taking a hit only slows time a little, because a freeze on the victim's side feels like lag.
// - Shake goes as trauma², so the ladder 0.2 / 0.3 / 0.45 / 0.55 reads as tap / knock / jolt / slam.
// - Every hit you deal punches the FOV in a little (1-6°): the eye reads that as the shot landing "toward" you.
//   Gusts and speed widen it instead (+9°).
// - Flashes stay under the WCAG big-flash level for anything that repeats (hits, crits). Only rare moments (shield
//   break, sink, level up, rank up, win) flash big, and the screen layer caps those at three a second anyway.
import type { CameraSpec } from './camera.ts';
import type { HapticKind, PatternName } from './haptics.ts';
import type { MarkerKind, NumberKind } from './markers.ts';
import type { FlashSpec, VignetteSpec } from './screen.ts';
import type { StopSpec } from './time.ts';

export interface UiSpec {
  /** Fly icons from the event's screen point into a registered counter; `count` is the default if ctx has none. */
  fly?: { to: string; count: number; color?: string };
  /** Bump a registered element. */
  pop?: { target: string; amount: number };
  /** Squash a registered element (for things knocked, like the hull bar taking a hit). */
  squash?: { target: string; amount: number };
  /** Count a registered element's number from ctx.from to ctx.to. */
  countUp?: string;
}

export interface Recipe {
  label: string;
  camera?: CameraSpec;
  stop?: StopSpec;
  haptic?: HapticKind | PatternName;
  flash?: FlashSpec;
  vignette?: VignetteSpec;
  marker?: MarkerKind;
  /** Shows ctx.value as a damage number of this colour. */
  number?: NumberKind;
  ui?: UiSpec;
  particles?: { hook: string; amount: number; color?: string };
  /** Layered sound, played together: typically a transient, a body and a tail. */
  sound: readonly string[];
}

/** Rarity tints, common → legendary. The interface's rarity frames should use the same five. */
export const RARITY = ['#a9b4c0', '#5fd35a', '#3fa5ff', '#b866ff', '#ffb52e'] as const;
export const RARITY_NAMES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

function pickup(r: 0 | 1 | 2 | 3 | 4): Recipe {
  const color = RARITY[r];
  return {
    label: `Pickup (${RARITY_NAMES[r]})`,
    camera:
      r === 4
        ? { shake: 0.28, band: 'rumble', fov: { deg: -3.5, attack: 0.06, hold: 0.12, release: 0.5 } }
        : r === 3
          ? { shake: 0.14, band: 'rumble', fov: { deg: -2, attack: 0.05, hold: 0.06, release: 0.35 } }
          : r === 2
            ? { fov: { deg: -1, attack: 0.05, hold: 0.04, release: 0.25 } }
            : undefined,
    stop: r === 4 ? { scale: 0.1, hold: 0.09, release: 0.2, priority: 'crit' } : undefined,
    haptic: (['light', 'light', 'medium', 'heavy', 'legendary'] as const)[r],
    flash: r >= 2 ? { color, alpha: [0, 0, 0.05, 0.08, 0.14][r], blend: 'add', attack: 0, hold: 0.03, decay: [0, 0, 0.18, 0.25, 0.4][r] } : undefined,
    vignette: r >= 3 ? { color, alpha: r === 4 ? 0.34 : 0.2, reach: 0.45, attack: 0.04, hold: 0.15, decay: r === 4 ? 0.9 : 0.5 } : undefined,
    ui: { fly: { to: 'hotbar', count: 1, color }, pop: { target: 'hotbar', amount: 0.12 + 0.04 * r } },
    particles: { hook: 'sparkle', amount: [0.4, 0.6, 0.9, 1.4, 2][r], color },
    sound: ['pickup.pop', `pickup.chime.${RARITY_NAMES[r]}`, ...(r >= 3 ? ['pickup.shimmer'] : [])],
  };
}

export const RECIPES = {
  fire: {
    label: 'Cannon fires (yours)',
    camera: { shake: 0.2, kick: { back: 0.5, pitch: 0.9, roll: 0.4 } },
    haptic: 'medium',
    flash: { color: '#ffd9a0', alpha: 0.06, blend: 'add', attack: 0, hold: 0.016, decay: 0.08 },
    particles: { hook: 'muzzle', amount: 1 },
    sound: ['cannon.thump', 'cannon.boom', 'cannon.tail'],
  },
  cannonHit: {
    label: 'Cannon hits hull',
    camera: { shake: 0.22, fov: { deg: -1.6, attack: 0.035, hold: 0.03, release: 0.22 } },
    stop: { scale: 0.05, hold: 0.045, release: 0.06, priority: 'hit' },
    haptic: 'medium',
    flash: { color: '#fff1d8', alpha: 0.05, blend: 'add', attack: 0, hold: 0.016, decay: 0.07 },
    marker: 'hit',
    number: 'hull',
    particles: { hook: 'splinters', amount: 1 },
    sound: ['hit.crack', 'hit.thud', 'hit.tail'],
  },
  shieldHit: {
    label: 'Hit on a shield',
    camera: { shake: 0.18, fov: { deg: -1.2, attack: 0.035, hold: 0.02, release: 0.2 } },
    stop: { scale: 0.1, hold: 0.035, release: 0.05, priority: 'hit' },
    haptic: 'light',
    flash: { color: '#bfe6ff', alpha: 0.04, blend: 'add', attack: 0, hold: 0.016, decay: 0.07 },
    marker: 'shield',
    number: 'shield',
    particles: { hook: 'shieldRipple', amount: 1 },
    sound: ['shield.ting', 'shield.hum', 'shield.tail'],
  },
  crit: {
    label: 'Critical hit',
    camera: { shake: 0.32, fov: { deg: -3, attack: 0.04, hold: 0.05, release: 0.3 } },
    stop: { scale: 0.02, hold: 0.075, release: 0.09, priority: 'crit' },
    haptic: 'heavy',
    flash: { color: '#ffe39a', alpha: 0.1, blend: 'add', attack: 0, hold: 0.016, decay: 0.12 },
    marker: 'crit',
    number: 'crit',
    particles: { hook: 'critBurst', amount: 1 },
    sound: ['crit.crack', 'crit.ring', 'hit.thud', 'hit.tail'],
  },
  shieldBreak: {
    label: 'Shield break (theirs)',
    camera: { shake: 0.42, kick: { pitch: 0.7, back: 0.3 }, fov: { deg: -5, attack: 0.05, hold: 0.08, release: 0.42 } },
    stop: { scale: 0, hold: 0.11, release: 0.14, priority: 'break' },
    haptic: 'shieldBreak',
    flash: { color: '#d9f3ff', alpha: 0.28, blend: 'add', attack: 0, hold: 0.033, decay: 0.22 },
    vignette: { color: '#4fc3ff', alpha: 0.35, reach: 0.45, attack: 0, hold: 0.05, decay: 0.4 },
    marker: 'break',
    number: 'shield',
    particles: { hook: 'shards', amount: 1 },
    sound: ['shield.crack', 'shield.shatter', 'shield.tinkle', 'shield.tail'],
  },
  shieldLost: {
    label: 'Shield break (yours)',
    camera: { shake: 0.5, kick: { away: 0.7, tilt: 2.5 }, fov: { deg: -2.5, attack: 0.04, hold: 0.05, release: 0.35 } },
    stop: { scale: 0.05, hold: 0.08, release: 0.12, priority: 'break' },
    haptic: 'shieldLost',
    flash: { color: '#cfeeff', alpha: 0.22, blend: 'add', attack: 0, hold: 0.033, decay: 0.25 },
    vignette: { color: '#4fc3ff', alpha: 0.55, reach: 0.55, attack: 0, hold: 0.08, decay: 0.6, aimed: true },
    ui: { squash: { target: 'shield', amount: 0.22 } },
    particles: { hook: 'shardsSelf', amount: 1 },
    sound: ['shield.crack', 'shield.shatter', 'shield.down'],
  },
  hurt: {
    label: 'Hull takes a hit (yours)',
    camera: { shake: 0.38, kick: { away: 0.55, tilt: 2 } },
    stop: { scale: 0.35, hold: 0.04, release: 0.08, priority: 'hurt' },
    haptic: 'heavy',
    flash: { color: '#ff2a1a', alpha: 0.14, blend: 'tint', attack: 0, hold: 0.02, decay: 0.3 },
    vignette: { color: '#c4161c', alpha: 0.6, reach: 0.5, attack: 0.02, hold: 0.06, decay: 0.65, aimed: true },
    ui: { squash: { target: 'hull', amount: 0.14 } },
    particles: { hook: 'splintersSelf', amount: 1 },
    sound: ['hurt.crunch', 'hurt.thud', 'hurt.creak'],
  },
  sink: {
    label: 'Sink (your kill)',
    camera: { shake: 0.45, fov: { deg: -6, attack: 0.08, hold: 0.25, release: 0.6 } },
    stop: { scale: 0.2, hold: 0.32, release: 0.35, priority: 'kill' },
    haptic: 'sink',
    flash: { color: '#fff1d6', alpha: 0.2, blend: 'add', attack: 0, hold: 0.033, decay: 0.3 },
    marker: 'kill',
    ui: { pop: { target: 'kills', amount: 0.35 } },
    particles: { hook: 'wreck', amount: 1 },
    sound: ['sink.blast', 'sink.crack', 'sink.groan', 'sink.splash'],
  },
  gust: {
    label: 'Gust',
    camera: { shake: 0.3, band: 'rumble', kick: { back: 1.4, up: 0.5, pitch: -0.6 }, fov: { deg: 9, attack: 0.12, hold: 0.35, release: 0.7 } },
    haptic: 'medium',
    vignette: { color: '#e8f4ff', alpha: 0.22, reach: 0.35, attack: 0.06, hold: 0.15, decay: 0.5 },
    ui: { pop: { target: 'gust', amount: 0.2 } },
    particles: { hook: 'gustBurst', amount: 1 },
    sound: ['gust.whoosh', 'gust.snap', 'gust.splash'],
  },
  'pickup.common': pickup(0),
  'pickup.uncommon': pickup(1),
  'pickup.rare': pickup(2),
  'pickup.epic': pickup(3),
  'pickup.legendary': pickup(4),
  coins: {
    label: 'Coins earned',
    haptic: 'light',
    ui: { fly: { to: 'coins', count: 6, color: '#ffcf3a' } },
    particles: { hook: 'sparkle', amount: 0.5, color: '#ffcf3a' },
    sound: ['coin.burst'],
  },
  'consumable.shield': {
    label: 'Shield refilled',
    camera: { fov: { deg: 1.5, attack: 0.1, hold: 0.1, release: 0.4 } },
    haptic: 'success',
    flash: { color: '#8fd8ff', alpha: 0.08, blend: 'add', attack: 0.03, hold: 0.05, decay: 0.35 },
    vignette: { color: '#4fc3ff', alpha: 0.25, reach: 0.4, attack: 0.08, hold: 0.1, decay: 0.5 },
    ui: { pop: { target: 'shield', amount: 0.2 }, countUp: 'shieldValue' },
    particles: { hook: 'shimmer', amount: 1 },
    sound: ['shield.charge', 'shield.chime'],
  },
  'consumable.repair': {
    label: 'Hull repaired',
    camera: { fov: { deg: 1, attack: 0.1, hold: 0.1, release: 0.4 } },
    haptic: 'success',
    flash: { color: '#c8ffb0', alpha: 0.06, blend: 'add', attack: 0.03, hold: 0.05, decay: 0.35 },
    vignette: { color: '#7be36b', alpha: 0.18, reach: 0.4, attack: 0.08, hold: 0.1, decay: 0.5 },
    ui: { pop: { target: 'hull', amount: 0.2 }, countUp: 'hullValue' },
    particles: { hook: 'repairGlow', amount: 1 },
    sound: ['repair.knock', 'repair.chime'],
  },
  levelUp: {
    label: 'Level up',
    camera: { shake: 0.2, band: 'rumble', fov: { deg: -4, attack: 0.25, hold: 0.6, release: 0.8 } },
    haptic: 'levelUp',
    flash: { color: '#fff0b0', alpha: 0.35, blend: 'add', attack: 0.03, hold: 0.06, decay: 0.6 },
    vignette: { color: '#ffcf3a', alpha: 0.3, reach: 0.5, attack: 0.1, hold: 0.3, decay: 1.2 },
    ui: { pop: { target: 'level', amount: 0.45 }, squash: { target: 'level', amount: 0.15 }, countUp: 'levelValue' },
    particles: { hook: 'levelBurst', amount: 1, color: '#ffcf3a' },
    sound: ['level.rise', 'level.hit', 'level.shimmer'],
  },
  rankUp: {
    label: 'Rank up',
    camera: { shake: 0.38, fov: { deg: -5, attack: 0.06, hold: 0.4, release: 0.9 } },
    haptic: 'rankUp',
    flash: { color: '#ffffff', alpha: 0.4, blend: 'add', attack: 0, hold: 0.05, decay: 0.5 },
    vignette: { color: '#9fd0ff', alpha: 0.28, reach: 0.5, attack: 0.05, hold: 0.4, decay: 1.2 },
    ui: { pop: { target: 'rank', amount: 0.5 }, squash: { target: 'rank', amount: 0.25 } },
    particles: { hook: 'rankBurst', amount: 1 },
    sound: ['rank.drum', 'rank.stamp', 'rank.ring'],
  },
  win: {
    label: 'Victory',
    camera: { shake: 0.35, band: 'rumble', fov: { deg: -8, attack: 0.6, hold: 1, release: 1.5 } },
    stop: { scale: 0.25, hold: 1, release: 0.8, priority: 'ceremony' },
    haptic: 'win',
    flash: { color: '#fff3c4', alpha: 0.5, blend: 'add', attack: 0.04, hold: 0.1, decay: 1 },
    vignette: { color: '#ffcf3a', alpha: 0.35, reach: 0.55, attack: 0.3, hold: 1, decay: 1.5 },
    particles: { hook: 'fireworks', amount: 1 },
    sound: ['win.boom', 'win.swell', 'win.gulls', 'win.tail'],
  },
  landing: {
    label: 'Gale landing (yours)',
    camera: { shake: 0.5, kick: { up: -0.9, pitch: -1.4 }, fov: { deg: -3, attack: 0.05, hold: 0.06, release: 0.45 } },
    haptic: 'heavy',
    flash: { color: '#e6f6ff', alpha: 0.12, blend: 'add', attack: 0, hold: 0.033, decay: 0.25 },
    particles: { hook: 'landingSplash', amount: 1 },
    sound: ['land.thump', 'land.splash', 'land.spray'],
  },
  aground: {
    label: 'Run aground (yours)',
    camera: { shake: 0.34, band: 'rumble', kick: { back: -0.6, pitch: -1.1, roll: 1.2 } },
    stop: { scale: 0.4, hold: 0.05, release: 0.1, priority: 'hurt' },
    haptic: 'heavy',
    particles: { hook: 'scrape', amount: 1 },
    sound: ['aground.scrape', 'aground.thud', 'aground.creak'],
  },
  whaleBreach: {
    label: 'Giant whale breaches',
    camera: { shake: 0.6, band: 'rumble', falloff: [40, 280], fov: { deg: 2.5, attack: 0.3, hold: 0.4, release: 1 } },
    haptic: 'heavy',
    particles: { hook: 'breach', amount: 1 },
    sound: ['whale.breach', 'whale.splash', 'whale.blow'],
  },
  stormHurt: {
    label: 'Storm burns the hull (yours)',
    camera: { shake: 0.12, band: 'rumble' },
    haptic: 'light',
    flash: { color: '#7a3cff', alpha: 0.08, blend: 'tint', attack: 0.02, hold: 0.02, decay: 0.3 },
    vignette: { color: '#5a2bb8', alpha: 0.45, reach: 0.55, attack: 0.05, hold: 0.1, decay: 0.6 },
    ui: { squash: { target: 'hull', amount: 0.08 } },
    sound: ['storm.sting', 'storm.crackle'],
  },
  lightning: {
    label: 'Lightning strike nearby',
    camera: { shake: 0.5, falloff: [30, 400], fov: { deg: -2, attack: 0.03, hold: 0.05, release: 0.3 } },
    haptic: 'heavy',
    flash: { color: '#eef2ff', alpha: 0.45, blend: 'add', attack: 0, hold: 0.05, decay: 0.35 },
    particles: { hook: 'lightning', amount: 1 },
    sound: ['thunder.crack', 'thunder.boom', 'thunder.roll'],
  },
  heartbeat: {
    label: 'Low hull heartbeat (fires itself)',
    haptic: 'heartbeat',
    sound: ['hull.heartbeat'],
  },
  tap: {
    label: 'Interface tap',
    haptic: 'light',
    sound: ['ui.tap'],
  },
} as const satisfies Record<string, Recipe>;

export type RecipeId = keyof typeof RECIPES;

export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];

export function pickupRecipe(rarity: number): RecipeId {
  return `pickup.${RARITY_NAMES[Math.max(0, Math.min(4, Math.round(rarity)))]}` as RecipeId;
}

/** Every particle hook a recipe can call, for the actors owner to cover. */
export const PARTICLE_HOOKS = [...new Set(Object.values(RECIPES as Record<string, Recipe>).flatMap((r) => (r.particles ? [r.particles.hook] : [])))];

/** Every sound layer a recipe can call, for the sound owner to cover. */
export const SOUND_LAYERS = [
  ...new Set([...Object.values(RECIPES as Record<string, Recipe>).flatMap((r) => r.sound), 'ui.tick', 'coin.land', 'ui.press']),
];
