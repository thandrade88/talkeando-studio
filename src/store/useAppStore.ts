import { create } from 'zustand'

interface AppState {
  episodes: Episode[]
  selectedEpisodeId: number | null
  isLoading: boolean
  error: string | null

  // Transcription that survives route navigation (runs in main process)
  transcribingEpisodeId: number | null
  transcriptionStartedAt: number | null   // Date.now() when transcription kicked off

  setEpisodes: (episodes: Episode[]) => void
  addEpisode: (episode: Episode) => void
  updateEpisode: (episode: Episode) => void
  removeEpisode: (id: number) => void
  selectEpisode: (id: number | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setTranscribingEpisode: (id: number | null, startedAt?: number) => void

  loadEpisodes: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  episodes: [],
  selectedEpisodeId: null,
  isLoading: false,
  error: null,
  transcribingEpisodeId: null,
  transcriptionStartedAt: null,

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
    set({ transcribingEpisodeId: id, transcriptionStartedAt: startedAt ?? null }),

  loadEpisodes: async () => {
    set({ isLoading: true, error: null })
    try {
      const episodes = await window.api.getEpisodes()
      set({ episodes, isLoading: false })
    } catch (err) {
      set({ error: String(err), isLoading: false })
    }
  }
}))
