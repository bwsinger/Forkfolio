import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      sveltekit({
        adapter: adapter({ out: process.env.FORKFOLIO_BUILD_DIR ?? 'build' }),
        preprocess: vitePreprocess(),
        paths: {
          relative: false,
          origin: process.env.ORIGIN ?? env.ORIGIN ?? 'http://localhost:3000'
        }
      })
    ],
    test: { include: ['src/**/*.test.ts'], environment: 'node' }
  };
});
