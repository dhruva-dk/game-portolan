import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const ROOT = join(import.meta.dirname, '..');
const SELF = 'tests/exports.test.ts';
const SIM_KEPT = new Set([
  'src/sim/driver.ts: byStat',
  'src/sim/rules.ts: Rules',
  'src/sim/rules.ts: stormFactor',
]);

const filesIn = (folder: string): string[] =>
  readdirSync(join(ROOT, folder), { recursive: true, encoding: 'utf8' })
    .map((f) => `${folder}/${f}`)
    .filter((f) => /\.\w+$/.test(f));

const exported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some(
    (m) => m.kind === ts.SyntaxKind.ExportKeyword
  );

function bound(name: ts.BindingName, out: string[]): void {
  if (ts.isIdentifier(name)) out.push(name.text);
  else
    for (const element of name.elements)
      if (!ts.isOmittedExpression(element)) bound(element.name, out);
}

function exportsOf(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest);
  const names: string[] = [];
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause))
        for (const element of statement.exportClause.elements)
          names.push(element.name.text);
    } else if (exported(statement)) {
      if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations)
          bound(declaration.name, names);
      else if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isInterfaceDeclaration(statement) ||
          ts.isTypeAliasDeclaration(statement) ||
          ts.isEnumDeclaration(statement) ||
          ts.isModuleDeclaration(statement)) &&
        statement.name &&
        ts.isIdentifier(statement.name)
      )
        names.push(statement.name.text);
    }
  }
  return names;
}

test('every name src exports is mentioned by another file in src, tests or tools', () => {
  const files = ['src', 'tests', 'tools']
    .flatMap(filesIn)
    .filter((f) => f !== SELF);
  const texts = files.map((f) => ({
    file: f,
    text: readFileSync(join(ROOT, f), 'utf8'),
  }));
  const mentions = new Map<string, Set<string>>();
  for (const { file, text } of texts)
    for (const word of new Set(text.match(/[A-Za-z_$][\w$]*/g))) {
      const seen = mentions.get(word) ?? new Set();
      seen.add(file);
      mentions.set(word, seen);
    }
  const unused = texts
    .filter(({ file }) => file.startsWith('src/') && file.endsWith('.ts'))
    .flatMap(({ file, text }) =>
      exportsOf(file, text)
        .filter((name) =>
          [...(mentions.get(name) ?? [])].every((other) => other === file)
        )
        .map((name) => `${file}: ${name}`)
    )
    .filter((entry) => !SIM_KEPT.has(entry));
  assert.deepEqual(unused, []);
});
