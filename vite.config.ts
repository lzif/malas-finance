/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  base: '/malas-finance/',
  // Single source of truth for the version (spec §11.3): package.json only.
  // No version string is ever hand-written elsewhere.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [svelte()],
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node'
  }
})
