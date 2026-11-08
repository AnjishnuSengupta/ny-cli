# ny-cli Packaging Assets

This directory contains standalone packaging manifests, metadata, and guides for distributing `ny-cli` across various platforms and package managers.

## Directory Structure

```text
packaging/
├── copr/           # Fedora / RHEL / CentOS via Fedora COPR (RPM)
│   ├── ny-cli.spec # RPM spec file
│   └── README.md   # COPR setup and build instructions
├── homebrew/       # macOS & Linux via Homebrew Tap
│   ├── Formula/
│   │   └── ny-cli.rb # Homebrew Formula
│   └── README.md   # Homebrew tap setup and audit guide
├── scoop/          # Windows via Scoop Bucket
│   ├── bucket/
│   │   └── ny-cli.json # Scoop manifest
│   └── README.md   # Scoop bucket setup and testing guide
└── README.md       # This file
```

## Supported Platforms

| Platform | Channel | Status | Maintainer File |
| :--- | :--- | :--- | :--- |
| **Arch Linux** | AUR (`yay` / `paru`) | Active | `PKGBUILD` |
| **Fedora / RHEL** | COPR / RPM | Prepared | `packaging/copr/ny-cli.spec` |
| **Debian / Ubuntu** | APT / `.deb` | Prepared | `debian/` |
| **macOS / Linux** | Homebrew Tap | Prepared | `packaging/homebrew/Formula/ny-cli.rb` |
| **Windows** | Scoop | Prepared | `packaging/scoop/bucket/ny-cli.json` |
| **Cross-platform** | npm | Active | `package.json` |

