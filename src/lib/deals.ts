import { supabase } from "@/integrations/supabase/client";

export type Deal = {
  product: { id: string; name: string; unit: string; category: string };
  price_cents: number;
  currency: string;
  avg_cents: number;
  discount_pct: number;
  store: { id: string; chain: string; address: string };
};

/** Products whose cheapest price in this city is meaningfully below the city average for that product. */
export async function findDeals(cityId: string, limit = 12): Promise<Deal[]> {
  const { data: stores } = await supabase.from("stores").select("id,chain,address").eq("city_id", cityId);
  const storeMap = new Map((stores ?? []).map((s) => [s.id, s]));
  const storeIds = [...storeMap.keys()];
  if (storeIds.length === 0) return [];

  const { data: prices } = await supabase
    .from("prices")
    .select("product_id,store_id,price_cents,currency")
    .in("store_id", storeIds);
  if (!prices?.length) return [];

  const byProduct = new Map<string, typeof prices>();
  for (const p of prices) {
    const arr = byProduct.get(p.product_id) ?? [];
    arr.push(p);
    byProduct.set(p.product_id, arr);
  }

  const { data: products } = await supabase.from("products").select("id,name,unit,category");
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  const deals: Deal[] = [];
  for (const [productId, rows] of byProduct) {
    if (rows.length < 2) continue;
    const product = productMap.get(productId);
    if (!product) continue;
    const avg = rows.reduce((s, r) => s + r.price_cents, 0) / rows.length;
    const cheapest = rows.reduce((a, b) => (a.price_cents <= b.price_cents ? a : b));
    const store = storeMap.get(cheapest.store_id);
    if (!store) continue;
    const pct = ((avg - cheapest.price_cents) / avg) * 100;
    if (pct < 5) continue;
    deals.push({
      product,
      price_cents: cheapest.price_cents,
      currency: cheapest.currency,
      avg_cents: Math.round(avg),
      discount_pct: Math.round(pct),
      store,
    });
  }

  return deals.sort((a, b) => b.discount_pct - a.discount_pct).slice(0, limit);
}
