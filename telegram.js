/**
 * telegram.js
 *
 * Connects to a specific PUBLIC Telegram channel via Bot API.
 *
 * Strategy:
 *  - Use getUpdates to collect recent channel_post messages
 *  - Filter for video / document (video mime) messages only
 *  - Cache the file list in memory; refresh every CACHE_TTL seconds
 *  - Resolve download URLs via getFile (or local API server for large files)
 */

const fetch = require("node-fetch");
const config = require("./config");

const BASE    = config.LOCAL_API_SERVER
  ? `${config.LOCAL_API_SERVER.replace(/\/$/, "")}/bot${config.BOT_TOKEN}`
  : `https://api.telegram.org/bot${config.BOT_TOKEN}`;

const FILE_BASE = config.LOCAL_API_SERVER
  ? `${config.LOCAL_API_SERVER.replace(/\/$/, "")}/file/bot${config.BOT_TOKEN}`
  : `https://api.telegram.org/file/bot${config.BOT_TOKEN}`;

// ─── In-memory cache ──────────────────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000;   // 5 minutes
let _cache = { files: [], ts: 0 };

// ─── Telegram helpers ─────────────────────────────────────────────────────────

async function tgGet(method, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/${method}?${qs}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description}`);
  return data.result;
}

/**
 * Extract a usable file object from a Telegram message.
 * Returns null if the message contains no video/document.
 */
function extractFile(msg) {
  const file = msg.video || (
    msg.document && msg.document.mime_type?.startsWith("video/")
      ? msg.document : null
  );
  if (!file) return null;

  return {
    file_id:    file.file_id,
    file_name:  msg.document?.file_name || msg.caption || `video_${msg.message_id}`,
    caption:    msg.caption || "",
    size:       file.file_size || 0,
    message_id: msg.message_id,
    duration:   file.duration || null,
    width:      file.width || null,
    height:     file.height || null,
  };
}

/**
 * Fetch video files from the channel.
 * Uses getUpdates with channel_post allowed update type.
 * Only messages from config.CHANNEL_USERNAME are kept.
 */
async function fetchChannelFiles() {
  const now = Date.now();
  if (_cache.files.length && (now - _cache.ts) < CACHE_TTL) {
    console.log(`[telegram] Using cached file list (${_cache.files.length} files)`);
    return _cache.files;
  }

  console.log(`[telegram] Fetching recent posts from ${config.CHANNEL_USERNAME}...`);

  // getUpdates returns up to 100 updates at a time.
  // We loop to collect up to SCAN_LIMIT channel_post messages.
  const files = [];
  let offset = 0;

  for (let i = 0; i < Math.ceil(config.SCAN_LIMIT / 100); i++) {
    let updates;
    try {
      updates = await tgGet("getUpdates", {
        offset,
        limit: 100,
        allowed_updates: JSON.stringify(["channel_post"]),
        timeout: 0,
      });
    } catch (err) {
      console.error("[telegram] getUpdates error:", err.message);
      break;
    }

    if (!updates.length) break;

    for (const upd of updates) {
      const msg = upd.channel_post;
      if (!msg) continue;

      // Filter to our specific channel
      const chatUsername = msg.chat.username ? `@${msg.chat.username}` : null;
      const chatId = String(msg.chat.id);
      const targetId = String(config.CHANNEL_USERNAME);

      if (chatUsername !== config.CHANNEL_USERNAME && chatId !== targetId) continue;

      const file = extractFile(msg);
      if (file) files.push(file);

      offset = upd.update_id + 1;
    }

    if (updates.length < 100) break;   // no more updates
  }

  console.log(`[telegram] Found ${files.length} video file(s) in channel.`);
  _cache = { files, ts: Date.now() };
  return files;
}

/**
 * Resolve a file_id to a direct streamable URL.
 */
async function getStreamUrl(file_id) {
  try {
    const result = await tgGet("getFile", { file_id });
    return `${FILE_BASE}/${result.file_path}`;
  } catch (err) {
    console.error("[telegram] getFile error:", err.message);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return all video files from the channel (cached).
 */
async function getAllFiles() {
  return fetchChannelFiles();
}

/**
 * Get a stream URL for a given file_id.
 */
async function resolveUrl(file_id) {
  return getStreamUrl(file_id);
}

/**
 * Force-refresh the file cache (e.g. after new uploads).
 */
function invalidateCache() {
  _cache = { files: [], ts: 0 };
}

module.exports = { getAllFiles, resolveUrl, invalidateCache };
