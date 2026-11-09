module.exports = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  moduleNameMapper: {
    "^dotenv$": "<rootDir>/tests/helpers/dotenvStub.js",
  },
  testMatch: ["**/tests/**/*.test.js"],
  testTimeout: 30000,
};
