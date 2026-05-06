# FounderLens

FounderLens is a venture sourcing workspace for finding early companies, scoring them, tracking founders, and moving deals through a pipeline.

It pulls company and founder signals from public sources, normalizes that data into a single Postgres-backed app, scores companies and founders with Claude, and gives you one place to search, review, and track what matters.

## What The Product Does

- Dashboard: shows top scored companies, highest momentum companies, and a live signal feed.
- Discover: lets you browse companies by source, sector, stage, score, and search query.
- Founders: gives you a searchable, paginated founder view with AI scoring and a detail drawer.
- Network: tracks operators, investors, angels, LPs, advisors, and intro status.
- Pipeline: manages companies across sourced, contacted, diligence, term sheet, closed, and passed.
- Memos: generates an investment memo for a company from its stored data and signal history.

## Data Sources

- GitHub repositories and maintainer profiles
- Hacker News stories
- Product Hunt RSS
- Reddit launch and funding posts
- YC company data
- Public YC founder pages for founder enrichment

The app stores and surfaces fields such as company description, sector, stage, source history, momentum, raised amount, founder links, score breakdowns, and company memos.

## How The App Is Organized

```text
app/
  api/              API routes for companies, founders, pipeline, ingest, scoring, and health
  discover/         company browsing and filtering
  founders/         founder browsing and detail drawer entry point
  network/          relationship tracking UI
  pipeline/         deal board UI
  page.tsx          dashboard

components/
  CompanyCard.tsx
  CompanyDrawer.tsx
  FounderDrawer.tsx
  SignalFeed.tsx

lib/
  api.ts            shared frontend types and fetch helpers
  claude.ts         company scoring and memo generation
  db.ts             Postgres access helpers
  embeddings.ts     vector embedding helpers and similarity support
  founders.ts       founder scoring
  ingest-*.ts       source-specific ingest pipelines
  schema.ts         schema bootstrap
  store.ts          normalized upsert and insert helpers
  util.ts           parsing and utility helpers
```

## How TypeScript Works Here

This repo uses TypeScript as the contract between the database layer, API routes, and UI.

- `.ts` files hold server logic, API routes, ingest code, database helpers, and shared utilities.
- `.tsx` files hold React pages and components that render the UI.
- `tsconfig.json` runs TypeScript in strict mode, so missing fields and bad assumptions are caught early.
- `allowJs: false` keeps the typed app code in TypeScript instead of mixing typed and untyped source.
- `noEmit: true` means TypeScript is used for type-checking only; Next.js handles the actual app build.
- The `@/*` path alias lets the code import from the project root, such as `@/lib/api` or `@/components/CompanyDrawer`.

## Type Flow In This Repo

The main flow is:

1. Ingest code in `lib/ingest-*.ts` collects raw source data.
2. `lib/store.ts` normalizes that data into the database.
3. API routes in `app/api/*` read and write structured records.
4. `lib/api.ts` defines shared frontend types such as `Company`, `Founder`, `Deal`, `Signal`, and `Connection`.
5. Pages and components use those shared types so the UI matches the API shape.

That shared typing is what keeps the app consistent. If an API route starts returning a new field, the matching interface should be updated first. Once that type changes, components that use the old shape will fail type-checking until they are updated.

## Practical TypeScript Examples In This Codebase

- `Company` in `lib/api.ts` is used by dashboard cards, discover results, and company drawers.
- `Deal` in `lib/api.ts` is used by the pipeline board, so fields like `ai_score`, `momentum_score`, and `raised_usd` stay aligned with the pipeline API.
- `Founder` in `lib/api.ts` is used by the founders page and founder drawer, which keeps founder scoring fields and social links consistent.

In other words, TypeScript here is not just syntax. It is the shared schema for how data moves from ingest, to database, to API, to UI.
