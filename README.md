# Portolan

Portolan is a fun naval battle royale for mobile devices.

## Phone

    npm run build && npx cap sync ios && sh tools/phone.sh

`npm run shot` screenshots the phone to `captures/phone.png`.

## The old game

The previous battle royale is commit `ae981b6`, an ancestor of main. Features it had that this game does not, and
where they were:

- Perks, powers and abilities (Repair, Ram and others): `src/sim/perks.ts`, `powers.ts`, `abilities.ts`
- Parts damage (canvas, mast, rudder, waterline) and mending: `src/sim/parts.ts`
- Magazines, crits, the weak spot, eight weapons: `src/sim/combat.ts`, data in `tables.ts`
- Local weather (fog, rain, thunder, calm, snow, ash) and a gusting wind: `src/sim/weather.ts`, `wind.ts`
- The delivery gull: `src/sim/economy.ts`, `src/render/actors/gull.ts`
- GPU cloth sails: `src/render/actors/cloth.ts`
- Locker, cards, abilities and rank screens: `src/screens/folio.ts`, `cards.ts`
- The fuller bot brain (influence map, hearing, pacing director): `src/sim/captains/`
