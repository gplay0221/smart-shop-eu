import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { useLocation } from "@/hooks/use-location";
import { useAuth } from "@/hooks/use-auth";
import { useGeolocation } from "@/hooks/use-geolocation";
import { formatPrice } from "@/lib/location";
import { CITY_CENTERS, haversineKm, formatKm, mapsLink } from "@/lib/geo";
import { EcoBadge } from "@/components/eco-badge";
import { ArrowLeft, MapPin, TrendingDown, Plus, Check, Bell, Navigation, ExternalLink, Leaf, PackageX } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/product/$id")({
  head: () => ({
    meta: [
      { title: `Price comparison · EuroSaver` },
      { name: "description", content: `Compare supermarket prices and distances for this product across your city, and set price alerts.` },
      { property: "og:title", content: "Price comparison — EuroSaver" },
      { property: "og:description", content: "See every supermarket price and distance for this product in your city." },
    ],
  }),
  component: ProductPage,
});

type StoreRow = { id: string; chain: string; address: string; lat: number | null; lng: number | null };
type PriceRow = {
  id: string;
  product_id: string;
  store_id: string;
  price_cents: number;
  currency: string;
  store: StoreRow;
};

function ProductPage() {
  const { id } = Route.useParams();
  const { location } = useLocation();
  const { user } = useAuth();
  const { coords, status, request } = useGeolocation();
  const qc = useQueryClient();
  const [adding, setAdding] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"price" | "distance">("price");
  const [alertOpen, setAlertOpen] = useState(false);
  const [targetEuros, setTargetEuros] = useState("");

  const originCoords = coords ?? (location ? CITY_CENTERS[location.cityName] ?? null : null);

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
    queryFn: async (): Promise<PriceRow[]> => {
      const { data: stores, error: e1 } = await supabase
        .from("stores").select("id, chain, address, lat, lng").eq("city_id", location!.cityId);
      if (e1) throw e1;
      const storeIds = stores.map((s) => s.id);
      if (storeIds.length === 0) return [];
      const { data: prices, error: e2 } = await supabase
        .from("prices").select("*").eq("product_id", id).in("store_id", storeIds);
      if (e2) throw e2;
      const storeMap = new Map<string, StoreRow>(stores.map((s) => [s.id, s as StoreRow]));
      return prices.map((p) => ({ ...p, store: storeMap.get(p.store_id)! }));
    },
  });

  const { data: existingAlert } = useQuery({
    queryKey: ["alert", id, location?.cityId, user?.id],
    enabled: !!user && !!location,
    queryFn: async () => {
      const { data } = await supabase.from("price_alerts").select("*")
        .eq("product_id", id).eq("city_id", location!.cityId).eq("user_id", user!.id).maybeSingle();
      return data;
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

  const { data: assortment } = useQuery({
    queryKey: ["assortment", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_assortment")
        .select("store_id, available")
        .eq("product_id", id);
      return data ?? [];
    },
  });

  const { data: greener } = useQuery({
    queryKey: ["eco-alt", product?.eco_alternative_id],
    enabled: !!product?.eco_alternative_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, unit, brand, eco_score")
        .eq("id", product!.eco_alternative_id!)
        .maybeSingle();
      return data;
    },
  });

  const unavailableStores = useMemo(
    () => new Set((assortment ?? []).filter((a) => !a.available).map((a) => a.store_id)),
    [assortment],
  );

  const enriched = useMemo(() => {
    if (!comparison) return [];
    return comparison.map((p) => {
      const distanceKm = originCoords && p.store.lat != null && p.store.lng != null
        ? haversineKm(originCoords, { lat: p.store.lat, lng: p.store.lng })
        : null;
      return { ...p, distanceKm, available: !unavailableStores.has(p.store_id) };
    });
  }, [comparison, originCoords, unavailableStores]);

  const sorted = useMemo(() => {
    const arr = [...enriched];
    arr.sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      if (sortMode === "distance") return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
      return a.price_cents - b.price_cents;
    });
    return arr;
  }, [enriched, sortMode]);

  const inStock = enriched.filter((p) => p.available);
  const outOfStockCount = enriched.length - inStock.length;
  const cheapest = inStock.length ? [...inStock].sort((a, b) => a.price_cents - b.price_cents)[0] : null;
  const maxPrice = inStock.length ? Math.max(...inStock.map((p) => p.price_cents)) : 0;

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

  async function saveAlert() {
    if (!user || !location) { toast.error("Sign in to set price alerts"); return; }
    const euros = parseFloat(targetEuros.replace(",", "."));
    if (!isFinite(euros) || euros <= 0) { toast.error("Enter a valid target price"); return; }
    const target_cents = Math.round(euros * 100);
    const currency = cheapest?.currency ?? "EUR";
    const { error } = await supabase.from("price_alerts").upsert(
      { user_id: user.id, product_id: id, city_id: location.cityId, target_cents, currency, active: true, notified_at: null },
      { onConflict: "user_id,product_id,city_id" },
    );
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["alert", id, location.cityId, user.id] });
    toast.success(`Alert set: notify when below ${formatPrice(target_cents, currency)}`);
    setAlertOpen(false);
  }

  async function removeAlert() {
    if (!existingAlert) return;
    await supabase.from("price_alerts").delete().eq("id", existingAlert.id);
    qc.invalidateQueries({ queryKey: ["alert", id, location?.cityId, user?.id] });
    toast.success("Alert removed");
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
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{product.category}</p>
                <h1 className="font-display text-3xl sm:text-4xl font-bold mt-1">{product.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-muted-foreground">{product.unit}</p>
                  <EcoBadge score={product.eco_score} />
                </div>
              </div>
              {user && location && (
                <button
                  onClick={() => existingAlert ? removeAlert() : setAlertOpen(true)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold border transition ${
                    existingAlert
                      ? "bg-accent text-accent-foreground border-accent"
                      : "border-border bg-card hover:border-brand"
                  }`}
                >
                  <Bell className="size-4" />
                  {existingAlert
                    ? `Alerting under ${formatPrice(existingAlert.target_cents, existingAlert.currency)}`
                    : "Alert me on price drop"}
                </button>
              )}
            </div>

            {greener && (
              <div className="mb-6 rounded-xl border border-savings/30 bg-savings/10 p-4 flex items-center gap-3 flex-wrap">
                <Leaf className="size-5 text-savings shrink-0" />
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-sm font-semibold">Swap for greener?</p>
                  <p className="text-xs text-muted-foreground">
                    {greener.name}{greener.brand ? ` · ${greener.brand}` : ""} · {greener.unit} has a better sustainability score.
                  </p>
                </div>
                <EcoBadge score={greener.eco_score} />
                <Link
                  to="/product/$id"
                  params={{ id: greener.id }}
                  className="rounded-lg bg-savings px-3.5 py-2 text-sm font-semibold text-background hover:opacity-90"
                >
                  Compare it
                </Link>
              </div>
            )}



            {alertOpen && (
              <div className="mb-6 rounded-xl border border-border bg-card p-4 flex items-center gap-3 flex-wrap">
                <label className="text-sm font-medium">Notify me when it drops below</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                  <input
                    autoFocus type="text" inputMode="decimal" value={targetEuros}
                    onChange={(e) => setTargetEuros(e.target.value)}
                    placeholder={cheapest ? (cheapest.price_cents / 100).toFixed(2) : "1.99"}
                    className="w-28 rounded-lg border border-border bg-background pl-7 pr-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </div>
                <button onClick={saveAlert} className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-brand-foreground">Save alert</button>
                <button onClick={() => setAlertOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            )}

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
                        {maxPrice > cheapest.price_cents && (
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

                <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    All stores in {location.cityName}
                  </h3>
                  <div className="flex items-center gap-2">
                    {status !== "granted" && (
                      <button
                        onClick={request}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:border-brand"
                        title="Use my exact location"
                      >
                        <Navigation className="size-3.5" />
                        {status === "loading" ? "Locating…" : status === "denied" ? "Location denied" : "Use my location"}
                      </button>
                    )}
                    <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs font-medium">
                      <button onClick={() => setSortMode("price")} className={`px-2.5 py-1 rounded ${sortMode === "price" ? "bg-ink text-background" : "text-muted-foreground"}`}>Price</button>
                      <button onClick={() => setSortMode("distance")} className={`px-2.5 py-1 rounded ${sortMode === "distance" ? "bg-ink text-background" : "text-muted-foreground"}`}>Distance</button>
                    </div>
                  </div>
                </div>

                {outOfStockCount > 0 && (
                  <p className="mb-3 text-xs text-muted-foreground flex items-center gap-1.5">
                    <PackageX className="size-3.5" />
                    Not stocked at {outOfStockCount} store{outOfStockCount === 1 ? "" : "s"} in {location.cityName}.
                  </p>
                )}

                <div className="space-y-3">
                  {sorted.map((p) => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-4 rounded-xl border border-border bg-card p-4 ${p.available ? "" : "opacity-60"}`}
                    >
                      <div className="size-10 rounded-lg bg-brand-soft grid place-items-center text-[10px] font-bold text-brand">
                        {p.store.chain.slice(0, 4).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold flex items-center gap-2">
                          {p.store.chain}
                          {!p.available && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              <PackageX className="size-2.5" /> Not stocked
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{p.store.address}</p>
                        {p.distanceKm != null && (
                          <p className="text-[11px] text-brand font-medium mt-0.5 flex items-center gap-1">
                            <Navigation className="size-3" /> {formatKm(p.distanceKm)} away
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-display text-lg font-bold">{formatPrice(p.price_cents, p.currency)}</p>
                        {cheapest && p.price_cents > cheapest.price_cents && (
                          <p className="text-[10px] text-muted-foreground">+{formatPrice(p.price_cents - cheapest.price_cents, p.currency)}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        {p.store.lat != null && p.store.lng != null && (
                          <a
                            href={mapsLink(p.store.lat, p.store.lng, `${p.store.chain} ${p.store.address}`)}
                            target="_blank" rel="noreferrer"
                            className="rounded-md border border-border p-2 hover:bg-secondary"
                            title="Open in Google Maps"
                          >
                            <ExternalLink className="size-4" />
                          </a>
                        )}
                        <button
                          onClick={() => quickAdd(p.store.id, p.price_cents, p.currency)}
                          disabled={adding === p.store.id}
                          className="rounded-md border border-border p-2 hover:bg-secondary disabled:opacity-50"
                          title="Add to list"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
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
