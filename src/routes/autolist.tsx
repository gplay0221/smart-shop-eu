import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "@/hooks/use-location";
import { usePantry } from "@/hooks/use-pantry";
import { buildAutoList, type PurchaseRow } from "@/lib/auto-list";
import { priceIngredients } from "@/lib/price-match";
import { formatPrice } from "@/lib/location";
import { Wand2, Loader2, ShoppingCart, History } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/autolist")({
  head: () => ({
    meta: [
      { title: "Automatic shopping list — EuroSaver" },
      {
        name: "description",
        content:
          "EuroSaver builds your weekly shopping list automatically from the last 3 months of purchases, your usage rhythm and what is still in your pantry.",
      },
      { property: "og:title", content: "Automatic shopping list — EuroSaver" },
      { property: "og:description", content: "Your restock list, predicted from your own buying habits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutoListPage,
});

function AutoListPage() {
  const { user, ready } = useAuth();
  const { location } = useLocation();
  const navigate = useNavigate();
  const { data: pantry = [] } = usePantry();
  const [selected, setSelected] = useState<Record<string, boolean> | null>(null);
  const [creating, setCreating] = useState(false);

  const since = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["purchases", user?.id, since],
    enabled: ready && !!user,
    queryFn: async (): Promise<PurchaseRow[]> => {
      const { data, error } = await supabase
        .from("purchases")
        .select("product_id,name,quantity,unit_price_cents,currency,purchased_on")
        .gte("purchased_on", since)
        .order("purchased_on", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PurchaseRow[];
    },
  });

  const suggestions = useMemo(
    () => buildAutoList(purchases, pantry.map((p) => p.name)),
    [purchases, pantry],
  );

  const checks = selected ?? Object.fromEntries(suggestions.map((s) => [s.key, s.dueScore >= 0.8 && !s.inPantry]));
  const chosen = suggestions.filter((s) => checks[s.key]);
  const estimate = chosen.reduce((sum, s) => sum + s.avgPriceCents * s.avgQuantity, 0);

  function toggle(key: string) {
    setSelected({ ...checks, [key]: !checks[key] });
  }

  async function createList() {
    if (!user) return;
    if (!location) { toast.error("Choose your city in the header first"); return; }
    if (chosen.length === 0) { toast.error("Select at least one item"); return; }
    setCreating(true);
    try {
      const matched = await priceIngredients(
        chosen.map((s) => ({ name: s.name, quantity: String(s.avgQuantity) })),
        location.cityId,
      );
      const buyable = matched.filter((m) => m.product && m.cheapest);
      if (buyable.length === 0) {
        toast.error("None of these are in the local catalogue yet");
        return;
      }
      const { data: list, error } = await supabase
        .from("shopping_lists")
        .insert({ user_id: user.id, name: `Auto restock · ${new Date().toLocaleDateString()}`, city_id: location.cityId })
        .select()
        .single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from("list_items").insert(
        buyable.map((m) => ({
          list_id: list.id,
          product_id: m.product!.id,
          store_id: m.cheapest!.store.id,
          quantity: Math.max(1, parseInt(m.quantity, 10) || 1),
          price_cents: m.cheapest!.price_cents,
          currency: m.cheapest!.currency,
        })),
      );
      if (itemsError) throw itemsError;

      toast.success(`Created a list with ${buyable.length} items`);
      navigate({ to: "/lists/$id", params: { id: list.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the list");
    } finally {
      setCreating(false);
    }
  }

  if (ready && !user) {
    return (
      <div className="min-h-screen bg-surface">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold">Automatic shopping list</h1>
          <p className="mt-2 text-muted-foreground">Sign in so we can learn from your purchase history.</p>
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
          <Wand2 className="size-3.5" /> Predicted restock
        </p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight">Your list, written for you</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          We look at the last 3 months of scanned receipts and purchases, work out how often you buy each item, how much
          you usually take and what is still in your pantry — then propose exactly what is due.
        </p>

        {isLoading && (
          <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Reading your purchase history…
          </p>
        )}

        {!isLoading && suggestions.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <History className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 font-semibold">No purchase history yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Scan a receipt or tick items off a shopping list — after a few shops we can predict your restocks.
            </p>
            <Link to="/receipt" className="mt-5 inline-flex rounded-xl bg-brand px-5 py-2.5 font-semibold text-brand-foreground">
              Scan a receipt
            </Link>
          </div>
        )}

        {suggestions.length > 0 && (
          <>
            <ul className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
              {suggestions.map((s) => (
                <li key={s.key} className="flex items-center gap-3 p-4">
                  <input
                    type="checkbox"
                    checked={!!checks[s.key]}
                    onChange={() => toggle(s.key)}
                    className="size-4"
                    aria-label={`Include ${s.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {s.name}
                      {s.dueScore >= 1 && !s.inPantry && (
                        <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                          due now
                        </span>
                      )}
                      {s.inPantry && (
                        <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                          in pantry
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.reason}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">×{s.avgQuantity}</p>
                    <p className="text-xs text-muted-foreground">~{formatPrice(s.avgPriceCents, s.currency)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink p-5 text-background">
              <div>
                <p className="text-xs opacity-60">{chosen.length} items · estimated from what you usually pay</p>
                <p className="font-display text-2xl font-bold">{formatPrice(estimate, chosen[0]?.currency ?? "EUR")}</p>
              </div>
              <button
                onClick={createList}
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                {creating ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />}
                Create shopping list at cheapest stores
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
