<div align="center">

# ✦ NY-CLI

<samp>ネコアニメ CLI — Watch Anime from Your Terminal</samp>

<br/>

[![Version](https://img.shields.io/badge/v6.0.5-a855f7?style=flat-square&label=release)](https://github.com/AnjishnuSengupta/ny-cli/releases)
[![npm](https://img.shields.io/npm/v/@anjishnusengupta/ny-cli?style=flat-square&color=22c55e&label=npm)](https://www.npmjs.com/package/@anjishnusengupta/ny-cli)
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

## 🎯 What's New in v6.0.5

- **📥 Batch Downloading**: Download single or all episodes via `d` and `a` hotkeys with an integrated UI progress queue!
- **🔄 Auto-Advance**: Intelligently prompts you to start the next episode when you've watched 90% of the current one.
- **🐛 Resume Bugfix**: Fixed an issue where the player wouldn't resume from the last known timestamp properly.
- **🔌 Local Image Proxy**: Circumvents blocked CDNs by proxying thumbnails automatically.

<table>
<tr>
<td>🔄</td>
<td><b>Backend Rewrite</b></td>
<td>Fully rewritten streaming chain utilizing AniList, Jikan, MegaPlay, and AllAnime fallback.</td>
</tr>
<tr>
<td>🌐</td>
<td><b>Browser Fallback</b></td>
<td>Detects embed-type streaming sources and securely opens them via <code>xdg-open</code> in your default browser.</td>
</tr>
<tr>
<td>🖼️</td>
<td><b>Picture Layout Fixes</b></td>
<td>Fixed <code>ink-picture</code> component dimensions for reliable artwork rendering in terminal.</td>
</tr>
<tr>
<td>🔐</td>
<td><b>Auth Improvements</b></td>
<td>Bypassed Firebase OAuth whitelisting limits and implemented reliable token delivery.</td>
</tr>
</table>

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
│   ▸ HLS Streaming        ▸ User Accounts       ▸ React/Ink UI   │
│   ▸ Multi-Server         ▸ Watch History       ▸ Node.js 18+    │
│   ▸ Sub/Dub Select       ▸ Cloud Sync          ▸ AllAnime API   │
│   ▸ Artwork Display      ▸ Continue Watch      ▸ Jikan API      │
│   ▸ Progress Tracking    ▸ 97% Auto-Skip       ▸ mpv IPC        │
│   ▸ MPV/VLC Support      ▸ Profile System      ▸ Firebase       │
│                                                                 │
╰─────────────────────────────────────────────────────────────────╯
```

</div>

<br/>

<details>
<summary><b>📺 Streaming Highlights</b></summary>

<br/>

| Feature | Description |
|:--------|:------------|
| **🎙️ Sub/Dub Selection** | Choose sub or dub per anime — preference saved and synced to cloud |
| **🖼️ Anime Artwork** | Cover art displayed in terminal via ink-picture while browsing |
| **⏱️ Watch Progress** | mpv IPC tracks your position to the second |
| **✨ 97% Auto-Advance** | Episode 97%+ watched? Next episode auto-loads |
| **🔄 Multi-Server** | Races HD-1, HD-2, StreamTape sources in parallel |
| **🎚️ Player Support** | MPV (recommended), VLC — auto-detected |

</details>

<details>
<summary><b>👤 User Features</b></summary>

<br/>

| Feature | Description |
|:--------|:------------|
| **🔐 Browser Auth** | Fully automated OAuth-style login via nyanime.qzz.io — secure and seamless! |
| **📜 Watch History** | Track all watched episodes with timestamps and progress |
| **☁️ Cloud Sync** | Seamless sync with watch time to nyanime.qzz.io |
| **📍 Continue Watching** | Resume exactly where you left off |
| **📚 Trending** | Browse currently trending anime |
| **🔍 Quick Search** | Fast anime search with artwork preview |

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

## 🖥️ Terminal Demo

<div align="center">

```
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║     ███╗   ██╗██╗   ██╗       ██████╗██╗     ██╗               ║
║     ████╗  ██║╚██╗ ██╔╝      ██╔════╝██║     ██║               ║
║     ██╔██╗ ██║ ╚████╔╝ █████╗██║     ██║     ██║               ║
║     ██║╚██╗██║  ╚██╔╝  ╚════╝██║     ██║     ██║               ║
║     ██║ ╚████║   ██║         ╚██████╗███████╗██║               ║
║     ╚═╝  ╚═══╝   ╚═╝          ╚═════╝╚══════╝╚═╝               ║
║              ⟨ Your Gateway to Anime Streaming ⟩               ║
║                                                                ║
║  ╭──────────────────────────────────────────╮                  ║
║  │ Welcome, Anjishnu!                       │                  ║
║  ├──────────────────────────────────────────┤                  ║
║  │ ▸ 1) [S] Search                          │                  ║
║  │   2) [T] Trending                        │                  ║
║  │   3) [>] Continue Watching               │                  ║
║  │   4) [P] Profile                         │                  ║
║  │   5) [?] Help                            │                  ║
║  │   6) [X] Exit                            │                  ║
║  ╰──────────────────────────────────────────╯                  ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
```

</div>

<br/>

---

<br/>

## 🚀 Quick Start

<br/>

### Prerequisites

| Dependency | Required | Description |
|:-----------|:--------:|:------------|
| **Node.js** | ✅ | Version 18+ |
| **npm** | ✅ | Comes with Node.js |
| **mpv** | ✅ | Video player (or VLC) |
| **ink-picture** | ⬜ | Terminal image renderer (for artwork) |
| **bun** | ⬜ | For best UI experience |

<br/>

### One-Line Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.sh | sh
```

