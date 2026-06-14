import { vi } from 'vitest'

/* eslint-disable @typescript-eslint/no-explicit-any */
const DatabaseMock = vi.fn(function (this: any) {
  this.exec = vi.fn()
  this.pragma = vi.fn().mockReturnValue([])
  this.prepare = vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue(undefined),
    all: vi.fn().mockReturnValue([]),
    run: vi.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
    iterate: vi.fn().mockReturnValue([]),
  }))
  this.transaction = vi.fn().mockImplementation((fn: (...args: unknown[]) => unknown) => fn)
  this.close = vi.fn()
})

export default DatabaseMock
