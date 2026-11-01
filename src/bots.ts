// The other nineteen captains. Each one perceives what a player could see, then sets the same inputs a player would.
import { Match, PARCELS, USES, WEAPONS, type Item, type Ship, type WeaponKind } from './game.ts';
import { PLAY_R, rng } from './world.ts';

type Goal = 'storm' | 'heal' | 'fight' | 'flee' | 'loot' | 'roam' | 'claim';

interface Mind {
  dropX: number; dropZ: number; dropR: number; lastD: number;
  goal: Goal; gx: number; gz: number; lootId: number;
  path: number[][] | null; pi: number; repath: number; pathX: number; pathZ: number;
  think: number;
  foe: number; seen: number; react: number; lx: number; lz: number;
  strafe: number; strafeT: number;
  errX: number; errZ: number; etx: number; etz: number; errT: number;
  burst: number; swapT: number;
  stuckT: number; backT: number;
  aggro: number; // how readily this captain picks a fight
  greed: number; // how readily, and how far, this captain sails out to claim water
  wander: [number, number];
  loop: number[][] | null; li: number; // a claim under way: the corners still to round, then home
  claimT: number; // until the next claim is worth the time
}

const PREF: Record<WeaponKind, number> = { cannon: 95, scatter: 28, harpoon: 190, mortar: 140, repeater: 65 };

export class Bots {
  private readonly m: Match;
  private readonly minds = new Map<number, Mind>();
  private readonly r: () => number;

  /** `pilot` also gives the player's ship a mind: an autopilot, for playtests and the attract screen. */
  constructor(m: Match, seed: number, pilot = false) {
    this.m = m;
    this.r = rng(seed ^ 0x5eed);
    const r = this.r, g = m.gale;
    // landing spots: clams and orbs, favouring the ones near the Gale's line
    const spots = [...m.world.clams.map((c) => [c.x, c.z]), ...m.world.orbs.filter((_, i) => i % 3 === 0).map((o) => [o.x, o.z])];
    const lx = g.bx - g.ax, lz = g.bz - g.az, ll = Math.hypot(lx, lz);
    const taken: number[][] = [];
    for (const s of m.ships) {
      if (!s.bot && !pilot) continue;
      let best = spots[0], bs = Infinity;
      for (let k = 0; k < 8; k++) {
        const p = spots[Math.floor(r() * spots.length)];
        const off = Math.abs(((p[0] - g.ax) * lz - (p[1] - g.az) * lx) / ll);
        let crowd = 0;
        for (const t of taken) crowd += Math.max(0, 140 - Math.hypot(t[0] - p[0], t[1] - p[1]));
        const score = off * 0.5 + crowd * (1.5 + r() * 2) + r() * 300;
        if (score < bs) { bs = score; best = p; }
      }
      taken.push(best);
      this.minds.set(s.id, {
        dropX: best[0], dropZ: best[1], dropR: 140 + r() * 140, lastD: Infinity,
        goal: 'loot', gx: best[0], gz: best[1], lootId: -1,
        path: null, pi: 0, repath: 0, pathX: 0, pathZ: 0,
        think: r() * 0.5,
        foe: -1, seen: -99, react: 0, lx: 0, lz: 0,
        strafe: r() < 0.5 ? -1 : 1, strafeT: 2 + r() * 3,
        errX: 0, errZ: 0, etx: 0, etz: 0, errT: 0, burst: 0, swapT: 0, stuckT: 0, backT: 0,
        aggro: 0.4 + r() * 0.6,
        greed: 0.3 + r() * 0.7,
        loop: null, li: 0, claimT: 18 + r() * 20,
        wander: [(r() - 0.5) * 600, (r() - 0.5) * 600],
      });
    }
  }

  update(dt: number): void {
    for (const [id, b] of this.minds) {
      const s = this.m.ships[id];
      if (!s.alive) continue;
      const inp = s.input;
      inp.fire = false; inp.gust = false; inp.dive = false; inp.drop = false; inp.reload = false; inp.swap = false;
      if (s.phase === 'gale') this.gale(s, b);
      else if (s.phase === 'glide') this.glide(s, b);
      else if (s.phase === 'sea') this.sea(s, b, dt);
    }
  }

