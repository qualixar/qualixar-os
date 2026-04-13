import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/dashboard/**', 'src/types/**', '**/strategies/types.ts', '**/orchestrator-types.ts'],
      thresholds: {
        global: { branches: 80, functions: 90, lines: 90, statements: 90 }
      }
    },
    testTimeout: 30000,
    hookTimeout: 10000,
  }
});
