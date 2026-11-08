# Windows Scoop Bucket Guide for ny-cli

This directory provides the Scoop app manifest for installing and updating `ny-cli` on Windows via Scoop.

## Repository Setup

1. Create a GitHub repository named `scoop-bucket` (or `scoop-ny`) under your GitHub user account: `https://github.com/AnjishnuSengupta/scoop-bucket`.
2. Place the manifest at `bucket/ny-cli.json` in that repository.

## Release Maintenance

When releasing version `7.1.0`:
1. Obtain the SHA-256 checksum of the published tarball from npm:
   ```powershell
   (Invoke-RestMethod "https://registry.npmjs.org/@anjishnusengupta/ny-cli/-/ny-cli-7.1.0.tgz" | Get-FileHash -Algorithm SHA256).Hash.ToLower()
   ```
2. Update `version` and `hash` in `bucket/ny-cli.json`.
3. Commit and push the manifest to your scoop repository.

## Local Testing

Test the manifest locally on Windows using Scoop:

```powershell
# 1. Install Scoop (if not already installed)
irm get.scoop.sh | iex

# 2. Add local manifest or test directly
scoop install ./bucket/ny-cli.json

# 3. Test running the binary
ny-cli --version
```

## User Installation

Once the bucket is published:

```powershell
scoop bucket add anjishnu https://github.com/AnjishnuSengupta/scoop-bucket
scoop install anjishnu/ny-cli
```

