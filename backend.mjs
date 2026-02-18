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
function customLookup(hostname, options, callback) {
  if (typeof options === "function") { callback = options; options = {}; }
  dns.resolve6(hostname, (err6, addr6) => {
    if (!err6 && addr6 && addr6.length > 0) {
      if (options.all) {
        return callback(null, addr6.map(a => ({ address: a, family: 6 })));
      }
      return callback(null, addr6[0], 6);
    }
    dns.resolve4(hostname, (err4, addr4) => {
      if (!err4 && addr4 && addr4.length > 0) {
        if (options.all) {
          return callback(null, addr4.map(a => ({ address: a, family: 4 })));
        }
        return callback(null, addr4[0], 4);
      }
      dns.lookup(hostname, options, callback);
    });
  });
}

// Replace global agents so ALL http/https requests use our DNS
http.globalAgent = new http.Agent({ lookup: customLookup });
https.globalAgent = new https.Agent({ lookup: customLookup });

// Dynamic import so aniwatch picks up patched global agents
const { HiAnime } = await import("aniwatch");

const hianime = new HiAnime.Scraper();

const action = process.argv[2];

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
        const data = await hianime.search(query, page);
        console.log(JSON.stringify({ success: true, data }));
        break;
      }

      // ── Home / Trending ──
      case "home": {
        const data = await hianime.getHomePage();
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
        const data = await hianime.getInfo(animeId);
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
        const data = await hianime.getEpisodes(animeId);
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
        const data = await hianime.getEpisodeServers(episodeId);
        console.log(JSON.stringify({ success: true, data }));
        break;
      }

      // ── Episode Sources (with multi-server fallback) ──
      case "sources": {
        const episodeId = process.argv[3];
        const category = process.argv[4] || "sub";
        if (!episodeId) {
          console.log(JSON.stringify({ error: "Missing episode id" }));
          process.exit(1);
        }

        // Faster timeout — self-hosted scraping is local, no cold-start
        const PER_SERVER_TIMEOUT = 8000;

        // Helper: try a single server with timeout
        const tryServer = (server, cat) =>
          Promise.race([
            hianime.getEpisodeSources(episodeId, server, cat),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`${server} timed out`)), PER_SERVER_TIMEOUT)
            ),
          ]).then((srcData) => {
            if (srcData?.sources?.length > 0) {
              srcData._usedServer = server;
              srcData._usedCategory = cat;
              return srcData;
            }
            throw new Error(`${server}: no sources`);
          });

        // Preferred order: hd-1/hd-2 are fastest, then others
        const preferredOrder = ["hd-1", "hd-2", "streamtape", "streamsb"];

        // Race all servers in parallel — first success wins
        const raceServers = async (cat) => {
          let availableServers;
          try {
            const serverData = await Promise.race([
              hianime.getEpisodeServers(episodeId),
              new Promise((_, reject) => setTimeout(() => reject(new Error("server list timeout")), 5000)),
            ]);
            const serverList = cat === "dub" ? serverData.dub : serverData.sub;
            availableServers = (serverList || []).map((s) => s.serverName);
          } catch {
            availableServers = ["hd-1", "hd-2"];
          }

          const serversToTry = preferredOrder.filter((s) => availableServers.includes(s));
          if (serversToTry.length === 0) serversToTry.push("hd-1");

          // Promise.any resolves as soon as ANY server succeeds
          return Promise.any(serversToTry.map((s) => tryServer(s, cat))).then((srcData) => {
            srcData._availableServers = availableServers;
            srcData._triedServers = serversToTry;
            return srcData;
          });
        };

        try {
          const srcData = await raceServers(category);
          console.log(JSON.stringify({ success: true, data: srcData }));
          return;
        } catch {
          // All servers failed for this category
        }

        // If sub failed, try dub as fallback
        if (category === "sub") {
          try {
            const srcData = await raceServers("dub");
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
        const data = await hianime.searchSuggestions(query);
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
        const data = await hianime.getCategoryAnime(name, page);
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
