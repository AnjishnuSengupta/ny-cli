#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// NY-CLI Backend — Direct scraping via aniwatch npm package
// No external API dependency — self-hosted, just like nyanime.tech
// ═══════════════════════════════════════════════════════════════════════════

import dns from "node:dns";
import https from "node:https";
import http from "node:http";
import os from "node:os";

// ── Safety net: prevent unhandled errors from crashing the process ──────
// The aniwatch library can emit socket errors that aren't caught internally.
process.on("uncaughtException", (err) => {
  // Silently ignore connection errors during retry/fallback — they're expected
  if (["ENETUNREACH", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "EAI_AGAIN"].includes(err.code)) {
    return;
  }
  // For other errors, output JSON so the shell script can parse it
  console.log(JSON.stringify({ error: err.message || "Unexpected error" }));
  process.exit(1);
});

// Use public DNS (Cloudflare + Google) to bypass ISP-level domain blocking.
// Include BOTH IPv4 and IPv6 DNS server addresses so resolution works on:
//   - IPv4-only WiFi / hotspots
//   - IPv6-only carrier networks (T-Mobile, etc.)
//   - Dual-stack environments
// Order: put the family matching the system first to minimise latency.
const DNS_V4 = ["1.1.1.1", "8.8.8.8", "1.0.0.1", "8.8.4.4"];
const DNS_V6 = ["2606:4700:4700::1111", "2001:4860:4860::8888", "2606:4700:4700::1001", "2001:4860:4860::8844"];

// ── Detect system IPv6 connectivity ─────────────────────────────────────
// Check if the system has a routable (non-link-local, non-loopback) IPv6 address.
// If there's no IPv6 address, connecting to IPv6 endpoints will fail with ENETUNREACH.
function systemHasIPv6() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const addr of interfaces[name]) {
        if (
          addr.family === "IPv6" &&
          !addr.internal &&
          !addr.address.startsWith("fe80") &&   // skip link-local
          !addr.address.startsWith("::1")        // skip loopback
        ) {
          return true;
        }
      }
    }
  } catch {}
  return false;
}

const HAS_IPV6 = systemHasIPv6();

// ── Configure DNS servers based on system network capabilities ────────
// On IPv6-only networks, IPv4 DNS servers (1.1.1.1) are unreachable.
// On IPv4-only WiFi, IPv6 DNS servers are unreachable.
// Order the server list so reachable servers come first.
try {
  const servers = HAS_IPV6
    ? [...DNS_V6, ...DNS_V4]   // IPv6 DNS first, then IPv4 fallback
    : [...DNS_V4, ...DNS_V6]; // IPv4 DNS first (most common)
  dns.setServers(servers);
} catch {
  // If setServers fails (unusual), leave the OS defaults in place.
}

// ── DNS resolution with timeout ─────────────────────────────────────────
// Wraps dns.resolve{4,6} with a timeout to prevent hanging on unresponsive DNS.
function resolveWithTimeout(resolver, hostname, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), timeoutMs);
    resolver(hostname, (err, addrs) => {
      clearTimeout(timer);
      resolve(err || !addrs ? [] : addrs);
    });
  });
}

// ── Custom DNS lookup (Happy Eyeballs compatible) ───────────────────────
// When called with `all: true` (by Node.js autoSelectFamily / Happy Eyeballs),
// returns addresses from BOTH families so Node can race connections and pick
// whichever connects first.  When called for a single address, returns the
// best-available family based on system capability.
function customLookup(hostname, options, callback) {
  if (typeof options === "function") { callback = options; options = {}; }

  const wantAll = !!options.all;

  if (wantAll) {
    // ── Happy Eyeballs path: resolve both families in parallel ──
    Promise.all([
      HAS_IPV6 ? resolveWithTimeout(dns.resolve6.bind(dns), hostname) : Promise.resolve([]),
      resolveWithTimeout(dns.resolve4.bind(dns), hostname),
    ]).then(([v6, v4]) => {
      const results = [];
      // IPv6 first (preferred when available), then IPv4
      for (const a of v6) results.push({ address: a, family: 6 });
      for (const a of v4) results.push({ address: a, family: 4 });

      if (results.length > 0) {
        return callback(null, results);
      }
      // All custom DNS failed — fall back to OS resolver
      dns.lookup(hostname, { all: true }, callback);
    }).catch(() => {
      dns.lookup(hostname, { all: true }, callback);
    });
  } else {
    // ── Single-address path ──
    const tryIPv4 = () => {
      resolveWithTimeout(dns.resolve4.bind(dns), hostname).then((v4) => {
        if (v4.length > 0) return callback(null, v4[0], 4);
        // Last resort: OS resolver
        dns.lookup(hostname, options, callback);
      }).catch(() => dns.lookup(hostname, options, callback));
    };

    if (HAS_IPV6) {
      resolveWithTimeout(dns.resolve6.bind(dns), hostname).then((v6) => {
        if (v6.length > 0) return callback(null, v6[0], 6);
        tryIPv4();
      }).catch(() => tryIPv4());
    } else {
      tryIPv4();
    }
  }
}

// ── Replace global HTTP agents ──────────────────────────────────────────
// autoSelectFamily enables Node.js "Happy Eyeballs" (RFC 6555): when the
// lookup returns both IPv4 and IPv6 addresses, Node races connections and
// uses whichever family connects first.  This ensures the app works on
// IPv4-only WiFi, IPv6-only networks, and dual-stack setups alike.
const agentOptions = {
  lookup: customLookup,
  keepAlive: true,
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: 2500, // ms before trying the next family
};
http.globalAgent = new http.Agent(agentOptions);
https.globalAgent = new https.Agent(agentOptions);

// Dynamic import so aniwatch picks up patched global agents
const { HiAnime } = await import("aniwatch");

const hianime = new HiAnime.Scraper();

const action = process.argv[2];

// Retry helper: retries an async fn up to `retries` times with a delay between attempts.
// On transient network errors (ENETUNREACH, ECONNRESET, etc.) it retries automatically.
async function withRetry(fn, { retries = 3, delay = 1200, label = "" } = {}) {
  const TRANSIENT_CODES = new Set([
    "ENETUNREACH", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
    "EHOSTUNREACH", "EAI_AGAIN", "EPIPE", "ERR_SOCKET_CONNECTION_TIMEOUT",
    "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "ENOTFOUND",
  ]);
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isTransient = TRANSIENT_CODES.has(err.code) ||
        (err.cause && TRANSIENT_CODES.has(err.cause.code)) ||
        /timeout|ENETUNREACH|ECONNR|socket/i.test(err.message);
      if (i < retries) {
        // Longer back-off for transient network errors
        const backoff = isTransient ? delay * (i + 1) : delay;
        await new Promise(r => setTimeout(r, backoff));
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
