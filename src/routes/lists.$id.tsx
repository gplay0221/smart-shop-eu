import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { formatPrice } from "@/lib/location";
import { ArrowLeft, Trash2, Store as StoreIcon, MapPin, Play, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/lists/$id")({
  head: () => ({
    meta: [
      { title: "Shopping list · EuroSaver" },
      { name: "description", content: "Your shopping list grouped by supermarket." },
      { property: "og:title", content: "Shopping list · EuroSaver" },
      { property: "og:description", content: "Cheapest supermarket routing." },
    ],
  }),
  component: ListDetail,
});

type Row = {
  id: string; list_id: string; product_id: string; store_id: string;
  quantity: number; price_cents: number; currency: string; checked: boolean;
  products: { name: string; category: string; unit: string } | null;
  stores: { chain: string; address: string } | null;
};

function ListDetail() {
  const { id } = Route.useParams();
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => { if (ready && !user) navigate({ to: "/auth" }); }, [ready, user, navigate]);

  const { data: list } = useQuery({
    queryKey: ["list", id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("shopping_lists").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["list-items", id],
    enabled: !!user,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("list_items")
        .select("*, products(name, category, unit), stores(chain, address)")
        .eq("list_id", id)
        .order("created_at");
      if (error) throw error;
      return data as Row[];
    },
  });

  async function toggle(item: Row) {
    await supabase.from("list_items").update({ checked: !item.checked }).eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["list-items", id] });
  }
  async function updateQty(item: Row, qty: number) {
    if (qty < 1) return;
    await supabase.from("list_items").update({ quantity: qty }).eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["list-items", id] });
  }
  async function remove(item: Row) {
    await supabase.from("list_items").delete().eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["list-items", id] });
  }

  if (!ready || !user || !list) return null;

  // group by store
  const groups = new Map<string, { chain: string; address: string; items: Row[]; total: number }>();
  for (const it of items ?? []) {
    if (!it.stores) continue;
    const key = it.store_id;
    if (!groups.has(key)) groups.set(key, { chain: it.stores.chain, address: it.stores.address, items: [], total: 0 });
    const g = groups.get(key)!;
    g.items.push(it);
    g.total += it.price_cents * it.quantity;
  }
  const grouped = Array.from(groups.entries());
  const grandTotal = (items ?? []).reduce((s, i) => s + i.price_cents * i.quantity, 0);
  const currency = items?.[0]?.currency ?? "EUR";

  return (
    <div className="min-h-screen bg-surface pb-24">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <Link to="/lists" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand mb-4">
          <ArrowLeft className="size-4" /> All lists
        </Link>

        <div className="rounded-2xl bg-ink text-background p-6 sm:p-8 mb-8 shadow-xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-accent">Smart List</p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">{list.name}</h1>
              <p className="text-xs opacity-70 mt-1">{groups.size} stop{groups.size === 1 ? "" : "s"} · {items?.length ?? 0} items</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-widest opacity-60">Total</p>
              <p className="font-display text-3xl sm:text-4xl font-bold">{formatPrice(grandTotal, currency)}</p>
            </div>
          </div>
        </div>

        {grouped.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <StoreIcon className="mx-auto size-8 text-brand" />
            <p className="mt-2 font-medium">No items yet.</p>
            <p className="text-sm text-muted-foreground">Search products and add the cheapest options to this list.</p>
            <Link to="/" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-brand-foreground font-semibold">
              Find products
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([storeId, g], idx) => (
              <section key={storeId} className="rounded-2xl border border-border bg-card overflow-hidden">
                <header className="flex items-center justify-between px-5 py-4 bg-brand-soft/50 border-b border-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="grid place-items-center size-8 rounded-lg bg-brand text-brand-foreground font-bold text-sm">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-display font-bold truncate">{g.chain}</h2>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <MapPin className="size-3" /> {g.address}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Subtotal</p>
                    <p className="font-display font-bold">{formatPrice(g.total, currency)}</p>
                  </div>
                </header>
                <ul className="divide-y divide-border">
                  {g.items.map(it => (
                    <li key={it.id} className={`flex items-center gap-3 px-5 py-3 ${it.checked ? "opacity-50" : ""}`}>
                      <button
                        onClick={() => toggle(it)}
                        aria-label={it.checked ? "Uncheck" : "Check"}
                        className={`size-5 rounded border-2 shrink-0 ${it.checked ? "bg-savings border-savings" : "border-border"}`}
                      >
                        {it.checked && <svg viewBox="0 0 20 20" className="text-background"><path d="M5 10l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.5"/></svg>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate ${it.checked ? "line-through" : ""}`}>{it.products?.name}</p>
                        <p className="text-xs text-muted-foreground">{it.products?.unit}</p>
                      </div>
                      <div className="flex items-center gap-1 border border-border rounded-md">
                        <button onClick={() => updateQty(it, it.quantity - 1)} className="size-7 hover:bg-secondary">−</button>
                        <span className="w-6 text-center text-sm">{it.quantity}</span>
                        <button onClick={() => updateQty(it, it.quantity + 1)} className="size-7 hover:bg-secondary">+</button>
                      </div>
                      <p className="font-mono text-sm w-16 text-right">{formatPrice(it.price_cents * it.quantity, it.currency)}</p>
                      <button onClick={() => remove(it)} className="text-muted-foreground hover:text-destructive" aria-label="Remove">
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
