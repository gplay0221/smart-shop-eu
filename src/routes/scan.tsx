import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { ScanBarcode, Search } from "lucide-react";
import { toast } from "sonner";

const BarcodeScanner = lazy(() => import("@/components/barcode-scanner"));

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Scan a barcode · EuroSaver" },
      {
        name: "description",
        content: "Scan any grocery barcode to instantly compare supermarket prices near you and find the cheapest store.",
      },
      { property: "og:title", content: "Scan a barcode · EuroSaver" },
      { property: "og:description", content: "Instant price comparison from any grocery barcode." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScanPage,
});

function ScanPage() {
  const navigate = useNavigate();
  const [manual, setManual] = useState("");
  const [looking, setLooking] = useState(false);

  const resolve = useServerFn(resolveBarcode);

  const lookup = useCallback(
    async (code: string) => {
      const barcode = code.trim();
      setLooking(true);
      try {
        const product = await resolve({ data: { barcode } });
        if (!product) {
          toast.error(`No product found for ${barcode}`);
          return;
        }
        toast.success(
          `Found ${[product.brand, product.name].filter(Boolean).join(" ")}`,
          product.source === "openfoodfacts"
            ? { description: "Imported from the open product database — prices will fill in as shoppers report them." }
            : undefined,
        );
        navigate({ to: "/product/$id", params: { id: product.id } });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lookup failed");
      } finally {
        setLooking(false);
      }
    },
    [navigate, resolve],
  );

  return (
    <div className="min-h-screen bg-surface pb-24">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-brand flex items-center gap-1.5">
            <ScanBarcode className="size-3.5" /> Instant compare
          </p>
          <h1 className="font-display text-3xl font-bold mt-1">Scan a barcode</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Point your camera at any product barcode to jump straight to the cheapest store near you.
          </p>
        </div>

        <ClientOnly
          fallback={
            <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Preparing camera…
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Starting scanner…
              </div>
            }
          >
            <BarcodeScanner onDetected={lookup} />
          </Suspense>
        </ClientOnly>

        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) lookup(manual);
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              inputMode="numeric"
              placeholder="Or type the barcode number"
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:border-brand"
            />
          </div>
          <button
            type="submit"
            disabled={looking || !manual.trim()}
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
          >
            {looking ? "Looking…" : "Compare"}
          </button>
        </form>
      </main>
    </div>
  );
}
