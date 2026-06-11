/**
 * omdb.js
 *
 * Lookup movie/series metadata + poster from OMDB using an IMDb ID.
 * Also supports search by title+year when no IMDb ID is available.
 * Results cached in-memory for the session.
 */

const fetch = require("node-fetch");
const config = require("./config");

const cache = new Map();

/**
 * Fetch full metadata for an IMDb ID.
 * Returns a rich meta object compatible with Stremio's meta format.
 */
async function lookupById(imdbId) {
  if (cache.has(imdbId)) return cache.get(imdbId);

  if (!config.OMDB_API_KEY || config.OMDB_API_KEY === "YOUR_OMDB_KEY_HERE") {
    console.warn("[omdb] No API key — skipping lookup for", imdbId);
    return null;
  }

  try {
    const url = `https://www.omdbapi.com/?i=${imdbId}&apikey=${config.OMDB_API_KEY}`;
    const res  = await fetch(url);
    const data = await res.json();

    if (data.Response === "False") {
      cache.set(imdbId, null);
      return null;
    }

    const meta = buildMeta(data);
    cache.set(imdbId, meta);
    return meta;

  } catch (err) {
    console.error("[omdb] lookupById error:", err.message);
    return null;
  }
}

/**
 * Search OMDB by title (+ optional year).
 * Used when files have no embedded IMDb ID.
 */
async function searchByTitle(title, year = null, type = null) {
  const cacheKey = `search:${title}:${year}:${type}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  if (!config.OMDB_API_KEY || config.OMDB_API_KEY === "YOUR_OMDB_KEY_HERE") return null;

  try {
    const params = new URLSearchParams({
      t:      title,
      apikey: config.OMDB_API_KEY,
      ...(year && { y: year }),
      ...(type && { type }),
    });

    const res  = await fetch(`https://www.omdbapi.com/?${params}`);
    const data = await res.json();

    if (data.Response === "False") {
      cache.set(cacheKey, null);
      return null;
    }

    const meta = buildMeta(data);
    // Also cache under the real IMDb ID
    cache.set(meta.id, meta);
    cache.set(cacheKey, meta);
    return meta;

  } catch (err) {
    console.error("[omdb] searchByTitle error:", err.message);
    return null;
  }
}

/**
 * Build a Stremio-compatible meta object from raw OMDB response.
 */
function buildMeta(data) {
  const genres = data.Genre
    ? data.Genre.split(",").map(g => g.trim()).filter(Boolean)
    : [];

  const cast = data.Actors
    ? data.Actors.split(",").map(a => a.trim()).filter(a => a !== "N/A")
    : [];

  const imdbRating = parseFloat(data.imdbRating);

  return {
    id:          data.imdbID,
    type:        data.Type === "series" ? "series" : "movie",
    name:        data.Title,
    year:        data.Year ? data.Year.slice(0, 4) : null,
    poster:      data.Poster !== "N/A" ? data.Poster : null,
    background:  data.Poster !== "N/A" ? data.Poster : null,   // fallback; TMDB would be better
    description: data.Plot  !== "N/A" ? data.Plot  : null,
    runtime:     data.Runtime !== "N/A" ? data.Runtime : null,
    genres,
    cast,
    director:    data.Director !== "N/A" ? data.Director : null,
    imdbRating:  isNaN(imdbRating) ? null : imdbRating,
    releaseInfo: data.Year,
    // Raw fields kept for matching
    _title:      data.Title,
    _year:       data.Year ? data.Year.slice(0, 4) : null,
  };
}

// Convenience alias used by older code
const lookupTitle = lookupById;

module.exports = { lookupById, lookupTitle, searchByTitle };
