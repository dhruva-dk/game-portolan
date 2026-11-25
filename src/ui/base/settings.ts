import type { Word } from './word.ts';

export type Settings = {
  sound: number;
  music: number;
  leftHanded: boolean;
  sensitivity: number;
};

export type Level = 'sound' | 'music' | 'sensitivity';

export const SETTINGS: Settings = {
  sound: 0.8,
  music: 0.6,
  leftHanded: false,
  sensitivity: 1,
};

export const RANGES: Readonly<
  Record<Level, { least: number; most: number; step: number }>
> = {
  sound: { least: 0, most: 1, step: 0.05 },
  music: { least: 0, most: 1, step: 0.05 },
  sensitivity: { least: 0.5, most: 2, step: 0.05 },
};

export type SettingsRow =
  | {
      kind: 'slider';
      id: Level;
      word: Word;
      share: number;
      mark: number | null;
    }
  | { kind: 'switch'; id: 'leftHanded'; word: Word; on: boolean }
  | { kind: 'seed'; word: Word; seed: string }
  | { kind: 'newCareer'; word: Word };

export type SettingsView = { rows: SettingsRow[] };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function shareOf(id: Level, value: number): number {
  const { least, most } = RANGES[id];
  return clamp01((value - least) / (most - least));
}

export function valueAt(id: Level, share: number): number {
  const { least, most, step } = RANGES[id],
    raw = least + (most - least) * clamp01(share);
  return Math.round(Math.round(raw / step) * step * 100) / 100;
}

export const moved = (s: Settings, id: Level, share: number): Settings => ({
  ...s,
  [id]: valueAt(id, share),
});

export const thrown = (s: Settings): Settings => ({
  ...s,
  leftHanded: !s.leftHanded,
});

const slider = (s: Settings, id: Level, word: Word): SettingsRow => ({
  kind: 'slider',
  id,
  word,
  share: shareOf(id, s[id]),
  mark: id === 'sensitivity' ? shareOf(id, SETTINGS.sensitivity) : null,
});

export function settingsView(
  s: Settings,
  lobby: { seed: string } | null
): SettingsView {
  const rows: SettingsRow[] = [
    slider(s, 'sound', 'Sound'),
    slider(s, 'music', 'Music'),
    { kind: 'switch', id: 'leftHanded', word: 'Left-handed', on: s.leftHanded },
    slider(s, 'sensitivity', 'Sensitivity'),
  ];
  if (lobby)
    rows.push(
      { kind: 'seed', word: 'Seed', seed: lobby.seed },
      { kind: 'newCareer', word: 'New Career' }
    );
  return { rows };
}

const level = (id: Level, v: unknown): number => {
  const { least, most } = RANGES[id];
  return typeof v === 'number' && v >= least && v <= most ? v : SETTINGS[id];
};

export function settled(fields: ReadonlyMap<string, unknown>): Settings {
  const left = fields.get('leftHanded');
  return {
    sound: level('sound', fields.get('sound')),
    music: level('music', fields.get('music')),
    leftHanded: typeof left === 'boolean' ? left : SETTINGS.leftHanded,
    sensitivity: level('sensitivity', fields.get('sensitivity')),
  };
}
