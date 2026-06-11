/**
 * matcher.js
 *
 * Smart fuzzy matcher for mixed/inconsistent Telegram file names.
 * Tries multiple strategies and picks the best scoring result.
 */

// Normalise a string: lowercase, strip punctuation, collapse spaces
function normalise(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[._\-\[\](){}]/g, " ")   // common filename separators → space
    .replace(/\s+/g, " ")
    .trim();
}

// Extract year from a string (1900–2099)
function extractYear(str) {
  const m = str.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : null;
}

// Extract S##E## or ##x## style episode tag
function extractEpisodeTag(str) {
  const norm = str.toLowerCase();
  // S01E02 or s1e2
  let m = norm.match(/s(\d{1,2})e(\d{1,2})/);
  if (m) return { season: parseInt(m[1]), episode: parseInt(m[2]) };
  // 1x02
  m = norm.match(/(\d{1,2})x(\d{2})/);
  if (m) return { season: parseInt(m[1]), episode: parseInt(m[2]) };
  return null;
}

// Word overlap score between two normalised strings
function wordOverlap(a, b) {
  const wa = new Set(a.split(" ").filter(Boolean));
  const wb = new Set(b.split(" ").filter(Boolean));
  let hits = 0;
  for (const w of wa) if (wb.has(w)) hits++;
  // Penalise if query words far outnumber matches
  return hits / Math.max(wa.size, 1);
}

/**
 * Score a single Telegram file against a query context.
 *
 * @param {object} file        - { file_name, caption, ... }
 * @param {object} query       - { title, year, season, episode }
 * @returns {number}           - 0..1+ composite score
 */
function scoreFile(file, query) {
  const haystack = normalise(`${file.file_name} ${file.caption}`);
  const needleTitle = normalise(query.title || "");
  let score = 0;

  // 1. Title word overlap (most important signal)
  const titleScore = wordOverlap(needleTitle, haystack);
  score += titleScore * 10;

  // 2. Year match
  if (query.year) {
    const fileYear = extractYear(haystack);
    if (fileYear && fileYear === query.year) score += 3;
  }

  // 3. Episode tag match (series)
  if (query.season != null && query.episode != null) {
    const tag = extractEpisodeTag(haystack);
    if (tag) {
      if (tag.season === parseInt(query.season) &&
          tag.episode === parseInt(query.episode)) {
        score += 8;   // exact season+episode match
      } else if (tag.season === parseInt(query.season)) {
        score += 2;   // at least right season
      } else {
        score -= 3;   // wrong episode — penalise
      }
    }
  }

  // 4. Video file extension bonus
  if (/\.(mkv|mp4|avi|mov|m4v|webm|ts|wmv)(\s|$)/i.test(haystack)) {
    score += 1;
  }

  // 5. Quality tag bonus (nice-to-have)
  if (/(1080p|720p|4k|uhd|bluray|webrip|hdrip)/i.test(haystack)) {
    score += 0.5;
  }

  return score;
}

/**
 * Rank an array of Telegram file objects against a query.
 *
 * @param {Array}  files   - array of { file_name, caption, ... }
 * @param {object} query   - { title, year, season, episode }
 * @param {number} topN    - how many results to return
 * @returns {Array}        - top N files sorted by score desc
 */
function rankFiles(files, query, topN = 5) {
  return files
    .map(f => ({ ...f, _score: scoreFile(f, query) }))
    .filter(f => f._score > 1)          // minimum threshold
    .sort((a, b) => b._score - a._score)
    .slice(0, topN);
}

module.exports = { rankFiles, extractEpisodeTag, normalise };
