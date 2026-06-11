/**
 * build.js
 *
 * Generates static Stremio addon files into docs/ for GitHub Pages.
 *
 * What it produces:
 *   docs/manifest.json                  ← addon manifest (with catalogs)
 *   docs/catalog/movie/tg-movies.json   ← movies catalog
 *   docs/catalog/series/tg-series.json  ← series catalog
 *   docs/meta/movie/<imdbId>.json       ← per-item metadata
 *   docs/meta/series/<imdbId>.json
 *   docs/stream/movie/<imdbId>.json     ← stream links
 *   docs/stream/series/<imdbId>.json
 *   docs/index.html                     ← install page
 */

const fs   = require("fs");
const path = require("path");

const { getAllFiles, resolveUrl } = require("./telegram");
const { lookupById, searchByTitle } = require("./omdb");
const { rankFiles, extractEpisodeTag, normalise } = require("./matcher");
const config = require("./config");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function write(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, content);
  console.log(`  ✔ ${filePath}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const PAGES_URL = (process.env.PAGES_URL || "").replace(/\/$/, "");

if (!PAGES_URL) {
  console.error(
    "\n❌  PAGES_URL is not set!\n" +
    "    Add it as a GitHub Secret: PAGES_URL = https://USER.github.io/REPO\n"
  );
  process.exit(1);
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

function buildManifest() {
  return {
    id:          "community.telegram.streams.static",
    version:     "2.0.0",
    name:        `📲 ${config.CHANNEL_USERNAME} Streams`,
    description: `Stream videos from Telegram channel ${config.CHANNEL_USERNAME}. Updated hourly.`,
    logo:        "https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg",

    resources: ["catalog", "meta", "stream"],
    types:     ["movie", "series"],
    idPrefixes: ["tt"],

    catalogs: [
      {
        id:   "tg-movies",
        type: "movie",
        name: `📲 ${config.CHANNEL_USERNAME} Movies`,
        extra: [
          { name: "search", isRequired: false },
          { name: "skip",   isRequired: false },
        ],
      },
      {
        id:   "tg-series",
        type: "series",
        name: `📲 ${config.CHANNEL_USERNAME} Series`,
        extra: [
          { name: "search", isRequired: false },
          { name: "skip",   isRequired: false },
        ],
      },
    ],

    behaviorHints: {
      configurable:          false,
      configurationRequired: false,
    },
  };
}

// ─── Guess type from file metadata ────────────────────────────────────────────

function guessType(file) {
  const text = normalise(`${file.file_name} ${file.caption}`);
  // Episode tag → series
  if (extractEpisodeTag(text)) return "series";
  // Keywords
  if (/(season|episode|s\d{1,2}e\d{1,2}|\bep\b|\bepisode\b)/i.test(text)) return "series";
  return "movie";
}

// ─── Extract title from filename (best-effort) ────────────────────────────────

function guessTitle(file) {
  let name = file.caption || file.file_name || "";
  // Strip extension
  name = name.replace(/\.(mkv|mp4|avi|mov|m4v|webm|ts|wmv)$/i, "");
  // Strip episode tag
  name = name.replace(/s\d{1,2}e\d{1,2}/gi, "");
  // Strip year
  name = name.replace(/\b(19|20)\d{2}\b/, "");
  // Strip quality tags
  name = name.replace(/\b(1080p|720p|4k|uhd|bluray|webrip|hdrip|x264|x265|hevc|aac|dts)\b/gi, "");
  // Strip IMDb id
  name = name.replace(/tt\d{7,8}/gi, "");
  // Normalise separators
  name = name.replace(/[._\-]/g, " ").replace(/\s+/g, " ").trim();
  return name;
}

// ─── Extract embedded IMDb ID ─────────────────────────────────────────────────

function extractImdbId(file) {
  const text = `${file.file_name} ${file.caption}`;
  const m = text.match(/tt\d{7,8}/i);
  return m ? m[0].toLowerCase() : null;
}

// ─── Build stream JSON for one item ──────────────────────────────────────────

async function buildStreamJson(type, imdbId, allFiles, meta) {
  const query   = { title: meta._title, year: meta._year };
  const matches = rankFiles(allFiles, query, 5);
  if (!matches.length) return;

  const streams = [];
  for (const file of matches) {
    const url = await resolveUrl(file.file_id);
    if (!url) continue;
    const sizeMB = file.size ? `${(file.size / 1024 / 1024).toFixed(0)} MB` : "";
    const res    = file.width && file.height ? `${file.width}×${file.height}` : "";
    const detail = [sizeMB, res].filter(Boolean).join(" · ");
    streams.push({
      name:  "📲 Telegram",
      title: `${file.file_name}${detail ? `\n${detail}` : ""}`,
      url,
      behaviorHints: { notWebReady: false },
    });
  }

  if (streams.length) {
    write(`docs/stream/${type}/${imdbId}.json`, { streams });
  }
}

// ─── Main build ───────────────────────────────────────────────────────────────

async function build() {
  console.log("\n🔨 Building static Stremio addon (with catalogs)...\n");
  console.log(`   Channel  : ${config.CHANNEL_USERNAME}`);
  console.log(`   Pages URL: ${PAGES_URL}\n`);

  // 1. Fetch all files from Telegram
  console.log("📥 Fetching files from Telegram channel...");
  let allFiles;
  try {
    allFiles = await getAllFiles();
  } catch (err) {
    console.error("❌ Telegram fetch failed:", err.message);
    process.exit(1);
  }
  console.log(`   ${allFiles.length} video file(s) found.\n`);

  // 2. Resolve metadata for each file
  console.log("🔍 Resolving metadata via OMDB...");
  const movieMetas  = [];   // { meta, file }
  const seriesMetas = [];

  const seen = new Set();   // avoid duplicate IMDb IDs

  for (const file of allFiles) {
    // Try embedded IMDb ID first
    let meta = null;
    const embeddedId = extractImdbId(file);

    if (embeddedId && !seen.has(embeddedId)) {
      meta = await lookupById(embeddedId);
      await sleep(250);   // respect OMDB rate limit
    }

    // Fall back to title search
    if (!meta) {
      const title = guessTitle(file);
      if (!title || title.length < 2) continue;

      const type  = guessType(file);
      const year  = (file.file_name + file.caption).match(/\b(19|20)\d{2}\b/)?.[0] || null;

      const cacheKey = `${title.toLowerCase()}:${year}:${type}`;
      if (seen.has(cacheKey)) continue;
      seen.add(cacheKey);

      console.log(`   Searching: "${title}" (${year || "?"}, ${type})`);
      meta = await searchByTitle(title, year, type);
      await sleep(300);
    }

    if (!meta) continue;
    if (seen.has(meta.id)) continue;
    seen.add(meta.id);

    console.log(`   ✔ ${meta.id} — ${meta.name} (${meta.year}) [${meta.type}]`);

    // Write per-item meta JSON
    write(`docs/meta/${meta.type}/${meta.id}.json`, { meta });

    // Write stream JSON
    await buildStreamJson(meta.type, meta.id, allFiles, meta);

    if (meta.type === "movie")  movieMetas.push(meta);
    else                        seriesMetas.push(meta);
  }

  // 3. Write catalog JSONs
  console.log("\n📋 Writing catalogs...");

  const toMetaPreview = (m) => ({
    id:          m.id,
    type:        m.type,
    name:        m.name,
    poster:      m.poster,
    releaseInfo: m.releaseInfo || m.year,
    imdbRating:  m.imdbRating,
    genres:      m.genres,
    description: m.description,
  });

  write("docs/catalog/movie/tg-movies.json",   { metas: movieMetas.map(toMetaPreview) });
  write("docs/catalog/series/tg-series.json",  { metas: seriesMetas.map(toMetaPreview) });

  // 4. Manifest
  write("docs/manifest.json", buildManifest());

  // 5. Index page
  writeIndexPage(movieMetas.length, seriesMetas.length);

  console.log(`
✅ Build complete!
   ${movieMetas.length} movies  |  ${seriesMetas.length} series

   Install in Stremio:
   ${PAGES_URL}/manifest.json
`);
}

// ─── Index HTML ───────────────────────────────────────────────────────────────

function writeIndexPage(movies, series) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>📲 ${config.CHANNEL_USERNAME} — Stremio Addon</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0d0d0d; color: #e8e8e8; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #161616; border: 1px solid #2a2a2a; border-radius: 16px; padding: 40px; max-width: 520px; width: 100%; }
    .tg-icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 6px; }
    .channel { color: #229ED9; font-size: 15px; margin-bottom: 28px; }
    .stats { display: flex; gap: 16px; margin-bottom: 28px; }
    .stat { background: #1e1e1e; border-radius: 10px; padding: 14px 20px; flex: 1; text-align: center; }
    .stat-num { font-size: 24px; font-weight: 700; color: #fff; }
    .stat-label { font-size: 12px; color: #888; margin-top: 2px; }
    .install-box { background: #1e1e1e; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
    .install-label { font-size: 12px; color: #888; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .install-url { font-family: monospace; font-size: 13px; color: #ccc; word-break: break-all; background: #111; padding: 10px 14px; border-radius: 6px; }
    .btn { display: block; background: #7b5ea7; color: #fff; padding: 14px; border-radius: 10px; text-decoration: none; text-align: center; font-weight: 600; font-size: 15px; margin-top: 12px; transition: background 0.2s; }
    .btn:hover { background: #9370c4; }
    .updated { color: #555; font-size: 12px; text-align: center; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="tg-icon">📲</div>
    <h1>Telegram Streams</h1>
    <div class="channel">${config.CHANNEL_USERNAME}</div>
    <div class="stats">
      <div class="stat">
        <div class="stat-num">${movies}</div>
        <div class="stat-label">Movies</div>
      </div>
      <div class="stat">
        <div class="stat-num">${series}</div>
        <div class="stat-label">Series</div>
      </div>
    </div>
    <div class="install-box">
      <div class="install-label">Addon URL</div>
      <div class="install-url">${PAGES_URL}/manifest.json</div>
    </div>
    <a class="btn" href="stremio://${PAGES_URL.replace(/^https?:\/\//, "")}/manifest.json">
      ▶ Open in Stremio
    </a>
    <div class="updated">Last updated: ${new Date().toUTCString()} · Auto-rebuilds every hour</div>
  </div>
</body>
</html>`;
  write("docs/index.html", html);
}

// ─── Run ──────────────────────────────────────────────────────────────────────
build().catch(err => {
  console.error("Build error:", err);
  process.exit(1);
});
