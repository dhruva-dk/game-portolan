// The match in progress: its state, where the player's input comes from (the controls, or a recording replayed
// from any tick) and the tick at which a replay holds still. Only step() advances it, one tick at a time.
import { inputAt, replay, type Recording, type Replay, type ShipInput } from '../sim/input.ts';
import { step } from '../sim/match.ts';
import type { MatchState } from '../sim/state.ts';
import type { Stepper } from './loop.ts';
import type { SavedMatch } from './save.ts';

export class Session implements SavedMatch, Stepper {
  readonly state: MatchState;
  readonly recording: Recording | null;
  readonly stopAt: number | null;
  private readonly replay: Replay | null;
  private readonly controls: () => ShipInput;

  /** `controls` gives the player's input for the next tick whenever no recording drives the ship. */
  constructor(m: SavedMatch, controls: () => ShipInput) {
    this.state = m.state;
    this.recording = m.recording;
    this.stopAt = m.stopAt;
    this.replay = m.recording && replay(m.recording);
    this.controls = controls;
  }

  /** The replay has reached its stopping tick. */
  get held(): boolean {
    return this.stopAt !== null && this.state.tick >= this.stopAt;
  }

  step(): boolean {
    if (this.held) return false;
    step(this.state, this.replay ? inputAt(this.replay, this.state.tick) : this.controls());
    return true;
  }
}
