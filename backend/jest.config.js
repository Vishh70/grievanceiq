// jest.config.js
module.exports = {
  testEnvironment: '<rootDir>/tests/custom-jest-env.js',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
};
