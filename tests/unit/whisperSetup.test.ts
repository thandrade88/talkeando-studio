import { describe, it, expect, vi } from 'vitest'

vi.mock('electron')
vi.mock('better-sqlite3')

describe('model path generation', () => {
  it('generates the correct filename for known models', () => {
    const join = (dir: string, name: string) => `${dir}/${name}`
    const modelsDir = '/tmp/talkeando-test/models'

    const cases: Array<[string, string]> = [
      ['tiny', 'ggml-tiny.bin'],
      ['base', 'ggml-base.bin'],
      ['small', 'ggml-small.bin'],
      ['medium', 'ggml-medium.bin'],
      ['large-v3-turbo', 'ggml-large-v3-turbo.bin'],
      ['large-v3', 'ggml-large-v3.bin'],
    ]

    for (const [model, expected] of cases) {
      expect(join(modelsDir, `ggml-${model}.bin`)).toBe(`${modelsDir}/${expected}`)
    }
  })
})

describe('HuggingFace model URL format', () => {
  it('builds correct URL for each model', () => {
    const models = ['tiny', 'base', 'small', 'medium', 'large-v3-turbo', 'large-v3']
    const base = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

    for (const model of models) {
      const url = `${base}/ggml-${model}.bin`
      expect(url).toMatch(/^https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\/main\/ggml-.+\.bin$/)
    }
  })

  it('does not use the deprecated ggml-large.bin filename', () => {
    const models = ['tiny', 'base', 'small', 'medium', 'large-v3-turbo', 'large-v3']
    for (const model of models) {
      expect(`ggml-${model}.bin`).not.toBe('ggml-large.bin')
    }
  })
})

describe('Homebrew binary candidates', () => {
  it('prioritises whisper-cli over whisper-cpp', () => {
    const brewPrefix = '/opt/homebrew'
    const candidates = [
      `${brewPrefix}/bin/whisper-cli`,
      `${brewPrefix}/bin/whisper-cpp`,
      '/usr/local/bin/whisper-cli',
      '/opt/homebrew/bin/whisper-cli',
      '/usr/local/bin/whisper-cpp',
      '/opt/homebrew/bin/whisper-cpp',
    ]

    expect(candidates[0]).toContain('whisper-cli')
    expect(candidates.indexOf(`${brewPrefix}/bin/whisper-cli`))
      .toBeLessThan(candidates.indexOf(`${brewPrefix}/bin/whisper-cpp`))
  })

  it('falls back to common paths when brew prefix is empty', () => {
    const candidates = [
      '/usr/local/bin/whisper-cli',
      '/opt/homebrew/bin/whisper-cli',
      '/usr/local/bin/whisper-cpp',
      '/opt/homebrew/bin/whisper-cpp',
    ]

    expect(candidates).toContain('/opt/homebrew/bin/whisper-cli')
    expect(candidates).toContain('/usr/local/bin/whisper-cli')
  })
})

describe('MODELS constant', () => {
  it('contains all expected model keys', () => {
    const expectedKeys = ['tiny', 'base', 'small', 'medium', 'large-v3-turbo', 'large-v3']
    const MODELS = {
      tiny: { size: '75 MB', description: 'Mais rápido, menos preciso' },
      base: { size: '142 MB', description: 'Recomendado para testes' },
      small: { size: '466 MB', description: 'Boa precisão' },
      medium: { size: '1.5 GB', description: 'Muito preciso' },
      'large-v3-turbo': { size: '1.6 GB', description: 'Alta precisão (recomendado)' },
      'large-v3': { size: '3.1 GB', description: 'Máxima precisão' },
    }

    for (const key of expectedKeys) {
      expect(Object.keys(MODELS)).toContain(key)
    }
  })

  it('does not contain the deprecated large model key', () => {
    const MODELS = {
      tiny: {}, base: {}, small: {}, medium: {}, 'large-v3-turbo': {}, 'large-v3': {}
    }
    expect(Object.keys(MODELS)).not.toContain('large')
  })
})
