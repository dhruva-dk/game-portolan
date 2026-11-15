// The seam between the career and a match: a RaceCard goes in, a RaceResult comes out, with the plain types both
// share. Types and constants only. The career (career/) writes the card and reads the result; the match (sim/, play/)
// reads the card and writes the result; neither sees the other.

import type { GunKind } from './kinds';

export type Stat = 'gunnery' | 'helm' | 'seamanship' | 'nerve' | 'consistency' | 'stormcraft' | 'stamina' | 'feedback' | 'lookout';
export type CaptainStats = Readonly<Record<Stat, number>>;          // each 0..20, form and morale already applied
export type Style = 'hunter' | 'homesteader' | 'raider' | 'turtle' | 'scavenger' | 'brawler';
export type PartType = 'sails' | 'rigging' | 'rudder' | 'hull' | 'keel' | 'mounts';
export type Job = 'mend' | 'gust' | 'stores' | 'part';
export type Stance = 'hunt' | 'hold' | 'loot' | 'shadow';
export type Call = 'withMe' | 'attack' | 'hold' | 'free';
export interface Colours { first: number; second: number }          // indices into palette CREW swatches
export const SWATCHES = 24;                                          // palette CREW's length (#58 step 3)
export interface Handling { top: number; gather: number; turn: number; answer: number; hull: number; spread: number; reload: number }
export interface Fitted { type: PartType; reliability: number; condition: number }  // both 0..1; condition at the start
export interface Captain { stats: CaptainStats; style: Style; seed: number }
/** What a ship's bosun and flight can do, worked out by the career from their stats (Phase B section 2). */
export interface Service {
  arrive: number;                                    // seconds from call to work
  order: readonly Job[];
  rate: Readonly<Record<Job, number>>;               // k of each job (Phase A section 8)
  botch: Readonly<Record<Job, number>>;              // chance a job's start botches, before fire
  underFire: number;                                 // multiplies botch while she was hit in the last 5 s
  freeRepair: boolean;                               // bond perk: the first fault is repaired on arrival
  gustRecharge: number;                              // bond perk: multiplies Gust recharge time
}
export interface RaceShip { id: number; side: number; colours: Colours; handling: Handling; parts: readonly Fitted[];
  captain: Captain | null; service: Service; stance: Stance; forfeit: boolean }
export interface StormPlan { pace: number }                         // multiplies every phase's wait and close; 1 is today's
export interface Rules { spec: readonly PartType[]; storm: StormPlan; banned: readonly GunKind[];
  pointsPerSinking: number; seaHeldPoint: boolean; prizeSpread: number; inspection: number }
export interface RaceCard { seed: number; league: number; round: number; rules: Rules; ships: readonly RaceShip[] }  // 80 ships; 2k and 2k+1 are side k
export type Cause = 'shot' | 'ram' | 'storm' | 'forfeit';
export interface RaceResult { seed: number; league: number; round: number;
  order: readonly number[];                                          // ids, first place first
  sinkings: readonly { id: number; by: number | null; cause: Cause; second: number }[];
  seaHeld: readonly { id: number; share: number }[];
  faults: readonly { id: number; type: PartType; second: number }[];
  stops: readonly { id: number; job: Job; botched: boolean }[];
  hits: readonly { id: number; fired: number; landed: number; taken: number }[];
  seconds: number }
