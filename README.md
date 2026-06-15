# Talkeando Studio

Content operating system for the Talkeando Podcast. A desktop app built with Electron + React + TypeScript that turns raw podcast recordings into publish-ready content.

## Features

- **Transcription** — Automatic speech-to-text via Whisper.cpp (local, no API cost). Auto-installs on Mac (Homebrew) and Windows (downloads binary from GitHub releases).
- **AI Content Generation** — Generates Blog Post, YouTube description + chapters, and Instagram caption/Reels script. Works with Claude (Anthropic), ChatGPT (OpenAI), or Gemini (Google).
- **Custom Prompts** — Per-type prompt editors (Blog Post, YouTube, Instagram) with save/reset, both in-episode and in Settings.
- **Clip Export** — Mark and export audio/video clips via FFmpeg.
- **Publish tab** — Quick copy-to-clipboard for each platform with direct links to YouTube Studio, Instagram, and WordPress.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 33 |
| UI | React 18 + TypeScript + Tailwind CSS |
| Build | electron-vite |
| Database | SQLite via better-sqlite3 |
| Transcription | Whisper.cpp |
| AI | Anthropic SDK / OpenAI SDK / Google Generative AI |
| State | Zustand |
| Tests | Vitest + Testing Library + Playwright |

## Getting Started

### Prerequisites

- Node.js 20+
- macOS: Homebrew (for Whisper auto-install)
- Windows: PowerShell 5+ (built in on Windows 10+)

### Install & run

```bash
git clone https://github.com/thandrade88/talkeando-studio.git
cd talkeando-studio
npm install
npm run dev
```

On first launch the setup wizard will guide you through installing Whisper.cpp and downloading a transcription model.

### Build

```bash
# macOS
npm run build:mac

# Windows (run on a Windows machine or via GitHub Actions)
npm run build:win
```

## Windows Installer (CI)

A GitHub Actions workflow builds the Windows `.exe` installer automatically.

1. Go to **Actions → Build Windows Installer → Run workflow**
2. Wait ~5 minutes
3. Download the `.exe` from the **Artifacts** section

## Configuration

All settings live in **Settings → Geral**:

| Setting | Description |
|---|---|
| AI Provider | Claude, ChatGPT, or Gemini |
| API Keys | One per provider |
| WordPress URL | Opens your WP admin when publishing |
| Output folder | Where exported clips are saved |

Transcription settings (language, Whisper model) are in **Settings → Transcrição**.

Custom AI prompts are in **Settings → Prompts de IA** and also inline per episode.

## Project Structure

```
electron/
  main/           — Electron main process
  preload/        — contextBridge (window.api)
  services/
    database.ts         — SQLite setup
    episodeManager.ts   — Episode CRUD + import
    transcriptEngine.ts — Whisper.cpp runner + segment parsing
    whisperSetup.ts     — Cross-platform Whisper install
    aiEngine.ts         — Claude / OpenAI / Gemini generation
    clipEngine.ts       — Clip creation + FFmpeg export
    fileManager.ts      — File dialogs, Reveal in Finder

src/
  pages/
    Dashboard.tsx         — Episode list
    EpisodeWorkspace.tsx  — Transcription, Content, Clips, Publish tabs
    Settings.tsx          — All settings + Whisper setup
  store/useAppStore.ts    — Zustand global state
  components/
    SetupWizard.tsx       — First-run onboarding
    Sidebar.tsx           — Navigation

tests/
  unit/       — Vitest (Node env)
  components/ — Vitest + Testing Library (jsdom)
  e2e/        — Playwright
```

## Running Tests

```bash
npm run test:unit        # unit tests
npm run test:components  # component tests
npm test                 # all
npm run test:coverage    # coverage report
```

## License

Private — Talkeando Podcast.
