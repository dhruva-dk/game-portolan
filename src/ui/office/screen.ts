// The office's screen template. A screen is a file of ui/office/ exporting `create<Name>(send)`, which returns its
// element and `show(view)`: it draws the view it is given (office.ts, built by career/views.ts) and keeps no career
// state, and every change it asks for goes through `send`. It is registered in office/screens.ts with the desk's view
// it draws; its ways out are taps (send.tap), which ways.ts tables.

import type { Command, Desk } from '../../office';
import type { Tone } from '../kit/notice';
import type { Tap } from '../ways';

/** What a screen may ask of the office. */
export interface Send {
  /** Applies a command (journaled before the office redraws); false, refused, and the notice says why. */
  command(c: Command): Promise<boolean>;
  /** A way on (ways.ts). */
  tap(t: Tap): void;
  /** A notice under the top bar. */
  say(sentence: string, tone?: Tone): void;
  /** The career's desk, for what is not a command: the found form's rerolls, recovery and backups. */
  desk(): Desk;
  /** The office's page (1180 × 820), for what is laid over the screen: an explanation slip, a dialog. */
  page(): HTMLElement;
}

/** A screen: its element (laid on the body's grid) and `show`, which draws a view. */
export interface Screen<V> { el: HTMLElement; show(view: V): void }

/** A screen as the office holds it: made once, drawn from the desk's view whenever the career changes. */
export interface Registered { el: HTMLElement; draw(): void }

/** Registers a screen: how it is made, and the view of the desk it draws. */
export const register = <V>(make: (send: Send) => Screen<V>, view: (desk: Desk) => V) => (send: Send): Registered => {
  const s = make(send);
  return { el: s.el, draw: () => s.show(view(send.desk())) };
};
