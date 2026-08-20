// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const mockApi = {
  getYouTubeStatus: vi.fn(),
  listRecentVideos: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  updateEpisode: vi.fn(),
  isWordPressConfigured: vi.fn(),
  testWordPressConnection: vi.fn(),
  getTranscript: vi.fn(),
  getMediaServerPort: vi.fn(),
}

// Assign to window.api before importing the component so the module captures it
Object.assign(window, { api: mockApi })

const storeState = {
  episodes: [] as Episode[],
  selectEpisode: vi.fn(),
  transcribingEpisodeId: null as number | null,
  txProgress: 0,
  txStatus: '',
  txEta: null as string | null,
  updateEpisode: vi.fn(),
  setTranscribingEpisode: vi.fn(),
}

vi.mock('../../src/store/useAppStore', () => {
  const useAppStore = vi.fn((selector: (s: typeof storeState) => unknown) => selector(storeState))
  Object.assign(useAppStore, { getState: () => storeState })
  return { useAppStore }
})

import EpisodeWorkspace from '../../src/pages/EpisodeWorkspace'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 1,
    title: 'Título original do arquivo',
    file_path: '/tmp/ep.mp3',
    audio_path: '/tmp/ep.mp3',
    thumbnail_url: '',
    duration: 1800,
    // 'imported' keeps the workspace on the Transcrição tab (the default),
    // avoiding the much larger API surface ContentTab/ClipsTab pull in.
    status: 'imported',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/episode/1']}>
      <Routes>
        <Route path="/episode/:id" element={<EpisodeWorkspace />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('EpisodeWorkspace — connecting a YouTube video', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.episodes = [makeEpisode()]
    mockApi.getYouTubeStatus.mockResolvedValue({ connected: true, mainChannelId: 'UC123' })
    mockApi.listRecentVideos.mockResolvedValue([
      { videoId: 'abc123', title: 'Vídeo do YouTube', publishedAt: new Date().toISOString(), thumb: 'https://i.ytimg.com/vi/abc123/default.jpg' },
    ])
    mockApi.getSetting.mockResolvedValue(null)
    mockApi.setSetting.mockResolvedValue({ success: true })
    mockApi.isWordPressConfigured.mockResolvedValue(false)
    mockApi.getTranscript.mockResolvedValue([])
    mockApi.getMediaServerPort.mockResolvedValue(0)
    mockApi.updateEpisode.mockImplementation((id: number, data: Partial<Episode>) =>
      Promise.resolve({ ...storeState.episodes[0], ...data })
    )
  })

  it("adopts the selected video's title and thumbnail on the episode", async () => {
    const user = userEvent.setup()
    renderWorkspace()

    const searchInput = await screen.findByPlaceholderText('Buscar vídeo do YouTube…')
    await user.click(searchInput)

    const result = await screen.findByText('Vídeo do YouTube')
    await user.click(result)

    await waitFor(() => {
      expect(mockApi.setSetting).toHaveBeenCalledWith('episode_1_youtube_id', 'abc123')
    })

    expect(mockApi.updateEpisode).toHaveBeenCalledWith(1, {
      title: 'Vídeo do YouTube',
      thumbnail_url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
    })
    expect(storeState.updateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Vídeo do YouTube',
        thumbnail_url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
      })
    )
  })

  it('does not touch the episode when YouTube is not connected', async () => {
    mockApi.getYouTubeStatus.mockResolvedValue({ connected: false, mainChannelId: null })
    renderWorkspace()

    await screen.findByText('Título original do arquivo')
    expect(screen.queryByPlaceholderText('Buscar vídeo do YouTube…')).toBeNull()
    expect(mockApi.updateEpisode).not.toHaveBeenCalled()
  })
})
