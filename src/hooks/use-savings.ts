import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Micro-wins: how much the user saved this week by picking cheaper stores.
 * Savings = (avg price of that product across all stores) − (price they picked), × quantity,
 * summed over `list_items` marked checked in the last 7 days.
 */
export function useWeeklySavings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["weekly-savings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

      const { data: lists } = await supabase
        .from("shopping_lists")
        .select("id")
        .eq("user_id", user!.id);
      const listIds = (lists ?? []).map((l) => l.id);
      if (listIds.length === 0) return { savedCents: 0, currency: "EUR", itemCount: 0 };

      const { data: items } = await supabase
        .from("list_items")
        .select("product_id, price_cents, quantity, currency, checked, created_at")
        .in("list_id", listIds)
        .eq("checked", true)
        .gte("created_at", since);

      if (!items || items.length === 0) return { savedCents: 0, currency: "EUR", itemCount: 0 };

      const productIds = Array.from(new Set(items.map((i) => i.product_id)));
      const { data: allPrices } = await supabase
        .from("prices")
        .select("product_id, price_cents")
        .in("product_id", productIds);

      const avg = new Map<string, number>();
      const bucket = new Map<string, { sum: number; n: number }>();
      for (const p of allPrices ?? []) {
        const b = bucket.get(p.product_id) ?? { sum: 0, n: 0 };
        b.sum += p.price_cents;
        b.n += 1;
        bucket.set(p.product_id, b);
      }
      for (const [pid, b] of bucket) avg.set(pid, b.sum / b.n);

      let saved = 0;
      for (const it of items) {
        const a = avg.get(it.product_id);
        if (a == null) continue;
        const diff = a - it.price_cents;
        if (diff > 0) saved += diff * it.quantity;
      }
      return {
        savedCents: Math.round(saved),
        currency: items[0]?.currency ?? "EUR",
        itemCount: items.length,
      };
    },
  });
}
