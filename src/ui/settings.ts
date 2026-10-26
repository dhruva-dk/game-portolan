import { read, write } from '../app/save.ts';

export interface Settings {
  sound: number;
  music: number;
  haptics: boolean;
  reducedMotion: boolean;
  quality: number;
  leftHanded: boolean;
}

export const STEPS = 5;
export const SETTINGS_KEY = 'settings';

export const defaults = (reducedMotion = false): Settings => ({ sound: 1, music: 0.75, haptics: true, reducedMotion, quality: 2, leftHanded: false });

const vol = (x: unknown, d: number): number =>
  typeof x === 'number' && Number.isFinite(x) ? Math.round(Math.min(1, Math.max(0, x)) * (STEPS - 1)) / (STEPS - 1) : d;
const flag = (x: unknown, d: boolean): boolean => (typeof x === 'boolean' ? x : d);

const tier = (v: unknown, b: number): number => (v === 0 || v === 1 || v === 2 ? v : b);

export function sanitize(v: unknown, base: Settings = defaults()): Settings {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  return { sound: vol(o.sound, base.sound), music: vol(o.music, base.music), haptics: flag(o.haptics, base.haptics), reducedMotion: flag(o.reducedMotion, base.reducedMotion), quality: tier(o.quality, base.quality), leftHanded: flag(o.leftHanded, base.leftHanded) };
}

export interface Targets {
  audio?: { setVolumes(v: { sound?: number; music?: number }): void } | null | undefined;
  haptics?: { enabled: boolean } | null | undefined;
  motion?: { reducedMotion: boolean } | null | undefined;
  quality?: { setQuality(tier: number): void } | null | undefined;
}

export function applySettings(s: Settings, t: Targets): void {
  t.audio?.setVolumes({ sound: s.sound, music: s.music });
  if (t.haptics) t.haptics.enabled = s.haptics;
  if (t.motion) t.motion.reducedMotion = s.reducedMotion;
  if (t.quality) t.quality.setQuality(s.quality);
}

export const storage = {
  read: (key: string): Promise<unknown> => read<unknown>('career', key),
  write: (key: string, value: unknown): Promise<void> => write('career', key, value),
};

let current: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();
const systemReduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const settings = (): Settings => (current ??= defaults(systemReduced()));

export function onSettings(f: (s: Settings) => void): () => void {
  listeners.add(f);
  f(settings());
  return () => listeners.delete(f);
}

const tell = (s: Settings): void => { for (const f of listeners) f(s); };

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const s = (current = sanitize({ ...settings(), ...patch }, settings()));
  tell(s);
  await saveSettings();
  return s;
}

export async function saveSettings(): Promise<void> {
  try {
    await storage.write(SETTINGS_KEY, { ...settings() });
  } catch {  }
}

export async function loadSettings(): Promise<Settings> {
  let saved: unknown;
  try { saved = await storage.read(SETTINGS_KEY); } catch { saved = undefined; }
  const s = (current = sanitize(saved, defaults(systemReduced())));
  tell(s);
  return s;
}

export function forgetSettings(): void {
  current = null;
  listeners.clear();
}

export type UiSound = 'tap' | 'page' | 'quill' | 'confirm' | 'back';
let player: ((s: UiSound) => void) | null = null;
export const setUiSound = (f: ((s: UiSound) => void) | null): void => { player = f; };
export const uiSound = (s: UiSound): void => { if (settings().sound > 0) player?.(s); };
