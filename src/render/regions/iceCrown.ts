import * as THREE from 'three';
import { illustratedMaterial, type Style } from '../../style/glsl.ts';
import { PIGMENTS } from '../../style/palette.ts';
import { R } from '../../sim/sphere.ts';
import { floesAt, timeOf, type Sea as Waters } from '../../sim/environment.ts';
import { chartTangent, coastAt, heightAt } from '../../sim/world/geography.ts';
import { REGIONS } from '../../sim/world/regions.ts';
import { seas } from '../sea.ts';
import { skies, type Sky } from '../sky.ts';
import { layLighthouses, type Tower } from '../structures.ts';
import type { Riding, Swell } from '../swell.ts';
import { terrains, type Surface, type TerrainField } from '../terrain.ts';
import type { RenderContext, RenderModule } from '../world.ts';
import { chartDir, Draw, Kit, lift, pose, regionSeen, ring, seeded, vec, washOf, type V, type Wash } from './kit.ts';

const RI = REGIONS.findIndex((r) => r.id === 'iceCrown');
const RINGS = REGIONS[RI].mechanics.floes ?? [];
const MARK = REGIONS[RI].landmark;
const PACK = { reach: 70, cakes: 12, fringe: 90, top: 0.1 } as const;
const SKERRY = { reach: 16, near: 4.3, far: 9, spacing: 1.9, seracs: 14, slabs: 240 } as const;
const NIP = 0.8;

const ICE = washOf(PIGMENTS.ultramarine, 0.09), BLUE = washOf(PIGMENTS.ultramarine, 0.24), DEEP = washOf(PIGMENTS.ultramarine, 0.42);
const GROOVE = washOf(PIGMENTS.indigo, 0.6), MELT = washOf(PIGMENTS.verdigris, 0.45), POND = washOf(PIGMENTS.verdigris, 0.3);

function icePaint(water: number, deep: number, grooves: boolean): (c: V, n: V) => Wash {
  return (c, n) => {
    const h = Math.hypot(n.x, n.z), r = Math.hypot(c.x, c.z);
    const out = grooves && h > 0.05 && r > 1e-3 ? (n.x * c.x + n.z * c.z) / (h * r) : 1;
    if (c.y < water) return MELT;
    if (n.y > 0.7) return ICE;
    if (out < 0.5) return GROOVE;
    return c.y < deep ? DEEP : BLUE;
  };
}

interface FloeKit { readonly geometry: THREE.BufferGeometry; readonly spots: readonly (readonly [number, number])[]; readonly berth: readonly [number, number] }

function floeKit(seed: number): FloeKit {
  const rng = seeded(seed), k = 22, top = PACK.top, a0 = rng() * 2 * Math.PI, ph = [rng() * 6.3, rng() * 6.3];
  const rim = Array.from({ length: k }, () => 0.84 + 0.16 * rng()), base = icePaint(0.015, -1, false);
  const pond = (c: V) => Math.hypot(c.x, c.z) < 0.7 && Math.sin(c.x * 6.1 + ph[0]) * Math.sin(c.z * 5.3 + ph[1]) > 0.55;
  const kit = new Kit((c, n) => (n.y > 0.7 && pond(c) ? POND : base(c, n)));
  const at = (s: number, y: number) => ring(k, y, (j) => rim[j] * s);
  kit.loft([at(0.86, -0.32), at(0.96, 0), at(1, 0.035), at(0.98, 0.085), at(0.93, top), at(0.7, top + 0.004), at(0.45, top + 0.007), at(0.2, top + 0.008)]);
  const block = (x: number, z: number, s: number) => {
    const tilt = (rng() - 0.5) * 1.1, h = s * (0.7 + 0.9 * rng()), sink = 0.03 + s * Math.abs(Math.sin(tilt));
    const m = new THREE.Matrix4().makeTranslation(x, top, z).multiply(new THREE.Matrix4().makeRotationY(rng() * 6.3)).multiply(new THREE.Matrix4().makeRotationZ(tilt));
    kit.loft([ring(4, -sink, () => s), ring(4, h, () => s * (0.6 + 0.3 * rng()))].map((r) => r.map((p) => p.applyMatrix4(m))));
  };
  for (let i = -6; i <= 6; i++) {
    const a = a0 + i * 0.15, r = 0.72 + 0.05 * rng();
    block(r * Math.cos(a), r * Math.sin(a), 0.045 + 0.04 * rng());
  }
  const c0 = a0 + 2, c1 = a0 + 3;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, x = 0.74 * ((1 - t) * Math.cos(c0) + t * Math.cos(c1)), z = 0.74 * ((1 - t) * Math.sin(c0) + t * Math.sin(c1));
    block(x + (rng() - 0.5) * 0.05, z + (rng() - 0.5) * 0.05, 0.035 + 0.03 * rng());
  }
  const polar = (a: number, r: number) => [r * Math.cos(a), r * Math.sin(a)] as const;
  return { geometry: kit.build(), spots: [polar(a0 + 1, 0.45), polar(a0 - 0.5, 0.5)], berth: polar(a0 + 4.2, 0.4) };
}

