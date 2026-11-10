// The player's settings: kept in the browser's storage beside the career (never in capture mode), and applied at
// once to the sound, the juice and the controls whenever they change.
import { durable, type Item } from './durable.ts';
import { DEFAULT_SETTINGS, type Settings } from '../ui/model.ts';

export const SETTINGS_KEY = 'portolan.settings';

const clamp01 = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/** Settings read back from storage, each field checked: anything missing or wrong takes its default. */
export function parseSettings(raw: string | null): Settings {
  const d = DEFAULT_SETTINGS;
  let o: Record<string, unknown> = {};
  try {
    const v: unknown = raw ? JSON.parse(raw) : {};
    if (v && typeof v === 'object') o = v as Record<string, unknown>;
  } catch {
    // a broken save starts from the defaults
  }
  const sens = typeof o.sensitivity === 'number' && Number.isFinite(o.sensitivity) ? Math.max(0.5, Math.min(2, o.sensitivity)) : d.sensitivity;
  return {
    master: clamp01(o.master, d.master), effects: clamp01(o.effects, d.effects), ambience: clamp01(o.ambience, d.ambience),
    interface: clamp01(o.interface, d.interface), haptics: bool(o.haptics, d.haptics), shake: clamp01(o.shake, d.shake),
    sensitivity: sens,
    invertY: bool(o.invertY, d.invertY), leftHanded: bool(o.leftHanded, d.leftHanded), autoFire: bool(o.autoFire, d.autoFire),
  };
}

export class SettingsHolder {
  settings: Settings;
  private readonly storage: Item | null;

  constructor(capture: boolean) {
    let st: Item | null = null;
    try {
      st = capture ? null : durable();
    } catch {
      // storage blocked: the settings live in memory
    }
    this.storage = st;
    let raw: string | null = null;
    try {
      raw = st?.getItem(SETTINGS_KEY) ?? null;
    } catch {
      raw = null;
    }
    this.settings = parseSettings(raw);
  }

  /** Changes some settings and saves them. */
  set(s: Partial<Settings>): Settings {
    this.settings = { ...this.settings, ...s };
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // storage full or blocked: the change holds for this visit
    }
    return this.settings;
  }
}
