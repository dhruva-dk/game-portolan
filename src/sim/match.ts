// Portolan's match simulation: twenty ships on a 554 m planet, carried in on the Gale, sailing, looting,
// fighting, inking water and fleeing the Storm until one is left. Deterministic: the same seed and the same
// inputs give the same state hash in Node, Chromium and WebKit. Nothing here knows about drawing, sound or UI.
//
// ---------------------------------------------------------------- the API
//
//   const state = createMatch({ seed, fleet: [{ captain: false }] });
//   for (;;) { step(state, playerInput); if (over(state)) break; }   // 30 times a second (TICK = 1/30 s)
//   const r = result(state);
//
// createMatch(setup: MatchSetup): MatchState                    setup.ts. Ship 0 is the player's unless captained.
// step(state, input?: ShipInput | null, inputs?: (ShipInput | null)[]): void
//     One tick. `input` steers the player's ship (PLAYER = 0); `inputs[i]`, when given, overrides ship i's captain.
// idleInput(): ShipInput                                        input.ts: steer, throttle, fire, aim/aimY, select,
//     swap, drop, take, reload, gust, ability, dive, hail. Recorder: recorder(), record(), replay(), inputAt().
// runMatch(state, recording, tick), resolve(state)              replay to a tick; run to the end with no player.
// over(state), result(state): MatchResult                       end.ts: placements, kills, damage dealt, regions
//     sailed, time survived, who sank whom (by, cause), coins, and what each captain learnt of the player (minds).
// encodeMatch / decodeMatch / matchHash                         state.ts: snapshots and the determinism hash.
//
// Reading the state (state.ts has the full schema; names are stable):
//   state.ships[i]: phase (PHASE gale/glide/sea/sunk), pos (unit vector), head (unit tangent), alt (m above the sea),
//     torn, mast, fallen/jury, rudder, flood, listTo (her parts, parts.ts),
//     speed, vel, hull, shield (0–100), slots[5] {kind (ITEM), rarity 0–4, n (ammo or count)}, sel, reload, cool,
//     use/useT (consumable in use), gusts/gustT, boost, cooldown/power (active ability), active/passive (indices into
//     ACTIVES/PASSIVES in perks.ts), burn, slow, ice, flip, coins, perks (bit r: region r's perk), held (territory,
//     in AREA_Q units: squareMetres()), kills, dealt, place, gull {state, at, alt, tier}, captain.
//   state.loot[]: {id, at, item}. state.shots[]: {owner, kind, pos, dir, y}. state.clouds, decoys, mines.
//   state.owner / state.trail: territory per TERRITORY cell (ship index + 1). state.whale. state.gale.
//   state.weather[]: systems {kind (WEATHER_KIND, -1 empty), at, r}. Views: stormView(), skyAt(), windAt(),
//     seaLevel(), sunDir(), isNight(), localHour(), seen() (visibility: visible, lantern-only, on the map).
//
// state.events: what happened this tick (cleared at the start of each step). Each Happening has kind (EVENT),
// ship, by, at (unit vector), y (height), amount, shield, hull, item, flag (FLAG bits), cells. Per kind:
//   fire        ship fired; item weapon kind, amount rarity, at muzzle, y height; flag 3 for a broadside
//   windup      a heavy gun winding up to fire (WINDUP): item weapon kind, amount seconds (0: stood down), by the
//               ship it is aimed at (-1 none). combat.landing() gives where a lobbed shot in flight comes down
//   impact      a shot landed; ship hit (-1 none), by shooter, item kind; flag FLAG.ship/land/crit; 8 a decoy
//   splash      a mortar burst; amount radius
//   hit         ship took damage from by; amount total, shield and hull the split, item weapon kind or CAUSE;
//               flag FLAG.crit, FLAG.broke (shield broke), FLAG.steady (Storm, burning, ash: tick by tick)
//   shieldBreak ship's shield broke
//   sink        ship sank, by whom (-1 none); item cause, amount its placing
//   pickup      ship took loot (by = loot id); item kind, amount count, y rarity
//   drop        ship dropped an item; item kind, amount count, y rarity
//   select      ship selected a slot (amount); item kind; flag 1 when it was a swap
//   gust        ship gusted; amount charges left
//   useStart / useDone / useCancel   consumable item; amount seconds (start), count left (done); shield/hull added
//   reload      item weapon; amount seconds (start), or flag FLAG.done when loaded; empty: the magazine ran dry
//   blocked     a shot swallowed by smoke, or a consumable that would do nothing (item kind)
//   stormWait / stormShrink   item phase 0–6, amount seconds until it changes, y next radius; at the next centre
//   galeDive    ship left the Gale (item region below); landing: ship touched down (item region)
//   deliveryCalled / deliveryArrived  item parcel tier; amount the price
//   whaleSurface / whaleDive / whaleRising (amount warning seconds) / whaleBreach (amount lift reach, y flip reach)
//   flipped     ship flipped by the whale; amount seconds
//   perkGained / perkLost   item region index (its perk is REGIONS[item].perk)
//   home / claim / cut / swallow / freed   territory, with cells; amount square metres; cut: ship lost its trail
//               to by (flag 1: it ran dry)
//   lead        ship took the lead in territory from by
//   ability / abilityEnd   item active index; amount seconds it runs
//   mineBurst, lightningWarn (ship targeted, amount warning seconds), lightning, ablaze (ship set burning by by;
//               flag 1 when the fire leapt from a burning ship upwind)
//   mastFall    ship's mainmast went over the side (by who brought it down); amount the side, +1 starboard
//   juryRig     ship has a jury mast up in its place;  quench: ship's fire put out by the weather (flag 1: a heated
//               shot quenched as it struck)
//   impact      also carries the parts a ship hit struck, as FLAG.sail / waterline / rudder, and FLAG.rake for a
//               shot down her length; hull the hull points it took
//   scrape      ship scraped the ground; ram: ship rammed by; coins: ship earned amount (item: 1 rent, 2 cut,
//               3 claim, 4 kill)
//   weatherForms / weatherEnds   item WEATHER_KIND, amount radius; win: ship won
//
// state.noise: what the captains can hear or see from afar (captains/hearing.ts); state.director: the pacing
// director's phase and the player's heat (captains/director.ts).
import { helm, think } from './captains/brain.ts';
import { watch } from './captains/learning.ts';
import { listen } from './captains/hearing.ts';
import { direct } from './captains/director.ts';
import { arm, burnTick, fly } from './combat.ts';
import { partsTick } from './parts.ts';
import { gulls } from './economy.ts';
import { over, settle } from './end.ts';
import { interrupt } from './harm.ts';
import { copyInput, idleInput, inputAt, replay, type Recording, type ShipInput } from './input.ts';
import { drop, driftLoot, pickups, select, swap, useTick } from './items.ts';
import { blow, glide, ride } from './opening.ts';
import { powers, useAbility } from './powers.ts';
import { collide, gust, rechargeGust, refloat, sail } from './sailing.ts';
import { PHASE, PLAYER, SHIPS, type MatchState } from './state.ts';
import { storm } from './storm.ts';
import { chart, mendAtHome, perks, rent } from './territory.ts';
import { brew, weatherOnShips } from './weather.ts';
import { swim, callBreach } from './whale.ts';
import { stir } from './wind.ts';
import { EVENT } from './state.ts';
import { WHALE } from './tables.ts';

