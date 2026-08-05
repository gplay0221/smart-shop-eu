import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { EcoBadge } from "@/components/eco-badge";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "@/hooks/use-location";
import { useGeolocation } from "@/hooks/use-geolocation";
import { formatPrice } from "@/lib/location";
import { CITY_CENTERS, formatKm, mapsLink } from "@/lib/geo";
import { optimizeRoute, optimizeCart, type CartItem, type PriceIndex } from "@/lib/smart-cart";
import { ShareListDialog } from "@/components/share-list-dialog";
import {
  ArrowLeft, Trash2, Store as StoreIcon, MapPin, Play, ChevronDown,
  Route as RouteIcon, Sparkles, Navigation, ExternalLink, Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/lists/$id")({
  head: () => ({
    meta: [
      { title: "Shopping list · EuroSaver" },
      { name: "description", content: "Your shopping list grouped by supermarket, with optimized route and spend." },
      { property: "og:title", content: "Shopping list · EuroSaver" },
      { property: "og:description", content: "Cheapest supermarket routing." },
    ],
  }),
  component: ListDetail,
});

type Row = {
  id: string; list_id: string; product_id: string; store_id: string;
  quantity: number; price_cents: number; currency: string; checked: boolean;
  products: { name: string; brand: string | null; category: string; unit: string; eco_score: string | null } | null;
  stores: { chain: string; address: string; lat: number | null; lng: number | null } | null;
};

