// The nine buildings of a crew's rookery, each generated in code at each of its three levels: one builder per
// building, and each level a form of its own grown from the last (a shed, then a works, then a great hall), never the
// same one scaled. Every form stands on its plot's terrace (y = 0) inside the building's footprint at its third level
// (world/rookery.ts FOOTPRINT): x along the coast, z out to sea; the sailing school's and the fish market's piers run
// out over the water past z = 0. Each flies the crew's flag from at least one pole.

import type { Building } from '../world/rookery.ts';
import { TONE as T, createKit, type Form, type Kit } from './kit.ts';

type Builder = (k: Kit, level: 1 | 2 | 3) => void;

/** A pier from the waterline (z = 0) out to `out` metres, `w` wide round x, its deck at y, on piles down into the sea. */
function pier(k: Kit, x: number, w: number, out: number, y: number) {
  k.box(x - w / 2, y - 0.3, -1, x + w / 2, y, out, T.deck, true);
  for (let z = 2; z <= out; z += 4) for (const s of [-1, 1]) k.pole(x + (s * w) / 2, z, y - 6, y - 0.3, T.timber, 0.35);
  k.box(x - w / 2 - 0.1, y, out - 0.3, x + w / 2 + 0.1, y + 0.5, out, T.timber);
}

/** A little sailing dinghy afloat at (x, z) along z: a hull and a sail in the crew's second colour. */
function dinghy(k: Kit, x: number, z: number) {
  k.box(x - 0.8, -0.2, z - 2.2, x + 0.8, 0.5, z + 2.2, T.first);
  k.pole(x, z + 0.4, 0.5, 5, T.timber, 0.12);
  k.tri([x, 0.9, z - 1.8], [x, 0.9, z + 0.4], [x, 4.9, z + 0.4], T.second);
  k.tri([x, 0.9, z + 0.4], [x, 0.9, z - 1.8], [x, 4.9, z + 0.4], T.second);
}

const factory: Builder = (k, level) => {
  if (level === 1) {
    // a plank shed, its doors open to the sea, a timber stack beside it
    k.box(-6, 0, -4, 6, 3.2, 4, T.timber);
    k.gable(-6, -4, 6, 4, 3.2, 5.4, T.tile, T.timber);
    k.panesX(-3, 3, 4, 1, 0, 2.6, 1, 3.6, T.door);
    k.box(7.5, 0, -2, 11, 1.2, 2, T.deck);
    k.flag(-7.2, 3.2, 0, 6.5);
    return;
  }
  if (level === 2) {
    // a brick works, its roof a row of north lights, a chimney at its end
    k.box(-10, 0, -5, 10, 5, 5, T.brick);
    for (let i = 0; i < 4; i++) {
      const x = -10 + i * 5;
      k.gable(x, -5, x + 5, 5, 5, 7.6, i % 2 ? T.slate : T.slate, T.glass, 'z', 0.2);
    }
    k.panesX(-9, 9, 5, 1, 1.4, 3.6, 6, 1.5);
    k.panesX(-2, 2, 5, 1, 0, 3.6, 1, 3.2, T.first);
    k.box(10, 0, -4.5, 12, 9.5, -2.5, T.brick);
    k.smoke(11, 9.5, -3.5);
    k.flag(-11.2, 4.5, 0, 9);
    return;
  }
  // the works grown: its brick hall deeper and of two storeys under the same row of north lights, a third bay lower at
  // its end, the old chimney raised and a round stack beside it, a gantry crane over the yard
  k.box(-12, 0, -6.5, 7, 6.4, 6.5, T.brick);
  k.box(-12.1, 3, -6.6, 7.1, 3.35, 6.6, T.stone);
  for (let i = 0; i < 4; i++) {
    const x = -12 + i * 4.75;
    k.gable(x, -6.5, x + 4.75, 6.5, 6.4, 9.4, T.slate, T.glass, 'z', 0.2);
  }
  k.panesX(-11, -5, 6.5, 1, 0.9, 2.5, 3, 1.4);
  k.panesX(0, 6, 6.5, 1, 0.9, 2.5, 3, 1.4);
  k.panesX(-11, 6, 6.5, 1, 4, 5.6, 7, 1.4);
  k.panesX(-11, 6, -6.5, -1, 4, 5.6, 7, 1.4);
  k.panesX(-4.5, -0.5, 6.5, 1, 0, 2.9, 1, 3.4, T.first);
  k.box(7, 0, -6, 12, 4.6, 1.5, T.brick);
  k.gable(7, -6, 12, 1.5, 4.6, 7.2, T.slate, T.glass, 'z', 0.2);
  k.panesX(7.6, 11.4, 1.5, 1, 1, 2.8, 2, 1.3);
  k.box(9, 0, -5.6, 11, 13.5, -3.6, T.brick);
  k.box(8.8, 13.1, -5.8, 11.2, 13.5, -3.4, T.stone);
  k.smoke(10, 13.5, -4.6);
  k.drum(10, -0.6, 0.95, 0, 16, T.brick, 10, 0.8);
  for (const y of [7, 12]) k.drum(10, -0.6, 0.98 - y * 0.011, y, y + 0.35, T.iron, 10);
  k.smoke(10, 16, -0.6);
  // the gantry: two legs and a beam, its trolley in the crew's colour
  for (const x of [8, 12]) k.box(x - 0.3, 0, 5.5, x + 0.3, 11, 6.1, T.iron);
  k.box(7.4, 11, 5.3, 12.6, 11.8, 6.3, T.iron);
  k.box(9.4, 10.4, 5.2, 10.6, 11.2, 6.4, T.second);
  k.flag(-12.6, 0, 0, 11);
};

