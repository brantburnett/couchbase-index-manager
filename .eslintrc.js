module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    project: 'tsconfig.json'
  },
  settings: {
    node: {
      "resolvePaths": [__dirname],
      "tryExtensions": [".js", ".json", ".node", ".ts"]
    }
  },
  plugins: [
    '@typescript-eslint',
    'node',
    'jest',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:node/recommended',
    'plugin:jest/recommended',
  ],
  env: {
    es6: true,
    node: true,
    jest: true
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    'node/no-unsupported-features/es-syntax': ['error', { ignores: ['modules'] }], // Since we're using TypeScript
    'jest/valid-expect': 'off', // We're still using Chai
    'jest/no-conditional-expect': 'off', // We're still using Chai
    'jest/no-try-expect': 'off', // We're still using Chai
  }
}
