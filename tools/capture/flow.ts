// The whole game as a player meets it, on the real loop, the real title and the browser's storage: every press and
// finger a CDP touch at the place the chart offers it. The hook only arranges what cannot be reached quickly (a full
// hold with loot in reach, the Storm outside her) and reads back what happened. Paths: `main` from the title to a
// sinking and back to the lobby; `never`, who rides the Gale to its end without a press; `win`; `left`, the left-handed
// setting; `retired`, a saved career wearing cosmetics since cut; `plates`, each state of each screen arranged on the
// hook (the Storm, a fight, the scraps, a result per colour of laurel, the full map close). A step that fails is logged
// and the rest go on; the run fails at the end.
import { APP_PAGE, log, openApp, Shots, type Rig } from './common.ts';
import { openGame, type DeviceName, type Game } from '../harness.ts';

type Pt = { x: number; y: number };
type Hit = Pt & { w?: number; h?: number; r?: number };

class Run {
  readonly results: { step: string; ok: boolean; note: string }[] = [];
  readonly game: Game;
  readonly shots: Shots;
  readonly path: string;

  constructor(game: Game, shots: Shots, path: string) {
    this.game = game;
    this.shots = shots;
    this.path = path;
  }

  check(step: string, ok: boolean, note = ''): boolean {
    this.results.push({ step: `${this.path}: ${step}`, ok, note });
    log(`flow ${ok ? 'ok  ' : 'FAIL'} ${this.path}: ${step}${note ? ` (${note})` : ''}`);
    return ok;
  }

  shot(label: string): Promise<string> {
    return this.shots.shot(this.game, `${this.path} ${label}`);
  }

  wait(ms: number): Promise<void> {
    return this.game.page.waitForTimeout(ms);
  }

  screen(): Promise<string> {
    return this.game.hook((h) => h.screen);
  }

  /** Waits for a screen; false (and a failed step) if it never comes. */
  async reach(name: string, ms = 30_000): Promise<boolean> {
    try {
      await this.game.until((h, n: string) => h.screen === n, name, ms);
      return this.check(`reaches ${name}`, true);
    } catch {
      return this.check(`reaches ${name}`, false, `still on "${await this.screen()}"`);
    }
  }

  hit(id: string): Promise<(Hit & { disabled: boolean }) | null> {
    return this.game.hook((h, i: string) => {
      const p = h.app.chart?.presses.list.find((q: { id: string }) => q.id === i);
      return p ? { x: p.hit.x, y: p.hit.y, w: p.hit.w, h: p.hit.h, r: p.hit.r, disabled: !!p.disabled } : null;
    }, id);
  }

  async ids(prefix: string): Promise<string[]> {
    return this.game.hook((h, pre: string) => h.app.chart?.presses.list.filter((q: { id: string; disabled?: boolean }) => q.id.startsWith(pre) && !q.disabled).map((q: { id: string }) => q.id) ?? [], prefix);
  }

  /** A finger on the press `id`; false (and a failed step) if the chart offers no such press. */
  async press(id: string, off: Partial<Pt> = {}): Promise<boolean> {
    const p = await this.hit(id);
    if (!p) return this.check(`press ${id}`, false, 'no such press');
    await this.game.tap({ x: p.x + (off.x ?? 0), y: p.y + (off.y ?? 0) });
    return true;
  }

  /** A finger held on `id` for `ms` and lifted. */
  async hold(id: string, ms: number, finger = 5): Promise<boolean> {
    const p = await this.hit(id);
    if (!p) return this.check(`hold ${id}`, false, 'no such press');
    await this.game.touch([{ id: finger, x: p.x, y: p.y }]);
    await this.wait(ms);
    await this.game.touch([]);
    return true;
  }

  /** Ship 0, as the simulation has her. */
  me(): Promise<{ phase: number; hull: number; shield: number; sel: number; slots: { kind: number; n: number }[]; cool: number; reload: number; use: number; useT: number; gusts: number; gustT: number; cooldown: number; alt: number; pos: { x: number; y: number; z: number }; head: { x: number; y: number; z: number } }> {
    return this.game.hook((h) => {
      const s = h.sim.ships[0];
      return { phase: s.phase, hull: s.hull, shield: s.shield, sel: s.sel, slots: s.slots.map((q: { kind: number; n: number }) => ({ kind: q.kind, n: q.n })), cool: s.cool, reload: s.reload, use: s.use, useT: s.useT, gusts: s.gusts, gustT: s.gustT, cooldown: s.cooldown, alt: s.alt, pos: { ...s.pos }, head: { ...s.head } };
    });
  }
}

