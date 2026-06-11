/**
 * index.js — Local development server
 *
 * Handles catalog, meta, and stream requests dynamically.
 * For production: run `node build.js` and host docs/ on GitHub Pages.
 */

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const { getAllFiles, resolveUrl }  = require("./telegram");
const { lookupById, searchByTitle } = require("./omdb");
const { rankFiles, extractEpisodeTag, normalise } = require("./matcher");
const config = require("./config");

// ─── Manifest ─────────────────────────────────────────────────────────────────

const manifest = {
  id:          "community.telegram.streams.local",
  version:     "2.0.0",
  name:        `📲 ${config.CHANNEL_USERNAME} (local)`,
  description: `Stream videos from Telegram channel ${config.CHANNEL_USERNAME}`,
  logo:        "https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg",
  resources:   ["catalog", "meta", "stream"],
  types:       ["movie", "series"],
  idPrefixes:  ["tt"],
  catalogs: [
    {
      id:   "tg-movies",
      type: "movie",
      name: `📲 ${config.CHANNEL_USERNAME} Movies`,
      extra: [{ name: "search", isRequired: false }],
    },
    {
      id:   "tg-series",
      type: "series",
      name: `📲 ${config.CHANNEL_USERNAME} Series`,
      extra: [{ name: "search", isRequired: false }],
    },
  ],
};

const builder = new addonBuilder(manifest);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function guessType(file) {
  const text = normalise(`${file.file_name} ${file.caption}`);
  if (extractEpisodeTag(text)) return "series";
  if (/(season|episode|\bep\b)/i.test(text)) return "series";
  return "movie";
}

function guessTitle(file) {
  let name = file.caption || file.file_name || "";
  name = name.replace(/\.(mkv|mp4|avi|mov|m4v|webm|ts|wmv)$/i, "");
  name = name.replace(/s\d{1,2}e\d{1,2}/gi, "");
  name = name.replace(/\b(19|20)\d{2}\b/, "");
  name = name.replace(/\b(1080p|720p|4k|uhd|bluray|webrip|hdrip|x264|x265|hevc)\b/gi, "");
  name = name.replace(/tt\d{7,8}/gi, "");
  name = name.replace(/[._\-]/g, " ").replace(/\s+/g, " ").trim();
  return name;
}

function extractImdbId(file) {
  const m = (`${file.file_name} ${file.caption}`).match(/tt\d{7,8}/i);
  return m ? m[0].toLowerCase() : null;
}

// ─── Catalog handler ──────────────────────────────────────────────────────────

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  console.log(`\n[catalog] type=${type} id=${id} extra=${JSON.stringify(extra)}`);
  const search = extra?.search?.toLowerCase() || null;

  const allFiles = await getAllFiles();
  const seen     = new Set();
  const metas    = [];

  for (const file of allFiles) {
    const fileType = guessType(file);
    if (fileType !== type) continue;

    let meta = null;
    const embeddedId = extractImdbId(file);
    if (embeddedId && !seen.has(embeddedId)) {
      meta = await lookupById(embeddedId);
    }
    if (!meta) {
      const title = guessTitle(file);
      if (!title || title.length < 2) continue;
      const year = (file.file_name + file.caption).match(/\b(19|20)\d{2}\b/)?.[0] || null;
      meta = await searchByTitle(title, year, type);
    }
    if (!meta || seen.has(meta.id)) continue;
    seen.add(meta.id);

    // Filter by search if provided
    if (search && !meta.name.toLowerCase().includes(search)) continue;

    metas.push({
      id:          meta.id,
      type:        meta.type,
      name:        meta.name,
      poster:      meta.poster,
      releaseInfo: meta.year,
      imdbRating:  meta.imdbRating,
      genres:      meta.genres,
      description: meta.description,
    });
  }

  console.log(`[catalog] Returning ${metas.length} items`);
  return { metas };
});

// ─── Meta handler ─────────────────────────────────────────────────────────────

builder.defineMetaHandler(async ({ type, id }) => {
  console.log(`\n[meta] type=${type} id=${id}`);
  const meta = await lookupById(id);
  if (!meta) return { meta: null };
  return { meta };
});

// ─── Stream handler ───────────────────────────────────────────────────────────

builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`\n[stream] type=${type} id=${id}`);
  const [imdbId, season, episode] = id.split(":");

  const meta    = await lookupById(imdbId);
  const title   = meta?._title || imdbId;
  const year    = meta?._year  || null;

  const allFiles = await getAllFiles();
  const matches  = rankFiles(allFiles, { title, year, season, episode }, 5);

  const streams = [];
  for (const file of matches) {
    const url = await resolveUrl(file.file_id);
    if (!url) continue;
    const sizeMB = file.size ? `${(file.size / 1024 / 1024).toFixed(0)} MB` : "";
    streams.push({
      name:  "📲 Telegram",
      title: `${file.file_name}${sizeMB ? `\n${sizeMB}` : ""}`,
      url,
      behaviorHints: { notWebReady: false },
    });
  }

  console.log(`[stream] ${streams.length} stream(s)`);
  return { streams };
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });

console.log(`
╔══════════════════════════════════════════════════════╗
║   📲 Stremio Telegram Addon — Local Dev              ║
╠══════════════════════════════════════════════════════╣
║   Addon URL : http://127.0.0.1:${PORT}/manifest.json  ║
║   Channel   : ${config.CHANNEL_USERNAME.padEnd(38)}║
╠══════════════════════════════════════════════════════╣
║   Catalogs  : Movies + Series rows on home screen    ║
║   Posters   : OMDB / IMDb                            ║
╚══════════════════════════════════════════════════════╝
`);
