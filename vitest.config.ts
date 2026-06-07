import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Global test APIs (describe, it, expect)
    globals: true,

    // Setup files — run before each test suite
    setupFiles: ['./tests/setup.ts'],

    // Include patterns
    include: ['tests/**/*.test.{ts,tsx}'],

    // Exclude patterns
    exclude: ['node_modules', '.next', 'tests/e2e'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/error.tsx',
        'src/app/**/not-found.tsx',
      ],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },

    // Timeout
    testTimeout: 10000,

    // Type checking
    typecheck: {
      enabled: false,
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
