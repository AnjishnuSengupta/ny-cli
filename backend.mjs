#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// NY-CLI Backend — Direct scraping via aniwatch npm package
// No external API dependency — self-hosted, just like nyanime.tech
// ═══════════════════════════════════════════════════════════════════════════

import dns from "node:dns";
import https from "node:https";
import http from "node:http";

// Use public DNS (Cloudflare + Google) to bypass ISP-level domain blocking.
// dns.resolve{4,6} uses these servers; dns.lookup uses the OS resolver.
dns.setServers(["1.1.1.1", "8.8.8.8", "1.0.0.1", "8.8.4.4"]);

// Custom lookup: prefer IPv6 (bypasses SNI-based DPI blocking on many ISPs),
// fall back to IPv4 via dns.resolve4, then OS resolver as last resort.
// Note: IPv4-only consistently fails due to ISP blocking; IPv6 is required.
function customLookup(hostname, options, callback) {
  if (typeof options === "function") { callback = options; options = {}; }

  // Cache resolved addresses per hostname for the lifetime of this process
  const cacheKey = hostname;
  if (customLookup._cache && customLookup._cache[cacheKey]) {
    const cached = customLookup._cache[cacheKey];
    if (options.all) {
      return callback(null, [{ address: cached.address, family: cached.family }]);
    }
    return callback(null, cached.address, cached.family);
  }

  dns.resolve6(hostname, (err6, addr6) => {
    if (!err6 && addr6 && addr6.length > 0) {
      if (!customLookup._cache) customLookup._cache = {};
      customLookup._cache[cacheKey] = { address: addr6[0], family: 6 };
      if (options.all) {
        return callback(null, addr6.map(a => ({ address: a, family: 6 })));
      }
      return callback(null, addr6[0], 6);
    }
    dns.resolve4(hostname, (err4, addr4) => {
      if (!err4 && addr4 && addr4.length > 0) {
        if (!customLookup._cache) customLookup._cache = {};
        customLookup._cache[cacheKey] = { address: addr4[0], family: 4 };
        if (options.all) {
          return callback(null, addr4.map(a => ({ address: a, family: 4 })));
        }
        return callback(null, addr4[0], 4);
      }
      dns.lookup(hostname, options, callback);
    });
  });
}

// Replace global agents so ALL http/https requests use our DNS.
// keepAlive reduces connection overhead for multiple requests to the same host.
http.globalAgent = new http.Agent({ lookup: customLookup, keepAlive: true });
https.globalAgent = new https.Agent({ lookup: customLookup, keepAlive: true });

// Dynamic import so aniwatch picks up patched global agents
const { HiAnime } = await import("aniwatch");

const hianime = new HiAnime.Scraper();

const action = process.argv[2];

