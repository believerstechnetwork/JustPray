import { defineConfig, type Plugin } from 'vitest/config';

/** Serves /api/* from an in-memory backend in dev and preview. See server/dev-api.ts. */
const devApi = (): Plugin => ({
  name: 'just-pray-dev-api',
  apply: () => !process.env.NETLIFY_DEV,
  async configureServer(server) {
    server.middlewares.use((await import('./server/dev-api')).devApiMiddleware());
  },
  async configurePreviewServer(server) {
    server.middlewares.use((await import('./server/dev-api')).devApiMiddleware());
  },
});

export default defineConfig({
  plugins: [devApi()],
  build: {
    target: 'es2022',
    // Photos are large; keep them as files instead of inlining.
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
