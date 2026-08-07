import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Resolve a scanned barcode. Uses the in-app catalogue first, then the keyless
 * Open Food Facts database, importing the product so prices can attach later.
 */
export const resolveBarcode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ barcode: z.string().regex(/^\d{8,14}$/) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("products")
      .select("id, name, brand")
      .eq("barcode", data.barcode)
      .maybeSingle();
    if (existing) return { ...existing, source: "catalogue" as const };

    const { offLookupBarcode } = await import("@/lib/openfoodfacts.server");
    const off = await offLookupBarcode(data.barcode);
    if (!off) return null;

    const { data: inserted } = await supabaseAdmin
      .from("products")
      .insert({
        name: off.name,
        brand: off.brand,
        category: off.category ?? "Other",
        unit: off.unit ?? "1 pc",
        barcode: off.barcode,
        image_url: off.image_url,
      })
      .select("id, name, brand")
      .maybeSingle();

    return inserted ? { ...inserted, source: "openfoodfacts" as const } : null;
  });
