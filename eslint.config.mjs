import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['packages/contract-validator/fixtures/**', 'packages/ui/src/tokens/**', 'desktop/**', 'build/macos/**',
      'output/**',
      '**/dist/**', '**/node_modules/**'],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.{ts,tsx}'],
    rules: { 'no-undef': 'off' },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/smoke-desktop.mjs', 'scripts/capture-ui.mjs'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/web/src/**/*.vue', 'packages/ui/src/**/*.vue'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { parser: tseslint.parser },
    },
    rules: { 'no-undef': 'off' },
  },
);
