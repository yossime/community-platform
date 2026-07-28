import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts', 'apps/web/lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/types.ts'],
    },
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@platform/db': path.resolve(__dirname, 'packages/db/src'),
      '@platform/cache/src/rate-limit': path.resolve(__dirname, 'packages/cache/src/rate-limit'),
      '@platform/cache/src/client': path.resolve(__dirname, 'packages/cache/src/client'),
      '@platform/cache/src/patterns': path.resolve(__dirname, 'packages/cache/src/patterns'),
      '@platform/cache/src/counters': path.resolve(__dirname, 'packages/cache/src/counters'),
      '@platform/cache': path.resolve(__dirname, 'packages/cache/src'),
      '@platform/ai/src/sanitize': path.resolve(__dirname, 'packages/ai/src/sanitize'),
      '@platform/ai/src/embeddings': path.resolve(__dirname, 'packages/ai/src/embeddings'),
      '@platform/ai': path.resolve(__dirname, 'packages/ai/src'),
      '@platform/search/src/sync': path.resolve(__dirname, 'packages/search/src/sync'),
      '@platform/search/src/indexes': path.resolve(__dirname, 'packages/search/src/indexes'),
      '@platform/search/src/client': path.resolve(__dirname, 'packages/search/src/client'),
      '@platform/search': path.resolve(__dirname, 'packages/search/src'),
      '@platform/payments': path.resolve(__dirname, 'packages/payments/src'),
      '@platform/email': path.resolve(__dirname, 'packages/email/src'),
      '@platform/whatsapp': path.resolve(__dirname, 'packages/whatsapp/src'),
    },
  },
});
