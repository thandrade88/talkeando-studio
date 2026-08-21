// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockApi = {
  createPodcast: vi.fn(),
}
Object.assign(window, { api: mockApi })

type SidebarState = {
  podcasts: Podcast[]
  selectedPodcastId: number | null
  selectPodcast: (id: number) => void
  addPodcast: (p: Podcast) => void
  transcribingEpisodeId: number | null
  txProgress: number
  txStatus: string
  txEta: string | null
}

const storeState: SidebarState = {
  podcasts: [],
  selectedPodcastId: null,
  selectPodcast: vi.fn(),
  addPodcast: vi.fn(),
  transcribingEpisodeId: null,
  txProgress: 0,
  txStatus: '',
  txEta: null,
}

vi.mock('../../src/store/useAppStore', () => ({
  useAppStore: vi.fn((selector: (s: SidebarState) => unknown) => selector(storeState)),
}))

import Sidebar from '../../src/components/Sidebar'
import { useAppStore } from '../../src/store/useAppStore'

function makePodcast(overrides: Partial<Podcast> = {}): Podcast {
  return { id: 1, name: 'Café com Dev', created_at: new Date().toISOString(), ...overrides }
}

function renderSidebar(path = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.podcasts = [makePodcast()]
    storeState.selectedPodcastId = 1
    storeState.transcribingEpisodeId = null
    vi.mocked(useAppStore).mockImplementation(
      (selector: (s: SidebarState) => unknown) => selector(storeState) as never
    )
  })

  it('renders the brand name', () => {
    renderSidebar()
    expect(screen.getByText('TALKEANDO')).toBeDefined()
    expect(screen.getByText('STUDIO')).toBeDefined()
  })

  it('renders the current version', () => {
    renderSidebar()
    expect(screen.getByText(/v2\.0\.0/)).toBeDefined()
  })

  it('lists every podcast', () => {
    storeState.podcasts = [makePodcast({ id: 1, name: 'Café com Dev' }), makePodcast({ id: 2, name: 'Outro Show' })]
    renderSidebar()

    expect(screen.getByText('Café com Dev')).toBeDefined()
    expect(screen.getByText('Outro Show')).toBeDefined()
  })

  it('shows Episódios and Configurações do podcast nested under the selected podcast only', () => {
    storeState.podcasts = [makePodcast({ id: 1, name: 'Café com Dev' }), makePodcast({ id: 2, name: 'Outro Show' })]
    storeState.selectedPodcastId = 1
    renderSidebar()

    expect(screen.getAllByText('Episódios')).toHaveLength(1)
    expect(screen.getAllByText('Configurações do podcast')).toHaveLength(1)
  })

  it('selects a podcast and navigates to the dashboard when clicked', async () => {
    const user = userEvent.setup()
    storeState.podcasts = [makePodcast({ id: 1, name: 'Café com Dev' }), makePodcast({ id: 2, name: 'Outro Show' })]
    storeState.selectedPodcastId = 1
    renderSidebar()

    await user.click(screen.getByText('Outro Show'))

    expect(storeState.selectPodcast).toHaveBeenCalledWith(2)
  })

  it('links the app settings item to /settings', () => {
    renderSidebar()
    const link = screen.getByRole('link', { name: /Configurações do app/i })
    expect(link.getAttribute('href')).toBe('/settings')
  })

  it('creates a podcast from the inline "Novo podcast" field', async () => {
    const user = userEvent.setup()
    mockApi.createPodcast.mockResolvedValue(makePodcast({ id: 3, name: 'Novo Show' }))
    renderSidebar()

    await user.click(screen.getByText('Novo podcast'))
    await user.type(screen.getByPlaceholderText('Nome do podcast'), 'Novo Show{Enter}')

    expect(mockApi.createPodcast).toHaveBeenCalledWith('Novo Show')
    expect(storeState.addPodcast).toHaveBeenCalledWith(expect.objectContaining({ name: 'Novo Show' }))
  })

  it('shows a transcribing indicator when an episode is being transcribed', () => {
    storeState.transcribingEpisodeId = 7
    renderSidebar()
    expect(screen.getByText('Transcrevendo...')).toBeDefined()
  })
})
