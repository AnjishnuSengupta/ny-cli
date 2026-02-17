#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// NY-CLI Backend — Direct scraping via aniwatch npm package
// No external API dependency — self-hosted, just like nyanime.tech
// ═══════════════════════════════════════════════════════════════════════════

import { HiAnime } from "aniwatch";

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

        // Pre-check available servers (just like nyanime server.js)
        let availableServers = [];
        try {
          const serverData = await hianime.getEpisodeServers(episodeId);
          const serverList =
            category === "dub" ? serverData.dub : serverData.sub;
          availableServers = (serverList || []).map((s) => s.serverName);
        } catch {
          availableServers = ["hd-1", "hd-2"];
        }

        // Known extractors the aniwatch library supports
        const knownExtractors = ["streamtape", "streamsb", "hd-1", "hd-2"];
        const serversToTry = knownExtractors.filter((s) =>
          availableServers.includes(s)
        );
        if (serversToTry.length === 0) serversToTry.push("hd-1");

        let lastError = null;
        const PER_SERVER_TIMEOUT = 15000;

        for (const server of serversToTry) {
          try {
            const srcData = await Promise.race([
              hianime.getEpisodeSources(episodeId, server, category),
              new Promise((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `${server} timed out after ${PER_SERVER_TIMEOUT / 1000}s`
                      )
                    ),
                  PER_SERVER_TIMEOUT
                )
              ),
            ]);

            if (srcData?.sources?.length > 0) {
              srcData._usedServer = server;
              srcData._availableServers = availableServers;
              srcData._triedServers = serversToTry;
              console.log(JSON.stringify({ success: true, data: srcData }));
              return;
            }
          } catch (err) {
            lastError = err;
          }
        }

        // All servers failed for this category — if sub, try dub
        if (category === "sub") {
          try {
            const serverData = await hianime.getEpisodeServers(episodeId);
            const dubServers = (serverData.dub || []).map((s) => s.serverName);
            const dubToTry = knownExtractors.filter((s) =>
              dubServers.includes(s)
            );
            if (dubToTry.length === 0) dubToTry.push("hd-1");

            for (const server of dubToTry) {
              try {
                const srcData = await Promise.race([
                  hianime.getEpisodeSources(episodeId, server, "dub"),
                  new Promise((_, reject) =>
                    setTimeout(
                      () => reject(new Error(`${server} dub timed out`)),
                      PER_SERVER_TIMEOUT
                    )
                  ),
                ]);

                if (srcData?.sources?.length > 0) {
                  srcData._usedServer = server;
                  srcData._usedCategory = "dub";
                  console.log(JSON.stringify({ success: true, data: srcData }));
                  return;
                }
              } catch (err) {
                lastError = err;
              }
            }
          } catch {
            // ignore server fetch error
          }
        }

        console.log(
          JSON.stringify({
            error: lastError?.message || "All servers failed",
          })
        );
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
