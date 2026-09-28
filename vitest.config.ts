import { defineConfig } from 'vitest/config'

// Default environment is node (server tests, pure logic). Browser-facing tests
// opt into the DOM with a docblock at the top of the file:
//   // @vitest-environment happy-dom
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
  },
})