const drawingLoft: Builder = (k, level) => {
  if (level === 1) {
    k.box(-3, 0, -2.5, 3, 3, 2.5, T.plaster);
    k.gable(-3, -2.5, 3, 2.5, 3, 5, T.tile, T.plaster);
    k.panesX(-2.2, 2.2, 2.5, 1, 1.2, 2.3, 2, 0.9);
    k.panesX(-0.5, 0.5, 2.5, 1, 0, 2, 1, 1, T.first);
    k.flag(3.8, 2, 0, 6);
    return;
  }
  if (level === 2) {
    // two storeys, a hipped roof, dormers to the sea
    k.box(-5, 0, -3.5, 5, 6, 3.5, T.plaster);
    k.box(-5.1, 2.9, -3.6, 5.1, 3.2, 3.6, T.stone);
    k.hip(-5, -3.5, 5, 3.5, 6, 8.8, T.tile);
    k.panesX(-4.2, 4.2, 3.5, 1, 1, 2.4, 4, 1);
    k.panesX(-4.2, 4.2, 3.5, 1, 4, 5.4, 4, 1);
    k.panesZ(-2.8, 2.8, 5, 1, 4, 5.4, 2, 1);
    k.panesX(-0.6, 0.6, 3.5, 1, 0, 2.3, 1, 1.2, T.first);
    k.flag(5.8, -3, 0, 10);
    return;
  }
  // the loft itself: the house grown a storey under the same hipped roof, a glazed lantern on its ridge for the north
  // light, a domed tower at its corner
  k.box(-6.5, 0, -4.5, 3.5, 9, 4.5, T.plaster);
  for (const y of [2.9, 5.9]) k.box(-6.6, y, -4.6, 3.6, y + 0.3, 4.6, T.stone);
  k.hip(-6.5, -4.5, 3.5, 4.5, 9, 12.2, T.tile);
  k.panesX(-5.8, -2.2, 4.5, 1, 1, 2.4, 2, 1.1);
  k.panesX(0.4, 2.8, 4.5, 1, 1, 2.4, 2, 1.1);
  for (const y of [4, 7]) k.panesX(-5.8, 2.8, 4.5, 1, y, y + 1.4, 4, 1.1);
  k.panesZ(-3.6, 3.6, -6.5, -1, 4, 5.4, 3, 1);
  k.panesZ(-3.6, 3.6, -6.5, -1, 7, 8.4, 3, 1);
  k.panesX(-1.6, -0.4, 4.5, 1, 0, 2.4, 1, 1.2, T.first);
  k.box(-4, 11.2, -1.1, 1, 12.5, 1.1, T.glass);
  k.gable(-4, -1.1, 1, 1.1, 12.5, 13.4, T.tile, T.tile, 'x', 0.25);
  k.drum(5, 1, 2, 0, 14, T.stone, 12);
  k.box(4.85, 0, 2.85, 5.15, 14, 3.1, T.stone);
  k.drum(5, 1, 2.3, 14, 14.5, T.stone, 12);
  k.panesX(4.2, 5.8, 3.0, 1, 11, 13, 1, 0.8);
  k.dome(5, 1, 2, 14.5, T.copper, 2.2);
  k.flag(5, 1, 16.6, 3);
};

