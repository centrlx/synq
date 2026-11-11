/** Jest работает с нативными ES-модулями (NODE_OPTIONS=--experimental-vm-modules). */
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  coverageReporters: ['text-summary', 'text', 'lcov'],
};
