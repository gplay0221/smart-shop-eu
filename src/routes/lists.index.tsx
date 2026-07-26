import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "@/hooks/use-location";
import { useProfile } from "@/hooks/use-profile";
import { useWeeklySavings } from "@/hooks/use-savings";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, ListChecks, Trash2, Sparkles, TrendingDown } from "lucide-react";
import { formatPrice } from "@/lib/location";

export const Route = createFileRoute("/lists")({
  head: () => ({
    meta: [
      { title: "My Shopping Lists · EuroSaver" },
      { name: "description", content: "Your smart shopping lists grouped by supermarket." },
      { property: "og:title", content: "Shopping Lists · EuroSaver" },
      { property: "og:description", content: "Save money on every grocery trip." },
    ],
  }),
  component: ListsPage,
});

function ListsPage() {
  const { user, ready } = useAuth();
  const { location } = useLocation();
  const { needsOnboarding } = useProfile();
  const { data: savings } = useWeeklySavings();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");

  useEffect(() => {
    if (ready && !user) navigate({ to: "/auth" });
  }, [ready, user, navigate]);

  useEffect(() => {
    if (needsOnboarding) navigate({ to: "/onboarding" });
  }, [needsOnboarding, navigate]);

  const { data: lists } = useQuery({
    queryKey: ["lists"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("*, list_items(price_cents, quantity, currency, checked)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim()) return;
    const { data, error } = await supabase.from("shopping_lists")
      .insert({ user_id: user.id, name: name.trim(), city_id: location?.cityId ?? null })
      .select().single();
    if (error) return toast.error(error.message);
    setName("");
    qc.invalidateQueries({ queryKey: ["lists"] });
    navigate({ to: "/lists/$id", params: { id: data.id } });
  }

  async function deleteList(id: string) {
    if (!confirm("Delete this list?")) return;
    const { error } = await supabase.from("shopping_lists").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["lists"] });
  }

  if (!ready || !user) return null;

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-bold">My Shopping Lists</h1>
            <p className="text-muted-foreground text-sm mt-1">Grouped by supermarket so you know exactly where to go.</p>
          </div>
        </div>

        {savings && savings.savedCents > 0 && (
          <div className="mb-6 rounded-2xl bg-gradient-to-r from-brand to-brand/80 text-brand-foreground p-5 sm:p-6 shadow-lg flex items-center gap-4">
            <div className="grid place-items-center size-12 rounded-full bg-white/15">
              <Sparkles className="size-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Micro-win of the week</p>
              <p className="font-display text-2xl sm:text-3xl font-bold mt-0.5 truncate">
                You saved {formatPrice(savings.savedCents, savings.currency)} this week
              </p>
              <p className="text-xs opacity-80 mt-0.5">
                vs. average prices, across {savings.itemCount} checked item{savings.itemCount === 1 ? "" : "s"}.
              </p>
            </div>
            <TrendingDown className="hidden sm:block size-8 opacity-40" />
          </div>
        )}

        <form onSubmit={createList} className="mb-8 flex gap-2">
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="New list name (e.g. Weekly groceries)"
            className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-brand-foreground hover:opacity-90 inline-flex items-center gap-2">
            <Plus className="size-4" /> Create
          </button>
        </form>

        {lists && lists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <ListChecks className="mx-auto size-8 text-brand" />
            <p className="mt-3 font-medium">No lists yet.</p>
            <p className="text-sm text-muted-foreground">Create your first shopping list above or add products from search.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {lists?.map(l => {
              const items = ((l as any).list_items ?? []) as { price_cents: number; quantity: number; currency: string; checked: boolean }[];
              const total = items.reduce((s, i) => s + i.price_cents * i.quantity, 0);
              const done = items.filter(i => i.checked).length;
              const currency = items[0]?.currency ?? "EUR";
              return (
                <div key={l.id} className="rounded-2xl border border-border bg-card p-5 hover:border-brand/40 transition">
                  <div className="flex items-start justify-between gap-4">
                    <Link to="/lists/$id" params={{ id: l.id }} className="min-w-0 flex-1">
                      <h3 className="font-display font-bold text-lg truncate hover:text-brand">{l.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {items.length} items · {done}/{items.length} done · Updated {new Date(l.updated_at).toLocaleDateString()}
                      </p>
                    </Link>
                    <div className="text-right shrink-0">
                      <p className="font-display font-bold text-xl">{formatPrice(total, currency)}</p>
                      <button
                        onClick={() => deleteList(l.id)}
                        className="mt-1 text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                      >
                        <Trash2 className="size-3" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
