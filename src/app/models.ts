// The interface's view models from the career: what each screen shows, read from the saved record. The screens never
// see the career itself, and the career never sees the screens.
import {
  ABILITY_LEVEL, COSMETICS, careerLevel, careerRank, careerStats, chartOf, cosmetic, isUnlocked, levelOf, rivalsOf, unlockedAbilities, wornLook,
  yourHabits, type Career, type Cosmetic,
} from '../career/index.ts';
import { ABILITIES, type ActiveId, type PassiveId } from '../sim/abilities.ts';
import { ABILITY_SECRET, SECRETS, secret, type SecretDef } from '../sim/secrets.ts';
import { ability } from '../sim/abilities.ts';
import { REGIONS } from '../sim/world/index.ts';
import {
  rarityOf, type AbilitiesModel, type CareerModel, type CosmeticView, type LevelView, type LobbyModel, type LockerModel, type PlayerView,
  type RankModel, type RankView, type RivalsModel, type SecretView,
} from '../ui/model.ts';
import { markOf } from './matchModels.ts';

export function levelView(c: Career): LevelView {
  const l = levelOf(c.xp);
  return { level: l.level, into: l.into, need: l.need };
}

export function rankView(c: Career): RankView {
  const r = careerRank(c);
  return { index: r.step.index, tier: r.step.tier, step: r.step.step, name: r.step.name, progress: r.progress, floored: r.floored };
}

const colourOf = (id: string, fallback: string): string => cosmetic(id)?.colour ?? fallback;

export function playerView(c: Career): PlayerView {
  const look = wornLook(c);
  return {
    name: 'Your ship', level: levelView(c), rank: rankView(c), bestTier: c.bestTier, emblem: look.emblem,
    colours: [colourOf(look.sailColour, '#f4ead6'), colourOf(look.hullPaint, '#5a3423')],
  };
}

/** The league's news for the lobby's ticker: each rival's grudge or the habit it has learned, by rivalry. */
function ticker(c: Career): string[] {
  const out: string[] = [];
  for (const r of rivalsOf(c)) {
    if (r.met === 0) continue;
    // the last line is the plain record; the ones before it are what the captain holds against you
    for (const line of r.lines.slice(0, -1)) out.push(`${r.captain.name} ${line[0].toLowerCase()}${line.slice(1)}`);
    if (out.length >= 3) break;
  }
  return out.length ? out.slice(0, 3) : ['Nineteen captains wait on the water.'];
}

export function lobbyModel(c: Career, news: LobbyModel['news'] = {}): LobbyModel {
  const s = careerStats(c);
  return {
    player: playerView(c), active: c.active as ActiveId, passive: c.passive as PassiveId, look: wornLook(c), news, ticker: ticker(c),
    stats: { matches: s.matches, wins: s.wins, top5: s.top5 },
    secrets: { found: c.secrets.length, of: SECRETS.length },
  };
}

/** Every ability, the ones your level has reached unlocked, with those the last match unlocked marked new. */
export function abilitiesModel(c: Career, fresh: ReadonlySet<string> = new Set()): AbilitiesModel {
  const open = new Set<string>(unlockedAbilities(c));
  return {
    level: careerLevel(c), active: c.active as ActiveId, passive: c.passive as PassiveId,
    abilities: ABILITIES.map((a) => ({
      id: a.id, kind: a.kind, name: a.name, text: a.text, cooldown: a.cooldown, level: ABILITY_LEVEL[a.id], unlocked: open.has(a.id), isNew: fresh.has(a.id),
      ...(ABILITY_SECRET[a.id] ? { secret: secret(ABILITY_SECRET[a.id]!)!.hint } : {}),
    })),
  };
}

const cosmeticView = (k: Cosmetic, level: number, bestTier: number, secrets: readonly string[], fresh: ReadonlySet<string>): CosmeticView => ({
  id: k.id, kind: k.kind, name: k.name, hint: k.hint, ...(k.colour ? { colour: k.colour } : {}), rarity: rarityOf(k.unlock), unlock: k.unlock,
  unlocked: isUnlocked(k, level, bestTier, secrets), isNew: fresh.has(k.id),
});

export function lockerModel(c: Career, fresh: ReadonlySet<string> = new Set()): LockerModel {
  const level = careerLevel(c);
  return { level, bestTier: c.bestTier, cosmetics: COSMETICS.map((k) => cosmeticView(k, level, c.bestTier, c.secrets, fresh)), look: wornLook(c) };
}

/** The league's captains, rivals first, with your record against each. */
export function rivalsModel(c: Career): RivalsModel {
  return {
    rivals: rivalsOf(c).map((r) => ({
      ...markOf(r.captain.look), id: r.captain.id, name: r.captain.name, meaning: r.captain.meaning, sigil: r.captain.sigil.name,
      temperament: { id: r.temperament.id, name: r.temperament.name, text: r.temperament.text }, rank: r.rank,
      active: r.captain.active, passive: r.captain.passive, met: r.met, ahead: r.ahead, behind: r.behind, sankYou: r.sankYou,
      sunkByYou: r.sunkByYou, grudge: r.grudge, rivalry: r.rivalry, isRival: r.isRival, lines: r.lines,
    })),
  };
}

export function careerModel(c: Career): CareerModel {
  return {
    player: playerView(c), stats: careerStats(c), chart: chartOf(c).map(({ index, name, sailed }) => ({ index, name, sailed })), habits: yourHabits(c),
    secrets: secretsOf(c),
  };
}

/** The secrets as the log shows them: found ones first, in the order found, then the riddles in the catalogue's. */
function secretsOf(c: Career): SecretView[] {
  const view = (d: SecretDef): SecretView => {
    const found = c.secrets.includes(d.id), region = d.region ? REGIONS.find((r) => r.id === d.region)?.name ?? null : null;
    const gives = d.reward.kind === 'cache' ? 'A cache in every match'
      : d.reward.kind === 'ability' ? `Ability: ${ability(d.reward.id).name}`
        : `Emblem: ${cosmetic(d.reward.id)?.name ?? d.reward.id}`;
    return { id: d.id, region, found, name: found ? d.name : '?', text: found ? d.found : d.hint, gives };
  };
  const found = c.secrets.map((id) => SECRETS.find((d) => d.id === id)).filter((d): d is SecretDef => !!d);
  return [...found.map(view), ...SECRETS.filter((d) => !c.secrets.includes(d.id)).map(view)];
}

export function rankModel(c: Career): RankModel {
  const level = careerLevel(c);
  return {
    rank: rankView(c), bestTier: c.bestTier,
    rewards: COSMETICS.filter((k) => k.unlock.by === 'rank').map((k) => cosmeticView(k, level, c.bestTier, c.secrets, new Set())),
  };
}
