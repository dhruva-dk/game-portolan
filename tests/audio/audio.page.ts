// WP28 test page module, imported into a blank page on the Vite dev server by tests/audio/engine.test.ts (outside the
// game build). Renders the engine's full graph in OfflineAudioContexts: each sound alone, a ten-ship broadside storm over
// every bed, every match event, and for the progress shot a demo reel (WAV) and a waveform / spectrogram / loudness sheet.
import { SR } from '../../src/audio/dsp.ts';
import { AudioEngine, CEILING, VOICES, type Point } from '../../src/audio/engine.ts';
import { Bank, measure, render, SOUND_NAMES, SOUNDS, type SoundName } from '../../src/audio/sfx.ts';
import { calmScene, MatchAudio, Soundscape } from '../../src/audio/soundscape.ts';
import { createMatch, EVENT } from '../../src/sim/state.ts';

const RATE = 48000;

function scan(b: AudioBuffer): { peak: number; finite: boolean; rms: number } {
  let peak = 0, finite = true, e = 0, n = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const x = d[i];
      if (!Number.isFinite(x)) { finite = false; continue; }
      const a = Math.abs(x);
      if (a > peak) peak = a;
      e += x * x; n++;
    }
  }
  return { peak, finite, rms: 20 * Math.log10(Math.sqrt(e / Math.max(1, n)) + 1e-12) };
}

/** A point d u across the water from the default listener (the north pole), toward bearing a (0: its right). */
const near = (a: number, d: number): Point => {
  const R = 200, t = d / R;
  return { x: R * Math.sin(t) * Math.cos(a), y: R * Math.sin(t) * Math.sin(a), z: R * Math.cos(t) };
};

export async function each(): Promise<{ name: string; seconds: number; peak: number; finite: boolean; rms: number }[]> {
  const rows = [];
  for (const name of SOUND_NAMES) {
    const chs = render(name, 0), seconds = SOUNDS[name].loop ? 2 : chs[0].length / SR + 0.25;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE), e = new AudioEngine(ctx);
    e.bank.put(name, 0, chs);
    e.play(name, { variant: 0 });
    rows.push({ name, seconds, ...scan(await ctx.startRendering()) });
  }
  return rows;
}

export async function storm() {
  const seconds = 8, ctx = new OfflineAudioContext(2, seconds * RATE, RATE), e = new AudioEngine(ctx);
  const used: SoundName[] = ['cannon', 'cannonFar', 'hit', 'splash', 'explosion', 'groan', 'coin'];
  // the bank as the game's worker leaves it: these and every bed rendered before the fight (voice starts are timed, not synthesis)
  for (const n of [...used, ...SOUND_NAMES.filter((x) => SOUNDS[x].loop)]) for (let v = 0; v < SOUNDS[n].variants; v++) e.prepare(n, v);
  const scape = new Soundscape(e), s = calmScene();
  Object.assign(s, { wind: 1.6, gust: 1, rough: 1.5, rain: 1, storm: 0.9, coast: 0.8, harbour: 0.5, maelstrom: 0.6, steam: 0.5, night: 1, speed: 6 });
  let seed = 12345;
  const rand = (): number => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  const ships = [...Array(10).keys()].map((i) => near((i / 10) * Math.PI * 2, 1 + i * 4));
  let calls = 0;
  const t0 = performance.now();
  scape.beds(s, 0.1);
  for (let t = 0; t < seconds - 1; t += 0.4) {
    ships.forEach((p, i) => {
      e.broadside(p, 4, { delay: t + rand() * 0.3 });
      e.play('hit', { at: ships[(i + 3) % 10], delay: t + 0.5 + rand() * 0.3 });
      e.play('splash', { at: near(rand() * 6.28, rand() * 20), delay: t + 0.6 + rand() * 0.3 });
      calls += 6;
    });
    e.play('explosion', { delay: t + 0.2 });
    e.play('groan', { at: ships[2], delay: t });
    e.coins(6, null, t);
    calls += 8;
  }
  const playUs = ((performance.now() - t0) * 1000) / calls;
  let maxSfx = 0, maxAll = 0;
  for (let t = 0; t < seconds; t += 0.005) { maxSfx = Math.max(maxSfx, e.active(t, 'sfx')); maxAll = Math.max(maxAll, e.active(t)); }
  const t1 = performance.now(), b = await ctx.startRendering(), renderMs = performance.now() - t1;
  return { ...scan(b), ceiling: CEILING, maxSfx, cap: VOICES.sfx, maxAll, nodesPeak: maxAll * 4 + 17, ...e.stats, renderMsPerSecond: renderMs / seconds, seconds, playUs, calls };
}

/** A sound asked for 1.3 s ahead: no nodes until just before it sounds, then heard on time; one stopped before it was
 * built never sounds. */
