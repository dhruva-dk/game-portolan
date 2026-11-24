import {
  debugOf,
  PARTS,
  type Part,
  type Stepped,
} from '../../src/sim/engine.ts';
import { STEP } from '../../src/sim/fixed.ts';
import { GUNS } from '../../src/sim/handling.ts';
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

const r1 = (x: number) => Math.round(x * 10) / 10,
  r2 = (x: number) => Math.round(x * 100) / 100,
  r4 = (x: number) => Math.round(x * 1e4) / 1e4,
  deg = (rad: number) => (rad * 180) / Math.PI;

export const latLon = (p: Vec3): [number, number] => [
  r4(deg(Math.asin(Math.max(-1, Math.min(1, p[1]))))),
  r4(deg(Math.atan2(-p[2], p[0]))),
];

const compass = (at: Vec3, h: Vec3) => {
  const f = frameAt(at);
  return r1((deg(Math.atan2(dot(h, f.east), dot(h, f.north))) + 360) % 360);
};

const offBow = (at: Vec3, h: Vec3, to: Vec3) => {
  const d = toward(at, to);
  if (!d) return 0;
  return r1(deg(Math.atan2(dot(d, cross(h, at)), dot(d, h))));
};

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

export interface Break {
  t: number;
  step: number;
  what: string;
  ship: number | null;
  detail: string;
}

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

  const minds = new Map<number, { mode: string; foe: number; loot: number }>();
  const using = new Map<
    number,
    { item: string | null; t: number; hull: number; shield: number }
  >();
  let storm = { phase: -1, closing: false, final: false };
  let sunk = 0,
    laid = state.loot().next,
    alive = state.alive().length,
    last = state.time();
  const firstBlow = new Map<string, number>();
  const ttk: { by: number; on: number; seconds: number }[] = [];
  const breaks: Break[] = [];
  let broken = 0;
  const onLand = new Set<number>();
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
          gun: c.gun.kind,
        };
      }),
    });

  return {
    start,
    lap(part: Part) {
      const now = performance.now();
      parts.get(part)!.push(now - mark);
      mark = now;
    },
    before() {
      began = mark = performance.now();
    },
    after(did: Stepped) {
      parts.get('step')!.push(performance.now() - began);
      step++;
      const now = state.time();

      for (const s of did.shots) {
        const v = where(s.shooter),
          c = state.crew(s.shooter),
          to = s.target === null ? null : where(s.target);
        emit('shot', {
          ship: s.shooter,
          gun: s.gun,
          rounds: c.gun.rounds,
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
          goods: { store: k.goods.kind, count: k.goods.count },
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
          meters: r1(k.meters),
          share: r4(state.share(k.id)),
        });

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
          center: latLon(st.center),
          radius: r1(st.radius * R),
          next: {
            center: latLon(st.next.center),
            radius: r1(st.next.radius * R),
          },
          secondsToNext: Number.isFinite(st.secondsToNext)
            ? r1(st.secondsToNext)
            : null,
          damage: st.damage,
        });
      }

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

      for (const v of state.vessels()) {
        const c = state.crew(v.id),
          u = c.hold.using,
          was = using.get(v.id);
        if (u && !was) {
          const item = c.hold.items[u.slot - 1];
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
    second() {
      if (!ships) return;
      const now = t();
      for (const v of state.vessels()) {
        const c = state.crew(v.id),
          m = debugOf(state).mindOf(v.id);
        ships.write({
          t: now,
          id: v.id,
          at: latLon(v.ship.at),
          heading: compass(v.ship.at, v.ship.heading),
          speed: r2(v.ship.speed),
          turn: r4(v.ship.turn),
          hull: r1(c.health.hull),
          shield: r1(c.health.shield),
          gun: { kind: c.gun.kind, rounds: c.gun.rounds },
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
