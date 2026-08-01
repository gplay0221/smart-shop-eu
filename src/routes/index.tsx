import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, LocationPicker } from "@/components/site-header";
import { useLocation } from "@/hooks/use-location";
import { formatPrice } from "@/lib/location";
import { Search, MapPin } from "lucide-react";
import { LivePrices } from "@/components/live-prices";

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

  const productIds = products?.map((p) => p.id) ?? [];
  const { data: cheapest } = useQuery({
    queryKey: ["cheapest", location?.cityId, productIds.join(",")],
    enabled: !!location && productIds.length > 0,
    queryFn: async () => {
      const { data: stores, error: e1 } = await supabase
        .from("stores")
        .select("id, chain, address")
        .eq("city_id", location!.cityId);
      if (e1) throw e1;
      const storeIds = stores.map((s) => s.id);
      type Entry = { price_cents: number; currency: string; store: typeof stores[number] };
      if (storeIds.length === 0) return { byProduct: {} as Record<string, Entry>, stores };
      const { data: prices, error: e2 } = await supabase
        .from("prices")
        .select("product_id, store_id, price_cents, currency")
        .in("product_id", productIds)
        .in("store_id", storeIds);
      if (e2) throw e2;
      const storeMap = new Map(stores.map((s) => [s.id, s]));
      const byProduct: Record<string, Entry> = {};
      for (const p of prices) {
        const existing = byProduct[p.product_id];
        if (!existing || p.price_cents < existing.price_cents) {
          byProduct[p.product_id] = {
            price_cents: p.price_cents,
            currency: p.currency,
            store: storeMap.get(p.store_id)!,
          };
        }
      }
      return { byProduct, stores };
    },
  });

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 lg:px-12 py-12 sm:py-16">
        {/* Hero */}
        <section className="mx-auto max-w-3xl text-center mb-16 sm:mb-20">
          <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05] text-foreground">
            {ready && location ? (
              <>
                Find the lowest price
                <br />
                <span className="text-brand">in {location.cityName}.</span>
              </>
            ) : (
              <>
                Find the lowest price
                <br />
                <span className="text-brand">at any local supermarket.</span>
              </>
            )}
          </h1>
          <p className="mt-6 text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">
            Real-time price tracking across EU supermarkets so you save more on every shop.
          </p>

          <div className="mt-10 mx-auto max-w-2xl relative">
            <Search className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for bread, milk, or brands…"
              className="w-full h-16 pl-12 pr-6 bg-card border border-border rounded-2xl shadow-sm focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {ready && !location && (
            <button
              onClick={() => setPickerOpen(true)}
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
            >
              <MapPin className="size-4" /> Choose your country & city
            </button>
          )}
        </section>

        {/* Live retailer prices for the current search */}
        <LivePrices query={q} />

        {/* Product Grid */}
        {!location && ready ? (
          <div className="rounded-3xl border border-border bg-card p-12 text-center max-w-2xl mx-auto">
            <MapPin className="mx-auto size-8 text-brand" />
            <h2 className="mt-4 font-display text-xl font-bold">Choose a location to see prices</h2>
            <p className="mt-2 text-sm text-muted-foreground">EuroSaver shows stores and prices for the city you pick.</p>
            <button
              onClick={() => setPickerOpen(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground hover:opacity-90"
            >
              <MapPin className="size-4" /> Pick country & city
            </button>
          </div>
        ) : (
          <section>
            <div className="flex items-end justify-between mb-8">
              <h2 className="font-display text-2xl font-bold text-foreground">
                {q ? `Results for “${q}”` : "Trending today"}
              </h2>
              <span className="text-sm text-muted-foreground">{products?.length ?? 0} items</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products?.map((p) => {
                const c = cheapest?.byProduct[p.id];
                return (
                  <button
                    key={p.id}
                    onClick={() => navigate({ to: "/product/$id", params: { id: p.id } })}
                    className="group text-left bg-card rounded-3xl p-5 border border-border hover:border-brand/30 transition-all hover:shadow-xl hover:shadow-border/50"
                  >
                    <div className="aspect-square bg-surface rounded-2xl mb-4 flex items-center justify-center relative overflow-hidden">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="size-24 rounded-xl bg-secondary" />
                      )}
                      {c && (
                        <div className="absolute top-3 left-3 bg-brand text-brand-foreground text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                          Best price
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {p.category}
                      </p>
                      <h3 className="font-display font-bold text-foreground text-lg leading-snug line-clamp-2">
                        {p.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">{p.unit}</p>
                      <div className="flex items-end justify-between pt-4">
                        {c ? (
                          <>
                            <div>
                              <p className="text-[10px] uppercase font-bold text-muted-foreground">Best price at</p>
                              <span className="mt-1 inline-block text-xs font-bold text-foreground bg-secondary px-2 py-0.5 rounded">
                                {c.store.chain}
                              </span>
                            </div>
                            <p className="font-display text-2xl font-bold text-brand">
                              {formatPrice(c.price_cents, c.currency)}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">No price yet</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {products && products.length === 0 && (
              <p className="text-center text-muted-foreground py-12">No products match “{q}”.</p>
            )}
          </section>
        )}
      </main>
      {pickerOpen && <LocationPicker onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
