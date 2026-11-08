// The juice toolkit: one object that owns the camera response, hit-stop, haptics, screen flashes, hit markers,
// damage numbers and interface motion, and plays a recipe across all of them in one call.
//
//   const juice = new Juice({ hud, hooks: { particles, sound } });
//   juice.target('coins', coinCounterEl);           // counters that rewards fly into, bars that get bumped
//   each frame:
//     const gameDt = juice.update(realDt);          // advance the sim's accumulator by gameDt (hit-stop lives here)
//     rig.place(camera); juice.applyCamera(camera, rig.fov);
//     juice.setHull(me.hull / 100);                  // the low-hull heartbeat
//   on events:
//     juice.fire('shieldBreak', { at, world, value: e.shield, key: e.target });
//
// Everything that fires is written to `juice.log` (see log.ts), to read next to a frame strip.
import type * as THREE from 'three';
import { countUp, FlyCanvas, flyTo, pop, squash, type Point } from './anim.ts';
import { CameraJuice } from './camera.ts';
import { Haptics, type HapticDriver, type HapticKind, type PatternName } from './haptics.ts';
import { effects } from './log.ts';
import { DamageNumbers, HitMarkers } from './markers.ts';
import { RECIPES, type Recipe, type RecipeId } from './recipes.ts';
import { ScreenFx, ScreenFxDom } from './screen.ts';
import { ticker } from './ticker.ts';
import { TimeScale } from './time.ts';

export interface FireContext {
  /** 0..1 (or a little over): scales shake, kicks, FOV, flashes and haptic weight. Default 1. */
  strength?: number;
  /** Screen direction of the cause, radians clockwise from straight ahead: aims kicks and the damage vignette. */
  dir?: number;
  /** Metres from the camera, for recipes whose camera response falls off with distance. */
  distance?: number;
  /** Screen point (px, in the HUD's box) for the marker, the number and the start of a fly. Default the crosshair. */
  at?: Point;
  /** Projects a world point each frame for a damage number that follows its ship. Wins over `at` for numbers. */
  anchor?: () => Point | null;
  /** World position, passed through to the particle and sound hooks. */
  world?: { x: number; y: number; z: number };
  /** The damage dealt, or the reward. */
  value?: number;
  /** Count-ups and counters filled by a fly: from → to. */
  from?: number;
  to?: number;
  /** How many icons fly (overrides the recipe's count). Over 12 they're drawn on the canvas layer. */
  count?: number;
  /** Damage numbers with the same key merge (use the target ship's id). */
  key?: string | number;
}

export interface ParticleCall {
  hook: string;
  amount: number;
  color?: string;
  ctx: FireContext;
  recipe: RecipeId;
}

export interface JuiceHooks {
  /** Spawn the named particle effect (actors owner). */
  particles?: (call: ParticleCall) => void;
  /** Play these sound layers together (sound owner). */
  sound?: (layers: readonly string[], ctx: FireContext, recipe: RecipeId | 'ui') => void;
}

export interface JuiceSettings {
  /** Screen shake, 0..1. */
  shake: number;
  /** Flash and vignette strength, 0..1. */
  flashes: number;
  haptics: boolean;
}

export interface JuiceOptions {
  /** The HUD's root: the screen layers, numbers, markers and fly canvas are added inside it, in that order. */
  hud?: HTMLElement;
  hooks?: JuiceHooks;
  /** Seeds the shake noise, for repeatable captures. */
  seed?: number;
  /** A haptic driver; null forces the no-op. Default: Capacitor on a device, nothing in a browser. */
  haptics?: HapticDriver | null;
  /** Draw flashes and vignettes with DOM layers (default true with a hud). Turn off when the grade draws them. */
  domScreen?: boolean;
  /** False: the hit markers and damage numbers are someone else's to draw (the HUD draws them on the chart). */
  marks?: boolean;
}

const STRONGER: Partial<Record<HapticKind, HapticKind>> = { heavy: 'medium', medium: 'light', light: 'select' };