const INPUTS: ShipInput[] = Array.from({ length: SHIPS }, idleInput);

/** The inputs each ship sailed by on the last tick, captains' included. */
export const lastInputs = (): readonly ShipInput[] => INPUTS;

/** Advances the match one tick (1/30 s). */
export function step(state: MatchState, input: ShipInput | null = null, inputs: readonly (ShipInput | null)[] | null = null): void {
  if (over(state)) return;
  state.events.length = 0;
  brew(state);
  stir(state);
  blow(state);
  for (let i = 0; i < SHIPS; i++) {
    const given = inputs?.[i] ?? (i === PLAYER ? input : null);
    if (given) copyInput(INPUTS[i], given);
    else if (state.ships[i].captain.on && state.ships[i].phase !== PHASE.sunk) {
      think(state, i);
      helm(state, i, INPUTS[i]);
    } else copyInput(INPUTS[i], IDLE);
  }
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i], input = INPUTS[i];
    if (ship.phase === PHASE.sunk) continue;
    if (ship.phase === PHASE.gale) {
      ride(state, i, input);
      continue;
    }
    if (ship.phase === PHASE.glide) {
      glide(state, i, input);
      continue;
    }
    if (input.select >= 0) select(state, i, input.select);
    if (input.swap >= 0) swap(state, i, input.swap);
    if (input.drop) drop(state, i);
    if (input.gust) gust(state, i);
    if (input.ability) useAbility(state, i, input);
    rechargeGust(ship);
    sail(state, i, input);
    refloat(state, i);
    arm(state, i, input);
    useTick(state, i);
    if (input.dive && ship.use >= 0) interrupt(state, i);
  }
  collide(state);
  fly(state);
  burnTick(state);
  partsTick(state);
  powers(state);
  weatherOnShips(state);
  pickups(state, INPUTS);
  driftLoot(state);
  gulls(state, INPUTS);
  chart(state);
  perks(state);
  mendAtHome(state);
  rent(state);
  storm(state);
  for (const e of state.events) if (e.kind === EVENT.stormWait && (WHALE.at as readonly number[]).includes(e.item)) callBreach(state);
  swim(state);
  settle(state);
  // what the captains will hear of this tick, and the director's read of it
  listen(state);
  direct(state);
  state.tick++;
  for (let i = 0; i < SHIPS; i++) if (state.ships[i].captain.on) watch(state, i);
}