const ITEM = { cannon: 1, scatter: 2, smallShield: 7, repairKit: 9 } as const;

async function open(r: Rig, device: DeviceName): Promise<Game> {
  const game = await openGame(r.browser, r.server.url, { device, dpr: 1, path: APP_PAGE });
  await game.until((h) => h.ready, undefined, 180_000);
  return game;
}

/** A tap on the title (it will not leave until its needle has settled, so it may take more than one). */
async function leaveTitle(run: Run): Promise<boolean> {
  await run.game.until((h) => h.screen === 'title', undefined, 60_000);
  const size = await run.game.hook(() => ({ x: innerWidth / 2, y: innerHeight / 2 }));
  for (let i = 0; i < 40 && (await run.screen()) === 'title'; i++) {
    await run.game.tap(size);
    await run.wait(500);
  }
  return run.reach('lobby');
}

/** A clear spot on the screen for a tap: on no press but the folio's backdrop and off the sheet. */
async function outside(run: Run): Promise<Pt> {
  return run.game.hook(() => {
    const h = (window as unknown as { __portolan: { app: { chart: { layout: { w: number; h: number; lobby: { sheet: { x: number; y: number; w: number; h: number } } }; presses: { list: { id: string; hit: Hit }[] } } } } }).__portolan;
    const c = h.app.chart, l = c.layout, s = l.lobby.sheet;
    const on = (x: number, y: number, p: Hit) => (p.r !== undefined ? Math.hypot(x - p.x, y - p.y) <= Math.max(p.r, 28) : Math.abs(x - p.x) <= Math.max(p.w ?? 0, 56) / 2 && Math.abs(y - p.y) <= Math.max(p.h ?? 0, 56) / 2);
    for (let y = 60; y < l.h - 60; y += 30) for (let x = 40; x < l.w - 40; x += 30) {
      if (x >= s.x - s.w / 2 && x <= s.x + s.w / 2 && y >= s.y - s.h / 2 && y <= s.y + s.h / 2) continue;
      if (c.presses.list.every((p) => p.id === 'folio:outside' || !on(x, y, p.hit))) return { x, y };
    }
    return { x: l.w - 10, y: 12 };
  });
}

async function folios(run: Run): Promise<void> {
  const { game } = run;
  for (const tab of ['abilities', 'locker', 'rank', 'rivals'] as const) {
    if (!(await run.press(`lobby:${tab}`))) continue;
    if (!(await run.reach(tab, 8_000))) continue;
    await run.wait(700);
    await run.shot(`${tab} open`);
    await run.press(`lobby:${tab}`);
    await run.wait(500);
    run.check(`${tab} shuts by its tab`, (await run.screen()) === 'lobby', await run.screen());
    await run.wait(400);
    await run.press(`lobby:${tab}`);
    await run.reach(tab, 8_000);
    await run.wait(600);
    await game.tap(await outside(run));
    await run.wait(500);
    run.check(`${tab} shuts by a tap outside`, (await run.screen()) === 'lobby', await run.screen());
    await run.wait(400);
  }
  // the locker: wear something and see it on her, then scroll the long list
  await run.press('lobby:locker');
  await run.reach('locker', 8_000);
  await run.wait(900);
  const before = await run.shot('locker before wearing');
  const look0 = await game.hook((h) => JSON.stringify(h.app.career.career.look));
  let changed = '';
  for (const id of (await run.ids('folio:')).filter((i) => i !== 'folio:outside').slice(0, 8)) {
    await run.press(id);
    await run.wait(250);
    const look = await game.hook((h) => JSON.stringify(h.app.career.career.look));
    if (look !== look0) { changed = `${id}: ${look}`; break; }
  }
  run.check('a press on an unlocked card changes her look', !!changed, changed);
  await run.wait(900);
  const after = await run.shot('locker after wearing');
  run.check('frames saved for wearing', !!before && !!after);
  const card = (await run.ids('folio:')).filter((i) => i !== 'folio:outside')[0];
  const y0 = (await run.hit(card))?.y ?? 0;
  const anchor = await run.hit(card);
  if (anchor) await game.drag({ x: anchor.x, y: 700 }, { x: anchor.x, y: 200 }, 400);
  await run.wait(900);
  const moved = await game.hook((h) => h.app.chart.presses.list.filter((q: { id: string }) => q.id.startsWith('folio:')).map((q: { id: string; hit: Pt }) => `${q.id}@${q.hit.y.toFixed(0)}`).slice(0, 4));
  const y1 = (await run.hit(card))?.y;
  run.check('a drag on the sheet scrolls the long list', y1 !== y0, `${card} ${y0.toFixed(0)} -> ${y1?.toFixed(0)}; ${moved.join(' ')}`);
  await run.shot('locker scrolled');
  await game.tap(await outside(run));
  await run.wait(600);
  // the rank seal on the plate, and the career plate
  await run.press('lobby:career');
  await run.wait(900);
  await run.shot('career press');
  run.check('the career plate opens the rank folio', (await run.screen()) === 'rank', await run.screen());
  await game.tap(await outside(run));
  await run.wait(600);
}

