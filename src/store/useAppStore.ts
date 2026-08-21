import { create } from 'zustand'

const SELECTED_PODCAST_KEY = 'talkeando_selected_podcast_id'

interface AppState {
  podcasts: Podcast[]
  selectedPodcastId: number | null
  podcastsLoaded: boolean

  episodes: Episode[]
  selectedEpisodeId: number | null
  isLoading: boolean
  error: string | null

  // Transcription that survives route navigation (runs in main process)
  transcribingEpisodeId: number | null
  transcriptionStartedAt: number | null
  txProgress: number
  txStatus: string
  txEta: string | null

  setPodcasts: (podcasts: Podcast[]) => void
  addPodcast: (podcast: Podcast) => void
  updatePodcastInStore: (podcast: Podcast) => void
  removePodcastFromStore: (id: number) => void
  selectPodcast: (id: number | null) => void
  loadPodcasts: () => Promise<void>

  setEpisodes: (episodes: Episode[]) => void
  addEpisode: (episode: Episode) => void
  updateEpisode: (episode: Episode) => void
  removeEpisode: (id: number) => void
  selectEpisode: (id: number | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setTranscribingEpisode: (id: number | null, startedAt?: number) => void
  setTxProgress: (progress: number, status: string, eta: string | null) => void

  loadEpisodes: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  podcasts: [],
  selectedPodcastId: null,
  podcastsLoaded: false,

  episodes: [],
  selectedEpisodeId: null,
  isLoading: false,
  error: null,
  transcribingEpisodeId: null,
  transcriptionStartedAt: null,
  txProgress: 0,
  txStatus: '',
  txEta: null,

  setPodcasts: (podcasts) => set({ podcasts }),
  addPodcast: (podcast) => set((s) => ({ podcasts: [...s.podcasts, podcast] })),
  updatePodcastInStore: (podcast) =>
    set((s) => ({ podcasts: s.podcasts.map((p) => (p.id === podcast.id ? podcast : p)) })),
  removePodcastFromStore: (id) =>
    set((s) => ({ podcasts: s.podcasts.filter((p) => p.id !== id) })),

  selectPodcast: (id) => {
    if (id !== null) localStorage.setItem(SELECTED_PODCAST_KEY, String(id))
    set({ selectedPodcastId: id })
    get().loadEpisodes()
  },

  loadPodcasts: async () => {
    const podcasts = await window.api.getPodcasts()
    const savedId = Number(localStorage.getItem(SELECTED_PODCAST_KEY))
    const stillExists = podcasts.some((p) => p.id === savedId)
    const selectedPodcastId = stillExists ? savedId : (podcasts[0]?.id ?? null)
    set({ podcasts, selectedPodcastId, podcastsLoaded: true })
    if (selectedPodcastId !== null) get().loadEpisodes()
  },

  setEpisodes: (episodes) => set({ episodes }),
  addEpisode: (episode) => set((s) => ({ episodes: [episode, ...s.episodes] })),
  updateEpisode: (episode) =>
    set((s) => ({ episodes: s.episodes.map((e) => (e.id === episode.id ? episode : e)) })),
  removeEpisode: (id) =>
    set((s) => ({ episodes: s.episodes.filter((e) => e.id !== id) })),
  selectEpisode: (id) => set({ selectedEpisodeId: id }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setTranscribingEpisode: (id, startedAt) =>
    set({ transcribingEpisodeId: id, transcriptionStartedAt: startedAt ?? null, txProgress: 0, txStatus: '', txEta: null }),
  setTxProgress: (progress, status, eta) =>
    set({ txProgress: progress, txStatus: status, txEta: eta }),

  loadEpisodes: async () => {
    const podcastId = get().selectedPodcastId
    if (podcastId === null) { set({ episodes: [] }); return }
    set({ isLoading: true, error: null })
    try {
      const episodes = await window.api.getEpisodes(podcastId)
      set({ episodes, isLoading: false })
    } catch (err) {
      set({ error: String(err), isLoading: false })
    }
  }
}))