function cakeKit(): THREE.BufferGeometry {
  const rng = seeded(7), k = 9, rim = Array.from({ length: k }, () => 0.85 + 0.15 * rng());
  const at = (s: number, y: number) => ring(k, y, (j) => rim[j] * s);
  return new Kit(icePaint(0.01, -1, false)).loft([at(0.9, -0.22), at(1, 0), at(0.98, 0.11), at(0.86, 0.13), at(0.7, 0.09)]).build();
}

function bergKit(seed: number): THREE.BufferGeometry {
  const rng = seeded(seed), k = 12, tip = rng() * 2 * Math.PI;
  const rad = Array.from({ length: k }, (_, j) => (j % 4 === 1 ? 0.7 : 0.88 + 0.2 * rng()));
  const at = (s: number, y: number, w = 0) => ring(k, y, (j) => rad[j] * s * (1 + w * (rng() - 0.5)));
  const table = ring(k, (_j, x, z) => 0.92 + 0.24 * (x * Math.cos(tip) + z * Math.sin(tip)), (j) => rad[j] * 0.72);
  return new Kit(icePaint(0.03, 0.3, true)).loft([at(0.8, -0.6), at(1, 0), at(0.96, 0.35, 0.12), at(0.86, 0.62, 0.14), table]).build();
}

function seracKit(): THREE.BufferGeometry {
  const rng = seeded(31), k = 8;
  const blade = (s: number) => (j: number) => s * (0.4 + 0.6 * Math.abs(Math.cos((j / k) * 2 * Math.PI))) * (0.9 + 0.2 * rng());
  return new Kit(icePaint(-1, 0.25, false))
    .loft([ring(k, -0.5, blade(0.5)), ring(k, 0, blade(0.5)), ring(k, 0.45, blade(0.42)), ring(k, 0.75, blade(0.3)), ring(k, (_j, x) => 1 + 0.3 * x, blade(0.2))])
    .build();
}

function slabKit(): THREE.BufferGeometry {
  const rng = seeded(43), sq = (y: number, s: number) => ring(4, y, () => s * (0.85 + 0.3 * rng()));
  return new Kit(icePaint(-0.15, 0.1, false)).loft([sq(-0.6, 0.7), sq(0.3, 0.7), sq(0.42, 0.58)]).build();
}

const newSurface = (): Surface => ({ height: 0, normal: vec(), up: 1, ground: 0, region: 0 });

function crownTower(field: TerrainField): Tower {
  const mark = chartDir(RI, MARK.x, MARK.y);
  return layLighthouses(field.geo, field).filter((t) => t.region === RI).reduce((a, b) => (b.up.angleTo(mark) < a.up.angleTo(mark) ? b : a));
}

