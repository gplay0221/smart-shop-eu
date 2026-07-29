import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint: pulls live prices from German supermarket chains.
export const Route = createFileRoute("/api/public/hooks/sync-de-prices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const url = new URL(request.url);
        const chain = url.searchParams.get("chain") ?? undefined;
        const { runPriceSync } = await import("@/lib/price-sync.server");
        try {
          return Response.json(await runPriceSync({ chain }));
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "sync failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