const testTank: Builder = (k, level) => {
  if (level === 1) {
    // an open basin of stone, its water, a hut for the models
    k.box(-8, 0, -1.8, 8, 1, 1.8, T.stone);
    k.box(-7.4, 0.2, -1.2, 7.4, 0.95, 1.2, T.tank);
    k.box(-11, 0, -2, -8.5, 2.6, 1.5, T.timber);
    k.gable(-11, -2, -8.5, 1.5, 2.6, 3.6, T.tile, T.timber, 'z', 0.3);
    k.pole(8.6, 0, 0, 2.5, T.iron, 0.2);
    k.flag(-12, 2.5, 0, 5.5);
    return;
  }
  if (level === 2) {
    // the basin roofed over its length, a towing carriage's rails along it
    k.box(-11, 0, -3.5, 11, 3.6, 3.5, T.plaster);
    k.gable(-11, -3.5, 11, 3.5, 3.6, 5.6, T.slate, T.plaster);
    k.panesX(-10, 10, 3.5, 1, 1.4, 2.8, 9, 1.1);
    k.panesX(-10, 10, -3.5, -1, 1.4, 2.8, 9, 1.1);
    k.panesZ(-1, 1, 11, 1, 0, 2.6, 1, 1.8, T.first);
    k.flag(-12, 4.5, 0, 8);
    return;
  }
  // the long tank hall under a clerestory, its water tower at the end
  k.box(-12, 0, -5, 8, 4.6, 5, T.plaster);
  k.box(-12.1, 4.6, -5.1, 8.1, 4.9, 5.1, T.stone);
  k.box(-12, 4.9, -2.6, 8, 7, 2.6, T.plaster);
  k.panesX(-11, 7, 2.6, 1, 5.3, 6.6, 9, 1.2);
  k.panesX(-11, 7, -2.6, -1, 5.3, 6.6, 9, 1.2);
  k.gable(-12, -2.6, 8, 2.6, 7, 8.6, T.slate, T.plaster, 'x', 0.3);
  k.gable(-12, -5, 8, -2.6, 4.9, 4.9, T.slate, T.plaster, 'x', 0);
  k.box(-12.4, 4.6, -5.4, 8.4, 5, -2.6, T.slate);
  k.box(-12.4, 4.6, 2.6, 8.4, 5, 5.4, T.slate);
  k.panesX(-11, 7, 5, 1, 1.2, 3.6, 10, 1.1);
  k.panesZ(-1.2, 1.2, 8, 1, 0, 3, 1, 2, T.first);
  for (const [x, z] of [[9.5, -2.5], [11.5, -2.5], [9.5, 0.5], [11.5, 0.5]]) k.pole(x, z, 0, 8, T.iron, 0.3);
  k.drum(10.5, -1, 2, 8, 11, T.tank, 12);
  k.cone(10.5, -1, 2.3, 11, 12.4, T.copper, 12);
  k.flag(-12.6, 4.6, 0, 11);
};

