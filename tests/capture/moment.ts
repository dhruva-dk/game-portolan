// Scripted mechanic moments. Each starts a seeded match, arranges the moment in the page (src/app/moments.ts), finds
// the tick its trigger fires on, then replays it from the seed and saves a strip of frames across it plus the effect
// log: every sound, haptic, camera and screen effect that fired, with its clock time and tick.
import { log, openApp, Shots, type Rig } from './common.ts';
import type { Game } from '../harness.ts';

export interface MomentDef {
  name: string;
  /** What the reviewer should look for. */
  about: string;
}

// Keep in step with MOMENTS in src/app/moments.ts.
export const MOMENTS: readonly MomentDef[] = [
  { name: 'cannon-hit', about: 'the player fires a cannon into a ship 55 m ahead and 24 m to starboard' },
  { name: 'shield-break', about: 'a shielded ship takes the hit that breaks its shield' },
  { name: 'sinking', about: 'a ship takes its last hull and sinks' },
  { name: 'gust', about: 'the player gusts: a burst of speed and a hop' },
  { name: 'consumable', about: 'the player drinks a Big Shield through its use time' },
  { name: 'gale-dive', about: 'the Gale carries the fleet and the player dives' },
  { name: 'storm-phase', about: 'the Storm starts its next phase and closes in' },
  { name: 'whale-breach', about: 'the giant whale breaches beside the player' },
  { name: 'broadside', about: 'the player fires a broadside, both sides at once' },
  { name: 'delivery', about: 'the player calls a gull delivery and it arrives' },
];

interface Plan {
  /** The tick the trigger fired on in the dry run, or -1 if it never did. */
  trigger: number;
  /** Ticks to start before the trigger, and between frames. */
  lead: number;
  every: number;
  frames: number;
  note: string;
}

async function arrange(game: Game, name: string, seed: number): Promise<void> {
  await game.hook((h, a) => h.moment(a.name, a.seed), { name, seed });
}

async function one(game: Game, r: Rig, def: MomentDef, seed: number): Promise<boolean> {
  const shots = await Shots.create(`moment-${def.name}`);
  await arrange(game, def.name, seed);
  const plan: Plan = await game.hook((h) => h.momentPlan());
  if (plan.trigger < 0) {
    log(`moment ${def.name}: its trigger never fired (${plan.note})`);
    await shots.json('plan.json', { ...def, seed, ...plan });
    return false;
  }
  // replay from the seed, and stop short of the trigger
  await arrange(game, def.name, seed);
  const start = Math.max(0, plan.trigger - plan.lead);
  await game.hook((h, n) => h.step(n), start - (await game.hook((h) => h.tick)));
  await game.hook((h) => h.clearEffects());
  await game.hook((h) => h.draw(1 / 30));
  for (let f = 0; f < plan.frames; f++) {
    const tick: number = await game.hook((h) => h.tick), d = tick - plan.trigger;
    // the sign spelled out in the file name, where a slug would make t-1 and t+1 the same
    await shots.shot(game, `t${d >= 0 ? '+' : ''}${d}`, `${String(f).padStart(3, '0')}-t-${d < 0 ? 'minus' : 'plus'}-${Math.abs(d)}.png`);
    await game.hook((h, n) => h.stepAndDraw(n), plan.every);
  }
  const effects = await game.hook((h) => h.effects());
  await shots.json('effects.json', effects);
  await shots.json('plan.json', { ...def, seed, ...plan });
  await shots.text('effects.txt', (effects as { t: number; tick: number; kind: string; name: string; data?: unknown }[])
    .map((e) => `${e.t.toFixed(3).padStart(8)} s  tick ${String(e.tick).padStart(5)}  ${e.kind.padEnd(7)} ${e.name}${e.data ? '  ' + JSON.stringify(e.data) : ''}`)
    .join('\n') + '\n');
  await shots.sheet(r.browser, 4);
  log(`moment ${def.name}: ${plan.frames} frames around tick ${plan.trigger}, ${(effects as unknown[]).length} effects, in ${shots.dir}`);
  return true;
}

export async function moment(r: Rig, o: { dpr: number; seed: number; name: string }): Promise<void> {
  const list = o.name === 'all' ? MOMENTS : MOMENTS.filter((m) => m.name === o.name);
  if (!list.length) throw new Error(`no moment "${o.name}"; there are ${MOMENTS.map((m) => m.name).join(', ')}`);
  const game = await openApp(r, { dpr: o.dpr });
  const missed: string[] = [];
  for (const def of list) if (!(await one(game, r, def, o.seed))) missed.push(def.name);
  game.assertClean();
  if (missed.length) throw new Error(`moments that never fired: ${missed.join(', ')}`);
}
