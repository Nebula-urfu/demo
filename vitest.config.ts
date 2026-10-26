import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { DEMO_DB_PATH: ':memory:', DEMO_AI_DELAY_MS: '0' },
  },
})