export async function ahead(): Promise<{ nodesBefore: number; onset: number; stoppedPeak: number }> {
  const heard = async (delay: number): Promise<[number, number]> => {
    const ctx = new OfflineAudioContext(2, 3 * RATE, RATE), e = new AudioEngine(ctx);
    e.prepare('cannon', 0);
    e.play('cannon', { variant: 0, delay });
    const nodes = e.nodes, d = (await ctx.startRendering()).getChannelData(0);
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 1e-3) return [nodes, i / RATE];
    return [nodes, -1];
  };
  const [nodesBefore, late] = await heard(1.3), [, now] = await heard(0), onset = late - now; // the delay as heard
  const ctx2 = new OfflineAudioContext(2, 2 * RATE, RATE), e2 = new AudioEngine(ctx2);
  e2.prepare('bell', 0);
  e2.stopVoice(e2.play('bell', { variant: 0, delay: 0.8 }), 0.1);
  return { nodesBefore, onset, stoppedPeak: scan(await ctx2.startRendering()).peak };
}

/** The listener on the camera (WP24's rig): a deck camera behind and above the ship, then one risen to orbit. */
export function listener(): { ear: number[]; near: number; own: number; rival: number; rivalDeck: number; highOwn: number; high: number; bare: number[] } {
  const e = new AudioEngine(new OfflineAudioContext(2, RATE, RATE)), m = new MatchAudio(e, null, 0), state = createMatch({ seed: 7 });
  const ship = state.ships[0], R = 200, u = ship.pos, h = ship.head;
  const W = (p: Point, k = R): Point => ({ x: p.x * k, y: p.y * k, z: p.z * k });
  const add = (...ps: Point[]): Point => ps.reduce((a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }));
  const r = { x: h.y * u.z - h.z * u.y, y: h.z * u.x - h.x * u.z, z: h.x * u.y - h.y * u.x };
  const eyeAt = (back: number, up: number) => {
    const p = add(W(u), W(h, -back), W(u, up));
    return { p, matrixWorld: { elements: [r.x, r.y, r.z, 0, u.x, u.y, u.z, 0, -h.x, -h.y, -h.z, 0, p.x, p.y, p.z, 1] } };
  };
  m.frame(state, 1 / 60, null);
  const bare = [e.listener.pos.x, e.listener.pos.y, e.listener.pos.z].map((x, i) => x - [u.x, u.y, u.z][i] * R);
  const deck = eyeAt(8.5, 2.6);
  m.frame(state, 1 / 60, deck);
  const ahead30 = add(W(u), W(h, 30)), L = e.listener.pos;
  const own = e.spatial(W(u)).gain, rival = e.spatial(ahead30).gain;
  m.frame(state, 1 / 60, null);
  const rivalDeck = e.spatial(ahead30).gain;
  m.frame(state, 1 / 60, eyeAt(0, 380));
  return { ear: [L.x - deck.p.x, L.y - deck.p.y, L.z - deck.p.z], near: (m.frame(state, 1 / 60, deck), e.listener.near), own, rival, rivalDeck,
    highOwn: (m.frame(state, 1 / 60, eyeAt(0, 380)), e.spatial(W(u)).gain), high: m.scene.high, bare };
}

