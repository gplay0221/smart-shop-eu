ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS eco_score text,
  ADD COLUMN IF NOT EXISTS eco_alternative_id uuid REFERENCES public.products(id);

UPDATE public.products
SET eco_score = substr('ABCDE', 1 + (abs(hashtext(id::text || name)) % 5), 1)
WHERE eco_score IS NULL;

WITH ranked AS (
  SELECT p.id, p.category, p.eco_score,
         (SELECT q.id FROM public.products q
           WHERE q.category = p.category
             AND q.id <> p.id
             AND q.eco_score < p.eco_score
           ORDER BY q.eco_score ASC, q.name ASC
           LIMIT 1) AS alt
  FROM public.products p
)
UPDATE public.products p
SET eco_alternative_id = ranked.alt
FROM ranked
WHERE ranked.id = p.id AND ranked.alt IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.store_assortment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, product_id)
);

GRANT SELECT ON public.store_assortment TO anon;
GRANT SELECT ON public.store_assortment TO authenticated;
GRANT ALL ON public.store_assortment TO service_role;

ALTER TABLE public.store_assortment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assortment is public"
  ON public.store_assortment FOR SELECT
  USING (true);

INSERT INTO public.store_assortment (store_id, product_id, available)
SELECT s.id, p.id,
       (abs(hashtext(s.id::text || p.id::text)) % 100) >= 14
FROM public.stores s
CROSS JOIN public.products p
ON CONFLICT (store_id, product_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS store_assortment_product_idx ON public.store_assortment(product_id);