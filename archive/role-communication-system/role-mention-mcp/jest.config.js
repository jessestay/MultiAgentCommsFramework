module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    '*.js',
    '!jest.config.js',
    '!coverage/**',
    '!node_modules/**'
  ]
}; 