// Everything that moves on the sphere, behind one call: `createActors(scene, options)` gives back `update(view, dt,
// camera)`, called every frame with plain data about the match, and `fire(events)`, for the one-shot moments. Nothing
// here imports the simulation; the integration adapts its state into an ActorsView (see view.ts).
import * as THREE from 'three';
import { Aura, SHELL, Shards } from './aura.ts';
import { GUNPORTS, Kit, LANTERN, MASTHEAD, ShipModel, type Pose } from './caravel.ts';
import { AU, SEA, STAGE_U, TEX_BASE, clamp, frameAt, loadTextures, nightAt, onSea, sea, seaRadius, smooth, v3, type WaveFn } from './common.ts';
import { lookKey, lookOf } from './cosmetics.ts';
import { Effects, RARITY_GLOW } from './effects.ts';
import { Gulls, type ShipRef } from './gull.ts';
import { seaLift } from '../lift.ts';
import { rockfallAt } from '../regions/eventRocks.ts';
import { Loot } from './loot.ts';
import { Numbers } from './numbers.ts';
import { SPRITE } from './particles.ts';
import { Projectiles } from './projectiles.ts';
import { Wakes } from './wakes.ts';
import { Whales } from './whale.ts';
import type { ActorEvent, ActorsView, EruptionView, HitMarker, Juice, ShipView, Vec3, Weapon } from './view.ts';

export * from './view.ts';
export { lookOf, SAIL_COLOURS, PATTERNS, HULL_PAINTS, WAKES, FIGUREHEADS } from './cosmetics.ts';
export { RARITY_GLOW } from './effects.ts';
export { SHIELD_BLUE, HULL_WHITE } from './numbers.ts';
export { SHIP } from './caravel.ts';
export { WHALE_LENGTH, BREACH } from './whale.ts';
export { swell } from './common.ts';

export interface ActorsOptions {
  /** The planet's mean radius in metres (R in src/sim/world). */
  radius?: number;
  /** Where the hull, deck and sailcloth textures are served from. */
  textureBase?: string;
  /** The stage's sea swell, so ships ride the same waves the water shows: height in metres at a world point. */
  wave?: WaveFn;
  /** An environment map for the hull's varnish and the sails. */
  envMap?: THREE.Texture | null;
  /** The stage's shared uniforms (the planet's light and air), given to every actor material along with the actors' own. */
  uniforms?: Record<string, THREE.IUniform>;
  /** Thin the player's own sail round the middle of the screen, where the crosshair is. Default true. */
  fadePlayerSail?: boolean;
  /** Camera shake, kicks, flashes, hit-stop and haptics, for the integration to route. */
  onJuice?: (j: Juice, cause: ActorEvent | null) => void;
  /** A hit the player landed, placed on screen, for the HUD's hit marker. */
  onHitMarker?: (m: HitMarker) => void;
}

export interface Actors {
  readonly group: THREE.Group;
  /** Resolves when the textures are in. */
  readonly ready: Promise<void>;
  update(view: ActorsView, dt: number, camera: THREE.Camera): void;
  fire(events: readonly ActorEvent[]): void;
  /** Where ship `id`'s gun muzzle is this frame and which way it points; false if she is not shown. */
  muzzle(id: number, pos: THREE.Vector3, dir?: THREE.Vector3): boolean;
  /** Ship `id`'s hull as drawn (riding the swell, heeling, sinking), for cameras that follow it; null if not shown. */
  ship(id: number): THREE.Object3D | null;
  /** Drops the effects still playing (fire, smoke, flotsam, queued broadsides), for a new match. */
  clear(): void;
  dispose(): void;
}

/** How hard each weapon lands, for splashes, splinters and the numbers. */
const BIG: Record<Weapon, number> = { cannon: 0.7, scatter: 0.4, harpoon: 0.8, mortar: 1.4, repeater: 0.25, broadside: 1 };
/** What firing each weapon does to your own camera. */
const RECOIL: Record<Weapon, Juice> = {
  cannon: { shake: 0.12, kick: 0.8, haptic: 'light' },
  scatter: { shake: 0.16, kick: 1.2, haptic: 'medium' },
  harpoon: { shake: 0.1, kick: 0.6, haptic: 'light' },
  mortar: { shake: 0.26, kick: 1.6, haptic: 'medium' },
  repeater: { shake: 0.03, haptic: 'light' },
  broadside: { shake: 0.38, kick: 2.2, haptic: 'heavy' },
};
const SINK_TIME = 6.5;
const STERN = new THREE.Vector3(0, 0.6, -8.6);
const BOW = new THREE.Vector3(0, 0.6, 8.6);
const DECK = new THREE.Vector3(0, 2.6, -1);
const WARM = new THREE.Color(1, 0.62, 0.26);
const SHIELD = new THREE.Color(0.35, 0.75, 1.6);
const HIGH_SUN = new THREE.Color(1, 0.95, 0.85), LOW_SUN = new THREE.Color(1, 0.55, 0.3);