const foundry: Builder = (k, level) => {
  if (level === 1) {
    // a forge under a tiled roof, its brick chimney
    k.box(-4, 0, -3, 4, 3, 3, T.brick);
    k.gable(-4, -3, 4, 3, 3, 4.8, T.tile, T.brick);
    k.panesX(-1.2, 1.2, 3, 1, 0, 2.4, 1, 2.2, T.door);
    k.box(2, 0, -2.4, 3.4, 7, -1, T.brick);
    k.smoke(2.7, 7, -1.7);
    k.flag(-5, 3.5, 0, 6.5);
    return;
  }
  if (level === 2) {
    // a casting shed, a round stack beside it
    k.box(-8, 0, -5, 6, 5, 5, T.brick);
    k.gable(-8, -5, 6, 5, 5, 7.6, T.slate, T.brick, 'z');
    k.panesX(-7, 5, 5, 1, 1.5, 3.8, 5, 1.4);
    k.panesX(-2, 0.5, 5, 1, 0, 3.8, 1, 2.6, T.door);
    k.drum(8.5, -1.5, 1.3, 0, 13, T.brick, 10, 1);
    k.drum(8.5, -1.5, 1.15, 12.4, 13.2, T.iron, 10);
    k.smoke(8.5, 13.2, -1.5);
    k.flag(-9, 6, 0, 8);
    return;
  }
  // the works: the casting hall, its furnace, two tall stacks banded in iron
  k.box(-11, 0, -7, 3, 7, 7, T.brick);
  k.gable(-11, -7, 3, 7, 7, 10.5, T.slate, T.brick, 'z');
  k.box(-11.1, 3.3, -7.1, 3.1, 3.7, 7.1, T.stone);
  k.panesX(-10, 2, 7, 1, 4.3, 6.4, 5, 1.4);
  k.panesX(-10, 2, 7, 1, 0.6, 2.8, 5, 1.4);
  k.panesX(-5.5, -2.5, 7, 1, 0, 3.2, 1, 3, T.door);
  k.drum(7, 2.5, 3.2, 0, 7.5, T.brick, 14, 2.6);
  k.drum(7, 2.5, 2.7, 7.5, 8.3, T.iron, 14);
  k.cone(7, 2.5, 2.6, 8.3, 10, T.iron, 14);
  k.box(3, 4.5, 1.8, 4.6, 5.6, 3.2, T.iron);
  for (const [x, z, h] of [[6, -4.5, 20], [9.5, -4.5, 17]]) {
    k.drum(x, z, 1.25, 0, h, T.brick, 10, 0.95);
    for (const y of [h * 0.4, h * 0.75]) k.drum(x, z, 1.2 - (y / h) * 0.28, y, y + 0.4, T.iron, 10);
    k.drum(x, z, 1.1, h - 0.6, h + 0.2, T.iron, 10);
    k.smoke(x, h + 0.2, z);
  }
  k.flag(-11.4, 7.3, 0, 10);
};

