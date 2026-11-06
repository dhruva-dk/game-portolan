// The studio: the interface's art drawn from the game's own ship in its own materials. A sail colour is her sails in
// that colour, a hull paint her hull lacquered in it, a figurehead her stem carved with it, an emblem her mainsail
// bearing it, a weapon its mount on her deck. One ship stands in a scene of her own under a three-light rig and a
// soft room's reflections; her cloth is the fleet's cloth (a slot of its own, given a steady breeze until it has
// filled and settled), so the canvas in a card is the canvas at sea.
//
// Each shot is drawn into a small multisampled HDR target, carried through the same AgX curve the world's frame is,
// unpremultiplied onto a transparent ground and read back into an image the interface can hold as a URL. Shots are
// taken one a frame, after the frame's own work, so opening the locker never stalls a frame; each is kept by its
// look, so a card is drawn once a session.
import * as THREE from 'three';
import { HalfFloatType, NodeMaterial, PMREMGenerator, QuadMesh, RenderTarget, type Node, type WebGPURenderer } from 'three/webgpu';
import { agxToneMapping, float, max, sRGBTransferOETF, texture, uniform, uv, vec4 } from 'three/tsl';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { R } from '../sim/sphere.ts';
import { ShipModel, type Kit, type Pose } from './actors/caravel.ts';
import { lookOf } from './actors/cosmetics.ts';
import type { CosmeticIds, Weapon } from './actors/view.ts';
import { P } from './gpu/uniforms.ts';
import { everyFrame } from './gpu/work.ts';

/** What a shot frames: the sails, the hull's side, the bow, the mainsail's face, or the gun on its mount. */
export type Framing = 'sails' | 'hull' | 'bow' | 'emblem' | 'gun';

/** Pixels on a side of each shot. */
const SIZE = 256;
/** Frames the cloth is given to fill and settle before the first shot. */
const SETTLE = 40;
/** Shots on a side of the atlas a batch is read back in, and how many are drawn in a frame. */
const TILES = 4;
const PER_FRAME = 4;
/** Where she stands: on the pole, so whatever her shaders work out from the planet's centre comes out right. */
const BASE = new THREE.Vector3(0, R + 0.2, 0);
const BOX = new THREE.Box3(), CENTRE = new THREE.Vector3(), SIZE3 = new THREE.Vector3();

/**
 * How each framing looks at her: which of her parts it fits in the frame (the body's children in the order the model
 * adds them: hull, figurehead, sails, rigging, turret), the way the camera looks from (her own space, bow toward +z,
 * port toward +x), its field, and how much room it leaves round the part.
 */
const FRAMES: Record<Framing, { part: 0 | 1 | 2 | 4; from: THREE.Vector3; fov: number; room: number; min?: number }> = {
  sails: { part: 2, from: new THREE.Vector3(-0.78, 0.16, 0.6), fov: 36, room: 0.84 },
  hull: { part: 0, from: new THREE.Vector3(-0.8, 0.18, 0.56), fov: 32, room: 0.7 },
  bow: { part: 1, from: new THREE.Vector3(-0.8, 0.2, 0.56), fov: 30, room: 1.2, min: 1.1 },
  emblem: { part: 2, from: new THREE.Vector3(-0.95, 0.12, 0.28), fov: 32, room: 0.8 },
  gun: { part: 4, from: new THREE.Vector3(-0.62, 0.48, 0.62), fov: 30, room: 1.1, min: 1.2 },
};

/** A ship at rest on a flat calm, her sails drawing in a steady breeze off the quarter. */
const STILL: Pose = {
  speed: 3, turn: 0, aimYaw: 0.35, aimPitch: 0.08, hp: 1, sink: 0, boost: 0, hit: 0, alt: 0, dive: 0, wind: 0.9, windSpeed: 7,
  night: 0, flip: 0, torn: 0, mast: 'up', flood: 0, listTo: 1, irons: 0, lurch: 0,
};

interface Job { key: string; ids: CosmeticIds; framing: Framing; weapon: Weapon; done: (url: string | null) => void }

