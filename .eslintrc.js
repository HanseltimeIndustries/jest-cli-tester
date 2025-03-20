// .eslintrc.js example
module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['prettier'],
  rules: {
    'prettier/prettier': 'error',
  },
  ignorePatterns: ['.yarn/**/*', 'dist/**/*', 'node_modules/**/*'],
  overrides: [
    {
      files: ['src/**/*.ts'],
      env: { browser: true, es6: true, node: true },
      extends: [
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
      ],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
        project: 'packages/*/tsconfig.json',
      },
      plugins: ['@typescript-eslint'],
    },
  ],
}
