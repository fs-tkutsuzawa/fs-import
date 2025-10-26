/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/js-with-ts-esm',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { useESM: true, tsconfig: '<rootDir>/tsconfig.json' },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/src/tests/**/*.test.ts',
  ],
  moduleNameMapper: {
    // This maps imports ending in .js to their .ts source file
    '^@/(.*)\\.js$': '<rootDir>/src/$1.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
