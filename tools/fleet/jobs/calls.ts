// Which call of Math first comes out differently on two machines (jobs.ts JOBS
// calls): the sim's modules loaded, a match's planet made and its first
// seconds stepped, with every function of Math that the language does not pin
// (TRACED) watched from before the first module loads (a table built as a
// module loads is watched too), each call's arguments and result hashed by
// their bits, a hash a chunk of calls. Run on two machines, the first chunk
// whose hashes differ holds the first call that differs; a second run asked
// for that chunk writes its every call (the function, its arguments, its
// result, and where in the code it was called from), and the two lists are
// compared: the first call with the same arguments and another result is the
// fault's.
//
// A shard: `<match>` (the chunks' hashes) or `<match>.<chunk>` (that chunk's
// calls). A tool for finding a fault, not a measure: the watching slows the
// match several times over.
//
// Node only (tools/).

/** The functions of Math whose results the language leaves to the engine. */
export const TRACED = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log10',
  'log2',
  'pow',
  'cbrt',
  'hypot',
] as const;

/** Calls a chunk, and the seconds of the match's clock stepped. */
const CHUNK = 16384,
  SECONDS = 30;

/** A number's bits in hex; every NaN alike (its bits are the processor's own). */
const view = new DataView(new ArrayBuffer(8));
function hex(v: number): string {
  if (Number.isNaN(v)) return 'nan';
  view.setFloat64(0, v);
  return (
    view.getUint32(0).toString(16).padStart(8, '0') +
    view.getUint32(4).toString(16).padStart(8, '0')
  );
}

/** From here on, every call of a traced function is shown to `each`, in order. */
function watch(each: (name: number, args: number[], result: number) => void) {
  const all = Math as unknown as Record<string, (...a: number[]) => number>;
  TRACED.forEach((name, i) => {
    const real = all[name];
    all[name] = (...args) => {
      const result = real(...args);
      each(i, args, result);
      return result;
    };
  });
}

/** Thrown to end a run once the chunk asked for is whole. */
const ENOUGH = Symbol('enough');

export async function calls(shard: string): Promise<unknown> {
  const [match, chunk] = shard.split('.').map(Number);
  const numbers = new Float64Array(4),
    bytes = new Uint8Array(numbers.buffer);
  let n = 0,
    asked = 0x811c9dc5,
    answered = 0x811c9dc5;
  const chunks: { asked: string[]; answered: string[] } = {
      asked: [],
      answered: [],
    },
    listed: [string, string[], string, number][] = [],
    sites: string[] = [];
  const eight = (h: number) => (h >>> 0).toString(16).padStart(8, '0');
  const close = () => {
    chunks.asked.push(eight(asked));
    chunks.answered.push(eight(answered));
    asked = answered = 0x811c9dc5;
  };
  /** Where a call was made from: the frames of src nearest it. */
  const site = () => {
    const at = (new Error().stack ?? '')
      .split('\n')
      .filter((l) => l.includes('/src/'))
      .slice(0, 3)
      .map((l) => l.replace(/^.*\/src\//, 'src/').replace(/\)$/, ''))
      .join(' < ');
    const known = sites.indexOf(at);
    return known >= 0 ? known : sites.push(at) - 1;
  };
  watch((name, args, result) => {
    if (chunk === undefined) {
      numbers[0] = name;
      numbers[1] = Number.isNaN(args[0]) ? -1 : args[0];
      numbers[2] = args.length < 2 || Number.isNaN(args[1]) ? -1 : args[1];
      numbers[3] = Number.isNaN(result) ? -1 : result;
      for (let i = 0; i < 32; i++) {
        if (i < 24) asked = Math.imul(asked ^ bytes[i], 0x01000193);
        answered = Math.imul(answered ^ bytes[i], 0x01000193);
      }
      if (++n % CHUNK === 0) close();
      return;
    }
    const of = Math.floor(n++ / CHUNK);
    if (of === chunk)
      listed.push([TRACED[name], args.map(hex), hex(result), site()]);
    else if (of > chunk) throw ENOUGH;
  });
  try {
    // (loaded here, watched: nothing of src has run before this)
    const { runWatched } = await import('../../harness/run.ts');
    runWatched({ match, brains: ['default'], seconds: SECONDS });
  } catch (e) {
    if (e !== ENOUGH) throw e;
  }
  if (chunk !== undefined) return { match, chunk, calls: listed, sites };
  close();
  return { match, seconds: SECONDS, calls: n, chunk: CHUNK, ...chunks };
}
