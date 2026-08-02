import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, LocationPicker } from "@/components/site-header";
import { useLocation } from "@/hooks/use-location";
import { formatPrice } from "@/lib/location";
import { Search, MapPin, Plus, Sparkles } from "lucide-react";
import { LivePrices } from "@/components/live-prices";
import { PriceSparkline } from "@/components/price-sparkline";

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

const POPULAR = ["Milk", "Eggs", "Bread", "Coffee", "Butter"];

const CHIP_TONES = [
  "bg-brand-soft text-brand",
  "bg-deal-soft text-deal",
  "bg-citrus-soft text-deal",
  "bg-berry-soft text-berry",
  "bg-secondary text-muted-foreground",
];

function initials(chain: string) {
  return chain.replace(/[^a-zA-Z ]/g, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

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
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-[0_32px_64px_-32px_oklch(0.24_0.012_250_/_0.18)]">
          <div className="flex flex-col lg:flex-row">
            {/* Left: editorial search */}
            <div className="w-full border-b border-border p-8 lg:w-[42%] lg:border-b-0 lg:border-r lg:p-14">
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
                <Sparkles className="size-3" /> Live EU price index
              </div>

              <h1 className="mt-8 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground lg:text-6xl">
                Better groceries,
                <br />
                <span className="text-brand">lower costs.</span>
              </h1>
              <p className="mt-5 max-w-sm text-base text-muted-foreground lg:text-lg">
                {location
                  ? `Compare real-time prices across supermarkets in ${location.cityName} with zero friction.`
                  : "Compare real-time prices across major retailers in your area with zero friction."}
              </p>

              <div className="group relative mt-9">
                <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-brand" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search for milk, eggs, bread…"
                  className="h-16 w-full rounded-2xl border-2 border-transparent bg-secondary pl-14 pr-6 font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-brand focus:bg-card"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Popular:</span>
                {POPULAR.map((term, i) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setQ(term)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors hover:bg-brand hover:text-brand-foreground ${CHIP_TONES[i % CHIP_TONES.length]}`}
                  >
                    {term}
                  </button>
                ))}
              </div>

              <div className="mt-10 border-t border-border pt-8">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
                >
                  <MapPin className="size-4" />
                  {location ? `${location.cityName}, ${location.countryName} — change` : "Choose your country & city"}
                </button>
                <p className="mt-3 text-sm text-muted-foreground">
                  Prices refresh continuously from retailer catalogues and shopper reports.
                </p>
              </div>
            </div>

            {/* Right: results */}
            <div className="flex-1 bg-surface/60 p-6 sm:p-8 lg:p-12">
              <div className="mb-7 flex items-end justify-between gap-4">
                <h2 className="font-display text-xl font-bold text-foreground">
                  {q ? `Results for “${q}”` : "Best deals near you"}
                </h2>
                <span className="text-sm text-muted-foreground">{products?.length ?? 0} items</span>
              </div>

              {!location && ready ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border p-10 text-center">
                  <div className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
                    <MapPin className="size-5" />
                  </div>
                  <h3 className="mt-4 font-display font-bold text-foreground">Choose a location to see prices</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Set your city to unlock local supermarket prices.</p>
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="mt-5 rounded-xl bg-brand px-6 py-2 text-sm font-bold text-brand-foreground hover:opacity-90"
                  >
                    Pick country & city
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {products?.map((p) => {
                    const c = cheapest?.byProduct[p.id];
                    return (
                      <button
                        key={p.id}
                        onClick={() => navigate({ to: "/product/$id", params: { id: p.id } })}
                        className="group rounded-3xl border border-border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-xl hover:shadow-border/60"
                      >
                        <div className="mb-4 flex items-start justify-between">
                          <div className="grid size-10 place-items-center rounded-xl bg-secondary text-xs font-bold text-muted-foreground">
                            {c ? initials(c.store.chain) : "—"}
                          </div>
                          <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
                            {p.category}
                          </span>
                        </div>

                        <h3 className="font-display text-lg font-bold leading-snug text-foreground line-clamp-2">
                          {p.name}
                        </h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {[p.brand, c?.store.chain, p.unit].filter(Boolean).join(" · ")}
                        </p>

                        {c && (
                          <div className="mt-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              7-day trend
                            </p>
                            <PriceSparkline seed={p.id} currentCents={c.price_cents} className="mt-1" />
                          </div>
                        )}

                        <div className="mt-5 flex items-end justify-between">
                          {c ? (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Best price
                              </p>
                              <p className="font-display text-2xl font-bold text-foreground">
                                {formatPrice(c.price_cents, c.currency)}
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No price yet</p>
                          )}
                          <span className="grid size-10 place-items-center rounded-xl bg-ink text-background transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                            <Plus className="size-5" />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {products && products.length === 0 && (
                <p className="py-12 text-center text-muted-foreground">No products match “{q}”.</p>
              )}
            </div>
          </div>
        </div>

        {/* Live retailer prices for the current search */}
        <div className="mt-8">
          <LivePrices query={q} />
        </div>
      </main>
      {pickerOpen && <LocationPicker onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
