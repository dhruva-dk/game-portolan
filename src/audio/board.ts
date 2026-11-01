// The sound board behind dev/audio.html: a button for every sound, the moments that layer several, a pad to place
// sounds around the listener, the volumes, and an ambience mixer with a slider per region and per weather.
// It lives here rather than in dev/ so the typecheck covers it; nothing in the game imports it.
//
// URL parameters (all optional):
//   ?region=fjords            start the ambience in a region (several: fjords:0.6,mistwood:0.4)
//   &weather=fog:0.7,rain:0.3 weather strengths
//   &night=1 &wind=1.4 &surf=0.5 &speed=8 &rough=1 &altitude=0 &storm=0 &vortex=0
//   &tour=1                   tour the regions, 14 s each
//   &worker=0                 render the bank on the main thread instead of the worker
import { createAudio, GROUPS, LOOPS, REGION_IDS, SOUND_NAMES, SOUNDS, WEATHERS, FIRE, CONSUMABLE, ABILITY, type AmbienceMix, type Audio, type RegionId, type SoundName, type Vec3, type Weather, type WeaponClass, type Consumable } from './index.ts';

const RADIUS = 554;
const EYE = 3; // the listener's height above the sea, m

type Knob = 'nearSurf' | 'wind' | 'speed' | 'rough' | 'altitude' | 'storm' | 'night' | 'vortex';
const KNOBS: [Knob, string, number, number, number][] = [
  ['nearSurf', 'Near surf', 0, 1, 0], ['wind', 'Wind', 0, 2, 1], ['speed', 'Speed m/s', 0, 20, 6], ['rough', 'Sea roughness', 0, 2, 1],
  ['altitude', 'Altitude m', 0, 300, 0], ['storm', 'In the Storm', 0, 1, 0], ['night', 'Night', 0, 1, 0], ['vortex', 'Toward the Eye', 0, 1, 0],
];
const URL_KNOB: Record<string, Knob> = { surf: 'nearSurf', wind: 'wind', speed: 'speed', rough: 'rough', altitude: 'altitude', storm: 'storm', night: 'night', vortex: 'vortex' };

const $ = <T extends HTMLElement>(sel: string): T => {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error(`sound board: missing ${sel}`);
  return e;
};
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};
const pairs = (s: string | null): [string, number][] =>
  (s ?? '').split(',').filter(Boolean).map((p) => { const [k, v] = p.split(':'); return [k, v === undefined ? 1 : Number(v)] as [string, number]; });

function slider(host: HTMLElement, label: string, min: number, max: number, value: number, onInput: (v: number) => void): { input: HTMLInputElement; set(v: number): void } {
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String((max - min) / 100), value: String(value) });
  const out = el('output', { textContent: value.toFixed(2) });
  input.dataset.name = label;
  const show = (): void => { out.textContent = Number(input.value).toFixed(max >= 10 ? 0 : 2); };
  input.addEventListener('input', () => { show(); onInput(Number(input.value)); });
  host.append(el('label', {}, el('span', { textContent: label }), input, out));
  show();
  return { input, set(v) { input.value = String(v); show(); } };
}

/** A point on the sea's surface, d metres from the listener along the bearing (dx right, dy ahead). */
function surfacePoint(dx: number, dy: number, d: number, height = 2): Vec3 {
  const len = Math.hypot(dx, dy) || 1, a = d / RADIUS, r = RADIUS + height;
  return { x: r * Math.sin(a) * (dx / len), y: r * Math.sin(a) * (dy / len), z: r * Math.cos(a) };
}

