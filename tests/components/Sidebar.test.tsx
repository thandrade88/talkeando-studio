// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// useAppStore mock — Sidebar reads selectedEpisodeId
vi.mock('../../src/store/useAppStore', () => ({
  useAppStore: vi.fn((selector: (s: { selectedEpisodeId: number | null }) => unknown) =>
    selector({ selectedEpisodeId: null })
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
      (selector: (s: { selectedEpisodeId: number | null }) => unknown) =>
        selector({ selectedEpisodeId: null }) as never
    )
  })

  it('renders the brand name', () => {
    renderSidebar()
    expect(screen.getByText('TALKEANDO')).toBeDefined()
    expect(screen.getByText('STUDIO')).toBeDefined()
  })

  it('renders all navigation items', () => {
    renderSidebar()
    expect(screen.getByText('Dashboard')).toBeDefined()
    expect(screen.getByText('Transcrições')).toBeDefined()
    expect(screen.getByText('Conteúdo IA')).toBeDefined()
    expect(screen.getByText('Clipes')).toBeDefined()
    expect(screen.getByText('Publicações')).toBeDefined()
    expect(screen.getByText('Configurações')).toBeDefined()
  })

  it('renders version string', () => {
    renderSidebar()
    expect(screen.getByText(/Talkeando Studio v/)).toBeDefined()
  })

  it('links to /dashboard', () => {
    renderSidebar()
    const link = screen.getByRole('link', { name: /Dashboard/i })
    expect(link.getAttribute('href')).toBe('/dashboard')
  })

  it('links to /settings', () => {
    renderSidebar()
    const link = screen.getByRole('link', { name: /Configurações/i })
    expect(link.getAttribute('href')).toBe('/settings')
  })

  it('appends episode id to transcription link when one is selected', () => {
    vi.mocked(useAppStore).mockImplementation(
      (selector: (s: { selectedEpisodeId: number | null }) => unknown) =>
        selector({ selectedEpisodeId: 7 }) as never
    )

    renderSidebar()
    const link = screen.getByRole('link', { name: /Transcrições/i })
    expect(link.getAttribute('href')).toBe('/transcription/7')
  })
})
