// WP26 the harbour, which is the menu: a calm lamp-lit scene at dusk drawn on parchment — the player's ship at her
// mooring with the gull on the masthead — with the set-sail seal over the harbour mouth and parchment tags for the
// shipwright, the gull, the league, the nine captains, the career chart and the settings. Each opens as a ledger
// unrolled over the harbour, its heading inked in by the quill (at once with reduced motion). Layout and rules are
// in cards.ts (tested in Node); this file draws them and answers touches.
import * as THREE from 'three';
import { saveCareer } from '../app/save.ts';
import { TRAITS, type Trait } from '../career/league.ts';
import { GULL_PRICES } from '../career/progress.ts';
import { newCareer, type Career } from '../career/state.ts';
import { chartInked } from '../career/voyage.ts';
import type { InkText, InkTextOptions } from '../lettering/ink.ts';
import { drop, emblemSheet, gullMarks, gullSheet, harbourArt, sheetMesh, shipSheet, type GullMarks, type HarbourArt } from '../render/harbourScene.ts';
import {
  LABELS, PARENT, SETTING_ROWS, SETTING_WORDS, TITLES, formChoices, gullRows, harbourAct, harbourLayout, hit, leagueRows, nineCards, statusLine,
  type HarbourLayout, type Page, type Target,
} from './cards.ts';
import { ButtonBase, Scrap, type ScrapOptions } from './parchment.ts';
import type { Rect, View } from './safeArea.ts';
import { STEPS, applySettings, onSettings, setSettings, setUiSound, settings, uiSound, type Settings, type UiSound } from './settings.ts';
import type { Runtime, Screen, ScreenContext } from './shell.ts';

/** WP27 seam: the career chart's view, drawn into the ledger's body when the player unrolls it. */
export type ChartPage = (ctx: ScreenContext, body: Rect, career: Career) => THREE.Object3D;
let chartPage: ChartPage | null = null;
export const setChartPage = (f: ChartPage | null): void => { chartPage = f; };

const BARE = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() };
const ORDER = { page: 0, seal: 4, tag: 5, ledger: 7, card: 8, ink: 9, note: 10 } as const;
const VOLUME_WORDS = ['Silent', 'Soft', 'Half', 'Strong', 'Full'];
const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v'];
const WHY = { chosen: 'She is already yours', top: 'The gull has mastered it', short: 'Not enough treasure in the strongbox' } as const;

interface Volumes { setVolumes(v: { sound?: number; music?: number }): void }
type Bag = Record<string, unknown> | null | undefined;
/** The game's audio (WP28), duck-typed: whatever carries setVolumes and ui(), itself or its engine. */
function audioOf(rt: Runtime): { volumes: Volumes | null; ui: ((n: UiSound) => void) | null } {
  const a = (rt as unknown as { audio?: Bag }).audio;
  let volumes: Volumes | null = null, ui: ((n: UiSound) => void) | null = null;
  for (const c of [a, a?.engine as Bag]) {
    if (!c) continue;
    if (!volumes && typeof c.setVolumes === 'function') volumes = c as unknown as Volumes;
    if (!ui && typeof c.ui === 'function') { const f = c.ui as (n: UiSound) => unknown; ui = (n) => { f.call(c, n); }; }
  }
  return { volumes, ui };
}

const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0]! >>> 1;
const marksOf = (c: Career): GullMarks => gullMarks(TRAITS.map((t) => c.player.gull[t]), TRAITS.map((t) => GULL_PRICES[t].length));

