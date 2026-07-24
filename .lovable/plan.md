# EuroSaver v2 — Monetization + Smart Features

Big scope. Splitting into 5 chunks so we can ship (and you can review) each independently.

---

## 1. €0.99/month subscription (Stripe, MoR)

- Enable **Seamless Payments via Stripe** (Lovable-managed, no account/API keys needed) with **full compliance handling** — Stripe acts as merchant of record, handles EU VAT for you. +3.5% on top of base fees, changeable later.
- Create one product: **EuroSaver Pro — €0.99 / month** (recurring). Tax code: SaaS.
- New table `subscriptions(user_id, status, current_period_end, stripe_customer_id, stripe_subscription_id)` + RLS (owner read).
- Stripe webhook → `/api/public/webhooks/stripe` (signature verified) upserts subscription state via `supabaseAdmin`.
- `usePro()` hook: reads subscription row, returns `{ isPro, loading }`.
- Paywall gate: after sign-in, if not Pro → `/subscribe` page with Checkout button. Free users can browse product prices; **shopping lists, meal suggestions, and price alerts require Pro**.
- Success page verifies `checkout_id` and redirects to `/lists`.

## 2. "What do you want to eat/drink today?" → suggestion engine

New route `/plan`:
- Chip selector (multi-select): meal type (Breakfast/Lunch/Dinner/Snack/Drink) + free-text ("pasta bolognese", "smoothie", "taco night").
- Server function `suggestMeal` calls **Lovable AI Gateway** (`google/gemini-2.5-flash`) with strict JSON schema → returns `{ dish, ingredients: [{ name, qty, unit }] }`.
- For each ingredient: fuzzy-match against `products` table (ilike + trigram-ish scoring in JS), pick cheapest store in user's city.
- Render "Shopping plan" grouped by store with total cost + "Add all to a new list" button (Pro only).

## 3. Store maps + distance

- Add `stores.lat`, `stores.lng` columns (migration + backfill demo coords for seeded stores near city centers).
- Ask browser for geolocation on `/product/$id` and list detail; fallback to city center.
- Compute Haversine distance client-side; show "**1.2 km**" next to each store row.
- Embedded map: use **Google Maps Platform (Managed by Lovable)** connector — one connect step, no keys. Show markers for all stores of the current product/list with distance-sorted list beside it.
- Sort store comparison by `price` (default) or `distance` (toggle).

## 4. Price alerts

- New table `price_alerts(id, user_id, product_id, city_id, target_cents, currency, active, notified_at)` + RLS.
- On `/product/$id`, Pro users see "🔔 Alert me when below €X.XX".
- Alert-check job (see §5) inserts a `notifications` row when best price ≤ target, marks `notified_at`.
- Bell icon in header with dropdown list of unread alerts.

## 5. Price refresh + alert jobs (pg_cron)

- SQL-only "refresh" job (hourly): jitter existing `prices.price_cents` by ±3% within min/max floors to simulate live pricing on the demo dataset. Pure SQL, no HTTP.
- Server route `/api/public/hooks/check-alerts` (POST, `apikey` header): scans active alerts, matches against current cheapest price per (product, city), inserts notifications.
- pg_cron every 15 min calls it via `pg_net`.
- `cron.job` + `cron.job_run_details` visible in Cloud → Jobs.

---

## Technical notes

- **Stripe knowledge**: use `enable_stripe_payments` (built-in), then `batch_create_product`. Never the BYOK integration.
- **Cloud AI**: `LOVABLE_API_KEY` already set — no extra secret.
- **Google Maps**: managed connector, browser key for JS map, gateway for any geocoding.
- **RLS**: every new table gets GRANTs + policies in the same migration.
- **Auth gating**: paywall check runs in `_authenticated` layout children; free tier stays public.

---

## Order of implementation

1. Stripe subscription + paywall (§1)
2. Store maps + distance (§3) — small, self-contained
3. Meal suggestions (§2)
4. Price alerts (§4)
5. Cron jobs (§5)

Approve and I'll start with §1. Reply with tweaks (e.g. "skip maps", "make lists free, alerts Pro", "yearly plan too") and I'll revise before building.