const IDLE = idleInput();

/** Replays a recording of the player's inputs up to `tick`. */
export function runMatch(state: MatchState, recording: Recording, tick: number): void {
  const r = replay(recording);
  while (state.tick < tick && !over(state)) step(state, inputAt(r, state.tick));
}

/** Runs the match to its end with the player's ship idle (or captained). */
export function resolve(state: MatchState, limit = 60 * 60 * 30): void {
  while (!over(state) && state.tick < limit) step(state, null);
}

export { createMatch, type FleetEntry, type MatchSetup } from './setup.ts';
export { idleInput, recorder, record, replay, inputAt, parseRecording, type ShipInput, type Recording } from './input.ts';
export { over, result, type MatchResult, type ShipResult, type LearntMind } from './end.ts';
export {
  EVENT, EVENT_NAMES, FLAG, PHASE, CAUSE, GULL, WHALE_STATE, PLAYER, SHIPS, TICK, encodeMatch, decodeMatch, matchHash,
  type MatchState, type Ship, type Happening, type Item, type Loot, type Shot,
} from './state.ts';
export { ITEM, ITEM_NAMES, RARITY, WEAPONS, USES, SLOTS, WEATHER_KIND, WEATHER_NAMES, ZONES, STORM } from './tables.ts';
export { ACTIVES, PASSIVES, PERK, hasPerk } from './perks.ts';
export { stormView, newStormView, calmNow, inStorm, stormBites, type StormView, type Calm } from './storm.ts';
export { seen, SEEN, sightOf } from './visibility.ts';
export { seaLevel, sunDir, isNight, localHour, hourOf } from './environment.ts';
export { windAt, newWind, type Wind } from './wind.ts';
export { skyAt, newSky, type Sky } from './weather.ts';
export { squareMetres, holderOf, landmarkHold } from './territory.ts';
export { priceOf, canCall } from './economy.ts';
