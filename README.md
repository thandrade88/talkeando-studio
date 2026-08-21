# Talkeando Studio

Content operating system for podcasts. A desktop app built with Electron + React + TypeScript that turns raw recordings into publish-ready content — across as many shows as you run.

## History

Talkeando Studio started as a single-show tool; 2.0 makes `podcasts` the parent
of the whole app. For the story of how it got here:

- **[Talkeando Studio Timeline](https://claude.ai/code/artifact/3bf6f0d0-f6f4-4f39-b047-5c8c5f19406c)** — a visual walkthrough of every chapter, day one through 2.0.
- **[CHANGELOG.md](CHANGELOG.md)** — the same history at commit-level detail.

## Features

- **Multi-podcast** — `podcasts` is the parent of the tree. Each show has its own episodes, WordPress connection, YouTube channel assignment, and AI prompts.
- **Transcription** — Automatic speech-to-text via Whisper.cpp (local, no API cost). Auto-installs on Mac (Homebrew) and Windows (downloads binary from GitHub releases).
- **AI Content Generation** — Generates Blog Post, YouTube description + chapters, and Instagram caption/Reels script. Works with Claude (Anthropic), ChatGPT (OpenAI), or Gemini (Google).
- **Custom Prompts** — Per-podcast, per-type prompt editors (Resumo, Blog Post, YouTube, Instagram) with save/reset, both in-episode and in that podcast's settings.
- **Publishing** — WordPress (create/update posts, featured image from a linked YouTube thumbnail) and YouTube (OAuth upload, metadata sync) direct from the workspace.
- **Clip Export** — Mark and export audio/video clips via FFmpeg, with optional OpusClip hand-off for Shorts/Reels/TikTok cuts.

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

Settings are split by scope:

**App-wide** — `Configurações do app` in the sidebar:

| Setting | Description |
|---|---|
| AI Provider | Claude, ChatGPT, or Gemini |
| API Keys | One per provider |
| YouTube account | Shared Google OAuth connection (Client ID/Secret, "Conectar conta Google") |
| OpusClip API Key | For sending exported clips to OpusClip |
| Output folder | Where exported clips are saved |
| Transcription | Default language and Whisper model |

**Per podcast** — `Configurações do podcast`, nested under each podcast in the sidebar:

| Setting | Description |
|---|---|
| WordPress | Site URL, user, Application Password — this podcast's own site |
| YouTube channels | Which connected channel is this podcast's "main" (episodes) and "cuts" (clips) |
| AI prompts | Resumo, Blog Post, YouTube, Instagram — this podcast's tone and format |

## Project Structure

```
electron/
  main/           — Electron main process
  preload/        — contextBridge (window.api)
  services/
    database.ts         — SQLite setup + the podcasts backfill migration
    podcastManager.ts    — Podcast CRUD + per-podcast settings primitives
    episodeManager.ts   — Episode CRUD + import (podcast-scoped)
    transcriptEngine.ts — Whisper.cpp runner + segment parsing
    whisperSetup.ts     — Cross-platform Whisper install
    aiEngine.ts         — Claude / OpenAI / Gemini generation
    clipEngine.ts       — Clip creation + FFmpeg export
    wordpressService.ts — WordPress publishing (per-podcast site config)
    youtubeService.ts   — YouTube OAuth, upload, per-podcast channel assignment
    opusClipService.ts  — OpusClip hand-off for exported clips
    fileManager.ts      — File dialogs, Reveal in Finder

src/
  pages/
    Dashboard.tsx         — Episode list, scoped to the selected podcast
    EpisodeWorkspace.tsx  — Transcription, Content, Clips, Publish tabs
    Settings.tsx           — App-wide settings + Whisper setup
    PodcastSettings.tsx    — Per-podcast WordPress / YouTube / prompts
  store/useAppStore.ts    — Zustand global state (podcasts + episodes)
  components/
    SetupWizard.tsx       — First-run onboarding, incl. naming the first podcast
    Sidebar.tsx           — Podcasts tree navigation

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
