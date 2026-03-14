import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      core: path.resolve(__dirname, '../core/src/index.ts'),
      agent: path.resolve(__dirname, '../agent/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        'src/index.ts',
        'src/auth/strategies/', 
        'src/types/',
        'vitest.config.ts',
        'src/db/migrate.ts',
        'eslint.config.js',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
