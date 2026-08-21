// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const podcast: Podcast = { id: 1, name: 'Meu Podcast', created_at: new Date().toISOString() }

const mockApi = {
  getPodcast: vi.fn(async () => podcast),
  updatePodcast: vi.fn(),
  getPodcastSettings: vi.fn(async () => ({})),
  getYouTubeStatus: vi.fn(async () => ({ clientId: '', connected: false })),
  isWordPressConfigured: vi.fn(async () => false),
  getDefaultResumePrompt: vi.fn(async () => ''),
  getDefaultBlogPrompt: vi.fn(async () => ''),
  getDefaultYoutubePrompt: vi.fn(async () => ''),
  getDefaultInstagramPrompt: vi.fn(async () => ''),
}

Object.assign(window, { api: mockApi })

const storeState = { updatePodcastInStore: vi.fn() }

vi.mock('../../src/store/useAppStore', () => {
  const useAppStore = vi.fn((selector: (s: typeof storeState) => unknown) => selector(storeState))
  return { useAppStore }
})

import PodcastSettings from '../../src/pages/PodcastSettings'

function renderPodcastSettings() {
  return render(
    <MemoryRouter initialEntries={['/podcast/1/settings']}>
      <Routes>
        <Route path="/podcast/:podcastId/settings" element={<PodcastSettings />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PodcastSettings — rename podcast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.getPodcast.mockResolvedValue(podcast)
    mockApi.getPodcastSettings.mockResolvedValue({})
    mockApi.getYouTubeStatus.mockResolvedValue({ clientId: '', connected: false })
    mockApi.isWordPressConfigured.mockResolvedValue(false)
  })

  it('shows the podcast name in the header', async () => {
    renderPodcastSettings()

    expect(await screen.findByText('Meu Podcast')).toBeDefined()
  })

  it('enters edit mode and saves a new name', async () => {
    const user = userEvent.setup()
    const updated: Podcast = { ...podcast, name: 'Podcast Renomeado' }
    mockApi.updatePodcast.mockResolvedValue(updated)

    renderPodcastSettings()
    await screen.findByText('Meu Podcast')

    await user.click(screen.getByText('Meu Podcast'))

    const input = screen.getByDisplayValue('Meu Podcast')
    await user.clear(input)
    await user.type(input, 'Podcast Renomeado')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(mockApi.updatePodcast).toHaveBeenCalledWith(1, { name: 'Podcast Renomeado' })
    })
    expect(storeState.updatePodcastInStore).toHaveBeenCalledWith(updated)
    expect(await screen.findByText('Podcast Renomeado')).toBeDefined()
  })

  it('cancels editing on Escape without saving', async () => {
    const user = userEvent.setup()
    renderPodcastSettings()
    await screen.findByText('Meu Podcast')

    await user.click(screen.getByText('Meu Podcast'))
    const input = screen.getByDisplayValue('Meu Podcast')
    await user.type(input, ' extra')
    await user.keyboard('{Escape}')

    expect(mockApi.updatePodcast).not.toHaveBeenCalled()
    expect(await screen.findByText('Meu Podcast')).toBeDefined()
  })

  it('rejects an empty name without calling the API', async () => {
    const user = userEvent.setup()
    renderPodcastSettings()
    await screen.findByText('Meu Podcast')

    await user.click(screen.getByText('Meu Podcast'))
    const input = screen.getByDisplayValue('Meu Podcast')
    await user.clear(input)
    await user.keyboard('{Enter}')

    expect(mockApi.updatePodcast).not.toHaveBeenCalled()
    expect(await screen.findByText('Nome não pode estar vazio.')).toBeDefined()
  })
})
