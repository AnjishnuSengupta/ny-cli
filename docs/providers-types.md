# Provider Architecture and Interface Specification

## Overview

The `ny-cli` streaming architecture organizes anime sources into standardized provider modules categorized by **Tiers**. Each provider module exports standard metadata and a unified `resolve(context)` function.

---

## Provider Tiers

| Tier | Name | Target Protocol | Description |
|:----:|:-----|:----------------|:------------|
| **1** | **Direct Playable** | HLS (`.m3u8`), MP4 | Directly playable in video players (`mpv`, `vlc`) with full IPC, seeking, and subtitles. |
| **2** | **Web Embeds** | Embed iframe (`https://...`) | Fallback sources opened in browser or headless player when Tier 1 is unavailable. |
| **3** | **Torrents** | Magnet, `.torrent` | P2P streaming (reserved for torrent resolver fallback, e.g., Nyaa). |

---

## Provider Module Exports

Every provider module must export:

```typescript
export const name: string;
export const tier: 1 | 2 | 3;
export async function resolve(context: ResolveContext): Promise<Candidate[]>;
```

### Context Parameter (`ResolveContext`)

```typescript
interface ResolveContext {
  malId?: number | null;               // MyAnimeList ID (if known)
  anilistId?: number | null;           // AniList ID (if known)
  titles: {
    english?: string;                  // English title (e.g., "Cowboy Bebop")
    romaji?: string;                   // Romaji title (e.g., "Cowboy Bebop")
    native?: string;                   // Japanese/original title (e.g., "カウボーイビバップ")
  };
  year?: number | null;                // Release year
  episodeNumber: number;               // 1-based episode number
  audioKind: 'sub' | 'dub';            // Requested audio type
  signal?: AbortSignal;                // Cancellation signal
}
```

### Return Value (`Candidate[]`)

Each candidate returned represents an ordered playback stream option:

```typescript
interface Candidate {
  url: string;                         // Direct stream URL or embed URL
  type: 'hls' | 'mp4' | 'embed';       // Playback stream type
  referer?: string;                    // HTTP Referer required for playback
  headers?: Record<string, string>;    // Custom HTTP headers (User-Agent, Origin, etc.)
  subtitleTracks?: Array<{             // Subtitle tracks (WebVTT, ASS)
    label: string;
    src: string;
    default?: boolean;
    kind?: string;
  }>;
  audioKind: 'sub' | 'dub';            // Audio track type ('sub' or 'dub')
  quality?: string;                    // Stream quality or label (e.g., "1080p", "HiAnime (HLS)")
  provider: string;                    // Provider identifier (matches export name)
  tier: number;                        // Provider tier (1, 2, or 3)
}
```

### Error Handling

If a provider cannot resolve any playable candidates, it must either:
- Throw an `Error` containing a concise failure reason string (e.g., `"No search results on HiAnime"`, `"Episode 12 not found"`, `"Stream decryption failed"`).
- Return an empty list `[]`.
