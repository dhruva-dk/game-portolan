// The interface's feedback hook, connected: each UiSound plays a sound from the bank and each UiHaptic buzzes, and
// every screen effect the interface reports goes into the effect log.
import type { SoundName } from '../audio/bank.ts';
import { onFeedback, setFeedbackHook, type UiHaptic, type UiSound } from '../ui/parts/feedback.ts';
import type { Haptics, HapticKind } from '../juice/index.ts';

const SOUND: Record<Exclude<UiSound, 'none'>, SoundName> = {
  tap: 'tap', back: 'back', tab: 'tab', toggle: 'toggle', slide: 'tick', select: 'confirm', equip: 'equip', deny: 'deny',
  open: 'popup', close: 'back', play: 'confirm', start: 'confirm', count: 'tick', tick: 'tick', reward: 'reward',
  unlock: 'stingAbilityUnlock', levelUp: 'stingLevelUp', rankUp: 'stingRankUp', victory: 'stingVictory', defeat: 'stingDefeat',
  toast: 'toast', popup: 'popup', whoosh: 'tab', gust: 'gust', ability: 'abilityReady', fire: 'fireCannon', slot: 'select',
  pickup: 'pickup', dive: 'galeDive', pick: 'select',
};

const HAPTIC: Record<Exclude<UiHaptic, 'none'>, HapticKind> = {
  selection: 'select', light: 'light', medium: 'medium', heavy: 'heavy', success: 'success', warning: 'warning', error: 'error',
};

export function connectUiFeedback(
  log: (what: string, sound: UiSound) => void, haptics: Haptics, play: (name: SoundName) => void,
): void {
  setFeedbackHook((sound, haptic) => {
    if (sound !== 'none') play(SOUND[sound]);
    if (haptic !== 'none') haptics.play(HAPTIC[haptic]);
  });
  onFeedback((e) => {
    if (e.type === 'effect') log(e.what, e.sound);
  });
}