async function settings(run: Run): Promise<void> {
  const { game } = run;
  await run.press('lobby:settings');
  await run.reach('settings', 8_000);
  await run.wait(800);
  await run.shot('settings');
  const read = () => game.hook((h) => ({ ...h.app.settings.settings }));
  for (const f of ['haptics', 'invertY', 'autoFire'] as const) {
    const was = (await read())[f];
    await run.press(`folio:set:${f}`);
    await run.wait(200);
    run.check(`settings: ${f} flips`, (await read())[f] === !was);
    await run.press(`folio:set:${f}`);
    await run.wait(200);
  }
  const lh = (await read()).leftHanded;
  await run.press('folio:set:leftHanded');
  await run.wait(300);
  run.check('settings: leftHanded flips', (await read()).leftHanded === !lh);
  await run.shot('settings left-handed');
  await run.press('folio:set:leftHanded');
  await run.wait(200);
  for (const f of ['master', 'shake', 'effects', 'sensitivity', 'ambience', 'interface'] as const) {
    const p = await run.hit(`folio:set:${f}`);
    if (!p) { run.check(`settings: ${f}`, false, 'no press'); continue; }
    const w = p.w ?? 0, was = (await read())[f];
    await game.tap({ x: p.x + w * 0.42, y: p.y });
    await run.wait(120);
    const a = (await read())[f];
    await game.drag({ x: p.x + w * 0.42, y: p.y }, { x: p.x + w * 0.05, y: p.y }, 250);
    await run.wait(120);
    const b = (await read())[f];
    run.check(`settings: ${f} follows a finger`, a !== was && b !== a, `${was.toFixed(2)} -> ${a.toFixed(2)} -> ${b.toFixed(2)}`);
  }
  await run.shot('settings changed');
  await run.press('lobby:settings');
  await run.wait(600);
  run.check('settings shut by the wheel', (await run.screen()) === 'lobby', await run.screen());
}

/** From the lobby's PLAY to the Gale. */
async function play(run: Run): Promise<boolean> {
  await run.press('lobby:play');
  return run.reach('gale', 40_000);
}

/** On the Gale: the full map opened, spun, pinched, a marker set and moved, shut; then DIVE, the glide steered, landed. */
async function drop(run: Run): Promise<void> {
  const { game } = run;
  await run.wait(1200);
  await run.shot('gale');
  await run.press('gale:map');
  await run.wait(500);
  const w = await game.hook((h) => h.mapWindow);
  if (run.check('the disc opens the full map', !!w)) {
    await run.shot('full map');
    await game.drag({ x: w.x - w.r * 0.4, y: w.y }, { x: w.x + w.r * 0.4, y: w.y + w.r * 0.1 }, 500);
    await run.wait(400);
    await run.shot('full map spun');
    await game.pinch({ x: w.x, y: w.y }, 100, 360, 600);
    await run.wait(700);
    await run.shot('full map pinched in');
    await game.tap({ x: w.x + w.r * 0.35, y: w.y - w.r * 0.3 });
    await run.wait(300);
    const m0 = await game.hook((h) => (h.app.session.mark ? { ...h.app.session.mark } : null));
    run.check('a tap in the window sets the marker', !!m0);
    await game.tap({ x: w.x - w.r * 0.3, y: w.y + w.r * 0.2 });
    await run.wait(300);
    const m1 = await game.hook((h) => (h.app.session.mark ? { ...h.app.session.mark } : null));
    run.check('a second tap moves it', !!m1 && !!m0 && Math.hypot(m1.x - m0.x, m1.y - m0.y, m1.z - m0.z) > 0.001);
    await run.shot('full map marker moved');
    await game.pinch({ x: w.x, y: w.y }, 360, 100, 600);
    await run.wait(700);
    await run.shot('full map pinched out');
    await run.press('gale:map');
    await run.wait(500);
    run.check('the disc shuts it', !(await game.hook((h) => h.mapWindow)));
    run.check('the controls are back', await game.hook((h) => h.app.controls.enabled));
  }
  await game.until((h) => (h.sim?.gale.t ?? 0) >= 3.2, undefined, 15_000);
  await run.wait(400);
  await run.shot('dive inked');
  await run.press('gale:dive');
  await run.wait(400);
  run.check('DIVE sends her down', (await run.me()).phase === 1, `phase ${(await run.me()).phase}`);
  await run.shot('gliding');
  const size = await game.hook(() => ({ w: innerWidth, h: innerHeight }));
  const stick = { x: size.w * 0.15, y: size.h * 0.75 };
  const a = await run.me();
  await game.touch([{ id: 1, ...stick }]);
  await game.touch([{ id: 1, x: stick.x + 30, y: stick.y - 30 }]);
  await run.wait(150);
  const active = await game.hook((h) => h.app.controls.stickView.active);
  run.check('the stick answers on the glide', active);
  await run.wait(1800);
  await run.shot('glide steered');
  await game.touch([]);
  const b = await run.me();
  run.check('she falls and moves on the glide', b.alt < a.alt && Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y, b.pos.z - a.pos.z) > 0.001, `alt ${a.alt.toFixed(0)} -> ${b.alt.toFixed(0)}`);
  await run.reach('match', 120_000);
  await run.wait(1500);
  await run.shot('landed');
}

