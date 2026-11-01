// The stage: everything drawn, assembled once, then driven each frame from the match: ships, the camera that chases
// yours, and every event turned into splash, smoke and shake.
import * as THREE from 'three';
import { buildWorld, flowAt, PLACES, placeInfluence, rng, sampleHeight, type World } from './world.ts';
import { Engine, Globe, globeShadows, loadTextures, QUALITY, U, type Quality, type Textures } from './gfx/engine.ts';
import { Sky, WEATHERS } from './gfx/sky.ts';
import { Land } from './gfx/land.ts';
import { Water } from './gfx/water.ts';
import { Fleet, randomLook, SHIP, ShipView, type Look, type Pose } from './gfx/ships.ts';
import { Fx, RARITY_GLOW, type LootLike, type TokenKind } from './gfx/fx.ts';
import { Gull, Leviathan, type GullLook } from './gfx/creatures.ts';
import type { GameEvent, Match, Ship } from './game.ts';
import { inkColor } from './territory.ts';

const TAU = Math.PI * 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The chase camera: yaw and pitch are the player's; distance, shake and field of view follow the action. */
export class Rig {
  yaw = 0;
  pitch = 0.2;
  dist = 24;
  trauma = 0;
  kick = 0;
  private lift = 0;
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  readonly fwd = new THREE.Vector3(0, 0, 1);
  private readonly pivot = new THREE.Vector3();
  private seeded = false;

  /** Drag on the right of the screen turns the camera. */
  turn(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy, -0.32, 1.1);
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Steering, from the stick in screen terms to a heading on the sea. */
  steer(jx: number, jy: number): [number, number] {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // screen right is the camera's right: -z cross... for yaw 0 looking +z, right is -x
    return [fx * jy - fz * jx, fz * jy + fx * jx];
  }

  update(cam: THREE.PerspectiveCamera, target: THREE.Vector3, mode: 'sea' | 'air' | 'spectate', ground: (x: number, z: number) => number, dt: number, t: number, extraFov: number): void {
    const wantDist = mode === 'air' ? 36 : mode === 'spectate' ? 46 : 27;
    this.dist += (wantDist - this.dist) * Math.min(1, dt * 2);
    const k = this.seeded ? Math.min(1, dt * 12) : 1;
    this.pivot.lerp(target, k);
    this.seeded = true;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.fwd.set(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp);
    // over the right shoulder, so the crosshair clears the mast
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const shoulder = mode === 'sea' ? 3.2 : 0;
    let d = this.dist, lift = 0;
    // a hillside behind: rise over it, keeping the distance; only a cliff pulls the camera in
    for (let s = 4; s < d; s += 2) {
      const x = this.pivot.x - this.fwd.x * s + right.x * shoulder, z = this.pivot.z - this.fwd.z * s + right.z * shoulder, y = this.pivot.y - this.fwd.y * s;
      const need = ground(x, z) + 2 - y;
      if (need <= 0) continue;
      const l = need * d / s;
      if (l > 16) { d = Math.max(6, s - 2); break; }
      lift = Math.max(lift, l);
    }
    this.lift += (lift - this.lift) * Math.min(1, dt * (lift > this.lift ? 10 : 2.5));
    this.pos.copy(this.pivot).addScaledVector(this.fwd, -d).addScaledVector(right, shoulder);
    // aim where the camera would have looked, so the crosshair holds its point as the boom rises
    this.look.copy(this.pos).addScaledVector(this.fwd, 60);
    this.pos.y += this.lift;
    const floor = Math.max(ground(this.pos.x, this.pos.z), 0) + 1.6;
    if (this.pos.y < floor) this.pos.y = floor;
    // shake: trauma squared, smooth noise
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    const n = (f: number, o: number) => Math.sin(t * f + o) * 0.6 + Math.sin(t * f * 2.3 + o * 1.7) * 0.4;
    cam.position.copy(this.pos);
    cam.position.x += n(31, 1) * s * 0.9;
    cam.position.y += n(29, 2) * s * 0.7;
    cam.lookAt(this.look);
    cam.rotateZ(n(23, 3) * s * 0.05);
    this.kick += (extraFov - this.kick) * Math.min(1, dt * 5);
    cam.fov = 58 + this.kick;
  }

