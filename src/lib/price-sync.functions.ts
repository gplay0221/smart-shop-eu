import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Manually trigger a live price pull from the German chains. */
export const triggerPriceSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ chain: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { runPriceSync } = await import("@/lib/price-sync.server");
    return runPriceSync({ chain: data.chain });
  });
