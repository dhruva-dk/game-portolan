import type { GunKind } from '../sim/kinds.ts';
import type { MatchResult } from '../sim/result.ts';
import type { Livery } from '../world/livery.ts';
import {
  PHASES,
  type Focus,
  type Line,
  type Phase,
  type Role,
  type Terms,
} from './state.ts';

export type { Focus, GunKind, Line, Livery, Role, Terms };

export type Command =
  | { type: 'StartRace'; team: number }
  | { type: 'RecordRace'; team: number; result: MatchResult }
  | { type: 'FinishOffseason'; team: number }
  | { type: 'MarkRead'; team: number }
  | { type: 'MarkSeen'; team: number; id: string }
  | { type: 'SetFocus'; team: number; focus: Focus }
  | { type: 'Build'; team: number; slot: number; line: Line }
  | { type: 'FitGun'; team: number; slot: number; kind: GunKind }
  | { type: 'Repaint'; team: number; livery: Livery; emblem: number }
  | { type: 'SetScoutSeat'; team: number; role: Role }
  | { type: 'BuyReport'; team: number; person: number }
  | { type: 'Approach'; team: number; person: number }
  | { type: 'Offer'; team: number; person: number; terms: Terms }
  | { type: 'AcceptCounter'; team: number; person: number }
  | { type: 'Release'; team: number; person: number }
  | { type: 'SignSponsor'; team: number; offer: number; slot: number };

export type CommandType = Command['type'];

export type Reason =
  | 'team'
  | 'phase'
  | 'invalid'
  | 'unknown'
  | 'fixed'
  | 'seat'
  | 'locked'
  | 'attempts'
  | 'taken'
  | 'same'
  | 'funds';

export const REASONS: readonly Reason[] = [
  'team',
  'phase',
  'invalid',
  'unknown',
  'fixed',
  'seat',
  'locked',
  'attempts',
  'taken',
  'same',
  'funds',
];

const ASHORE: readonly Phase[] = ['lobby', 'offseason'];

export const VALID_IN: Record<CommandType, readonly Phase[]> = {
  StartRace: ['lobby'],
  RecordRace: ['racing'],
  FinishOffseason: ['offseason'],
  MarkRead: ASHORE,
  MarkSeen: PHASES,
  SetFocus: ASHORE,
  Build: ASHORE,
  FitGun: ASHORE,
  Repaint: ASHORE,
  SetScoutSeat: ASHORE,
  BuyReport: ASHORE,
  Approach: ASHORE,
  Offer: ASHORE,
  AcceptCounter: ASHORE,
  Release: ASHORE,
  SignSponsor: ASHORE,
};

export const COMMANDS: readonly CommandType[] = [
  'StartRace',
  'RecordRace',
  'FinishOffseason',
  'MarkRead',
  'MarkSeen',
  'SetFocus',
  'Build',
  'FitGun',
  'Repaint',
  'SetScoutSeat',
  'BuyReport',
  'Approach',
  'Offer',
  'AcceptCounter',
  'Release',
  'SignSponsor',
];

export const YOURS_ONLY: readonly CommandType[] = COMMANDS.slice(0, 5);
