# 📲 Stremio Telegram Streams

Stream videos from your Telegram channel in Stremio — with **Movies & Series catalog rows** on the home screen, OMDB posters, and auto-updates every hour via GitHub Actions.

---

## What it looks like in Stremio

- **Home screen**: Two new rows — "📲 @yourchannel Movies" and "📲 @yourchannel Series"
- **Each item**: Full poster, title, year, IMDb rating, description from OMDB
- **Click item → stream**: Direct Telegram file URL, best match shown first

---

## 🚀 Deploy to GitHub Pages

### 1. Push to GitHub
```bash
git init && git add . && git commit -m "initial"
git remote add origin https://github.com/YOU/REPO.git
git push -u origin main
```

### 2. Add 4 Secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|---|---|
| `BOT_TOKEN` | From Telegram @BotFather |
| `CHANNEL_USERNAME` | e.g. `@yourmovieschannel` |
| `OMDB_API_KEY` | Free at https://www.omdbapi.com/apikey.aspx |
| `PAGES_URL` | `https://YOU.github.io/REPO` |

### 3. Enable GitHub Pages
Repo → **Settings → Pages → Branch: main → Folder: /docs → Save**

### 4. Trigger first build
**Actions → Build Stremio Addon → Run workflow**

### 5. Install in Stremio
Open Stremio → Settings → Addons → Add Addon → paste:
```
https://YOU.github.io/REPO/manifest.json
```
Or visit your GitHub Pages URL and click **"Open in Stremio"**.

---

## 🤖 Telegram Bot Setup

1. Message **@BotFather** → `/newbot` → copy token
2. Add bot to your channel as **Admin** (read access is enough)

---

## 🧠 How Files Get Matched to Posters

The build script tries two strategies per file:

1. **Embedded IMDb ID** — if your caption/filename contains `tt1234567`, it looks that up directly (most accurate)
2. **Title search** — strips quality tags, episode markers, year from filename → searches OMDB by title

**Tips for best results:**
| File type | Recommended caption/filename |
|---|---|
| Movie | `Inception 2010 1080p.mkv` |
| Movie (best) | `Inception tt1375666.mkv` |
| Series episode | `Breaking.Bad.S03E07.mkv` |
| Series (best) | `Breaking Bad tt0903747 S03E07.mkv` |

Adding `tt<imdbid>` to your Telegram caption = instant perfect match.

---

## ⚡ Auto-Update

GitHub Action runs every hour:
- Re-fetches your Telegram channel
- Re-runs OMDB lookups for new files
- Writes updated catalog/meta/stream JSONs to `docs/`
- Auto-commits and pushes → GitHub Pages updates

New uploads appear in Stremio within ~1 hour.

---

## 🛠 Local Development

```bash
npm install
# Fill in config.js with your credentials
npm start
# Addon at: http://127.0.0.1:7000/manifest.json
```

Run the static build locally:
```bash
PAGES_URL=http://localhost:7000 node build.js
```

---

## 📁 Project Structure

```
├── .github/workflows/build.yml  ← hourly GitHub Action
├── docs/                        ← GitHub Pages output (auto-generated)
│   ├── manifest.json
│   ├── index.html               ← install page
│   ├── catalog/movie/tg-movies.json
│   ├── catalog/series/tg-series.json
│   ├── meta/{movie,series}/tt*.json
│   └── stream/{movie,series}/tt*.json
├── build.js      ← static site generator
├── index.js      ← local dev server
├── telegram.js   ← Telegram Bot API
├── matcher.js    ← fuzzy title matching
├── omdb.js       ← OMDB metadata + posters
└── config.js     ← credentials (use GitHub Secrets in prod)
```
# Addons
# Addons
