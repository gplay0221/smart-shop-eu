import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { formatPrice } from "@/lib/location";
import { Bell, BellOff, Trash2, TrendingDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Price alerts — EuroSaver" },
      {
        name: "description",
        content: "Manage dynamic price alerts: get notified the moment a product drops below your target price in your city.",
      },
      { property: "og:title", content: "Price alerts — EuroSaver" },
      { property: "og:description", content: "Get pinged when groceries drop below your target price." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AlertsPage,
});

type AlertRow = {
  id: string;
  product_id: string;
  city_id: string;
  target_cents: number;
  currency: string;
  active: boolean;
  notified_at: string | null;
};

function AlertsPage() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["alerts-page", user?.id],
    enabled: ready && !!user,
    queryFn: async () => {
      const { data: alerts, error } = await supabase
        .from("price_alerts")
        .select("id,product_id,city_id,target_cents,currency,active,notified_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (alerts ?? []) as AlertRow[];
      if (rows.length === 0) return [];

      const productIds = [...new Set(rows.map((a) => a.product_id))];
      const cityIds = [...new Set(rows.map((a) => a.city_id))];
      const [{ data: products }, { data: cities }, { data: stores }] = await Promise.all([
        supabase.from("products").select("id,name,unit").in("id", productIds),
        supabase.from("cities").select("id,name").in("id", cityIds),
        supabase.from("stores").select("id,chain,city_id").in("city_id", cityIds),
      ]);
      const storeIds = (stores ?? []).map((s) => s.id);
      const { data: prices } = await supabase
        .from("prices")
        .select("product_id,store_id,price_cents,currency")
        .in("product_id", productIds)
        .in("store_id", storeIds);

      const productMap = new Map((products ?? []).map((p) => [p.id, p]));
      const cityMap = new Map((cities ?? []).map((c) => [c.id, c]));
      const storeMap = new Map((stores ?? []).map((s) => [s.id, s]));

      return rows.map((a) => {
        const inCity = (prices ?? []).filter(
          (p) => p.product_id === a.product_id && storeMap.get(p.store_id)?.city_id === a.city_id,
        );
        const cheapest = inCity.length ? inCity.reduce((x, y) => (x.price_cents <= y.price_cents ? x : y)) : null;
        return {
          alert: a,
          product: productMap.get(a.product_id) ?? null,
          cityName: cityMap.get(a.city_id)?.name ?? "",
          cheapest: cheapest
            ? { ...cheapest, chain: storeMap.get(cheapest.store_id)?.chain ?? "" }
            : null,
        };
      });
    },
  });

  async function toggle(a: AlertRow) {
    const { error } = await supabase.from("price_alerts").update({ active: !a.active }).eq("id", a.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["alerts-page"] });
  }

  async function remove(a: AlertRow) {
    const { error } = await supabase.from("price_alerts").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Alert removed");
    qc.invalidateQueries({ queryKey: ["alerts-page"] });
  }

  async function nudgeTarget(a: AlertRow, deltaPct: number) {
    const next = Math.max(1, Math.round(a.target_cents * (1 + deltaPct / 100)));
    const { error } = await supabase.from("price_alerts").update({ target_cents: next, notified_at: null }).eq("id", a.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["alerts-page"] });
  }

  if (ready && !user) {
    return (
      <div className="min-h-screen bg-surface">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold">Price alerts</h1>
          <p className="mt-2 text-muted-foreground">Sign in to track prices and get notified when they drop.</p>
          <Link to="/auth" className="mt-6 inline-flex rounded-xl bg-brand px-5 py-3 font-semibold text-brand-foreground">
            Sign in
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12">
        <p className="text-xs font-bold uppercase tracking-widest text-brand flex items-center gap-1.5">
          <Bell className="size-3.5" /> Dynamic alerts
        </p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight">Your price alerts</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          We check every 15 minutes across the supermarkets in your city and notify you the moment a product drops below
          your target.
        </p>

        <div className="mt-8 rounded-2xl border border-border bg-card divide-y divide-border">
          {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && (data?.length ?? 0) === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No alerts yet. Open any product and tap “Alert me” to start tracking it.
              </p>
              <Link to="/" className="mt-4 inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground">
                Find a product
              </Link>
            </div>
          )}
          {(data ?? []).map(({ alert, product, cityName, cheapest }) => {
            const hit = cheapest && cheapest.price_cents <= alert.target_cents;
            return (
              <div key={alert.id} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      to="/product/$id"
                      params={{ id: alert.product_id }}
                      className="font-semibold hover:text-brand truncate"
                    >
                      {product?.name ?? "Product"}
                    </Link>
                    {hit && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">
                        <TrendingDown className="size-3" /> Target hit
                      </span>
                    )}
                    {!alert.active && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        Paused
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cityName} · target {formatPrice(alert.target_cents, alert.currency)}
                    {cheapest
                      ? ` · cheapest now ${formatPrice(cheapest.price_cents, cheapest.currency)} at ${cheapest.chain}`
                      : " · no prices yet"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => nudgeTarget(alert, -5)}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-brand"
                    title="Lower target by 5%"
                  >
                    −5%
                  </button>
                  <button
                    onClick={() => nudgeTarget(alert, 5)}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-brand"
                    title="Raise target by 5%"
                  >
                    +5%
                  </button>
                  <button
                    onClick={() => toggle(alert)}
                    aria-label={alert.active ? "Pause alert" : "Resume alert"}
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:border-brand hover:text-foreground"
                  >
                    {alert.active ? <Bell className="size-4" /> : <BellOff className="size-4" />}
                  </button>
                  <button
                    onClick={() => remove(alert)}
                    aria-label="Delete alert"
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:border-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
