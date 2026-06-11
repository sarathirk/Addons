/**
 * config.js — Fill in your credentials before running.
 *
 * BOT_TOKEN:
 *   Message @BotFather on Telegram → /newbot → copy token
 *   Then add the bot to your channel as Admin (read access is enough)
 *
 * CHANNEL_USERNAME:
 *   Your public channel username WITH the @ sign, e.g. "@mymovieschannel"
 *
 * OMDB_API_KEY (free):
 *   Register at https://www.omdbapi.com/apikey.aspx (free tier = 1000 req/day)
 *   Used to resolve IMDb ID → real movie/show title for better matching
 *
 * LOCAL_API_SERVER (optional, recommended for large files):
 *   Telegram public API only serves files ≤ 20 MB.
 *   For full movies, run: https://github.com/tdlib/telegram-bot-api
 *   Then set this to "http://localhost:8081"
 */

module.exports = {
  BOT_TOKEN:          process.env.BOT_TOKEN          || "YOUR_BOT_TOKEN_HERE",
  CHANNEL_USERNAME:   process.env.CHANNEL_USERNAME   || "@YOUR_CHANNEL_HERE",
  OMDB_API_KEY:       process.env.OMDB_API_KEY       || "YOUR_OMDB_KEY_HERE",
  LOCAL_API_SERVER:   process.env.LOCAL_API_SERVER   || null,

  // How many recent channel messages to scan (increase if channel is large)
  SCAN_LIMIT: parseInt(process.env.SCAN_LIMIT) || 200,
};