const sailingSchool: Builder = (k, level) => {
  if (level === 1) {
    // a boathouse at the water's edge, its pier, a dinghy alongside
    k.box(-4, 0, -5, 4, 3, 1, T.timber);
    k.gable(-4, -5, 4, 1, 3, 5, T.tile, T.timber, 'z');
    k.panesX(-2, 2, 1, 1, 0, 2.6, 1, 3.4, T.door);
    pier(k, 6, 2, 9, 0);
    dinghy(k, 8.6, 6);
    k.flag(-5.2, -3, 0, 6);
    return;
  }
  if (level === 2) {
    // a clubhouse with a veranda to the sea, a slipway and a longer pier
    k.box(-8, 0, -6, 2, 4.4, 0, T.plaster);
    k.hip(-8, -6, 2, 0, 4.4, 7, T.tile);
    k.box(-8, 0, 0, 2, 0.3, 2.5, T.deck);
    for (const x of [-7.7, -4.5, -1.5, 1.7]) k.pole(x, 2.3, 0.3, 4.4, T.timber, 0.25);
    k.box(-8.4, 4.1, -0.1, 2.4, 4.4, 2.8, T.canvas);
    k.panesX(-7, 1, 0, 1, 1.2, 3, 4, 1.1);
    k.box(3.5, -2, -2, 6.5, 0.2, 10, T.stone);
    pier(k, 9, 2.4, 14, 0);
    dinghy(k, 5, 8);
    dinghy(k, 10, 12);
    k.flag(-9, -5, 0, 8);
    return;
  }
  // the academy: a hall of two storeys, a mast with its yard for drills, a T-headed pier and its fleet of dinghies
  k.box(-10.5, 0, -6.5, 3, 6.6, -0.5, T.plaster);
  k.box(-10.6, 3.2, -6.6, 3.1, 3.5, -0.4, T.stone);
  k.hip(-10.5, -6.5, 3, -0.5, 6.6, 9.5, T.tile);
  k.panesX(-9.8, 2.2, -0.5, 1, 1, 2.6, 6, 1.1);
  k.panesX(-9.8, 2.2, -0.5, 1, 4.2, 5.8, 6, 1.1);
  k.box(-10.5, 0, -0.5, 3, 0.3, 2.4, T.deck);
  k.box(-10.8, 3.4, -0.5, 3.3, 3.6, 2.8, T.canvas);
  for (const x of [-10.2, -6.5, -3, 0.5, 2.7]) k.pole(x, 2.2, 0.3, 3.4, T.timber, 0.25);
  k.pole(7, -4, 0, 16, T.timber, 0.45);
  k.box(4, 12.5, -4.2, 10, 12.8, -3.8, T.timber);
  k.box(5.4, 8, -4.3, 8.6, 8.25, -3.7, T.timber);
  k.drum(7, -4, 0.8, 0, 0.6, T.stone, 8);
  k.flag(7, -4, 16, 2);
  pier(k, -3, 2.6, 15, 0);
  k.box(-9.5, -0.3, 13, 3.5, 0, 15.6, T.deck);
  for (const x of [-9, -5.5, 0.5, 3]) k.pole(x, 14.3, -6, -0.3, T.timber, 0.35);
  dinghy(k, -7.5, 9);
  dinghy(k, 1.5, 9);
  dinghy(k, 6, 12);
  dinghy(k, 9, 6);
};

