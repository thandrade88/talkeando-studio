/// <reference types="vite/client" />

interface WhisperModelInfo {
  key: string
  size: string
  description: string
  downloaded: boolean
}

interface WhisperStatus {
  platform: string
  brewInstalled: boolean
  whisperInstalled: boolean
  whisperBinaryPath: string
  currentModel: string
  modelDownloaded: boolean
  modelPath: string
  models: WhisperModelInfo[]
}

interface WhisperSetupStatus {
  step: 'install' | 'download'
  message: string
  progress: number
  model?: string
}

interface Window {
  api: {
    getEpisodes: () => Promise<Episode[]>
    getEpisode: (id: number) => Promise<Episode>
    importEpisode: (filePath: string) => Promise<Episode>
    deleteEpisode: (id: number) => Promise<{ success: boolean }>
    updateEpisode: (id: number, data: Partial<Episode>) => Promise<Episode>

    getTranscript: (episodeId: number) => Promise<TranscriptSegment[]>
    startTranscription: (episodeId: number, startSeconds?: number, endSeconds?: number) => Promise<{ success: boolean; segmentCount: number }>
    extractFrame: (filePath: string, timeSeconds: number) => Promise<string | null>
    getMediaDuration: (filePath: string) => Promise<number>
    updateTranscriptSegment: (id: number, text: string) => Promise<{ success: boolean }>
    onImportProgress: (cb: (episodeId: number, status: string | null) => void) => () => void
    onTranscriptionProgress: (cb: (progress: number, status: string) => void) => () => void

    getGeneratedContent: (episodeId: number) => Promise<GeneratedContent[]>
    generateContent: (episodeId: number, type: string, options?: { provider?: 'claude' | 'openai' | 'gemini' }) => Promise<GeneratedContent>
    saveContent: (contentId: number, content: string) => Promise<{ success: boolean }>
    deleteContent: (contentId: number) => Promise<{ success: boolean }>
    getDefaultBlogPrompt: () => Promise<string>
    getDefaultYoutubePrompt: () => Promise<string>
    getDefaultInstagramPrompt: () => Promise<string>
    getDefaultResumePrompt: () => Promise<string>
    generateResume: (episodeId: number, options?: { provider?: 'claude' | 'openai' | 'gemini' }) => Promise<{ content: GeneratedContent; keyMoments: KeyMoment[] }>
    getKeyMoments: (episodeId: number) => Promise<KeyMoment[]>
    onAIProgress: (cb: (status: string) => void) => () => void

    getClips: (episodeId: number) => Promise<Clip[]>
    createClip: (episodeId: number, startTime: number, endTime: number, title: string) => Promise<Clip>
    createClipsFromKeyMoments: (episodeId: number) => Promise<Clip[]>
    updateClip: (clipId: number, startTime: number, endTime: number) => Promise<Clip>
    setClipThumbnail: (clipId: number, filePath: string) => Promise<Clip>
    setClipThumbnailFromFrame: (clipId: number, dataUrl: string) => Promise<Clip>
    generateClipSummary: (clipId: number, options?: { provider?: 'claude' | 'openai' | 'gemini' }) => Promise<Clip>
    updateClipSummary: (clipId: number, summary: string) => Promise<Clip>
    updateClipTitle: (clipId: number, title: string) => Promise<Clip>
    updateClipYouTubeId: (clipId: number, youtubeVideoId: string) => Promise<Clip>
    exportClip: (clipId: number) => Promise<{ success: boolean; filePath: string }>
    deleteClip: (clipId: number) => Promise<{ success: boolean }>
    deleteAllClips: (episodeId: number) => Promise<{ success: boolean }>
    onClipProgress: (cb: (progress: number) => void) => () => void

    openFileDialog: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
    openSaveDialog: (defaultPath?: string) => Promise<string | null>
    revealInFinder: (filePath: string) => Promise<{ success: boolean }>
    getAppDataPath: () => Promise<string>
    openExternal: (url: string) => Promise<{ success: boolean }>
    copyImageToClipboard: (filePath: string) => Promise<{ success: boolean }>
    downloadFile: (filePath: string, defaultName?: string) => Promise<string | null>

    checkSetupComplete: () => Promise<boolean>
    shouldShowSetup: () => Promise<boolean>
    markSetupComplete: () => Promise<{ success: boolean }>

    getWhisperStatus: () => Promise<WhisperStatus>
    installWhisper: () => Promise<{ success: boolean; binaryPath?: string; message?: string }>
    downloadWhisperModel: (model: string) => Promise<{ success: boolean; modelPath?: string }>
    getWhisperModelsDir: () => Promise<string>
    onWhisperSetupStatus: (callback: (data: WhisperSetupStatus) => void) => () => void

    getSetting: (key: string) => Promise<string | null>
    setSetting: (key: string, value: unknown) => Promise<{ success: boolean }>
    getAllSettings: () => Promise<Record<string, string>>

    // YouTube
    getYouTubeStatus: () => Promise<{ clientId: string | null; connected: boolean; authChannelId: string | null; mainChannelId: string | null; cutsChannelId: string | null }>
    saveYouTubeCredentials: (clientId: string, clientSecret: string) => Promise<{ success: boolean }>
    connectYouTube: () => Promise<{ success: boolean; channels: YouTubeChannel[] }>
    disconnectYouTube: () => Promise<{ success: boolean }>
    listYouTubeChannels: () => Promise<YouTubeChannel[]>
    resolveYouTubeChannel: (channelId: string) => Promise<YouTubeChannel>
    saveYouTubeChannelConfig: (mainChannelId: string, cutsChannelId: string) => Promise<{ success: boolean }>
    connectForChannel: (channelId: string) => Promise<{ success: boolean }>
    getChannelAuthStatus: (channelId: string) => Promise<{ authenticated: boolean }>
    listRecentVideos: (channelId: string, query?: string) => Promise<YouTubeVideo[]>
    uploadToYouTube: (opts: { filePath: string; title: string; description: string; channelId: string; thumbnailPath?: string; tags?: string[]; privacyStatus?: 'public' | 'unlisted' | 'private' }) => Promise<{ videoId: string; videoUrl: string }>
    updateYouTubeVideoMetadata: (opts: { videoId: string; title: string; description: string; tags?: string[] }) => Promise<{ success: boolean; videoUrl: string }>
    onYouTubeUploadProgress: (cb: (pct: number) => void) => () => void
    onYouTubeAuthStarted: (cb: (url: string) => void) => () => void

    // WordPress
    publishToWordPress: (opts: { episodeId: number; title: string; content: string; slug?: string; status?: 'draft' | 'publish' }) => Promise<{ postId: number; postUrl: string }>
    updateWordPressPost: (opts: { postId: number; title: string; content: string; slug?: string }) => Promise<{ postId: number; postUrl: string }>
  }
}

interface YouTubeChannel {
  id: string
  title: string
  thumb: string | null
}

interface YouTubeVideo {
  videoId: string
  title: string
  publishedAt: string
  thumb: string | null
}

interface Episode {
  id: number
  title: string
  file_path: string
  audio_path: string
  duration: number
  status: 'imported' | 'transcribing' | 'transcribed' | 'ready'
  created_at: string
  updated_at: string
  transcript_count?: number
  clip_count?: number
  content_count?: number
}

interface TranscriptSegment {
  id: number
  episode_id: number
  start_time: number
  end_time: number
  text: string
  speaker: string
}

interface GeneratedContent {
  id: number
  episode_id: number
  type: string
  content: string
  metadata: string
  created_at: string
}

interface KeyMoment {
  id: number
  episode_id: number
  title: string
  description: string
  start_time: number
  end_time: number
  created_at: string
}

interface Clip {
  id: number
  episode_id: number
  start_time: number
  end_time: number
  title: string
  reason: string
  file_path: string
  thumbnail_path: string
  summary: string
  youtube_video_id: string
}
