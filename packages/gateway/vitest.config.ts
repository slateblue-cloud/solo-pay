import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@solo-pay/database': path.resolve(__dirname, 'tests/__mocks__/solo-pay-database.ts'),
    },
  },
  test: {
    environment: 'node',
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'vitest.config.ts',
        'src/index.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 85,
        branches: 75,
        statements: 80,
      },
    },
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