const flightLoft: Builder = (k, level) => {
  if (level === 1) {
    // a dovecote on its post, perches round it
    k.box(-1.6, 0, -1.6, 1.6, 2.4, 1.6, T.stone);
    k.box(-2, 2.4, -2, 2, 4.6, 2, T.timber);
    k.hip(-2, -2, 2, 2, 4.6, 6.4, T.tile, 0.4);
    for (const s of [-1, 1]) {
      k.panesX(-1.4, 1.4, 2 * s, s as 1 | -1, 3.2, 3.8, 3, 0.45, T.door);
      k.box(-2.2, 3.05, s * 2.25 - 0.15, 2.2, 3.15, s * 2.25 + 0.15, T.timber);
    }
    k.flag(3, 0, 0, 6);
    return;
  }
  if (level === 2) {
    // a round loft of stone, its holes ringed by perches, a conical roof
    k.drum(0, 0, 3.4, 0, 6, T.stone, 14);
    k.drum(0, 0, 3.7, 6, 6.3, T.timber, 14);
    k.cone(0, 0, 4, 6.3, 9.4, T.tile, 14);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 2 * Math.PI, x = Math.cos(a) * 3.35, z = Math.sin(a) * 3.35;
      k.box(x - 0.35, 4.4, z - 0.35, x + 0.35, 5.1, z + 0.35, T.door);
    }
    k.drum(0, 0, 3.9, 4.2, 4.35, T.timber, 14);
    k.flag(0, 0, 9.4, 2.4);
    return;
  }
  // the gull tower: a tall round loft, its gallery, a lantern stage and a spire
  k.drum(0, 0, 4.4, 0, 9.6, T.plaster, 16, 3.9);
  k.drum(0, 0, 4.6, 0, 1, T.stone, 16);
  k.drum(0, 0, 4.7, 9.6, 10, T.stone, 16);
  k.drum(0, 0, 5.2, 10, 10.3, T.timber, 16);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * 2 * Math.PI;
    k.box(Math.cos(a) * 4.1 - 0.35, 6.5, Math.sin(a) * 4.1 - 0.35, Math.cos(a) * 4.1 + 0.35, 7.6, Math.sin(a) * 4.1 + 0.35, T.door);
    k.pole(Math.cos(a) * 5, Math.sin(a) * 5, 10.3, 11.2, T.timber, 0.14);
  }
  k.drum(0, 0, 2.5, 10.3, 13, T.timber, 12);
  k.drum(0, 0, 2.55, 11.2, 12.4, T.door, 12);
  k.cone(0, 0, 3, 13, 17, T.copper, 12);
  k.flag(0, 0, 17, 2.4);
  k.panesX(-0.8, 0.8, 4.2, 1, 0, 2.6, 1, 1.4, T.first);
};

const crowsNest: Builder = (k, level) => {
  if (level === 1) {
    // a lookout's platform on four poles, a ladder up
    for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) k.pole(x, z, 0, 6, T.timber, 0.3);
    k.box(-2, 6, -2, 2, 6.3, 2, T.deck);
    k.rail(-2, -2, 2, 2, 6.3);
    k.box(-0.5, 0, 1.9, 0.5, 6, 2.1, T.timber);
    k.flag(1.8, -1.8, 6.3, 3);
    return;
  }
  if (level === 2) {
    // a timber watch tower, its legs braced, a cabin at its head
    for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) {
      k.box(x - 0.2, 0, z - 0.2, x + 0.2, 9.5, z + 0.2, T.timber);
    }
    for (const y of [3, 6.3]) k.box(-2.6, y, -2.6, 2.6, y + 0.25, 2.6, T.timber);
    k.box(-2.6, 9.5, -2.6, 2.6, 9.8, 2.6, T.deck);
    k.box(-1.9, 9.8, -1.9, 1.9, 12, 1.9, T.plaster);
    k.panesX(-1.6, 1.6, 1.9, 1, 10.6, 11.6, 2, 1.1);
    k.panesZ(-1.6, 1.6, 1.9, 1, 10.6, 11.6, 2, 1.1);
    k.panesZ(-1.6, 1.6, -1.9, -1, 10.6, 11.6, 2, 1.1);
    k.hip(-1.9, -1.9, 1.9, 1.9, 12, 13.6, T.tile, 0.4);
    k.flag(0, 0, 13.6, 2.4);
    return;
  }
  // the lookout tower of stone, its gallery and its lantern under a copper dome
  k.drum(0, 0, 3.2, 0, 14.5, T.stone, 14, 2.5);
  k.drum(0, 0, 3.4, 0, 1.2, T.stone, 14);
  k.drum(0, 0, 2.6, 7, 7.4, T.first, 14);
  k.drum(0, 0, 3.4, 14.5, 15, T.stone, 14);
  k.drum(0, 0, 3.6, 15, 15.2, T.iron, 14);
  k.drum(0, 0, 1.8, 15, 17.4, T.glass, 10);
  k.drum(0, 0, 2.0, 17.4, 17.7, T.iron, 10);
  k.dome(0, 0, 1.9, 17.7, T.copper, 1.6, 10);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * 2 * Math.PI;
    k.pole(Math.cos(a) * 3.45, Math.sin(a) * 3.45, 15.2, 16.2, T.iron, 0.1);
  }
  k.panesX(-0.4, 0.4, 3.0, 1, 4, 5.4, 1, 0.7);
  k.panesX(-0.4, 0.4, 2.7, 1, 10, 11.4, 1, 0.7);
  k.panesX(-0.7, 0.7, 3.25, 1, 0, 2.4, 1, 1.4, T.first);
  k.flag(0, 0, 19.2, 2.2);
};

