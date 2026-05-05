import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['forge_spec_v1.0/**', 'forge_glass_v1.1/**', '**/dist/**', '**/node_modules/**'],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['packages/**/*.{ts,tsx}'],
    rules: { 'no-undef': 'off' },
  },
);
