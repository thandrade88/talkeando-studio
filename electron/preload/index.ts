import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Episodes
  getEpisodes: () => ipcRenderer.invoke('episodes:getAll'),
  getEpisode: (id: number) => ipcRenderer.invoke('episodes:getById', id),
  importEpisode: (filePath: string) => ipcRenderer.invoke('episodes:import', filePath),
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

  // First run
  checkSetupComplete: () => ipcRenderer.invoke('setup:isComplete'),
  shouldShowSetup: () => ipcRenderer.invoke('setup:shouldShow'),
  markSetupComplete: () => ipcRenderer.invoke('setup:markComplete'),

  // Whisper setup
  getWhisperStatus: () => ipcRenderer.invoke('whisper:getStatus'),
  installWhisper: () => ipcRenderer.invoke('whisper:install'),
  downloadWhisperModel: (model: string) => ipcRenderer.invoke('whisper:downloadModel', model),
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
  getYouTubeStatus: () => ipcRenderer.invoke('youtube:getStatus'),
  saveYouTubeCredentials: (clientId: string, clientSecret: string) =>
    ipcRenderer.invoke('youtube:saveCredentials', clientId, clientSecret),
  connectYouTube: () => ipcRenderer.invoke('youtube:connect'),
  disconnectYouTube: () => ipcRenderer.invoke('youtube:disconnect'),
  listYouTubeChannels: () => ipcRenderer.invoke('youtube:listChannels'),
  resolveYouTubeChannel: (channelId: string) => ipcRenderer.invoke('youtube:resolveChannel', channelId),
  saveYouTubeChannelConfig: (mainChannelId: string, cutsChannelId: string) =>
    ipcRenderer.invoke('youtube:saveChannelConfig', mainChannelId, cutsChannelId),
  connectForChannel: (channelId: string) =>
    ipcRenderer.invoke('youtube:connectForChannel', channelId),
  getChannelAuthStatus: (channelId: string) =>
    ipcRenderer.invoke('youtube:channelAuthStatus', channelId),
  uploadToYouTube: (opts: {
    filePath: string; title: string; description: string; channelId: string;
    tags?: string[]; privacyStatus?: 'public' | 'unlisted' | 'private'
  }) => ipcRenderer.invoke('youtube:uploadVideo', opts),
  updateYouTubeVideoMetadata: (opts: {
    videoId: string; title: string; description: string; tags?: string[]
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
  }
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