export class Juice {
  readonly log = effects;
  readonly time = new TimeScale();
  readonly camera: CameraJuice;
  readonly haptics: Haptics;
  readonly screen = new ScreenFx();
  readonly screenDom: ScreenFxDom | null = null;
  readonly numbers: DamageNumbers | null = null;
  readonly markers: HitMarkers | null = null;
  readonly flyCanvas: FlyCanvas | null = null;
  hooks: JuiceHooks;
  private readonly hud: HTMLElement | null;
  private readonly targets = new Map<string, HTMLElement>();

  constructor(opts: JuiceOptions = {}) {
    this.hooks = opts.hooks ?? {};
    this.camera = new CameraJuice(opts.seed ?? 1);
    this.haptics = new Haptics(opts.haptics);
    this.hud = opts.hud ?? null;
    if (this.hud) {
      if (opts.domScreen !== false) this.screenDom = new ScreenFxDom(this.hud);
      if (opts.marks !== false) {
        this.numbers = new DamageNumbers(this.hud);
        this.markers = new HitMarkers(this.hud);
      }
      const c = document.createElement('canvas');
      c.className = 'juice-fly';
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
      this.hud.append(c);
      this.flyCanvas = new FlyCanvas(c);
    }
    this.screen.onBeat = (low) => this.fire('heartbeat', { strength: 0.5 + low / 2 });
  }

  settings(s: Partial<JuiceSettings>): void {
    if (s.shake !== undefined) this.camera.intensity = s.shake;
    if (s.flashes !== undefined) this.screen.intensity = s.flashes;
    if (s.haptics !== undefined) this.haptics.enabled = s.haptics;
  }

  /** Registers an interface element by name, for recipes to fly into, pop, squash or count. Null removes it. */
  target(name: string, el: HTMLElement | null): void {
    if (el) this.targets.set(name, el);
    else this.targets.delete(name);
  }

  /** Plays a recipe on every channel it names. */
  fire(id: RecipeId, ctx: FireContext = {}): void {
    const r: Recipe = RECIPES[id];
    const k = ctx.strength ?? 1;
    effects.begin(id);
    try {
      if (r.stop) this.time.request(r.stop, k);
      if (r.camera) this.camera.play(r.camera, k, ctx.dir, ctx.distance);
      if (r.haptic) this.haptics.play(k < 0.5 && STRONGER[r.haptic as HapticKind] ? STRONGER[r.haptic as HapticKind]! : (r.haptic as HapticKind | PatternName));
      if (r.flash) this.screen.flash(r.flash, k);
      if (r.vignette) this.screen.vignette(r.vignette, k, ctx.dir);
      if (r.marker) {
        if (this.markers) this.markers.show(r.marker, ctx.at);
        else effects.add('marker', r.marker, { hud: false }, 'suppressed');
      }
      if (r.number && ctx.value !== undefined) {
        const at = ctx.anchor ?? ctx.at ?? this.aboveCrosshair();
        if (this.numbers && at) this.numbers.show(ctx.value, r.number, at, ctx.key ?? '');
        else effects.add('number', r.number, { value: ctx.value, hud: false }, 'suppressed');
      }
      if (r.ui) this.ui(id, r, ctx);
      if (r.particles) {
        const p = r.particles;
        effects.add('particles', p.hook, { amount: p.amount * k, hooked: !!this.hooks.particles, ...(p.color ? { color: p.color } : {}) });
        this.hooks.particles?.({ hook: p.hook, amount: p.amount * k, color: p.color, ctx, recipe: id });
      }
      if (r.sound.length) {
        effects.add('sound', r.sound.join(' + '), { layers: r.sound.length, hooked: !!this.hooks.sound });
        this.hooks.sound?.(r.sound, ctx, id);
      }
    } finally {
      effects.end();
    }
  }

  /** The hull as a fraction, every frame: drives the low-hull vignette and heartbeat. */
  setHull(frac: number): void {
    this.screen.setHull(frac);
  }

  /** Advances everything by real time. Returns the game time that passes (slowed or frozen by hit-stop). */
  update(realDt: number): number {
    effects.tick(realDt);
    const gameDt = this.time.update(realDt);
    this.camera.update(realDt);
    this.haptics.update(realDt);
    const st = this.screen.update(realDt);
    this.screenDom?.draw(st);
    this.markers?.update(realDt);
    this.numbers?.update(realDt);
    if (ticker.manual) ticker.step(realDt);
    return gameDt;
  }