export class Studio {
  readonly #renderer: WebGPURenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  readonly #ship: ShipModel;
  readonly #hdr = new RenderTarget(SIZE, SIZE, { type: HalfFloatType, samples: 4 });
  /** Where the shots of a batch are laid side by side, to be read back in one go. */
  readonly #atlas = new RenderTarget(SIZE * TILES, SIZE * TILES);
  #batch: Job[] = [];
  readonly #quad: QuadMesh;
  readonly #exposure = uniform(1);
  readonly #jobs: Job[] = [];
  readonly #shots = new Map<string, Promise<string | null>>();
  /** Frames the cloth has had to fill; the look the ship wears. */
  #settled = 0;
  #worn = '';
  #t = 0;
  readonly #stop: () => void;

  constructor(renderer: WebGPURenderer, kit: Kit) {
    this.#renderer = renderer;
    this.#ship = new ShipModel(kit, lookOf({}));
    const root = this.#ship.root;
    root.matrix.makeTranslation(BASE.x, BASE.y, BASE.z);
    root.matrixWorldNeedsUpdate = true;
    this.#scene.add(root);

    // the rig: a warm key high off the bow quarter, a cool fill from the other side, a rim from behind to cut her out
    const key = new THREE.DirectionalLight(0xfff1dc, 3.2);
    key.position.set(-8, R + 22, 14);
    key.target.position.set(0, R + 4, 0);
    const fill = new THREE.DirectionalLight(0xb9cff0, 0.9);
    fill.position.set(14, R + 8, 4);
    fill.target.position.set(0, R + 4, 0);
    const rim = new THREE.DirectionalLight(0xffe0b0, 2.4);
    rim.position.set(6, R + 12, -18);
    rim.target.position.set(0, R + 4, 0);
    this.#scene.add(key, key.target, fill, fill.target, rim, rim.target, new THREE.HemisphereLight(0xdfe9f5, 0x4a3a2a, 0.5));
    const pmrem = new PMREMGenerator(renderer);
    this.#scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.#scene.environmentIntensity = 0.55;
    this.#scene.background = null;

    // the finish: AgX as the world's frame has it, unpremultiplied over a clear ground and into sRGB
    const hdr = texture(this.#hdr.texture, uv());
    const a = hdr.a as unknown as Node<'float'>;
    const rgb = hdr.rgb.div(max(a, float(1e-4)));
    const finish = new NodeMaterial();
    finish.fragmentNode = vec4(sRGBTransferOETF(agxToneMapping(rgb, this.#exposure)) as unknown as Node<'vec3'>, a);
    this.#quad = new QuadMesh(finish);
    this.#stop = everyFrame(() => this.#tick());
  }

  /** The art for a cosmetic worn on an otherwise plain ship, framed to show it, as an image URL. */
  cosmetic(kind: string, id: string): Promise<string | null> {
    const ids: CosmeticIds = {};
    let framing: Framing = 'sails';
    switch (kind) {
      case 'sailColour': ids.sail = id; framing = 'sails'; break;
      case 'sailPattern': ids.pattern = id; framing = 'sails'; break;
      case 'hullPaint': ids.hull = id; framing = 'hull'; break;
      case 'figurehead': ids.figurehead = id; framing = 'bow'; break;
      case 'emblem': ids.emblem = id; framing = 'emblem'; break;
      default: return Promise.resolve(null);
    }
    return this.#shoot(`${kind}:${id}`, ids, framing, 'cannon');
  }

  /** The art for a weapon: its mount on her deck. */
  weapon(kind: Weapon): Promise<string | null> {
    return this.#shoot(`weapon:${kind}`, {}, 'gun', kind);
  }

  dispose(): void {
    this.#stop();
    this.#ship.dispose();
    this.#hdr.dispose();
    this.#atlas.dispose();
    for (const p of this.#shots.values()) void p.then((u) => u && URL.revokeObjectURL(u));
  }

  #shoot(key: string, ids: CosmeticIds, framing: Framing, weapon: Weapon): Promise<string | null> {
    let shot = this.#shots.get(key);
    if (!shot) {
      shot = new Promise((done) => this.#jobs.push({ key, ids, framing, weapon, done }));
      this.#shots.set(key, shot);
    }
    return shot;
  }

  /** Once a frame: keep her cloth alive while there is work, and once it has filled, shoot a few into the atlas. */
  #tick(): void {
    if (!this.#jobs.length) return;
    const dt = 1 / 30;
    this.#t += dt;
    this.#ship.update(STILL, this.#t, dt, () => 0);
    if (this.#settled < SETTLE) {
      this.#settled++;
      return;
    }
    const r = this.#renderer;
    // the studio is dry, lit and still, whatever the world is doing
    const was = { rain: P.rain.value as number, night: P.night.value as number, flash: P.flash.value as number };
    P.rain.value = 0; P.night.value = 0; P.flash.value = 0;
    const target = r.getRenderTarget(), alpha = r.getClearAlpha(), colour = r.getClearColor(new THREE.Color()), auto = r.autoClear;
    try {
      r.setClearColor(0x000000, 0);
      for (let n = 0; n < PER_FRAME && this.#jobs.length && this.#batch.length < TILES * TILES; n++) {
        const job = this.#jobs.shift()!;
        this.#draw(job, this.#batch.length);
        this.#batch.push(job);
      }
    } finally {
      r.setRenderTarget(target);
      r.setClearColor(colour, alpha);
      r.autoClear = auto;
      P.rain.value = was.rain; P.night.value = was.night; P.flash.value = was.flash;
    }
    // a full atlas, or the last of the work, is read back at once (the copy is queued ahead of anything drawn next)
    if (this.#batch.length === TILES * TILES || !this.#jobs.length) {
      const batch = this.#batch;
      this.#batch = [];
      void this.#read(batch);
    }
  }

  /** Dresses her for a job and draws her into tile `k` of the atlas. */
  #draw(job: Job, k: number): void {
    const r = this.#renderer, f = FRAMES[job.framing], cam = this.#camera;
    const worn = JSON.stringify(job.ids);
    if (worn !== this.#worn) {
      this.#ship.setLook(lookOf(job.ids));
      this.#worn = worn;
    }
    if (job.weapon !== this.#ship.weapon) this.#ship.setWeapon(job.weapon);
    // fit the part's bounding sphere in the field, from the framing's side
    const body = this.#ship.body;
    this.#ship.root.updateMatrixWorld(true);
    const box = BOX.setFromObject(body.children[f.part]);
    const centre = box.getCenter(CENTRE), radius = Math.max(box.getSize(SIZE3).length() / 2, f.min ?? 0);
    const away = (radius * f.room) / Math.sin((f.fov * Math.PI) / 360);
    cam.fov = f.fov;
    cam.position.copy(f.from).normalize().multiplyScalar(away).add(centre);
    cam.lookAt(centre);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    r.autoClear = true;
    r.setRenderTarget(this.#hdr);
    r.render(this.#scene, cam);
    // into its tile, leaving the others be
    this.#atlas.viewport.set((k % TILES) * SIZE, Math.floor(k / TILES) * SIZE, SIZE, SIZE);
    r.setRenderTarget(this.#atlas);
    if (k === 0) r.clear();
    r.autoClear = false;
    this.#quad.render(r);
  }

  /** Reads the atlas back and cuts it into an image for each job in the batch. */
  async #read(batch: Job[]): Promise<void> {
    const side = TILES * SIZE;
    try {
      const px = await this.#renderer.readRenderTargetPixelsAsync(this.#atlas, 0, 0, side, side) as Uint8Array;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SIZE;
      const g = canvas.getContext('2d')!;
      const img = g.createImageData(SIZE, SIZE);
      for (let k = 0; k < batch.length; k++) {
        const x0 = (k % TILES) * SIZE, y0 = Math.floor(k / TILES) * SIZE;
        for (let y = 0; y < SIZE; y++) {
          const from = ((y0 + y) * side + x0) * 4;
          img.data.set(px.subarray(from, from + SIZE * 4), y * SIZE * 4);
        }
        g.putImageData(img, 0, 0);
        const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
        batch[k].done(blob ? URL.createObjectURL(blob) : null);
      }
    } catch {
      for (const job of batch) job.done(null);
    }
  }
}
