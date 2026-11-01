// The career's save codec, ported from src/sim/codec.ts. A schema describes the record; values are written as
// varints, so a save is small and a damaged one fails to decode instead of loading wrong. Strings are ids:
// printable ASCII only, so the codec stays pure (no String.fromCharCode).
import { fmix32 } from '../sim/math.ts';

export interface Int { readonly t: 'int' }
export interface Bool { readonly t: 'bool' }
export interface Str { readonly t: 'str' }
export interface List<K extends Kind = Kind> { readonly t: 'list'; readonly of: K; readonly length: number | null }
export interface Rec<F extends readonly Field[] = readonly Field[]> { readonly t: 'rec'; readonly fields: F }
export type Field = readonly [name: string, kind: Kind];
export type Kind = Int | Bool | Str | List | Rec;

export const int: Int = { t: 'int' };
export const bool: Bool = { t: 'bool' };
export const str: Str = { t: 'str' };
export const list = <K extends Kind>(of: K, length: number | null = null): List<K> => ({ t: 'list', of, length });
export const rec = <const F extends readonly Field[]>(...fields: F): Rec<F> => ({ t: 'rec', fields });

export type Value<K> = K extends Int ? number
  : K extends Bool ? boolean
  : K extends Str ? string
  : K extends List<infer E> ? Value<E>[]
  : K extends Rec<infer F> ? { -readonly [P in F[number] as P[0]]: Value<P[1]> }
  : never;

export interface Format<K extends Kind> {
  readonly magic: string;
  readonly version: number;
  readonly schema: K;
}

const INT_LIMIT = 4503599627370496;
const ASCII = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
const STR_MAX = 256;

class Writer {
  buf = new Uint8Array(1 << 12);
  n = 0;
  readonly path: (string | number)[] = [];

  reserve(k: number): void {
    if (this.n + k <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.n + k) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.n));
    this.buf = next;
  }

  byte(b: number): void {
    this.reserve(1);
    this.buf[this.n++] = b;
  }

  varint(v: number): void {
    this.reserve(8);
    while (v >= 128) {
      const low = v % 128;
      this.buf[this.n++] = low | 128;
      v = (v - low) / 128;
    }
    this.buf[this.n++] = v;
  }

  fail(what: string): never {
    throw new TypeError(`encode: ${this.path.join('.')} is not ${what}`);
  }

  value(kind: Kind, v: unknown): void {
    switch (kind.t) {
      case 'int': {
        if (typeof v !== 'number' || Math.floor(v) !== v || v <= -INT_LIMIT || v >= INT_LIMIT) this.fail('an integer below 2^52');
        this.varint(v < 0 ? -2 * v - 1 : 2 * v);
        return;
      }
      case 'bool':
        if (typeof v !== 'boolean') this.fail('a boolean');
        this.byte(v ? 1 : 0);
        return;
      case 'str': {
        if (typeof v !== 'string' || v.length > STR_MAX) this.fail(`a string of at most ${STR_MAX}`);
        this.varint(v.length);
        for (let i = 0; i < v.length; i++) {
          const c = v.charCodeAt(i);
          if (c < 32 || c > 126) this.fail('printable ASCII');
          this.byte(c);
        }
        return;
      }
      case 'list': {
        if (!Array.isArray(v) || (kind.length !== null && v.length !== kind.length)) {
          this.fail(kind.length === null ? 'an array' : `an array of ${kind.length}`);
        }
        this.varint(v.length);
        for (let i = 0; i < v.length; i++) {
          this.path.push(i);
          this.value(kind.of, v[i]);
          this.path.pop();
        }
        return;
      }
      case 'rec': {
        if (typeof v !== 'object' || v === null) this.fail('a record');
        for (const [name, k] of kind.fields) {
          this.path.push(name);
          this.value(k, (v as Record<string, unknown>)[name]);
          this.path.pop();
        }
      }
    }
  }
}

export function encode<K extends Kind>(format: Format<K>, value: Value<K>): Uint8Array {
  const w = new Writer();
  for (let i = 0; i < 4; i++) w.byte(format.magic.charCodeAt(i));
  w.varint(format.version);
  w.path.push(format.magic);
  w.value(format.schema, value);
  return w.buf.slice(0, w.n);
}

class Reader {
  readonly buf: Uint8Array;
  n = 0;

  constructor(buf: Uint8Array) {
    this.buf = buf;
  }

  byte(): number {
    if (this.n >= this.buf.length) throw new RangeError('decode: truncated data');
    return this.buf[this.n++];
  }

