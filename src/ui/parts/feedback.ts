// Every press responds with a sound and a haptic. What draws them never plays sound or buzzes itself: it calls
// feedback() with a sound name and a haptic kind, and the app connects the hook to src/audio and to Capacitor haptics
// (src/app/uiFeedback.ts). Screen effects (screen changes, ceremonies) are reported through the same channel, so the
// capture tools can log every sound and screen effect that fired.

/** The interface's sounds, by name. The app maps each to a sound in src/audio. */
export type UiSound =
  | 'tap' | 'back' | 'tab' | 'toggle' | 'slide' | 'select' | 'equip' | 'deny' | 'open' | 'close'
  | 'play' | 'start' | 'count' | 'tick' | 'reward' | 'unlock' | 'levelUp' | 'rankUp' | 'victory' | 'defeat'
  | 'toast' | 'popup' | 'whoosh' | 'gust' | 'ability' | 'fire' | 'slot' | 'pickup' | 'dive' | 'pick' | 'none';

/** Haptic kinds, as Capacitor's impact styles and notification types. */
export type UiHaptic = 'none' | 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export interface FeedbackEvent {
  /** 'press' for a press on something drawn, 'effect' for a screen effect. */
  type: 'press' | 'effect';
  sound: UiSound;
  haptic: UiHaptic;
  /** What fired it: a press's name, or an effect name such as 'screen:lobby' or 'ceremony:victory'. */
  what: string;
  /** performance.now() when it fired. */
  t: number;
}

export type FeedbackHook = (sound: UiSound, haptic: UiHaptic, what: string) => void;

let hook: FeedbackHook = () => {};
const listeners = new Set<(e: FeedbackEvent) => void>();
let enabledHaptics = true;

/** The app sets this once: play the sound and fire the haptic. */
export function setFeedbackHook(fn: FeedbackHook): void {
  hook = fn;
}

/** Turns haptics off or on (from settings). Sounds still fire. */
export function setHaptics(on: boolean): void {
  enabledHaptics = on;
}

/** Listens to everything that fires (the capture tools' log). Returns an unsubscribe. */
export function onFeedback(fn: (e: FeedbackEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function fire(type: FeedbackEvent['type'], sound: UiSound, haptic: UiHaptic, what: string): void {
  const h = enabledHaptics ? haptic : 'none';
  if (sound !== 'none' || h !== 'none') hook(sound, h, what);
  const e: FeedbackEvent = { type, sound, haptic: h, what, t: performance.now() };
  for (const l of listeners) l(e);
}

/** A press on something drawn. */
export const feedback = (sound: UiSound, haptic: UiHaptic, what = 'part'): void => fire('press', sound, haptic, what);
/** A screen effect: a transition, a ceremony, a count-up landing. */
export const effect = (what: string, sound: UiSound = 'none', haptic: UiHaptic = 'none'): void => fire('effect', sound, haptic, what);
