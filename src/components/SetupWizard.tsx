import { useEffect, useState } from 'react'
import { Mic2, Download, Terminal, Check, Loader2, ChevronRight, AlertCircle } from 'lucide-react'
import { cn } from '../lib/utils'

type Step = 'welcome' | 'whisper' | 'model' | 'apikey' | 'done'

interface Props {
  onComplete: () => void
}

export default function SetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome')
  const [status, setStatus] = useState<WhisperStatus | null>(null)
  const [setupStatus, setSetupStatus] = useState<WhisperSetupStatus | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [selectedModel, setSelectedModel] = useState('base')

  useEffect(() => {
    window.api.getWhisperStatus().then((s) => {
      setStatus(s)
      // Skip welcome if we can determine the right starting step immediately
      if (s.whisperInstalled) {
        setStep(s.modelDownloaded ? 'apikey' : 'model')
      } else {
        setStep('whisper')
      }
    })
    const unsub = window.api.onWhisperSetupStatus((s) => setSetupStatus(s))
    return unsub
  }, [])

  async function handleInstallWhisper() {
    if (!status) return
    setIsWorking(true)
    setError(null)
    try {
      await window.api.installWhisper()
      const refreshed = await window.api.getWhisperStatus()
      setStatus(refreshed)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsWorking(false)
      setSetupStatus(null)
    }
  }

  async function handleDownloadModel() {
    setIsWorking(true)
    setError(null)
    try {
      await window.api.downloadWhisperModel(selectedModel)
      const refreshed = await window.api.getWhisperStatus()
      setStatus(refreshed)
      setStep('apikey')
    } catch (err) {
      setError(String(err))
    } finally {
      setIsWorking(false)
      setSetupStatus(null)
    }
  }

  async function handleSaveApiKey() {
    if (apiKey.trim()) {
      await window.api.setSetting('anthropic_api_key', apiKey.trim())
    }
    setStep('done')
  }

  async function handleFinish() {
    await window.api.markSetupComplete()
    onComplete()
  }

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-primary/5 border-b border-border px-6 pt-8 pb-6 text-center">
          <Mic2 className="w-10 h-10 text-primary mx-auto mb-3" />
          <h1 className="text-xl font-bold">
            <span className="text-foreground">TALKEANDO</span>{' '}
            <span className="text-primary">STUDIO</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configuração inicial</p>
        </div>

        <div className="p-6">
          {step === 'welcome' && (
            <WelcomeStep onNext={() => {
              if (status?.whisperInstalled) {
                setStep(status.modelDownloaded ? 'apikey' : 'model')
              } else if (status?.brewInstalled) {
                // Homebrew available — go straight to whisper step and auto-install
                setStep('whisper')
              } else {
                setStep('whisper')
              }
            }} />
          )}

          {step === 'whisper' && (
            <WhisperStep
              status={status}
              setupStatus={setupStatus}
              isWorking={isWorking}
              error={error}
              onInstall={handleInstallWhisper}
              onNext={() => setStep('model')}
            />
          )}

          {step === 'model' && (
            <ModelStep
              status={status}
              setupStatus={setupStatus}
              isWorking={isWorking}
              error={error}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              onDownload={handleDownloadModel}
            />
          )}

          {step === 'apikey' && (
            <ApiKeyStep
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
              onNext={handleSaveApiKey}
              onSkip={() => setStep('done')}
            />
          )}

          {step === 'done' && (
            <DoneStep onFinish={handleFinish} />
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pb-5">
          {(['welcome', 'whisper', 'model', 'apikey', 'done'] as Step[]).map((s) => (
            <div
              key={s}
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-colors',
                s === step ? 'bg-primary' : 'bg-border'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-2">Bem-vindo ao Talkeando Studio</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Vamos configurar as ferramentas necessárias em poucos passos. Você vai precisar de:
        </p>
        <ul className="mt-3 space-y-2">
          {[
            'Whisper.cpp — transcrição de áudio (local, grátis)',
            'Modelo de IA — arquivo de linguagem para o Whisper',
            'Claude API Key — para gerar conteúdo'
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm">
              <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={onNext}
        className="w-full bg-primary hover:bg-primary/90 text-white py-2.5 rounded-lg text-sm font-medium"
      >
        Começar configuração
      </button>
    </div>
  )
}

function WhisperStep({
  status,
  setupStatus,
  isWorking,
  error,
  onInstall,
  onNext
}: {
  status: WhisperStatus | null
  setupStatus: WhisperSetupStatus | null
  isWorking: boolean
  error: string | null
  onInstall: () => void
  onNext: () => void
}) {
  const installed = status?.whisperInstalled ?? false

  // Auto-start install when Homebrew is available and whisper isn't installed
  useEffect(() => {
    if (status && status.brewInstalled && !status.whisperInstalled && !isWorking && !error) {
      onInstall()
    }
  }, [status?.brewInstalled])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-1">Instalar Whisper.cpp</h2>
        <p className="text-sm text-muted-foreground">
          Motor de transcrição local — processa áudio no seu computador sem enviar dados para a internet.
        </p>
      </div>

      {!status?.brewInstalled && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-500">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Homebrew não encontrado</p>
            <p className="text-yellow-400 mt-0.5">
              Instale o Homebrew em <strong>brew.sh</strong> e reinicie o app para continuar.
            </p>
          </div>
        </div>
      )}

      {installed ? (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-primary/10 border border-primary/30 rounded-lg">
          <Check className="w-4 h-4 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium text-primary">Whisper.cpp instalado</p>
            <p className="text-xs text-muted-foreground">{status?.whisperBinaryPath}</p>
          </div>
        </div>
      ) : (
        <>
          {isWorking && setupStatus && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="truncate">{setupStatus.message}</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all rounded-full"
                  style={{ width: `${setupStatus.progress}%` }}
                />
              </div>
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
          <button
            onClick={onInstall}
            disabled={isWorking || !status?.brewInstalled}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
            {isWorking ? 'Instalando...' : 'Instalar via Homebrew'}
          </button>
        </>
      )}

      {installed && (
        <button
          onClick={onNext}
          className="w-full bg-primary hover:bg-primary/90 text-white py-2.5 rounded-lg text-sm font-medium"
        >
          Continuar
        </button>
      )}
    </div>
  )
}

function ModelStep({
  status,
  setupStatus,
  isWorking,
  error,
  selectedModel,
  onSelectModel,
  onDownload
}: {

  status: WhisperStatus | null
  setupStatus: WhisperSetupStatus | null
  isWorking: boolean
  error: string | null
  selectedModel: string
  onSelectModel: (m: string) => void
  onDownload: () => void
}) {
  const models = [
    { key: 'tiny', size: '75 MB', label: 'Tiny — rápido, menos preciso' },
    { key: 'base', size: '142 MB', label: 'Base — recomendado para testes' },
    { key: 'small', size: '466 MB', label: 'Small — boa precisão' },
    { key: 'medium', size: '1.5 GB', label: 'Medium — muito preciso' },
    { key: 'large-v3-turbo', size: '1.6 GB', label: 'Large v3 Turbo — alta precisão (recomendado)' },
    { key: 'large-v3', size: '3.1 GB', label: 'Large v3 — máxima precisão' }
  ]

  const alreadyDownloaded = status?.models.find(m => m.key === selectedModel)?.downloaded

  // Auto-start base model download when step first renders
  useEffect(() => {
    if (status && !alreadyDownloaded && !isWorking && !error) {
      onDownload()
    }
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-1">Baixar modelo</h2>
        <p className="text-sm text-muted-foreground">
          Escolha o modelo de linguagem. Modelos maiores são mais precisos mas usam mais memória.
        </p>
      </div>

      <div className="space-y-2">
        {models.map((m) => {
          const downloaded = status?.models.find(s => s.key === m.key)?.downloaded
          return (
            <label
              key={m.key}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors',
                selectedModel === m.key
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40'
              )}
            >
              <input
                type="radio"
                name="model"
                value={m.key}
                checked={selectedModel === m.key}
                onChange={() => onSelectModel(m.key)}
                className="accent-primary"
              />
              <div className="flex-1">
                <p className="text-sm">{m.label}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{m.size}</span>
                {downloaded && <Check className="w-3.5 h-3.5 text-primary" />}
              </div>
            </label>
          )
        })}
      </div>

      {isWorking && setupStatus && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{setupStatus.message}</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all rounded-full"
              style={{ width: `${setupStatus.progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <button
        onClick={onDownload}
        disabled={isWorking}
        className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {isWorking ? 'Baixando...' : alreadyDownloaded ? 'Continuar' : `Baixar modelo ${selectedModel}`}
      </button>
    </div>
  )
}

function ApiKeyStep({
  apiKey,
  onApiKeyChange,
  onNext,
  onSkip
}: {
  apiKey: string
  onApiKeyChange: (k: string) => void
  onNext: () => void
  onSkip: () => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-1">Claude API Key</h2>
        <p className="text-sm text-muted-foreground">
          Necessária para gerar conteúdo com IA. Você pode adicionar depois em Configurações.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Chave de API</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/40"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Crie sua chave em <strong>console.anthropic.com</strong> → API Keys
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onSkip}
          className="flex-1 py-2.5 text-sm bg-secondary hover:bg-secondary/80 border border-border rounded-lg"
        >
          Pular por agora
        </button>
        <button
          onClick={onNext}
          className="flex-1 bg-primary hover:bg-primary/90 text-white py-2.5 rounded-lg text-sm font-medium"
        >
          {apiKey.trim() ? 'Salvar e continuar' : 'Continuar'}
        </button>
      </div>
    </div>
  )
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="space-y-5 text-center">
      <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
        <Check className="w-7 h-7 text-primary" />
      </div>
      <div>
        <h2 className="text-base font-semibold mb-2">Tudo pronto!</h2>
        <p className="text-sm text-muted-foreground">
          O Talkeando Studio está configurado. Importe seu primeiro episódio e comece a criar conteúdo.
        </p>
      </div>
      <button
        onClick={onFinish}
        className="w-full bg-primary hover:bg-primary/90 text-white py-2.5 rounded-lg text-sm font-medium"
      >
        Abrir o Studio
      </button>
    </div>
  )
}
