import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLivePrices } from "@/lib/live-price.functions";
import { formatPrice } from "@/lib/location";
import { Radio, RefreshCw, ExternalLink, Tag } from "lucide-react";

function freshness(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

const SOURCE_LABEL: Record<string, string> = {
  flyer: "Flyer",
  receipt: "Receipt",
  catalog: "In-store",
  headless: "Scraped",
  live: "Live",
};

/** Live retailer prices for the current search, shown inside the price finder. */
export function LivePrices({ query }: { query: string }) {
  const [postalCode, setPostalCode] = useState("");
  const fetchLive = useServerFn(getLivePrices);
  const term = query.trim();

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["live-prices", term, postalCode],
    enabled: term.length > 1,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      fetchLive({
        data: {
          query: term,
          ...(postalCode.length === 5 ? { postalCode } : {}),
        },
      }),
  });

  if (term.length < 2) return null;

  return (
    <section className="mb-12 rounded-3xl border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
          </span>
          <h2 className="font-display text-xl font-bold text-foreground">Live retailer prices</h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="PLZ (e.g. 10115)"
            inputMode="numeric"
            className="h-9 w-36 rounded-xl border border-border bg-surface px-3 text-sm focus:outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground hover:border-brand hover:text-foreground"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {data && data.meta.source_mix.length > 0 && (
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {data.meta.source_mix.map((s) => SOURCE_LABEL[s] ?? s).join(" · ")} ·{" "}
          {data.meta.location_used}
          {data.meta.from_cache ? " · cached" : ""}
        </p>
      )}

      {isFetching && !data && (
        <p className="mt-6 text-sm text-muted-foreground">Checking retailers for “{term}”…</p>
      )}

      {data && data.offers.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <Radio className="size-5 text-muted-foreground" />
          <p className="mt-2 font-medium text-foreground">No live offers for “{term}” right now.</p>
          {data.meta.notes.length > 0 && <p className="mt-1">{data.meta.notes.join(" · ")}</p>}
          <p className="mt-1">{data.meta.disclaimer}</p>
        </div>
      )}

      {data && data.offers.length > 0 && (
        <>
          <div className="mt-6 grid gap-3">
            {data.offers.slice(0, 8).map((o, i) => (
              <div
                key={`${o.store_id}-${o.title}-${i}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">{o.retailer}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {SOURCE_LABEL[o.source_type] ?? o.source_type}
                    </span>
                    {o.flyer_badge && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
                        <Tag className="size-3" /> {o.flyer_badge}
                      </span>
                    )}
                    {i === 0 && (
                      <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-foreground">
                        Cheapest
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium text-foreground">{o.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      o.store_name,
                      o.distance_km != null ? `${o.distance_km} km` : null,
                      o.unit,
                      o.discount_percent > 0 ? `−${o.discount_percent}%` : null,
                      o.valid_to ? `until ${o.valid_to}` : null,
                      freshness(o.captured_at),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-display text-xl font-bold text-brand">
                    {formatPrice(Math.round(o.price * 100), o.currency)}
                  </p>
                  {o.url && (
                    <a
                      href={o.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-brand"
                      aria-label={`Open ${o.retailer} source`}
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{data.meta.disclaimer}</p>
        </>
      )}
    </section>
  );
}
