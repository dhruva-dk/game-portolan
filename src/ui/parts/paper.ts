// Parchment for the interface. The sheets themselves are rendered on the GPU at load (src/render/paper): the paper
// tile, its deckled edge, a ruled ink frame and the wax seals. They arrive here as images and hang on the page's
// root as CSS variables (--paper, --torn, --rule, --seal-red, --seal-gold, --seal-black), so every panel shares
// them. Until they come, a panel shows the paper's flat colour.

/** The GPU's sheets, as image URLs, and the paper tile itself for painting on. */
export interface ParchmentSheets {
  paper: string;
  torn: string;
  rule: string;
  seal: { red: string; gold: string; black: string };
  tile: HTMLCanvasElement;
}

let sheets: ParchmentSheets | null = null;

/** Hangs the sheets on the page. */
export function applyParchment(s: ParchmentSheets): void {
  sheets = s;
  const root = document.documentElement.style;
  root.setProperty('--paper', `url(${s.paper})`);
  root.setProperty('--torn', `url(${s.torn})`);
  root.setProperty('--rule', `url(${s.rule})`);
  for (const [k, v] of Object.entries(s.seal)) root.setProperty(`--seal-${k}`, `url(${v})`);
  document.documentElement.classList.add('has-parchment');
}

/** The paper tile, once the sheets have come. */
export function paperTile(): HTMLCanvasElement | null {
  return sheets?.tile ?? null;
}