function ListDetail() {
  const { id } = Route.useParams();
  const { user, ready } = useAuth();
  const { location } = useLocation();
  const { coords, status, request } = useGeolocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeStore, setActiveStore] = useState<string | null>(null);
  const [routeMode, setRouteMode] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => { if (ready && !user) navigate({ to: "/auth" }); }, [ready, user, navigate]);

  const { data: list } = useQuery({
    queryKey: ["list", id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("shopping_lists").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["list-items", id],
    enabled: !!user,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("list_items")
        .select("*, products(name, brand, category, unit, eco_score), stores(chain, address, lat, lng)")
        .eq("list_id", id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  // Live sync for shared household lists
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`list-items-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "list_items", filter: `list_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["list-items", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, user, qc]);

  const isOwner = !!user && list?.user_id === user.id;
  const cityId = list?.city_id ?? location?.cityId ?? null;
  const originCoords = coords ?? (location ? CITY_CENTERS[location.cityName] ?? null : null);

  async function toggle(item: Row) {
    const nextChecked = !item.checked;
    await supabase.from("list_items").update({ checked: nextChecked }).eq("id", item.id);

    // Purchased items move straight into the pantry
    if (nextChecked && user) {
      const { data: existing } = await supabase
        .from("pantry_items")
        .select("id, quantity")
        .eq("user_id", user.id)
        .eq("product_id", item.product_id)
        .maybeSingle();
      if (existing) {
        await supabase.from("pantry_items")
          .update({ quantity: existing.quantity + item.quantity })
          .eq("id", existing.id);
      } else {
        await supabase.from("pantry_items").insert({
          user_id: user.id,
          product_id: item.product_id,
          name: item.products?.name ?? "Item",
          quantity: item.quantity,
          unit: item.products?.unit ?? "pc",
        });
      }
      // Log the purchase so the automatic shopping list learns the restock rhythm
      await supabase.from("purchases").insert({
        user_id: user.id,
        product_id: item.product_id,
        name: item.products?.name ?? "Item",
        quantity: item.quantity,
        unit_price_cents: item.price_cents,
        currency: item.currency,
        store_id: item.store_id,
        source: "list",
      });
      toast.success(`${item.products?.name ?? "Item"} added to your pantry`);
      qc.invalidateQueries({ queryKey: ["pantry"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
    }

    qc.invalidateQueries({ queryKey: ["list-items", id] });
  }
  async function updateQty(item: Row, qty: number) {
    if (qty < 1) return;
    await supabase.from("list_items").update({ quantity: qty }).eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["list-items", id] });
  }
  async function remove(item: Row) {
    await supabase.from("list_items").delete().eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["list-items", id] });
  }

  /** Smart Cart — reassign every item to minimize spend + number of stops. */
  async function optimizeSpend() {
    if (!items || items.length === 0 || !cityId) {
      toast.error("Pick a city for this list first");
      return;
    }
    setOptimizing(true);
    try {
      const { data: stores } = await supabase.from("stores").select("id").eq("city_id", cityId);
      const storeIds = (stores ?? []).map((s) => s.id);
      const productIds = Array.from(new Set(items.map((i) => i.product_id)));

      const [{ data: prices }, { data: assortment }] = await Promise.all([
        supabase.from("prices").select("product_id, store_id, price_cents").in("store_id", storeIds).in("product_id", productIds),
        supabase.from("store_assortment").select("store_id, product_id, available").in("store_id", storeIds).in("product_id", productIds),
      ]);

      const unavailable = new Set(
        (assortment ?? []).filter((a) => !a.available).map((a) => `${a.store_id}:${a.product_id}`),
      );

      const index: PriceIndex = new Map();
      for (const p of prices ?? []) {
        if (unavailable.has(`${p.store_id}:${p.product_id}`)) continue;
        if (!index.has(p.product_id)) index.set(p.product_id, new Map());
        index.get(p.product_id)!.set(p.store_id, p.price_cents);
      }

      const cartItems: CartItem[] = items.map((i) => ({
        id: i.id, productId: i.product_id, quantity: i.quantity, storeId: i.store_id, priceCents: i.price_cents,
      }));
      const plan = optimizeCart(cartItems, index);
      if (!plan) {
        toast.error("Not enough price data to optimize this list");
        return;
      }

      const beforeTotal = items.reduce((s, i) => s + i.price_cents * i.quantity, 0);
      const beforeStops = new Set(items.map((i) => i.store_id)).size;
      const saved = beforeTotal - plan.totalCents;
      const stopsSaved = beforeStops - plan.stops;

      if (saved <= 0 && stopsSaved <= 0) {
        toast.success("Your cart is already optimal");
        return;
      }

      await Promise.all(
        items.map((i) => {
          const a = plan.assignments.get(i.id);
          if (!a || (a.storeId === i.store_id && a.priceCents === i.price_cents)) return Promise.resolve();
          return supabase.from("list_items")
            .update({ store_id: a.storeId, price_cents: a.priceCents })
            .eq("id", i.id)
            .then(() => undefined);
        }),
      );
      qc.invalidateQueries({ queryKey: ["list-items", id] });
      toast.success(
        `Smart Cart: ${saved > 0 ? `saved ${formatPrice(saved, currency)}` : "same spend"}` +
          (stopsSaved > 0 ? ` and ${stopsSaved} fewer stop${stopsSaved === 1 ? "" : "s"}` : ""),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Optimization failed");
    } finally {
      setOptimizing(false);
    }
  }

  // group by store
  const groups = useMemo(() => {
    const m = new Map<string, { chain: string; address: string; lat: number | null; lng: number | null; items: Row[]; total: number }>();
    for (const it of items ?? []) {
      if (!it.stores) continue;
      if (!m.has(it.store_id)) {
        m.set(it.store_id, { chain: it.stores.chain, address: it.stores.address, lat: it.stores.lat, lng: it.stores.lng, items: [], total: 0 });
      }
      const g = m.get(it.store_id)!;
      g.items.push(it);
      g.total += it.price_cents * it.quantity;
    }
    return m;
  }, [items]);

  const ordered = useMemo(() => {
    const stops = Array.from(groups.entries()).map(([storeId, g]) => ({
      storeId, chain: g.chain, address: g.address, lat: g.lat, lng: g.lng,
    }));
    if (!routeMode) return stops.map((s) => ({ ...s, legKm: null as number | null, cumulativeKm: null as number | null }));
    return optimizeRoute(stops, originCoords);
  }, [groups, routeMode, originCoords]);

  const grandTotal = (items ?? []).reduce((s, i) => s + i.price_cents * i.quantity, 0);
  const currency = items?.[0]?.currency ?? "EUR";
  const totalKm = ordered.length ? ordered[ordered.length - 1].cumulativeKm : null;

  if (!ready || !user || !list) return null;

  return (
    <div className="min-h-screen bg-surface pb-24">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <Link to="/lists" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand mb-4">
          <ArrowLeft className="size-4" /> All lists
        </Link>

        <div className="rounded-2xl bg-ink text-background p-6 sm:p-8 mb-6 shadow-xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-accent">Smart List</p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">{list.name}</h1>
              <p className="text-xs opacity-70 mt-1">
                {groups.size} stop{groups.size === 1 ? "" : "s"} · {items?.length ?? 0} items
                {routeMode && totalKm != null ? ` · ${formatKm(totalKm)} route` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-widest opacity-60">Total</p>
              <p className="font-display text-3xl sm:text-4xl font-bold">{formatPrice(grandTotal, currency)}</p>
            </div>
          </div>
        </div>

        {groups.size > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setRouteMode((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold border transition ${
                routeMode ? "bg-brand text-brand-foreground border-brand" : "bg-card border-border hover:border-brand"
              }`}
            >
              <RouteIcon className="size-4" /> {routeMode ? "Route optimized" : "Optimize route"}
            </button>
            <button
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold hover:border-brand"
            >
              <Users className="size-4" /> Share
            </button>
            <button
              onClick={optimizeSpend}
              disabled={optimizing}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold hover:border-brand disabled:opacity-50"
            >
              <Sparkles className="size-4" /> {optimizing ? "Optimizing…" : "Optimize spend"}
            </button>
            {routeMode && status !== "granted" && (
              <button
                onClick={request}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:border-brand"
              >
                <Navigation className="size-3.5" />
                {status === "loading" ? "Locating…" : status === "denied" ? "Location denied" : "Use my location"}
              </button>
            )}
          </div>
        )}

        {ordered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <StoreIcon className="mx-auto size-8 text-brand" />
            <p className="mt-2 font-medium">No items yet.</p>
            <p className="text-sm text-muted-foreground">Search products and add the cheapest options to this list.</p>
            <Link to="/" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-brand-foreground font-semibold">
              Find products
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {ordered.map((stop, idx) => {
              const g = groups.get(stop.storeId)!;
              const storeId = stop.storeId;
              const isActive = activeStore === storeId;
              const isFocused = activeStore !== null;
              const doneCount = g.items.filter(i => i.checked).length;
              return (
                <section
                  key={storeId}
                  className={`rounded-2xl border bg-card overflow-hidden transition ${
                    isActive ? "border-brand shadow-lg" : "border-border"
                  } ${isFocused && !isActive ? "opacity-40" : ""}`}
                >
                  <header className="flex items-center justify-between gap-3 px-5 py-4 bg-brand-soft/50 border-b border-border">
                    <button
                      onClick={() => setActiveStore(isActive ? null : storeId)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <span className={`grid place-items-center size-8 rounded-lg font-bold text-sm shrink-0 ${
                        isActive ? "bg-brand text-brand-foreground" : "bg-brand/10 text-brand"
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-display font-bold truncate">{g.chain}</h2>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                          <MapPin className="size-3" /> {g.address}
                        </p>
                        {routeMode && stop.legKm != null && (
                          <p className="text-[11px] text-brand font-medium mt-0.5">
                            {idx === 0 ? "From you" : "From previous stop"}: {formatKm(stop.legKm)}
                          </p>
                        )}
                      </div>
                    </button>
                    <div className="text-right shrink-0 flex items-center gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          {doneCount}/{g.items.length} · Subtotal
                        </p>
                        <p className="font-display font-bold">{formatPrice(g.total, currency)}</p>
                      </div>
                      {routeMode && g.lat != null && g.lng != null && (
                        <a
                          href={mapsLink(g.lat, g.lng, `${g.chain} ${g.address}`)}
                          target="_blank" rel="noreferrer"
                          className="rounded-md border border-border p-2 hover:bg-secondary"
                          title="Open in Google Maps"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                      )}
                      {!isActive ? (
                        <button
                          onClick={() => setActiveStore(storeId)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-1.5 text-xs font-semibold hover:opacity-90"
                        >
                          <Play className="size-3" /> Start
                        </button>
                      ) : (
                        <button
                          onClick={() => setActiveStore(null)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Collapse"
                        >
                          <ChevronDown className="size-4" />
                        </button>
                      )}
                    </div>
                  </header>
                  {(!isFocused || isActive) && (
                    <ul className="divide-y divide-border">
                      {g.items.map(it => (
                        <li key={it.id} className={`flex items-center gap-3 px-5 py-3 ${it.checked ? "opacity-50" : ""}`}>
                          <button
                            onClick={() => toggle(it)}
                            aria-label={it.checked ? "Uncheck" : "Check"}
                            className={`size-5 rounded border-2 shrink-0 ${it.checked ? "bg-savings border-savings" : "border-border"}`}
                          >
                            {it.checked && <svg viewBox="0 0 20 20" className="text-background"><path d="M5 10l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.5"/></svg>}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium truncate ${it.checked ? "line-through" : ""}`}>{it.products?.name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <span className="truncate">{it.products?.brand ? `${it.products.brand} · ` : ""}{it.products?.unit}</span>
                              <EcoBadge score={it.products?.eco_score} size="sm" />
                            </p>
                          </div>
                          <div className="flex items-center gap-1 border border-border rounded-md">
                            <button onClick={() => updateQty(it, it.quantity - 1)} className="size-7 hover:bg-secondary">−</button>
                            <span className="w-6 text-center text-sm">{it.quantity}</span>
                            <button onClick={() => updateQty(it, it.quantity + 1)} className="size-7 hover:bg-secondary">+</button>
                          </div>
                          <p className="font-mono text-sm w-16 text-right">{formatPrice(it.price_cents * it.quantity, it.currency)}</p>
                          <button onClick={() => remove(it)} className="text-muted-foreground hover:text-destructive" aria-label="Remove">
                            <Trash2 className="size-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
      {shareOpen && <ShareListDialog listId={id} isOwner={isOwner} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
