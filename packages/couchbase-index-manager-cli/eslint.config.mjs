import { defineConfig, globalIgnores } from 'eslint/config';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginJest from 'eslint-plugin-jest';

export default defineConfig([
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: { jest: pluginJest },
    languageOptions: {
      globals: {
        ...pluginJest.environments.globals.globals,
      }
    }
  },
  globalIgnores([
    "node_modules/**",
    "dist/**",
    "testbin/*",
    "eslint.config.mjs",
    "jest.config.js",
    "babel.config.js"
  ]),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off'
    }
  },
]);
