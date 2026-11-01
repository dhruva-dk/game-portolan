// Haptics: one small vocabulary for the whole game, played through Capacitor on a device and only logged in a browser
// (Chromium's navigator.vibrate warns when called without a tap, and desktops have no motor anyway).
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import type { EffectLog } from './effects.ts';

export type HapticKind = 'tap' | 'select' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export interface HapticsOut {
  enabled: boolean;
  play(kind: HapticKind, why?: string): void;
}

export function createHaptics(log: EffectLog): HapticsOut {
  const native = Capacitor.isNativePlatform();
  const out: HapticsOut = {
    enabled: true,
    play(kind, why) {
      if (!out.enabled) return;
      log.add('haptic', kind, why ? { why } : undefined);
      if (!native) return;
      const done = (p: Promise<void>) => void p.catch(() => {});
      switch (kind) {
        case 'tap': case 'light': return done(Haptics.impact({ style: ImpactStyle.Light }));
        case 'select': return done(Haptics.selectionChanged());
        case 'medium': return done(Haptics.impact({ style: ImpactStyle.Medium }));
        case 'heavy': return done(Haptics.impact({ style: ImpactStyle.Heavy }));
        case 'success': return done(Haptics.notification({ type: NotificationType.Success }));
        case 'warning': return done(Haptics.notification({ type: NotificationType.Warning }));
        case 'error': return done(Haptics.notification({ type: NotificationType.Error }));
      }
    },
  };
  return out;
}
