// Injected via `define` in electron.vite.config.ts at build time. Falls back
// to 'studio' outside a bundled build (e.g. running under vitest).
declare const __EDITION__: string | undefined

export type Edition = 'solo' | 'studio'

export const EDITION: Edition =
  (typeof __EDITION__ !== 'undefined' ? __EDITION__ : 'studio') as Edition

// Solo edition is capped at exactly one podcast; studio is unlimited.
export const IS_MULTI_PODCAST = EDITION === 'studio'
