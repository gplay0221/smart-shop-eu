import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, LocationPicker } from "@/components/site-header";
import { useLocation } from "@/hooks/use-location";
import { formatPrice } from "@/lib/location";
import { Search, MapPin, TrendingDown, Store as StoreIcon } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EuroSaver — Find the cheapest supermarket prices in your EU city" },
      { name: "description", content: "Pick your country and city, search any grocery product, and see which supermarket sells it for the lowest price. Then build shopping lists to save money." },
      { property: "og:title", content: "EuroSaver — Cheapest EU grocery prices" },
      { property: "og:description", content: "Compare supermarket prices across the EU and shop smarter." },
    ],
  }),
  component: Home,
});

function Home() {
  const { location, ready } = useLocation();
  const [q, setQ] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const navigate = useNavigate();

  const { data: products } = useQuery({
    queryKey: ["search", q],
    queryFn: async () => {
      let query = supabase.from("products").select("*").order("name").limit(60);
      if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Cheapest price for each product in the selected city
  const productIds = products?.map(p => p.id) ?? [];
  const { data: cheapest } = useQuery({
    queryKey: ["cheapest", location?.cityId, productIds.join(",")],
    enabled: !!location && productIds.length > 0,
    queryFn: async () => {
      const { data: stores, error: e1 } = await supabase.from("stores").select("id, chain, address").eq("city_id", location!.cityId);
      if (e1) throw e1;
      const storeIds = stores.map(s => s.id);
      if (storeIds.length === 0) return { byProduct: {} as Record<string, { price_cents: number; store: typeof stores[number] }>, stores };
      const { data: prices, error: e2 } = await supabase
        .from("prices")
        .select("product_id, store_id, price_cents, currency")
        .in("product_id", productIds)
        .in("store_id", storeIds);
      if (e2) throw e2;
      const storeMap = new Map(stores.map(s => [s.id, s]));
      const byProduct: Record<string, { price_cents: number; currency: string; store: typeof stores[number] }> = {};
      for (const p of prices) {
        const existing = byProduct[p.product_id];
        if (!existing || p.price_cents < existing.price_cents) {
          byProduct[p.product_id] = { price_cents: p.price_cents, currency: p.currency, store: storeMap.get(p.store_id)! };
        }
      }
      return { byProduct, stores };
    },
  });

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-12">
        <section className="mb-10">
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl">
            {ready && location ? (
              <>Find the lowest price in <span className="text-brand">{location.cityName}</span></>
            ) : (
              <>Compare grocery prices across the <span className="text-brand">EU</span></>
            )}
          </h1>
          <p className="mt-3 text-base sm:text-lg text-muted-foreground max-w-2xl">
            Search any product to see which supermarket sells it cheapest. Add items to per-store shopping lists and save on every trip.
          </p>

          {ready && !location && (
            <button
              onClick={() => setPickerOpen(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-brand-foreground font-semibold hover:opacity-90"
            >
              <MapPin className="size-4" /> Choose your country & city
            </button>
          )}

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products (e.g. Oat Milk, Pasta, Diapers)"
                className="w-full rounded-xl border border-border bg-card pl-12 pr-5 py-4 text-base sm:text-lg shadow-sm outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand"
              />
            </div>
          </div>
        </section>

        {!location && ready ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <MapPin className="mx-auto size-8 text-brand" />
            <h2 className="mt-3 font-display text-xl font-bold">Choose a location to see prices</h2>
            <p className="mt-1 text-sm text-muted-foreground">EuroSaver shows stores and prices for the city you pick.</p>
            <button
              onClick={() => setPickerOpen(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-brand-foreground font-semibold"
            >
              <MapPin className="size-4" /> Pick country & city
            </button>
          </div>
        ) : (
          <section>
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {q ? `Search: "${q}"` : "Popular products"} · {products?.length ?? 0} items
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products?.map(p => {
                const c = cheapest?.byProduct[p.id];
                return (
                  <button
                    key={p.id}
                    onClick={() => navigate({ to: "/product/$id", params: { id: p.id } })}
                    className="group text-left rounded-2xl border border-border bg-card p-5 hover:border-brand/40 hover:shadow-lg hover:shadow-brand/5 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{p.category}</p>
                        <h3 className="mt-1 font-bold text-base truncate">{p.name}</h3>
                        <p className="text-xs text-muted-foreground">{p.unit}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {c ? (
                          <>
                            <p className="font-display text-xl font-bold">{formatPrice(c.price_cents, c.currency)}</p>
                            <p className="text-[10px] font-bold text-savings uppercase tracking-wider flex items-center gap-1 justify-end">
                              <TrendingDown className="size-3" /> Best
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">No price</p>
                        )}
                      </div>
                    </div>
                    {c && (
                      <div className="mt-4 flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-xs">
                        <StoreIcon className="size-3.5 text-brand" />
                        <span className="font-semibold text-brand">{c.store.chain}</span>
                        <span className="text-muted-foreground truncate">· {c.store.address}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {products && products.length === 0 && (
              <p className="text-center text-muted-foreground py-12">No products match "{q}".</p>
            )}
          </section>
        )}
      </main>
      {pickerOpen && <LocationPicker onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