export function events(): { kinds: number; started: number; errors: string[] } {
  const e = new AudioEngine(new OfflineAudioContext(2, RATE, RATE)), m = new MatchAudio(e, null, 0), errors: string[] = [];
  const kinds = Object.values(EVENT);
  for (const kind of kinds) for (const ship of [0, 3]) {
    try {
      const p = near(1, ship === 0 ? 0.5 : 12); // the sim's events are unit vectors; ships' positions world units
      m.event({ kind, ship, by: kind === EVENT.used ? 21 + (kind % 5) : ship === 0 ? 3 : 0, at: { x: p.x / 200, y: p.y / 200, z: p.z / 200 }, amount: 2 }, (i) => near(1, i * 3));
    } catch (err) {
      errors.push(`${kind}: ${String(err)}`);
    }
  }
  return { kinds: kinds.length, started: e.stats.started, errors };
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a), h = len / 2;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const p = i + k, q = p + h, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** The sheet: every sound's waveform, log-frequency spectrogram (50 Hz–16 kHz), length, peak and loudness. */
function sheet(bank: Bank): string {
  const ROW = 60, LABEL = 230, WAVE = 460, SPEC = 640, W = LABEL + WAVE + SPEC + 30, top = 40, cv = document.createElement('canvas');
  cv.width = W; cv.height = top + ROW * SOUND_NAMES.length + 10;
  const g = cv.getContext('2d')!, BG = [239, 224, 192], INK = [58, 38, 22];
  g.fillStyle = `rgb(${BG})`; g.fillRect(0, 0, W, cv.height);
  g.fillStyle = `rgb(${INK})`; g.font = '15px Georgia, serif';
  g.fillText(`WP28 sound bank: ${SOUND_NAMES.length} synthesized sounds (variant 0) | waveform | spectrogram 50 Hz-16 kHz, log | peak dBFS, loudness (0.4 s RMS) dBFS`, 10, 24);
  const N = 1024, re = new Float64Array(N), im = new Float64Array(N), hann = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  SOUND_NAMES.forEach((name, row) => {
    const chs = bank.get(name, 0), m = measure(chs), y0 = top + row * ROW, len = chs[0].length;
    const mono = chs.length === 1 ? chs[0] : chs[0].map((x, i) => 0.5 * (x + chs[1][i]));
    g.fillStyle = `rgb(${INK})`; g.font = '13px Georgia, serif';
    g.fillText(name, 10, y0 + 22);
    g.font = '11px Georgia, serif';
    g.fillText(`${m.seconds.toFixed(2)} s  ${chs.length === 2 ? 'stereo' : 'mono'}${SOUNDS[name].loop ? ' loop' : ''}`, 10, y0 + 38);
    g.fillText(`pk ${(20 * Math.log10(m.peak)).toFixed(1)}  L ${m.loudness.toFixed(1)}`, 10, y0 + 52);
    const mid = y0 + ROW / 2, hh = ROW / 2 - 4;
    for (let x = 0; x < WAVE; x++) {
      let lo = 0, hi = 0;
      for (let i = Math.floor((x / WAVE) * len); i < Math.floor(((x + 1) / WAVE) * len); i++) { lo = Math.min(lo, mono[i]); hi = Math.max(hi, mono[i]); }
      g.fillRect(LABEL + x, mid - hi * hh, 1, Math.max(1, (hi - lo) * hh));
    }
    const img = g.createImageData(SPEC, ROW - 6);
    for (let x = 0; x < SPEC; x++) {
      const c = Math.floor((x / SPEC) * len) - N / 2;
      for (let i = 0; i < N; i++) { const k = c + i; re[i] = k >= 0 && k < len ? mono[k] * hann[i] : 0; im[i] = 0; }
      fft(re, im);
      for (let y = 0; y < img.height; y++) {
        const f = 50 * Math.pow(16000 / 50, 1 - y / (img.height - 1)), b = Math.min(N / 2 - 1, Math.round((f / SR) * N));
        const db = 10 * Math.log10(re[b] * re[b] + im[b] * im[b] + 1e-12), a = Math.min(1, Math.max(0, (db + 50) / 60)), o = (y * SPEC + x) * 4;
        for (let ch = 0; ch < 3; ch++) img.data[o + ch] = BG[ch] * (1 - a) + INK[ch] * a;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, LABEL + WAVE + 20, y0 + 3);
    g.fillStyle = 'rgba(58,38,22,0.25)'; g.fillRect(0, y0 + ROW - 1, W, 1);
  });
  return cv.toDataURL('image/png');
}

/** A demo reel: every one-shot in turn over a light sea, wind and rigging, as a 16-bit WAV (base64), and the sheet. */
export async function reel(): Promise<{ wav: string; png: string; seconds: number }> {
  const bank = new Bank(), RATE2 = 32000, oneShots = SOUND_NAMES.filter((n) => !SOUNDS[n].loop), plan: [SoundName, number][] = [];
  let t = 0.8;
  for (const n of oneShots) { plan.push([n, t]); t += Math.min(2.2, bank.get(n, 0)[0].length / SR) + 0.25; }
  const seconds = t + 2.5, ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE2), RATE2), e = new AudioEngine(ctx);
  for (const n of SOUND_NAMES) e.bank.put(n, 0, bank.get(n, 0));
  const s = calmScene();
  Object.assign(s, { wind: 0.9, coast: 0.25, rough: 0.8 });
  new Soundscape(e).beds(s, 0.1);
  plan.forEach(([n, at], i) => e.play(n, { variant: 0, delay: at, pan: i % 2 ? 0.25 : -0.25 }));
  const b = await ctx.startRendering(), L = b.getChannelData(0), R = b.getChannelData(1), N = L.length;
  const bytes = new Uint8Array(44 + N * 4), dv = new DataView(bytes.buffer);
  const str = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + N * 4, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, RATE2, true); dv.setUint32(28, RATE2 * 4, true);
  dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, N * 4, true);
  for (let i = 0; i < N; i++) {
    dv.setInt16(44 + i * 4, Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), true);
    dv.setInt16(46 + i * 4, Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), true);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { wav: btoa(bin), png: sheet(bank), seconds };
}
