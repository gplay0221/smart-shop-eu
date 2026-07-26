import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "@/hooks/use-location";
import { usePantry, type PantryItem } from "@/hooks/use-pantry";
import { suggestMeal, type MealSuggestion } from "@/lib/ai.functions";
import { priceIngredients, daysUntil, type MatchedItem } from "@/lib/price-match";
import { formatPrice } from "@/lib/location";
import { Apple, Plus, Trash2, Loader2, ChefHat, ShoppingBasket, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pantry")({
  head: () => ({
    meta: [
      { title: "Pantry & expiry tracker — EuroSaver" },
      {
        name: "description",
        content:
          "Track what's in your pantry, see what expires soon, and turn near-expiry food into cheap recipes with one-tap shopping lists.",
      },
      { property: "og:title", content: "Pantry & expiry tracker — EuroSaver" },
      { property: "og:description", content: "Track food at home, cut waste, and turn expiring items into low-cost meals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PantryPage,
});

function expiryTone(days: number | null) {
  if (days === null) return { label: "No date", cls: "bg-muted text-muted-foreground" };
  if (days < 0) return { label: "Expired", cls: "bg-destructive/15 text-destructive" };
  if (days < 3) return { label: `${days}d left`, cls: "bg-destructive/15 text-destructive" };
  if (days < 7) return { label: `${days}d left`, cls: "bg-accent/20 text-accent-foreground" };
  return { label: `${days}d left`, cls: "bg-brand-soft text-brand" };
}

function PantryPage() {
  const { user, ready } = useAuth();
  const { location } = useLocation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: items = [], isLoading } = usePantry();
  const runSuggest = useServerFn(suggestMeal);

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("pc");
  const [expires, setExpires] = useState("");
  const [recipe, setRecipe] = useState<{ meal: MealSuggestion; matched: MatchedItem[] } | null>(null);

  const nearExpiry = useMemo(
    () => items.filter((i) => { const d = daysUntil(i.expires_at); return d !== null && d <= 7; }),
    [items],
  );

  const addMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in first");
      if (!name.trim()) throw new Error("Enter an item name");
      const { error } = await supabase.from("pantry_items").insert({
        user_id: user.id,
        name: name.trim(),
        quantity,
        unit,
        expires_at: expires || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName(""); setQuantity(1); setUnit("pc"); setExpires("");
      qc.invalidateQueries({ queryKey: ["pantry"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add"),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pantry_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pantry"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove"),
  });

  const wasteMut = useMutation({
    mutationFn: async () => {
      if (!location) throw new Error("Pick a city in the header first");
      const pool: PantryItem[] = nearExpiry.length ? nearExpiry : items;
      if (pool.length === 0) throw new Error("Add some pantry items first");
      const meal = await runSuggest({
        data: {
          mealType: "Dinner",
          servings: 2,
          pantryItems: pool.map((i) => i.name),
          pantryOnlyFocus: true,
        },
      });
      const matched = await priceIngredients(meal.ingredients, location.cityId);
      setRecipe({ meal, matched });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const haveNames = useMemo(() => new Set(items.map((i) => i.name.toLowerCase())), [items]);
  const missing = (recipe?.matched ?? []).filter(
    (m) => !haveNames.has(m.ingredient.toLowerCase()) && m.product && m.cheapest,
  );
  const missingTotal = missing.reduce((s, m) => s + (m.cheapest?.price_cents ?? 0), 0);

  async function addMissingToList() {
    if (!user || !recipe || !location) return;
    if (missing.length === 0) { toast.error("Nothing missing — you can cook it now!"); return; }
    const { data: list, error } = await supabase
      .from("shopping_lists")
      .insert({ user_id: user.id, name: recipe.meal.dish, city_id: location.cityId })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    const { error: e2 } = await supabase.from("list_items").insert(
      missing.map((m) => ({
        list_id: list.id,
        product_id: m.product!.id,
        store_id: m.cheapest!.store.id,
        price_cents: m.cheapest!.price_cents,
        currency: m.cheapest!.currency,
        quantity: 1,
      })),
    );
    if (e2) { toast.error(e2.message); return; }
    qc.invalidateQueries({ queryKey: ["lists"] });
    navigate({ to: "/lists/$id", params: { id: list.id } });
  }

  if (ready && !user) {
    return (
      <div className="min-h-screen bg-surface">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold">Your pantry</h1>
          <p className="mt-2 text-muted-foreground">Sign in to track what you have at home and cut food waste.</p>
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
          <Apple className="size-3.5" /> Pantry
        </p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight">What you have at home</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          Track expiry dates, waste less, and turn what's about to go off into a cheap dinner.
        </p>

        {nearExpiry.length >= 1 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-4 mt-0.5 text-accent-foreground" />
              <div>
                <p className="font-semibold">{nearExpiry.length} item{nearExpiry.length > 1 ? "s" : ""} expiring within a week</p>
                <p className="text-sm text-muted-foreground">{nearExpiry.map((i) => i.name).join(", ")}</p>
              </div>
            </div>
            <button
              onClick={() => wasteMut.mutate()}
              disabled={wasteMut.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 font-semibold text-background hover:opacity-90 disabled:opacity-50"
            >
              {wasteMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <ChefHat className="size-4" />}
              Waste-to-Meal
            </button>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Add an item</label>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. milk, spinach, chicken breast"
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand"
            />
            <input
              type="number" min={1} value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
            />
            <input
              value={unit} onChange={(e) => setUnit(e.target.value)}
              className="w-20 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
              aria-label="Unit"
            />
            <input
              type="date" value={expires} onChange={(e) => setExpires(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
              aria-label="Expiry date"
            />
            <button
              onClick={() => addMut.mutate()}
              disabled={addMut.isPending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="size-4" /> Add
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card divide-y divide-border">
          {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && items.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">Your pantry is empty. Add your first item above.</p>
          )}
          {items.map((i) => {
            const tone = expiryTone(daysUntil(i.expires_at));
            return (
              <div key={i.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{i.quantity} {i.unit}{i.expires_at ? ` · expires ${i.expires_at}` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone.cls}`}>{tone.label}</span>
                  <button onClick={() => removeMut.mutate(i.id)} aria-label={`Remove ${i.name}`} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {items.length > 0 && nearExpiry.length === 0 && (
          <button
            onClick={() => wasteMut.mutate()}
            disabled={wasteMut.isPending}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 font-semibold hover:border-brand disabled:opacity-50"
          >
            {wasteMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <ChefHat className="size-4" />}
            Cook something with my pantry
          </button>
        )}

        {recipe && (
          <section className="mt-8">
            <div className="rounded-2xl bg-ink p-6 sm:p-8 text-background shadow-xl">
              <p className="text-xs font-bold uppercase tracking-widest text-accent">Waste-to-Meal</p>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold">{recipe.meal.dish}</h2>
              <p className="mt-1 text-sm opacity-80 max-w-2xl">{recipe.meal.description}</p>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs opacity-60">Missing ingredients cost</p>
                  <p className="font-display text-3xl font-bold">
                    {formatPrice(missingTotal, missing[0]?.cheapest?.currency ?? "EUR")}
                  </p>
                </div>
                <button
                  onClick={addMissingToList}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-foreground hover:opacity-90"
                >
                  <ShoppingBasket className="size-4" /> Add missing to a new list
                </button>
              </div>
            </div>
            <ul className="mt-4 rounded-2xl border border-border bg-card divide-y divide-border">
              {recipe.matched.map((m, idx) => {
                const have = haveNames.has(m.ingredient.toLowerCase());
                return (
                  <li key={idx} className="flex items-center justify-between gap-3 p-4 text-sm">
                    <div>
                      <p className="font-medium">{m.product?.name ?? m.ingredient}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.ingredient} · {m.quantity}
                        {m.cheapest ? ` · ${m.cheapest.store.chain}` : " · not stocked nearby"}
                      </p>
                    </div>
                    {have ? (
                      <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">In pantry</span>
                    ) : m.cheapest ? (
                      <span className="font-semibold">{formatPrice(m.cheapest.price_cents, m.cheapest.currency)}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
