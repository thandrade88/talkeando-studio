import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // App
  getEdition: () => ipcRenderer.invoke('app:getEdition') as Promise<'solo' | 'studio'>,

  // Podcasts
  getPodcasts: () => ipcRenderer.invoke('podcasts:getAll'),
  getPodcast: (id: number) => ipcRenderer.invoke('podcasts:getById', id),
  createPodcast: (name: string) => ipcRenderer.invoke('podcasts:create', name),
  updatePodcast: (id: number, data: { name?: string }) => ipcRenderer.invoke('podcasts:update', id, data),
  deletePodcast: (id: number) => ipcRenderer.invoke('podcasts:delete', id),
  getPodcastSettings: (podcastId: number) => ipcRenderer.invoke('podcasts:getSettings', podcastId),
  setPodcastSetting: (podcastId: number, key: string, value: string) =>
    ipcRenderer.invoke('podcasts:setSetting', podcastId, key, value),

  // Episodes
  getEpisodes: (podcastId?: number) => ipcRenderer.invoke('episodes:getAll', podcastId),
  getEpisode: (id: number) => ipcRenderer.invoke('episodes:getById', id),
  importEpisode: (filePath: string, podcastId: number) => ipcRenderer.invoke('episodes:import', filePath, podcastId),
  deleteEpisode: (id: number) => ipcRenderer.invoke('episodes:delete', id),
  updateEpisode: (id: number, data: Record<string, unknown>) =>
    ipcRenderer.invoke('episodes:update', id, data),

  // Transcripts
  getTranscript: (episodeId: number) => ipcRenderer.invoke('transcripts:getByEpisode', episodeId),
  startTranscription: (episodeId: number, startSeconds?: number, endSeconds?: number) =>
    ipcRenderer.invoke('transcripts:start', episodeId, startSeconds ?? 0, endSeconds),
  extractFrame: (filePath: string, timeSeconds: number) =>
    ipcRenderer.invoke('media:extractFrame', filePath, timeSeconds),
  getMediaDuration: (filePath: string) =>
    ipcRenderer.invoke('media:getDuration', filePath),
  updateTranscriptSegment: (id: number, text: string) =>
    ipcRenderer.invoke('transcripts:updateSegment', id, text),
  onImportProgress: (callback: (episodeId: number, status: string | null) => void) => {
    const handler = (_: unknown, episodeId: number, status: string | null) => callback(episodeId, status)
    ipcRenderer.on('episodes:importProgress', handler)
    return () => ipcRenderer.removeListener('episodes:importProgress', handler)
  },

  onTranscriptionProgress: (callback: (progress: number, status: string) => void) => {
    const handler = (_: unknown, progress: number, status: string) => callback(progress, status)
    ipcRenderer.on('transcription:progress', handler)
    return () => ipcRenderer.removeListener('transcription:progress', handler)
  },

  // AI Content
  getGeneratedContent: (episodeId: number) =>
    ipcRenderer.invoke('ai:getContent', episodeId),
  generateContent: (episodeId: number, type: string, options?: Record<string, unknown>) =>
    ipcRenderer.invoke('ai:generate', episodeId, type, options),
  saveContent: (contentId: number, content: string) =>
    ipcRenderer.invoke('ai:saveContent', contentId, content),
  deleteContent: (contentId: number) => ipcRenderer.invoke('ai:deleteContent', contentId),
  getDefaultBlogPrompt: () => ipcRenderer.invoke('ai:getDefaultBlogPrompt'),
  getDefaultYoutubePrompt: () => ipcRenderer.invoke('ai:getDefaultYoutubePrompt'),
  getDefaultInstagramPrompt: () => ipcRenderer.invoke('ai:getDefaultInstagramPrompt'),
  getDefaultResumePrompt: () => ipcRenderer.invoke('ai:getDefaultResumePrompt'),
  generateResume: (episodeId: number, options?: Record<string, unknown>) =>
    ipcRenderer.invoke('ai:generateResume', episodeId, options),
  getKeyMoments: (episodeId: number) => ipcRenderer.invoke('ai:getKeyMoments', episodeId),
  onAIProgress: (callback: (status: string) => void) => {
    const handler = (_: unknown, status: string) => callback(status)
    ipcRenderer.on('ai:progress', handler)
    return () => ipcRenderer.removeListener('ai:progress', handler)
  },

  // Clips
  getClips: (episodeId: number) => ipcRenderer.invoke('clips:getByEpisode', episodeId),
  createClip: (episodeId: number, startTime: number, endTime: number, title: string) =>
    ipcRenderer.invoke('clips:create', episodeId, startTime, endTime, title),
  createClipsFromKeyMoments: (episodeId: number) =>
    ipcRenderer.invoke('clips:createFromKeyMoments', episodeId),
  updateClip: (clipId: number, startTime: number, endTime: number) =>
    ipcRenderer.invoke('clips:update', clipId, startTime, endTime),
  setClipThumbnail: (clipId: number, filePath: string) =>
    ipcRenderer.invoke('clips:setThumbnail', clipId, filePath),
  setClipThumbnailFromFrame: (clipId: number, dataUrl: string) =>
    ipcRenderer.invoke('clips:setThumbnailFromFrame', clipId, dataUrl),
  generateClipSummary: (clipId: number, options?: Record<string, unknown>) =>
    ipcRenderer.invoke('ai:generateClipSummary', clipId, options),
  updateClipSummary: (clipId: number, summary: string) =>
    ipcRenderer.invoke('clips:updateSummary', clipId, summary),
  updateClipTitle: (clipId: number, title: string) =>
    ipcRenderer.invoke('clips:updateTitle', clipId, title),
  updateClipYouTubeId: (clipId: number, youtubeVideoId: string) =>
    ipcRenderer.invoke('clips:setYouTubeId', clipId, youtubeVideoId),
  exportClip: (clipId: number) => ipcRenderer.invoke('clips:export', clipId),
  deleteClip: (clipId: number) => ipcRenderer.invoke('clips:delete', clipId),
  deleteAllClips: (episodeId: number) => ipcRenderer.invoke('clips:deleteAll', episodeId),
  onClipProgress: (callback: (progress: number) => void) => {
    const handler = (_: unknown, progress: number) => callback(progress)
    ipcRenderer.on('clips:progress', handler)
    return () => ipcRenderer.removeListener('clips:progress', handler)
  },

  // File system
  openFileDialog: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('files:openDialog', filters),
  openSaveDialog: (defaultPath?: string) =>
    ipcRenderer.invoke('files:saveDialog', defaultPath),
  revealInFinder: (filePath: string) => ipcRenderer.invoke('files:reveal', filePath),
  getAppDataPath: () => ipcRenderer.invoke('files:getAppDataPath'),
  openExternal: (url: string) => ipcRenderer.invoke('files:openExternal', url),
  copyImageToClipboard: (filePath: string) => ipcRenderer.invoke('files:copyImageToClipboard', filePath),
  downloadFile: (filePath: string, defaultName?: string) =>
    ipcRenderer.invoke('files:downloadFile', filePath, defaultName),

  // Media server
  getMediaServerPort: () => ipcRenderer.invoke('media:serverPort') as Promise<number>,

  // OpusClip
  isOpusClipConfigured: () => ipcRenderer.invoke('opusclip:isConfigured') as Promise<boolean>,
  sendToOpusClip: (clipId: number) =>
    ipcRenderer.invoke('opusclip:sendClip', clipId) as Promise<{ projectId: string; dashboardUrl: string }>,
  onOpusClipProgress: (cb: (msg: string, pct: number) => void) => {
    const handler = (_: unknown, msg: string, pct: number) => cb(msg, pct)
    ipcRenderer.on('opusclip:progress', handler)
    return () => ipcRenderer.removeListener('opusclip:progress', handler)
  },

  // First run
  checkSetupComplete: () => ipcRenderer.invoke('setup:isComplete'),
  shouldShowSetup: () => ipcRenderer.invoke('setup:shouldShow'),
  markSetupComplete: () => ipcRenderer.invoke('setup:markComplete'),

  // Whisper setup
  getWhisperStatus: () => ipcRenderer.invoke('whisper:getStatus'),
  installWhisper: () => ipcRenderer.invoke('whisper:install'),
  downloadWhisperModel: (model: string) => ipcRenderer.invoke('whisper:downloadModel', model),
  deleteWhisperModel: (model: string) => ipcRenderer.invoke('whisper:deleteModel', model),
  getWhisperModelsDir: () => ipcRenderer.invoke('whisper:getModelsDir'),
  onWhisperSetupStatus: (callback: (data: WhisperSetupStatus) => void) => {
    const handler = (_: unknown, data: WhisperSetupStatus) => callback(data)
    ipcRenderer.on('whisper:setup-status', handler)
    return () => ipcRenderer.removeListener('whisper:setup-status', handler)
  },

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),

  // YouTube
  getYouTubeStatus: (podcastId?: number) => ipcRenderer.invoke('youtube:getStatus', podcastId),
  saveYouTubeCredentials: (clientId: string, clientSecret: string) =>
    ipcRenderer.invoke('youtube:saveCredentials', clientId, clientSecret),
  connectYouTube: () => ipcRenderer.invoke('youtube:connect'),
  disconnectYouTube: () => ipcRenderer.invoke('youtube:disconnect'),
  listYouTubeChannels: () => ipcRenderer.invoke('youtube:listChannels'),
  resolveYouTubeChannel: (channelId: string) => ipcRenderer.invoke('youtube:resolveChannel', channelId),
  saveYouTubeChannelConfig: (podcastId: number, mainChannelId: string, cutsChannelId: string) =>
    ipcRenderer.invoke('youtube:saveChannelConfig', podcastId, mainChannelId, cutsChannelId),
  connectForChannel: (channelId: string) =>
    ipcRenderer.invoke('youtube:connectForChannel', channelId),
  getChannelAuthStatus: (channelId: string) =>
    ipcRenderer.invoke('youtube:channelAuthStatus', channelId),
  listRecentVideos: (channelId: string, query?: string) =>
    ipcRenderer.invoke('youtube:listRecentVideos', channelId, query),
  uploadToYouTube: (opts: {
    filePath: string; title: string; description: string; channelId: string;
    thumbnailPath?: string; tags?: string[]; privacyStatus?: 'public' | 'unlisted' | 'private'
  }) => ipcRenderer.invoke('youtube:uploadVideo', opts),
  updateYouTubeVideoMetadata: (opts: {
    podcastId: number; videoId: string; title: string; description: string; tags?: string[]
  }) => ipcRenderer.invoke('youtube:updateVideoMetadata', opts),
  onYouTubeUploadProgress: (cb: (pct: number) => void) => {
    const handler = (_: unknown, pct: number) => cb(pct)
    ipcRenderer.on('youtube:uploadProgress', handler)
    return () => ipcRenderer.removeListener('youtube:uploadProgress', handler)
  },
  onYouTubeAuthStarted: (cb: (url: string) => void) => {
    const handler = (_: unknown, url: string) => cb(url)
    ipcRenderer.on('youtube:authStarted', handler)
    return () => ipcRenderer.removeListener('youtube:authStarted', handler)
  },

  // WordPress
  isWordPressConfigured: (podcastId: number) => ipcRenderer.invoke('wordpress:isConfigured', podcastId) as Promise<boolean>,
  testWordPressConnection: (podcastId: number, opts?: { url: string; user: string; appPassword: string }) =>
    ipcRenderer.invoke('wordpress:testConnection', podcastId, opts),
  listWordPressPosts: (podcastId: number, query?: string) =>
    ipcRenderer.invoke('wordpress:listPosts', podcastId, query),
  getWordPressPost: (podcastId: number, postId: number) =>
    ipcRenderer.invoke('wordpress:getPost', podcastId, postId),
  linkWordPressPost: (episodeId: number, postId: number) =>
    ipcRenderer.invoke('wordpress:linkPost', episodeId, postId),
  unlinkWordPressPost: (episodeId: number) =>
    ipcRenderer.invoke('wordpress:unlinkPost', episodeId),
  publishToWordPress: (opts: {
    episodeId: number; title: string; content: string;
    slug?: string; status?: 'draft' | 'publish'; featuredImageUrl?: string
  }) => ipcRenderer.invoke('wordpress:publish', opts),
  updateWordPressPost: (opts: {
    episodeId: number; postId: number; title?: string; content?: string;
    slug?: string; status?: 'draft' | 'publish'
  }) => ipcRenderer.invoke('wordpress:update', opts),
  deleteWordPressPost: (podcastId: number, postId: number) =>
    ipcRenderer.invoke('wordpress:delete', podcastId, postId),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
