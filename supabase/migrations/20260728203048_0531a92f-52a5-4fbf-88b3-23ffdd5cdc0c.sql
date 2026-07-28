-- Barcodes
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode text;
UPDATE public.products SET barcode = '20' || lpad((abs(hashtext(id::text)) % 100000000)::text, 8, '0') || '0' WHERE barcode IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_key ON public.products(barcode);

-- Shared lists
CREATE TABLE public.list_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.list_members TO authenticated;
GRANT ALL ON public.list_members TO service_role;
ALTER TABLE public.list_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_list_member(_list_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.list_members m WHERE m.list_id = _list_id AND m.user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.shopping_lists l WHERE l.id = _list_id AND l.user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_list_owner(_list_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.shopping_lists l WHERE l.id = _list_id AND l.user_id = _user_id);
$$;

CREATE POLICY "Members can view membership" ON public.list_members
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_list_owner(list_id, auth.uid()));
CREATE POLICY "Owner manages membership" ON public.list_members
  FOR INSERT TO authenticated WITH CHECK (public.is_list_owner(list_id, auth.uid()));
CREATE POLICY "Owner updates membership" ON public.list_members
  FOR UPDATE TO authenticated USING (public.is_list_owner(list_id, auth.uid())) WITH CHECK (public.is_list_owner(list_id, auth.uid()));
CREATE POLICY "Owner or self removes membership" ON public.list_members
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_list_owner(list_id, auth.uid()));

-- Expand list access to members
CREATE POLICY "Members can view shared lists" ON public.shopping_lists
  FOR SELECT TO authenticated USING (public.is_list_member(id, auth.uid()));
CREATE POLICY "Members can update shared lists" ON public.shopping_lists
  FOR UPDATE TO authenticated USING (public.is_list_member(id, auth.uid())) WITH CHECK (public.is_list_member(id, auth.uid()));
CREATE POLICY "Members manage shared list items" ON public.list_items
  FOR ALL TO authenticated USING (public.is_list_member(list_id, auth.uid())) WITH CHECK (public.is_list_member(list_id, auth.uid()));

-- Community price reports
CREATE TABLE public.price_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.price_reports TO authenticated;
GRANT ALL ON public.price_reports TO service_role;
ALTER TABLE public.price_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own price reports read" ON public.price_reports
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own price reports insert" ON public.price_reports
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE TRIGGER price_reports_touch BEFORE UPDATE ON public.price_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.user_points (
  user_id uuid PRIMARY KEY,
  points integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_points TO authenticated;
GRANT ALL ON public.user_points TO service_role;
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own points read" ON public.user_points
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER user_points_touch BEFORE UPDATE ON public.user_points
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  reward text NOT NULL,
  points_spent integer NOT NULL,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.redemptions TO authenticated;
GRANT ALL ON public.redemptions TO service_role;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own redemptions read" ON public.redemptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own redemptions insert" ON public.redemptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Auto-moderate reports and award points
CREATE OR REPLACE FUNCTION public.moderate_price_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ref_price integer;
BEGIN
  SELECT price_cents INTO ref_price FROM public.prices
   WHERE product_id = NEW.product_id AND store_id = NEW.store_id LIMIT 1;
  IF ref_price IS NULL THEN
    SELECT round(avg(price_cents)) INTO ref_price FROM public.prices WHERE product_id = NEW.product_id;
  END IF;

  IF NEW.price_cents > 0 AND ref_price IS NOT NULL
     AND abs(NEW.price_cents - ref_price) <= (ref_price * 0.3) THEN
    NEW.status := 'approved';
  ELSE
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER price_reports_moderate BEFORE INSERT ON public.price_reports
  FOR EACH ROW EXECUTE FUNCTION public.moderate_price_report();

CREATE OR REPLACE FUNCTION public.award_report_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    INSERT INTO public.user_points (user_id, points) VALUES (NEW.user_id, 10)
    ON CONFLICT (user_id) DO UPDATE SET points = public.user_points.points + 10, updated_at = now();
    UPDATE public.prices SET price_cents = NEW.price_cents
      WHERE product_id = NEW.product_id AND store_id = NEW.store_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER price_reports_award AFTER INSERT ON public.price_reports
  FOR EACH ROW EXECUTE FUNCTION public.award_report_points();

-- Realtime for shared lists
ALTER TABLE public.list_items REPLICA IDENTITY FULL;
ALTER TABLE public.list_members REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.list_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.list_members;