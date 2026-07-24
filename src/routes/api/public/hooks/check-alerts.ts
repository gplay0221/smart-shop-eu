import { createFileRoute } from "@tanstack/react-router";

// Called by pg_cron every 15 min. Uses supabaseAdmin to bypass RLS so it can
// read every active alert and write notifications on behalf of any user.
export const Route = createFileRoute("/api/public/hooks/check-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: alerts, error } = await supabaseAdmin
          .from("price_alerts")
          .select("id, user_id, product_id, city_id, target_cents, currency")
          .eq("active", true);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        let inserted = 0;
        for (const alert of alerts ?? []) {
          // find cheapest current price for this product in this city
          const { data: stores } = await supabaseAdmin
            .from("stores").select("id, chain, address").eq("city_id", alert.city_id);
          const storeIds = (stores ?? []).map((s) => s.id);
          if (storeIds.length === 0) continue;
          const { data: prices } = await supabaseAdmin
            .from("prices").select("store_id, price_cents, currency")
            .eq("product_id", alert.product_id).in("store_id", storeIds);
          if (!prices || prices.length === 0) continue;
          const cheapest = prices.reduce((a, b) => (a.price_cents <= b.price_cents ? a : b));
          if (cheapest.price_cents > alert.target_cents) continue;

          const store = stores!.find((s) => s.id === cheapest.store_id)!;
          const { data: product } = await supabaseAdmin
            .from("products").select("name").eq("id", alert.product_id).maybeSingle();

          // Avoid duplicate: only insert if last notification was for a different price or older than 12h
          const { data: recent } = await supabaseAdmin
            .from("notifications")
            .select("id, price_cents, created_at")
            .eq("alert_id", alert.id).order("created_at", { ascending: false }).limit(1);
          const last = recent?.[0];
          if (last && last.price_cents === cheapest.price_cents) continue;

          const { error: insErr } = await supabaseAdmin.from("notifications").insert({
            user_id: alert.user_id,
            alert_id: alert.id,
            product_id: alert.product_id,
            store_id: store.id,
            title: `${product?.name ?? "Product"} dropped at ${store.chain}`,
            body: `Now ${(cheapest.price_cents / 100).toFixed(2)} ${cheapest.currency} — under your ${(alert.target_cents / 100).toFixed(2)} ${alert.currency} target.`,
            price_cents: cheapest.price_cents,
            currency: cheapest.currency,
          });
          if (!insErr) {
            inserted++;
            await supabaseAdmin.from("price_alerts").update({ notified_at: new Date().toISOString() }).eq("id", alert.id);
          }
        }

        return Response.json({ ok: true, checked: alerts?.length ?? 0, inserted });
      },
    },
  },
});
