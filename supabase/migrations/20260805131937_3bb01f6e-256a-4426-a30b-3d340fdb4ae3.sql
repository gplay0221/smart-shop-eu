CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  product_id uuid REFERENCES public.products(id),
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  store_id uuid REFERENCES public.stores(id),
  purchased_on date NOT NULL DEFAULT current_date,
  source text NOT NULL DEFAULT 'receipt',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own purchases" ON public.purchases
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX purchases_user_date_idx ON public.purchases (user_id, purchased_on DESC);

CREATE TRIGGER purchases_touch_updated_at
  BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();