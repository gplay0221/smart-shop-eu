import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { getSystemHealth } from "@/lib/health.functions";
import { Activity, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Loader2 } from "lucide-react";

export const Route = createFileRoute("/health")({
  head: () => ({
    meta: [
      { title: "System health — EuroSaver" },
      {
        name: "description",
        content:
          "Live status of the EuroSaver price scraper, barcode scanning and automatic shopping list, including retailer reachability and data coverage.",
      },
      { property: "og:title", content: "System health — EuroSaver" },
      { property: "og:description", content: "Is the price scraper healthy right now? Check every subsystem." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HealthPage,
});

const TONE = {
  ok: { icon: CheckCircle2, cls: "text-brand", chip: "bg-brand-soft text-brand", label: "Operational" },
  warn: { icon: AlertTriangle, cls: "text-deal", chip: "bg-citrus-soft text-deal", label: "Degraded" },
  fail: { icon: XCircle, cls: "text-destructive", chip: "bg-destructive/10 text-destructive", label: "Down" },
} as const;

function HealthPage() {
  const run = useServerFn(getSystemHealth);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["system-health"],
    queryFn: () => run({ data: undefined }),
    refetchInterval: 120_000,
  });

  const overall = data ? TONE[data.overall] : null;

  return (
    <div className="min-h-screen bg-surface pb-24">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand">
              <Activity className="size-3.5" /> Status
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold text-foreground">System health</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live checks for the price scraper, barcode scan and the automatic shopping list.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {overall && (
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${overall.chip}`}>{overall.label}</span>
            )}
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:border-brand disabled:opacity-50"
            >
              {isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Re-run checks
            </button>
          </div>
        </div>

        {!data && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Running health checks…
          </div>
        )}

        <div className="space-y-6">
          {data?.groups.map((group) => (
            <section key={group.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <header className="border-b border-border px-5 py-3">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h2>
              </header>
              <ul className="divide-y divide-border">
                {group.checks.map((check) => {
                  const tone = TONE[check.status];
                  const Icon = tone.icon;
                  return (
                    <li key={check.id} className="flex items-start gap-3 px-5 py-4">
                      <Icon className={`mt-0.5 size-4 shrink-0 ${tone.cls}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{check.label}</p>
                        <p className="text-sm text-muted-foreground">{check.detail}</p>
                      </div>
                      {check.metric && (
                        <span className="shrink-0 rounded-lg bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">
                          {check.metric}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {data && (
          <p className="mt-6 text-xs text-muted-foreground">
            Last checked {new Date(data.generated_at).toLocaleString("en-GB")}.
          </p>
        )}
      </main>
    </div>
  );
}