const fishMarket: Builder = (k, level) => {
  if (level === 1) {
    // a stall under an awning, its catch in crates on a short pier
    for (const [x, z] of [[-3.5, -3], [3.5, -3], [-3.5, 1], [3.5, 1]]) k.pole(x, z, 0, 3, T.timber, 0.25);
    k.gable(-3.5, -3, 3.5, 1, 3, 3.9, T.second, T.second, 'x', 0.4);
    k.box(-3, 0, -0.5, 3, 1, 0.5, T.timber);
    pier(k, 6.5, 2, 7, 0);
    for (const x of [-2, 0, 2]) k.box(x - 0.45, 1, -0.4, x + 0.45, 1.3, 0.4, T.tank);
    k.flag(-4.6, -2, 0, 5.5);
    return;
  }
  if (level === 2) {
    // an open hall on pillars under a big roof, a pier with its crates
    k.box(-8.2, -0.3, -5.2, 8.2, 0, 1.2, T.stone);
    for (const x of [-8, -4, 0, 4, 8]) for (const z of [-5, 1]) k.pole(x, z, 0, 3.8, T.stone, 0.45);
    k.gable(-8, -5, 8, 1, 3.8, 6, T.tile, T.plaster);
    for (const x of [-5, -1, 3]) k.box(x - 1.2, 0, -3, x + 1.2, 0.9, -1, T.timber);
    pier(k, 2, 3, 12, 0);
    for (const [x, z] of [[1.2, 5], [2.6, 7.5], [1.4, 9]]) k.box(x - 0.45, 0, z - 0.45, x + 0.45, 0.8, z + 0.45, T.timber);
    k.flag(-9.2, 0.5, 0, 7);
    return;
  }
  // the market hall, its clock tower, and two piers
  k.box(-10, 0, -5.5, 10, 4.6, 1, T.plaster);
  k.box(-10.1, 4.6, -5.6, 10.1, 4.9, 1.1, T.stone);
  k.gable(-10, -5.5, 10, 1, 4.9, 7.4, T.tile, T.plaster);
  for (let i = 0; i < 5; i++) {
    const x = -8 + i * 4;
    k.box(x - 1.3, 0, 1, x + 1.3, 3.2, 1.08, T.door);
    k.box(x - 1.5, 3.2, 1, x + 1.5, 3.4, 2.4, T.second);
  }
  k.box(-1.6, 0, -5.2, 1.6, 11, -2, T.stone);
  k.box(-1.75, 8.4, -5.35, 1.75, 8.7, -1.85, T.timber);
  k.drum(0, -1.95, 0.9, 9.0, 9.1, T.cream, 14);
  k.hip(-1.6, -5.2, 1.6, -2, 11, 13.2, T.slate, 0.3);
  pier(k, -6, 2.6, 15, 0);
  pier(k, 6, 2.6, 12, 0);
  for (const [x, z] of [[-6.8, 6], [-5.2, 9], [5.4, 5], [6.6, 8]]) k.box(x - 0.45, 0, z - 0.45, x + 0.45, 0.8, z + 0.45, T.timber);
  k.flag(0, -3.6, 13.2, 2.2);
  k.flag(-10.6, 0.6, 0, 8);
};

