// What the architecture rules read: src, the tests and the tools as text
// (comments blanked for the rules on code), and as TypeScript's own syntax
// trees, for the rules on imports, exports, casts and size, which text cannot
// read exactly.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { EXCEPTIONS, type Exception } from './exceptions.ts';

export const ROOT = resolve(import.meta.dirname, '..', '..');
export const SRC = resolve(ROOT, 'src');

const walk = (dir: string): string[] =>
  !existsSync(dir)
    ? []
    : readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(join(dir, e.name))
          : e.name.endsWith('.ts')
            ? [join(dir, e.name)]
            : []
      );

const slash = (path: string) => path.split(sep).join('/');

/**
 * A scanned file: `rel` from its folder (src's rules name src-relative paths),
 * `at` from the repo's root.
 */
export interface Scanned {
  path: string;
  rel: string;
  at: string;
  text: string;
}

/** A folder's .ts files, read. */
export const read = (dir: string): Scanned[] =>
  walk(resolve(ROOT, dir)).map((path) => ({
    path,
    rel: slash(relative(resolve(ROOT, dir), path)),
    at: slash(relative(ROOT, path)),
    text: readFileSync(path, 'utf8'),
  }));

export const files = read('src');
export const tests = read('tests');
export const tools = read('tools');
/** src, the tests and the tools: what the rules on the types hold for. */
export const everywhere = [...files, ...tests, ...tools];

/**
 * Lines with comments blanked (whole-line, trailing and block), so prose never
 * trips a rule.
 */
export const code = (text: string) => {
  let inBlock = false;
  return text.split('\n').map((line) => {
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end < 0) return '';
      inBlock = false;
      line = line.slice(end + 2);
    }
    line = line.replace(/\/\*.*?\*\//g, '');
    const open = line.indexOf('/*');
    if (open >= 0) {
      inBlock = true;
      line = line.slice(0, open);
    }
    return line.replace(/\/\/.*$/, '');
  });
};

/** The comments of a file, each with its line: what the rules on prose read. */
export const comments = (f: Scanned) => {
  const out: { line: number; text: string }[] = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    f.text
  );
  for (
    let kind = scanner.scan();
    kind !== ts.SyntaxKind.EndOfFileToken;
    kind = scanner.scan()
  ) {
    if (
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      out.push({
        line: lineOf(f, scanner.getTokenStart()),
        text: scanner.getTokenText(),
      });
    }
  }
  return out;
};

/**
 * Every match of `pattern` in the code of src (or of `among`), as a hit on the
 * line it starts on; `keep` filters by folder-relative path. Matched over the
 * whole file, so a call the formatter wraps (`\s` takes the line's end) is
 * found as it would be on one line; `^` and `$` are a line's.
 */
export const hits = (
  pattern: RegExp,
  keep: (rel: string) => boolean = () => true,
  among: readonly Scanned[] = files
): Hit[] => {
  const all = new RegExp(
    pattern.source,
    `${pattern.flags.replace(/[gm]/g, '')}gm`
  );
  return among
    .filter((f) => keep(f.rel))
    .flatMap((f) => {
      const lines = code(f.text),
        text = lines.join('\n'),
        found = new Map<number, Hit>();
      for (const m of text.matchAll(all)) {
        const line = text.slice(0, m.index).split('\n').length;
        found.set(line, { file: f.at, line, text: lines[line - 1]!.trim() });
        if (m[0] === '') all.lastIndex++;
      }
      return [...found.values()];
    });
};
/** The same, in src, the tests and the tools. */
export const anywhere = (pattern: RegExp) =>
  hits(pattern, undefined, everywhere);

/** Something a rule found: where, and what. */
export interface Hit {
  /** Repo-relative path. */
  file: string;
  line: number;
  text: string;
  /** What, within the file, an exception names (an export's name, a function's): matched with the file. */
  name?: string;
}

const trees = new Map<string, ts.SourceFile>();
/** A file's syntax tree, parsed once. */
export const tree = (f: Scanned) => {
  let t = trees.get(f.path);
  if (!t)
    trees.set(
      f.path,
      (t = ts.createSourceFile(f.path, f.text, ts.ScriptTarget.Latest, true))
    );
  return t;
};
export const lineOf = (f: Scanned, pos: number) =>
  tree(f).getLineAndCharacterOfPosition(pos).line + 1;

/** Every node of a tree, depth first. */
export function visit(node: ts.Node, each: (n: ts.Node) => void) {
  each(node);
  node.forEachChild((c) => visit(c, each));
}

/** An import (or re-export, dynamic import, or worker's URL) of a file: what it names and where it points. */
export interface Import {
  from: Scanned;
  line: number;
  /** As written. */
  spec: string;
  /** src-relative .ts path for a file of src (`../x` from tests and tools resolves too), 'three' for three and its addons,
   *  else the package. */
  to: string;
  /** Erased when built: `import type`, or every name in it a type. */
  typeOnly: boolean;
  /** The names taken ('*' for a namespace, its local name in `ns`; 'default'); none for a side effect or a worker. */
  names: string[];
  ns?: string;
  /** A worker or a dynamic import: the whole module taken. */
  whole: boolean;
}

const target = (from: Scanned, spec: string) => {
  const bare = spec.replace(/\?.*$/, '');
  if (bare.startsWith('.')) {
    const path = resolve(dirname(from.path), bare);
    return slash(relative(SRC, path)).replace(/(\.ts)?$/, '.ts');
  }
  return bare === 'three' || bare.startsWith('three/') ? 'three' : bare;
};

