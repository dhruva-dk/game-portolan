// The interface's feedback hook, connected: each UiSound plays a sound from the bank and each UiHaptic buzzes, and
// every screen effect the interface reports goes into the effect log.
import type { SoundName } from '../audio/bank.ts';
import { onFeedback, setFeedbackHook, type UiHaptic, type UiSound } from '../ui/parts/feedback.ts';
import type { EffectLog } from './effects.ts';
import type { HapticKind, HapticsOut } from './haptics.ts';

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

export function connectUiFeedback(log: EffectLog, haptics: HapticsOut, play: (name: SoundName) => void): void {
  setFeedbackHook((sound, haptic, what) => {
    if (sound !== 'none') play(SOUND[sound]);
    if (haptic !== 'none') haptics.play(HAPTIC[haptic], what);
  });
  onFeedback((e) => {
    if (e.type === 'effect') log.add('screen', e.what, e.sound !== 'none' ? { sound: e.sound } : undefined);
  });
}
