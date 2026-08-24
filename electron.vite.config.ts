import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Which edition this build is for — baked in at build time so a packaged
// installer can't have its podcast limit lifted by setting an env var at
// launch. Defaults to 'studio' (the full multi-podcast build) for local dev.
const EDITION = process.env.EDITION === 'solo' ? 'solo' : 'studio'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __EDITION__: JSON.stringify(EDITION)
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/main/index.ts'),
        output: {
          dir: 'dist-electron/main'
        }
      }
    },
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'electron/main'),
        '@services': resolve(__dirname, 'electron/services')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload/index.ts'),
        output: {
          dir: 'dist-electron/preload'
        }
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'dist-electron/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src'),
        '@': resolve(__dirname, 'src')
      }
    },
    plugins: [react()]
  }
})