export function crownOf(field: TerrainField, tower = crownTower(field)): THREE.Matrix4[] {
  const geo = field.geo, S = newSurface(), rng = seeded(17), sites: { p: V; k: number }[] = [];
  for (let x = MARK.x - SKERRY.reach; x <= MARK.x + SKERRY.reach; x += 0.5) {
    for (let y = MARK.y - SKERRY.reach; y <= MARK.y + SKERRY.reach; y += 0.5) {
      const p = chartDir(RI, x, y), d = p.angleTo(tower.up) * R;
      if (d > SKERRY.near && d < SKERRY.far && coastAt(geo, p) < -0.6 && heightAt(geo, p) > 0.6) sites.push({ p, k: rng() });
    }
  }
  const chosen: V[] = [];
  for (const { p } of sites.sort((a, b) => a.k - b.k)) {
    if (chosen.length < SKERRY.seracs && chosen.every((q) => q.angleTo(p) * R > SKERRY.spacing)) chosen.push(p);
  }
  return chosen.map((p) => {
    const d = p.angleTo(tower.up) * R, w = 0.55 + 0.35 * rng();
    const h = (2.4 + 3.4 * (1 - (d - SKERRY.near) / (SKERRY.far - SKERRY.near))) * (0.75 + 0.25 * rng());
    const fwd = vec().subVectors(p, tower.up), side = vec(), q = vec();
    fwd.addScaledVector(p, -fwd.dot(p)).normalize();
    side.crossVectors(p, fwd);
    let low = field.surface(p, 0, S).height;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * 2 * Math.PI;
      q.copy(p).multiplyScalar(R).addScaledVector(fwd, w * Math.cos(a)).addScaledVector(side, w * Math.sin(a)).normalize();
      low = Math.min(low, field.surface(q, 0, S).height);
    }
    return pose(new THREE.Matrix4(), lift(p, low), p, fwd, (rng() - 0.5) * 0.5, 0.12 + 0.2 * rng(), 2 * w, h, 2 * w);
  });
}

function iceFootOf(field: TerrainField, tower: Tower): THREE.Matrix4[] {
  const geo = field.geo, rng = seeded(29), out: THREE.Matrix4[] = [], fwd = vec();
  for (let x = MARK.x - SKERRY.reach; x <= MARK.x + SKERRY.reach; x += 0.7) {
    for (let y = MARK.y - SKERRY.reach; y <= MARK.y + SKERRY.reach; y += 0.7) {
      const p = chartDir(RI, x + (rng() - 0.5) * 0.6, y + (rng() - 0.5) * 0.6), h = heightAt(geo, p);
      if (out.length >= SKERRY.slabs || h < -1.3 || h > 0.45 || p.angleTo(tower.up) * R < 3.6) continue;
      const s = 0.35 + 0.6 * rng();
      chartTangent(RI, p, 0, fwd);
      out.push(pose(new THREE.Matrix4(), lift(p, Math.max(h, 0) - 0.1), p, fwd, rng() * 6.3, 0.15 + 0.6 * rng(), 1.2 * s, (0.5 + 0.6 * rng()) * s, 0.8 * s));
    }
  }
  return out;
}

function groundedOf(field: TerrainField): THREE.Matrix4[] {
  const geo = field.geo, S = newSurface(), rng = seeded(13), tops: { p: V; h: number }[] = [];
  for (let x = -56; x <= 56; x += 1) {
    for (let y = -56; y <= 56; y += 1) {
      if (Math.hypot(x, y) > 56 || Math.hypot(x - MARK.x, y - MARK.y) < SKERRY.reach) continue;
      const p = chartDir(RI, x, y), h = heightAt(geo, p);
      if (h > 1) tops.push({ p, h });
    }
  }
  const out: THREE.Matrix4[] = [], seen: V[] = [], fwd = vec(), side = vec(), q = vec();
  for (const { p } of tops.sort((a, b) => b.h - a.h)) {
    if (seen.some((o) => o.angleTo(p) * R < 7)) continue;
    seen.push(p);
    chartTangent(RI, p, 0, fwd);
    side.crossVectors(p, fwd);
    let reach = 0, high = field.surface(p, 0, S).height;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 2 * Math.PI;
      let r = 0.4;
      for (; r < 8; r += 0.4) {
        q.copy(p).multiplyScalar(R).addScaledVector(fwd, r * Math.cos(a)).addScaledVector(side, r * Math.sin(a)).normalize();
        if (heightAt(geo, q) < 0) break;
        high = Math.max(high, field.surface(q, 0, S).height);
      }
      reach = Math.max(reach, r);
    }
    out.push(pose(new THREE.Matrix4(), lift(p, 0), p, fwd, rng() * 6.3, 0.06 + 0.1 * rng(), 1.1 * reach, (high + 1.2) / 0.7, 1.1 * reach));
  }
  return out;
}

