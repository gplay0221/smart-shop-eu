import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { useLocation } from "@/hooks/use-location";
import { useAuth } from "@/hooks/use-auth";
import { formatPrice } from "@/lib/location";
import { ArrowLeft, MapPin, TrendingDown, Plus, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/product/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Price comparison · EuroSaver` },
      { name: "description", content: `Compare supermarket prices for this product across your city.` },
      { property: "og:title", content: "Price comparison — EuroSaver" },
      { property: "og:description", content: "See every supermarket price for this product in your city." },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { location } = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState<string | null>(null);

  const { data: product } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: comparison } = useQuery({
    queryKey: ["comparison", id, location?.cityId],
    enabled: !!location,
    queryFn: async () => {
      const { data: stores, error: e1 } = await supabase.from("stores").select("id, chain, address").eq("city_id", location!.cityId);
      if (e1) throw e1;
      const storeIds = stores.map(s => s.id);
      if (storeIds.length === 0) return [];
      const { data: prices, error: e2 } = await supabase
        .from("prices").select("*").eq("product_id", id).in("store_id", storeIds);
      if (e2) throw e2;
      const storeMap = new Map(stores.map(s => [s.id, s]));
      return prices
        .map(p => ({ ...p, store: storeMap.get(p.store_id)! }))
        .sort((a, b) => a.price_cents - b.price_cents);
    },
  });

  const { data: lists } = useQuery({
    queryKey: ["lists"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("shopping_lists").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const avg = comparison?.length ? comparison.reduce((s, p) => s + p.price_cents, 0) / comparison.length : 0;
  const cheapest = comparison?.[0];
  const maxPrice = comparison?.length ? comparison[comparison.length - 1].price_cents : 0;

  async function addToList(listId: string, storeId: string, priceCents: number, currency: string) {
    setAdding(storeId);
    try {
      const { error } = await supabase.from("list_items").insert({
        list_id: listId, product_id: id, store_id: storeId,
        price_cents: priceCents, currency, quantity: 1,
      });
      if (error) throw error;
      await supabase.from("shopping_lists").update({ updated_at: new Date().toISOString() }).eq("id", listId);
      qc.invalidateQueries({ queryKey: ["list", listId] });
      qc.invalidateQueries({ queryKey: ["lists"] });
      toast.success("Added to list");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(null);
    }
  }

  async function quickAdd(storeId: string, priceCents: number, currency: string) {
    if (!user) { toast.error("Sign in to save shopping lists"); return; }
    if (!lists || lists.length === 0) {
      // create a default list
      const { data, error } = await supabase.from("shopping_lists")
        .insert({ user_id: user.id, name: "My Shopping List", city_id: location?.cityId ?? null })
        .select().single();
      if (error) { toast.error(error.message); return; }
      qc.invalidateQueries({ queryKey: ["lists"] });
      await addToList(data.id, storeId, priceCents, currency);
    } else {
      await addToList(lists[0].id, storeId, priceCents, currency);
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand mb-6">
          <ArrowLeft className="size-4" /> Back to search
        </Link>

        {product && (
          <>
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{product.category}</p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold mt-1">{product.name}</h1>
              <p className="text-muted-foreground">{product.unit}</p>
            </div>

            {!location ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                <MapPin className="mx-auto size-6 text-brand" />
                <p className="mt-2 font-medium">Choose a city to compare prices.</p>
              </div>
            ) : comparison && comparison.length === 0 ? (
              <p className="text-muted-foreground">No stores yet in {location.cityName}.</p>
            ) : (
              <>
                {cheapest && (
                  <div className="rounded-2xl bg-ink text-background p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-accent flex items-center gap-1.5">
                          <TrendingDown className="size-3.5" /> Cheapest in {location.cityName}
                        </p>
                        <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold">{cheapest.store.chain}</h2>
                        <p className="text-sm opacity-70">{cheapest.store.address}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-4xl font-bold">{formatPrice(cheapest.price_cents, cheapest.currency)}</p>
                        {avg > 0 && (
                          <p className="text-xs mt-1 text-accent font-medium">
                            Save up to {formatPrice(maxPrice - cheapest.price_cents, cheapest.currency)} vs highest
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => quickAdd(cheapest.store.id, cheapest.price_cents, cheapest.currency)}
                      disabled={adding === cheapest.store.id}
                      className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-accent-foreground font-semibold hover:opacity-90 disabled:opacity-50"
                    >
                      {adding === cheapest.store.id ? <Check className="size-4" /> : <Plus className="size-4" />}
                      Add to shopping list
                    </button>
                  </div>
                )}

                <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">All stores in {location.cityName}</h3>
                <div className="space-y-3">
                  {comparison?.slice(1).map(p => (
                    <div key={p.id} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
                      <div className="size-10 rounded-lg bg-brand-soft grid place-items-center text-[10px] font-bold text-brand">
                        {p.store.chain.slice(0, 4).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{p.store.chain}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.store.address}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-lg font-bold">{formatPrice(p.price_cents, p.currency)}</p>
                        <p className="text-[10px] text-muted-foreground">+{formatPrice(p.price_cents - cheapest!.price_cents, p.currency)}</p>
                      </div>
                      <button
                        onClick={() => quickAdd(p.store.id, p.price_cents, p.currency)}
                        disabled={adding === p.store.id}
                        className="rounded-md border border-border p-2 hover:bg-secondary disabled:opacity-50"
                        title="Add to list"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
