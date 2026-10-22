<div align="center">

# ✦ NY-CLI

<samp>ネコアニメ CLI — Watch and Download Anime from Your Terminal</samp>

<br/>

[![Version](https://img.shields.io/badge/v7.0.1-a855f7?style=flat-square&label=release)](https://github.com/AnjishnuSengupta/ny-cli/releases)
[![npm](https://img.shields.io/npm/v/@anjishnusengupta/ny-cli?style=flat-square&color=22c55e&label=npm)](https://www.npmjs.com/package/@anjishnusengupta/ny-cli)
[![Node](https://img.shields.io/badge/node-%3E%3D20.18.0-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/MIT-3b82f6?style=flat-square&label=license)](LICENSE)
[![Stars](https://img.shields.io/github/stars/AnjishnuSengupta/ny-cli?style=flat-square&color=fbbf24)](https://github.com/AnjishnuSengupta/ny-cli/stargazers)
[![Instagram](https://img.shields.io/badge/anjishnu.prolly-E4405F?style=flat-square&logo=instagram&logoColor=white)](https://www.instagram.com/anjishnu.prolly)

<br/>

<kbd>[🌐 **NyAnime Website**](https://nyanime.qzz.io)</kbd>&nbsp;&nbsp;
<kbd>[📦 **Releases**](https://github.com/AnjishnuSengupta/ny-cli/releases)</kbd>&nbsp;&nbsp;
<kbd>[🐛 **Report Bug**](https://github.com/AnjishnuSengupta/ny-cli/issues)</kbd>

<br/>

</div>

---

<br/>

## 🎯 What's New in v7.0.1
- **🔄 Built-in In-CLI Updater**: Instant upgrade to latest release via `ny-cli update` or `ny-cli -U` with registry version checking, background process synchronization, and symlink maintenance.
- **🔐 Direct Localhost Authentication**: Web sign-in callback server at `http://localhost:8080/` allowing immediate Firebase authentication without remote domain whitelisting.
- **🎨 Cover Art & Details Layout Polish**: Flexible spacing and word wrapping preventing synopsis text from overlapping anime cover art across all terminal dimensions.
- **🚀 High-Speed Direct Anime Downloads**: One-click download of single episodes (<kbd>d</kbd> / <kbd>Enter</kbd>) or full seasons (<kbd>a</kbd>) using FFmpeg with HLS segment unmasking (`-allowed_segment_extensions ALL`) and automatic `yt-dlp` fallback.
- **⚡ Offline Local Playback Auto-Detection**: Instant playback of downloaded episodes without buffering or internet access. When you choose to watch an episode, NY-CLI automatically checks your local downloads folder first.
- **📥 Interactive Download Queue & Manager**: Live progress bars, transfer speeds (`speed=...x`), and keyboard controls (<kbd>b</kbd> to return, <kbd>c</kbd> to clear finished tasks), with a dedicated **Downloads** menu shortcut.
- **⛩️ AniKoto & Kitsu Resilient Metadata Engine**: Recovers canonical episode counts (e.g. all 1,180+ One Piece episodes) with 0% overlap between Trending, Airing, and Seasonal releases.
- **🖥️ Universal Cross-Platform Installers**: Automated one-line curl installers for Linux, macOS, and Windows PowerShell with automated dependency resolution (mpv, ffmpeg).
- **🩺 Doctor Suite Diagnostics**: Upgraded `ny-cli doctor` verifying node runtime, UI environment, DoH DNS layers, media tools, and network endpoints.

<br/>

---

<br/>

## ✨ Features

<div align="center">

```
╭─────────────────────────────────────────────────────────────────╮
│                                                                 │
│   🎬  STREAMING          👤  EXPERIENCE        🔧  TECHNICAL    │
│   ───────────────        ───────────────       ───────────────  │
│                                                                 │
│   ▸ HLS & Embed Streams  ▸ User Accounts       ▸ React/Ink UI   │
│   ▸ Multi-Provider       ▸ Watch History       ▸ Node >=20.18   │
│   ▸ Episode Downloader   ▸ Cloud Sync          ▸ AniList GQL    │
│   ▸ Offline Playback     ▸ Continue Watching   ▸ Kitsu & AniKoto│
│   ▸ Artwork Display      ▸ 97% Auto-Advance    ▸ mpv IPC & VLC  │
│   ▸ Sub/Dub Selection    ▸ Profile System      ▸ Firebase Auth  │
│                                                                 │
╰─────────────────────────────────────────────────────────────────╯
```

</div>

<br/>

<details>
<summary><b>📺 Streaming & Download Highlights</b></summary>

<br/>

| Feature | Description |
|:--------|:------------|
| **📥 High-Speed Downloads** | Download episodes directly as MP4 via FFmpeg or yt-dlp |
| **⚡ Instant Local Playback** | Plays downloaded episodes locally from disk with zero network latency |
| **🎙️ Sub/Dub Selection** | Choose sub or dub per anime — preference saved and synced to cloud |
| **🖼️ Anime Artwork** | Cover art displayed in terminal via ink-picture while browsing |
| **⏱️ Watch Progress** | mpv IPC tracks your position to the second |
| **✨ 97% Auto-Advance** | Episode 97%+ watched? Next episode auto-loads |
| **🔄 Multi-Provider** | Resolves across Senshi, HiAnime, AniPub, Owais, and Allanime |
| **🎚️ Player Support** | MPV (recommended) or VLC — auto-detected |

</details>

<details>
<summary><b>👤 User Features</b></summary>

<br/>

| Feature | Description |
|:--------|:------------|
| **🔐 Browser Auth** | Automated OAuth login via nyanime.qzz.io with strict loopback state validation |
| **📜 Watch History** | Track all watched episodes with timestamps and progress |
| **☁️ Cloud Sync** | Seamless sync with watch time to nyanime.qzz.io |
| **📍 Continue Watching** | Resume exactly where you left off |
| **📚 Trending & Airing** | Browse trending, airing, and seasonal anime with distinct catalogs |
| **🔍 Fast Search** | Instant anime search with SWR caching and fallback to Kitsu / AniKoto |

</details>

<details>
<summary><b>🎨 UI Features</b></summary>

<br/>

| Feature | Description |
|:--------|:------------|
| **🌊 Animated Banner** | Color gradient animation on the NY-CLI logo |
| **💫 Ripple Effects** | Ripple animation on selection |
| **✨ Shimmer Text** | Rainbow shimmer effect on username |
| **🔄 Pulsing Elements** | Pulsing status indicators |
| **📊 Progress Badges** | Visual % watched badges in Continue Watching |
| **🎯 Centered Layout** | Menu and content centered like the banner |
| **🔲 ASCII Icons** | Consistent box borders with fixed-width icons |

</details>

<br/>

---

<br/>

## 📡 Metadata & Streaming Architecture

| Component | Service | Role | Status |
|:----------|:--------|:-----|:------:|
| **Primary Metadata** | **AniList GraphQL** | Search, trending, synopsis, genres, artwork | ✅ Active |
| **Secondary Metadata** | **AniKoto API** | High-accuracy episode lists, search, trending fallback | ✅ Active |
| **Tertiary Metadata** | **Kitsu API** | Fallback search, episode metadata, multi-season counts | ✅ Active |
| **Quaternary Metadata** | **Jikan API v4** | Fallback search, anime details | ⚠️ Secondary |
| **Stream: HiAnime** | HLS Resolver | Direct HLS stream & subtitle extraction | ✅ Active |
| **Stream: Senshi** | Stream Resolver | Direct MAL ID HLS stream resolution | ✅ Active |
| **Stream: AniPub** | Embed / HLS Resolver | Secondary embed & stream playback | ✅ Active |
| **Stream: Owais** | Stream Resolver | Direct embed stream resolver | ⚠️ Secondary |
| **Stream: Allanime** | Stream Resolver | Dynamic key multi-source mirror resolution | ⚠️ Optional |

<br/>

---

<br/>

## 🚀 Installation & Quick Start

### Prerequisites

| Dependency | Required | Description |
|:-----------|:--------:|:------------|
| **Node.js** | ✅ | Version **>= 20.18.0** |
| **npm** | ✅ | Package manager |
| **mpv** | ✅ | Video player (recommended) or VLC |
| **ffmpeg** | ✅ | Stream downloader and muxer (recommended) |
| **yt-dlp** | ⬜ | Optional fallback downloader |

<br/>

### 🐧 Linux Installation

#### Method 1: One-Line Direct Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.sh | sh
```
*The installer automatically detects your distribution (`apt`, `dnf`, `pacman`, `zypper`, `apk`), installs `mpv` and `ffmpeg`, installs `ny-cli` globally, ensures the binary is symlinked to your PATH, and runs a diagnostic health check.*

#### Method 2: Via npm

```bash
npm install -g @anjishnusengupta/ny-cli
```

Install system media tools using your package manager:
```bash
# Ubuntu / Debian / Mint / Pop!_OS
sudo apt install mpv ffmpeg

# Fedora / RHEL
sudo dnf install mpv ffmpeg

# Arch Linux / Manjaro
sudo pacman -S mpv ffmpeg

# openSUSE
sudo zypper install mpv ffmpeg

# Alpine
sudo apk add mpv ffmpeg
```

<br/>

### 🍎 macOS Installation

#### Method 1: One-Line Direct Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.sh | sh
```
*Installs `mpv` and `ffmpeg` via Homebrew, installs `ny-cli` globally via npm, and runs diagnostics.*

#### Method 2: Via npm & Homebrew

```bash
brew install mpv ffmpeg
npm install -g @anjishnusengupta/ny-cli
```

<br/>

### 🪟 Windows Installation

#### Method 1: One-Line Direct Install via PowerShell (Recommended)

Open **PowerShell** as Administrator or standard user and run:

```powershell
irm https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.ps1 | iex
```

Or using `curl`:
```cmd
curl -fsSL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.ps1 -o install.ps1 && powershell -ExecutionPolicy Bypass -File install.ps1
```
*The Windows installer checks Node.js, installs `mpv` and `ffmpeg` via `winget`, installs `ny-cli` globally, configures environment PATH, and runs the diagnostics check.*

#### Method 2: Via npm & winget

```cmd
# 1. Install media dependencies
winget install mpv.mpv Gyan.FFmpeg

# 2. Install ny-cli globally
npm install -g @anjishnusengupta/ny-cli
```

<br/>

---

<br/>

## 💻 Usage & CLI Commands

```bash
# Start interactive terminal UI
ny-cli

# Update ny-cli to the latest release
ny-cli update
ny-cli -U

# Check for updates without installing
ny-cli update --check

# Run system, media player & network diagnostics
ny-cli doctor
ny-cli --doctor

# Display help and command summary
ny-cli --help

# Check installed version
ny-cli --version

# Stop running background backend process
ny-cli --stop
```

<br/>

---

<br/>

## 🎮 Controls & Shortcuts

### Menu & Search Navigation

| Key | Action |
|:---:|:-------|
| `↑` / `k` | Move up |
| `↓` / `j` | Move down |
| `Enter` | Select / Confirm |
| `b` / `←` / `Esc` | Go back |
| `1-9` | Quick select item number |
| `q` | Quit |

### Episode Selection & Downloading

| Key | Action |
|:---:|:-------|
| `Enter` | Stream selected episode (or download in download mode) |
| `d` | Download selected episode |
| `a` | Download **all** episodes in queue |
| `b` / `Esc` | Return to anime details |

### Download Queue Screen

| Key | Action |
|:---:|:-------|
| `b` / `Esc` | Return to previous screen (downloads continue in background) |
| `c` | Clear completed and failed downloads |

### During Playback (mpv)

| Key | Action |
|:---:|:-------|
| `Space` | Play / Pause |
| `←` / `→` | Seek ±5s |
| `↑` / `↓` | Seek ±60s |
| `f` | Fullscreen toggle |
| `v` | Toggle subtitles |
| `m` | Mute audio |
| `q` | Quit player and save watch progress |

<br/>

---

<br/>

## ⚙️ Configuration & Diagnostics

### Configuration File (`config.json`)

ny-cli stores user settings in standard XDG directories:
- **Linux**: `~/.config/ny-cli/config.json`
- **macOS**: `~/Library/Application Support/ny-cli/config.json`
- **Windows**: `%APPDATA%\ny-cli\config.json`

Example `config.json`:
```json
{
  "relayUrl": "https://ny-cli-relay.your-subdomain.workers.dev",
  "proxyUrl": "http://127.0.0.1:8080",
  "dnsMode": "cloudflare-doh",
  "port": 43201,
  "host": "127.0.0.1"
}
```

### Supported Settings & Environment Variables

| Config Field | Environment Variable | Default | Description |
|:-------------|:---------------------|:--------|:------------|
| `relayUrl` | `NY_RELAY_URL` | *(none)* | URL of self-hosted Cloudflare Worker relay for AniList/Jikan |
| `proxyUrl` | `NY_PROXY` / `HTTPS_PROXY` | *(none)* | HTTP/HTTPS proxy to route backend requests through |
| `dnsMode` | `NY_DNS` | `cloudflare-doh` | DNS resolution mode: `cloudflare-doh`, `cloudflare-udp`, or `system` |
| `port` | `PORT` / `NY_PORT` | `43201` | Backend port (auto-increments if port is occupied) |
| `host` | `HOST` | `127.0.0.1` | Backend bind address |

<br/>

### Diagnostics (`ny-cli --doctor`)

Run `ny-cli --doctor` anytime to verify your environment:
```
ny-cli doctor
=============
Package Version: 7.0.1
Node.js:         v22.23.1 (supported: >=20.18.0)
UI Runtime:      node (v22.23.1)
Config Dir:      ~/.config/ny-cli (writable)
State Dir:       ~/.local/state/ny-cli (writable)
DNS Mode:        cloudflare-doh

Checking DNS Layers:
  DoH (1.1.1.1):   PASS
  DoH (8.8.8.8):   PASS
  UDP (Cloudflare): PASS
  Active (cloudflare-doh): PASS via cloudflare-doh:1.1.1.1

Checking Backend:
  Backend:       PASS - started successfully on port 43299 (reported v7.0.1)

Checking Network Endpoints:
  AniList:       reachable (200 OK)
  AniKoto:       reachable (200 OK)
  Kitsu:         reachable (200 OK)
  Jikan:         reachable (200 OK)
  Relay:         not configured (optional)

Checking Media Tools:
  mpv:           installed (mpv v0.41.0)
  vlc:           installed (VLC v3.0.24)
  ffmpeg:        installed (ffmpeg v8.1.3)
  yt-dlp:        installed (2026.08.19) (optional)

-----------------------------
Doctor result: PASS (all required checks passed)
```

<br/>

---

<br/>

## 🛠️ Tech Stack

<div align="center">

| Layer | Technologies |
|:-----:|:-------------|
| **CLI & Terminal** | ![React](https://img.shields.io/badge/React_18-61dafb?style=flat-square&logo=react&logoColor=black) ![Ink](https://img.shields.io/badge/Ink_5-333333?style=flat-square) ![TypeScript](https://img.shields.io/badge/TSX-3178c6?style=flat-square&logo=typescript&logoColor=white) |
| **Backend & Runtime** | ![Node.js](https://img.shields.io/badge/Node.js_%3E%3D20.18.0-339933?style=flat-square&logo=nodedotjs&logoColor=white) ![Express](https://img.shields.io/badge/Express_5-000000?style=flat-square&logo=express&logoColor=white) ![Undici](https://img.shields.io/badge/Undici_6-gray?style=flat-square) |
| **Metadata APIs** | ![AniList](https://img.shields.io/badge/AniList_GraphQL-02A9FF?style=flat-square&logo=anilist&logoColor=white) ![Kitsu](https://img.shields.io/badge/Kitsu_API-FD755C?style=flat-square) ![AniKoto](https://img.shields.io/badge/AniKoto_API-6366f1?style=flat-square) |
| **Authentication & Sync** | ![Firebase](https://img.shields.io/badge/Firebase_Auth-FFCA28?style=flat-square&logo=firebase&logoColor=black) ![NyAnime](https://img.shields.io/badge/nyanime.qzz.io-a855f7?style=flat-square) |
| **Playback & Media** | ![mpv](https://img.shields.io/badge/mpv-690D76?style=flat-square&logo=mpv&logoColor=white) ![ffmpeg](https://img.shields.io/badge/ffmpeg-007808?style=flat-square&logo=ffmpeg&logoColor=white) ![yt-dlp](https://img.shields.io/badge/yt--dlp-red?style=flat-square) |

</div>

<br/>

---

<br/>

## 📁 Project Structure

```
ny-cli/
├── bin/
│   └── ny-cli.mjs              # Node launcher (CLI entrypoint)
├── providers/
│   ├── index.mjs               # Stream resolver aggregator
│   ├── hianime.mjs             # HiAnime HLS stream decoder
│   ├── anipub.mjs              # Anipub embed stream provider
│   ├── senshi.mjs              # Senshi MAL ID stream provider
│   ├── owais.mjs               # Owais API stream resolver
│   ├── allanime.mjs            # Mirror provider interface
│   └── anidb.mjs               # AniDB / AniLab provider
├── relay/
│   ├── worker.mjs              # Cloudflare Worker relay script
│   └── wrangler.toml           # Worker deployment configuration
├── scripts/
│   ├── pre-commit.sh           # Local Git pre-commit hook (bundle & version checks)
│   ├── sync-version.js         # Single-source version synchronizer
│   ├── check-versions.mjs      # Repository-wide version assertion
│   ├── check-bundle.mjs        # Production bundle verifier
│   └── build-bundle.mjs        # Fallback UI bundler (esbuild)
├── backend.mjs                 # Express 5 hardened API server
├── cli-terminal.tsx            # React / Ink terminal user interface
├── cli-terminal-fallback.mjs   # Standalone bundled UI fallback
├── config.mjs                  # XDG configuration loader
├── dns.mjs                     # DNS-over-HTTPS (DoH) engine
├── doctor.mjs                  # System diagnostics & health check
├── net.mjs                     # Undici HTTP client wrapper
├── paths.mjs                   # Cross-platform XDG file paths
├── skip.mjs                    # AniSkip v2 chapter integration
├── swr-cache.mjs               # Stale-While-Revalidate memory cache
├── install.sh                  # Universal Linux & macOS installer
├── install.ps1                 # Universal Windows PowerShell installer
├── package.json                # npm manifest and dependencies
├── PKGBUILD                    # Arch Linux AUR package specification
├── ny-cli.spec                 # RPM package specification
├── debian/                     # Debian / Ubuntu deb package files
└── LICENSE                     # MIT License
```

<br/>

---

<br/>

## 🤝 Contributing

Contributions are welcome! Please make sure that all changes adhere to:
1. Node.js >= 20.18.0 runtime compatibility
2. Bundle synchronization (`npm run check:bundle` or `node scripts/check-bundle.mjs`)
3. Version consistency across packaging manifests (`npm run check:versions`)

Before committing changes, install the git pre-commit hook from `scripts/pre-commit.sh`:
```bash
cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

If you modify `cli-terminal.tsx` or any module inlined into the fallback bundle (`config.mjs`, `paths.mjs`), rebuild the fallback bundle with:
```bash
npm run build:fallback
```

<br/>

---

<br/>

## 📜 License

This project is licensed under the **MIT License**.

<div align="center">

### ⚠️ Disclaimer

<samp>
This is an educational project. No video content is hosted on our servers.<br/>
All streams are fetched from third-party sources. Use responsibly.
</samp>

<br/>

**Made with 💜 by [Anjishnu](https://github.com/AnjishnuSengupta)**

</div>