const importCache = new Map<string, Import[]>();
/** A file's imports, read from its tree. */
export function imports(f: Scanned): Import[] {
  const cached = importCache.get(f.path);
  if (cached) return cached;
  const out: Import[] = [];
  const add = (
    node: ts.Node,
    spec: string,
    typeOnly: boolean,
    names: string[],
    whole: boolean,
    ns?: string
  ) =>
    out.push({
      from: f,
      line: lineOf(f, node.getStart()),
      spec,
      to: target(f, spec),
      typeOnly,
      names,
      whole,
      ns,
    });
  visit(tree(f), (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const c = n.importClause,
        names: string[] = [];
      let types = 0,
        ns: string | undefined;
      if (c?.name) names.push('default');
      const b = c?.namedBindings;
      if (b && ts.isNamespaceImport(b)) {
        names.push('*');
        ns = b.name.text;
      } else if (b) {
        for (const e of b.elements) {
          names.push((e.propertyName ?? e.name).text);
          if (e.isTypeOnly) types++;
        }
      }
      const typeOnly =
        !!c &&
        (c.isTypeOnly ||
          (names.length > 0 && types === names.length && !c.name));
      add(n, n.moduleSpecifier.text, typeOnly, names, false, ns);
    } else if (
      ts.isExportDeclaration(n) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      const c = n.exportClause;
      const names =
        c && ts.isNamedExports(c)
          ? c.elements.map((e) => (e.propertyName ?? e.name).text)
          : ['*'];
      add(n, n.moduleSpecifier.text, n.isTypeOnly, names, false);
    } else if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const a = n.arguments[0];
      if (a && ts.isStringLiteral(a)) add(n, a.text, false, ['*'], true);
    } else if (
      ts.isNewExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'URL'
    ) {
      const a = n.arguments?.[0];
      if (a && ts.isStringLiteral(a) && a.text.startsWith('.'))
        add(n, a.text, false, ['*'], true);
    } else if (
      ts.isImportTypeNode(n) &&
      ts.isLiteralTypeNode(n.argument) &&
      ts.isStringLiteral(n.argument.literal)
    ) {
      add(
        n,
        n.argument.literal.text,
        true,
        [
          n.qualifier
            ? ts.isIdentifier(n.qualifier)
              ? n.qualifier.text
              : n.qualifier.right.text
            : '*',
        ],
        false
      );
    }
  });
  importCache.set(f.path, out);
  return out;
}

/** An export of a file: its name, whether a type, and where. */
export interface Export {
  name: string;
  type: boolean;
  line: number;
}

const has = (n: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === kind);

/** A file's own exports (re-exports from elsewhere are imports of that file, read by `imports`). */
export function exportsOf(f: Scanned): Export[] {
  const out: Export[] = [];
  for (const s of tree(f).statements) {
    const line = lineOf(f, s.getStart());
    if (
      ts.isExportDeclaration(s) &&
      !s.moduleSpecifier &&
      s.exportClause &&
      ts.isNamedExports(s.exportClause)
    ) {
      for (const e of s.exportClause.elements)
        out.push({
          name: e.name.text,
          type: s.isTypeOnly || e.isTypeOnly,
          line,
        });
      continue;
    }
    if (ts.isExportAssignment(s)) {
      out.push({ name: 'default', type: false, line });
      continue;
    }
    if (!has(s, ts.SyntaxKind.ExportKeyword)) continue;
    if (has(s, ts.SyntaxKind.DefaultKeyword))
      out.push({ name: 'default', type: false, line });
    else if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations)
        if (ts.isIdentifier(d.name))
          out.push({ name: d.name.text, type: false, line });
    } else if (
      ts.isFunctionDeclaration(s) ||
      ts.isClassDeclaration(s) ||
      ts.isEnumDeclaration(s)
    ) {
      if (s.name) out.push({ name: s.name.text, type: false, line });
    } else if (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) {
      out.push({ name: s.name.text, type: true, line });
    }
  }
  return out;
}

/** A rule's id, its findings, and the registry of what it lets stand (exceptions.ts): fails on any finding no exception
 *  covers, and marks the exceptions it used, so a stale one is found (`unused`). */
export const none = (rule: string, found: readonly Hit[], what: string) => {
  const left = found.filter((h) => !excused(rule, h));
  if (left.length)
    assert.fail(
      `${rule}. ${what} (${left.length}):\n  ${left.map(say).join('\n  ')}`
    );
};
const say = (h: Hit) =>
  `${h.file}:${h.line}: ${h.name ? `${h.name}: ` : ''}${h.text}`;

const used = new Set<Exception>();
/** Whether an exception covers a finding: same rule and file, and the same name if the exception names one. */
export function excused(rule: string, h: Hit) {
  const e = EXCEPTIONS.find(
    (x) =>
      x.rule === rule &&
      x.file === h.file &&
      (x.name === undefined || x.name === h.name)
  );
  if (e) used.add(e);
  return !!e;
}
/** The exceptions for `rules` that excused nothing: stale, to be removed. Asked after those rules ran. */
export const unused = (rules: readonly string[]) =>
  EXCEPTIONS.filter((e) => rules.includes(e.rule) && !used.has(e));
