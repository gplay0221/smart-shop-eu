
-- 1. Store coordinates
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS lng double precision;

-- Backfill demo coords: jitter around each city's approximate center.
-- We use deterministic per-store hashing so results are stable.
WITH city_centers(city_name, lat, lng) AS (
  VALUES
    ('Dublin', 53.3498, -6.2603),
    ('Cork', 51.8985, -8.4756),
    ('Berlin', 52.5200, 13.4050),
    ('Munich', 48.1351, 11.5820),
    ('Paris', 48.8566, 2.3522),
    ('Lyon', 45.7640, 4.8357),
    ('Madrid', 40.4168, -3.7038),
    ('Barcelona', 41.3851, 2.1734),
    ('Rome', 41.9028, 12.4964),
    ('Milan', 45.4642, 9.1900),
    ('Amsterdam', 52.3676, 4.9041),
    ('Rotterdam', 51.9244, 4.4777),
    ('Lisbon', 38.7223, -9.1393),
    ('Porto', 41.1579, -8.6291),
    ('Warsaw', 52.2297, 21.0122),
    ('Krakow', 50.0647, 19.9450),
    ('Vienna', 48.2082, 16.3738),
    ('Brussels', 50.8503, 4.3517)
)
UPDATE public.stores s
SET lat = cc.lat + ((('x' || substr(md5(s.id::text), 1, 8))::bit(32)::int % 200) / 10000.0),
    lng = cc.lng + ((('x' || substr(md5(s.id::text || 'lng'), 1, 8))::bit(32)::int % 200) / 10000.0)
FROM public.cities c
JOIN city_centers cc ON cc.city_name = c.name
WHERE s.city_id = c.id
  AND (s.lat IS NULL OR s.lng IS NULL);

-- 2. Price alerts
CREATE TABLE IF NOT EXISTS public.price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  target_cents integer NOT NULL CHECK (target_cents > 0),
  currency text NOT NULL DEFAULT 'EUR',
  active boolean NOT NULL DEFAULT true,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id, city_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_alerts TO authenticated;
GRANT ALL ON public.price_alerts TO service_role;

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own price alerts" ON public.price_alerts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES public.price_alerts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  price_cents integer,
  currency text NOT NULL DEFAULT 'EUR',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own notifications read/update" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Own notifications update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Own notifications delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, read, created_at DESC);
