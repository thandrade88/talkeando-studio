import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron')
vi.mock('better-sqlite3')
vi.mock('@anthropic-ai/sdk')
vi.mock('openai')
vi.mock('@google/generative-ai')

import { ipcMain } from 'electron'
import { registerAIHandlers, DEFAULT_RESUME_PROMPT, DEFAULT_BLOG_POST_PROMPT, DEFAULT_YOUTUBE_PROMPT, DEFAULT_INSTAGRAM_PROMPT } from '../../electron/services/aiEngine'

type Handler = (event: unknown, ...args: unknown[]) => unknown

function captureHandlers() {
  const handlers: Record<string, Handler> = {}
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn: Handler) => {
    handlers[channel] = fn
    return undefined as never
  })
  return handlers
}

describe('registerAIHandlers — channel registration', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('registers all expected IPC channels', () => {
    const handlers = captureHandlers()
    registerAIHandlers(ipcMain as never)

    expect(Object.keys(handlers)).toEqual(expect.arrayContaining([
      'ai:getContent',
      'ai:generate',
      'ai:generateResume',
      'ai:getKeyMoments',
      'ai:saveContent',
      'ai:deleteContent',
      'ai:getDefaultBlogPrompt',
      'ai:getDefaultYoutubePrompt',
      'ai:getDefaultInstagramPrompt',
      'ai:getDefaultResumePrompt',
    ]))
  })

  it('does not register the removed ai:extractKeyMoments channel', () => {
    const handlers = captureHandlers()
    registerAIHandlers(ipcMain as never)

    expect(Object.keys(handlers)).not.toContain('ai:extractKeyMoments')
  })
})

describe('ai:getDefaultResumePrompt', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns the DEFAULT_RESUME_PROMPT string', async () => {
    const handlers = captureHandlers()
    registerAIHandlers(ipcMain as never)

    const result = await handlers['ai:getDefaultResumePrompt']({})
    expect(result).toBe(DEFAULT_RESUME_PROMPT)
  })
})

describe('DEFAULT_RESUME_PROMPT', () => {
  it('contains the {{title}} placeholder', () => {
    expect(DEFAULT_RESUME_PROMPT).toContain('{{title}}')
  })

  it('contains the {{transcript}} placeholder', () => {
    expect(DEFAULT_RESUME_PROMPT).toContain('{{transcript}}')
  })

  it('instructs the AI to return a JSON with summary and keyMoments', () => {
    expect(DEFAULT_RESUME_PROMPT).toContain('"summary"')
    expect(DEFAULT_RESUME_PROMPT).toContain('"keyMoments"')
  })

  it('instructs the AI to include start_time and end_time in key moments', () => {
    expect(DEFAULT_RESUME_PROMPT).toContain('start_time')
    expect(DEFAULT_RESUME_PROMPT).toContain('end_time')
  })
})

describe('DEFAULT_BLOG_POST_PROMPT', () => {
  it('contains the {{title}} and {{transcript}} placeholders', () => {
    expect(DEFAULT_BLOG_POST_PROMPT).toContain('{{title}}')
    expect(DEFAULT_BLOG_POST_PROMPT).toContain('{{transcript}}')
  })
})

describe('DEFAULT_YOUTUBE_PROMPT', () => {
  it('contains the {{title}} and {{transcript}} placeholders', () => {
    expect(DEFAULT_YOUTUBE_PROMPT).toContain('{{title}}')
    expect(DEFAULT_YOUTUBE_PROMPT).toContain('{{transcript}}')
  })
})

describe('DEFAULT_INSTAGRAM_PROMPT', () => {
  it('contains the {{title}} and {{transcript}} placeholders', () => {
    expect(DEFAULT_INSTAGRAM_PROMPT).toContain('{{title}}')
    expect(DEFAULT_INSTAGRAM_PROMPT).toContain('{{transcript}}')
  })
})