  private gale(s: Ship, b: Mind): void {
    const g = this.m.gale;
    const d = Math.hypot(b.dropX - g.x, b.dropZ - g.z);
    // jump when close enough to glide in, or once the Gale starts carrying us away
    if (d < b.dropR || (d > b.lastD + 0.01 && d < 420)) s.input.drop = true;
    b.lastD = d;
  }

  private glide(s: Ship, b: Mind): void {
    const dx = b.dropX - s.x, dz = b.dropZ - s.z, d = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, d / 30);
    s.input.steerX = (dx / d) * k;
    s.input.steerZ = (dz / d) * k;
    // dive once the spot is within the fall
    s.input.dive = d < s.alt * 1.1;
  }

  // ---------------------------------------------------------------- at sea

  private sea(s: Ship, b: Mind, dt: number): void {
    const m = this.m, inp = s.input, r = this.r;
    b.think -= dt;
    b.repath -= dt;
    b.swapT -= dt;
    b.claimT -= dt;
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafe = -b.strafe; b.strafeT = 1.8 + r() * 3.5; }
    this.perceive(s, b, dt);
    if (b.think <= 0) { b.think = 0.35 + r() * 0.3; this.decide(s, b); }
    // where to sail
    let sx = 0, sz = 0;
    const foe = b.foe >= 0 ? m.ships[b.foe] : null;
    if (b.goal === 'fight' && foe) {
      const w = m.weaponOf(s);
      const pref = w ? PREF[w.kind] : 80;
      const dx = foe.x - s.x, dz = foe.z - s.z, d = Math.hypot(dx, dz) || 1;
      const ux = dx / d, uz = dz / d;
      const radial = Math.max(-1, Math.min(1, (d - pref) / (pref * 0.6)));
      sx = -uz * b.strafe * 0.85 + ux * radial;
      sz = ux * b.strafe * 0.85 + uz * radial;
      // if the way is blocked, sail round by the chart instead
      if (!m.world.nav.clear(s.x, s.z, s.x + sx * 30, s.z + sz * 30)) {
        if (d > pref) [sx, sz] = this.follow(s, b, foe.x, foe.z);
        else { b.strafe = -b.strafe; sx = -sx; sz = -sz; }
      }
      // a burst of wind to close in, or to dodge when hurt
      const hurt = m.time - s.lastHitT < 0.3;
      if (s.gusts > 0 && ((hurt && r() < 0.06 * (0.5 + s.skill)) || (d > pref * 2 && r() < 0.01))) inp.gust = true;
    } else if (b.goal !== 'heal' || this.danger(s, b)) {
      [sx, sz] = this.follow(s, b, b.gx, b.gz);
      if (b.goal === 'storm' && s.gusts > 1 && r() < 0.01) inp.gust = true;
    } else {
      // channelling a repair: keep drifting, slowly
      [sx, sz] = this.follow(s, b, b.gx, b.gz);
      sx *= 0.4; sz *= 0.4;
    }
    // unstick: sail out the way we came
    if (s.speed < 1.5 && Math.hypot(sx, sz) > 0.3) b.stuckT += dt; else b.stuckT = Math.max(0, b.stuckT - dt);
    if (b.stuckT > 1.6) { b.backT = 1.4; b.stuckT = 0; b.repath = 0; }
    if (b.backT > 0) {
      b.backT -= dt;
      const [ox, oz] = m.world.nav.nearestOpen(s.x - Math.sin(s.heading) * 25, s.z - Math.cos(s.heading) * 25);
      const dx = ox - s.x, dz = oz - s.z, l = Math.hypot(dx, dz) || 1;
      sx = dx / l; sz = dz / l;
    }
    const l = Math.hypot(sx, sz);
    inp.steerX = l > 1 ? sx / l : sx;
    inp.steerZ = l > 1 ? sz / l : sz;
    this.weapons(s, b, foe, dt);
  }

  /** Who is out there: the nearest captain in sight, or whoever just hit us. */
  private perceive(s: Ship, b: Mind, dt: number): void {
    const m = this.m;
    // eyes open wider as the storm closes: early on, captains loot unless someone sails right up
    const phase = Math.max(0, m.storm.phase + (m.storm.state === 'shrink' ? 1 : 0));
    const range = (s.survived < 25 ? 45 : Math.min(180, 45 + phase * 22 + s.skill * 35)) * (0.7 + b.aggro * 0.5);
    let best = -1, bd = range;
    for (const t of m.ships) {
      if (t.id === s.id || !t.alive || t.phase !== 'sea') continue;
      // a player fresh off the drop reads as further off: time to find a gun before the first fight
      const fresh = !t.bot && m.time - t.landT < 18 ? 1.9 : 1;
      const d = Math.hypot(t.x - s.x, t.z - s.z) * fresh;
      if (d < bd && this.los(s.x, s.z, t.x, t.z)) { bd = d; best = t.id; }
    }
    if (m.time - s.lastHitT < 3 && s.lastHitBy >= 0 && m.ships[s.lastHitBy].alive) {
      const t = m.ships[s.lastHitBy];
      if (Math.hypot(t.x - s.x, t.z - s.z) < 320) best = t.id;
    }
    if (best >= 0) {
      if (best !== b.foe) b.react = 0.6 + (1 - s.skill) * 1.0;
      b.foe = best;
      b.seen = m.time;
      b.lx = m.ships[best].x; b.lz = m.ships[best].z;
    } else if (b.foe >= 0 && (m.time - b.seen > 3.5 || !m.ships[b.foe].alive)) b.foe = -1;
    b.react = Math.max(0, b.react - dt);
  }

  private danger(s: Ship, b: Mind): boolean {
    return b.foe >= 0 && Math.hypot(this.m.ships[b.foe].x - s.x, this.m.ships[b.foe].z - s.z) < 90 && this.m.time - b.seen < 2;
  }

  private decide(s: Ship, b: Mind): void {
    const m = this.m, st = m.storm;
    // 1. the storm
    if (st.state !== 'idle') {
      const dNow = Math.hypot(s.x - st.x, s.z - st.z);
      const dNext = Math.hypot(s.x - st.nx, s.z - st.nz);
      const timeLeft = st.state === 'wait' ? st.t + (st.phase >= 0 ? 20 : 0) : st.t;
      const need = Math.max(0, dNext - st.nr * 0.6) / 11;
      if (dNow > st.r - 8 || (dNext > st.nr * 0.8 && need > timeLeft * 0.7)) {
        b.goal = 'storm';
        const k = dNext > 1 ? (st.nr * 0.45) / dNext : 0;
        this.setGoal(b, st.nx + (s.x - st.nx) * k, st.nz + (s.z - st.nz) * k);
        // still fight back if hit on the way
        if (b.foe >= 0 && m.time - s.lastHitT < 2 && dNow < st.r - 20) b.goal = 'fight';
        return;
      }
    }
    // 2. repairs when nobody is close
    if (!this.danger(s, b)) {
      const slot = this.healSlot(s);
      if (slot >= 0) {
        b.goal = 'heal';
        if (s.useSlot !== slot) s.input.select = slot;
        return;
      }
    }
    // 3. a fight, or a run for it when outmatched
    if (b.foe >= 0 && m.weaponOf(s)) {
      const foe = m.ships[b.foe];
      const d = Math.hypot(foe.x - s.x, foe.z - s.z);
      if (s.hull + s.shield < 45 && this.power(foe) > this.power(s) * 1.1 && b.aggro < 0.85) {
        b.goal = 'flee';
        const ax = s.x - foe.x, az = s.z - foe.z, al = Math.hypot(ax, az) || 1;
        let fx = s.x + (ax / al) * 140, fz = s.z + (az / al) * 140;
        if (st.state !== 'idle') { fx = fx * 0.6 + st.nx * 0.4; fz = fz * 0.6 + st.nz * 0.4; }
        [fx, fz] = m.world.nav.nearestOpen(fx, fz);
        this.setGoal(b, fx, fz);
        if (s.gusts > 0 && this.r() < 0.3) s.input.gust = true;
        return;
      }
      const better = this.power(s) >= this.power(foe) * (1.4 - b.aggro * 0.8);
      const geared = st.phase >= 1 || s.slots.filter((x) => x?.type === 'weapon').length >= 2 || s.slots.some((x) => x?.type === 'weapon' && x.rarity >= 2);
      if ((better && geared) || d < 55 || m.time - s.lastHitT < 3) { b.goal = 'fight'; return; }
    }
    // 4. a trail out behind: finish the loop, or run for home when it has grown long
    const ink = m.ink, laid = ink.laid(s.id);
    if (laid > 0) {
      b.goal = 'claim';
      if (b.loop) {
        while (b.li < b.loop.length && Math.hypot(b.loop[b.li][0] - s.x, b.loop[b.li][1] - s.z) < 22) b.li++;
        if (b.li < b.loop.length) { this.setGoal(b, b.loop[b.li][0], b.loop[b.li][1]); return; }
      }
      b.loop = null;
      // a short stray from home is worth closing; a long one is left to run dry
      if (laid < 30) {
        const [hx, hz] = ink.home(s.id);
        if (Math.hypot(hx - s.x, hz - s.z) < 90) { this.setGoal(b, hx, hz); return; }
      }
    }
    // 5. the gull, when there is glimmer to spend
    if (s.gull === 'home') {
      const best = s.slots.reduce((a, x) => (x?.type === 'weapon' ? Math.max(a, x.rarity) : a), -1);
      const heals = s.slots.some((x) => x?.type === 'use');
      if (s.glimmer >= PARCELS[2].cost && best < 3) s.input.hail = 2;
      else if (s.glimmer >= PARCELS[1].cost && best < 2) s.input.hail = 1;
      else if (s.glimmer >= PARCELS[0].cost && !heals) s.input.hail = 0;
    }
    // 6. the leviathan's hoard draws every captain who is near
    const lv = m.leviathan;
    if (lv.state !== 'none' && Math.hypot(lv.x - s.x, lv.z - s.z) < 380 * (0.6 + b.aggro * 0.6)) {
      b.goal = 'loot';
      const a = Math.atan2(s.z - lv.z, s.x - lv.x);
      this.setGoal(b, lv.x + Math.cos(a) * 25, lv.z + Math.sin(a) * 25);
      if (lv.state === 'rising' && Math.hypot(lv.x - s.x, lv.z - s.z) < 40) { const lt0 = this.bestLoot(s); if (lt0) this.setGoal(b, lt0.x, lt0.z); }
      if (lv.state === 'breach') { const lt0 = this.bestLoot(s); if (lt0) { b.lootId = lt0.id; this.setGoal(b, lt0.x, lt0.z); } }
      return;
    }
    // 7. water to claim, now and then: a loop out from home round whatever lies near, islands best of all
    if (b.claimT <= 0 && ink.held(s.id) > 0) {
      b.claimT = 8 + (1 - b.greed) * 30 + this.r() * 12;
      const [hx, hz] = ink.home(s.id);
      if (Math.hypot(hx - s.x, hz - s.z) < 160 && this.planLoop(b, hx, hz)) { b.goal = 'claim'; this.setGoal(b, b.loop![0][0], b.loop![0][1]); return; }
    }
    // 8. loot worth the trip
    const lt = this.bestLoot(s);
    if (lt) { b.goal = 'loot'; b.lootId = lt.id; this.setGoal(b, lt.x, lt.z); return; }
    // 9. drift toward the safe water
    b.goal = 'roam';
    if (st.state !== 'idle') this.setGoal(b, st.nx + b.wander[0] * (st.nr / PLAY_R) * 0.6, st.nz + b.wander[1] * (st.nr / PLAY_R) * 0.6);
    else this.setGoal(b, b.wander[0], b.wander[1]);
    if (Math.hypot(s.x - b.gx, s.z - b.gz) < 30) b.wander = [(this.r() - 0.5) * 600, (this.r() - 0.5) * 600];
  }

  /** Two corners out from home, on open water inside the coming circle, and back: a wedge of sea to claim. */
  private planLoop(b: Mind, hx: number, hz: number): boolean {
    const m = this.m, st = m.storm, nav = m.world.nav;
    for (let k = 0; k < 10; k++) {
      const a = this.r() * Math.PI * 2, L = 50 + b.greed * 90 + this.r() * 30, w = 0.6 + this.r() * 0.5;
      const pts = [a - w, a + w].map((t) => nav.nearestOpen(hx + Math.cos(t) * L, hz + Math.sin(t) * L));
      const safe = (p: number[]) => Math.hypot(p[0] - hx, p[1] - hz) > L * 0.6 && (st.state === 'idle' || Math.hypot(p[0] - st.nx, p[1] - st.nz) < st.nr * 0.9);
      if (!pts.every(safe)) continue;
      b.loop = [...pts, [hx, hz]];
      b.li = 0;
      return true;
    }
    return false;
  }

  private setGoal(b: Mind, x: number, z: number): void {
    if (Math.hypot(x - b.gx, z - b.gz) > 15) { b.repath = 0; }
    b.gx = x; b.gz = z;
  }

  /** Steer along a chart path, recomputed now and then; straight when the way is clear. */
  private follow(s: Ship, b: Mind, x: number, z: number): [number, number] {
    const nav = this.m.world.nav;
    const dx0 = x - s.x, dz0 = z - s.z, d0 = Math.hypot(dx0, dz0) || 1;
    if (d0 < 120 && nav.clear(s.x, s.z, x, z)) { const k = Math.min(1, d0 / 20); return [(dx0 / d0) * k, (dz0 / d0) * k]; }
    if (!b.path || b.repath <= 0 || Math.hypot(x - b.pathX, z - b.pathZ) > 25) {
      b.path = nav.path(s.x, s.z, x, z, 4000);
      b.pi = 0;
      b.pathX = x; b.pathZ = z;
      b.repath = 2.5 + this.r();
    }
    if (!b.path || !b.path.length) { return [dx0 / d0, dz0 / d0]; }
    while (b.pi < b.path.length - 1 && Math.hypot(b.path[b.pi][0] - s.x, b.path[b.pi][1] - s.z) < 18) b.pi++;
    const [wx, wz] = b.path[b.pi];
    const dx = wx - s.x, dz = wz - s.z, d = Math.hypot(dx, dz) || 1;
    return [dx / d, dz / d];
  }

  private los(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 6);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.m.heightAt(ax + (bx - ax) * t, az + (bz - az) * t) > 2.5) return false;
    }
    return true;
  }

  private power(s: Ship): number {
    let best = 0;
    for (const it of s.slots) if (it?.type === 'weapon') best = Math.max(best, 1 + it.rarity * 0.25);
    return (s.hull + s.shield) * best;
  }

  private healSlot(s: Ship): number {
    let best = -1, bv = 0;
    s.slots.forEach((it, i) => {
      if (!it || it.type !== 'use') return;
      const u = USES[it.kind];
      let v = 0;
      if (u.shield && s.shield < Math.min(100, u.cap) - 10) v = Math.min(u.shield, u.cap - s.shield) / u.time;
      if (u.hull && s.hull < Math.min(100, u.cap) - 10 && s.hull < 70) v = Math.min(u.hull, u.cap - s.hull) / u.time * 1.3;
      if (v > bv) { bv = v; best = i; }
    });
    return best;
  }

  /** How much an item would improve what this ship carries. */
  private want(s: Ship, it: Item): number {
    if (it.type === 'use') {
      const have = s.slots.find((x) => x?.type === 'use' && x.kind === it.kind);
      if (have && have.type === 'use' && have.count >= USES[it.kind].stack) return 0;
      if (!have && !s.slots.includes(null)) return 0;
      return 0.8 + it.rarity * 0.2;
    }
    const same = s.slots.find((x) => x?.type === 'weapon' && x.kind === it.kind);
    if (same && same.type === 'weapon') return same.rarity < it.rarity ? 1 + (it.rarity - same.rarity) * 0.6 : 0;
    if (!s.slots.includes(null)) return 0;
    return 1.2 + it.rarity * 0.4;
  }

  private bestLoot(s: Ship): { id: number; x: number; z: number } | null {
    const m = this.m, st = m.storm;
    let best: { id: number; x: number; z: number } | null = null, bs = 0;
    const inStorm = (x: number, z: number) => st.state !== 'idle' && Math.hypot(x - st.nx, z - st.nz) > st.nr + 30 && Math.hypot(x - st.x, z - st.z) > st.r - 30;
    for (const l of m.loot) {
      const d = Math.hypot(l.x - s.x, l.z - s.z);
      if (d > 240 || inStorm(l.x, l.z)) continue;
      const v = this.want(s, l.item) / (d + 40);
      if (v > bs) { bs = v; best = l; }
    }
    for (const c of m.clams) {
      if (c.open) continue;
      const d = Math.hypot(c.x - s.x, c.z - s.z);
      if (d > 260 || inStorm(c.x, c.z)) continue;
      const v = 2.2 / (d + 40);
      if (v > bs) { bs = v; best = c; }
    }
    return bs > 0.004 ? best : null;
  }

  // ---------------------------------------------------------------- guns

  private weapons(s: Ship, b: Mind, foe: Ship | null, dt: number): void {
    const m = this.m, inp = s.input, r = this.r;
    // swap a weaker weapon out for loot alongside
    if (s.nearLoot >= 0) {
      const l = m.loot.find((x) => x.id === s.nearLoot);
      const cur = s.slots[s.sel];
      if (l && cur && l.item.type === 'weapon' && cur.type === 'weapon' && l.item.rarity > cur.rarity && this.want(s, l.item) === 0) inp.swap = true;
    }
    if (!foe || b.goal !== 'fight') {
      inp.aimPoint = [s.x + Math.sin(s.heading) * 60, 2, s.z + Math.cos(s.heading) * 60];
      // reload while nobody is near
      const w = m.weaponOf(s);
      if (w && w.ammo < WEAPONS[w.kind].mag && r() < 0.02) inp.reload = true;
      return;
    }
    const d = Math.hypot(foe.x - s.x, foe.z - s.z);
    // choose the weapon that suits the range
    if (b.swapT <= 0 && s.useSlot < 0) {
      let bestSlot = -1, bv = -1;
      s.slots.forEach((it, i) => {
        if (!it || it.type !== 'weapon') return;
        const def = WEAPONS[it.kind];
        if (d > def.range * 1.05) return;
        const fit = 1 / (1 + Math.abs(Math.log((d + 10) / (PREF[it.kind] + 10))));
        const v = fit * (1 + it.rarity * 0.18) * (it.ammo > 0 ? 1 : 0.5) * (it.kind === 'mortar' && foe.speed > 9 ? 0.6 : 1);
        if (v > bv) { bv = v; bestSlot = i; }
      });
      if (bestSlot >= 0 && bestSlot !== s.sel) { inp.select = bestSlot; b.swapT = 1.2 + r() * 1.2; }
    }
    const w = m.weaponOf(s);
    if (!w) return;
    const def = WEAPONS[w.kind];
    // lead the target, with an error that wanders and shrinks with skill
    const T = def.lob ? Math.max(0.9, Math.min(2.8, d / 70)) : d / def.speed;
    const lead = 0.55 + s.skill * 0.45;
    const spread = 4 + (1 - s.skill) * 9 + foe.speed * 0.4 + d * 0.03;
    b.errT -= dt;
    if (b.errT <= 0) { b.errT = 0.4 + r() * 0.8; b.etx = (r() - 0.5) * spread * 2; b.etz = (r() - 0.5) * spread * 2; }
    b.errX += (b.etx - b.errX) * Math.min(1, dt * 4);
    b.errZ += (b.etz - b.errZ) * Math.min(1, dt * 4);
    const crit = !def.lob && s.skill > 0.75 && (b.burst | 0) % 3 === 0;
    inp.aimPoint = [foe.x + foe.vx * T * lead + b.errX, def.lob ? 0 : crit ? 11 : 2.2, foe.z + foe.vz * T * lead + b.errZ];
    const inSight = def.lob || this.los(s.x, s.z, foe.x, foe.z);
    if (b.react > 0 || !inSight || d > def.range * 1.02 || s.useSlot >= 0) return;
    // bursts for the automatic guns, aimed shots for the rest
    b.burst += dt;
    const cycle = def.auto ? (w.kind === 'repeater' ? 1.6 : 2.6) : 1;
    if (def.auto ? b.burst % cycle < cycle * 0.72 : r() < dt * (2 + s.skill * 4)) inp.fire = true;
  }
}