This auto-detects your OS and offers to install all dependencies!

<br/>

### Install via npm

```bash
npm install -g @anjishnusengupta/ny-cli
```

Then install system dependencies manually:

<details>
<summary><b>📦 System Dependencies by OS</b></summary>

<br/>

**🐧 Ubuntu / Debian**
```bash
sudo apt install mpv ink-picture
```

**🎩 Fedora / RHEL**
```bash
sudo dnf install mpv ink-picture
```

**🔷 Arch Linux**
```bash
sudo pacman -S mpv ink-picture
```

**🍎 macOS**
```bash
brew install mpv ink-picture
```

**Optional: Install Bun for best UI**
```bash
curl -fsSL https://bun.sh/install | bash
```

</details>

<br/>

<details>
<summary><b>📥 Manual Install</b></summary>

<br/>

```bash
# Clone the repository
git clone https://github.com/AnjishnuSengupta/ny-cli.git
cd ny-cli

# Install dependencies
npm install

# Make executable and install
chmod +x ny-cli
sudo ln -sf "$(pwd)/ny-cli" /usr/local/bin/ny-cli
```

</details>

<details>
<summary><b>🐧 Arch Linux (AUR)</b></summary>

<br/>

```bash
yay -S ny-cli
# or
paru -S ny-cli
```

</details>

<br/>

### Usage

```bash
# Interactive mode (recommended)
ny-cli

# For help
ny-cli -h
```

<br/>

---

<br/>

## 🎮 Controls

### Menu Navigation

| Key | Action |
|:---:|:-------|
| `↑` / `k` | Move up |
| `↓` / `j` | Move down |
| `Enter` | Select |
| `b` / `←` / `Esc` | Go back |
| `1-9` | Quick select (when shown) |
| `q` | Quit |

### During Playback (mpv)

| Key | Action |
|:---:|:-------|
| `Space` | Play / Pause |
| `←` / `→` | Seek ±5s |
| `↑` / `↓` | Seek ±60s |
| `f` | Fullscreen |
| `v` | Toggle subtitles |
| `m` | Mute |
| `q` | Quit |

<br/>

---

<br/>

## 🛠️ Tech Stack

<br/>

<div align="center">

