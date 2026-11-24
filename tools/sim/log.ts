// The record of a match as it is sailed: every event a step makes, stamped
// with its step (events.jsonl), and every ship afloat once a second
// (ships.jsonl). Beside the account (metrics.ts), which sums the match up, this
// is what happened, line by line, for an agent to search. Also kept here: the
// invariants checked each step (a break is an event and fails the run), the
// time each kill took, and what each part of a step cost.
//
// Places are [latitude, longitude] in degrees (on a planet of R = 554 m a
// degree is about 9.7 m), headings and bearings in degrees (0 north, 90 east;
// a bearing off her bow, + to starboard), ranges and the storm's radius in
// metres along the surface, times in seconds of the match's clock. A kill's
// time (ttk, a sinking's `fight`) runs from the killer's first ball home on
// her, not a ram.
//
// Node only (tools/).

import { debugOf, PARTS, type Part } from '../../src/play/state.ts';
import { STEP } from '../../src/sim/fixed.ts';
import { GUNS } from '../../src/sim/handling.ts';
import { isArms } from '../../src/sim/loot.ts';
import {
  cross,
  distance,
  dot,
  frameAt,
  R,
  toward,
  type Vec3,
} from '../../src/world/sphere.ts';
import type { Lines } from '../out.ts';
import type { State } from './match.ts';

type Stepped = ReturnType<State['advance']>;

const r1 = (x: number) => Math.round(x * 10) / 10,
  r2 = (x: number) => Math.round(x * 100) / 100,
  r4 = (x: number) => Math.round(x * 1e4) / 1e4,
  deg = (rad: number) => (rad * 180) / Math.PI;

/** A unit vector as [latitude, longitude], degrees. */
export const latLon = (p: Vec3): [number, number] => [
  r4(deg(Math.asin(Math.max(-1, Math.min(1, p[1]))))),
  r4(deg(Math.atan2(-p[2], p[0]))),
];

/** A heading at `at` as a compass bearing, degrees. */
const compass = (at: Vec3, h: Vec3) => {
  const f = frameAt(at);
  return r1((deg(Math.atan2(dot(h, f.east), dot(h, f.north))) + 360) % 360);
};

/** Where `to` lies off the bow of a ship at `at` heading `h`: degrees, + to starboard. */
const offBow = (at: Vec3, h: Vec3, to: Vec3) => {
  const d = toward(at, to);
  if (!d) return 0;
  return r1(deg(Math.atan2(dot(d, cross(h, at)), dot(d, h))));
};

/** A part's cost over the steps, ms. */
export interface Cost {
  median: number;
  p95: number;
  worst: number;
  mean: number;
}
const costOf = (xs: readonly number[]): Cost => {
  const s = [...xs].sort((a, b) => a - b),
    n = s.length;
  if (!n) return { median: 0, p95: 0, worst: 0, mean: 0 };
  const q = (f: number) => r4(s[Math.min(n - 1, Math.floor(f * (n - 1)))]);
  return {
    median: q(0.5),
    p95: q(0.95),
    worst: r4(s[n - 1]),
    mean: r4(s.reduce((a, b) => a + b, 0) / n),
  };
};

/** An invariant broken: what, and on which ship. */
export interface Break {
  t: number;
  step: number;
  what: string;
  ship: number | null;
  detail: string;
}

/**
 * A record kept of `state` (begun, not yet stepped) into `events` and
 * `ships`, or nowhere if they are null. `height`: the planet's ground above the
 * sea, m (a ship's middle over ground above 0 is on land). `brainOf` names
 * each ship's brain.
 */
