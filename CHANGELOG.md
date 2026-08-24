# Changelog

All notable changes to Talkeando Studio are documented here. `package.json` was
left at `0.1.0` through all of the work below — this file backfills it against
the real git history and starts real versioning at 2.0.0.

For a narrative, visual walkthrough of this same history, see the published
[Talkeando Studio History](README.md#history) page linked from the README.

## [2.0.0] — Unreleased — Multi-Podcast Architecture

The Studio moves from a single implicit show to `podcasts` as the parent
entity of the whole tree.

### Added
- `podcasts` table and a `podcast_settings` key/value table, scoped per podcast.
- `episodes.podcast_id` foreign key, with an automatic migration that creates
  a "Meu Podcast" podcast and backfills any pre-2.0 episodes into it — existing
  single-show installs see no disruption.
- `podcastManager.ts` — IPC CRUD for podcasts (`podcasts:getAll/getById/create/update/delete`)
  plus the `getPodcastSetting`/`setPodcastSetting` primitives other services build on.
- Sidebar rebuilt as an expandable Podcasts tree: each podcast nests its own
  Episódios and its own "Configurações do podcast".
- New per-podcast Settings screen (`PodcastSettings.tsx`) for WordPress
  credentials, YouTube channel assignment, and AI content prompts, including
  inline podcast rename in the screen's header.
- A "name your first podcast" step in the first-run Setup Wizard.
- Solo vs. Studio editions — a build-time `EDITION` flag
  (`electron/config/edition.ts`, injected via `define` in
  `electron.vite.config.ts`) caps the Solo SKU at one podcast. Enforced
  server-side in the `podcasts:create` IPC handler (the actual trust
  boundary), surfaced to the renderer via `window.api.getEdition()` /
  `useAppStore().isMultiPodcast`, and gates the Sidebar's "Novo podcast"
  control. New `build:solo`, `build:solo:win`, `build:solo:mac` scripts
  produce a separately-branded `com.talkeando.studio.solo` installer.

### Changed
- WordPress publishing (`wordpressService.ts`) is fully per-podcast: site URL,
  user, application password, and post type all live in `podcast_settings`
  instead of one global config.
- YouTube's main/cuts channel assignment (`youtube_main_channel_id`,
  `youtube_cuts_channel_id`) is per-podcast; the underlying Google OAuth app
  connection and per-channel token cache stay account-wide, since they were
  already keyed by channel ID rather than by show.
- AI content prompts (resume, blog post, YouTube, Instagram) are resolved
  per-podcast in `aiEngine.ts`, via the episode already being loaded — no
  renderer changes needed for content generation.
- `Settings.tsx` trimmed to app-wide config only: AI provider + API keys,
  the shared YouTube account connection, OpusClip key, Whisper setup, and
  default transcription language.
- `episodes:import` now requires a `podcastId`; `episodes:getAll` accepts an
  optional one to scope the Dashboard to the selected podcast.

### Fixed
- (Unrelated to multi-podcast, found and fixed along the way in
  `transcriptEngine.ts`.) Whisper progress updates could be dropped when
  `progress = NN%` straddled two stderr chunks; stdout/stderr buffering
  switched from string concatenation to array-join for large transcripts.

## [1.0] — 2026-06-15 to 2026-08-21 — Single-podcast Studio

Everything before the entry above shipped against one implicit show, with a
single global settings table. Major milestones, in order:

- **2026-06-15 — Initial release.** Whisper.cpp transcription, AI content
  generation (Claude/OpenAI/Gemini), the Resumo tab with key moments, and
  first-pass clip export.
- **2026-06-16 to 2026-06-19 — Publishing.** YouTube OAuth2 + upload,
  WordPress publishing, a redesigned clip editor (thumbnails, frame capture,
  9:16 preview, AI-generated summaries), and parallel chunked transcription.
- **2026-06-26 to 2026-07-13 — Hardening.** OpusClip integration for
  Shorts/Reels/TikTok, playback fixes for source files over 2 GB, a
  transcriptEngine refactor that removed dead chunking code, and a live
  transcription progress bar with ETA.
- **2026-08-17 to 2026-08-21 — Polish.** Windows transcription fixes
  (dropped progress ticks, binary selection, `-mc 0` to stop context
  poisoning), episode title/thumbnail sync from linked YouTube videos, a
  grid view for the episode list, and a fix for WordPress publishing that
  was creating duplicate posts instead of updating the linked one.
