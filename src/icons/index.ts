// Portolan's icon set: every glyph the interface needs, generated as SVG in code. Icons are drawn on a 24-unit grid,
// bold enough to read at 24 px on a phone, with finer detail added from about 40 px up. By default an icon is a
// one-colour glyph in currentColor; options tint it, outline it for use over the sea, or set it in a frame (a rarity
// tile, an ability medallion, a perk seal or a region roundel).
//
//   icon('weapon.cannon')                                  → '<svg …>' at 24 px in currentColor
//   icon('weapon.cannon', { size: 96, rarity: 'epic' })    → the cannon on an epic tile
//   icon('ability.ram', { size: 64, frame: true })         → the active-ability medallion
//   icon('hud.gust', { size: 48, outline: true })          → cream with an ink outline, for over the 3D scene
//   icon('rank.gold2', { size: 72 })                       → full-colour insignia
//   icon('menu.play', { element: true })                   → an SVGSVGElement instead of a string
//
// Nothing here touches the simulation: it imports only types from it.
import type { AbilityId, ActiveId } from '../sim/abilities.ts';
import type { PerkId, RegionId } from '../sim/world/index.ts';
import type { Prim } from './draw.ts';
import {
  CREAM, INK, RARITY_COLOURS, RARITY_NAMES, activeFrame, passiveFrame, rarityFrame, regionFrame, sealFrame,
  type FrameKind, type Rarity, type RarityName,
} from './frames.ts';
import { Defs, glyph, type Paint } from './render.ts';
import { ABILITY_ICONS } from './sets/abilities.ts';
import { GULL_TIER_ICONS, HUD_ICONS, MENU_ICONS, type GullTierId, type HudId, type MenuId } from './sets/hud.ts';
import { PERK_ICONS } from './sets/perks.ts';
import { RANK_ICONS, RANK_ORDER, RANK_TIERS, type RankId, type RankStep, type RankTier } from './sets/ranks.ts';
import { REGION_COLOURS, REGION_ICONS } from './sets/regions.ts';
import { CONSUMABLE_ICONS, WEAPON_ICONS, type ConsumableId, type WeaponClass } from './sets/weapons.ts';

export { CREAM, INK, RARITY_COLOURS, RARITY_NAMES, REGION_COLOURS, RANK_ORDER, RANK_TIERS };
export type { ConsumableId, FrameKind, GullTierId, HudId, MenuId, RankId, RankStep, RankTier, Rarity, RarityName, WeaponClass };

export type IconName =
  | `weapon.${WeaponClass}`
  | `item.${ConsumableId}`
  | `ability.${AbilityId}`
  | `perk.${PerkId}`
  | `region.${RegionId}`
  | `rank.${RankId}`
  | `hud.${HudId}`
  | `menu.${MenuId}`
  | `gull.${GullTierId}`;

export type IconFamily = 'weapon' | 'item' | 'ability' | 'perk' | 'region' | 'rank' | 'hud' | 'menu' | 'gull';

const FAMILIES: Record<IconFamily, Record<string, Prim[]>> = {
  weapon: WEAPON_ICONS,
  item: CONSUMABLE_ICONS,
  ability: ABILITY_ICONS,
  perk: PERK_ICONS,
  region: REGION_ICONS,
  rank: RANK_ICONS,
  hud: HUD_ICONS,
  menu: MENU_ICONS,
  gull: GULL_TIER_ICONS,
};

/** Every icon name, family by family, in drawing order. */
export const ICON_NAMES: readonly IconName[] = (Object.keys(FAMILIES) as IconFamily[]).flatMap((fam) =>
  Object.keys(FAMILIES[fam]).map((id) => `${fam}.${id}` as IconName),
);

/** Icon names in one family. */
export const iconsIn = (family: IconFamily): IconName[] => ICON_NAMES.filter((n) => n.startsWith(family + '.'));

const ACTIVES: readonly ActiveId[] = ['repair', 'smokeScreen', 'ram', 'reveal', 'hardTurn', 'decoy', 'wave', 'driftMine'];

/** Each icon's own accent, used when it is tinted (and inside frames). */
export const TINTS: Partial<Record<IconName, string>> = {
  'item.smallShield': '#52b8ff',
  'item.bigShield': '#3a8cff',
  'item.repairKit': '#d79a5a',
  'item.fullRepair': '#6fd25a',
  'hud.shield': '#52b8ff',
  'hud.hull': '#6fd25a',
  'hud.coins': '#f4c24a',
  'hud.lantern': '#ffb347',
  'hud.storm': '#a77cff',
  'perk.frostShot': '#9ee0ff',
  'perk.fireShot': '#ff7a2e',
  'perk.cheapDeliveries': '#f4c24a',
  'perk.shallowDraft': '#f0c97a',
  'perk.fastRefill': '#7fd0ff',
  'gull.supplies': '#e2c08a',
  'gull.armament': '#d79a5a',
  'gull.treasure': '#f4c24a',
};

/** The rarity an item or delivery shows by default when framed. */
export const DEFAULT_RARITY: Partial<Record<IconName, Rarity>> = {
  'item.smallShield': 1,
  'item.bigShield': 2,
  'item.repairKit': 1,
  'item.fullRepair': 3,
  'gull.supplies': 1,
  'gull.armament': 2,
  'gull.treasure': 4,
};

/** The deliveries a gull brings, cheapest first, for indexing by tier. */
export const GULL_TIERS: readonly IconName[] = ['gull.supplies', 'gull.armament', 'gull.treasure'];