| Layer | Technologies |
|:-----:|:-------------|
| **CLI** | ![React](https://img.shields.io/badge/React-61dafb?style=flat-square&logo=react&logoColor=black) ![Ink](https://img.shields.io/badge/Ink_5-333333?style=flat-square) ![TypeScript](https://img.shields.io/badge/TSX-3178c6?style=flat-square&logo=typescript&logoColor=white) |
| **Backend** | ![Node.js](https://img.shields.io/badge/Node.js_18+-339933?style=flat-square&logo=nodedotjs&logoColor=white) ![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white) |
| **APIs** | ![AllAnime](https://img.shields.io/badge/AllAnime-06b6d4?style=flat-square) ![Jikan](https://img.shields.io/badge/Jikan_API-25A2E2?style=flat-square) ![Anipy](https://img.shields.io/badge/Anipy-ff69b4?style=flat-square) |
| **Sync** | ![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black) ![NyAnime](https://img.shields.io/badge/nyanime.qzz.io-a855f7?style=flat-square) |
| **Media** | ![mpv](https://img.shields.io/badge/mpv-690D76?style=flat-square&logo=mpv&logoColor=white) ![ink-picture](https://img.shields.io/badge/ink-picture-333333?style=flat-square) ![webtorrent](https://img.shields.io/badge/WebTorrent-f04b36?style=flat-square) |

</div>

<br/>

---

<br/>

## 📁 Project Structure

```
ny-cli/
├── 📄 ny-cli                    # Main launcher script
├── 📄 cli-terminal.tsx          # Ink/React terminal UI (main)
├── 📄 cli-terminal-fallback.mjs # Fallback UI (no Bun)
├── 📄 backend.mjs               # Express API server
├── 📄 package.json              # npm package config
├── 📄 install.sh                # Universal installer
├── 📂 debian/                   # Debian packaging
├── 📄 PKGBUILD                  # Arch Linux AUR
├── 📄 ny-cli.spec               # RPM spec
└── 📄 LICENSE                   # MIT License
```

<br/>

---

<br/>

## 🤝 Contributing

<br/>

Contributions are welcome! Here's how you can help:

```bash
# 1. Fork the repository

# 2. Create your feature branch
git checkout -b feature/amazing-feature

# 3. Commit your changes
git commit -m "feat: add amazing feature"

# 4. Push to the branch
git push origin feature/amazing-feature

# 5. Open a Pull Request
```

<br/>

---

<br/>

## 🔗 Links & Resources

<br/>

<div align="center">

| | |
|:-:|:-:|
| 🌐 **Website** | [nyanime.qzz.io](https://nyanime.qzz.io) |
| 🖥️ **Web App** | [github.com/AnjishnuSengupta/nyanime](https://github.com/AnjishnuSengupta/nyanime) |
| 📦 **npm** | [@anjishnusengupta/ny-cli](https://www.npmjs.com/package/@anjishnusengupta/ny-cli) |
| 📚 **AllAnime** | [allanime.day](https://allanime.day) |
| 🎨 **Jikan API** | [jikan.moe](https://jikan.moe) |

</div>

<br/>

---

<br/>

## 📜 License

<br/>

<div align="center">

This project is licensed under the **MIT License**.

Use freely. Give credit. Build cool things. 💜

</div>

<br/>

---

<br/>

<div align="center">

### ⚠️ Disclaimer

<samp>
This is an educational project. No video content is hosted on our servers.<br/>
All streams are fetched from third-party sources. Use responsibly.
</samp>

<br/>
<br/>

---

<br/>

<img src="https://capsule-render.vercel.app/api?type=waving&color=a855f7&height=100&section=footer" width="100%" />

<br/>

<samp>

*"In a world full of filler episodes, be the main arc."* ✦

</samp>

<br/>

**Made with 💜 by [Anjishnu](https://github.com/AnjishnuSengupta)**

[![Instagram](https://img.shields.io/badge/@anjishnu.prolly-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://www.instagram.com/anjishnu.prolly)

<br/>

⭐ Star this repo if you found it useful!

</div>
