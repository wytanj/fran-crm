import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Tests run outside Nuxt, so the Nuxt directory aliases have to be declared here.
 * `#shared` is the FWB constitution imported by both the server engine and the
 * browser simulator.
 */
export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url))
    }
  }
})
