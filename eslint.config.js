import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'data/', 'overlay/node_modules/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      curly: ['error', 'multi-line'],
    },
  },
  { files: ['server/**', 'tests/**', 'overlay/**', 'eslint.config.js'], languageOptions: { globals: globals.node } },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
  { files: ['public/**'], languageOptions: { globals: globals.browser } },
  { files: ['shared/**'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
];
