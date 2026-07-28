import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/location";
import { Flag, X } from "lucide-react";
import { toast } from "sonner";

export function ReportPriceDialog({
  productId,
  storeId,
  storeName,
  currentCents,
  currency,
  onClose,
}: {
  productId: string;
  storeId: string;
  storeName: string;
  currentCents: number;
  currency: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [euros, setEuros] = useState((currentCents / 100).toFixed(2));
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(euros.replace(",", "."));
    if (!isFinite(value) || value <= 0) {
      toast.error("Enter a valid price");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("price_reports")
      .insert({ product_id: productId, store_id: storeId, price_cents: Math.round(value * 100), currency })
      .select("status")
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.status === "approved") {
      toast.success("Thanks! Price updated · +10 points");
    } else {
      toast.success("Thanks! Your report is under review");
    }
    qc.invalidateQueries({ queryKey: ["comparison"] });
    qc.invalidateQueries({ queryKey: ["points"] });
    qc.invalidateQueries({ queryKey: ["my-reports"] });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto mt-28 w-[min(440px,92vw)] rounded-2xl bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold flex items-center gap-2">
              <Flag className="size-4 text-brand" /> Report a different price
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {storeName} · we list {formatPrice(currentCents, currency)}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={euros}
              onChange={(e) => setEuros(e.target.value)}
              className="w-32 rounded-lg border border-border bg-background pl-7 pr-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
          >
            {saving ? "Sending…" : "Submit"}
          </button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Realistic corrections are applied instantly and earn you 10 points. Outliers go to review.
        </p>
      </div>
    </div>
  );
}
