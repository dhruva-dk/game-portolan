// Lint: types kept honest, imports runnable, the simulation deterministic and
// three.js used through its public API. An exception says why, inline:
//   // eslint-disable-next-line <rule> -- why it stands
import comments from '@eslint-community/eslint-plugin-eslint-comments';
import tseslint from 'typescript-eslint';

/** Relative imports name their .ts: Node runs the .ts files directly. */
const EXTENSIONS = [
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
].map((node) => ({
  selector: `${node}[source.value=/^\\.(?!.*\\.ts(\\?.*)?$)/]`,
  message: 'Name a relative import with its .ts',
}));

/** No three.js hacks: its public API only. */
const THREE = [
  {
    selector: 'Identifier[name=/^on(Before|After)(Compile|Render|Shadow)$/]',
    message: "No three.js render hooks: use three's node system",
  },
  {
    selector: 'MemberExpression[property.name=/^_[A-Za-z]/]',
    message: 'No private members',
  },
  {
    selector: "MemberExpression[property.name='prototype']",
    message: 'No patching classes',
  },
];

export default [
  { ignores: ['dist/**', 'ios/**', 'node_modules/**', 'public/**'] },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'eslint-comments': comments,
    },
    rules: {
      'eslint-comments/require-description': [
        'error',
        { ignore: ['eslint-enable'] },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': true, 'ts-nocheck': true },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three/src/*'],
              message: "three's public entry points only",
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', ...EXTENSIONS],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
      'no-restricted-syntax': ['error', ...EXTENSIONS, ...THREE],
    },
  },
  {
    files: ['src/{world,sim,career}/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['Date', 'performance'].map((name) => ({
          name,
          message: 'world/, sim/ and career/ are deterministic: no clocks',
        })),
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Seeded randomness only (world/random.ts)',
        },
      ],
    },
  },
];
