// Views for the actors and the stage when no match is running: a fixed scene from the hook or the capture tools, and
// the lobby, where the player's ship sits on the water wearing their cosmetics.
import type { AmbienceMix, RegionId } from '../audio/index.ts';
import type { ActorsView, CosmeticIds, ShipView } from '../render/actors/index.ts';
import type { Look } from '../career/index.ts';
import { R } from '../sim/sphere.ts';
import { REGION_COUNT, REGIONS, heightAt, regionWeights } from '../sim/world/index.ts';
import type { V3 } from '../sim/math.ts';
import type { StageView } from '../render/stage.ts';
import { latLonOf, travel, type SceneSpec } from './scenes.ts';

/** The career's look as the actors' cosmetic ids. */
export const cosmeticsOf = (look: Look): CosmeticIds => ({
  sail: look.sailColour, pattern: look.sailPattern, hull: look.hullPaint, figurehead: look.figurehead, emblem: look.emblem, wake: look.wake,
});

const scale = (v: V3, k: number): V3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const across = (p: V3, t: V3): V3 => ({ x: p.y * t.z - p.z * t.y, y: p.z * t.x - p.x * t.z, z: p.x * t.y - p.y * t.x });

/**
 * Where a scene's fleet sails: n ships spread from 60 to 220 m ahead, each off to one side or the other so the middle of
 * the view stays clear, on water deep enough to float, sailing across the view so their hulls show. Spots on land are
 * left empty.
 */
function fleetOf(s: SceneSpec, look: CosmeticIds): ShipView[] {
  const out: ShipView[] = [], n = s.fleet ?? 0;
  for (let k = 0; k < n; k++) {
    const ahead = travel(s.pos, s.heading, 60 + (160 * k) / Math.max(1, n - 1));
    for (const side of k % 2 ? [-1, 1] : [1, -1]) {
      const at = travel(ahead.pos, across(ahead.pos, ahead.heading), side * (26 + 12 * k));
      if (heightAt(at.pos) > -3) continue;
      const head = travel(at.pos, across(at.pos, ahead.heading), 1).heading;
      out.push({
        id: 1 + k, pos: scale(at.pos, R), head: k % 2 ? scale(head, -1) : head, speed: 8, turn: 0, hull: 1, shield: 0, shieldMax: 100,
        weapon: 'cannon', cosmetics: look, alive: true,
      });
      break;
    }
  }
  return out;
}

/** A lone ship (or none) at a scene's spot. */
export function sceneActors(s: SceneSpec, time: number, sun: V3, look: CosmeticIds, speed = 0): ActorsView {
  const ships: ShipView[] = s.ship ? [{
    id: 0, pos: scale(s.pos, R), head: s.heading, speed, turn: 0, hull: 1, shield: 0, shieldMax: 100, weapon: 'cannon',
    cosmetics: look, alive: true,
  }] : [];
  ships.push(...fleetOf(s, look));
  // a steady breeze from behind the ship's port quarter
  const wind = { x: s.heading.x * 6, y: s.heading.y * 6, z: s.heading.z * 6 };
  return { time, sun, seaLevel: s.tide, wind, player: s.ship ? 0 : -1, ships, projectiles: [], loot: [], whales: [] };
}

const WEIGHTS = new Float64Array(REGION_COUNT);

/** A fixed scene as the ear hears it: the regions at the spot, its weather, a fair breeze, and the night by the hour. */
export function sceneHearing(s: SceneSpec, speed = 0): AmbienceMix {
  regionWeights(s.pos, WEIGHTS);
  const regions: Partial<Record<RegionId, number>> = {};
  for (let i = 0; i < REGION_COUNT; i++) if (WEIGHTS[i] > 0.01) regions[REGIONS[i].id] = WEIGHTS[i];
  return {
    regions, weather: s.weather === 'clear' ? {} : { [s.weather]: 1 }, nearSurf: 0, wind: 1, speed, rough: 1, altitude: 0, storm: 0,
    night: Math.min(1, Math.max(0, (Math.abs(s.hour - 12) - 6) / 1.5)), vortex: 0, afloat: s.ship,
  };
}

/** The planet's hour (at longitude 0) when it is `local` o'clock at p. */
export const planetHour = (p: V3, local: number): number => (((local - latLonOf(p).lon / 15) % 24) + 24) % 24;

/** A fixed scene as the stage draws it: no Storm, no territory, and the scene's weather standing over the spot. */
export function sceneStage(s: SceneSpec, time: number): StageView {
  return {
    time, hour: planetHour(s.pos, s.hour), tilt: s.tilt, tide: s.tide, wind: scale(s.heading, 6), camera: s.camera,
    target: { pos: s.pos, heading: s.heading, height: s.height ?? (s.ship ? 2.5 : 0) },
    weather: s.weather === 'clear' ? [] : [{ kind: s.weather, at: s.pos, radius: 220, strength: 1 }],
    storm: null, territory: null,
  };
}
