import { Lettering } from '../../src/lettering/ink.ts';
import { Pipeline } from '../../src/render/pipeline.ts';
import { WorldView } from '../../src/render/world.ts';
import { FLIGHT } from '../../src/sim/state.ts';
import { CONSUMABLE, FITTING } from '../../src/sim/tables.ts';
import type { ControlsView } from '../../src/ui/controls.ts';
import { HudState, hudLayout, type HudModel } from '../../src/ui/hud.ts';
import { HudView } from '../../src/ui/icons.ts';
import { scripted } from '../render/territory.match.ts';
import { world } from '../sim/vectors.ts';

const q = new URLSearchParams(location.search);
const [top, right, bottom, left] = (q.get('safe') ?? '0,0,0,0').split(',').map(Number);
const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas);
pipeline.pinScale(1);
const view = new WorldView(pipeline, world());
view.drive = true;
pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
const safe = { top, right, bottom, left };
view.layout(innerWidth, innerHeight, safe);
const { sea, state } = scripted();
const lettering = new Lettering(pipeline.style, devicePixelRatio);
const hud = new HudView(pipeline.style, lettering);
pipeline.ui.add(hud.group);
const L = hudLayout({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, safe });
hud.setLayout(L);
const fittings = (tiers: number[]) => [FITTING.ironRam, FITTING.longGuns, FITTING.mortar, FITTING.lateenMizzen, FITTING.doubledPlanking, FITTING.none].map((kind, i) => ({ kind, tier: tiers[i] }));
const idle: ControlsView = { stick: null, pressed: new Set(), aiming: null, home: 0 };

const SCENES: Record<string, [Partial<HudModel>, ControlsView]> = {
  calm: [{ hull: 1, sail: 1, purse: 140, bank: 620, share: 0.18, rank: 3, afloat: 10, consumables: [{ kind: CONSUMABLE.ward, count: 1 }, { kind: CONSUMABLE.gust, count: 2 }, { kind: 0, count: 0 }],
    fittings: fittings([0, 1, 2, 1, 0, 0]), aimed: { kind: FITTING.mortar, tier: 2, ready: true }, gull: { flight: FLIGHT.mast, price: 60, ready: true, tier: 0 },
    storm: { phase: 1, announced: false, toMove: 0, frac: 0, inside: true, edge: false }, threats: [], batteries: [{ battery: 0, reload: 0 }, { battery: 1, reload: 0 }] }, idle],
  fight: [{ hull: 0.38, fire: true, sail: 2, purse: 410, bank: 980, share: 0.27, rank: 2, afloat: 6,
    consumables: [{ kind: CONSUMABLE.patchKit, count: 1 }, { kind: CONSUMABLE.fogFlask, count: 1 }, { kind: CONSUMABLE.flare, count: 3 }],
    fittings: fittings([3, 3, 3, 2, 1, 0]), aimed: { kind: FITTING.mortar, tier: 3, ready: false }, gull: { flight: FLIGHT.wheel, price: 75, ready: true, tier: 0 },
    threats: [{ ship: 3, bearing: 0.9, near: 0.85 }, { ship: 5, bearing: -2.4, near: 0.4 }],
    batteries: [{ battery: 0, reload: 0.6 }, { battery: 1, reload: 0 }, { battery: 2, reload: 0.3 }] },
  { stick: { ox: 0.2 * innerWidth, oy: 0.68 * innerHeight, x: 0.2 * innerWidth + 38, y: 0.68 * innerHeight - 6, steer: 78 }, pressed: new Set(['aimed']),
    aiming: { kind: 'aimed', x: 0.62 * innerWidth, y: 0.45 * innerHeight, cell: 7, cancel: false }, home: 0 }],
  storm: [{ hull: 0.7, ward: true, torn: true, sail: 0, purse: 60, bank: 2310, share: 0.41, rank: 1, leader: true, afloat: 3,
    consumables: [{ kind: CONSUMABLE.ward, count: 0 }, { kind: CONSUMABLE.gust, count: 1 }, { kind: CONSUMABLE.patchKit, count: 2 }],
    fittings: fittings([4, 2, 3, 4, 3, 1]), aimed: { kind: FITTING.mortar, tier: 4, ready: true }, gull: { flight: FLIGHT.back, price: 90, ready: false, tier: 4 },
    storm: { phase: 3, announced: true, toMove: 14, frac: 0.35, inside: true, edge: true }, threats: [{ ship: 7, bearing: 2.6, near: 0.3 }],
    batteries: [{ battery: 0, reload: 0 }, { battery: 1, reload: 0.8 }], sternGlass: true }, { ...idle, pressed: new Set(['home']), home: 0.6 }],
};

const reading = new HudState();
let clock = 0;
(window as unknown as { __hud: (s: string) => Promise<boolean> }).__hud = async (scene) => {
  const [over, controls] = SCENES[scene];
  const m = Object.assign(reading.update(sea, state, 0), over);
  hud.setLayout(L);
  for (let i = 0; i < 50; i++) {
    clock += 1 / 30;
    view.frame({ state, dt: 1 / 30, clock, alpha: 1 });
    hud.frame(m, controls, 1 / 30);
    pipeline.render(view.scene, view.camera, 1 / 30);
    if (i % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return true;
};
(window as unknown as { __hudReady: boolean }).__hudReady = true;
