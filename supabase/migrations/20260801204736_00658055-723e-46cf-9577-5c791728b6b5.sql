CREATE TABLE IF NOT EXISTS public.search_cache (
  cache_key text PRIMARY KEY,
  response jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.search_cache TO service_role;

ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS search_cache_expires_idx ON public.search_cache (expires_at);