export function mountBoard(): Audio {
  const q = new URLSearchParams(location.search);
  const audio = createAudio({ radius: RADIUS, worker: q.get('worker') !== '0' });
  const engine = audio.engine;
  // the listener sits at the north pole facing +y, so the pad's right is +x and its up is +y
  audio.setListener({ x: 0, y: 0, z: RADIUS + EYE }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
  audio.unlock();
  (window as unknown as { __audio: Audio }).__audio = audio;

  const lock = $('#lock');
  const rarity = $<HTMLSelectElement>('#rarity'), level = $<HTMLInputElement>('#level'), own = $<HTMLInputElement>('#own');
  const log = $('#log');

  // where a positioned sound plays
  let where: { dx: number; dy: number; d: number } = { dx: 0, dy: 1, d: 60 };
  const pos = (): Vec3 | null => (own.checked ? null : surfacePoint(where.dx, where.dy, where.d));
  const pad = $('#pad'), dot = $('#dot'), whereText = $('#where');
  const MAXD = 700, toD = (t: number): number => MAXD * t * t, fromD = (d: number): number => Math.sqrt(d / MAXD);
  for (const d of [50, 150, 300, 600]) {
    const s = fromD(d) * 100;
    pad.append(el('div', { className: 'ring' }, el('span', { textContent: `${d} m` })));
    Object.assign((pad.lastElementChild as HTMLElement).style, { left: `${50 - s / 2}%`, top: `${50 - s / 2}%`, width: `${s}%`, height: `${s}%` });
  }
  const placeDot = (): void => {
    const t = fromD(where.d) / 2, len = Math.hypot(where.dx, where.dy) || 1;
    dot.style.left = `${50 + 100 * t * (where.dx / len)}%`;
    dot.style.top = `${50 - 100 * t * (where.dy / len)}%`;
    whereText.textContent = own.checked
      ? 'Your own: centred and whole. Untick "your own" to place sounds on the circle.'
      : `${Math.round(where.d)} m away, ${Math.round(((Math.atan2(where.dx, where.dy) * 180) / Math.PI + 360) % 360)}° off the bow.`;
  };
  pad.addEventListener('pointerdown', (e) => {
    const r = pad.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = 0.5 - (e.clientY - r.top) / r.height;
    const t = Math.min(1, 2 * Math.hypot(x, y));
    where = { dx: x, dy: y, d: Math.max(1, toD(t)) };
    own.checked = false;
    placeDot();
  });
  own.addEventListener('change', placeDot);
  placeDot();

  const flash = (b: HTMLElement): void => { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 180); };
  const opts = (): { rarity: number; level: number } => ({ rarity: Number(rarity.value), level: Math.min(0.999, Number(level.value)) });

  // a button for every sound, grouped; loops toggle
  const loops = new Map<SoundName, number>();
  const sounds = $('#sounds');
  const moments = el('section', {}, el('h2', { textContent: 'Moments (several sounds together)' }));
  const momentGrid = el('div', { className: 'grid' });
  moments.append(momentGrid);
  sounds.append(moments);
  const moment = (label: string, f: () => void): void => {
    const b = el('button', { textContent: label });
    b.addEventListener('click', () => { flash(b); f(); });
    momentGrid.append(b);
  };
  for (const w of Object.keys(FIRE) as WeaponClass[]) {
    moment(`Fire ${w}`, () => audio.fire(w, { pos: pos(), rarity: opts().rarity }));
  }
  moment('Volley and impacts', () => {
    const p = pos();
    audio.fire('cannon', { pos: p, rarity: opts().rarity });
    const at = surfacePoint(where.dx + 0.3, where.dy + 1, 160);
    setTimeout(() => audio.impact('water', { pos: at, weapon: 'cannon' }), 700);
    setTimeout(() => audio.impact('ship', { pos: at, weapon: 'cannon', crit: true }), 900);
  });
  moment('Mortar: whistle, then blast', () => {
    const at = pos() ?? surfacePoint(0.2, 1, 40);
    audio.fire('mortar', { rarity: opts().rarity });
    audio.whistle(at, 2.2);
    setTimeout(() => audio.impact('land', { pos: at, weapon: 'mortar' }), 2200);
  });
  moment('Shield worn down, then broken', () => {
    const p = pos();
    [0, 0.3, 0.55, 0.75, 0.9].forEach((lv, i) => setTimeout(() => audio.shieldHit({ pos: p, level: lv }), i * 420));
    setTimeout(() => audio.shieldBreak(p), 5 * 420 + 150);
  });
  moment('Shield hit at level', () => audio.shieldHit({ pos: pos(), level: opts().level }));
  moment('Shield break', () => audio.shieldBreak(pos()));
  for (const c of Object.keys(CONSUMABLE) as Consumable[]) {
    moment(`Use ${c} (3 s)`, () => { const u = audio.use(c, 3, pos()); setTimeout(() => u.finish(), 3000); });
  }
  moment('Use, interrupted', () => { const u = audio.use('repairKit', 3, pos()); setTimeout(() => u.cancel(), 1300); });
  moment('12 coins', () => audio.coins(12, pos()));
  moment('40 coins', () => audio.coins(40, pos()));
  for (const [ab, name] of Object.entries(ABILITY)) moment(`Ability ${ab}`, () => audio.play(name, { pos: pos() }));
  moment('Orbit a burning ship', () => {
    const id = audio.loop('burning', {});
    const t0 = performance.now();
    const step = (): void => {
      const a = ((performance.now() - t0) / 6000) * Math.PI * 2;
      if (a > Math.PI * 2) { audio.stop(id, 0.5); return; }
      audio.move(id, surfacePoint(Math.sin(a), Math.cos(a), 45));
      requestAnimationFrame(step);
    };
    step();
  });

  for (const [group, names] of Object.entries(GROUPS)) {
    const grid = el('div', { className: 'grid' });
    sounds.append(el('section', {}, el('h2', { textContent: `${group} (${names.length})` }), grid));
    for (const name of names) {
      const d = SOUNDS[name], b = el('button', { title: `${name}: ${d.bus} bus, ${d.variants} variant${d.variants > 1 ? 's' : ''}${d.grade !== 'random' ? `, by ${d.grade}` : ''}` }, name);
      b.dataset.sound = name;
      if (d.variants > 1) b.append(el('small', { textContent: `×${d.variants}` }));
      if (d.loop) b.classList.add('loop');
      b.addEventListener('click', () => {
        if (d.loop) {
          const id = loops.get(name);
          if (id) { audio.stop(id, 0.6); loops.delete(name); b.classList.remove('on'); return; }
          const nid = audio.loop(name, { pos: pos(), ...opts() });
          if (nid) { loops.set(name, nid); b.classList.add('on'); }
          return;
        }
        flash(b);
        audio.play(name, { pos: pos(), ...opts() });
      });
      grid.append(b);
    }
  }
  const stopAll = el('button', { textContent: 'Stop every loop' });
  stopAll.addEventListener('click', () => {
    for (const id of loops.values()) audio.stop(id, 0.4);
    loops.clear();
    document.querySelectorAll('button.loop.on').forEach((b) => b.classList.remove('on'));
  });
  momentGrid.append(stopAll);

  // volumes
  const vols = $('#volumes'), volume: Record<'master' | 'effects' | 'ambience' | 'interface', number> = { master: 1, effects: 1, ambience: 1, interface: 1 };
  for (const k of Object.keys(volume) as (keyof typeof volume)[]) {
    slider(vols, k[0].toUpperCase() + k.slice(1), 0, 1, 1, (v) => { volume[k] = v; audio.setVolumes({ [k]: v }); });
  }

  // the ambience mixer
  const mixer = $('#mixer');
  const regions: Partial<Record<RegionId, number>> = {}, weather: Partial<Record<Weather, number>> = {};
  const knobs: Record<Knob, number> = Object.fromEntries(KNOBS.map(([k, , , , v]) => [k, v])) as Record<Knob, number>;
  let afloat = true, ambOn = false;
  const ambBtn = $<HTMLButtonElement>('#ambOn');
  const push = (): void => {
    if (!ambOn) return;
    const mix: AmbienceMix = { regions: { ...regions }, weather: { ...weather }, afloat, ...knobs };
    audio.setAmbience(mix);
  };
  const startAmb = (on: boolean): void => {
    ambOn = on;
    ambBtn.textContent = on ? 'Stop ambience' : 'Start ambience';
    ambBtn.classList.toggle('on', on);
    if (on) push(); else audio.stopAmbience();
  };
  ambBtn.addEventListener('click', () => startAmb(!ambOn));

  mixer.append(el('h2', { textContent: 'Regions' }));
  const regionSliders = {} as Record<RegionId, ReturnType<typeof slider>>;
  for (const id of REGION_IDS) {
    regionSliders[id] = slider(mixer, id, 0, 1, 0, (v) => { regions[id] = v; if (!ambOn) startAmb(true); else push(); });
  }
  mixer.append(el('h2', { textContent: 'Weather', className: 'sub' }));
  const weatherSliders = {} as Record<Weather, ReturnType<typeof slider>>;
  for (const w of WEATHERS) weatherSliders[w] = slider(mixer, w, 0, 1, 0, (v) => { weather[w] = v; push(); });
  mixer.append(el('h2', { textContent: 'Where you are', className: 'sub' }));
  const knobSliders = {} as Record<Knob, ReturnType<typeof slider>>;
  for (const [k, label, min, max, v] of KNOBS) knobSliders[k] = slider(mixer, label, min, max, v, (x) => { knobs[k] = x; push(); });
  const afloatBox = el('input', { type: 'checkbox', checked: true });
  afloatBox.addEventListener('change', () => { afloat = afloatBox.checked; push(); });
  mixer.append(el('label', {}, afloatBox, 'Afloat (your hull on the water)'));

  const setRegion = (w: Partial<Record<RegionId, number>>): void => {
    for (const id of REGION_IDS) { regions[id] = w[id] ?? 0; regionSliders[id].set(regions[id] ?? 0); }
    push();
  };
  $('#clear').addEventListener('click', () => setRegion({}));

  // the tour crossfades from one region to the next
  let tour = 0;
  const tourBtn = $('#tour');
  const runTour = (on: boolean): void => {
    clearInterval(tour);
    tourBtn.classList.toggle('on', on);
    tourBtn.textContent = on ? 'Stop the tour' : 'Tour the regions';
    if (!on) { tour = 0; return; }
    if (!ambOn) startAmb(true);
    const t0 = performance.now(), STAY = 14000, FADE = 4000;
    let lastIdx = -1;
    tour = window.setInterval(() => {
      const t = performance.now() - t0, i = Math.floor(t / STAY) % REGION_IDS.length, into = t % STAY;
      const a = REGION_IDS[i], b = REGION_IDS[(i + 1) % REGION_IDS.length], k = Math.max(0, (into - (STAY - FADE)) / FADE);
      setRegion(k > 0 ? { [a]: 1 - k, [b]: k } : { [a]: 1 });
      if (i !== lastIdx) { lastIdx = i; line(`tour: ${a}`); }
    }, 100);
  };
  tourBtn.addEventListener('click', () => runTour(!tour));

  // the log and the meters
  const line = (s: string): void => {
    log.textContent = `${(engine.now).toFixed(2).padStart(7)}  ${s}\n${log.textContent ?? ''}`.slice(0, 6000);
  };
  audio.onCue((c) => {
    const d = c.pos ? Math.round(Math.hypot(c.pos.x, c.pos.y, c.pos.z - RADIUS - EYE)) : 0;
    if (c.bus === 'amb' && LOOPS.includes(c.name) && c.name.startsWith('bed')) line(`bed  ${c.name}`);
    else line(`${c.bus.padEnd(4)} ${c.name}${SOUNDS[c.name].variants > 1 ? `:${c.variant}` : ''}  ${(20 * Math.log10(Math.max(1e-4, c.gain))).toFixed(1)} dB${c.pos ? `  ${d} m` : ''}`);
  });
  const analyser = engine.ctx.createAnalyser();
  analyser.fftSize = 1024;
  engine.master.connect(analyser);
  const wave = new Float32Array(analyser.fftSize), bar = $('#meter').firstElementChild as HTMLElement, stats = $('#stats');
  const total = SOUND_NAMES.reduce((a, n) => a + SOUNDS[n].variants, 0);
  let hold = 0;
  const meter = (): void => {
    analyser.getFloatTimeDomainData(wave);
    let pk = 0;
    for (const x of wave) pk = Math.max(pk, Math.abs(x));
    hold = Math.max(pk, hold * 0.93);
    bar.style.width = `${Math.min(100, Math.max(0, (1 + Math.log10(Math.max(1e-3, hold)) / 3) * 100))}%`;
    requestAnimationFrame(meter);
  };
  meter();
  setInterval(() => {
    let ready = 0;
    for (const n of SOUND_NAMES) for (let v = 0; v < SOUNDS[n].variants; v++) if (engine.ready(n, v)) ready++;
    const t = engine.now, s = engine.stats;
    stats.textContent = `rendered ${ready}/${total} · voices fx ${engine.active(t, 'fx')} amb ${engine.active(t, 'amb')} ui ${engine.active(t, 'ui')} · stolen ${s.stolen} · dropped ${s.dropped}`;
    lock.style.display = engine.running ? 'none' : '';
  }, 250);

  // presets from the URL
  const r = pairs(q.get('region')).filter(([k]) => (REGION_IDS as string[]).includes(k));
  const w = pairs(q.get('weather')).filter(([k]) => (WEATHERS as readonly string[]).includes(k));
  for (const [k, v] of w) { weather[k as Weather] = v; weatherSliders[k as Weather].set(v); }
  for (const [p, k] of Object.entries(URL_KNOB)) {
    const v = q.get(p);
    if (v !== null && Number.isFinite(Number(v))) { knobs[k] = Number(v); knobSliders[k].set(Number(v)); }
  }
  if (r.length) { startAmb(true); setRegion(Object.fromEntries(r)); }
  else if (w.length) startAmb(true);
  if (q.get('tour') === '1') runTour(true);
  return audio;
}