const landingPad: Builder = (k, level) => {
  if (level === 1) {
    // a ring of paving, its mark painted, a windsock's pole
    k.drum(0, 0, 5.2, -0.4, 0.25, T.stone, 20);
    k.drum(0, 0, 4.2, 0.25, 0.3, T.cream, 20);
    k.drum(0, 0, 3.6, 0.3, 0.35, T.stone, 20);
    k.drum(0, 0, 1.2, 0.35, 0.4, T.first, 10);
    k.flag(6.5, -4, 0, 5);
    return;
  }
  if (level === 2) {
    // a raised pad on its plinth, steps up, a hut and a beacon
    k.drum(0, 0, 6.8, -0.4, 1.6, T.stone, 24);
    k.drum(0, 0, 5.8, 1.6, 1.65, T.cream, 24);
    k.drum(0, 0, 5.3, 1.65, 1.7, T.stone, 24);
    k.drum(0, 0, 1.6, 1.7, 1.75, T.first, 12);
    for (let i = 0; i < 4; i++) k.box(-1.2, i * 0.4, 6.4 + (3 - i) * 0.5, 1.2, (i + 1) * 0.4, 7 + (3 - i) * 0.5, T.stone);
    k.box(7.5, 0, -6, 10.5, 3, -2.5, T.plaster);
    k.hip(7.5, -6, 10.5, -2.5, 3, 4.6, T.tile, 0.3);
    k.panesZ(-5.5, -3, 7.5, -1, 1.2, 2.4, 1, 1.2);
    k.pole(-8, -5, 0, 7, T.iron, 0.25);
    k.drum(-8, -5, 0.4, 7, 7.6, T.gilt, 8);
    k.flag(9, -1.5, 0, 6.5);
    return;
  }
  // the landing deck on its pillars, its mooring mast, and the tower that keeps the flights
  k.drum(0, 0, 8.6, 3, 3.5, T.stone, 28);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * 2 * Math.PI;
    k.drum(Math.cos(a) * 7.4, Math.sin(a) * 7.4, 0.55, -0.4, 3, T.stone, 8);
  }
  k.drum(0, 0, 3.4, -0.4, 3, T.stone, 14);
  k.drum(0, 0, 7.6, 3.5, 3.55, T.cream, 28);
  k.drum(0, 0, 7.0, 3.55, 3.6, T.stone, 28);
  k.drum(0, 0, 2, 3.6, 3.65, T.first, 14);
  k.rail(-8.6, -8.6, 8.6, 8.6, 3.5, T.iron, ['z1']);
  for (let i = 0; i < 6; i++) k.box(-1.5, i * 0.6, 8.4 + (5 - i) * 0.55, 1.5, (i + 1) * 0.6 - 0.05, 9.1 + (5 - i) * 0.55, T.stone);
  k.box(-11, 0, -7, -8, 9, -4, T.plaster);
  k.box(-11.3, 9, -7.3, -7.7, 11, -3.7, T.glass);
  k.hip(-11.3, -7.3, -7.7, -3.7, 11, 12.4, T.copper, 0.3);
  k.drum(7.5, -5.5, 0.35, 0, 15, T.iron, 6);
  k.drum(7.5, -5.5, 0.8, 15, 15.6, T.iron, 8);
  k.cone(7.5, -5.5, 0.9, 15.6, 16.6, T.gilt, 8);
  k.flag(-9.5, -5.5, 12.4, 2.5);
  k.flag(10, 2, 0, 9);
};

/** Each building's builder. */
export const BUILDERS: Readonly<Record<Building, Builder>> = {
  factory, drawingLoft, testTank, foundry, sailingSchool, flightLoft, crowsNest, fishMarket, landingPad,
};

/** A building's form at a level (1–3), in its own metres. */
export function formOf(building: Building, level: 1 | 2 | 3): Form {
  const k = createKit();
  BUILDERS[building](k, level);
  return k.form;
}