export function harbour(ctx: ScreenContext): Screen {
  const ui = new THREE.Group(), scene = new THREE.Group(), home = new THREE.Group(), leaf = new THREE.Group();
  ui.add(scene, home, leaf);
  const style = ctx.pipeline.style, rt = ctx.runtime;
  const holder = rt as unknown as { career?: Career | null };
  const audio = audioOf(rt);
  setUiSound(audio.ui);
  const unhear = onSettings((s) => applySettings(s, { audio: audio.volumes }));
  let preview: Career | null = null;
  const career = (): Career => holder.career ?? (preview ??= newCareer(1));
  const live = (): boolean => !!holder.career;
  let shown = holder.career;

  let view: View | null = null, page: Page = 'home', L: HarbourLayout | null = null, H: HarbourLayout | null = null;
  let art: HarbourArt | null = null, artKey = '';
  let seal: ButtonBase | null = null;
  let clock = 0, unroll = 1;
  let note: InkText | null = null, noteAt = -9;
  let finger: { id: number; target: Target } | null = null;
  const inking: { t: InkText; delay: number; at: number | null }[] = [];

  const text = (parent: THREE.Object3D, content: string, o: InkTextOptions, x: number, y: number, order: number = ORDER.ink, ink = false): InkText => {
    const t = ctx.lettering.text(content, o);
    t.position.set(x, y, 0);
    t.renderOrder = order;
    parent.add(t);
    if (ink && !settings().reducedMotion) { t.progress = 0; inking.push({ t, delay: inking.length * 0.06, at: null }); }
    return t;
  };
  const scrap = (parent: THREE.Object3D, rc: Rect, order: number, o: Partial<ScrapOptions> = {}): Scrap => {
    const sc = new Scrap(style, { width: rc.width, height: rc.height, torn: [0.3, 0.5, 0.3, 0.5], frame: 'rule', age: 0.3, ...o });
    sc.position.set(rc.x + rc.width / 2, rc.y + rc.height / 2, 0);
    sc.renderOrder = order;
    parent.add(sc);
    return sc;
  };
  const tag = (parent: THREE.Object3D, t: Rect, label: string, o: { dim?: boolean; pigment?: 'vermilion' | 'verdigris'; ink?: boolean } = {}, base: number = ORDER.tag): InkText => {
    const s = (L ?? H)!.s;
    scrap(parent, t, base, { torn: [0.4, 0.6, 0.4, 0.6], age: 0.2 });
    const opts: InkTextOptions = { size: Math.min(t.height * 0.46, 21 * s), align: 'center', valign: 'middle', opacity: o.dim ? 0.4 : 1, ...(o.pigment ? { pigment: o.pigment } : {}) };
    return text(parent, label, opts, t.x + t.width / 2, t.y + t.height / 2, base + 1, o.ink);
  };

  function buildArt(): void {
    const v = view!, c = career(), key = `${v.width}x${v.height}:${c.player.form}:${marksOf(c).marks?.length ?? 0}`;
    if (key === artKey) return;
    artKey = key;
    drop(scene);
    const sheet0 = new Scrap(style, { width: v.width, height: v.height, torn: [0, 0, 0, 0], age: 0.22 });
    sheet0.position.set(v.width / 2, v.height / 2, 0);
    sheet0.renderOrder = ORDER.page;
    scene.add(sheet0);
    art = harbourArt(v.width, v.height, c.player.form, marksOf(c), v.dpr);
    scene.add(art.group);
    ctx.pipeline.registerTexture('harbour', art.bytes);
  }

  function buildHome(): void {
    drop(home);
    const l = H!, c = career(), sl = l.seal!;
    home.visible = page === 'home';
    seal = new ButtonBase(style, sl.r);
    seal.position.set(sl.x, sl.y, 0);
    seal.renderOrder = ORDER.seal;
    home.add(seal);
    text(home, 'Set sail', { size: Math.max(17, sl.r * 0.5), align: 'center', valign: 'top' }, sl.x, sl.y + sl.r * 1.22, ORDER.tag + 1, true);
    for (const t of l.targets) if (t.kind === 'link') tag(home, t, LABELS[t.key as Page], { ink: true });
    text(home, statusLine(c), { size: l.status!.size, align: 'left', valign: 'middle' }, l.status!.x, l.status!.y, ORDER.tag + 1, true);
  }

  function buildLeaf(fresh: boolean): void {
    drop(leaf);
    note = null;
    leaf.scale.set(1, 1, 1);
    leaf.position.set(0, 0, 0);
    if (page === 'home' || !L?.ledger || !L.body || !L.heading) return;
    const l = L, s = l.s, B = l.body!, hd = l.heading!, c = career(), v = view!, cx = B.x + B.width / 2;
    const T = (id: string): Target => l.targets.find((t) => t.id === id)!;
    scrap(leaf, l.ledger!, ORDER.ledger, { torn: [0.12, 0.2, 0.12, 0.2], frame: 'double', age: 0.35 });
    text(leaf, TITLES[page], { size: hd.size, align: 'center', valign: 'middle', swash: true }, hd.x, hd.y, ORDER.ink, fresh);
    tag(leaf, T('back'), 'Back', {}, ORDER.card);
    switch (page) {
      case 'shipwright':
        formChoices(c).forEach((f, i) => {
          const cell = l.cells[i]!;
          scrap(leaf, cell, ORDER.card, { frame: f.chosen ? 'double' : 'rule', age: f.unlocked ? 0.25 : 0.6 });
          const sh = sheetMesh(shipSheet(cell.width - 16 * s, cell.height * 0.6, f.form, v.dpr), f.unlocked ? 1 : 0.3);
          sh.position.set(cell.x + cell.width / 2, cell.y + 8 * s + cell.height * 0.3, 0);
          sh.renderOrder = ORDER.ink;
          leaf.add(sh);
          text(leaf, f.name, { size: Math.min(26 * s, cell.width * 0.17), align: 'center', valign: 'middle', swash: true, opacity: f.unlocked ? 1 : 0.5 }, cell.x + cell.width / 2, cell.y + cell.height * 0.74);
          text(leaf, f.chosen ? 'Your ship' : f.unlocked ? 'Choose her' : `Unlocks at ${f.unlocksAt}`,
            { size: 14 * s, align: 'center', valign: 'middle', opacity: f.unlocked ? 1 : 0.6, ...(f.chosen ? { pigment: 'vermilion' as const } : {}) }, cell.x + cell.width / 2, cell.y + cell.height * 0.88);
        });
        break;
      case 'gull': {
        const P = l.cells[0]!;
        scrap(leaf, P, ORDER.card, { frame: 'rule', age: 0.25 });
        const gm = sheetMesh(gullSheet(P.width - 16 * s, P.height - 44 * s, marksOf(c), v.dpr));
        gm.position.set(P.x + P.width / 2, P.y + 8 * s + (P.height - 44 * s) / 2, 0);
        gm.renderOrder = ORDER.ink;
        leaf.add(gm);
        text(leaf, `Treasure ${c.player.treasure}`, { size: 17 * s, align: 'center', valign: 'middle', pigment: 'sepia' }, P.x + P.width / 2, P.y + P.height - 20 * s);
        gullRows(c).forEach((g, i) => {
          const row = l.cells[i + 1]!;
          text(leaf, `${g.name}  ${g.level ? `${ROMAN[g.level]} of ${ROMAN[g.max]}` : 'untrained'}`, { size: 19 * s, align: 'left', valign: 'baseline' }, row.x + 6 * s, row.y + row.height * 0.46);
          text(leaf, g.does, { size: 13.5 * s, align: 'left', valign: 'baseline', opacity: 0.8 }, row.x + 6 * s, row.y + row.height * 0.82);
          tag(leaf, T(`trait:${g.trait}`), g.price === null ? 'Mastered' : `Train · ${g.price}`, { dim: !g.affordable }, ORDER.card);
        });
        break;
      }
      case 'league':
        leagueRows(c).forEach((row, i) => {
          const cell = l.cells[i]!, size = Math.min(cell.height * 0.56, 15 * s);
          const pig = row.player ? { pigment: 'vermilion' as const } : row.drawn ? { pigment: 'verdigris' as const } : {};
          text(leaf, `${row.place}. ${row.name}`, { size, align: 'left', valign: 'middle', ...pig }, cell.x + 6 * s, cell.y + cell.height / 2);
          text(leaf, `${row.wind} ${row.points}`, { size: size * 0.88, align: 'right', valign: 'middle', opacity: 0.8, ...pig }, cell.x + cell.width - 12 * s, cell.y + cell.height / 2);
        });
        tag(leaf, T('link:captains'), LABELS.captains, { pigment: 'verdigris' }, ORDER.card);
        break;
      case 'captains':
        nineCards(c).forEach((k, i) => {
          const cell = l.cells[i]!, u = Math.min(12.5 * s, cell.height / 11.5), pad = 8 * s, x = cell.x + pad, mw = cell.width - 2 * pad;
          scrap(leaf, cell, ORDER.card, { frame: 'rule', age: 0.3, torn: [0.25, 0.35, 0.25, 0.35] });
          const ew = u * 2.4, eh = u * 2.9, em = sheetMesh(emblemSheet(ew, eh, k.pigments, k.emblem, v.dpr));
          em.position.set(cell.x + cell.width - pad - ew / 2, cell.y + pad + eh / 2, 0);
          em.renderOrder = ORDER.ink;
          leaf.add(em);
          text(leaf, k.name, { size: u * 1.7, align: 'left', valign: 'top', swash: true }, x, cell.y + pad);
          text(leaf, `“${k.meaning}”`, { size: u, align: 'left', valign: 'top', opacity: 0.8 }, x, cell.y + pad + u * 1.95);
          text(leaf, k.temperament, { size: u, align: 'left', valign: 'top' }, x, cell.y + pad + u * 3.35);
          text(leaf, `${k.form} · ${k.wind}`, { size: u, align: 'left', valign: 'top' }, x, cell.y + pad + u * 4.6);
          text(leaf, k.line, { size: u * 0.95, align: 'left', valign: 'top', maxWidth: mw, lineHeight: 1.15 }, x, cell.y + pad + u * 6.0);
          text(leaf, k.record, { size: u * 0.9, align: 'left', valign: 'bottom', maxWidth: mw, opacity: 0.85, pigment: 'sepia' }, x, cell.y + cell.height - pad);
        });
        break;
      case 'chart': {
        if (chartPage) { leaf.add(chartPage(ctx, B, c)); break; }
        const inked = chartInked(c), pct = inked.length ? Math.round(inked.reduce((a, b) => a + b, 0) / inked.length / 10) : 0;
        text(leaf, `Your portolan: ${pct}% of the world inked`, { size: 22 * s, align: 'center', valign: 'middle' }, cx, B.y + B.height * 0.4);
        text(leaf, 'Every coast you sight is drawn in; sail, and the chart fills.', { size: 16 * s, align: 'center', valign: 'middle', opacity: 0.8 }, cx, B.y + B.height * 0.56);
        break;
      }
      case 'settings': {
        const st = settings();
        SETTING_ROWS.forEach((k, i) => {
          const row = l.cells[i]!;
          text(leaf, SETTING_WORDS[k], { size: 20 * s, align: 'left', valign: 'middle' }, row.x + 6 * s, row.y + row.height / 2);
        });
        for (const t of l.targets) {
          if (t.kind === 'level') {
            const level = Math.round(st[t.key as 'sound' | 'music'] * (STEPS - 1)), lit = (t.value ?? 0) <= level;
            const b = new ButtonBase(style, Math.min(t.width, t.height) * 0.3);
            b.position.set(t.x + t.width / 2, t.y + t.height / 2, 0);
            b.renderOrder = ORDER.ink;
            b.pressed = lit ? 1 : 0;
            b.disabled = lit ? 0 : 0.55;
            leaf.add(b);
            if (t.value === STEPS - 1) text(leaf, VOLUME_WORDS[level]!, { size: 15 * s, align: 'left', valign: 'middle', opacity: 0.8 }, t.x + t.width + 10 * s, t.y + t.height / 2);
          } else if (t.kind === 'toggle') {
            const on = st[t.key as 'haptics' | 'reducedMotion'];
            tag(leaf, t, on ? 'On' : 'Off', on ? { pigment: 'verdigris' } : {}, ORDER.card);
          }
        }
        tag(leaf, T('link:credits'), LABELS.credits, {}, ORDER.card);
        tag(leaf, T('link:reset'), LABELS.reset, { pigment: 'vermilion' }, ORDER.card);
        break;
      }
      case 'credits': {
        const lines = [
          'Drawn, lettered, voiced and sailed in code: the planet, the ships, the sea and this hand.',
          'three.js · Vite · Capacitor',
          'Every library, with its source and its licence, is listed in CREDITS.md.',
        ];
        text(leaf, 'Portolan', { size: 34 * s, align: 'center', valign: 'middle', swash: true }, cx, B.y + B.height * 0.16);
        lines.forEach((ln, i) => text(leaf, ln, { size: 16 * s, align: 'center', valign: 'top', maxWidth: B.width * 0.8 }, cx, B.y + B.height * (0.36 + i * 0.18)));
        break;
      }
      case 'reset':
        text(leaf, 'Begin a new career?', { size: 26 * s, align: 'center', valign: 'middle', swash: true }, cx, B.y + B.height * 0.2);
        text(leaf, 'Your rank, your treasure, your gull and your chart are forgotten, and the league is drawn anew. Your settings are kept.',
          { size: 16 * s, align: 'center', valign: 'top', maxWidth: B.width * 0.75 }, cx, B.y + B.height * 0.34);
        tag(leaf, T('confirm:yes'), 'Begin anew', { pigment: 'vermilion' }, ORDER.card);
        tag(leaf, T('confirm:no'), 'Keep sailing', {}, ORDER.card);
        break;
      default:
        break;
    }
  }

  function showNote(msg: string): void {
    if (note) { leaf.remove(note); note.dispose(); note = null; }
    const l = L;
    if (!l?.ledger) return;
    note = text(leaf, msg, { size: 15 * l.s, align: 'center', valign: 'bottom', pigment: 'vermilion' }, l.ledger.x + l.ledger.width / 2, l.ledger.y + l.ledger.height - 8 * l.s, ORDER.note);
    noteAt = clock;
  }

  function commit(c: Career): void {
    holder.career = c;
    shown = c;
    void saveCareer(c).catch(() => {});
  }

  function go(p: Page, sound: UiSound): void {
    page = p;
    uiSound(sound);
    L = p === 'home' ? H : harbourLayout(view!, p);
    unroll = settings().reducedMotion || p === 'home' ? 1 : 0;
    buildHome();
    buildLeaf(true);
  }

  function act(t: Target): void {
    switch (t.kind) {
      case 'sail':
        if (rt.world && live()) { uiSound('confirm'); rt.setSail(); }
        return;
      case 'link': go(t.key as Page, 'page'); return;
      case 'back': go(PARENT[page] ?? 'home', 'back'); return;
      case 'form':
      case 'trait': {
        if (!live()) { showNote('The harbour master is still at his ledgers'); return; }
        const r = harbourAct(career(), t.kind === 'form' ? { kind: 'form', form: t.value ?? 0 } : { kind: 'gull', trait: t.key as Trait });
        if (!r.ok) {
          uiSound('tap');
          showNote(r.why === 'locked' ? `The shipwright builds her when you reach ${formChoices(career())[t.value ?? 0]?.unlocksAt}` : WHY[r.why ?? 'short']);
          return;
        }
        commit(r.career);
        uiSound('quill');
        buildArt();
        buildHome();
        buildLeaf(false);
        return;
      }
      case 'level':
        void setSettings({ [t.key as 'sound' | 'music']: (t.value ?? 0) / (STEPS - 1) } as Partial<Settings>);
        uiSound('tap');
        buildLeaf(false);
        return;
      case 'toggle': {
        const k = t.key as 'haptics' | 'reducedMotion';
        void setSettings({ [k]: !settings()[k] } as Partial<Settings>);
        uiSound('tap');
        buildLeaf(false);
        return;
      }
      case 'confirm':
        if (t.key === 'yes') { commit(newCareer(randomSeed())); uiSound('confirm'); buildArt(); go('home', 'page'); }
        else go('settings', 'back');
        return;
    }
  }

  return {
    ...BARE,
    ui,
    layout(v) {
      view = v;
      H = harbourLayout(v, 'home');
      L = page === 'home' ? H : harbourLayout(v, page);
      artKey = '';
      buildArt();
      buildHome();
      buildLeaf(false);
    },
    frame(f) {
      clock = f.clock;
      const still = settings().reducedMotion;
      if (holder.career !== shown) { shown = holder.career; buildArt(); buildHome(); buildLeaf(false); }
      art?.frame(f.clock, still);
      if (seal) {
        seal.disabled = rt.world && live() ? 0 : 1;
        seal.pressed = finger?.target.kind === 'sail' ? 1 : 0;
      }
      unroll = Math.min(1, unroll + f.dt / 0.34);
      const e = 1 - Math.pow(1 - unroll, 3);
      if (L?.ledger) {
        leaf.scale.y = Math.max(0.03, e);
        leaf.position.y = L.ledger.y * (1 - leaf.scale.y);
      }
      for (let i = inking.length - 1; i >= 0; i--) {
        const k = inking[i]!;
        if (!k.t.parent) { inking.splice(i, 1); continue; }
        k.at ??= clock + k.delay;
        k.t.progress = still ? 1 : (clock - k.at) / Math.max(0.05, k.t.duration);
        if (k.t.progress >= 1) inking.splice(i, 1);
      }
      if (note && clock - noteAt > 2.6) { leaf.remove(note); note.dispose(); note = null; }
    },
    touch(t) {
      if (!L) return;
      if (t.phase === 'down') {
        if (!finger) { const h = hit(L, t.x, t.y); if (h) finger = { id: t.id, target: h }; }
        return;
      }
      if (!finger || t.id !== finger.id || t.phase === 'move') return;
      const target = finger.target;
      finger = null;
      if (t.phase === 'up' && hit(L, t.x, t.y)?.id === target.id) act(target);
    },
    dispose() {
      drop(ui);
      unhear();
      setUiSound(null);
      ctx.pipeline.registerTexture('harbour', 0);
    },
  };
}
