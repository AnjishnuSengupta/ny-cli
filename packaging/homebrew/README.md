# Homebrew Tap Packaging Guide for ny-cli

This directory provides the Homebrew formula for distributing `ny-cli` to macOS and Linux users via a dedicated Homebrew Tap.

## Repository Setup

1. Create a GitHub repository named `homebrew-tap` (or `homebrew-ny`) under your GitHub user account: `https://github.com/AnjishnuSengupta/homebrew-tap`.
2. Place the formula at `Formula/ny-cli.rb` in that repository.

## Release Maintenance

When releasing version `7.1.0`:
1. Obtain the SHA-256 checksum of the published tarball from npm:
   ```bash
   curl -sL https://registry.npmjs.org/@anjishnusengupta/ny-cli/-/ny-cli-7.1.0.tgz | shasum -a 256
   ```
2. Update the `url` and `sha256` lines in `Formula/ny-cli.rb`.
3. Commit and push the formula to `homebrew-tap`.

## Local Testing & Audit

Test the formula locally on macOS or Linux with Homebrew:

```bash
# Audit formula syntax and conventions
brew audit --strict Formula/ny-cli.rb

# Test installation from source
brew install --build-from-source Formula/ny-cli.rb

# Run formula tests
brew test Formula/ny-cli.rb
```

## User Installation

Once the tap is published:

```bash
brew tap AnjishnuSengupta/tap
brew install ny-cli
```

