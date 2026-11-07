// Keeps three's shaders inside WGSL's private-memory limit.
//
// three declares every temporary of a vertex or fragment shader as a module-scope `var<private>` and assigns it once in
// `main`. WGSL caps the private address space at 8192 bytes a shader, a limit WebKit enforces and Chrome does not: the
// land's fragment shader holds some 1500 temporaries (13 KB), so on an iPad its pipeline is refused and nothing draws.
// A temporary written once and read only after that write, within the block it was written in, is a value, not a
// variable: it becomes a typed `let` there, which takes no memory in any address space. What is written more than
// once (a running sum, a field set piece by piece) stays a variable.

const DECLARATION = /^var<private> ([A-Za-z_]\w*) : ([^;=]+);\n/gm;
const TOKEN = /\/\/[^\n]*|[A-Za-z_]\w*|[{}]/g;

interface Use { at: number; block: number; write: 'none' | 'plain' | 'other' }

/** What follows an identifier at `i` makes it a write: `x =` is a plain one, `x.y =`, `x[i] =`, `x += …` and
 *  `x++` are others. */
function writeAt(code: string, i: number): Use['write'] {
  let j = i;
  while (code[j] === ' ') j++;
  if (code[j] === '=' && code[j + 1] !== '=') return 'plain';
  if ('+-*/%&|^'.includes(code[j]) && code[j + 1] === '=') return 'other';
  if ((code[j] === '+' && code[j + 1] === '+') || (code[j] === '-' && code[j + 1] === '-')) return 'other';
  if ((code[j] === '<' || code[j] === '>') && code[j + 1] === code[j] && code[j + 2] === '=') return 'other';
  if (code[j] !== '.' && code[j] !== '[') return 'none';
  // a member or an element: skip the access chain and look for an assignment after it
  while (code[j] === '.' || code[j] === '[') {
    if (code[j] === '.') { j++; while (/\w/.test(code[j])) j++; } else {
      let depth = 0;
      do { if (code[j] === '[') depth++; else if (code[j] === ']') depth--; j++; } while (depth > 0 && j < code.length);
    }
    while (code[j] === ' ') j++;
  }
  return code[j] === '=' && code[j + 1] !== '=' ? 'other' : 'none';
}

export function tightenPrivates(code: string): string {
  const types = new Map<string, string>();
  for (const m of code.matchAll(DECLARATION)) types.set(m[1], m[2].trim());
  if (!types.size) return code;
  const main = code.search(/\bfn main\s*\(/);
  if (main < 0) return code;

  // every use of a private, the block it sits in, and where each block ends
  const uses = new Map<string, Use[]>();
  const blockEnd: number[] = [];
  const stack: number[] = [];
  let outside = new Set<string>();
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(code); m; m = TOKEN.exec(code)) {
    const t = m[0];
    if (t === '{') { if (m.index > main) { stack.push(blockEnd.length); blockEnd.push(code.length); } continue; }
    if (t === '}') { if (m.index > main && stack.length) blockEnd[stack.pop()!] = m.index; continue; }
    if (t.startsWith('//') || !types.has(t)) continue;
    if (m.index < main || !stack.length) {
      // a declaration, or a use in another function (which a `let` in main could not reach)
      if (!code.startsWith('var<private> ', m.index - 13)) outside.add(t);
      continue;
    }
    let list = uses.get(t);
    if (!list) uses.set(t, (list = []));
    list.push({ at: m.index, block: stack[stack.length - 1], write: writeAt(code, m.index + t.length) });
  }

  // the values: one plain write, first, and every read after it inside its block
  const lets = new Map<number, string>();
  for (const [name, list] of uses) {
    if (outside.has(name)) continue;
    const w = list[0];
    if (w.write !== 'plain' || list.some((u, k) => k > 0 && u.write !== 'none')) continue;
    if (list.some((u) => u.at > blockEnd[w.block])) continue;
    lets.set(w.at, name);
  }
  if (!lets.size) return code;

  let out = '', from = 0;
  for (const at of [...lets.keys()].sort((a, b) => a - b)) {
    const name = lets.get(at)!;
    out += code.slice(from, at) + `let ${name} : ${types.get(name)}`;
    from = at + name.length;
  }
  out += code.slice(from);
  const gone = new Set(lets.values());
  return out.replace(DECLARATION, (line, name: string) => (gone.has(name) ? '' : line));
}

/** The bytes a shader's remaining privates take, by WGSL's sizes for the scalar and vector types three declares. */
export function privateBytes(code: string): number {
  const SIZE: Record<string, number> = { f32: 4, i32: 4, u32: 4, bool: 4, f16: 2 };
  let bytes = 0;
  for (const m of code.matchAll(DECLARATION)) {
    const t = m[2].trim(), v = /^vec([234])<(\w+)>$/.exec(t), mat = /^mat(\d)x(\d)<f32>$/.exec(t);
    bytes += t in SIZE ? SIZE[t] : v ? Number(v[1]) * SIZE[v[2]] : mat ? Number(mat[1]) * (mat[2] === '3' ? 4 : Number(mat[2])) * 4 : 64;
  }
  return bytes;
}
