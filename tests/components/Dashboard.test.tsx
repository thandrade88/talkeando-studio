// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockApi = {
  onImportProgress: vi.fn(() => () => {}),
  openFileDialog: vi.fn(),
  importEpisode: vi.fn(),
  getEpisode: vi.fn(),
  deleteEpisode: vi.fn(),
}

// Assign to window.api before importing the component so the module captures it
Object.assign(window, { api: mockApi })

const storeState = {
  episodes: [] as Episode[],
  podcasts: [{ id: 1, name: 'Podcast de teste', created_at: new Date().toISOString() }] as Podcast[],
  selectedPodcastId: 1 as number | null,
  isLoading: false,
  loadEpisodes: vi.fn(),
  addEpisode: vi.fn(),
  removeEpisode: vi.fn(),
  selectEpisode: vi.fn(),
  updateEpisode: vi.fn(),
  transcribingEpisodeId: null as number | null,
}

vi.mock('../../src/store/useAppStore', () => ({
  useAppStore: vi.fn(() => storeState),
}))

import Dashboard from '../../src/pages/Dashboard'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 1,
    podcast_id: 1,
    title: 'Episódio de teste',
    file_path: '/tmp/ep.mp3',
    audio_path: '/tmp/ep.mp3',
    thumbnail_url: '',
    duration: 1800,
    status: 'transcribed',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Dashboard />
    </MemoryRouter>
  )
}

describe('Dashboard — list/grid view toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    storeState.episodes = [
      makeEpisode({ id: 1, title: 'Com thumbnail', thumbnail_url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg' }),
      makeEpisode({ id: 2, title: 'Sem thumbnail', thumbnail_url: '' }),
    ]
  })

  it('defaults to list view and shows episode rows', () => {
    renderDashboard()

    expect(screen.getByText('Com thumbnail')).toBeDefined()
    expect(screen.getByText('Sem thumbnail')).toBeDefined()
    expect(screen.getByTitle('Ver como lista').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTitle('Ver em grade').getAttribute('aria-pressed')).toBe('false')
  })

  it('renders a thumbnail image for episodes that have one, and a fallback icon otherwise', () => {
    renderDashboard()

    // The thumbnails are decorative (alt=""), so they carry no accessible
    // role — query the DOM directly rather than by ARIA role.
    const withThumb = screen.getByText('Com thumbnail').closest('div.group') as HTMLElement
    expect(withThumb.querySelector('img')?.getAttribute('src')).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg')

    const withoutThumb = screen.getByText('Sem thumbnail').closest('div.group') as HTMLElement
    expect(withoutThumb.querySelector('img')).toBeNull()
  })

  it('switches to grid view when the grid toggle is clicked', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.click(screen.getByTitle('Ver em grade'))

    expect(screen.getByTitle('Ver em grade').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTitle('Ver como lista').getAttribute('aria-pressed')).toBe('false')
    // Episodes are still shown, just in the grid layout
    expect(screen.getByText('Com thumbnail')).toBeDefined()
    expect(screen.getByText('Sem thumbnail')).toBeDefined()
  })

  it('persists the chosen view to localStorage', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.click(screen.getByTitle('Ver em grade'))

    expect(localStorage.getItem('talkeando_dashboard_view')).toBe('grid')
  })

  it('restores grid view on mount when it was previously selected', () => {
    localStorage.setItem('talkeando_dashboard_view', 'grid')

    renderDashboard()

    expect(screen.getByTitle('Ver em grade').getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the empty-state dropzone when there are no episodes, regardless of view', () => {
    storeState.episodes = []
    renderDashboard()

    expect(screen.getByText('Arraste um episódio aqui')).toBeDefined()
  })
})