  varint(): number {
    let v = 0;
    for (let i = 0, scale = 1; i < 8; i++, scale *= 128) {
      const b = this.byte();
      v += (b & 127) * scale;
      if (b < 128) {
        if (v >= 2 * INT_LIMIT) break;
        return v;
      }
    }
    throw new RangeError('decode: bad varint');
  }

  value(kind: Kind): unknown {
    switch (kind.t) {
      case 'int': {
        const z = this.varint();
        return z % 2 === 1 ? -(z + 1) / 2 : z / 2;
      }
      case 'bool': {
        const b = this.byte();
        if (b > 1) throw new RangeError('decode: bad boolean');
        return b === 1;
      }
      case 'str': {
        const length = this.varint();
        if (length > STR_MAX) throw new RangeError('decode: string too long');
        let s = '';
        for (let i = 0; i < length; i++) {
          const c = this.byte();
          if (c < 32 || c > 126) throw new RangeError('decode: bad character');
          s += ASCII[c - 32];
        }
        return s;
      }
      case 'list': {
        const length = this.varint();
        if (kind.length !== null && length !== kind.length) throw new RangeError('decode: wrong list length');
        if (length > this.buf.length - this.n) throw new RangeError('decode: truncated data');
        const a: unknown[] = [];
        for (let i = 0; i < length; i++) a.push(this.value(kind.of));
        return a;
      }
      case 'rec': {
        const o: Record<string, unknown> = {};
        for (const [name, k] of kind.fields) o[name] = this.value(k);
        return o;
      }
    }
  }
}

/** The version a payload was written with, or -1 when it is not this format at all. */
export function versionOf(magic: string, bytes: Uint8Array): number {
  try {
    const r = new Reader(bytes);
    for (let i = 0; i < 4; i++) if (r.byte() !== magic.charCodeAt(i)) return -1;
    return r.varint();
  } catch {
    return -1;
  }
}

export function decode<K extends Kind>(format: Format<K>, bytes: Uint8Array): Value<K> {
  const r = new Reader(bytes);
  for (let i = 0; i < 4; i++) if (r.byte() !== format.magic.charCodeAt(i)) throw new RangeError('decode: not this format');
  const version = r.varint();
  if (version !== format.version) throw new RangeError(`decode: version ${version}, expected ${format.version}`);
  const value = r.value(format.schema);
  if (r.n !== bytes.length) throw new RangeError('decode: trailing bytes');
  return value as Value<K>;
}

const rotl = (x: number, r: number): number => (x << r) | (x >>> (32 - r));
const hex8 = (h: number): string => (h >>> 0).toString(16).padStart(8, '0');

/** A 64-bit hash of the bytes as 16 hex digits: the save's checksum. */
export function hash64(b: Uint8Array): string {
  let h1 = 0x2545f491 ^ b.length, h2 = 0x9e3779b9 ^ b.length;
  const end = b.length & ~3;
  for (let i = 0; i < end; i += 4) {
    const w = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
    h1 ^= Math.imul(rotl(Math.imul(w, 0xcc9e2d51), 15), 0x1b873593);
    h1 = (Math.imul(rotl(h1, 13), 5) + 0xe6546b64) | 0;
    h2 ^= Math.imul(rotl(Math.imul(w, 0x85ebca77), 17), 0xc2b2ae3d);
    h2 = (Math.imul(rotl(h2, 11), 9) + 0x27d4eb2f) | 0;
  }
  let tail = 0;
  for (let i = b.length - 1; i >= end; i--) tail = (tail << 8) | b[i];
  h1 ^= Math.imul(rotl(Math.imul(tail, 0xcc9e2d51), 15), 0x1b873593);
  h2 ^= Math.imul(rotl(Math.imul(tail, 0x85ebca77), 17), 0xc2b2ae3d);
  h1 = (h1 + h2) | 0;
  h2 = (h2 + h1) | 0;
  h1 = fmix32(h1);
  h2 = fmix32(h2);
  h1 = (h1 + h2) | 0;
  h2 = (h2 + h1) | 0;
  return hex8(h1) + hex8(h2);
}

const HEX = '0123456789abcdef';

export function toHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += HEX[b[i] >> 4] + HEX[b[i] & 15];
  return s;
}

/** The bytes in a hex string, or null when it is not one. */
export function fromHex(s: string): Uint8Array | null {
  if (s.length % 2 !== 0) return null;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = HEX.indexOf(s[2 * i]), lo = HEX.indexOf(s[2 * i + 1]);
    if (hi < 0 || lo < 0) return null;
    out[i] = hi * 16 + lo;
  }
  return out;
}
