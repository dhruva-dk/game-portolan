// The rarities' inks, for the UI that draws them on paper: the HUD's gun slot and the disc's loot marks (ui/hud.ts,
// ui/minimap.ts). A rarity is a number, 0–4, worst to best (sim/loot.ts, snapshot.ts LootDraw). The light each glows
// with on the water is the palette's (palette.ts RARITY_GLOW).

/** The inks, worst to best: silver, verdigris, azurite, then purpure, so the epic reads purple on the chart as it
 *  glows on the water, and not the red of the blows' figures; gold. 0xrrggbb. */
export const RARITY = [0x969aa0, 0x3a683e, 0x264c8c, 0x6a3a8e, 0xbe8a2c] as const;
