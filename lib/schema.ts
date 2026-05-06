// Postgres schema for FounderLens (Vercel deploy).
// Run via POST /api/migrate once after first deploy.

export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT,
  description TEXT,
  sector TEXT,
  stage TEXT,
  location TEXT,
  founded_year INTEGER,
  homepage TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  hn_url TEXT,
  logo_url TEXT,
  raised_usd BIGINT,
  team_size INTEGER,
  ai_score REAL,
  ai_score_breakdown JSONB,
  momentum_score REAL,
  source TEXT,
  embedding vector(1024),
  embedding_text_hash TEXT,
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
  updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain) WHERE domain IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_github ON companies(github_url) WHERE github_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_score ON companies(ai_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_companies_momentum ON companies(momentum_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies(sector);
CREATE INDEX IF NOT EXISTS idx_companies_stage ON companies(stage);
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm ON companies USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_companies_desc_trgm ON companies USING GIN (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_companies_linkedin ON companies(linkedin_url) WHERE linkedin_url IS NOT NULL;
-- HNSW for fast cosine similarity search.
CREATE INDEX IF NOT EXISTS idx_companies_embedding
  ON companies USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  payload JSONB,
  weight REAL DEFAULT 1.0,
  occurred_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
);

CREATE INDEX IF NOT EXISTS idx_signals_company ON signals(company_id);
CREATE INDEX IF NOT EXISTS idx_signals_occurred ON signals(occurred_at DESC);

CREATE TABLE IF NOT EXISTS pipeline_deals (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'sourced',
  notes TEXT,
  owner TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
  updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_company ON pipeline_deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON pipeline_deals(stage, position);

CREATE TABLE IF NOT EXISTS memos (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  markdown TEXT NOT NULL,
  model TEXT,
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
);

CREATE INDEX IF NOT EXISTS idx_memos_company ON memos(company_id, created_at DESC);

-- Founders: people behind companies. Powers "predicting founder success".
CREATE TABLE IF NOT EXISTS founders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  github_login TEXT,
  twitter TEXT,
  linkedin TEXT,
  bio TEXT,
  location TEXT,
  avatar_url TEXT,
  github_followers INTEGER,
  github_public_repos INTEGER,
  github_account_age_days INTEGER,
  prior_companies JSONB,
  ai_score REAL,
  ai_score_breakdown JSONB,
  source TEXT,
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
  updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_founders_github ON founders(github_login) WHERE github_login IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_founders_linkedin ON founders(linkedin) WHERE linkedin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_founders_twitter ON founders(twitter) WHERE twitter IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_founders_score ON founders(ai_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_founders_name_trgm ON founders USING GIN (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS company_founders (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  founder_id TEXT NOT NULL REFERENCES founders(id) ON DELETE CASCADE,
  role TEXT,
  PRIMARY KEY (company_id, founder_id)
);

CREATE INDEX IF NOT EXISTS idx_cf_founder ON company_founders(founder_id);

-- Network connections: warm intros, operators, angels in your community.
-- Powers the "connecting our community" pillar.
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  person_name TEXT NOT NULL,
  person_email TEXT,
  person_handle TEXT,
  relationship TEXT NOT NULL DEFAULT 'operator',
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  founder_id TEXT REFERENCES founders(id) ON DELETE SET NULL,
  intro_status TEXT NOT NULL DEFAULT 'none',
  notes TEXT,
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
  updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
);

CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(intro_status);
CREATE INDEX IF NOT EXISTS idx_connections_company ON connections(company_id);
CREATE INDEX IF NOT EXISTS idx_connections_founder ON connections(founder_id);
`;
