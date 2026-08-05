import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { predictPrice } from "@/lib/predict.functions";
import { formatPrice } from "@/lib/location";
import { TrendingUp, TrendingDown, Minus, Sparkles, Loader2 } from "lucide-react";

type Props = {
  product: string;
  category?: string;
  unit?: string;
  currentCents: number;
  currency?: string;
  country?: string;
  city?: string;
  recentCents?: number[];
};

const ADVICE: Record<string, { label: string; tone: string }> = {
  buy_now: { label: "Buy now", tone: "bg-brand/10 text-brand" },
  wait: { label: "Wait — likely cheaper soon", tone: "bg-accent/15 text-accent-foreground" },
  stock_up: { label: "Stock up before it rises", tone: "bg-destructive/10 text-destructive" },
};

export function PriceForecast(props: Props) {
  const run = useServerFn(predictPrice);
  const [open, setOpen] = useState(false);

  const { mutate, data, isPending, error } = useMutation({
    mutationFn: () =>
      run({
        data: {
          product: props.product,
          category: props.category ?? "",
          unit: props.unit ?? "",
          currentCents: props.currentCents,
          currency: props.currency ?? "EUR",
          country: props.country ?? "the European Union",
          city: props.city ?? "",
          recentCents: props.recentCents ?? [],
        },
      }),
  });

  const currency = props.currency ?? "EUR";
  const Icon = data?.direction === "up" ? TrendingUp : data?.direction === "down" ? TrendingDown : Minus;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand flex items-center gap-1.5">
            <Sparkles className="size-3.5" /> Price prediction
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Trends, fuel &amp; logistics costs, geopolitics and seasonality — modelled for the next 90 days.
          </p>
        </div>
        {!data && (
          <button
            onClick={() => { setOpen(true); mutate(); }}
            disabled={isPending}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {isPending ? "Analysing…" : "Forecast"}
          </button>
        )}
      </div>

      {open && error && (
        <p className="mt-4 text-sm text-destructive">{error instanceof Error ? error.message : "Forecast failed"}</p>
      )}

      {data && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Today</p>
              <p className="font-display text-2xl font-bold">{formatPrice(props.currentCents, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">In 30 days</p>
              <p className="font-display text-2xl font-bold flex items-center gap-1.5">
                <Icon className="size-5 text-brand" />
                {formatPrice(data.predicted_cents_30d, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">In 90 days</p>
              <p className="font-display text-2xl font-bold">{formatPrice(data.predicted_cents_90d, currency)}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-muted-foreground">Confidence</p>
              <p className="font-semibold">{Math.round(data.confidence * 100)}%</p>
            </div>
          </div>

          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${ADVICE[data.buy_advice]?.tone ?? "bg-secondary"}`}>
            {ADVICE[data.buy_advice]?.label ?? data.buy_advice}
          </span>

          <p className="text-sm text-muted-foreground">{data.summary}</p>

          <ul className="divide-y divide-border rounded-xl border border-border">
            {data.drivers.map((d, i) => (
              <li key={i} className="flex items-start gap-3 p-3">
                <span
                  className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    d.impact === "up"
                      ? "bg-destructive/10 text-destructive"
                      : d.impact === "down"
                        ? "bg-brand/10 text-brand"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {d.impact === "up" ? "↑" : d.impact === "down" ? "↓" : "–"}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{d.factor}</p>
                  <p className="text-xs text-muted-foreground">{d.note}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Estimates only — generated by AI from public market signals, not financial advice.
          </p>
        </div>
      )}
    </section>
  );
}
