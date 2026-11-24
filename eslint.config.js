import comments from '@eslint-community/eslint-plugin-eslint-comments';
import tseslint from 'typescript-eslint';

const EXTENSIONS = [
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
].map((node) => ({
  selector: `${node}[source.value=/^\\.(?!.*\\.ts(\\?.*)?$)/]`,
  message: 'Name a relative import with its .ts',
}));

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

const THREE_SOURCE = {
  group: ['three/src/*'],
  message: "three's public entry points only",
};

const into = (folders) => `(^|/)(${folders.join('|')})/`;
const only = (folder, kept) => `(^|/)${folder}/(?!(${kept.join('|')})$)`;
const NO_THREE = '^three(/|$)';

const LAYERS = [
  {
    folder: 'world',
    may: 'nothing outside world/',
    banned: [
      into(['sim', 'career', 'render', 'play', 'audio', 'ui', 'app']),
      NO_THREE,
    ],
  },
  {
    folder: 'sim',
    may: 'only world/',
    banned: [
      into(['career', 'render', 'play', 'audio', 'ui', 'app']),
      NO_THREE,
    ],
  },
  {
    folder: 'career',
    may: 'world/, and from sim/ only kinds.ts, setup.ts and result.ts',
    banned: [
      into(['render', 'play', 'audio', 'ui', 'app']),
      only('sim', ['kinds\\.ts', 'setup\\.ts', 'result\\.ts']),
      NO_THREE,
    ],
  },
  {
    folder: 'render',
    may: 'world/ and sim/',
    banned: [into(['career', 'play', 'audio', 'ui', 'app'])],
  },
  {
    folder: 'play',
    may: 'world/, sim/, render/ and audio/',
    banned: [into(['career', 'ui', 'app']), NO_THREE],
  },
  {
    folder: 'audio',
    may: 'world/, render/snapshot.ts and play/player.ts',
    banned: [
      into(['sim', 'career', 'ui', 'app']),
      only('render', ['snapshot\\.ts']),
      only('play', ['player\\.ts']),
      NO_THREE,
    ],
  },
  ...[
    ['base', 'ui/base/', [into(['career', 'sea', 'lobby'])]],
    ['sea', 'ui/base/ and ui/sea/', [into(['career', 'lobby'])]],
    [
      'lobby',
      'ui/base/, ui/lobby/, career/views/ and career/commands.ts',
      [only('career', ['views/.*', 'commands\\.ts']), into(['sea'])],
    ],
  ].map(([part, own, banned]) => ({
    folder: `ui/${part}`,
    may: `world/, sim/kinds.ts, render/snapshot.ts, play/player.ts, ${own} and never three.js`,
    banned: [
      ...banned,
      into(['audio', 'app']),
      only('sim', ['kinds\\.ts']),
      only('render', ['snapshot\\.ts']),
      only('play', ['player\\.ts']),
      NO_THREE,
    ],
  })),
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
      'no-restricted-imports': ['error', { patterns: [THREE_SOURCE] }],
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
  ...LAYERS.map(({ folder, may, banned }) => ({
    files: [`src/${folder}/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            THREE_SOURCE,
            ...banned.map((regex) => ({
              regex,
              message: `${folder}/ may import ${may} (§2.1)`,
            })),
          ],
        },
      ],
    },
  })),
];