interface Fleet {
  id: number;
  model: ShipModel;
  aura: Aura;
  key: string;
  view: ShipView;
  pos: THREE.Vector3; // on the sea under her, this frame
  up: THREE.Vector3;
  fwd: THREE.Vector3;
  sink: number; // seconds since she went down; -1 afloat
  hop: number; // seconds since the gust; -1 none
  hit: number;
  aimYaw: number;
  seen: number;
  shown: boolean;
  lastHitBy: number;
  lastHitAt: number;
  lantern: THREE.Color;
}

interface Pending { at: number; ship: number; port: number }
interface Marker { at: THREE.Vector3; m: HitMarker }

export function createActors(scene: THREE.Object3D, options: ActorsOptions = {}): Actors {
  SEA.radius = options.radius ?? 554;
  // the swell, on the water the regions' events have raised or drawn down
  const wave = options.wave ?? sea.wave;
  sea.wave = (p, t) => wave(p, t) + seaLift(p);
  Object.assign(STAGE_U, options.uniforms ?? {});
  const tex = loadTextures(options.textureBase ?? TEX_BASE);
  const kit = new Kit(tex);
  kit.envMap = options.envMap ?? null;
  const group = new THREE.Group();
  group.name = 'actors';
  scene.add(group);

  const fx = new Effects(tex.deck_d);
  const shards = new Shards();
  const wakes = new Wakes();
  const numbers = new Numbers();
  const projectiles = new Projectiles(fx);
  const loot = new Loot(fx, kit.turrets);
  const gulls = new Gulls(fx);
  const whales = new Whales(fx);
  const ships = new THREE.Group();
  group.add(ships, wakes.mesh, loot.group, projectiles.group, gulls.group, whales.group, fx.group, shards.mesh, numbers.mesh);
  const auraGeo = new THREE.SphereGeometry(1, 48, 32);
  // the player's lantern lights the deck and the water round her at night
  const lamp = new THREE.PointLight(0xffa04a, 0, 34, 1.6);
  group.add(lamp);

  const fleet = new Map<number, Fleet>();
  const pending: Pending[] = [];
  const markers: Marker[] = [];
  const refs = new Map<number, ShipRef>();
  let frame = 0, clock = 0, player = -1;
  const eye = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), focus = new THREE.Vector3();
  const right = new THREE.Vector3(), hp = new THREE.Vector3();
  const juice = (j: Juice | null, cause: ActorEvent | null) => { if (j && options.onJuice) options.onJuice(j, cause); };
  /** 1 at the player's ship, falling to 0 by `range` metres. */
  const nearPlayer = (at: THREE.Vector3, range: number) => {
    const p = fleet.get(player);
    return clamp(1 - (p ? p.pos : eye).distanceTo(at) / range, 0, 1);
  };

  const add = (v: ShipView): Fleet => {
    const look = lookOf(v.cosmetics);
    const model = new ShipModel(kit, look);
    const aura = new Aura(auraGeo);
    model.body.add(aura.mesh);
    ships.add(model.root);
    const f: Fleet = {
      id: v.id, model, aura, key: lookKey(v.cosmetics), view: v, pos: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(),
      sink: v.alive ? -1 : SINK_TIME, hop: -1, hit: 0, aimYaw: 0, seen: frame, shown: true, lastHitBy: -1, lastHitAt: -9,
      lantern: WARM.clone().lerp(new THREE.Color(look.wisp), 0.3),
    };
    fleet.set(v.id, f);
    return f;
  };
  const remove = (f: Fleet) => {
    ships.remove(f.model.root);
    f.model.dispose();
    f.aura.dispose();
    fleet.delete(f.id);
  };

  const pose: Pose = { speed: 0, turn: 0, aimYaw: 0, aimPitch: 0, hp: 1, sink: 0, boost: 0, hit: 0, alt: 0, dive: 0, wind: 0, windSpeed: 0, night: 0, flip: 0 };

  function sail(f: Fleet, v: ShipView, view: ActorsView, dt: number, t: number, limit: number): void {
    const m = f.model, base = SEA.radius + SEA.level;
    frameAt(v.pos, v.head, base, m.root.matrix);
    m.root.matrixWorldNeedsUpdate = true;
    f.up.set(v.pos.x, v.pos.y, v.pos.z).normalize();
    f.fwd.setFromMatrixColumn(m.root.matrix, 2);
    right.setFromMatrixColumn(m.root.matrix, 0);
    f.pos.copy(f.up).multiplyScalar(base);
    const d = f.pos.distanceTo(eye);
    // past the horizon, she is not drawn
    f.shown = d < limit && (f.sink < 0 || f.sink < SINK_TIME);
    m.root.visible = f.shown;
    if (f.sink >= 0) f.sink += dt;
    if (f.hop >= 0) { f.hop += dt; if (f.hop > 1.6) f.hop = -1; }
    f.hit = Math.max(0, f.hit - dt * 4);
    if (!f.shown) return;
    // her gun's bearing and elevation, and the wind, in her own frame
    let yaw = 0, pitch = 0;
    if (v.aim) {
      const a = tmp.set(v.aim.x, v.aim.y, v.aim.z);
      const x = a.dot(right), y = a.dot(f.up), z = a.dot(f.fwd);
      yaw = Math.atan2(x, z);
      pitch = clamp(Math.atan2(y, Math.hypot(x, z)), -0.15, 0.7);
    }
    f.aimYaw = yaw;
    const w = v.wind ?? view.wind;
    const wx = w.x * right.x + w.y * right.y + w.z * right.z, wz = w.x * f.fwd.x + w.y * f.fwd.y + w.z * f.fwd.z;
    const hop = f.hop >= 0 ? Math.max(0, Math.sin(Math.PI * Math.min(1, f.hop / 0.95))) * 3.6 : 0;
    pose.speed = v.speed;
    pose.turn = v.turn;
    pose.aimYaw = yaw;
    pose.aimPitch = pitch;
    pose.hp = v.hull;
    pose.sink = f.sink >= 0 ? smooth(0, 1, f.sink / SINK_TIME) : 0;
    pose.boost = f.hop >= 0 ? Math.max(0, 1 - f.hop / 1.6) : 0;
    pose.hit = f.hit;
    pose.alt = (v.alt ?? 0) + hop;
    pose.dive = 0;
    pose.wind = Math.atan2(wx, wz);
    pose.windSpeed = Math.hypot(wx, wz);
    pose.night = nightAt(f.pos);
    pose.flip = v.flip ?? 0;
    const M = m.root.matrix;
    m.update(pose, t, dt, (lx, lz) => sea.wave(hp.set(lx, 0, lz).applyMatrix4(M), sea.time));
    m.far = d > 140;
    m.fade = v.id === player && options.fadePlayerSail !== false ? 1 : 0;
    // the shield's shell
    f.aura.update(v.shieldMax > 0 ? clamp(v.shield / v.shieldMax, 0, 1) : 0, dt, t, v.alive && f.sink < 0);
    // her wake, her bow wave, her wounds
    const sinking = f.sink >= 0;
    wakes.track(v.id, m.toWorld(STERN, tmp), f.fwd, v.speed, m.look.wake, t, pose.alt < 0.6 && !sinking);
    if (d < 170 && pose.alt < 0.6 && !sinking) fx.bowSpray(m.toWorld(BOW, tmp), f.fwd, v.speed, dt);
    if (d < 220 && !sinking) fx.wounded(m.toWorld(DECK, tmp), v.hull, dt);
    // the spirit lantern, sized so it still reads as a point of light at the edge of sight
    if (pose.night > 0.02 && (!sinking || f.sink < 1)) {
      const at = m.toWorld(LANTERN, tmp), n = pose.night * (sinking ? 1 - f.sink : 1);
      const flick = 0.9 + Math.sin(t * 9 + v.id) * 0.05 + Math.sin(t * 23 + v.id * 3) * 0.05;
      fx.light(at, Math.max(1.1, d * 0.013), f.lantern, (1.4 + 2.2 * n) * n * flick);
      fx.light(at, Math.max(0.45, d * 0.005), WARM, 5 * n * flick);
      if (v.id === player) { lamp.position.copy(at); lamp.intensity = 260 * n * flick; lamp.color.copy(f.lantern); }
      // the wisp at the main truck: past about 180 m the stern lantern has gone under the curve, but this shows to 240 m
      // (not on your own ship, where it would hang at the top of the view)
      if (v.id !== player) fx.light(m.toWorld(MASTHEAD, tmp), Math.max(0.4, d * 0.009), f.lantern, (0.9 + 1.6 * n) * n * flick);
    }
    if (f.hop >= 0 && f.hop < 0.9) fx.windAround(f.pos, f.fwd.clone().multiplyScalar(v.speed + 14), 40, dt);
  }

  // Cinder Peak: its plume, and each bomb on its arc from the crater, highest midway
  const crater = new THREE.Vector3(), bombAt = new THREE.Vector3(), bombTo = new THREE.Vector3();
  function erupt(e: EruptionView, dt: number): void {
    crater.set(e.crater.x, e.crater.y, e.crater.z);
    fx.plume(crater, e.strength, dt);
    for (const b of e.bombs) {
      bombTo.set(b.to.x, b.to.y, b.to.z);
      const k = b.k, r0 = crater.length(), r1 = seaRadius(bombTo), apex = 18 + crater.distanceTo(bombTo) * 0.35;
      bombAt.lerpVectors(crater, bombTo, k).setLength(r0 + (r1 - r0) * k + apex * 4 * k * (1 - k));
      fx.bomb(bombAt, dt);
    }
  }

  function update(view: ActorsView, dt: number, camera: THREE.Camera): void {
    frame++;
    clock += dt;
    const t = view.time;
    player = view.player;
    SEA.level = view.seaLevel;
    sea.time = t;
    AU.uTime.value = t;
    AU.uSunDir.value.set(view.sun.x, view.sun.y, view.sun.z).normalize();
    camera.getWorldPosition(eye);
    // the sun reddens low in the sky, where the camera is looking
    const p = view.ships.find((s) => s.id === player);
    focus.copy(p ? v3(p.pos) : eye).normalize();
    const elev = focus.dot(AU.uSunDir.value);
    AU.uSunColor.value.copy(HIGH_SUN).lerp(LOW_SUN, 1 - smooth(-0.05, 0.35, elev));
    AU.uNight.value = nightAt(focus);
    lamp.intensity = 0;
    // ships
    const hEye = Math.max(1, eye.length() - SEA.radius), R = SEA.radius;
    const limit = Math.sqrt(2 * R * hEye + hEye * hEye) + Math.sqrt(2 * R * 25) + 30;
    for (const v of view.ships) {
      let f = fleet.get(v.id);
      if (!f) f = add(v);
      f.view = v;
      f.seen = frame;
      const key = lookKey(v.cosmetics);
      if (key !== f.key) {
        f.key = key;
        f.model.setLook(lookOf(v.cosmetics));
        f.lantern.copy(WARM).lerp(new THREE.Color(f.model.look.wisp), 0.3);
      }
      if (f.model.weapon !== v.weapon) f.model.setWeapon(v.weapon);
      // back from the deep (a respawn), or lost without a sink event
      if (v.alive && f.sink >= 0) f.sink = -1;
      if (!v.alive && f.sink < 0) f.sink = 0;
      sail(f, v, view, dt, t, limit);
    }
    for (const f of [...fleet.values()]) if (f.seen !== frame) remove(f);
    // the broadside's ripple of guns
    for (let i = pending.length - 1; i >= 0; i--) {
      const q = pending[i];
      if (clock < q.at) continue;
      pending.splice(i, 1);
      const f = fleet.get(q.ship);
      if (!f || !f.shown) continue;
      const g = GUNPORTS[q.port];
      fx.muzzle('broadside', f.model.toWorld(g.pos, tmp), f.model.dirToWorld(g.dir, tmp2), 0.9);
    }
    // shots, loot, birds and whales
    projectiles.update(view.projectiles, t, (id) => {
      const f = fleet.get(id);
      return f && f.shown ? f.model.muzzle(new THREE.Vector3()) : null;
    });
    loot.update(view.loot, t, eye);
    refs.clear();
    for (const f of fleet.values()) refs.set(f.id, { pos: f.pos, fwd: f.fwd, speed: f.view.speed, alive: f.view.alive && f.sink < 0 });
    juice(gulls.update(refs, eye, dt, t, player), null);
    juice(whales.update(view.whales, dt, t, eye), null);
    if (view.eruption) erupt(view.eruption, dt);
    shards.update(dt);
    fx.update(dt);
    wakes.update(t);
    numbers.update(dt);
    // hit markers, placed on screen now there is a camera
    if (options.onHitMarker) {
      camera.updateMatrixWorld();
      for (const k of markers) {
        const c = tmp.copy(k.at).applyMatrix4(camera.matrixWorldInverse);
        const front = c.z < 0;
        c.applyMatrix4(camera.projectionMatrix);
        k.m.ndc.x = front ? c.x : -c.x;
        k.m.ndc.y = front ? c.y : -c.y;
        k.m.onScreen = front && Math.abs(c.x) <= 1 && Math.abs(c.y) <= 1;
        options.onHitMarker(k.m);
      }
    }
    markers.length = 0;
  }

  function fire(events: readonly ActorEvent[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'fire': {
          const f = fleet.get(e.ship);
          if (!f || !f.shown) break;
          f.model.recoil = 1;
          if (e.weapon === 'broadside') {
            // four guns down the side she is aiming, a beat apart; both sides when aiming ahead
            const port = f.aimYaw > 0.3, star = f.aimYaw < -0.3;
            for (let i = 0; i < GUNPORTS.length; i++) {
              const side = GUNPORTS[i].pos.x > 0;
              if ((side && star) || (!side && port)) continue;
              pending.push({ at: clock + (i % 4) * 0.07 + Math.random() * 0.03, ship: f.id, port: i });
            }
          } else {
            const pos = f.model.muzzle(new THREE.Vector3(), tmp2);
            fx.muzzle(e.weapon, pos, tmp2.clone());
          }
          if (e.ship === player) juice(RECOIL[e.weapon], e);
          break;
        }
        case 'hit': {
          const f = fleet.get(e.ship), at = v3(e.at);
          const big = BIG[e.weapon] * (e.crit ? 1.4 : 1);
          if (e.shield > 0) {
            f?.aura.hit(at);
            fx.shieldSparks(at);
            numbers.add(at, e.shield, true, e.crit && e.hull <= 0);
          }
          if (e.hull > 0) {
            fx.hitShip(at, !!e.crit, big);
            if (f) f.hit = 1;
            numbers.add(at.clone().addScaledVector(at.clone().normalize(), e.shield > 0 ? 1.4 : 0), e.hull, false, e.crit);
          }
          if (f) { f.lastHitBy = e.by; f.lastHitAt = clock; }
          if (e.by === player && e.ship !== player) {
            markers.push({ at, m: { ndc: { x: 0, y: 0 }, onScreen: false, ship: e.ship, shield: e.shield, hull: e.hull, crit: !!e.crit, broke: false } });
            juice({ shake: e.crit ? 0.08 : 0.03, hitStop: e.crit ? 0.04 : 0, haptic: e.crit ? 'medium' : 'light' }, e);
          }
          if (e.ship === player) {
            const dmg = e.hull + e.shield * 0.4;
            juice({ shake: clamp(0.15 + dmg / 60, 0.15, 0.6), flash: e.hull > 0 ? 0.18 : 0.08, flashColor: e.hull > 0 ? 0xff4a2a : 0x5ab8ff, haptic: e.hull > 0 ? 'medium' : 'light' }, e);
          }
          break;
        }
        case 'impact': {
          const at = v3(e.at), big = BIG[e.weapon];
          if (e.weapon === 'mortar') fx.explode(at, 1, e.on === 'water');
          else if (e.on === 'water') fx.splash(at, big);
          else fx.hitLand(at, big);
          const near = nearPlayer(at, e.weapon === 'mortar' ? 60 : 25);
          if (near > 0) juice({ shake: near * (e.weapon === 'mortar' ? 0.35 : 0.08) }, e);
          break;
        }
        case 'shieldBreak': {
          const f = fleet.get(e.ship);
          if (!f) break;
          f.aura.flash();
          shards.burst(f.aura.mesh, 80);
          const c = f.model.toWorld(tmp.set(0, SHELL.cy, 0), new THREE.Vector3());
          fx.shieldSparks(e.at ? v3(e.at) : c);
          fx.sparkle(c, SHIELD, 30, 6);
          if (f.lastHitBy === player && clock - f.lastHitAt < 0.5 && e.ship !== player) {
            markers.push({ at: e.at ? v3(e.at) : c, m: { ndc: { x: 0, y: 0 }, onScreen: false, ship: e.ship, shield: 0, hull: 0, crit: false, broke: true } });
            juice({ shake: 0.12, hitStop: 0.05, haptic: 'medium' }, e);
          }
          if (e.ship === player) juice({ shake: 0.45, kick: 1.5, flash: 0.3, flashColor: 0x5ab8ff, haptic: 'heavy' }, e);
          break;
        }
        case 'shieldRefill': {
          const f = fleet.get(e.ship);
          if (!f) break;
          f.aura.refill();
          fx.sparkle(f.model.toWorld(tmp.set(0, 1.5, 0), new THREE.Vector3()), SHIELD, 34, 7);
          if (e.ship === player) juice({ shake: 0.04, haptic: 'light' }, e);
          break;
        }
        case 'sink': {
          const f = fleet.get(e.ship);
          if (!f) break;
          if (f.sink < 0) f.sink = 0;
          fx.sink(f.pos, f.fwd, new THREE.Color(f.model.look.wisp));
          const near = e.ship === player ? 1 : nearPlayer(f.pos, 120);
          if (near > 0) juice({ shake: 0.65 * near, kick: 2 * near, haptic: 'heavy' }, e);
          break;
        }
        case 'gust': {
          const f = fleet.get(e.ship);
          if (!f) break;
          f.hop = 0;
          fx.gust(f.pos, f.fwd);
          if (e.ship === player) juice({ shake: 0.1, kick: 3.5, haptic: 'light' }, e);
          break;
        }
        case 'pickup': {
          const f = fleet.get(e.ship);
          if (!f) break;
          const c = RARITY_GLOW[e.rarity], at = f.model.toWorld(tmp.set(0, 3, 0), new THREE.Vector3());
          fx.sparkle(at, c, 20 + e.rarity * 8, 2.5);
          fx.glow.emit({ x: at.x, y: at.y, z: at.z, life: 0.5, size: 2, grow: 5, r: c.r * 2, g: c.g * 2, b: c.b * 2, frame: SPRITE.ring, mode: 2, fadeIn: 0 });
          if (e.ship === player) juice({ shake: 0.03 + e.rarity * 0.02, haptic: e.rarity >= 3 ? 'medium' : 'light' }, e);
          break;
        }
        case 'delivery':
          gulls.deliver(e.ship, e.rarity ?? 0, refs.get(e.ship) ?? null, eye);
          break;
        case 'ram': {
          const at = v3(e.at);
          fx.hitShip(at, false, 1.5);
          fx.splash(at, 1.2);
          const near = nearPlayer(at, 30);
          if (near > 0) juice({ shake: 0.55 * near, kick: 1.5 * near, hitStop: 0.05, haptic: 'heavy' }, e);
          break;
        }
        case 'scrape': {
          const at = v3(e.at);
          fx.hitLand(at, 0.3);
          const near = nearPlayer(at, 30);
          if (near > 0) juice({ shake: 0.12 * near, haptic: 'light' }, e);
          break;
        }
        case 'breach':
          whales.breach(e.at, e.head);
          break;
        case 'lavaBomb':
          fx.lavaLand(v3(e.at), e.on === 'water');
          break;
        case 'rockfall':
          for (const p of rockfallAt(e.region, v3(e.at).normalize())) fx.rockfall(onSea(v3(p), 0, new THREE.Vector3()));
          break;
      }
    }
  }

  return {
    group,
    ready: tex.ready,
    update,
    fire,
    muzzle(id, pos, dir) {
      const f = fleet.get(id);
      if (!f || !f.shown) return false;
      f.model.muzzle(pos, dir);
      return true;
    },
    ship(id) {
      const f = fleet.get(id);
      return f && f.shown ? f.model.body : null;
    },
    clear() {
      fx.clear();
      pending.length = 0;
    },
    dispose() {
      for (const f of [...fleet.values()]) remove(f);
      scene.remove(group);
      auraGeo.dispose();
      gulls.dispose();
      whales.dispose();
    },
  };
}

/** Where a ship at `pos` heading `head` is, for callers placing things beside it. */
export function shipFrame(pos: Vec3, head: Vec3, out = new THREE.Matrix4()): THREE.Matrix4 {
  return frameAt(pos, head, SEA.radius + SEA.level, out);
}