/** The HUD's controls, each pressed and read back from the ship. */
async function hud(run: Run): Promise<void> {
  const { game } = run;
  const size = await game.hook(() => ({ w: innerWidth, h: innerHeight }));
  // the stick
  const stick = { x: size.w * 0.15, y: size.h * 0.72 };
  const a = await run.me();
  await game.touch([{ id: 1, ...stick }]);
  await game.touch([{ id: 1, x: stick.x + 20, y: stick.y - 45 }]);
  await run.wait(200);
  run.check('the stick answers', await game.hook((h) => h.app.controls.stickView.active));
  await run.shot('stick down');
  await run.wait(900);
  await game.touch([]);
  await run.wait(200);
  const b = await run.me();
  run.check('she sails on the stick', Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y, b.pos.z - a.pos.z) > 0.0005);
  run.check('the stick lets go', !(await game.hook((h) => h.app.controls.stickView.active)));
  // the sails: left, middle, right of the instrument
  const sails = await run.hit('hud:sails');
  if (sails) {
    const c = sails.r! / 1.2, seen: number[] = [];
    for (const dx of [-0.75, 0, 0.75]) {
      await game.tap({ x: sails.x + c * dx, y: sails.y });
      await run.wait(200);
      seen.push(await game.hook((h) => h.app.controls.throttle));
    }
    run.check('the sails take three settings', new Set(seen).size === 3, seen.join(', '));
    await game.tap({ x: sails.x + c * 0.75, y: sails.y });
  }
  // hotbar: choose, use, hold to drop
  await game.hook((h, I: typeof ITEM) => {
    const s = h.sim.ships[0];
    s.slots[1] = { kind: I.scatter, rarity: 0, n: 8 };
    s.slots[2] = { kind: I.repairKit, rarity: 0, n: 2 };
    s.hull = Math.max(20, s.hull - 40);
  }, ITEM);
  await run.wait(300);
  await run.press('hud:slot2');
  await run.wait(250);
  run.check('a tap on a slot chooses it', (await run.me()).sel === 1, `sel ${(await run.me()).sel}`);
  await run.shot('slot 2 chosen');
  await run.press('hud:slot3');
  await run.wait(250);
  run.check('a tap on another chooses that', (await run.me()).sel === 2, `sel ${(await run.me()).sel}`);
  const hull0 = (await run.me()).hull;
  await run.press('hud:slot3');
  await run.wait(500);
  let m = await run.me();
  run.check('a tap on the chosen consumable starts it', m.useT > 0 || m.use !== 0 || m.slots[2].n < 2 || m.hull > hull0, `use ${m.use}, useT ${m.useT.toFixed(2)}, n ${m.slots[2].n}, hull ${hull0.toFixed(0)} -> ${m.hull.toFixed(0)}`);
  await run.shot('consumable');
  await run.wait(1800);
  await run.press('hud:slot2');
  await run.wait(250);
  await run.hold('hud:slot2', 1000);
  await run.wait(300);
  m = await run.me();
  run.check('a hold on a slot drops it over the side', m.slots[1].kind === 0, `slot 2 kind ${m.slots[1].kind}`);
  await run.shot('slot dropped');
  // fire held, reload
  await run.press('hud:slot1');
  await run.wait(600);
  const fired0 = await game.hook((h) => h.sim.ships[0].slots[0].n);
  await game.hook((h) => h.clearEffects());
  await run.hold('hud:fire', 1600);
  const fx = await game.hook((h) => h.effects().filter((e: { name: string }) => /fire|shot|cannon/i.test(e.name)).length);
  const fired1 = await game.hook((h) => h.sim.ships[0].slots[0].n);
  run.check('fire held fires', fired1 < fired0 || fx > 0, `rounds ${fired0} -> ${fired1}, ${fx} fire effects`);
  await run.shot('after firing');
  await run.press('hud:reload');
  await run.wait(300);
  const rel = await run.me();
  run.check('reload starts', rel.reload > 0 || (rel.slots[0].n > fired1), `reload ${rel.reload.toFixed(2)}, n ${rel.slots[0].n}`);
  await run.shot('reloading');
  // ability and gust
  await run.press('hud:ability');
  await run.wait(300);
  const ab = await run.me();
  run.check('the ability goes', ab.cooldown > 0, `cooldown ${ab.cooldown.toFixed(2)}`);
  const g0 = ab.gusts, gt0 = ab.gustT;
  await run.press('hud:gust');
  await run.wait(300);
  const gu = await run.me();
  run.check('the gust goes', gu.gusts !== g0 || gu.gustT > gt0, `gusts ${g0} -> ${gu.gusts}, gustT ${gt0.toFixed(2)} -> ${gu.gustT.toFixed(2)}`);
  await run.shot('gust');
  // the minimap
  await run.press('hud:map');
  await run.wait(600);
  run.check('the minimap opens the full map', !!(await game.hook((h) => h.mapWindow)));
  run.check('the map stops the controls', !(await game.hook((h) => h.app.controls.enabled)));
  await run.shot('full map at sea');
  await run.press('hud:map');
  await run.wait(600);
  run.check('the disc shuts it', !(await game.hook((h) => h.mapWindow)));
  run.check('the controls come back', await game.hook((h) => h.app.controls.enabled));
  // loot in reach, the hold full: the offer, and a tap on the chosen slot takes it
  await game.hook((h, I: typeof ITEM) => {
    const s = h.sim.ships[0];
    for (let k = 0; k < s.slots.length; k++) if (s.slots[k].kind === 0) s.slots[k] = { kind: k === 1 ? I.scatter : k === 2 ? I.repairKit : I.smallShield, rarity: 0, n: 2 };
  }, ITEM);
  const placed = await game.hook((h) => {
    const st = h.sim, s = st.ships[0];
    if (!st.loot.length) return false;
    const l = st.loot[0];
    l.at = { x: s.pos.x, y: s.pos.y, z: s.pos.z };
    l.v = { x: 0, y: 0, z: 0 };
    return { kind: l.item.kind, n: l.item.n };
  });
  run.check('there is loot to put in reach', !!placed, JSON.stringify(placed));
  await run.wait(350);
  await run.shot('offer with a full hold');
  const sel = (await run.me()).sel, was = (await run.me()).slots[sel];
  await game.hook((h) => {
    const st = h.sim, s = st.ships[0];
    if (st.loot.length) st.loot[0].at = { x: s.pos.x, y: s.pos.y, z: s.pos.z };
  });
  await run.press(`hud:slot${sel + 1}`);
  await run.wait(300);
  const now = (await run.me()).slots[sel];
  run.check('a tap on the chosen slot takes the loot', !!placed && (now.kind !== was.kind || now.n !== was.n), `slot ${sel + 1}: ${was.kind}/${was.n} -> ${now.kind}/${now.n}`);
  await run.shot('after the swap');
}

