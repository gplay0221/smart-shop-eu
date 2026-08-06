import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public multi-source price lookup used by the price finder. */
export const getLivePrices = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().min(1).max(120),
        gtin: z.string().max(14).optional(),
        postalCode: z.string().max(64).optional(),
        countryCode: z.string().max(2).optional(),
        forceRefresh: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { searchPrices } = await import("@/lib/price-engine/engine.server");
    const { DISCLAIMER } = await import("@/lib/price-engine/types");
    try {
      return await searchPrices({
        query: data.query,
        ...(data.gtin ? { barcode: data.gtin } : {}),
        ...(data.postalCode ? { location: data.postalCode } : {}),
        ...(data.countryCode ? { countryCode: data.countryCode } : {}),
        ...(data.forceRefresh ? { forceRefresh: true } : {}),
      });
    } catch (error) {
      return {
        normalized_product: {
          id: data.query,
          name: data.query,
          barcode: data.gtin ?? null,
          brand: null,
          size: null,
          category: null,
          productId: null,
          terms: [],
        },
        offers: [],
        meta: {
          generated_at: new Date().toISOString(),
          location_used: data.postalCode ?? "—",
          source_mix: [],
          from_cache: false,
          notes: [error instanceof Error ? error.message : "Price lookup failed."],
          disclaimer: DISCLAIMER,
        },
      };
    }
  });
