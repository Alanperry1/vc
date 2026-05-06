# FounderLens

AI-native deal-sourcing platform for venture capital. Built as a portfolio piece in a few days using **Next.js 15**, **Vercel Postgres**, and **Anthropic Claude Sonnet 4.5**.

> Continuously surfaces early-stage AI/devtools companies from GitHub and Hacker News, scores them with Claude across five investor dimensions, and lets you track them through a kanban pipeline.

---

## What it does

- **Ingest** — pulls trending repos from the GitHub Search API and Show HN / Launch HN posts from the HN Algolia API.
- **Enrich** — heuristics extract domain, sector, stage, and raise amounts; Claude Sonnet 4.5 scores each company on market, differentiation, timing, team, and traction.
- **Memo** — one-click "Generate memo" turns a company + its signal history into a one-page investment memo (markdown).
- **Pipeline** — drag-and-drop kanban board across `sourced → contacted → diligence → term sheet → closed / passed`, persisted to Postgres.
- **Live signals** — every signal (new repo momentum, HN launch, funding mention) shows up in the dashboard feed.

## Stack

| Layer        | Choice                                              |
| ------------ | --------------------------------------------------- |
| Framework    | Next.js 15.5 (App Router) on **Vercel**             |
| Database     | **Vercel Postgres** (Neon) via `pg`                 |
| LLM          | **Anthropic Claude Sonnet 4.5** (`claude-sonnet-4-5`) |
| Frontend     | React 19, Tailwind CSS, SWR, `@dnd-kit`             |
| Ingestion    | GitHub Search API, HN Algolia API                   |

Single deploy target. Three environment variables. One database. Zero background workers — refresh is on-demand from the dashboard.

## Project layout

```
app/
  api/
    companies/         GET list, GET/[id], POST/[id]/score, POST/[id]/memo
    deals/[id]         PATCH stage / position / notes
    pipeline/          GET deals grouped by stage
    signals/           GET recent signal feed
    ingest/            POST → ingest GitHub + HN sources
    migrate/           POST → apply Postgres schema (run once)
    health/            GET → row counts
  page.tsx             dashboard (top scored, momentum, live feed, refresh)
  discover/            filterable + searchable browser
  pipeline/            drag-and-drop kanban
components/            CompanyCard, CompanyDrawer, SignalFeed
lib/
  db.ts                pg Pool singleton + query helpers
  schema.ts            Postgres schema DDL
  store.ts             upsertCompany, insertSignal
  claude.ts            scoreCompany, generateMemo (direct fetch to Anthropic)
  ingest-github.ts     GitHub Search ingester
  ingest-hn.ts         HN Algolia ingester
  util.ts              uid, slugify, parseRaiseAmount, detectStage, adminGuard
  api.ts               typed fetcher used by the React components
```

## Deploy to Vercel

1. **Push to GitHub** and import the repo at <https://vercel.com/new>.
2. **Add Vercel Postgres** — open the project's *Storage* tab and create a Postgres database. Vercel injects `DATABASE_URL` automatically.
3. **Add two secrets** in *Settings → Environment Variables*:
   - `ANTHROPIC_API_KEY` — your Claude key
   - `GITHUB_TOKEN` — a fine-grained PAT (no scopes needed; just lifts rate limits)
   - *(optional)* `ADMIN_SECRET` — if set, `/api/migrate` and `/api/ingest` require `?secret=...` or `x-admin-secret` header
4. **Deploy.**
5. **Initialize the schema** (once):
   ```bash
   curl -X POST https://your-app.vercel.app/api/migrate
   ```
6. **Open the dashboard** and click **Refresh data**. Within ~30 seconds you'll have live companies and signals.

## Local dev

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, ANTHROPIC_API_KEY, GITHUB_TOKEN
npm run dev
```

Then `curl -X POST http://localhost:3000/api/migrate` and click *Refresh data* on the dashboard.

## Cost

- Vercel Hobby: free
- Vercel Postgres free tier: ~256 MB / 60h compute
- Claude: pay-per-use; one score ≈ $0.005, one memo ≈ $0.02

A normal demo session costs cents.

## Why this design

- **One service, three env vars** — easier to inspect, easier to hand off.
- **No queues, no cron** — refresh is a button click. Eliminates a whole class of orchestration bugs and stays inside Vercel's 60-second function budget.
- **Direct Anthropic `fetch`** — no SDK, no extra cold-start surface area; the API is small enough that one helper file (`lib/claude.ts`) covers scoring and memo generation.
- **Deterministic upserts on (domain || github_url)** — re-running ingest is safe and idempotent.

---

Built by Aleksandar Zarkov. Source available on request — designed as a working portfolio piece for VC engineering roles.