async function endOfMatch(run: Run): Promise<void> {
  const { game } = run;
  // out in the Storm: the rim goes red and it wears at the hull
  await game.hook((h) => {
    const st = h.sim, s = st.ships[0], c = st.storm.centres[Math.min(st.storm.phase, st.storm.centres.length - 1)];
    const l = Math.hypot(c.x, c.y, c.z);
    s.pos = { x: -c.x / l * Math.hypot(s.pos.x, s.pos.y, s.pos.z), y: -c.y / l * Math.hypot(s.pos.x, s.pos.y, s.pos.z), z: -c.z / l * Math.hypot(s.pos.x, s.pos.y, s.pos.z) };
    s.was = { ...s.pos };
  });
  await run.wait(800);
  await run.shot('outside the warning circle');
  // the first circle only warns: the Storm bites once it first starts to close
  await game.hook((h) => h.step(Math.round((h.sim.storm.start + 96 * 30 - h.sim.tick))));
  await run.wait(700);
  const h0 = (await run.me()).hull;
  await run.wait(2000);
  const h1 = await run.me();
  run.check('the Storm wears at her outside it once it closes', h1.hull < h0, `hull ${h0.toFixed(1)} -> ${h1.hull.toFixed(1)}`);
  await run.shot('out in the Storm');
  await game.hook((h) => h.sinkPlayer(3, 'cannon'));
  await run.reach('spectate', 12_000);
  await run.wait(1500);
  await run.shot('spectating');
  await run.press('hud:skip');
  await run.reach('results', 15_000);
  await run.wait(1500);
  await run.shot('result');
  await run.press('result:tap');
  await run.reach('lobby', 15_000);
  await run.wait(1000);
  await run.shot('back in the lobby');
}