/** The icon of a rank: tier and step for the six metal tiers, or 'admiral' / 'legend'. */
export function rankIcon(tier: RankTier | 'admiral' | 'legend', step: RankStep = 1): IconName {
  return tier === 'admiral' || tier === 'legend' ? `rank.${tier}` : `rank.${tier}${step}`;
}

export interface IconOptions {
  /** Pixel size (a number), or any CSS length. Default 24. */
  size?: number | string;
  /** The ink colour. Default currentColor; cream inside frames and outlines. */
  color?: string;
  /** Sets the icon on a rarity tile: 0–4 or 'common' … 'legendary'. */
  rarity?: Rarity | RarityName;
  /** A frame: true picks the family's own (rarity tile, ability medallion, perk seal, region roundel). */
  frame?: boolean | FrameKind;
  /** Cream glyph with an ink outline, for use over the 3D scene. A string sets the outline colour. */
  outline?: boolean | string;
  /** Draws the icon's accent parts in colour: true for its own accent, or a colour. */
  tint?: boolean | string;
  /** Full-colour icons (rank insignia) in the ink colour only. */
  mono?: boolean;
  /** Forces fine detail on or off. Default: on from 40 px. */
  detail?: boolean;
  /** An accessible name; without it the icon is hidden from screen readers. */
  title?: string;
  /** A class for the <svg>. */
  className?: string;
}

const isFull = (name: IconName): boolean => name.startsWith('rank.');

function frameFor(name: IconName, o: IconOptions): FrameKind | null {
  if (isFull(name)) return null;
  if (typeof o.frame === 'string') return o.frame;
  if (o.rarity !== undefined) return 'rarity';
  if (!o.frame) return null;
  const [fam, id] = name.split('.') as [IconFamily, string];
  if (fam === 'ability') return (ACTIVES as readonly string[]).includes(id) ? 'active' : 'passive';
  if (fam === 'perk') return 'seal';
  if (fam === 'region') return 'region';
  return 'rarity';
}

const rarityOf = (r: Rarity | RarityName | undefined, name: IconName): Rarity => {
  if (typeof r === 'number') return Math.max(0, Math.min(4, Math.round(r))) as Rarity;
  if (typeof r === 'string') return Math.max(0, RARITY_NAMES.indexOf(r)) as Rarity;
  return DEFAULT_RARITY[name] ?? 0;
};

/** The icon as SVG markup. */
export function icon(name: IconName, o?: IconOptions & { element?: false }): string;
/** The icon as an SVG element (browser only). */
export function icon(name: IconName, o: IconOptions & { element: true }): SVGSVGElement;
export function icon(name: IconName, o: IconOptions & { element?: boolean } = {}): string | SVGSVGElement {
  const markup = iconSvg(name, o);
  return o.element ? toElement(markup) : markup;
}

/** The icon as an SVG element (browser only). */
export const iconElement = (name: IconName, o: IconOptions = {}): SVGSVGElement => toElement(iconSvg(name, o));

function toElement(markup: string): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup;
  return t.content.firstElementChild as SVGSVGElement;
}

function iconSvg(name: IconName, o: IconOptions): string {
  const [fam, id] = name.split('.') as [IconFamily, string];
  const prims = FAMILIES[fam]?.[id];
  if (!prims) throw new Error(`no icon named ${name}`);
  const size = o.size ?? 24;
  const fine = o.detail ?? (typeof size === 'number' ? size >= 40 : false);
  const frame = frameFor(name, o);
  const defs = new Defs();
  const own = TINTS[name] ?? (fam === 'region' ? REGION_COLOURS[id as RegionId] : undefined);
  const tintFor = (dflt: boolean, ink: string): string =>
    typeof o.tint === 'string' ? o.tint : (o.tint ?? dflt) && own && fam !== 'region' ? own : ink;

  let body: string;
  if (frame) {
    const ink = o.color ?? CREAM;
    const paint: Paint = { ink, tint: tintFor(true, ink), mono: false, fine, outline: { colour: INK, w: 1.3 }, shadow: 1.1 };
    const inner = glyph(prims, paint, defs);
    if (frame === 'rarity') body = rarityFrame(defs, rarityOf(o.rarity, name), inner, fine);
    else if (frame === 'active') body = activeFrame(defs, inner);
    else if (frame === 'passive') body = passiveFrame(defs, inner);
    else if (frame === 'seal') body = sealFrame(defs, inner);
    else body = regionFrame(defs, fam === 'region' ? REGION_COLOURS[id as RegionId] : '#2f64a8', inner);
  } else if (o.outline) {
    const ink = o.color ?? CREAM;
    const colour = typeof o.outline === 'string' ? o.outline : INK;
    body = glyph(prims, { ink, tint: tintFor(false, ink), mono: !!o.mono, fine, outline: { colour, w: 1.1 } }, defs);
  } else {
    const ink = o.color ?? 'currentColor';
    body = glyph(prims, { ink, tint: tintFor(false, ink), mono: !!o.mono, fine }, defs);
  }

  const dim = typeof size === 'number' ? `${size}` : size;
  const label = o.title ? ` role="img" aria-label="${o.title.replace(/"/g, '&quot;')}"` : ' aria-hidden="true"';
  const cls = o.className ? ` class="${o.className}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${dim}" height="${dim}"${cls}${label} focusable="false">${defs.markup()}${body}</svg>`;
}
