// Checks on the WGSL three generates for our materials (tools/capture/shaders.ts dumps it from a running match).
//
// resets(): a variable three declares at its starting value a second time, after it has been given a value in a
// branch, and then reads. Three (r187) takes a TSL variable first met inside a branch (an If, a Loop) for that
// branch's own: met again outside it, it is declared afresh, at its starting value, and whatever the branch gave it
// is lost. A variable shared between a material's parts (its colour, its roughness, its light) must be declared at
// the top of the function that owns it; this finds the ones that are not. A fresh start that is then added to (`x =
// x + …`) is three working a value out again, which costs time but loses nothing, and is not reported.

export interface Reset {
  /** The variable, as the WGSL names it. */
  name: string;
  /** 1-based line of the second declaration in the stage's source. */
  line: number;
  /** The first line that reads the lost value. */
  read: string;
}

const CONSTANT = /^(?:[-\d.e]+[iu]?|vec[234]<[fiu]32>\( [-\d.e, iu]+ \))$/;

/** One stage's WGSL (a vertex or a fragment shader) checked for variables reset before they are read. */
export function resets(wgsl: string): Reset[] {
  const lines = wgsl.split('\n');
  const entry = lines.findIndex((l) => /^fn main\(/.test(l));
  if (entry < 0) return [];
  const globals = new Set([...wgsl.matchAll(/^var<private> (\w+)/gm)].map((m) => m[1]));
  // a function-local variable of the same name hides the global
  for (const m of lines.slice(entry).join('\n').matchAll(/^\s+var (\w+) :/gm)) globals.delete(m[1]);
  const out: Reset[] = [];
  // each open block as [its if/else chain, which branch of it]: two blocks of one chain never both run
  const path: [number, number][] = [];
  let chains = 0;
  const assigned = new Map<string, [number, number][][]>();
  for (let i = entry + 1; i < lines.length; i++) {
    const s = lines[i].trim();
    if (s.startsWith('}')) {
      const closed = path.pop();
      if (closed && /^\}\s*else/.test(s)) path.push([closed[0], closed[1] + 1]);
      continue;
    }
    if (s.endsWith('{')) {
      path.push([++chains, 0]);
      continue;
    }
    const m = /^(\w+) = (.*);$/.exec(s);
    if (!m || !globals.has(m[1])) continue;
    const name = m[1], here = path.map((p) => [...p] as [number, number]);
    if (!CONSTANT.test(m[2].trim())) {
      (assigned.get(name) ?? assigned.set(name, []).get(name)!).push(here);
      continue;
    }
    const lost = (assigned.get(name) ?? []).some((prev) => {
      let k = 0;
      while (k < prev.length && k < here.length && prev[k][0] === here[k][0] && prev[k][1] === here[k][1]) k++;
      // given its value in a block this line is not inside, and not in another branch of the same choice
      return k < prev.length && !(k < here.length && prev[k][0] === here[k][0]);
    });
    if (!lost) continue;
    const word = new RegExp(`\\b${name}\\b`);
    const next = lines.slice(i + 1).find((l) => word.test(l))?.trim();
    if (next && !next.startsWith(`${name} = `)) out.push({ name, line: i + 1, read: next.slice(0, 160) });
  }
  return out;
}

/** Every material's resets, by material and stage: { "parent/object|type|name fragment": [...] }. */
export function check(shaders: Record<string, string>): Record<string, Reset[]> {
  const out: Record<string, Reset[]> = {};
  for (const [key, source] of Object.entries(shaders)) {
    const [vertex, fragment = ''] = source.split('//==FRAGMENT==');
    for (const [stage, wgsl] of [['vertex', vertex], ['fragment', fragment]] as const) {
      const found = resets(wgsl);
      if (found.length) out[`${key} ${stage}`] = found;
    }
  }
  return out;
}