async function finish(run: Run): Promise<void> {
  let clean = true, note = '';
  try { run.game.assertClean(); } catch (e) { clean = false; note = String(e).slice(0, 800); }
  run.check('console clean', clean, note);
  await run.game.close();
}

const PATHS = {
  async main(r: Rig, shots: Shots, device: DeviceName, all: Run[]): Promise<void> {
    const run = new Run(await open(r, device), shots, 'main');
    all.push(run);
    await run.shot('title');
    if (!(await leaveTitle(run))) return finish(run);
    await run.wait(1500);
    await run.shot('lobby');
    await folios(run);
    await settings(run);
    if (!(await play(run))) return finish(run);
    await drop(run);
    if ((await run.screen()) === 'match') {
      await hud(run);
      await endOfMatch(run);
    }
    await finish(run);
  },
  async never(r: Rig, shots: Shots, device: DeviceName, all: Run[]): Promise<void> {
    const run = new Run(await open(r, device), shots, 'never');
    all.push(run);
    if (!(await leaveTitle(run))) return finish(run);
    await run.wait(1200);
    if (!(await play(run))) return finish(run);
    await run.wait(5000);
    await run.shot('riding');
    // the map left open all the way down: she lands with it up, and the disc gives her the HUD
    await run.press('gale:map');
    await run.wait(500);
    run.check('the map opens on the ride', !!(await run.game.hook((h) => h.mapWindow)));
    await run.reach('match', 200_000);
    await run.wait(1500);
    const me = await run.me();
    run.check('thrown off the Gale she lands', me.phase === 2, `phase ${me.phase}`);
    await run.shot('landed with the map open');
    run.check('the map is still up after landing', !!(await run.game.hook((h) => h.mapWindow)));
    run.check('the disc is offered over the map', !!(await run.hit('hud:map')));
    run.check('the HUD waits under it', !(await run.hit('hud:fire')));
    await run.press('hud:map');
    await run.wait(700);
    run.check('the disc shuts it', !(await run.game.hook((h) => h.mapWindow)));
    run.check('the controls come back', await run.game.hook((h) => h.app.controls.on));
    run.check('the HUD presses are back', !!(await run.hit('hud:fire')));
    await run.shot('hud after the map shut');
    await finish(run);
  },
  async win(r: Rig, shots: Shots, device: DeviceName, all: Run[]): Promise<void> {
    const run = new Run(await open(r, device), shots, 'win');
    all.push(run);
    if (!(await leaveTitle(run))) return finish(run);
    await run.wait(1200);
    if (!(await play(run))) return finish(run);
    await run.game.until((h) => (h.sim?.gale.t ?? 0) >= 3.2, undefined, 15_000);
    await run.press('gale:dive');
    await run.reach('match', 120_000);
    await run.wait(1500);
    await run.game.hook((h) => h.winPlayer());
    await run.reach('victory', 12_000);
    await run.wait(1500);
    await run.shot('victory');
    await run.reach('results', 15_000);
    await run.wait(1500);
    await run.shot('result, first');
    await run.press('result:tap');
    await run.reach('lobby', 15_000);
    await finish(run);
  },
  async left(r: Rig, shots: Shots, device: DeviceName, all: Run[]): Promise<void> {
    const run = new Run(await open(r, device), shots, 'left');
    all.push(run);
    if (!(await leaveTitle(run))) return finish(run);
    await run.wait(1200);
    await run.press('lobby:settings');
    await run.reach('settings', 8_000);
    await run.wait(700);
    await run.press('folio:set:leftHanded');
    await run.wait(300);
    run.check('left-handed set', await run.game.hook((h) => h.app.settings.settings.leftHanded));
    await run.shot('left-handed set');
    await run.press('lobby:settings');
    await run.wait(700);
    if (!(await play(run))) return finish(run);
    await run.wait(1000);
    await run.shot('gale left-handed');
    await run.game.until((h) => (h.sim?.gale.t ?? 0) >= 3.2, undefined, 15_000);
    await run.press('gale:dive');
    await run.reach('match', 120_000);
    await run.wait(1500);
    const w = await run.game.hook(() => innerWidth);
    const fire = await run.hit('hud:fire'), sails = await run.hit('hud:sails');
    run.check('fire is on the left', !!fire && fire.x < w / 2, `fire x ${fire?.x.toFixed(0)}`);
    run.check('the sails go with the stick, to the right', !!sails && sails.x > w / 2, `sails x ${sails?.x.toFixed(0)}`);
    run.check('the controls know', await run.game.hook((h) => h.app.controls.lefty));
    const stick = { x: w * 0.85, y: 780 };
    await run.game.touch([{ id: 1, ...stick }]);
    await run.game.touch([{ id: 1, x: stick.x - 30, y: stick.y - 30 }]);
    await run.wait(300);
    run.check('the stick is under the right thumb', await run.game.hook((h) => h.app.controls.stickView.active));
    await run.shot('hud left-handed');
    await run.game.touch([]);
    await run.wait(300);
    await run.game.page.reload();
    await run.game.until((h) => h.ready, undefined, 180_000);
    run.check('the setting survives a reload', await run.game.hook((h) => h.app.settings.settings.leftHanded));
    await finish(run);
  },
  async retired(r: Rig, shots: Shots, device: DeviceName, all: Run[]): Promise<void> {
    const run = new Run(await open(r, device), shots, 'retired');
    all.push(run);
    // a saved career, far along, wearing cosmetics since cut
    await run.game.page.evaluate(async () => {
      const save = await (0, eval)(`import('/src/career/save.ts')`);
      const h = (window as unknown as { __portolan: { app: { career: { career: { xp: number; rating: number; bestTier: number; look: Record<string, string> } } } } }).__portolan;
      const c = JSON.parse(JSON.stringify(h.app.career.career));
      Object.assign(c.look, { sailColour: 'seafoam', sailPattern: 'spiral', hullPaint: 'lavaRock', figurehead: 'stormPetrel', emblem: 'plain', wake: 'bubbles' });
      c.xp = 400000;
      c.rating = 2600;
      c.bestTier = 5;
      localStorage.setItem('portolan.career', save.serializeCareer(c));
      addEventListener('pagehide', () => localStorage.setItem('portolan.career', save.serializeCareer(c)));
    });
    await run.game.page.reload();
    await run.game.until((h) => h.ready, undefined, 180_000);
    const look = await run.game.hook((h) => ({ ...h.app.career.career.look }));
    run.check('the saved career loads', true, JSON.stringify(look));
    for (const [slot, gone] of [['sailColour', 'seafoam'], ['sailPattern', 'spiral'], ['hullPaint', 'lavaRock'], ['figurehead', 'stormPetrel'], ['wake', 'bubbles']] as const)
      run.check(`${slot} is no longer the cut "${gone}"`, (look as Record<string, string>)[slot] !== gone, (look as Record<string, string>)[slot]);
    if (!(await leaveTitle(run))) return finish(run);
    await run.wait(1500);
    await run.shot('lobby wearing what replaced it');
    await run.press('lobby:locker');
    await run.reach('locker', 8_000);
    await run.wait(900);
    await run.shot('locker');
    await run.press('lobby:locker');
    await run.wait(600);
    await run.press('lobby:abilities');
    await run.reach('abilities', 8_000);
    await run.wait(800);
    await run.shot('abilities far along');
    const c0 = await run.game.hook((h) => `${h.app.career.career.active}|${h.app.career.career.passive}`);
    let changed = '';
    for (const id of (await run.ids('folio:')).filter((i) => i !== 'folio:outside').slice(0, 10)) {
      await run.press(id);
      await run.wait(200);
      const c1 = await run.game.hook((h) => `${h.app.career.career.active}|${h.app.career.career.passive}`);
      if (c1 !== c0) { changed = `${id}: ${c1}`; break; }
    }
    run.check('a press on an unlocked ability equips it', !!changed, changed);
    await run.shot('ability equipped');
    await run.press('lobby:abilities');
    await run.wait(600);
    await run.press('lobby:rivals');
    await run.reach('rivals', 8_000);
    await run.wait(900);
    await run.shot('rivals far along');
    await run.game.tap(await outside(run));
    await run.wait(600);
    await run.press('lobby:rank');
    await run.reach('rank', 8_000);
    await run.wait(900);
    await run.shot('rank far along');
    await run.game.tap(await outside(run));
    await run.wait(600);
    await finish(run);
  },
  async plates(r: Rig, shots: Shots, device: DeviceName, all: Run[]): Promise<void> {
    const game = await openApp(r, { device, dpr: 1 });
    const run = new Run(game, shots, 'plates');
    all.push(run);
    const code = (src: string) => game.page.evaluate(async (s) => {
      const h = (window as unknown as { __portolan: unknown }).__portolan;
      await (0, eval)(`(async (h) => { ${s}; })`)(h);
    }, src);
    const SEA = 'h.play({ seed: 11, skipGale: true }); h.step(90)';
    await code(`${SEA}; await h.settle(3); await h.run(3)`);
    await run.shot('hud calm');
    await code(`${SEA}; h.step(96 * 30); await h.settle(3); await h.run(2)`);
    await run.shot('storm closing');
    await code(`const st = h.sim, s = st.ships[0], c = st.storm.centres[Math.min(st.storm.phase, st.storm.centres.length - 1)], l = Math.hypot(c.x, c.y, c.z), k = Math.hypot(s.pos.x, s.pos.y, s.pos.z) / l; s.pos = { x: -c.x * k, y: -c.y * k, z: -c.z * k }; s.was = { ...s.pos }; await h.run(2)`);
    await run.shot('storm outside');
    for (const id of ['wind', 'fight', 'closing']) {
      await code(`${SEA}; h.forgetTips(); h.tips(true); h.teach("${id}"); await h.run(1.6)`);
      await run.shot(`scrap ${id}`);
    }
    await code('h.tips(false); h.fight(); await h.run(2)');
    for (let i = 0; i < 4; i++) {
      await code('await h.run(1.2)');
      await run.shot(`fight ${i}`);
    }
    await code(`${SEA}; h.sinkPlayer(3, "cannon"); h.step(120); await h.settle(3); await h.run(2)`);
    await run.shot('spectate');
    const results = [[1, 7, 2140, 842], [4, 3, 980, 730], [9, 1, 410, 512], [23, 0, 96, 188]] as const;
    for (const [place, kills, damage, survived] of results) {
      const m = { place, kills, damage, survived, level: { before: { level: 6, into: 200, need: 900 }, after: { level: 7, into: 40, need: 1000 } }, rank: { before: { index: 3, tier: 0, step: 3 }, after: { index: 4, tier: 1, step: 0 } } };
      await code(`h.go("results", ${JSON.stringify(m)}); await h.run(5)`);
      await run.shot(`result place ${place}`);
    }
    // the full map from the HUD: whole planet, then closer by real pinches
    await code(`${SEA}; await h.settle(3); await h.run(1)`);
    await run.press('hud:map');
    await code('await h.run(1.2)');
    const w = await game.hook((h) => h.mapWindow);
    if (run.check('full map up', !!w)) {
      await run.shot('full map whole planet');
      for (let i = 0; i < 4; i++) {
        const pinching = game.pinch({ x: w.x, y: w.y }, 80, w.r * 1.5, 400);
        await pinching;
        await code('await h.run(1.2)');
      }
      await run.shot('full map close');
    }
    await finish(run);
  },
} as const;

export async function flow(r: Rig, o: { device?: string; only?: string }): Promise<void> {
  const device = (o.device?.split(',')[0] ?? 'ipad') as DeviceName;
  const names = (o.only?.split(',') ?? Object.keys(PATHS)) as (keyof typeof PATHS)[];
  const shots = await Shots.create(`flow-${device}`);
  const all: Run[] = [];
  let crashed = '';
  for (const name of names) {
    try {
      await PATHS[name](r, shots, device, all);
    } catch (e) {
      crashed += `${name}: ${String(e).slice(0, 600)}\n`;
      log(`flow CRASH ${name}: ${String(e).slice(0, 600)}`);
    }
  }
  const results = all.flatMap((a) => a.results), failed = results.filter((x) => !x.ok);
  await shots.json('flow.json', { results, crashed });
  await shots.sheet(r.browser, 5);
  log(`flow: ${results.length - failed.length} of ${results.length} steps pass${crashed ? '; a path crashed' : ''}`);
  if (failed.length || crashed) throw new Error(`flow: ${failed.length} failed: ${failed.map((f) => f.step).join('; ')} ${crashed}`);
}