interface HaulOut { readonly floe: number; readonly x: number; readonly z: number }

export class IceCrown {
  readonly group = new THREE.Group();
  readonly haulOuts: readonly HaulOut[];
  onGrind: ((at: V, strength: number) => void) | null = null;
  private readonly style: Style;
  private readonly sky: Sky;
  private readonly swell: Swell;
  private readonly waters: Waters;
  private readonly material: THREE.ShaderMaterial;
  private readonly floeDraws: Draw[];
  private readonly cakes: Draw;
  private readonly bergs: Draw;
  private readonly draws: Draw[];
  private readonly grounded: THREE.Matrix4[];
  private readonly poses: THREE.Matrix4[];
  private readonly fringe: THREE.Matrix4[][];
  private readonly carried: (THREE.Matrix4 | null)[];
  private readonly gaps: Float32Array;
  private readonly pole = chartDir(RI, 0, 0);
  private readonly ride: Riding = { position: vec(), up: vec() };
  private readonly at = vec();
  private readonly fwd = vec();
  private readonly m = new THREE.Matrix4();

  constructor(style: Style, field: TerrainField, swell: Swell, sky: Sky) {
    const geo = field.geo, floes = geo.floes, rng = seeded(3), tower = crownTower(field);
    this.style = style;
    this.sky = sky;
    this.swell = swell;
    this.waters = { geo } as unknown as Waters;
    this.material = illustratedMaterial(style, { pigment: PIGMENTS.leadWhite, painted: true, anchor: 'object', side: THREE.DoubleSide });
    const kits = [floeKit(11), floeKit(23)];
    this.floeDraws = kits.map((k) => new Draw(k.geometry, this.material, floes.length));
    this.cakes = new Draw(cakeKit(), this.material, floes.length * PACK.cakes);
    this.grounded = groundedOf(field);
    this.bergs = new Draw(bergKit(5), this.material, this.grounded.length + floes.length);
    const crown = new Draw(seracKit(), this.material, SKERRY.seracs).fill(crownOf(field, tower));
    const foot = new Draw(slabKit(), this.material, SKERRY.slabs).fill(iceFootOf(field, tower));
    this.draws = [...this.floeDraws, this.cakes, this.bergs, crown, foot];
    this.group.add(...this.draws.map((d) => d.mesh));
    this.poses = floes.map(() => new THREE.Matrix4());
    this.fringe = floes.map((f) => Array.from({ length: PACK.cakes }, (_, j) => {
      const s = 0.3 + 0.45 * rng(), a = ((j + 0.6 * rng()) / PACK.cakes) * 2 * Math.PI, d = (f.size + 0.15 + s + 0.7 * rng()) / f.size;
      return new THREE.Matrix4().makeTranslation(d * Math.cos(a), 0, d * Math.sin(a)).multiply(new THREE.Matrix4().makeRotationY(rng() * 6.3))
        .scale(vec(s / f.size, s / f.size, s / f.size));
    }));
    this.carried = floes.map((f, k) => {
      if (k % 3 !== 1) return null;
      const [x, z] = kits[k % 2].berth, h = 1.4 + 1.4 * rng(), s = 0.3 + 0.08 * rng();
      return new THREE.Matrix4().makeTranslation(x, PACK.top - 0.02, z).multiply(new THREE.Matrix4().makeRotationY(rng() * 6.3))
        .multiply(new THREE.Matrix4().makeRotationX(0.18 + 0.16 * rng())).scale(vec(s, h / f.size, s));
    });
    this.haulOuts = floes.flatMap((_, k) => kits[k % 2].spots.map(([x, z]) => ({ floe: k, x, z })));
    this.gaps = new Float32Array(floes.length).fill(Infinity);
  }

