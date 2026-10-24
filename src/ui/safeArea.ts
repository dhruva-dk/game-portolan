// The safe area: the insets the notch or Dynamic Island and the home indicator leave, read from CSS env() through
// an empty probe element, and the view every screen lays itself out in.

/** Insets from each edge, CSS px. */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** The screen as the interface sees it: CSS px, the device pixel ratio and the safe insets. */
export interface View {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly safe: Insets;
}

/** A rectangle, CSS px from the top left. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

let probe: HTMLDivElement | null = null;

/** The view as it is now; read it again after every resize, since rotation changes the insets. */
export function readView(): View {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) '
      + 'env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.append(probe);
  }
  const s = getComputedStyle(probe);
  return {
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
    safe: { top: parseFloat(s.paddingTop), right: parseFloat(s.paddingRight), bottom: parseFloat(s.paddingBottom), left: parseFloat(s.paddingLeft) },
  };
}

/** The part of the view clear of the notch, the Dynamic Island and the home indicator. */
export function safeRect(v: View): Rect {
  const { top, right, bottom, left } = v.safe;
  return { x: left, y: top, width: v.width - left - right, height: v.height - top - bottom };
}
