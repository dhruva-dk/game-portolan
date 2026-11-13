// The rarities' inks, as both of what draw them take them: the HUD's gun slot (ui/hud.ts) and the loot's bands and
// pennants on the water (loot/loot.ts). A rarity is a number, 0–4, worst to best (sim/loot.ts, snapshot.ts LootDraw).

/** The inks, worst to best (0117's LOOT_INKS: silver, verdigris, azurite, rubric, gold), 0xrrggbb. */
export const RARITY = [0x969aa0, 0x3a683e, 0x264c8c, 0xb8301a, 0xbe8a2c] as const;
