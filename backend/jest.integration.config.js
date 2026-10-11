// jest.integration.config.js
module.exports = {
  testEnvironment: '<rootDir>/tests/custom-jest-env.js',
  testMatch: ['**/tests/integration/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.integration.js'],
  testTimeout: 90000,
};
