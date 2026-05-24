import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Cloudflare Workers imports are mocked here; real bindings come from wrangler env in prod
    setupFiles: [],
  },
  resolve: {
    alias: {
      'cloudflare:workers':
        '/workspace/project/ALPHA/packages/alpha-core/src/__mocks__/cloudflare-workers.ts',
    },
  },
});
