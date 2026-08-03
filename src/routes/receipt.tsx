import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "@/hooks/use-location";
import { scanReceipt, type ReceiptLine } from "@/lib/receipt.functions";
import { formatPrice } from "@/lib/location";
import { ReceiptText, Upload, Loader2, Apple, Coins } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/receipt")({
  head: () => ({
    meta: [
      { title: "Receipt scanner — EuroSaver" },
      {
        name: "description",
        content:
          "Snap your supermarket receipt: EuroSaver reads every line, shares the real prices with the community and stocks your pantry automatically.",
      },
      { property: "og:title", content: "Receipt scanner — EuroSaver" },
      { property: "og:description", content: "Turn paper receipts into crowdsourced prices and a stocked pantry." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReceiptPage,
});

type Product = { id: string; name: string; unit: string };

function bestMatch(name: string, products: Product[]) {
  const q = name.toLowerCase();
  let best: Product | null = null;
  let bestScore = 0;
  for (const p of products) {
    const n = p.name.toLowerCase();
    let score = 0;
    if (n === q) score = 100;
    else if (n.includes(q) || q.includes(n)) score = 60;
    else {
      const qT = q.split(/\s+/).filter(Boolean);
      const nT = n.split(/\s+/).filter(Boolean);
      for (const t of qT) if (nT.some((nt) => nt.includes(t) || t.includes(nt))) score += 20;
    }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 40 ? best : null;
}

type Row = ReceiptLine & { productId: string | null; include: boolean };

function ReceiptPage() {
  const { user, ready } = useAuth();
  const { location } = useLocation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const runScan = useServerFn(scanReceipt);
  const fileRef = useRef<HTMLInputElement>(null);

  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [currency, setCurrency] = useState("EUR");
  const [storeId, setStoreId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products-min"],
    queryFn: async (): Promise<Product[]> => {
      const { data } = await supabase.from("products").select("id,name,unit");
      return data ?? [];
    },
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["stores", location?.cityId],
    enabled: !!location,
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id,chain,address").eq("city_id", location!.cityId);
      return data ?? [];
    },
  });

  const total = useMemo(
    () => (rows ?? []).reduce((s, r) => s + r.price_cents * r.quantity, 0),
    [rows],
  );

  async function onFile(file: File) {
    if (file.size > 6_000_000) { toast.error("Image too large — keep it under 6MB"); return; }
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("Could not read file"));
      fr.readAsDataURL(file);
    });
    setPreview(dataUrl);
    setScanning(true);
    try {
      const result = await runScan({ data: { imageDataUrl: dataUrl } });
      setCurrency(result.currency || "EUR");
      setRows(
        result.lines.map((l) => ({ ...l, productId: bestMatch(l.name, products)?.id ?? null, include: true })),
      );
      if (result.store) {
        const guess = stores.find((s) => s.chain.toLowerCase() === result.store!.toLowerCase());
        if (guess) setStoreId(guess.id);
      }
      if (result.lines.length === 0) toast.error("No items found on that receipt");
      else toast.success(`Found ${result.lines.length} items`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function submitPrices() {
    if (!user) { toast.error("Sign in first"); return; }
    if (!storeId) { toast.error("Pick which store this receipt is from"); return; }
    const matched = (rows ?? []).filter((r) => r.include && r.productId);
    if (matched.length === 0) { toast.error("Match at least one line to a product"); return; }
    setSaving(true);
    const { error } = await supabase.from("price_reports").insert(
      matched.map((r) => ({
        product_id: r.productId!,
        store_id: storeId,
        price_cents: Math.round(r.price_cents / Math.max(1, r.quantity)),
        currency,
      })),
    );
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["rewards"] });
    toast.success(`Shared ${matched.length} prices — points on the way!`);
  }

  async function addToPantry() {
    if (!user) { toast.error("Sign in first"); return; }
    const chosen = (rows ?? []).filter((r) => r.include);
    if (chosen.length === 0) { toast.error("Nothing selected"); return; }
    const { error } = await supabase.from("pantry_items").insert(
      chosen.map((r) => ({
        user_id: user.id,
        product_id: r.productId,
        name: r.name,
        quantity: r.quantity,
        unit: "pc",
      })),
    );
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["pantry"] });
    toast.success(`Added ${chosen.length} items to your pantry`);
    navigate({ to: "/pantry" });
  }

  if (ready && !user) {
    return (
      <div className="min-h-screen bg-surface">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold">Receipt scanner</h1>
          <p className="mt-2 text-muted-foreground">Sign in to scan receipts, earn points and stock your pantry.</p>
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
          <ReceiptText className="size-3.5" /> Receipt scanning
        </p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight">Snap your receipt</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          We read every line, let you share the real shelf prices with other shoppers (and earn points), then stock your
          pantry in one tap.
        </p>

        <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {scanning ? "Reading receipt…" : "Upload or photograph receipt"}
          </button>
          {preview && (
            <img src={preview} alt="Receipt preview" className="mx-auto mt-5 max-h-64 rounded-xl border border-border object-contain" />
          )}
        </div>

        {rows && rows.length > 0 && (
          <section className="mt-6">
            <div className="rounded-2xl border border-border bg-card p-5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Store</label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
              >
                <option value="">Select the store…</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.chain} — {s.address}</option>
                ))}
              </select>
              {!location && <p className="mt-2 text-xs text-muted-foreground">Pick a city in the header to list stores.</p>}
            </div>

            <ul className="mt-4 rounded-2xl border border-border bg-card divide-y divide-border">
              {rows.map((r, idx) => (
                <li key={idx} className="flex flex-wrap items-center gap-3 p-4">
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) =>
                      setRows((prev) => prev!.map((x, i) => (i === idx ? { ...x, include: e.target.checked } : x)))
                    }
                    className="size-4"
                    aria-label={`Include ${r.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.quantity} × {formatPrice(Math.round(r.price_cents / Math.max(1, r.quantity)), currency)}
                    </p>
                  </div>
                  <select
                    value={r.productId ?? ""}
                    onChange={(e) =>
                      setRows((prev) => prev!.map((x, i) => (i === idx ? { ...x, productId: e.target.value || null } : x)))
                    }
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs max-w-[14rem]"
                    aria-label={`Match ${r.name} to a catalogue product`}
                  >
                    <option value="">No catalogue match</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <span className="font-semibold">{formatPrice(r.price_cents * r.quantity, currency)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink p-5 text-background">
              <div>
                <p className="text-xs opacity-60">Receipt total</p>
                <p className="font-display text-2xl font-bold">{formatPrice(total, currency)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={submitPrices}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Coins className="size-4" /> Share prices & earn points
                </button>
                <button
                  onClick={addToPantry}
                  className="inline-flex items-center gap-2 rounded-lg border border-background/30 px-4 py-2.5 font-semibold hover:bg-background/10"
                >
                  <Apple className="size-4" /> Add to pantry
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