  /** Swings the camera round behind the bow, gently, while the player is not looking about. */
  follow(heading: number, dt: number, rate: number): void {
    this.yaw += wrap(heading - this.yaw) * Math.min(1, dt * rate);
  }

  /** Puts the camera behind a heading at once (a new life, a landing). */
  behind(heading: number, pitch = 0.2): void {
    this.yaw = heading;
    this.pitch = pitch;
  }
}

export interface Mark { id: number; x: number; y: number; z: number }

/** Where the harbour scene is moored: the lagoon's blossom isles behind. */
const HARBOUR = { x: PLACES[0].x - 40, z: PLACES[0].z + 60, heading: 2.4 };

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.5, 12000);
  readonly focus = new THREE.Vector3();
  readonly rig = new Rig();
  time = 0;
  readonly engine: Engine;
  readonly world: World;
  readonly tex: Textures;
  readonly sky: Sky;
  readonly land: Land;
  readonly water: Water;
  readonly fleet: Fleet;
  readonly fx: Fx;
  readonly gull = new Gull();
  readonly leviathan = new Leviathan();
  readonly views = new Map<number, ShipView>();
  readonly looks = new Map<number, Look>();
  free = false; // look-dev: the camera is placed by hand
  watch = -1; // the ship the camera follows once yours is gone
  private show: { view: ShipView; x: number; z: number; heading: number; orbit: number } | null = null;
  private readonly pmrem: THREE.PMREMGenerator;
  private env: THREE.WebGLRenderTarget | null = null;
  private readonly envScene = new THREE.Scene();
  private hurt = 0;
  private flash = 0;
  private breachT = -1;
  private breachYaw = 0;
  private readonly light = new THREE.Color();
  private readonly gullHome = new THREE.Vector3();
  /** The way the wind blows (a heading), and how far the watched ship is riding a current (0..1). */
  private wind = 0;
  private riding = 0;
  private readonly cur: [number, number] = [0, 0];

  /** Sets the wind for the sails, the ripples and the trees. */
  private blow(dir: number): void {
    this.wind = dir;
    U.uWind.value.set(Math.sin(dir), Math.cos(dir)).multiplyScalar(0.9);
  }

  private constructor(engine: Engine, world: World, tex: Textures, sky: Sky, land: Land, water: Water) {
    this.engine = engine; this.world = world; this.tex = tex; this.sky = sky; this.land = land; this.water = water;
    // the atmosphere rides on three's fog chunks, so a fog must exist for them to compile in
    this.scene.fog = new THREE.Fog(0xffffff, 1, 2);
    this.fleet = new Fleet(tex);
    const barrels = new Map<string, THREE.BufferGeometry>();
    for (const [k, t] of this.fleet.kit.turrets) barrels.set(k, t.barrel);
    this.fx = new Fx(tex, water, barrels);
    this.scene.add(sky.group, land.group, water.mesh, this.fleet.group, this.fx.group, this.gull.root, this.leviathan.root);
    this.pmrem = new THREE.PMREMGenerator(engine.renderer);
    const dome = new THREE.Mesh(sky.dome.geometry, sky.dome.material);
    dome.scale.setScalar(100);
    this.envScene.add(dome);
    this.camera.layers.enable(1);
    land.update(this.focus, 0);
  }

  static async create(canvas: HTMLCanvasElement, quality: Quality = QUALITY.balanced, progress: (f: number, what: string) => void = () => {}): Promise<Stage> {
    const engine = new Engine(canvas);
    engine.setQuality(quality);
    progress(0.02, 'Raising the islands');
    await new Promise((r) => setTimeout(r, 0));
    const world = buildWorld();
    const tex = await loadTextures((f) => progress(0.1 + f * 0.6, 'Painting the land'));
    progress(0.75, 'Growing the forests');
    await new Promise((r) => setTimeout(r, 0));
    const sky = new Sky(quality.shadow);
    const land = new Land(world, tex, sky, quality);
    const water = new Water(tex, land.heightTex, sky, quality.reflect, world);
    const stage = new Stage(engine, world, tex, sky, land, water);
    progress(0.9, 'Lighting the sky');
    stage.warm();
    progress(1, '');
    return stage;
  }

  /** Compiles every program up front so the first seconds of play do not stutter. */
  warm(): void {
    this.engine.renderer.compile(this.scene, this.camera);
  }

  setWeather(i: number): void {
    const w = WEATHERS[(i + WEATHERS.length) % WEATHERS.length];
    this.sky.set(w);
    this.water.rain = w.rain;
    this.refreshEnv();
  }

  /** The sky, prefiltered, for the lacquer and metal on the ships to reflect. */
  refreshEnv(): void {
    const old = this.env;
    this.env = this.pmrem.fromScene(this.envScene, 0.015, 0.1, 1000);
    this.fleet.setEnv(this.env.texture);
    this.fx.setEnv(this.env.texture);
    old?.dispose();
  }

  ground = (x: number, z: number): number => sampleHeight(this.world.heights, x, z);

  // ---------------------------------------------------------------- a match

  /** Dresses a fleet for a new match: one view per ship, the Gale laid across the sky. */
  bind(match: Match, playerLook: Look): void {
    for (const v of this.views.values()) this.fleet.remove(v);
    this.views.clear();
    this.looks.clear();
    for (const s of match.ships) {
      const look = s.bot ? randomLook(rng(s.look + 11)) : playerLook;
      const v = this.fleet.spawn(look);
      this.views.set(s.id, v);
      this.looks.set(s.id, look);
      this.water.inkCol[s.id + 1].setHex(inkColor(s.id, match.player));
    }
    const g = match.gale;
    this.fx.setGale(g.ax, g.az, g.bx, g.bz, g.alt);
    this.rig.behind(Math.atan2(g.bx - g.ax, g.bz - g.az), 0.15);
    this.breachT = -1;
    this.hurt = 0;
    this.gull.pos.set(g.ax, g.alt + 10, g.az);
    if (this.env) { this.fleet.setEnv(this.env.texture); this.fx.setEnv(this.env.texture); }
  }

  unbind(): void {
    for (const v of this.views.values()) this.fleet.remove(v);
    this.views.clear();
    this.watch = -1;
    this.fx.setStorm(0, 0, 1, 0, 0);
    this.fx.galeOn(0);
    this.leviathan.root.visible = false;
  }

  private pose(s: Ship): Pose {
    const hop = s.hop > 0 ? Math.sin((1 - s.hop) * Math.PI) * 2.6 : 0;
    return {
      x: s.x, z: s.z, heading: s.heading, speed: s.speed, turn: s.turn, aim: s.aimYaw, pitch: s.aimPitch,
      hp: s.hull / 100, sink: s.sink, boost: s.boostT > 0 ? 1 : 0, hit: s.hitFlash,
      alt: s.phase === 'gale' || s.phase === 'glide' ? s.alt : hop, dive: s.phase === 'glide' ? Math.min(1, Math.max(0, -s.vy - 15) / 20) : 0,
      wind: wrap(this.wind - s.heading),
    };
  }

  /** Turns the match's latest events into things seen; returns nothing, leaves the events for the HUD and the sound. */
  private react(m: Match, events: readonly GameEvent[]): void {
    const me = m.player, fx = this.fx;
    const v3 = new THREE.Vector3(), d3 = new THREE.Vector3();
    for (const e of events) {
      switch (e.t) {
        case 'fire': {
          const v = this.views.get(e.ship);
          if (!v) break;
          v.recoil = 1;
          v.muzzle(v3, d3);
          const near = this.camera.position.distanceTo(v3) < 500;
          if (near) fx.muzzle(e.kind, v3.x, v3.y, v3.z, e.dx, e.dy, e.dz);
          if (e.ship === me) this.rig.shake({ cannon: 0.12, scatter: 0.22, harpoon: 0.2, mortar: 0.3, repeater: 0.035 }[e.kind]);
          break;
        }
        case 'impact':
          if (e.kind === 'mortar') fx.explode(e.x, e.y, e.z, 1, e.on === 'water');
          else if (e.on === 'water') fx.splash(e.x, e.z, e.big);
          else if (e.on === 'land') fx.hitLand(e.x, e.y, e.z, e.big);
          if (e.kind === 'mortar' || e.kind === 'harpoon') { const d = this.camera.position.distanceTo(v3.set(e.x, e.y, e.z)); if (d < 60) this.rig.shake((60 - d) / 120); }
          break;
        case 'hit': {
          const v = this.views.get(e.target);
          if (!v) break;
          if (e.kind === 'storm') { if (e.target === me) { this.hurt = Math.min(1, this.hurt + 0.4); } break; }
          if (e.shield > 0) fx.shieldHit(e.target, v.root, e.x, e.y, e.z, e.broke);
          if (e.hull > 0) fx.hitShip(e.x, e.y, e.z, e.crit, e.kind === 'harpoon' || e.kind === 'mortar' ? 1 : 0.25);
          if (e.target === me) { this.rig.shake(0.18 + e.dmg / 90); this.hurt = Math.min(1, this.hurt + 0.25 + e.dmg / 60); }
          break;
        }
        case 'elim': {
          const s = m.ships[e.victim];
          fx.sink(s.x, s.z, s.heading);
          const look = this.looks.get(e.victim);
          if (look) this.wispRise(s.x, s.z, new THREE.Color(look.wisp));
          if (e.killer === me || e.victim === me) this.rig.shake(0.5);
          break;
        }
        case 'clam':
          fx.sparkle(e.x, 0.5, e.z, RARITY_GLOW[4], 40, 3);
          fx.splash(e.x, e.z, 0.4);
          break;
        case 'pickup': {
          const s = m.ships[e.ship];
          fx.sparkle(s.x, 3, s.z, RARITY_GLOW[e.item.rarity], e.ship === me ? 24 : 10, 3);
          break;
        }
        case 'gust': {
          const s = m.ships[e.ship];
          fx.gust(s.x, s.z, s.heading);
          if (e.ship === me) this.rig.shake(0.15);
          break;
        }
        case 'splash': {
          fx.splash(e.x, e.z, 2.2);
          if (e.ship === me) { this.rig.shake(0.45); this.rig.behind(m.ships[e.ship].heading, 0.2); }
          break;
        }
        case 'scrape':
          fx.hitLand(e.x, 0.5, e.z, 0.3);
          fx.splash(e.x, e.z, 0.4);
          if (e.ship === me) this.rig.shake(0.1 + e.power * 0.3);
          break;
        case 'ram':
          fx.hitShip(e.x, 2.5, e.z, false, 1);
          fx.splash(e.x, e.z, 1);
          if (e.a === me || e.b === me) this.rig.shake(0.5);
          break;
        case 'mote': {
          const s = m.ships[e.ship];
          if (e.ship === me) fx.sparkle(s.x, 2, s.z, RARITY_GLOW[4], 6, 2);
          break;
        }
        case 'parcel':
          fx.splash(e.x, e.z, 0.5);
          fx.sparkle(e.x, 1, e.z, RARITY_GLOW[2 + e.tier], 30, 2);
          break;
        case 'leviathan':
          if (e.state === 'breach') {
            this.breachT = 0;
            this.breachYaw = Math.random() * TAU;
            fx.explode(e.x, 0, e.z, 2.2, true);
            for (let i = 0; i < 4; i++) fx.splash(e.x + Math.cos(i * 1.6) * 8, e.z + Math.sin(i * 1.6) * 8, 3);
            const d = this.camera.position.distanceTo(v3.set(e.x, 0, e.z));
            if (d < 200) this.rig.shake((200 - d) / 220);
          }
          break;
        case 'stunt':
          fx.sparkle(e.x, 4, e.z, e.kind === 'arch' ? RARITY_GLOW[4] : RARITY_GLOW[2], 60, 6);
          break;
        case 'claim': {
          if (e.cells <= 0) break;
          const c = new THREE.Color(inkColor(e.ship, m.player)).multiplyScalar(3);
          fx.sparkle(e.x, 3, e.z, c, Math.min(90, 20 + e.cells / 6), Math.min(30, 6 + Math.sqrt(e.cells)));
          const s = m.ships[e.ship];
          fx.sparkle(s.x, 4, s.z, c, 24, 4);
          if (e.ship === me) this.rig.shake(0.12);
          break;
        }
        case 'cut': {
          const c = new THREE.Color(inkColor(e.victim, m.player)).multiplyScalar(3);
          fx.splash(e.x, e.z, 1.2);
          fx.sparkle(e.x, 1.5, e.z, c, 40, 5);
          if (e.by === me || e.victim === me) this.rig.shake(0.35);
          break;
        }
        case 'win': {
          const s = m.ships[e.ship];
          for (let i = 0; i < 8; i++) setTimeout(() => this.firework(s.x + (Math.random() - 0.5) * 60, s.z + (Math.random() - 0.5) * 60), i * 450);
          break;
        }
      }
    }
  }

  private readonly wisps: { x: number; y: number; z: number; c: THREE.Color; t: number }[] = [];
  private wispRise(x: number, z: number, c: THREE.Color): void {
    this.wisps.push({ x, y: 3, z, c, t: 0 });
  }

  private firework(x: number, z: number): void {
    const c = RARITY_GLOW[1 + Math.floor(Math.random() * 4)];
    const y = 60 + Math.random() * 30;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * TAU, e = Math.acos(Math.random() * 2 - 1), sp = 14 + Math.random() * 6;
      this.fx.glow.emit({ x, y, z, vx: Math.sin(e) * Math.cos(a) * sp, vy: Math.cos(e) * sp, vz: Math.sin(e) * Math.sin(a) * sp, life: 1.6 + Math.random(), size: 0.35, r: c.r * 5, g: c.g * 5, b: c.b * 5, frame: 5, drag: 1.2, grav: 4, fadeIn: 0 });
    }
  }

  /** One frame of a match: views follow ships, the camera follows yours, events become effects. */
  sync(m: Match, events: readonly GameEvent[], dt: number): void {
    this.react(m, events);
    this.blow(m.wind);
    const me = m.me, t = this.time;
    // ships
    for (const s of m.ships) {
      const v = this.views.get(s.id);
      if (!v) continue;
      const gone = !s.alive && s.sink >= 1;
      v.root.visible = !gone;
      if (gone) continue;
      const w = m.weaponOf(s);
      if (w && v.weapon !== w.kind) v.setWeapon(w.kind);
      v.fade = s.id === me.id && s.phase === 'sea' && !this.free ? 0.8 : 0;
      v.far = this.camera.position.distanceToSquared(v.root.position) > 110 * 110;
      v.update(this.pose(s), t, dt);
      const near = Math.abs(s.x - this.focus.x) < 380 && Math.abs(s.z - this.focus.z) < 380;
      if (!near) continue;
      if (s.phase === 'sea' && s.alive && s.hop <= 0.05) this.fx.wake(s.x, s.z, s.heading, s.speed, dt);
      if (s.alive && s.phase === 'sea') this.fx.wounded(s.x, 3.5, s.z, s.hull / 100, dt);
      if (!s.alive && s.sink < 0.8) this.fx.wounded(s.x, 2, s.z, 0.05, dt);
      if (s.phase === 'glide' && s.id === me.id) this.fx.windAround(s.x, s.alt, s.z, s.vx, s.vy, s.vz, 70, dt);
      if (s.boostT > 0 && s.id === me.id) this.fx.windAround(s.x, 3, s.z, s.vx, 0, s.vz, 40, dt);
      else if (this.riding > 0.3 && s.id === me.id) this.fx.windAround(s.x, 3, s.z, s.vx, 0, s.vz, 14 * this.riding, dt);
    }
    if ((this.frames & 3) === 0) this.water.setInk(m.ink.owner, m.ink.trail, m.ink.version, m.player + 1);
    this.fx.placeShields((id) => { const v = this.views.get(id); return v && v.root.visible ? v.root : null; });
    this.fx.shots(m.projectiles);
    // loot
    const loot: LootLike[] = m.loot.map((l) => ({ id: l.id, x: l.x, z: l.z, kind: l.item.kind as TokenKind, rarity: l.item.rarity, age: l.age }));
    this.fx.loot(loot, m.clams, m.motes, this.camera.position, this.ground);
    // the storm and the Gale
    const st = m.storm;
    this.stormOn += (1 - this.stormOn) * Math.min(1, dt * 0.5);
    this.fx.setStorm(st.x, st.z, st.r, this.stormOn, this.sky.flash);
    const galeLeft = m.gale.dur - m.gale.t;
    this.galeOn += ((galeLeft > 0 ? 1 : 0) - this.galeOn) * Math.min(1, dt * (galeLeft > 0 ? 2 : 0.4));
    this.fx.galeOn(this.galeOn);
    // the leviathan's breach
    if (this.breachT >= 0) {
      this.breachT += dt;
      const k = this.breachT / 3.4;
      this.leviathan.breach(m.leviathan.x, m.leviathan.z, this.breachYaw, k, t);
      if (k > 0.9 && k - dt / 3.4 <= 0.9) { this.fx.explode(this.leviathan.root.position.x, 0, this.leviathan.root.position.z, 2, true); this.rig.shake(0.3); }
      if (k >= 1) this.breachT = -1;
    } else if (m.leviathan.state === 'rising') {
      // a glow and a boil of bubbles where it is coming up
      const lv = m.leviathan;
      const k = 1 - lv.t / 20;
      if (Math.random() < dt * 30 * k) {
        const a = Math.random() * TAU, r = Math.random() * 18;
        this.fx.smoke.emit({ x: lv.x + Math.cos(a) * r, y: 0.2, z: lv.z + Math.sin(a) * r, vy: 1, life: 1, size: 0.6, grow: 3, r: 1.3, g: 1.4, b: 1.45, a: 0.6, frame: 3, mode: 2, float: true, fadeIn: 0 });
      }
      this.fx.glow.emit({ x: lv.x, y: 0.15, z: lv.z, life: 0, size: 22 + Math.sin(t * 3) * 2, r: 0.25 * k, g: 0.9 * k, b: 1.4 * k, a: 0.8, frame: 0, mode: 2 });
      this.water.stamp(lv.x, lv.z, 10 + k * 14, 0.2 * k, k);
    }
    // wisps of the lost, rising
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const w = this.wisps[i];
      w.t += dt;
      w.y += dt * (4 + w.t * 6);
      w.x += Math.sin(w.t * 2) * dt * 2;
      this.fx.glow.emit({ x: w.x, y: w.y, z: w.z, life: 0, size: 1.4, r: w.c.r * 6, g: w.c.g * 6, b: w.c.b * 6, frame: 0 });
      this.fx.glow.emit({ x: w.x, y: w.y, z: w.z, vy: -2, life: 0.8, size: 0.5, grow: 0.2, r: w.c.r * 3, g: w.c.g * 3, b: w.c.b * 3, frame: 5, fadeIn: 0 });
      if (w.t > 5) { this.wisps.splice(i, 1); for (let k = 0; k < 30; k++) { const a = Math.random() * TAU; this.fx.glow.emit({ x: w.x, y: w.y, z: w.z, vx: Math.cos(a) * 8, vy: (Math.random() - 0.5) * 8, vz: Math.sin(a) * 8, life: 1, size: 0.3, r: w.c.r * 4, g: w.c.g * 4, b: w.c.b * 4, frame: 5, drag: 2, fadeIn: 0 }); } }
    }
    this.flyGull(m, dt);
    // the camera: yours, or once you are gone, whoever you are watching
    if (!this.free) {
      const w = !me.alive && this.watch >= 0 ? m.ships[this.watch] : me;
      const mode = !w.alive ? 'spectate' : w.phase === 'sea' ? (w === me ? 'sea' : 'spectate') : 'air';
      const tgt = new THREE.Vector3(w.x, w.phase === 'gale' || w.phase === 'glide' ? w.alt + 4 : 4.5 + (w.hop > 0 ? Math.sin((1 - w.hop) * Math.PI) * 2.6 : 0), w.z);
      if (w !== me && w.alive) this.rig.follow(w.heading, dt, 0.8);
      else if (!w.alive) this.rig.yaw += dt * 0.12;
      // riding a current, the view opens out a little
      const [cx, cz] = flowAt(this.world, w.x, w.z, this.cur);
      const along = w.phase === 'sea' && w.alive ? cx * Math.sin(w.heading) + cz * Math.cos(w.heading) : 0;
      this.riding += (Math.min(1, Math.max(0, (along - 1.5) / 4)) - this.riding) * Math.min(1, dt * 2);
      const fov = (w.boostT > 0 ? 9 : w.phase === 'glide' && w.input.dive ? 12 : w.phase === 'gale' ? 6 : 0) + this.riding * 5;
      this.rig.update(this.camera, tgt, mode, this.ground, dt, t, fov);
      this.focus.set(w.x, 0, w.z);
    }
    // the grade: the storm's tint inside it, red at the edges when hurt, a pulse when nearly sunk
    const comp = this.engine.composite.uniforms;
    const outside = st.state !== 'idle' && Math.hypot(this.focus.x - st.x, this.focus.z - st.z) > st.r && this.camera.position.y < 300;
    comp.uStorm.value += ((outside ? 1 : 0) - comp.uStorm.value) * Math.min(1, dt * 3);
    this.hurt = Math.max(0, this.hurt - dt * 1.4);
    comp.uHurt.value = this.hurt;
    comp.uLow.value = me.alive && me.phase === 'sea' && me.hull < 30 ? 1 - me.hull / 30 : 0;
    this.flash = Math.max(0, this.flash - dt * 4);
  }
  private stormOn = 0;
  private galeOn = 0;
  private frames = 0;

  /** Your gull: rides with you, circles the masthead, perches when you sit still, and fetches parcels. */
  private flyGull(m: Match, dt: number): void {
    const me = m.me, g = this.gull;
    const t = this.time;
    let target: THREE.Vector3;
    let mode: 'flap' | 'glide' | 'perch' = 'glide';
    const mast = this.gullHome.set(me.x + Math.sin(me.heading) * SHIP.perch.z, (me.phase === 'sea' ? 0 : me.alt) + SHIP.perch.y, me.z + Math.cos(me.heading) * SHIP.perch.z);
    if (me.gull === 'away') {
      // off to fetch: out and up, then back in low ahead of the bow
      const k = 1 - me.gullT / 3.2;
      const out = new THREE.Vector3(Math.sin(me.heading + 2.4), 0, Math.cos(me.heading + 2.4));
      const fwd = new THREE.Vector3(Math.sin(me.heading), 0, Math.cos(me.heading));
      if (k < 0.5) target = mast.clone().addScaledVector(out, k * 400).setY(mast.y + k * 120);
      else target = mast.clone().addScaledVector(fwd, 16 + me.speed * 1.2).setY(mast.y - 8 + (1 - k) * 100).addScaledVector(out, (1 - k) * 300);
      mode = 'flap';
      g.parcel.visible = k > 0.5;
    } else if (me.phase === 'sea' && me.alive) {
      g.parcel.visible = false;
      if (me.speed < 2) { target = mast; mode = g.pos.distanceTo(mast) < 3 ? 'perch' : 'flap'; }
      else {
        const a = t * 0.5;
        target = mast.clone().add(new THREE.Vector3(Math.cos(a) * 14, -4 + Math.sin(t * 0.7) * 3, Math.sin(a) * 14));
        mode = Math.sin(t * 0.9) > 0.6 ? 'flap' : 'glide';
      }
    } else {
      g.parcel.visible = false;
      target = mast.clone().add(new THREE.Vector3(Math.sin(t * 0.8) * 8, 4, Math.cos(t * 0.8) * 8));
      mode = 'glide';
    }
    const d = target.clone().sub(g.pos);
    const dist = d.length();
    if (mode === 'perch') { g.pos.lerp(target, Math.min(1, dt * 8)); g.vel.set(0, 0, 0); g.heading = me.heading; }
    else {
      const want = d.normalize().multiplyScalar(Math.min(60, 8 + dist * 1.8));
      g.vel.lerp(want, Math.min(1, dt * 2.2));
      g.pos.addScaledVector(g.vel, dt);
      const h = Math.atan2(g.vel.x, g.vel.z);
      const turn = wrap(h - g.heading);
      g.heading += turn * Math.min(1, dt * 5);
      g.bank += (-turn * 1.4 - g.bank) * Math.min(1, dt * 3);
    }
    g.pose(mode, dt);
  }

  // ---------------------------------------------------------------- the harbour

  /** Your ship alone at anchor in the lagoon, the gull on her masthead, the camera drifting round. */
  showcase(look: Look, gull: GullLook): void {
    this.unbind();
    if (this.show) this.fleet.remove(this.show.view);
    const [x, z] = this.world.nav.nearestOpen(HARBOUR.x, HARBOUR.z);
    const view = this.fleet.spawn(look);
    if (this.env) this.fleet.setEnv(this.env.texture);
    this.show = { view, x, z, heading: HARBOUR.heading, orbit: this.show?.orbit ?? 0.6 };
    this.gull.setLook(gull);
    this.gull.parcel.visible = false;
  }

  /** Leaves the harbour for a match. */
  endShowcase(): void {
    if (this.show) this.fleet.remove(this.show.view);
    this.show = null;
  }

  /** A frame of the harbour: the ship riding at anchor, the camera on a slow orbit with her on the right of the frame. */
  idle(dt: number): void {
    const s = this.show;
    if (!s) return;
    const t = this.time;
    s.orbit += dt * 0.035;
    s.view.fade = 0;
    // a breeze from forward of her beam, backing and veering a little
    this.blow(s.heading + 1.9 + Math.sin(t * 0.1) * 0.15);
    const heading = s.heading + Math.sin(t * 0.13) * 0.06;
    s.view.update({ x: s.x, z: s.z, heading, speed: 0.6, turn: Math.sin(t * 0.21) * 0.1, aim: s.heading + 0.4 + Math.sin(t * 0.3) * 0.3, pitch: 0.08, hp: 1, sink: 0, boost: 0, hit: 0, alt: 0, dive: 0, wind: wrap(this.wind - heading) }, t, dt);
    const a = s.heading + 2.1 + Math.sin(s.orbit) * 0.75, r = 46;
    const cam = this.camera;
    if (!this.free) {
    cam.position.set(s.x + Math.sin(a) * r, 6 + Math.sin(s.orbit * 1.3) * 1.2, s.z + Math.cos(a) * r);
    // aim left of the ship so she sits right of centre, clear of the panel, mast and gull in frame
    const rx = Math.cos(a), rz = -Math.sin(a), off = 10 * Math.min(1.4, Math.max(0.8, this.engine.aspect / 1.333));
    cam.lookAt(s.x - rx * off, 10, s.z - rz * off);
    cam.fov = 50;
    this.focus.set(s.x, 0, s.z);
    }
    // the gull perched on the masthead, looking about
    const g = this.gull;
    g.pos.set(s.x + Math.sin(s.heading) * SHIP.perch.z, SHIP.perch.y, s.z + Math.cos(s.heading) * SHIP.perch.z);
    g.vel.set(0, 0, 0);
    g.heading = s.heading + Math.sin(t * 0.7) * 0.8 + Math.sin(t * 2.9) * 0.15;
    g.bank = 0;
    g.pose('perch', dt);
    this.fx.wake(s.x, s.z, s.heading, 0.9, dt);
    this.engine.composite.uniforms.uStorm.value = 0;
    this.engine.composite.uniforms.uHurt.value = 0;
    this.engine.composite.uniforms.uLow.value = 0;
  }

  /** Screen position of a world point, in CSS pixels; null when behind the camera. */
  project(x: number, y: number, z: number, w: number, h: number): [number, number] | null {
    const v = Globe.pos(x, y, z, new THREE.Vector3()).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h];
  }

  frame(dt: number): void {
    this.time += dt;
    U.uTime.value = this.time;
    U.uDrift.value.addScaledVector(U.uWind.value, dt);
    const cam = this.camera;
    cam.aspect = this.engine.aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    Globe.update(this.focus.x, this.focus.z, cam.position.y);
    if ((this.frames++ & 31) === 0) globeShadows(this.scene);
    // regional air: snow over Frost Hollow, embers round Cinder Peak, petals in the blossom country
    const inf = placeInfluence(this.focus.x, this.focus.z);
    const biome = PLACES[inf.i]?.biome;
    const r = this.sky.region;
    const k = inf.k;
    r.snow = biome === 'snow' ? k : 0;
    r.ash = biome === 'volcanic' ? k : 0;
    r.blossom = biome === 'blossom' ? k : 0;
    this.sky.update(dt, cam.position, this.focus);
    this.land.update(this.focus, this.sky.weather.night);
    // smoke is lit by the sun and the sky
    const sun = this.sky.sun, hemi = this.sky.hemi;
    this.light.copy(sun.color).multiplyScalar(sun.intensity / 6).add(new THREE.Color().copy(hemi.color).multiplyScalar(hemi.intensity * 0.5));
    this.fx.update(dt, this.time, this.light, this.focus);
    this.engine.render(this.scene, cam, this.sky.grade, dt, () => {
      this.water.prepare(this.engine.renderer, this.scene, cam, this.focus, this.sky, this.engine.width, this.engine.height, dt);
    });
  }
}
