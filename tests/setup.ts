import { vi, afterEach } from 'vitest'

// Restore mocks between tests but keep module-level mocks active
afterEach(() => {
  vi.clearAllMocks()
})