export function record(
  state: State,
  height: (p: Vec3) => number,
  brainOf: (id: number) => string,
  events: Lines | null,
  ships: Lines | null
) {
  let step = 0;
  const t = () => r2(state.time());
  const emit = (type: string, e: Record<string, unknown>) =>
    events?.write({ t: t(), step, type, ...e });
  const where = (id: number) =>
    state.vessels().find((v) => v.id === id) ?? null;

  // what each bot last showed: her mode, her foe, the loot she makes for
  const minds = new Map<number, { mode: string; foe: number; loot: number }>();
  // the stores in use: what, since when, and her health then
  const using = new Map<
    number,
    { item: string | null; t: number; hull: number; shield: number }
  >();
  // the storm as last logged
  let storm = { phase: -1, closing: false, final: false };
  let sunk = 0,
    laid = state.loot().next,
    alive = state.alive().length,
    last = state.time();
  // when each ship first struck each other: `${by}>${on}`
  const firstBlow = new Map<string, number>();
  const ttk: { by: number; on: number; seconds: number }[] = [];
  const breaks: Break[] = [];
  let broken = 0;
  // ships logged on land, so an episode is one event
  const onLand = new Set<number>();
  // the part laps: times per part, and the step's whole
  const parts = new Map<Part | 'step', number[]>(
    [...PARTS, 'step' as const].map((k) => [k, []])
  );
  let mark = 0,
    began = 0;

  const fail = (what: string, ship: number | null, detail: string) => {
    broken++;
    const b = { t: t(), step, what, ship, detail };
    if (breaks.length < 100) breaks.push(b);
    emit('invariant', { what, ship, detail });
  };

  const start = (seed: number, type: string, rules: unknown) =>
    emit('start', {
      seed,
      matchType: type,
      rules,
      ships: state.ships().map((k) => {
        const v = where(k.id),
          n = debugOf(state).natureOf(k.id),
          c = state.crew(k.id);
        return {
          id: k.id,
          brain: brainOf(k.id),
          persona: n?.persona ?? null,
          skill: n ? r2(n.temper.skill) : null,
          at: v ? latLon(v.ship.at) : null,
          heading: v ? compass(v.ship.at, v.ship.heading) : null,
          hull: r1(k.hull),
          shield: r1(k.shield),
          guns: c.guns.map((g) => g && { kind: g.kind, rarity: g.rarity }),
        };
      }),
    });

  return {
    start,
    /** Hand this to advance as its `lap`. */
    lap(part: Part) {
      const now = performance.now();
      parts.get(part)!.push(now - mark);
      mark = now;
    },
    /** Call just before a step. */
    before() {
      began = mark = performance.now();
    },
    /** Call with what a step did, just after it. */
    after(did: Stepped) {
      parts.get('step')!.push(performance.now() - began);
      step++;
      const now = state.time();

      for (const s of did.shots) {
        const v = where(s.shooter),
          c = state.crew(s.shooter),
          g = c.guns[c.hand],
          to = s.target === null ? null : where(s.target);
        emit('shot', {
          ship: s.shooter,
          gun: s.gun,
          rarity: g?.rarity ?? null,
          rounds: g?.rounds ?? null,
          pellets: GUNS[s.gun].pellets,
          target: s.target,
          range: v && to ? r1(distance(v.ship.at, to.ship.at)) : null,
          bearing:
            v && to ? offBow(v.ship.at, v.ship.heading, to.ship.at) : null,
          mode: debugOf(state).mindOf(s.shooter)?.mode ?? null,
        });
      }
      for (const s of did.strikes) {
        const key = `${s.shooter}>${s.struck}`;
        if (!s.ram && !firstBlow.has(key)) firstBlow.set(key, now);
        const by = where(s.shooter),
          on = where(s.struck),
          h = state.crew(s.struck)?.health;
        emit('hit', {
          by: s.shooter,
          on: s.struck,
          damage: r2(s.damage),
          shield: r2(s.shield),
          hull: r2(s.hull),
          broke: s.broke,
          ram: s.ram,
          gun: s.gun,
          range: by && on ? r1(distance(by.ship.at, on.ship.at)) : null,
          left: h ? { hull: r1(h.hull), shield: r1(h.shield) } : null,
        });
      }
      // splashes come a ball at a time: one line a shooter and gun a step
      const splashes = new Map<
        string,
        { ship: number; gun: string; balls: number; land: number }
      >();
      for (const s of did.splashes) {
        const k = `${s.shooter}:${s.gun}`,
          e = splashes.get(k) ?? {
            ship: s.shooter,
            gun: s.gun,
            balls: 0,
            land: 0,
          };
        e.balls++;
        if (s.land) e.land++;
        splashes.set(k, e);
      }
      for (const e of splashes.values()) emit('splash', e);
      for (const k of did.took) {
        const v = where(k.ship);
        let near = Infinity;
        if (v)
          for (const o of state.vessels())
            if (o.id !== k.ship)
              near = Math.min(near, distance(o.ship.at, v.ship.at));
        const born = state.born(k.id);
        emit('loot', {
          ship: k.ship,
          piece: k.id,
          goods: isArms(k.goods)
            ? { gun: k.goods.kind, rarity: k.goods.rarity }
            : { store: k.goods.kind, count: k.goods.count },
          slot: k.slot,
          lay: r1(now - (born ?? 0)),
          nearest: Number.isFinite(near) ? r1(near) : null,
        });
      }
      const f = state.loot();
      if (f.next > laid) {
        emit('laid', {
          pieces: f.next - laid,
          from: laid,
          afloat: f.pieces.length,
        });
        laid = f.next;
      }
      for (const k of did.held?.claimed ?? [])
        emit('claim', {
          ship: k.id,
          metres: r1(k.metres),
          share: r4(state.share(k.id)),
        });

      // the storm, as its phase turns or it starts or stops closing
      const st = state.storm(1);
      if (
        st.phase !== storm.phase ||
        st.closing !== storm.closing ||
        st.final !== storm.final
      ) {
        storm = { phase: st.phase, closing: st.closing, final: st.final };
        emit('storm', {
          phase: st.phase,
          closing: st.closing,
          final: st.final,
          centre: latLon(st.centre),
          radius: r1(st.radius * R),
          next: {
            centre: latLon(st.next.centre),
            radius: r1(st.next.radius * R),
          },
          secondsToNext: Number.isFinite(st.secondsToNext)
            ? r1(st.secondsToNext)
            : null,
          damage: st.damage,
        });
      }

      // the sunk, in the order they went down
      const sinkings = state.sinkings();
      for (; sunk < sinkings.length; sunk++) {
        const k = sinkings[sunk],
          lasted = k.by === null ? undefined : firstBlow.get(`${k.by}>${k.id}`);
        if (k.by !== null && k.by !== k.id && lasted !== undefined)
          ttk.push({ by: k.by, on: k.id, seconds: r2(k.time - lasted) });
        emit('sunk', {
          ship: k.id,
          by: k.by,
          cause: k.cause,
          gun: k.gun,
          at: latLon(k.at),
          place: state.ships().length - sunk,
          fight: lasted === undefined ? null : r2(k.time - lasted),
        });
      }

      // stores used: a line as each use ends, with what it mended
      for (const v of state.vessels()) {
        const c = state.crew(v.id),
          u = c.hold.using,
          was = using.get(v.id);
        if (u && !was) {
          const item = c.hold.items[u.slot - 1]; // (slot 0 is the gun's)
          using.set(v.id, {
            item: item ? item.kind : null,
            t: now,
            hull: c.health.hull,
            shield: c.health.shield,
          });
        } else if (!u && was) {
          using.delete(v.id);
          const hull = c.health.hull - was.hull,
            shield = c.health.shield - was.shield;
          // (a blow breaks a use off: nothing given)
          emit('heal', {
            ship: v.id,
            item: was.item,
            seconds: r2(now - was.t),
            done: hull > 0.01 || shield > 0.01,
            hull: r1(hull),
            shield: r1(shield),
            now: { hull: r1(c.health.hull), shield: r1(c.health.shield) },
          });
        }
      }

      // the bots' minds: a line as one changes her mode, her foe or her loot
      for (const v of state.vessels()) {
        const m = debugOf(state).mindOf(v.id);
        if (!m) continue;
        const was = minds.get(v.id),
          now = { mode: m.mode, foe: m.foe, loot: m.target };
        if (
          was &&
          was.mode === now.mode &&
          was.foe === now.foe &&
          was.loot === now.loot
        )
          continue;
        minds.set(v.id, now);
        if (!was) continue;
        const foe = m.foe >= 0 ? where(m.foe) : null;
        emit('mind', {
          ship: v.id,
          mode: m.mode,
          was: was.mode,
          foe: m.foe >= 0 ? m.foe : null,
          foeRange: foe ? r1(distance(v.ship.at, foe.ship.at)) : null,
          loot: m.target >= 0 ? m.target : null,
          goal: latLon(m.goal),
          goalRange: r1(distance(v.ship.at, m.goal)),
          routed: m.route !== null,
          hull: r1(state.crew(v.id).health.hull),
          shield: r1(state.crew(v.id).health.shield),
        });
      }

      // the invariants
      const left = state.alive().length;
      if (left > alive)
        fail('afloat-rose', null, `${alive} afloat became ${left}`);
      alive = left;
      if (Math.abs(now - last - STEP) > 1e-9)
        fail('clock', null, `a step moved the clock ${now - last} s`);
      last = now;
      for (const v of state.vessels()) {
        const { at, heading, speed } = v.ship;
        if (![...at, ...heading, speed].every(Number.isFinite)) {
          fail(
            'not-finite',
            v.id,
            `at ${at}, heading ${heading}, speed ${speed}`
          );
          continue;
        }
        const len = Math.hypot(...at);
        if (Math.abs(len - 1) > 1e-6) fail('off-sphere', v.id, `|at| = ${len}`);
        if (Math.abs(dot(at, heading)) > 1e-3)
          fail('heading-off-tangent', v.id, `at·heading = ${dot(at, heading)}`);
        const ground = height(at);
        if (ground > 0 && !onLand.has(v.id)) {
          onLand.add(v.id);
          fail(
            'on-land',
            v.id,
            `ground ${r2(ground)} m above the sea at ${latLon(at)}`
          );
        } else if (ground <= 0) onLand.delete(v.id);
        const h = state.crew(v.id)?.health;
        if (
          h &&
          !(
            Number.isFinite(h.hull) &&
            Number.isFinite(h.shield) &&
            h.hull >= 0 &&
            h.shield >= 0
          )
        )
          fail('health', v.id, `hull ${h.hull}, shield ${h.shield}`);
      }
    },
    /** Call once a second of the match's clock: a line for every ship afloat. */
    second() {
      if (!ships) return;
      const now = t();
      for (const v of state.vessels()) {
        const c = state.crew(v.id),
          m = debugOf(state).mindOf(v.id),
          g = c.guns[c.hand];
        ships.write({
          t: now,
          id: v.id,
          at: latLon(v.ship.at),
          heading: compass(v.ship.at, v.ship.heading),
          speed: r2(v.ship.speed),
          turn: r4(v.ship.turn),
          hull: r1(c.health.hull),
          shield: r1(c.health.shield),
          hand: g ? { gun: g.kind, rarity: g.rarity, rounds: g.rounds } : null,
          guns: c.guns.map((k) => k && `${k.kind}:${k.rarity}`),
          hold: c.hold.items.map((k) => k && `${k.kind}x${k.count}`),
          using: c.hold.using,
          share: r4(state.share(v.id)),
          mode: m?.mode ?? null,
          foe: m && m.foe >= 0 ? m.foe : null,
          goal: m ? r1(distance(v.ship.at, m.goal)) : null,
          avoid: m ? m.avoid > 0 : null,
          backing: m ? m.backT !== 0 : null,
          engaged: v.engaged,
        });
      }
    },
    /** What was kept: the kills' times, the invariants broken, the parts' costs. */
    end() {
      const kills = ttk.map((k) => k.seconds).sort((a, b) => a - b);
      return {
        ttk: {
          kills: ttk.length,
          median: kills.length ? kills[kills.length >> 1] : null,
          mean: kills.length
            ? r2(kills.reduce((a, b) => a + b, 0) / kills.length)
            : null,
          each: ttk,
        },
        invariants: { broken, first: breaks },
        cost: Object.fromEntries([...parts].map(([k, xs]) => [k, costOf(xs)])),
      };
    },
  };
}