  /** Layers the shake, kicks and FOV onto a camera the rig placed this frame. */
  applyCamera(cam: THREE.PerspectiveCamera, baseFov: number): void {
    this.camera.apply(cam, baseFov);
  }

  /** Stops everything at once (leaving a match, opening a menu). */
  clear(): void {
    this.time.clear();
    this.camera.clear();
    this.screen.clear();
    this.markers?.clear();
    this.numbers?.clear();
    this.haptics.cancel();
  }

  private ui(id: RecipeId, r: Recipe, ctx: FireContext): void {
    const u = r.ui!;
    const el = (name: string) => {
      const e = this.targets.get(name);
      if (!e) effects.add('anim', `no target "${name}"`, {}, 'suppressed');
      return e;
    };
    if (u.pop) {
      const e = el(u.pop.target);
      if (e) pop(e, u.pop.amount);
    }
    if (u.squash) {
      const e = el(u.squash.target);
      if (e) squash(e, u.squash.amount);
    }
    if (u.countUp && ctx.from !== undefined && ctx.to !== undefined) {
      const e = el(u.countUp);
      let n = 0;
      if (e)
        countUp(e, ctx.from, ctx.to, {
          onTick: () => {
            this.sound(['ui.tick'], ctx);
            if (n++ % 3 === 0) this.haptics.play('select');
          },
        });
    }
    if (u.fly) {
      const e = el(u.fly.to);
      if (!e) return;
      const count = Math.max(1, Math.round(ctx.count ?? u.fly.count));
      const from = this.toViewport(ctx.at) ?? this.centre();
      const { from: v0, to: v1 } = ctx;
      const onArrive = (i: number, n: number) => {
        effects.begin(id);
        if (v0 !== undefined && v1 !== undefined) e.textContent = Math.round(v0 + ((v1 - v0) * (i + 1)) / n).toLocaleString('en-US');
        this.sound(['coin.land'], { ...ctx, value: i / Math.max(1, n - 1) });
        this.haptics.play(i === n - 1 ? 'light' : 'select');
        effects.end();
      };
      const opts = { from, to: e, count, color: u.fly.color, onArrive, seed: effects.frame };
      if (count > 12 && this.flyCanvas) this.flyCanvas.fly(opts);
      else flyTo({ ...opts, parent: this.hud ?? undefined });
    }
  }

  private sound(layers: readonly string[], ctx: FireContext): void {
    effects.add('sound', layers.join(' + '), { layers: layers.length, hooked: !!this.hooks.sound });
    this.hooks.sound?.(layers, ctx, 'ui');
  }

  private aboveCrosshair(): Point | null {
    if (!this.hud) return null;
    return { x: this.hud.clientWidth / 2, y: this.hud.clientHeight / 2 - 40 };
  }

  private centre(): Point {
    const r = this.hud?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
  }

  /** HUD-local point → viewport point (flights are positioned in the viewport). */
  private toViewport(p?: Point): Point | null {
    if (!p) return null;
    const r = this.hud?.getBoundingClientRect();
    return r ? { x: r.left + p.x, y: r.top + p.y } : p;
  }
}

export { RECIPES, RECIPE_IDS, RARITY, PARTICLE_HOOKS, SOUND_LAYERS, pickupRecipe, type Recipe, type RecipeId } from './recipes.ts';
export { EASE, SPRING, Spring, springEasing } from './ease.ts';
export { effects, format, type EffectEntry, type EffectLog } from './log.ts';
export { ticker } from './ticker.ts';
export { EFFECT_FLOOR, PRIORITY, TimeScale, type StopSpec } from './time.ts';
export { BANDS, CameraJuice, type CameraSpec, type KickSpec, type PulseSpec } from './camera.ts';
export { Haptics, PATTERNS, capacitorDriver, type HapticKind, type PatternName } from './haptics.ts';
export { LOW_HULL, ScreenFx, ScreenFxDom, type ScreenState } from './screen.ts';
export { MARKERS, NUMBERS, HitMarkers, DamageNumbers, type MarkerKind } from './markers.ts';
export { countUp, flyTo, FlyCanvas, pop, pressable, pressDown, pressUp, squash, FLY, PRESS } from './anim.ts';
