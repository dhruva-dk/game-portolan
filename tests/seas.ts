import {
  createTerritory,
  type Move,
  type Territory,
} from '../src/sim/territory.ts';
import type { Cap } from '../src/sim/storm.ts';
import type { Sea } from '../src/render/snapshot.ts';
import { random } from '../src/world/random.ts';
import {
  R,
  add,
  cross,
  distance,
  normalize,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';

export const WHOLE: Cap = { center: [0, 1, 0], radius: Math.PI };

export const seaOf = (t: Territory, generation: number): Sea => ({
  generation,
  owner: t.owner,
  seq: t.last(),
  changes: t.changes(),
  colors: [],
});

export function match(
  seed: number,
  generation: number,
  steps: number,
  frame: (sea: Sea, time: number) => void
) {
  const draw = random(seed),
    ships = 6,
    center = normalize([0.3, 0.9, 0.2]);
  const [e1, e2] = [
    normalize(cross(center, [0, 0, 1])),
    normalize(cross(center, normalize(cross(center, [0, 0, 1])))),
  ];
  const homes = Array.from(
    { length: ships },
    (_, i): Vec3 =>
      normalize(
        add(
          add(center, e1, (90 * Math.cos(i)) / R),
          e2,
          (90 * Math.sin(i * 1.7)) / R
        )
      )
  );
  const t = createTerritory(ships);
  t.begin(homes, 0);
  const at = homes.slice(),
    plans: Vec3[][] = homes.map(() => []),
    sunk = new Set<number>();
  for (let s = 1; s <= steps; s++) {
    const time = s / 30,
      moves: Move[] = [];
    for (let id = 0; id < ships; id++) {
      if (sunk.has(id)) continue;
      if (!plans[id].length) {
        const a = draw() * 2 * Math.PI,
          dir = add(scale(e1, Math.cos(a)), e2, Math.sin(a)),
          side = add(scale(e1, -Math.sin(a)), e2, Math.cos(a));
        const out = normalize(add(at[id], dir, (30 + 80 * draw()) / R)),
          across = normalize(add(out, side, (20 + 40 * draw()) / R));
        plans[id] = [out, across, homes[id]];
      }
      const goal = plans[id][0],
        d = distance(at[id], goal);
      const to =
        d < 0.4
          ? goal
          : normalize(add(at[id], normalize(add(goal, at[id], -1)), 0.4 / R));
      if (d < 0.4) plans[id].shift();
      moves.push({ id, from: at[id], to });
      at[id] = to;
    }
    const radius =
      time < 40 ? Math.PI : Math.max(60, 400 - (time - 40) * 12) / R;
    t.step(moves, time, { center, radius });
    if (draw() < 0.0015 && sunk.size < ships - 2) {
      const id = Math.floor(draw() * ships);
      if (!sunk.has(id)) {
        sunk.add(id);
        t.sink(id, time);
      }
    }
    frame(seaOf(t, generation), time);
  }
}

export function halfLoop() {
  const pole: Vec3 = [0, 0, 1],
    theta = Math.PI / 2 - 0.01,
    e1: Vec3 = [1, 0, 0],
    e2: Vec3 = [0, 1, 0];
  const steps = Math.ceil((1.02 * 2 * Math.PI * R * Math.sin(theta)) / 0.4);
  const path = Array.from({ length: steps + 1 }, (_, k) => {
    const phi = (k / steps) * 1.02 * 2 * Math.PI;
    return normalize(
      add(
        scale(pole, Math.cos(theta)),
        add(scale(e1, Math.cos(phi)), e2, Math.sin(phi)),
        Math.sin(theta)
      )
    );
  });
  const t = createTerritory(1);
  t.begin([path[0]], 0);
  let time = 0;
  for (
    let k = 1;
    k < path.length && !t.changes().some((c) => c.kind === 'claim');
    k++
  ) {
    t.step([{ id: 0, from: path[k - 1], to: path[k] }], (time = k / 30), WHOLE);
  }
  const after = seaOf(t, 1),
    loop = after.changes.at(-1)!,
    owner = Uint8Array.from(t.owner);
  if (loop.kind !== 'claim')
    throw new Error(`the loop closed as a ${loop.kind}`);
  for (let k = 0; k < loop.cells.length; k++) owner[loop.cells[k]] = 0;
  const before: Sea = { ...after, owner, seq: loop.seq - 1, changes: [] };
  return { territory: t, before, after, time };
}
