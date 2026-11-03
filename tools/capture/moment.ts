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
  ...[
    ['iceCrown', 'the Ice Crown\'s floes turn round the pole'], ['fjords', 'a flood surge pours out of the fjords'],
    ['mistwood', 'a fog bank rolls out of Mistwood over the sea'], ['spires', 'a spire topples into the sea'],
    ['narrows', 'rock falls into the Gorge mouth'], ['basaltStacks', 'the tide falls and the cave under the arch opens'],
    ['kelpShallows', 'the kelp blooms over the shallows'], ['blossomRun', 'the spring flood runs down the river'],
    ['glassSea', 'the whale rises through the Glass Sea'], ['jadeShoals', 'the tide falls and the shoals show their channels'],
    ['coralAtolls', 'the reef tide shuts one gap and opens another'], ['spiceIsles', 'the clam bed opens and pearls spill into the cove'],
    ['fireArchipelago', 'Cinder Peak erupts and throws lava bombs'], ['weepingIsle', 'a cloudburst closes round the isle'],
    ['mangroveLabyrinth', 'the flood tide opens channels through the roots'], ['maelstrom', 'the vortex rises round the Eye'],
  ].map(([id, about]) => ({ name: `event-${id}`, about: `${about}: the banner, the map and the sea` })),
];

/** Ticks before each frame drawn one by one at 30 a second, so what plays on over time (foam on a race, smoke, sparks)
 *  is in the picture as it would be in play, not drawn once a beat. */
const WARM = 24;

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
  await game.hook((h, n) => h.step(n), Math.max(0, start - WARM - (await game.hook((h) => h.tick))));
  await game.hook((h) => h.clearEffects());
  let bedsBefore: [string, number][] = [];
  for (let f = 0; f < plan.frames; f++) {
    // stepped to the frame's tick, the last of the way drawn at 30 frames a second
    const now: number = await game.hook((h) => h.tick), to = start + f * plan.every - now, w = Math.max(1, Math.min(WARM, to));
    await game.hook((h, n) => h.step(n), to - w);
    await game.hook((h, s) => h.run(s), w / 30);
    // run() draws its frames back to back, so the terrain round a ship that has moved is still the coarse chunks
    // until the workers catch up: wait for them, on still frames that move nothing on
    await game.hook((h) => h.settle(0));
    const tick: number = await game.hook((h) => h.tick), d = tick - plan.trigger;
    // the sign spelled out in the file name, where a slug would make t-1 and t+1 the same
    await shots.shot(game, `t${d >= 0 ? '+' : ''}${d}`, `${String(f).padStart(3, '0')}-t-${d < 0 ? 'minus' : 'plus'}-${Math.abs(d)}.png`);
    if (f === 0) bedsBefore = await game.hook((h) => h.beds());
  }
  const effects = await game.hook((h) => h.effects()), bedsAfter: [string, number][] = await game.hook((h) => h.beds());
  await shots.json('effects.json', effects);
  await shots.json('plan.json', { ...def, seed, ...plan });
  // a bed shows in the log only when it starts, so the ones already playing are listed first
  const beds = (when: string, b: [string, number][]) => `beds playing ${when}: ${b.map(([n, g]) => `${n} ${g.toFixed(2)}`).join(', ') || 'none'}`;
  await shots.text('effects.txt', [beds('at the first frame', bedsBefore), ...(effects as { t: number; tick: number; kind: string; name: string; data?: unknown }[])
    .map((e) => `${e.t.toFixed(3).padStart(8)} s  tick ${String(e.tick).padStart(5)}  ${e.kind.padEnd(7)} ${e.name}${e.data ? '  ' + JSON.stringify(e.data) : ''}`),
  beds('at the last frame', bedsAfter)].join('\n') + '\n');
  await shots.sheet(r.browser, 4);
  log(`moment ${def.name}: ${plan.frames} frames around tick ${plan.trigger}, ${(effects as unknown[]).length} effects, in ${shots.dir}`);
  return true;
}

export async function moment(r: Rig, o: { dpr: number; seed: number; name: string }): Promise<void> {
  const names = o.name.split(',');
  const list = o.name === 'all' ? MOMENTS : o.name === 'events' ? MOMENTS.filter((m) => m.name.startsWith('event-')) : MOMENTS.filter((m) => names.includes(m.name));
  if (!list.length) throw new Error(`no moment "${o.name}"; there are ${MOMENTS.map((m) => m.name).join(', ')}`);
  const game = await openApp(r, { dpr: o.dpr });
  const missed: string[] = [];
  for (const def of list) if (!(await one(game, r, def, o.seed))) missed.push(def.name);
  game.assertClean();
  if (missed.length) throw new Error(`moments that never fired: ${missed.join(', ')}`);
}
