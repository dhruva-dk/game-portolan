import * as THREE from 'three';
import { tideOf } from '../sim/environment.ts';
import { R } from '../sim/sphere.ts';
import type { MatchState } from '../sim/state.ts';
import { newStormView, stormView } from '../sim/storm.ts';
import type { Style } from '../style/glsl.ts';
import { seas, type Sea } from './sea.ts';
import { airOf, CURTAIN, Curtains, Lightning, setSight, weatherUniforms, type Air } from './weather.ts';
import type { RenderContext, RenderModule } from './world.ts';

export const STORM_LOOK = { wall: 46, bruise: 16, tower: 64, loom: 150, front: 16, period: 2.6 };

export class Storm {
  readonly group = new THREE.Group();
  readonly u = weatherUniforms();
  readonly walls: Curtains;
  readonly fronts: Curtains;
  readonly lightning: Lightning;
  private readonly view = newStormView();
  private readonly at = new THREE.Vector3();
  private readonly tan = new THREE.Vector3();
  private readonly sea: Sea | null;
  private rho = 0;
  private grade = 0;

  constructor(style: Style, sea: Sea | null) {
    this.sea = sea;
    this.walls = new Curtains(style, CURTAIN.storm, 1, 320, 10, this.u, THREE.DoubleSide, 2);
    this.fronts = new Curtains(style, CURTAIN.front, 1, 320, 4, this.u, THREE.DoubleSide, 2);
    this.lightning = new Lightning(style, 29);
    this.group.add(this.walls.mesh, this.fronts.mesh, this.lightning.mesh);
  }

  get triangles(): number {
    return this.walls.triangles + this.fronts.triangles;
  }

  get storm(): number {
    return this.grade;
  }

  frame(air: Air, state: MatchState, clock: number, dt: number): void {
    const u = this.u, v = stormView(state, this.view), c = v.calm, foot = air.foot, at = this.at;
    u.uSeaR.value = R + tideOf(state);
    u.uWindT.value.copy(air.toward).multiplyScalar(air.strength);
    setSight(u, air);
    at.set(-c.at.x, -c.at.y, -c.at.z);
    this.rho = Math.PI - c.r;
    const bruise = this.rho * R < STORM_LOOK.bruise;
    this.walls.begin();
    if (bruise) {
      const apart = Math.acos(Math.max(-1, Math.min(1, foot.dot(at)))) * R;
      if (apart > STORM_LOOK.loom) {
        const t = this.tan.copy(at).addScaledVector(foot, -foot.dot(at)).normalize(), a = STORM_LOOK.loom / R;
        at.copy(foot).multiplyScalar(Math.cos(a)).addScaledVector(t, Math.sin(a));
      }
      this.rho = STORM_LOOK.bruise / R;
      this.walls.add(at, this.rho, STORM_LOOK.tower, 1, 0.37);
    } else this.walls.add(at, this.rho, STORM_LOOK.wall, 1, 0.37);
    this.walls.end();
    this.fronts.begin();
    if (v.announced && v.toMove > 0) this.fronts.add({ x: -v.next.at.x, y: -v.next.at.y, z: -v.next.at.z }, Math.PI - v.next.r, STORM_LOOK.front, 0.75, 0.71);
    this.fronts.end();
    this.sea?.setStorm(c.at, c.cos);
    const near = Math.abs(Math.acos(Math.max(-1, Math.min(1, foot.dot(at)))) - this.rho) * R < 260;
    this.lightning.update(clock, STORM_LOOK.period, near ? (pick, base, up) => {
      const t = this.tan.copy(foot).addScaledVector(at, -foot.dot(at));
      if (t.lengthSq() < 1e-9) t.set(at.y, -at.x, 0.3);
      t.normalize().applyAxisAngle(at, (pick - 0.5) * 0.9);
      const rho = this.rho + (bruise ? 0 : 2 / R);
      up.copy(at).multiplyScalar(Math.cos(rho)).addScaledVector(t, Math.sin(rho)).normalize();
      base.copy(up).multiplyScalar(u.uSeaR.value);
      return (bruise ? STORM_LOOK.tower : STORM_LOOK.wall) * 0.8;
    } : null);
    u.uFlash.value = this.lightning.flash;
    this.grade += (0.85 * air.storm - this.grade) * (1 - Math.exp(-dt / 1.5));
  }

  dispose(): void {
    this.walls.dispose();
    this.fronts.dispose();
    this.lightning.dispose();
  }
}

export const storms = new WeakMap<THREE.Object3D, Storm>();

export function createStorm(ctx: RenderContext): RenderModule {
  const storm = new Storm(ctx.pipeline.style, seas.get(ctx.scene) ?? null);
  storms.set(ctx.scene, storm);
  ctx.scene.add(storm.group);
  return {
    frame(f) {
      storm.frame(airOf(ctx.scene).update(ctx.world, f.state, ctx.camera.position), f.state, f.clock, f.dt);
      ctx.pipeline.storm = storm.storm;
    },
    dispose() {
      ctx.scene.remove(storm.group);
      storms.delete(ctx.scene);
      ctx.pipeline.storm = 0;
      storm.dispose();
    },
  };
}
