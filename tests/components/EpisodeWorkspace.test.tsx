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
  getGeneratedContent: vi.fn(),
  getKeyMoments: vi.fn(),
  getDefaultResumePrompt: vi.fn(),
  getDefaultBlogPrompt: vi.fn(),
  getDefaultYoutubePrompt: vi.fn(),
  getDefaultInstagramPrompt: vi.fn(),
  onAIProgress: vi.fn(),
  saveContent: vi.fn(),
  generateContent: vi.fn(),
  generateResume: vi.fn(),
  updateWordPressPost: vi.fn(),
  publishToWordPress: vi.fn(),
  listWordPressPosts: vi.fn(),
  getWordPressPost: vi.fn(),
  linkWordPressPost: vi.fn(),
  unlinkWordPressPost: vi.fn(),
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

  it('uses an encoded local media URL for Windows audio paths', async () => {
    const windowsAudioPath = 'C:\\Users\\Talkeando\\Podcast Episodes\\ep 01.wav'
    storeState.episodes = [makeEpisode({ file_path: windowsAudioPath, audio_path: windowsAudioPath })]
    mockApi.getMediaServerPort.mockResolvedValue(5173)

    renderWorkspace()

    await screen.findByText('Título original do arquivo')
    await waitFor(() => {
      expect(document.querySelector('audio')).not.toBeNull()
    })

    expect(document.querySelector('audio')?.getAttribute('src')).toBe(
      `http://127.0.0.1:5173/?p=${encodeURIComponent(windowsAudioPath)}`
    )
  })
})

describe('EpisodeWorkspace — WordPress publishing from Content tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.episodes = [makeEpisode({ status: 'transcribed' })]

    let linkedPostId = ''
    mockApi.linkWordPressPost.mockImplementation(async (_episodeId: number, postId: number) => {
      linkedPostId = String(postId)
    })

    mockApi.getSetting.mockImplementation(async (key: string) => {
      if (key === 'episode_1_wp_post_id') return linkedPostId
      if (key === 'episode_1_youtube_id') return ''
      if (key === 'ai_provider') return 'claude'
      if (key === 'blog_post_prompt' || key === 'youtube_prompt' || key === 'instagram_prompt') return ''
      return null
    })

    mockApi.getGeneratedContent.mockResolvedValue([
      {
        id: 11,
        episode_id: 1,
        type: 'blog_post',
        content: JSON.stringify({ title: 'Título', slug: 'slug', htmlContent: '<p>Conteúdo atualizado</p>' }),
        metadata: '{}',
        created_at: new Date().toISOString(),
      },
    ])
    mockApi.getDefaultBlogPrompt.mockResolvedValue('')
    mockApi.getDefaultYoutubePrompt.mockResolvedValue('')
    mockApi.getDefaultInstagramPrompt.mockResolvedValue('')
    mockApi.getDefaultResumePrompt.mockResolvedValue('')
    mockApi.getKeyMoments.mockResolvedValue([])
    mockApi.onAIProgress.mockImplementation(() => {})
    mockApi.getYouTubeStatus.mockResolvedValue({ connected: false, mainChannelId: null })
    mockApi.listRecentVideos.mockResolvedValue([])
    mockApi.isWordPressConfigured.mockResolvedValue(true)
    mockApi.testWordPressConnection.mockResolvedValue({ success: true })
    mockApi.listWordPressPosts.mockResolvedValue([
      { postId: 123, title: 'Post existente', content: '', excerpt: '', modifiedAt: new Date().toISOString(), link: 'https://wp.local/p/123', status: 'draft', slug: 'post-existente' },
    ])
    mockApi.getWordPressPost.mockResolvedValue({ postId: 123, title: 'Post existente', content: '', excerpt: '', modifiedAt: new Date().toISOString(), link: 'https://wp.local/p/123', status: 'draft', slug: 'post-existente' })
    mockApi.updateWordPressPost.mockResolvedValue({ link: 'https://wp.local/p/123' })
    mockApi.publishToWordPress.mockResolvedValue({ postId: 999, postUrl: 'https://wp.local/p/999' })
    mockApi.setSetting.mockResolvedValue({ success: true })
    mockApi.getTranscript.mockResolvedValue([])
    mockApi.getMediaServerPort.mockResolvedValue(0)
  })

  it('updates the linked post instead of creating a new one after linking in the workspace toolbar', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(await screen.findByPlaceholderText('Buscar post no WordPress…'))
    await user.click(await screen.findByText('Post existente'))
    expect(mockApi.linkWordPressPost).toHaveBeenCalledWith(1, 123)

    await user.click(await screen.findByRole('button', { name: 'Blog Post' }))
    await user.click(await screen.findByRole('button', { name: /WordPress/i }))

    await waitFor(() => {
      expect(mockApi.updateWordPressPost).toHaveBeenCalledWith({
        postId: 123,
        content: '<p>Conteúdo atualizado</p>',
      })
    })
    expect(mockApi.publishToWordPress).not.toHaveBeenCalled()
  })
})
