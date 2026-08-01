import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public live-price lookup used by the price finder. */
export const getLivePrices = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().min(1).max(120),
        gtin: z.string().max(14).optional(),
        postalCode: z.string().max(5).optional(),
        forceRefresh: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { searchLivePrices } = await import("@/lib/live-price.server");
    try {
      return await searchLivePrices(data);
    } catch (error) {
      return {
        query: { text: data.query, gtin: data.gtin ?? null },
        location: { postalCode: data.postalCode ?? null },
        offers: [],
        source: "none" as const,
        sourceStatus: { online: "unavailable", prospekt: "unavailable" },
        isDemoData: false,
        cached: false,
        disclaimer: error instanceof Error ? error.message : "Live prices are temporarily unavailable.",
      };
    }
  });
