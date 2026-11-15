// The rookery's view: the crew's campus (world/rookery.ts) seen from over it, as plain data for the frame (snapshot.ts).
//
// The eye orbits a point: over the whole campus, seen from orbit (the space eye) a few hundred metres out; or, a
// building selected, that building, from out over the sea in front of it, close enough to see it in the air (the air
// eye: under 160 m the space eye's near plane would cut the sea away). The look's drag turns the orbit round its
// point and tilts it; a selection eases the eye to its building, critically damped, and back out again.
//
// The crew's two ships lie at the quay's berths in its colours, riding the sea as it is there (sim/ride.ts moored).
//
// Pure: no DOM, no three.

import type { CampusDraw, Eye, Look, ShipDraw, Snapshot } from '../snapshot.ts';
import { moored } from '../sim/ride.ts';
import { BUILDINGS, TALL, type Building, type Campus, type Rookery } from '../world/rookery.ts';
import { add, altitude, chartBasis, dot, frameAt, normalize, place, scale, type Vec3 } from '../world/sphere.ts';
import type { Hull } from '../world/swell.ts';
import { lookingAt } from '../snapshot.ts';
import { swatch } from './colours.ts';
import { onScreen, type Point } from './lens.ts';

/** The orbit: over the whole campus (its distance from the point it turns round, metres, and its tilt over the
 *  horizon, radians, at first and at its least and most); over a selected building (its distance past the building's
 *  size, and its tilt); how fast the drag turns it (radians per px), and how fast the eye eases (1/s); under what
 *  height the eye is in the air; its field of view, degrees. */
export const VIEW = {
  over: { distance: 340, tilt: 0.9, tilts: [0.35, 1.4] },
  near: { distance: 46, tilt: 0.36, tilts: [0.12, 1.2] },
  turn: 0.006, ease: 3.2, air: 160, fov: 40,
} as const;

/** A building's anchor on the screen: where the UI marks it and a tap picks it (CSS px). */
export interface Anchor extends Point { building: Building }

interface Orbit { focus: Vec3; yaw: number; tilt: number; distance: number }

/** Where an orbit puts the eye: `distance` out from its focus, toward the bearing `yaw` (clockwise from north there),
 *  `tilt` up over the horizon, looking at it. */
function eyeOf(o: Orbit): Eye {
  const { up, north, east } = frameAt(o.focus);
  const out = add(scale(north, Math.cos(o.yaw)), east, Math.sin(o.yaw));
  const position = add(add(o.focus, out, o.distance * Math.cos(o.tilt)), up, o.distance * Math.sin(o.tilt));
  return {
    kind: altitude(position) > VIEW.air ? 'space' : 'air', position, fov: VIEW.fov,
    orientation: lookingAt(position, o.focus, normalize(position)),
  };
}

/** The bearing of a tangent `t` at p, clockwise from north. */
const bearingOf = (p: Vec3, t: Vec3) => {
  const { north, east } = frameAt(p);
  return Math.atan2(dot(t, east), dot(t, north));
};

