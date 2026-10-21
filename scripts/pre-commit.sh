#!/usr/bin/env bash
set -e

# Run bundle check to ensure cli-terminal-fallback.mjs matches source
node scripts/check-bundle.mjs

# Run version consistency check across manifests
node scripts/check-versions.mjs