  update(eye: V, t: number, clock: number): void {
    const far = this.pole.angleTo(this.at.copy(eye).normalize()) * R;
    this.sky.setAurora(this.style.palette.night * THREE.MathUtils.clamp((200 - far) / 110, 0, 1));
    this.group.visible = regionSeen(RI, eye, PACK.reach);
    if (!this.group.visible) return;
    const floes = this.waters.geo.floes, at = floesAt(this.waters, t), live = [...this.floeDraws, this.cakes, this.bergs];
    for (const d of live) d.begin();
    for (const m of this.grounded) this.bergs.add(m);
    for (let k = 0; k < floes.length; k++) {
      const f = floes[k];
      this.at.set(at[k].x, at[k].y, at[k].z);
      chartTangent(RI, this.at, 0, this.fwd);
      this.swell.ride(this.at, this.fwd, 2 * f.size, 2 * f.size, clock, this.ride);
      const p = pose(this.poses[k], this.ride.position, this.ride.up, this.fwd, f.angle + RINGS[f.ring].speed * t + k * 1.7, 0, f.size);
      this.floeDraws[k % 2].add(p);
      if (eye.distanceTo(this.ride.position) < PACK.fringe) for (const c of this.fringe[k]) this.cakes.add(this.m.multiplyMatrices(p, c));
      const b = this.carried[k];
      if (b) this.bergs.add(this.m.multiplyMatrices(p, b));
    }
    for (const d of live) d.end();
    if (this.onGrind) this.grind(at);
  }

  haulOutAt(i: number, out: V): V {
    const h = this.haulOuts[i];
    return out.set(h.x, PACK.top, h.z).applyMatrix4(this.poses[h.floe]);
  }

  get triangles(): number {
    return this.group.visible ? this.draws.reduce((s, d) => s + d.triangles, 0) : 0;
  }

  dispose(): void {
    this.material.dispose();
    for (const d of this.draws) d.mesh.geometry.dispose();
  }

  private grind(at: ReturnType<typeof floesAt>): void {
    const floes = this.waters.geo.floes;
    for (let k = 0; k < floes.length; k++) {
      let gap = Infinity, nip = k;
      for (let j = 0; j < floes.length; j++) {
        if (Math.abs(floes[j].ring - floes[k].ring) !== 1) continue;
        const d = R * Math.acos(Math.min(1, at[k].x * at[j].x + at[k].y * at[j].y + at[k].z * at[j].z)) - floes[k].size - floes[j].size;
        if (d < gap) {
          gap = d;
          nip = j;
        }
      }
      if (gap < NIP && this.gaps[k] >= NIP) {
        this.fwd.set(at[k].x + at[nip].x, at[k].y + at[nip].y, at[k].z + at[nip].z).normalize().multiplyScalar(R);
        this.onGrind?.(this.fwd, 1 - Math.max(gap, 0) / NIP);
      }
      this.gaps[k] = gap;
    }
  }
}

export function createIceCrown(ctx: RenderContext): RenderModule {
  const sea = seas.get(ctx.scene), sky = skies.get(ctx.scene), terrain = terrains.get(ctx.scene);
  if (!sea || !sky || !terrain) throw new Error('createIceCrown: the sea, sky and terrain are built first (MODULES order)');
  const ice = new IceCrown(ctx.pipeline.style, terrain.field, sea.swell, sky);
  ctx.scene.add(ice.group);
  return {
    frame(f) {
      ice.update(ctx.camera.position, timeOf(f.state), ctx.pipeline.style.uniforms.uTime.value);
    },
    dispose() {
      ctx.scene.remove(ice.group);
      ice.dispose();
    },
  };
}
