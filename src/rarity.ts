// The rarities' inks and lights, as all of what draw them take them: the HUD's gun slot and the disc's loot marks
// (ui/hud.ts, ui/minimap.ts) in ink, the loot on the water (loot/loot.ts) in light. A rarity is a number, 0–4, worst to
// best (sim/loot.ts, snapshot.ts LootDraw).

/** The inks, worst to best (0117's LOOT_INKS: silver, verdigris, azurite, then purpure for its rubric, so the epic
 *  reads purple on the chart as it glows on the water, and not the red of the blows' figures; gold), 0xrrggbb. */
export const RARITY = [0x969aa0, 0x3a683e, 0x264c8c, 0x6a3a8e, 0xbe8a2c] as const;

/** The light each glows with on the water, worst to best (0117's RARITY_GLOW: grey, green, blue, purple, gold). */
export const GLOW = [0xc9d1da, 0x55e05a, 0x3aa0ff, 0xb85cff, 0xffa21f] as const;
