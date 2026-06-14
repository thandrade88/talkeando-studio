import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@renderer': resolve(__dirname, 'src'),
      '@services': resolve(__dirname, 'electron/services'),
      '@main': resolve(__dirname, 'electron/main'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environmentMatchGlobs: [
      ['tests/unit/**', 'node'],
      ['tests/components/**', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['electron/services/**/*.ts', 'src/**/*.tsx', 'src/**/*.ts'],
      exclude: ['**/*.d.ts', 'tests/**', '**/__mocks__/**'],
    },
    mockReset: false,
    clearMocks: true,
  },
})
