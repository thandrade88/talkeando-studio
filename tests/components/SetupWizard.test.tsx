// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockApi = {
  getWhisperStatus: vi.fn(),
  onWhisperSetupStatus: vi.fn(() => () => {}),
  installWhisper: vi.fn(),
  downloadWhisperModel: vi.fn(),
  setSetting: vi.fn(),
  markSetupComplete: vi.fn(),
}

// Assign to window.api before importing the component so the module captures it
Object.assign(window, { api: mockApi })

import SetupWizard from '../../src/components/SetupWizard'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const whisperReady: WhisperStatus = {
  brewInstalled: true,
  whisperInstalled: true,
  whisperBinaryPath: '/opt/homebrew/bin/whisper-cli',
  currentModel: 'base',
  modelDownloaded: true,
  modelPath: '/tmp/models/ggml-base.bin',
  models: [{ key: 'base', size: '142 MB', description: 'Recomendado', downloaded: true }],
}

const whisperNotReady: WhisperStatus = {
  brewInstalled: false,
  whisperInstalled: false,
  whisperBinaryPath: '',
  currentModel: 'base',
  modelDownloaded: false,
  modelPath: '',
  models: [{ key: 'base', size: '142 MB', description: 'Recomendado', downloaded: false }],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SetupWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.onWhisperSetupStatus.mockReturnValue(() => {})
  })

  it('skips to API key step when whisper and model are already installed', async () => {
    mockApi.getWhisperStatus.mockResolvedValue(whisperReady)

    render(<SetupWizard onComplete={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/Claude API Key/i)).toBeDefined()
    })
  })

  it('shows whisper install step when brew is not installed', async () => {
    mockApi.getWhisperStatus.mockResolvedValue(whisperNotReady)

    render(<SetupWizard onComplete={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/Instalar Whisper\.cpp/i)).toBeDefined()
    })
  })

  it('shows homebrew warning when brew is missing', async () => {
    mockApi.getWhisperStatus.mockResolvedValue(whisperNotReady)

    render(<SetupWizard onComplete={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/Homebrew não encontrado/i)).toBeDefined()
    })
  })

  it('calls onComplete after the final step', async () => {
    mockApi.getWhisperStatus.mockResolvedValue(whisperReady)
    mockApi.markSetupComplete.mockResolvedValue({ success: true })

    const onComplete = vi.fn()
    render(<SetupWizard onComplete={onComplete} />)

    // Wait for API key step to appear
    await waitFor(() => screen.getByText(/Claude API Key/i))

    // Click Continue (no API key entered — shows "Continuar")
    const continueBtn = screen.getByRole('button', { name: /Continuar/i })
    await userEvent.click(continueBtn)

    // Now on done step
    await waitFor(() => screen.getByText(/Tudo pronto/i))
    await userEvent.click(screen.getByRole('button', { name: /Abrir o Studio/i }))

    await waitFor(() => {
      expect(mockApi.markSetupComplete).toHaveBeenCalled()
      expect(onComplete).toHaveBeenCalled()
    })
  })

  it('saves API key when provided before continuing', async () => {
    mockApi.getWhisperStatus.mockResolvedValue(whisperReady)
    mockApi.setSetting.mockResolvedValue({ success: true })

    render(<SetupWizard onComplete={vi.fn()} />)

    await waitFor(() => screen.getByPlaceholderText(/sk-ant-/i))
    await userEvent.type(screen.getByPlaceholderText(/sk-ant-/i), 'sk-ant-test-key')

    const saveBtn = screen.getByRole('button', { name: /Salvar e continuar/i })
    await userEvent.click(saveBtn)

    await waitFor(() => {
      expect(mockApi.setSetting).toHaveBeenCalledWith('anthropic_api_key', 'sk-ant-test-key')
    })
  })
})
