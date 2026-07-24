import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { useLocation } from "@/hooks/use-location";
import { useAuth } from "@/hooks/use-auth";
import { suggestMeal, type MealSuggestion } from "@/lib/ai.functions";
import { formatPrice } from "@/lib/location";
import { Sparkles, ChefHat, ShoppingBasket, Loader2, Store as StoreIcon, MapPin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "Meal planner — EuroSaver" },
      { name: "description", content: "Tell EuroSaver what you want to eat or drink today and we'll build the cheapest shopping list across supermarkets in your city." },
      { property: "og:title", content: "Meal planner — EuroSaver" },
      { property: "og:description", content: "AI-powered meal suggestions with cheapest supermarket prices." },
    ],
  }),
  component: PlanPage,
});

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack", "Drink"] as const;

type PlanItem = {
  ingredient: string;
  quantity: string;
  product: { id: string; name: string; unit: string; category: string } | null;
  cheapest: { price_cents: number; currency: string; store: { id: string; chain: string; address: string } } | null;
};

function PlanPage() {
  const { location } = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const runSuggest = useServerFn(suggestMeal);

  const [mealType, setMealType] = useState<string>("Dinner");
  const [craving, setCraving] = useState("");
  const [servings, setServings] = useState(2);
  const [suggestion, setSuggestion] = useState<MealSuggestion | null>(null);
  const [plan, setPlan] = useState<PlanItem[] | null>(null);

  const suggestMut = useMutation({
    mutationFn: async () => {
      if (!location) throw new Error("Pick a city first");
      const s = await runSuggest({ data: { mealType, craving, servings } });
      setSuggestion(s);
      // Match ingredients to products in this city
      type Product = { id: string; name: string; unit: string; category: string; image_url: string | null };
      const { data: productsData } = await supabase.from("products").select("*");
      const products: Product[] = productsData ?? [];
      if (products.length === 0) return [] as PlanItem[];
      const { data: stores } = await supabase.from("stores").select("*").eq("city_id", location.cityId);
      const storeIds = (stores ?? []).map((st) => st.id);
      const storeMap = new Map((stores ?? []).map((st) => [st.id, st]));
      const { data: prices } = await supabase
        .from("prices").select("*").in("store_id", storeIds);
      const cheapestByProduct = new Map<string, { price_cents: number; currency: string; store_id: string }>();
      for (const p of prices ?? []) {
        const cur = cheapestByProduct.get(p.product_id);
        if (!cur || p.price_cents < cur.price_cents) {
          cheapestByProduct.set(p.product_id, { price_cents: p.price_cents, currency: p.currency, store_id: p.store_id });
        }
      }

      function match(name: string) {
        const q = name.toLowerCase();
        // best-effort fuzzy: contains match, then token overlap
        let best: Product | null = null;
        let bestScore = 0;
        for (const p of products) {
          const n = p.name.toLowerCase();
          let score = 0;
          if (n === q) score = 100;
          else if (n.includes(q) || q.includes(n)) score = 60;
          else {
            const qTokens = q.split(/\s+/).filter(Boolean);
            const nTokens = n.split(/\s+/).filter(Boolean);
            for (const t of qTokens) if (nTokens.some((nt) => nt.includes(t) || t.includes(nt))) score += 20;
          }
          if (score > bestScore) { bestScore = score; best = p; }
        }
        return bestScore >= 20 ? best : null;
      }

      const items: PlanItem[] = s.ingredients.map((ing) => {
        const product = match(ing.name);
        const c = product ? cheapestByProduct.get(product.id) : undefined;
        const store = c ? storeMap.get(c.store_id) : undefined;
        return {
          ingredient: ing.name,
          quantity: ing.quantity,
          product: product ? { id: product.id, name: product.name, unit: product.unit, category: product.category } : null,
          cheapest: c && store ? { price_cents: c.price_cents, currency: c.currency, store: { id: store.id, chain: store.chain, address: store.address } } : null,
        };
      });
      setPlan(items);
      return items;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  async function addAllToNewList() {
    if (!user) { toast.error("Sign in to save shopping lists"); navigate({ to: "/auth" }); return; }
    if (!plan || !suggestion || !location) return;
    const matched = plan.filter((i) => i.product && i.cheapest);
    if (matched.length === 0) { toast.error("No items available in stores yet"); return; }
    const { data: list, error } = await supabase.from("shopping_lists")
      .insert({ user_id: user.id, name: suggestion.dish, city_id: location.cityId }).select().single();
    if (error) { toast.error(error.message); return; }
    const inserts = matched.map((i) => ({
      list_id: list.id,
      product_id: i.product!.id,
      store_id: i.cheapest!.store.id,
      price_cents: i.cheapest!.price_cents,
      currency: i.cheapest!.currency,
      quantity: 1,
    }));
    const { error: e2 } = await supabase.from("list_items").insert(inserts);
    if (e2) { toast.error(e2.message); return; }
    qc.invalidateQueries({ queryKey: ["lists"] });
    toast.success(`Added ${inserts.length} items to "${suggestion.dish}"`);
    navigate({ to: "/lists/$id", params: { id: list.id } });
  }

  // Group plan by cheapest store
  const grouped = plan
    ? plan.reduce((acc, item) => {
        if (!item.cheapest) {
          (acc["_missing"] ??= []).push(item);
        } else {
          const key = item.cheapest.store.chain + "|" + item.cheapest.store.id;
          (acc[key] ??= []).push(item);
        }
        return acc;
      }, {} as Record<string, PlanItem[]>)
    : null;

  const total = plan?.reduce((s, i) => s + (i.cheapest?.price_cents ?? 0), 0) ?? 0;

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-brand flex items-center gap-1.5">
            <Sparkles className="size-3.5" /> AI meal planner
          </p>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight">
            What do you want to eat today?
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Tell us the vibe and we'll suggest a dish and price out every ingredient at the cheapest supermarket
            {location ? <> in <span className="font-semibold text-foreground">{location.cityName}</span>.</> : <>. Pick a city first.</>}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Meal type</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {MEAL_TYPES.map((m) => (
              <button
                key={m}
                onClick={() => setMealType(m)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition ${
                  mealType === m
                    ? "bg-ink text-background border-ink"
                    : "bg-background border-border hover:border-brand"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <label className="mt-5 block text-xs font-bold uppercase tracking-widest text-muted-foreground">Craving (optional)</label>
          <input
            value={craving}
            onChange={(e) => setCraving(e.target.value)}
            placeholder="e.g. pasta bolognese, healthy smoothie, taco night"
            className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand"
          />

          <div className="mt-5 flex items-center gap-3">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Servings</label>
            <input
              type="number" min={1} max={12} value={servings}
              onChange={(e) => setServings(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
              className="w-20 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-brand"
            />
          </div>

          <button
            onClick={() => suggestMut.mutate()}
            disabled={!location || suggestMut.isPending}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-brand-foreground font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {suggestMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <ChefHat className="size-4" />}
            {suggestMut.isPending ? "Cooking up ideas…" : "Suggest a meal & price it"}
          </button>
          {!location && <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1"><MapPin className="size-3" /> Pick a city in the header first.</p>}
        </div>

        {suggestion && plan && (
          <section className="mt-8">
            <div className="rounded-2xl bg-ink text-background p-6 sm:p-8 shadow-xl">
              <p className="text-xs font-bold uppercase tracking-widest text-accent">Today's suggestion</p>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold">{suggestion.dish}</h2>
              <p className="mt-1 text-sm opacity-80 max-w-2xl">{suggestion.description}</p>
              <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs opacity-60">Estimated total</p>
                  <p className="font-display text-3xl font-bold">{formatPrice(total, plan.find(p=>p.cheapest)?.cheapest?.currency ?? "EUR")}</p>
                </div>
                <button
                  onClick={addAllToNewList}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-accent-foreground font-semibold hover:opacity-90"
                >
                  <ShoppingBasket className="size-4" /> Add all to a new list
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {Object.entries(grouped!).map(([key, items]) => {
                if (key === "_missing") {
                  return (
                    <div key={key} className="rounded-xl border border-dashed border-border bg-card p-5">
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Not stocked in {location?.cityName} yet</p>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {items.map((i, idx) => (
                          <li key={idx}>• {i.ingredient} <span className="opacity-60">({i.quantity})</span></li>
                        ))}
                      </ul>
                    </div>
                  );
                }
                const chain = key.split("|")[0];
                const subtotal = items.reduce((s, i) => s + (i.cheapest?.price_cents ?? 0), 0);
                const currency = items[0]?.cheapest?.currency ?? "EUR";
                return (
                  <div key={key} className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="size-9 rounded-lg bg-brand-soft grid place-items-center">
                          <StoreIcon className="size-4 text-brand" />
                        </div>
                        <div>
                          <p className="font-semibold">{chain}</p>
                          <p className="text-xs text-muted-foreground">{items[0]?.cheapest?.store.address}</p>
                        </div>
                      </div>
                      <p className="font-display text-lg font-bold">{formatPrice(subtotal, currency)}</p>
                    </div>
                    <ul className="divide-y divide-border">
                      {items.map((i, idx) => (
                        <li key={idx} className="flex items-center justify-between py-2 text-sm">
                          <div>
                            <p className="font-medium">{i.product?.name ?? i.ingredient}</p>
                            <p className="text-xs text-muted-foreground">{i.ingredient} · {i.quantity}</p>
                          </div>
                          <p className="font-semibold">{formatPrice(i.cheapest!.price_cents, i.cheapest!.currency)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
