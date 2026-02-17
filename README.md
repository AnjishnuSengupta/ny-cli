<div align="center">

# ✦ NY-CLI

<samp>ネコアニメ CLI — Watch Anime from Your Terminal</samp>

<br/>

[![Version](https://img.shields.io/badge/v3.0.0-a855f7?style=flat-square&label=release)](https://github.com/AnjishnuSengupta/ny-cli/releases)
[![npm](https://img.shields.io/npm/v/@anjishnusengupta/ny-cli?style=flat-square&color=22c55e&label=npm)](https://www.npmjs.com/package/@anjishnusengupta/ny-cli)
[![License](https://img.shields.io/badge/MIT-3b82f6?style=flat-square&label=license)](LICENSE)
[![Stars](https://img.shields.io/github/stars/AnjishnuSengupta/ny-cli?style=flat-square&color=fbbf24)](https://github.com/AnjishnuSengupta/ny-cli/stargazers)
[![Instagram](https://img.shields.io/badge/anjishnu.prolly-E4405F?style=flat-square&logo=instagram&logoColor=white)](https://www.instagram.com/anjishnu.prolly)

<br/>

<kbd>[🌐 **NyAnime Website**](https://nyanime.tech)</kbd>&nbsp;&nbsp;
<kbd>[📦 **Releases**](https://github.com/AnjishnuSengupta/ny-cli/releases)</kbd>&nbsp;&nbsp;
<kbd>[🐛 **Report Bug**](https://github.com/AnjishnuSengupta/ny-cli/issues)</kbd>

<br/>

</div>

---

<br/>

## 🎯 What's New in v3.0.0

<table>
<tr>
<td>🔧</td>
<td><b>Self-Hosted Scraping</b></td>
<td>Uses the <code>aniwatch</code> npm package directly — no external API dependency</td>
</tr>
<tr>
<td>⚡</td>
<td><b>Parallel Server Racing</b></td>
<td><code>Promise.any()</code> races HD-1, HD-2, StreamTape & StreamSB simultaneously for fastest response</td>
</tr>
<tr>
<td>🔄</td>
<td><b>Sub/Dub Fallback</b></td>
<td>Automatically falls back from sub to dub if all sub servers fail</td>
</tr>
<tr>
<td>🚫</td>
<td><b>Zero External APIs</b></td>
<td>Everything runs locally via Node.js — no cold-start delays or API rate limits</td>
</tr>
<tr>
<td>☁️</td>
<td><b>Cloud Sync</b></td>
<td>Watch history syncs between CLI and <a href="https://nyanime.tech">nyanime.tech</a> web app</td>
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
│   ▸ HLS Streaming        ▸ User Accounts       ▸ POSIX Shell    │
│   ▸ Multi-Server         ▸ Watch History       ▸ Node.js 18+    │
│   ▸ Sub/Dub Toggle       ▸ Cloud Sync          ▸ aniwatch pkg   │
│   ▸ Skip Intro           ▸ Continue Watch      ▸ Self-Hosted    │
│   ▸ Auto Subtitles       ▸ Random Anime        ▸ XDG Dirs       │
│   ▸ MPV/VLC/IINA         ▸ Profile System      ▸ Zero Config    │
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
| **🔄 Multi-Server Racing** | Races HD-1, HD-2, StreamTape, StreamSB in parallel via `Promise.any()` |
| **⏭️ Skip Intro** | Press `s` during intro to skip — uses API-provided timestamps |
| **📝 Multi-Language Subs** | Auto-selects English, with all available languages loaded for switching |
| **🔁 Sub/Dub Fallback** | If all sub servers fail, automatically retries with dub |
| **🎚️ Player Support** | MPV (recommended), VLC, IINA — auto-detected or configurable |

</details>

<details>
<summary><b>👤 User Features</b></summary>

<br/>

| Feature | Description |
|:--------|:------------|
| **🔐 Browser Auth** | Login via nyanime.tech — just paste your User ID |
| **📜 Watch History** | Track all watched episodes with timestamps |
| **☁️ Cloud Sync** | Seamless sync between CLI and nyanime.tech website |
| **📍 Continue Watching** | Resume from exactly where you left off |
| **🎲 Random Mode** | Discover new anime with random selection |
| **🔍 Quick Search** | Search directly from command line or interactive menu |

</details>

<br/>

---

<br/>

## 🖥️ Terminal Demo

<div align="center">

```
╔══════════════════════════════════════════╗
║                                          ║
║   $ ny-cli "one piece"                   ║
║                                          ║
║   Searching for 'one piece'...           ║
║   1) One Piece (TV, 1120 eps)            ║
║   2) One Piece Film: Red (Movie)         ║
║                                          ║
║   Select [1-20]: 1                       ║
║   Loading episodes...                    ║
║   Episode [1-1120]: 1120                 ║
║                                          ║
║   ▸ Starting playback...                 ║
║     One Piece - Episode 1120             ║
║                                          ║
╚══════════════════════════════════════════╝
```

</div>

<br/>

---

<br/>

## 🚀 Quick Start

<br/>

### Prerequisites

- **Node.js** 18+
- **npm**
- **mpv** (recommended video player)

<br/>

### Installation

```bash
# One-line install
curl -sL https://raw.githubusercontent.com/AnjishnuSengupta/ny-cli/main/install.sh | sh
```

```bash
# Or via npm
npm install -g @anjishnusengupta/ny-cli
```

<details>
<summary><b>📥 Manual Install</b></summary>

<br/>

```bash
# Clone the repository
git clone https://github.com/AnjishnuSengupta/ny-cli.git
cd ny-cli

# Install dependencies
npm install --production

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
# Interactive mode
ny-cli

# Quick search
ny-cli "attack on titan"

# Direct search
ny-cli -s "one piece"

# Continue watching
ny-cli -c

# Trending anime
ny-cli -t

# Random anime
ny-cli -r

# Login for cloud sync
ny-cli -l

# Help
ny-cli -h
```

<br/>

---

<br/>

## 🛠️ Tech Stack

<br/>

<div align="center">

| Layer | Technologies |
|:-----:|:-------------|
| **CLI** | ![Shell](https://img.shields.io/badge/POSIX_Shell-4EAA25?style=flat-square&logo=gnubash&logoColor=white) ![Sed](https://img.shields.io/badge/sed/grep-333333?style=flat-square) |
| **Backend** | ![Node.js](https://img.shields.io/badge/Node.js_18+-339933?style=flat-square&logo=nodedotjs&logoColor=white) ![ES Modules](https://img.shields.io/badge/ES_Modules-f7df1e?style=flat-square&logo=javascript&logoColor=black) |
| **Scraping** | ![Aniwatch](https://img.shields.io/badge/aniwatch_npm-a855f7?style=flat-square) ![HiAnime](https://img.shields.io/badge/hianimez.to-25A3E2?style=flat-square) |
| **Sync** | ![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black) ![NyAnime](https://img.shields.io/badge/nyanime.tech-a855f7?style=flat-square) |
| **Players** | ![mpv](https://img.shields.io/badge/mpv-690D76?style=flat-square&logo=mpv&logoColor=white) ![VLC](https://img.shields.io/badge/VLC-FF8800?style=flat-square&logo=vlcmediaplayer&logoColor=white) |

</div>

<br/>

---

<br/>

## 📁 Project Structure

```
ny-cli/
├── 📄 ny-cli              # Main CLI script (POSIX shell)
├── 📄 backend.mjs          # Node.js scraping backend (aniwatch)
├── 📄 package.json          # npm dependencies
├── 📄 install.sh            # One-line installer
├── 📂 debian/               # Debian packaging
│   ├── changelog
│   ├── control
│   ├── install
│   └── rules
├── 📄 PKGBUILD             # Arch Linux AUR package
├── 📄 ny-cli.spec           # RPM spec file
└── 📄 LICENSE               # MIT License
```

<br/>

---

<br/>

## 🎮 Controls

### During Playback (mpv)

| Key | Action |
|:---:|:-------|
| `Space` | Play / Pause |
| `←` / `→` | Seek ±5s |
| `↑` / `↓` | Seek ±60s |
| `s` | Skip intro |
| `f` | Fullscreen |
| `v` | Toggle subtitles |
| `m` | Mute |
| `q` | Quit |

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
| 🌐 **Website** | [nyanime.tech](https://nyanime.tech) |
| 🖥️ **Web App** | [github.com/AnjishnuSengupta/nyanime](https://github.com/AnjishnuSengupta/nyanime) |
| 📦 **npm** | [@anjishnusengupta/ny-cli](https://www.npmjs.com/package/@anjishnusengupta/ny-cli) |
| 📚 **aniwatch** | [ghoshRitesh12/aniwatch](https://github.com/ghoshRitesh12/aniwatch) |

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
