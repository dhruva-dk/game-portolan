// Canonical JSON and the 32-bit FNV-1a sum the journal and snapshots are checked by (Phase B section 1). Written here,
// no library, no Web Crypto: the same text and the same sum for the same value on every platform.

/** A value the career saves: plain JSON, no undefined, no functions, finite numbers. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/** JSON with every object's keys sorted and no whitespace. Throws on what JSON cannot carry (a bug, not bad input). */
export function canonical(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean': return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new Error(`canonical: ${value} is not a finite number`);
      return JSON.stringify(value);
    case 'string': return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`).join(',')}}`;
    }
    default: throw new Error(`canonical: a ${typeof value} cannot be saved`);
  }
}

const OFFSET = 0x811c9dc5;
const PRIME = 0x01000193;

/** FNV-1a over a string's UTF-16 code units (each as two bytes, low first), from a starting sum. */
export function fnv(text: string, from = OFFSET): number {
  let h = from >>> 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h = Math.imul(h ^ (c & 0xff), PRIME) >>> 0;
    h = Math.imul(h ^ (c >>> 8), PRIME) >>> 0;
  }
  return h >>> 0;
}

/** A sum as the eight lowercase hex digits it is saved as. */
export const hex = (sum: number): string => (sum >>> 0).toString(16).padStart(8, '0');

/** A sum read back from its hex, or null if it is not eight hex digits. */
export function unhex(text: string): number | null {
  return /^[0-9a-f]{8}$/.test(text) ? parseInt(text, 16) >>> 0 : null;
}

/** The sum of a text from the start: what a snapshot is checked by. */
export const sumOf = (text: string): string => hex(fnv(text));
