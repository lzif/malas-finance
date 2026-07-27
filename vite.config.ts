/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  base: '/malas-finance/',
  plugins: [svelte()],
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node'
  }
})
