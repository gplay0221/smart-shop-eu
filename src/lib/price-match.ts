import { supabase } from "@/integrations/supabase/client";

export type MatchedItem = {
  ingredient: string;
  quantity: string;
  product: { id: string; name: string; unit: string; category: string } | null;
  cheapest: {
    price_cents: number;
    currency: string;
    store: { id: string; chain: string; address: string };
  } | null;
};

type Product = { id: string; name: string; unit: string; category: string };

function bestMatch(name: string, products: Product[]) {
  const q = name.toLowerCase();
  let best: Product | null = null;
  let bestScore = 0;
  for (const p of products) {
    const n = p.name.toLowerCase();
    let score = 0;
    if (n === q) score = 100;
    else if (n.includes(q) || q.includes(n)) score = 60;
    else {
      const qTokens = q.split(/\s+/).filter(Boolean);
      const nTokens = n.split(/\s+/).filter(Boolean);
      for (const t of qTokens) if (nTokens.some((nt) => nt.includes(t) || t.includes(nt))) score += 20;
    }
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 20 ? best : null;
}

/** Match free-text ingredients to catalogue products and their cheapest store in a city. */
export async function priceIngredients(
  ingredients: Array<{ name: string; quantity: string }>,
  cityId: string,
): Promise<MatchedItem[]> {
  const { data: productsData } = await supabase.from("products").select("id,name,unit,category");
  const products: Product[] = productsData ?? [];
  const { data: stores } = await supabase.from("stores").select("*").eq("city_id", cityId);
  const storeIds = (stores ?? []).map((s) => s.id);
  const storeMap = new Map((stores ?? []).map((s) => [s.id, s]));
  const { data: prices } = await supabase.from("prices").select("*").in("store_id", storeIds);

  const cheapestByProduct = new Map<string, { price_cents: number; currency: string; store_id: string }>();
  for (const p of prices ?? []) {
    const cur = cheapestByProduct.get(p.product_id);
    if (!cur || p.price_cents < cur.price_cents) {
      cheapestByProduct.set(p.product_id, { price_cents: p.price_cents, currency: p.currency, store_id: p.store_id });
    }
  }

  return ingredients.map((ing) => {
    const product = bestMatch(ing.name, products);
    const c = product ? cheapestByProduct.get(product.id) : undefined;
    const store = c ? storeMap.get(c.store_id) : undefined;
    return {
      ingredient: ing.name,
      quantity: ing.quantity,
      product,
      cheapest:
        c && store
          ? { price_cents: c.price_cents, currency: c.currency, store: { id: store.id, chain: store.chain, address: store.address } }
          : null,
    };
  });
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
