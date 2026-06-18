// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// useAppStore mock — Sidebar reads transcribingEpisodeId
vi.mock('../../src/store/useAppStore', () => ({
  useAppStore: vi.fn((selector: (s: { transcribingEpisodeId: number | null }) => unknown) =>
    selector({ transcribingEpisodeId: null })
  ),
}))

import Sidebar from '../../src/components/Sidebar'
import { useAppStore } from '../../src/store/useAppStore'

function renderSidebar(path = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.mocked(useAppStore).mockImplementation(
      (selector: (s: { transcribingEpisodeId: number | null }) => unknown) =>
        selector({ transcribingEpisodeId: null }) as never
    )
  })

  it('renders the brand name', () => {
    renderSidebar()
    expect(screen.getByText('TALKEANDO')).toBeDefined()
    expect(screen.getByText('STUDIO')).toBeDefined()
  })

  it('renders all navigation items', () => {
    renderSidebar()
    expect(screen.getByText('Episódios')).toBeDefined()
    expect(screen.getByText('Configurações')).toBeDefined()
  })

  it('renders version string', () => {
    renderSidebar()
    expect(screen.getByText(/v0\.1\.0/)).toBeDefined()
  })

  it('links to /dashboard', () => {
    renderSidebar()
    const link = screen.getByRole('link', { name: /Episódios/i })
    expect(link.getAttribute('href')).toBe('/dashboard')
  })

  it('links to /settings', () => {
    renderSidebar()
    const link = screen.getByRole('link', { name: /Configurações/i })
    expect(link.getAttribute('href')).toBe('/settings')
  })

  it('shows a transcribing indicator when an episode is being transcribed', () => {
    vi.mocked(useAppStore).mockImplementation(
      (selector: (s: { transcribingEpisodeId: number | null }) => unknown) =>
        selector({ transcribingEpisodeId: 7 }) as never
    )

    renderSidebar()
    expect(screen.getByText('Transcrevendo...')).toBeDefined()
  })
})
