module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    es6: true,
    node: true,
    jasmine: true
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off'
  }
}