// Retry helper: retries an async fn up to `retries` times with a delay between attempts.
async function withRetry(fn, { retries = 2, delay = 1000, label = "" } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

async function main() {
  try {
    switch (action) {
      // ── Search ──
      case "search": {
        const query = process.argv[3];
        const page = parseInt(process.argv[4]) || 1;
        if (!query) {
          console.log(JSON.stringify({ error: "Missing search query" }));
          process.exit(1);
        }
        const data = await withRetry(() => hianime.search(query, page), { label: "search" });
        console.log(JSON.stringify({ success: true, data }));
        break;
      }

      // ── Home / Trending ──
      case "home": {
        const data = await withRetry(() => hianime.getHomePage(), { label: "home" });
        console.log(JSON.stringify({ success: true, data }));
        break;
      }

      // ── Anime Info ──
      case "info": {
        const animeId = process.argv[3];
        if (!animeId) {
          console.log(JSON.stringify({ error: "Missing anime id" }));
          process.exit(1);
        }
        const data = await withRetry(() => hianime.getInfo(animeId), { label: "info" });
        console.log(JSON.stringify({ success: true, data }));
        break;
      }

      // ── Episodes ──
      case "episodes": {
        const animeId = process.argv[3];
        if (!animeId) {
          console.log(JSON.stringify({ error: "Missing anime id" }));
          process.exit(1);
        }
        const data = await withRetry(() => hianime.getEpisodes(animeId), { label: "episodes" });
        console.log(JSON.stringify({ success: true, data }));
        break;
      }

      // ── Episode Servers ──
      case "servers": {
        const episodeId = process.argv[3];
        if (!episodeId) {
          console.log(JSON.stringify({ error: "Missing episode id" }));
          process.exit(1);
        }
        const data = await withRetry(() => hianime.getEpisodeServers(episodeId), { label: "servers" });
        console.log(JSON.stringify({ success: true, data }));
        break;
      }

      // ── Episode Sources (with sequential server fallback + retry) ──
      case "sources": {
        const episodeId = process.argv[3];
        const category = process.argv[4] || "sub";
        if (!episodeId) {
          console.log(JSON.stringify({ error: "Missing episode id" }));
          process.exit(1);
        }

        // Increased timeout — source extraction can take 10-15s on slow connections
        const PER_SERVER_TIMEOUT = 20000;

        // Helper: try a single server with timeout + retry
        const tryServer = async (server, cat) => {
          const srcData = await Promise.race([
            withRetry(
              () => hianime.getEpisodeSources(episodeId, server, cat),
              { retries: 1, delay: 800, label: `sources-${server}` }
            ),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`${server} timed out`)), PER_SERVER_TIMEOUT)
            ),
          ]);
          if (srcData?.sources?.length > 0) {
            srcData._usedServer = server;
            srcData._usedCategory = cat;
            return srcData;
          }
          throw new Error(`${server}: no sources`);
        };

        // Preferred order: hd-1/hd-2 are fastest, then others
        const preferredOrder = ["hd-1", "hd-2", "streamtape", "streamsb"];

        // Try servers SEQUENTIALLY to avoid rate-limiting (403 errors)
        const tryServersSequentially = async (cat) => {
          let availableServers;
          try {
            const serverData = await Promise.race([
              withRetry(
                () => hianime.getEpisodeServers(episodeId),
                { retries: 1, delay: 500, label: "server-list" }
              ),
              new Promise((_, reject) => setTimeout(() => reject(new Error("server list timeout")), 8000)),
            ]);
            const serverList = cat === "dub" ? serverData.dub : serverData.sub;
            availableServers = (serverList || []).map((s) => s.serverName);
          } catch {
            availableServers = ["hd-1", "hd-2"];
          }

          const serversToTry = preferredOrder.filter((s) => availableServers.includes(s));
          if (serversToTry.length === 0) serversToTry.push("hd-1");

          // Try each server one at a time — avoids rate-limiting
          let lastError;
          for (const server of serversToTry) {
            try {
              const srcData = await tryServer(server, cat);
              srcData._availableServers = availableServers;
              srcData._triedServers = serversToTry;
              return srcData;
            } catch (err) {
              lastError = err;
              // Small delay between servers to avoid triggering rate limits
              await new Promise(r => setTimeout(r, 300));
            }
          }
          throw lastError || new Error("No servers available");
        };

        try {
          const srcData = await tryServersSequentially(category);
          console.log(JSON.stringify({ success: true, data: srcData }));
          return;
        } catch {
          // All servers failed for this category
        }

        // If sub failed, try dub as fallback
        if (category === "sub") {
          try {
            const srcData = await tryServersSequentially("dub");
            console.log(JSON.stringify({ success: true, data: srcData }));
            return;
          } catch {
            // dub also failed
          }
        }

        console.log(JSON.stringify({ error: "All servers failed" }));
        process.exit(1);
        break;
      }

      // ── Search Suggestions ──
      case "suggestions": {
        const query = process.argv[3];
        if (!query) {
          console.log(JSON.stringify({ error: "Missing query" }));
          process.exit(1);
        }
        const data = await withRetry(() => hianime.searchSuggestions(query), { label: "suggestions" });
        console.log(JSON.stringify({ success: true, data }));
        break;
      }

      // ── Category ──
      case "category": {
        const name = process.argv[3];
        const page = parseInt(process.argv[4]) || 1;
        if (!name) {
          console.log(JSON.stringify({ error: "Missing category name" }));
          process.exit(1);
        }
        const data = await withRetry(() => hianime.getCategoryAnime(name, page), { label: "category" });
        console.log(JSON.stringify({ success: true, data }));
        break;
      }

      default:
        console.log(
          JSON.stringify({ error: `Unknown action: ${action || "(none)"}` })
        );
        process.exit(1);
    }
  } catch (err) {
    console.log(JSON.stringify({ error: err.message || "Scraper error" }));
    process.exit(1);
  }
}

main();
