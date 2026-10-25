// WP26 settings: sound and music volumes (the AudioEngine's buses, WP28), haptics (WP25's patterns) and reduced
// motion (the camera's lift, WP24, and the screens' ink transitions). Kept beside the career in the device's database
// (save.ts, store 'career', key 'settings'), applied to whatever listens, and read by the screens each time they act.
import { read, write } from '../app/save.ts';

export interface Settings {
  /** Sound effects, ambience and the interface, 0–1 in quarter steps (AudioEngine.setVolumes 'sound'). */
  sound: number;
  /** Music, 0–1 in quarter steps. */
  music: number;
  haptics: boolean;
  reducedMotion: boolean;
}

/** Volume steps: silent, ¼, ½, ¾, full. */
export const STEPS = 5;
export const SETTINGS_KEY = 'settings';

export const defaults = (reducedMotion = false): Settings => ({ sound: 1, music: 0.75, haptics: true, reducedMotion });

const vol = (x: unknown, d: number): number =>
  typeof x === 'number' && Number.isFinite(x) ? Math.round(Math.min(1, Math.max(0, x)) * (STEPS - 1)) / (STEPS - 1) : d;
const flag = (x: unknown, d: boolean): boolean => (typeof x === 'boolean' ? x : d);

/** Saved settings made safe: anything missing or malformed falls back to `base`. */
export function sanitize(v: unknown, base: Settings = defaults()): Settings {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  return { sound: vol(o.sound, base.sound), music: vol(o.music, base.music), haptics: flag(o.haptics, base.haptics), reducedMotion: flag(o.reducedMotion, base.reducedMotion) };
}

/** What the settings apply to: the audio engine's buses, the haptics, anything that moves (the camera rig). */
export interface Targets {
  audio?: { setVolumes(v: { sound?: number; music?: number }): void } | null | undefined;
  haptics?: { enabled: boolean } | null | undefined;
  motion?: { reducedMotion: boolean } | null | undefined;
}

export function applySettings(s: Settings, t: Targets): void {
  t.audio?.setVolumes({ sound: s.sound, music: s.music });
  if (t.haptics) t.haptics.enabled = s.haptics;
  if (t.motion) t.motion.reducedMotion = s.reducedMotion;
}

/** Where settings are kept: the device database by default; tests swap in a map. */
export const storage = {
  read: (key: string): Promise<unknown> => read<unknown>('career', key),
  write: (key: string, value: unknown): Promise<void> => write('career', key, value),
};

let current: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();
const systemReduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The settings in force (the defaults, honouring the system's reduced motion, until the saved ones are read). */
export const settings = (): Settings => (current ??= defaults(systemReduced()));

/** Hear the settings now and on every change; returns the unsubscribe. */
export function onSettings(f: (s: Settings) => void): () => void {
  listeners.add(f);
  f(settings());
  return () => listeners.delete(f);
}

const tell = (s: Settings): void => { for (const f of listeners) f(s); };

/** Change some settings, tell the listeners and keep them on the device. */
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const s = (current = sanitize({ ...settings(), ...patch }, settings()));
  tell(s);
  await saveSettings();
  return s;
}

export async function saveSettings(): Promise<void> {
  try {
    await storage.write(SETTINGS_KEY, { ...settings() });
  } catch { /* no database (a private window): the settings hold for this run */ }
}

/** Read the saved settings once at startup (the title asks); a missing or unreadable record keeps the defaults. */
export async function loadSettings(): Promise<Settings> {
  let saved: unknown;
  try { saved = await storage.read(SETTINGS_KEY); } catch { saved = undefined; }
  const s = (current = sanitize(saved, defaults(systemReduced())));
  tell(s);
  return s;
}

/** Forget the settings in force (tests; a career begun anew keeps its settings). */
export function forgetSettings(): void {
  current = null;
  listeners.clear();
}

/** WP28 seam: the interface's sounds (AudioEngine.ui): a tap, a page turned, the quill, a confirmation, going back. */
export type UiSound = 'tap' | 'page' | 'quill' | 'confirm' | 'back';
let player: ((s: UiSound) => void) | null = null;
export const setUiSound = (f: ((s: UiSound) => void) | null): void => { player = f; };
export const uiSound = (s: UiSound): void => { if (settings().sound > 0) player?.(s); };
