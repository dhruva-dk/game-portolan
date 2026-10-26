export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface View {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly safe: Insets;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

let probe: HTMLDivElement | null = null;

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

export function safeRect(v: View): Rect {
  const { top, right, bottom, left } = v.safe;
  return { x: left, y: top, width: v.width - left - right, height: v.height - top - bottom };
}
