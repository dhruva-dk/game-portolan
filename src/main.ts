// Portolan: boot, the harbour, a match, the results, and round again.
import { Stage } from './scene.ts';
import { QUALITY } from './gfx/engine.ts';
import { Match, PARCELS } from './game.ts';
import { Bots } from './bots.ts';
import { UI, loadProfile, saveProfile, type Summary } from './ui.ts';
import { Sound } from './audio.ts';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const profile = loadProfile();
const bootBar = document.querySelector<HTMLElement>('.boot .progress i');
const bootWhat = document.querySelector<HTMLElement>('.boot .what');
const stage = await Stage.create(canvas, QUALITY[q.get('q') ?? profile.settings.quality] ?? QUALITY.balanced, (f, what) => {
  if (bootBar) bootBar.style.transform = `scaleX(${f})`;
  if (bootWhat && what) bootWhat.textContent = what;
});
const sound = new Sound(profile.settings.music, profile.settings.sfx);

const HARBOUR_WEATHER = 2; // golden hour
type State = 'harbour' | 'match' | 'results';
let state: State = 'harbour';
let match: Match | null = null;
let bots: Bots | null = null;
let auto = q.get('auto') === '1';
let overT = 0;
let speed = 1;

const ui = new UI(document.getElementById('ui')!, stage, profile, {
  play: () => sail(),
  again: () => sail(),
  leave: () => finish(),
  harbour: () => harbour(),
  paused: (on) => sound.pause(on),
  look: () => stage.showcase(profile.look, profile.gull),
  settings: () => {
    stage.engine.setQuality(QUALITY[profile.settings.quality] ?? QUALITY.balanced);
    sound.setVolumes(profile.settings.music, profile.settings.sfx);
  },
  sound: (k) => sound.ui(k),
});

/** The weather for a voyage: mostly fair, sometimes a squall or the night. */
function pickWeather(seed: number): number {
  const r = (seed * 9301 + 49297) % 233280 / 233280;
  const w = [0.22, 0.3, 0.22, 0.13, 0.13];
  let a = 0;
  for (let i = 0; i < w.length; i++) if (r < (a += w[i])) return i;
  return 1;
}

function harbour(): void {
  state = 'harbour';
  match = null;
  bots = null;
  stage.unbind();
  stage.setWeather(HARBOUR_WEATHER);
  stage.showcase(profile.look, profile.gull);
  ui.showHarbour();
}

function sail(seed = q.has('seed') ? Number(q.get('seed')) : Math.floor(Math.random() * 1e6)): void {
  const w = q.has('w') ? Number(q.get('w')) : pickWeather(seed);
  stage.setWeather(w);
  stage.endShowcase();
  match = new Match(stage.world, { seed, count: 24, playerName: profile.settings.name, playerLook: 1 });
  bots = new Bots(match, seed, auto);
  stage.bind(match, profile.look);
  stage.gull.setLook(profile.gull);
  ui.startMatch(match);
  state = 'match';
  overT = 0;
}

/** Off the water: the results over the harbour. */
function finish(): void {
  if (!match) return;
  const m = match, me = m.me;
  const killer = !me.alive && me.killer >= 0 && me.killer !== me.id ? m.ships[me.killer].name : null;
  const s: Summary = {
    place: me.alive ? (m.over && m.winner === m.player ? 1 : m.alive) : me.place,
    count: m.ships.length, kills: me.kills, dealt: me.dealt, glimmer: glimmerEarned(m), survived: me.survived,
    win: m.over && m.winner === m.player, killer,
  };
  ui.endMatch();
  match = null;
  bots = null;
  state = 'results';
  stage.unbind();
  stage.setWeather(HARBOUR_WEATHER);
  stage.showcase(profile.look, profile.gull);
  ui.showResults(s);
}

// glimmer earned is glimmer held plus what was spent on the gull
const spent = new WeakMap<Match, number>();
const glimmerEarned = (m: Match) => m.me.glimmer + (spent.get(m) ?? 0);

// a test and look-dev hook
const hook = {
  ready: false,
  stage, ui, profile,
  get match() { return match; },
  get state() { return state; },
  view(x: number, y: number, z: number, tx: number, ty: number, tz: number) {
    stage.free = true;
    stage.camera.position.set(x, y, z);
    stage.camera.lookAt(tx, ty, tz);
    stage.focus.set(tx, ty, tz);
  },
  follow() { stage.free = false; },
  weather(i: number) { stage.setWeather(i); },
  speed(k: number) { speed = k; },
  /** Advances the match without drawing, for skipping ahead in tests. */
  skip(seconds: number) {
    if (!match || !bots) return;
    for (let t = 0; t < seconds; t += 1 / 30) { bots.update(1 / 30); match.step(1 / 30); match.events.length = 0; }
  },
  sail(seed?: number, pilot?: boolean) { if (pilot !== undefined) auto = pilot; sail(seed); },
  restart(seed: number) { sail(seed); },
  finish,
  harbour,
};
(window as unknown as { __tidefall: typeof hook }).__tidefall = hook;

// leaving the app pauses the voyage
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'match' && !ui.paused) ui.setPaused(true); });

if (q.get('play') === '1' || auto) sail();
else harbour();
saveProfile(profile);

let last = performance.now();
const loop = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state === 'match' && match && bots) {
    const m = match;
    const step = ui.paused ? 0 : dt * speed;
    if (step > 0) {
      if (!auto && m.me.alive && ui.controls.enabled) ui.controls.apply(m, stage, dt);
      bots.update(step);
      m.step(step);
      for (const e of m.events) if (e.t === 'hail' && e.ship === m.player) spent.set(m, (spent.get(m) ?? 0) + PARCELS[e.tier].cost);
    }
    stage.sync(m, m.events, step);
    ui.frame(m, m.events, dt);
    sound.react(m, m.events, stage);
    m.events.length = 0;
    sound.update(m, stage, dt);
    if (m.over && !ui.paused) {
      overT += dt;
      if (overT > (m.winner === m.player ? 5 : 6)) finish();
    }
  } else {
    stage.idle(dt);
    sound.update(null, stage, dt);
  }
  stage.frame(dt);
  hook.ready = true;
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
