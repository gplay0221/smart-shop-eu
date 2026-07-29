import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { triggerPriceSync } from "@/lib/price-sync.functions";
import { formatPrice } from "@/lib/location";
import { RefreshCw, Radio, CheckCircle2, AlertTriangle, XCircle, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Live German supermarket prices · EuroSaver" },
      {
        name: "description",
        content:
          "Real-time price feed pulled from Aldi, Lidl, Kaufland and REWE Germany, synced straight into your shopping lists.",
      },
      { property: "og:title", content: "Live German supermarket prices" },
      { property: "og:description", content: "Aldi, Lidl, Kaufland and REWE offers, synced live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LivePrices,
});

function StatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="size-4 text-savings" />;
  if (status === "partial") return <AlertTriangle className="size-4 text-accent" />;
  if (status === "running") return <RefreshCw className="size-4 animate-spin text-brand" />;
  return <XCircle className="size-4 text-destructive" />;
}

function LivePrices() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const sync = useServerFn(triggerPriceSync);
  const [running, setRunning] = useState(false);
  const [q, setQ] = useState("");

  const { data: sources } = useQuery({
    queryKey: ["price-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_sources")
        .select("chain, catalog_url, deals_url, active")
        .order("chain");
      if (error) throw error;
      return data;
    },
  });

  const { data: runs } = useQuery({
    queryKey: ["sync-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_sync_runs")
        .select("id, chain, status, offers_found, prices_updated, error, started_at, finished_at")
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const { data: offers } = useQuery({
    queryKey: ["scraped-offers", q],
    queryFn: async () => {
      let query = supabase
        .from("scraped_offers")
        .select("id, chain, name, price_cents, currency, unit, kind, scraped_at, product_id")
        .order("scraped_at", { ascending: false })
        .limit(60);
      if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Realtime: refresh the feed while a sync is running
  useEffect(() => {
    const channel = supabase
      .channel("live-price-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "scraped_offers" }, () =>
        qc.invalidateQueries({ queryKey: ["scraped-offers"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "price_sync_runs" }, () =>
        qc.invalidateQueries({ queryKey: ["sync-runs"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  async function runSync(chain?: string) {
    setRunning(true);
    try {
      const res = await sync({ data: chain ? { chain } : {} });
      const found = res.results.reduce((s, r) => s + r.offers_found, 0);
      const failed = res.results.filter((r) => r.status === "failed").map((r) => r.chain);
      if (found === 0) {
        toast.error(`No offers returned${failed.length ? ` — blocked: ${failed.join(", ")}` : ""}`);
      } else {
        toast.success(`Synced ${found} offers${failed.length ? ` · ${failed.length} chain(s) blocked` : ""}`);
      }
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface pb-24">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand">
              <Radio className="size-3.5" /> Live feed · Germany
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold mt-2">German supermarket prices</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              We pull catalog and weekly-deal prices from Aldi Süd, Aldi Nord, Lidl, Kaufland and REWE,
              match them to catalog products and push the cheapest one into your lists automatically.
            </p>
          </div>
          <button
            onClick={() => runSync()}
            disabled={running || !user}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${running ? "animate-spin" : ""}`} />
            {running ? "Syncing…" : user ? "Sync now" : "Sign in to sync"}
          </button>
        </div>

        {runs?.some((r) => r.error?.includes("blocked")) && (
          <div className="mt-6 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm">
            <p className="font-semibold flex items-center gap-2">
              <AlertTriangle className="size-4 text-accent" /> Chains are blocking direct requests
            </p>
            <p className="text-muted-foreground mt-1">
              Aldi, Lidl, Kaufland and REWE serve their pages behind bot protection, so requests from
              our servers get a 403. The sync engine is live and selector-driven — it starts pulling
              real prices as soon as a scraping proxy key is added, without any code change.
            </p>
          </div>
        )}

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(sources ?? []).map((s) => {
            const last = runs?.find((r) => r.chain === s.chain);
            return (
              <div key={s.chain} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display font-bold">{s.chain}</h2>
                  {last ? <StatusIcon status={last.status} /> : <Radio className="size-4 text-muted-foreground" />}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {last
                    ? `${last.offers_found} offers · ${last.prices_updated} prices updated`
                    : "Never synced"}
                </p>
                {last?.error && (
                  <p className="mt-1 text-[11px] text-destructive line-clamp-2">{last.error}</p>
                )}
                <button
                  onClick={() => runSync(s.chain)}
                  disabled={running || !user}
                  className="mt-3 text-xs font-semibold text-brand hover:underline disabled:opacity-50"
                >
                  Sync {s.chain}
                </button>
              </div>
            );
          })}
        </section>

        <section className="mt-10">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 max-w-md">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search live offers (e.g. Milch, Butter)…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>

          {(offers?.length ?? 0) === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <Radio className="mx-auto size-8 text-brand" />
              <p className="mt-2 font-medium">No live offers yet.</p>
              <p className="text-sm text-muted-foreground">
                Run a sync to pull the current German catalog and weekly deals.
              </p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
              {offers!.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="rounded-md bg-brand-soft px-2 py-1 text-[11px] font-semibold text-brand shrink-0">
                    {o.chain}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{o.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {o.unit ?? "—"} · {o.kind === "deal" ? "Weekly deal" : "Catalog"}
                      {o.product_id ? " · matched to catalog" : ""}
                    </p>
                  </div>
                  <p className="font-mono text-sm">{formatPrice(o.price_cents, o.currency)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
