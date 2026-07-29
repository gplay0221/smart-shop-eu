CREATE TABLE public.price_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL UNIQUE,
  country_code text NOT NULL DEFAULT 'DE',
  currency text NOT NULL DEFAULT 'EUR',
  catalog_url text,
  deals_url text,
  item_selector text NOT NULL,
  name_selector text NOT NULL,
  price_selector text NOT NULL,
  unit_selector text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.price_sources TO anon, authenticated;
GRANT ALL ON public.price_sources TO service_role;
ALTER TABLE public.price_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Price sources are public" ON public.price_sources FOR SELECT USING (true);
CREATE TRIGGER touch_price_sources BEFORE UPDATE ON public.price_sources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.scraped_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL,
  country_code text NOT NULL DEFAULT 'DE',
  name text NOT NULL,
  name_norm text NOT NULL,
  price_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  unit text,
  kind text NOT NULL DEFAULT 'catalog',
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  source_url text,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX scraped_offers_unique ON public.scraped_offers (chain, name_norm, kind);
CREATE INDEX scraped_offers_name_norm_idx ON public.scraped_offers (name_norm);
CREATE INDEX scraped_offers_product_idx ON public.scraped_offers (product_id);
GRANT SELECT ON public.scraped_offers TO anon, authenticated;
GRANT ALL ON public.scraped_offers TO service_role;
ALTER TABLE public.scraped_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scraped offers are public" ON public.scraped_offers FOR SELECT USING (true);

CREATE TABLE public.price_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  offers_found integer NOT NULL DEFAULT 0,
  offers_upserted integer NOT NULL DEFAULT 0,
  prices_updated integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX price_sync_runs_started_idx ON public.price_sync_runs (started_at DESC);
GRANT SELECT ON public.price_sync_runs TO anon, authenticated;
GRANT ALL ON public.price_sync_runs TO service_role;
ALTER TABLE public.price_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sync runs are public" ON public.price_sync_runs FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.scraped_offers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.price_sync_runs;

INSERT INTO public.price_sources (chain, catalog_url, deals_url, item_selector, name_selector, price_selector, unit_selector) VALUES
 ('Aldi Süd','https://www.aldi-sued.de/de/produkte.html','https://www.aldi-sued.de/de/angebote.html','.mod-article-tile','.mod-article-tile__title','.price__wrapper','.price__unit'),
 ('Aldi Nord','https://www.aldi-nord.de/produkte.html','https://www.aldi-nord.de/angebote.html','.product-tile','.product-tile__title','.price__amount','.price__baseprice'),
 ('Lidl','https://www.lidl.de/q/lebensmittel','https://www.lidl.de/c/angebote','.product-grid-box','.product-grid-box__title','.m-price__price','.m-price__base-price'),
 ('Kaufland','https://www.kaufland.de/sortiment.html','https://www.kaufland.de/angebote.html','.product','.product__title','.price__amount','.price__baseprice'),
 ('Rewe','https://shop.rewe.de/c/lebensmittel','https://shop.rewe.de/c/angebote','.product-tile','.product-tile__title','.product-tile__price','.product-tile__baseprice');