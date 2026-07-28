import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { formatPrice } from "@/lib/location";
import { Trophy, Gift, Flag, CheckCircle2, Clock } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/rewards")({
  head: () => ({
    meta: [
      { title: "Rewards & points · EuroSaver" },
      {
        name: "description",
        content: "Earn points for reporting supermarket price corrections and redeem them for grocery coupons.",
      },
      { property: "og:title", content: "Rewards & points · EuroSaver" },
      { property: "og:description", content: "Report prices, earn points, redeem grocery coupons." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RewardsPage,
});

const REWARDS = [
  { id: "coupon-1", label: "€1 off your next month", cost: 50 },
  { id: "coupon-3", label: "€3 grocery voucher", cost: 150 },
  { id: "coupon-free", label: "One free month of EuroSaver", cost: 300 },
];

function RewardsPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (ready && !user) navigate({ to: "/auth" });
  }, [ready, user, navigate]);

  const { data: points } = useQuery({
    queryKey: ["points", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("user_points").select("points").eq("user_id", user!.id).maybeSingle();
      return data?.points ?? 0;
    },
  });

  const { data: reports } = useQuery({
    queryKey: ["my-reports", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("price_reports")
        .select("id, price_cents, currency, status, created_at, products(name), stores(chain)")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const { data: redemptions } = useQuery({
    queryKey: ["redemptions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("redemptions").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const spent = (redemptions ?? []).reduce((s, r) => s + r.points_spent, 0);
  const balance = (points ?? 0) - spent;

  async function redeem(reward: { id: string; label: string; cost: number }) {
    if (balance < reward.cost) {
      toast.error(`You need ${reward.cost - balance} more points`);
      return;
    }
    const code = `EURO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { error } = await supabase
      .from("redemptions")
      .insert({ user_id: user!.id, reward: reward.label, points_spent: reward.cost, code });
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["redemptions", user!.id] });
    toast.success(`Redeemed! Your code is ${code}`);
  }

  if (!ready || !user) return null;

  return (
    <div className="min-h-screen bg-surface pb-24">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <div className="rounded-2xl bg-ink text-background p-6 sm:p-8 mb-6 shadow-xl flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Community rewards</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">Your points</h1>
            <p className="text-xs opacity-70 mt-1">Earn 10 points for every accepted price correction.</p>
          </div>
          <div className="text-right">
            <Trophy className="size-5 text-accent ml-auto" />
            <p className="font-display text-4xl font-bold">{balance}</p>
          </div>
        </div>

        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Redeem</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {REWARDS.map((r) => (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-5 flex flex-col">
                <Gift className="size-5 text-brand" />
                <p className="mt-3 font-semibold leading-snug">{r.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{r.cost} points</p>
                <button
                  onClick={() => redeem(r)}
                  disabled={balance < r.cost}
                  className="mt-4 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-40"
                >
                  {balance < r.cost ? `Need ${r.cost - balance} more` : "Redeem"}
                </button>
              </div>
            ))}
          </div>
        </section>

        {redemptions && redemptions.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Your coupons</h2>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {redemptions.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="text-sm">{r.reward}</span>
                  <span className="font-mono text-xs bg-secondary rounded px-2 py-1">{r.code}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Your price reports</h2>
          {!reports || reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <Flag className="mx-auto size-8 text-brand" />
              <p className="mt-2 font-medium">No reports yet.</p>
              <p className="text-sm text-muted-foreground">
                Spot a wrong price in store? Report it from any product page.
              </p>
              <Link
                to="/"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-brand-foreground font-semibold"
              >
                Find products
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {(r.products as { name: string } | null)?.name ?? "Product"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(r.stores as { chain: string } | null)?.chain ?? "Store"} ·{" "}
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="font-mono text-sm">{formatPrice(r.price_cents, r.currency)}</p>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      r.status === "approved" ? "bg-savings/15 text-savings" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {r.status === "approved" ? <CheckCircle2 className="size-3" /> : <Clock className="size-3" />}
                    {r.status === "approved" ? "+10 pts" : "Pending"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