/** The rookery's view of `campus`, its sea read through `sea` (world/swell.ts: for the ships at the quay). */
export function createRookeryView(campus: Campus, sea: Hull) {
  let crew: Rookery | null = null, draw: CampusDraw | null = null, selected: Building | null = null;
  // the orbit the eye eases toward, the drag's turn added; and where the eye is now
  const wanted: Orbit = { focus: place(campus.centre, 8), yaw: 0, tilt: VIEW.over.tilt, distance: VIEW.over.distance };
  const now: Orbit = { ...wanted };
  const plotOf = (b: Building) => campus.plots[BUILDINGS.indexOf(b)];
  /** A building's height now (or as under way, its next level's), metres. */
  const tallOf = (b: Building) => {
    const level = (crew?.levels[b] ?? 0) + (crew?.under[b] ? 1 : 0);
    return TALL[b][Math.max(1, Math.min(3, level)) - 1];
  };
  const pointOf = (b: Building) => {
    const p = plotOf(b);
    return { at: p.chart.at, up: p.top + tallOf(b) * 0.5 };
  };
  const ships = (clock: number): ShipDraw[] => {
    if (!crew) return [];
    const paint = swatch(crew.colours.first), sail = swatch(crew.colours.second);
    return campus.berths.map((b, id) => {
      const look: Look = { paint, sail, pattern: id === 0 ? 'plain' : 'band' };
      return { id, pose: moored(b.at, b.heading, sea, clock), look, velocity: [0, 0, 0], afloat: true, gun: null };
    });
  };

  return {
    /** Shows a crew's rookery (and again whenever any of it changes). */
    show(r: Rookery) {
      crew = r;
      draw = {
        levels: BUILDINGS.map((b) => r.levels[b] ?? 0),
        rising: BUILDINGS.map((b) => (r.under[b] ? r.under[b].share : null)),
        first: swatch(r.colours.first), second: swatch(r.colours.second), emblem: r.emblem,
      };
    },
    /** Selects a building, the eye easing to it; null: back out over the whole campus. */
    select(b: Building | null) {
      selected = b;
      if (b === null) {
        Object.assign(wanted, { focus: place(campus.centre, 8), tilt: VIEW.over.tilt, distance: VIEW.over.distance });
        return;
      }
      const p = plotOf(b), seaward = chartBasis(p.chart, p.chart.at)[1], { at, up } = pointOf(b);
      Object.assign(wanted, {
        focus: place(at, up), yaw: bearingOf(at, seaward), tilt: VIEW.near.tilt,
        distance: VIEW.near.distance + 1.4 * Math.max(p.half, (p.back + p.front) / 2) + tallOf(b) * 0.9,
      });
    },
    get selected() { return selected; },
    /** The look's drag this frame (px right and down): turns the orbit round its point and tilts it. */
    look(x: number, y: number) {
      const [low, high] = selected ? VIEW.near.tilts : VIEW.over.tilts;
      wanted.yaw -= x * VIEW.turn;
      wanted.tilt = Math.min(high, Math.max(low, wanted.tilt + y * VIEW.turn));
    },
    /** The eye eased dt seconds toward where it is wanted. */
    step(dt: number) {
      const k = 1 - Math.exp(-dt * VIEW.ease);
      // (the turn the short way round)
      const turn = Math.atan2(Math.sin(wanted.yaw - now.yaw), Math.cos(wanted.yaw - now.yaw));
      now.yaw += turn * k;
      now.tilt += (wanted.tilt - now.tilt) * k;
      now.distance += (wanted.distance - now.distance) * k;
      now.focus = add(now.focus, add(wanted.focus, now.focus, -1), k);
    },
    /** The rookery as the frame draws it, at the world's clock (s). */
    snapshot(clock: number): Snapshot {
      return {
        eye: eyeOf(now), clock, storm: { centre: campus.centre, radius: Math.PI }, ships: ships(clock), own: null,
        balls: [], loot: [], blasts: [], ...(draw ? { campus: draw } : {}),
      };
    },
    /** Each building standing or under way, where it falls on a view `width` × `height` px (none off the screen). */
    anchors(width: number, height: number): Anchor[] {
      const eye = eyeOf(now), out: Anchor[] = [];
      for (const b of BUILDINGS) {
        if (!crew || ((crew.levels[b] ?? 0) === 0 && !crew.under[b])) continue;
        const { at, up } = pointOf(b), p = onScreen(eye, at, width, height, up);
        if (p) out.push({ building: b, x: p.x, y: p.y });
      }
      return out;
    },
    /** The buildings under way, where their days-left labels go (over each one's top), and the days left. */
    labels(width: number, height: number): (Point & { building: Building; days: number })[] {
      const eye = eyeOf(now), out: (Point & { building: Building; days: number })[] = [];
      for (const b of BUILDINGS) {
        const u = crew?.under[b];
        if (!u) continue;
        const p = onScreen(eye, plotOf(b).chart.at, width, height, plotOf(b).top + tallOf(b) + 3);
        if (p) out.push({ building: b, days: u.days, ...p });
      }
      return out;
    },
  };
}

export type RookeryView = ReturnType<typeof createRookeryView>;
