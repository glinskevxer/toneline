import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    testTimeout: 15000,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/index.js'],
      reporter: ['text-summary', 'lcov'],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
