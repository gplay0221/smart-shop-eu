# EuroSaver v3 — 12 features, 4 shippable phases

Big scope. To keep it reviewable (and the DB migrations sane), I'll ship in **4 phases**. Each phase is independently useful — you can approve, test, then say "go" for the next.

---

## Phase A — Personalization & smart lists (foundation)

Everything else builds on knowing the user, their pantry, and route grouping.

1. **Onboarding (feature 9)** — first-login wizard: household size, dietary prefs (veg / vegan / gluten-free / halal / none), favorite stores (chip picker from their city). Saved to new `user_profiles` table.
2. **Smart shopping list grouped by store (feature 1)** — list detail already groups by chain; upgrade to per-**store** (address) with subtotal, item count, and a "Start this store" button that collapses others.
3. **Micro-wins & nudges (feature 8)** — header widget: "You saved €X this week vs. avg price". Computed from `list_items` (avg price for product across stores − price chosen) × quantity, last 7 days. Toast nudge on `/plan` when pantry has ≥3 near-expiry items → "Use them up? →".

## Phase B — Pantry & waste-to-meal

4. **Pantry inventory + expiry (feature 2)** — new `pantry_items(user_id, product_id, quantity, unit, expires_at, added_at)`. Route `/pantry`: add from product search or from a completed list ("Move checked items to pantry"). Sorted by expiry, color-coded (red <3d, amber <7d, green).
5. **Waste-to-Meal (feature 12)** — button on `/pantry`: sends near-expiry items to Gemini with prompt "recipe using these + minimal extras"; AI returns dish + ingredients; missing ones one-tap-added to a new list. Reuses existing `suggestMeal` gateway wiring.
6. **Pantry-aware meal suggestions (feature 8 continued)** — `/plan` shows toggle "Use what I have"; when on, prompt includes pantry contents and AI prefers dishes that consume them.

## Phase C — Route optimization, Smart Cart, sustainability

7. **Dynamic route optimization + multi-store batching (feature 3)** — on any list, "Optimize route" button. Nearest-neighbor over store lat/lng from user location. Renders ordered stops with distance between each.
8. **Smart Cart (feature 11)** — on any list, "Optimize spend" toggle. For each item, chooses cheapest store; then greedy consolidation: if switching item X to its 2nd-cheapest store removes a stop entirely, do it when savings < €(stops_removed × €2 travel cost). Shows before/after total + stop count.
9. **Sustainability score + eco alternatives (feature 4)** — add `products.eco_score` (A–E, seeded), `products.eco_alternative_id` (nullable self-ref). List detail and product page show badge; if a greener alternative exists at similar price, "Swap for greener?" CTA.
10. **Localized assortment (feature 7)** — new `store_assortment(store_id, product_id, available boolean)`. Migration seeds realistic gaps (Lidl doesn't carry certain brands, etc.). Product page hides unavailable stores; list warns "Not stocked at nearest Aldi — nearest available is 2.1 km further".

## Phase D — Social, community, barcode

11. **Social/shared household lists (feature 6)** — new `list_members(list_id, user_id, role)`. Owner can invite by email (Supabase invites); RLS policy expanded so members can read/write. Live sync via realtime channel on `list_items`.
12. **Community price corrections + points (feature 10)** — button on any store row: "Report different price". Inserts into `price_reports(user_id, store_id, product_id, price_cents, status)`. Auto-approve if within ±30% of median; else pending. `user_points` table; +10 per approved report. Rewards page shows point balance and a mock "€1 off next month" redemption (marks a `redemptions` row; real Stripe coupon later).
13. **Barcode scan + instant compare (feature 5)** — `/scan` route using [`@zxing/browser`](https://www.npmjs.com/package/@zxing/browser) (pure JS, works in Worker/browser). On successful decode, look up product by `products.barcode` (new column, seeded EAN-13s for demo items) → jump to product page. Fallback: manual entry.

---

## Technical notes

- **New tables** across phases: `user_profiles`, `pantry_items`, `store_assortment`, `list_members`, `price_reports`, `user_points`, `redemptions`. All get `GRANT` + RLS in the same migration.
- **New columns**: `products.eco_score`, `products.eco_alternative_id`, `products.barcode`.
- **AI reuse**: Waste-to-Meal and pantry-aware planning extend `suggestMeal` with an optional `pantryHint` param — no new AI infra.
- **Barcode lib**: `@zxing/browser` is browser-only, so `/scan` will be `<ClientOnly>` + `React.lazy`.
- **Realtime**: only enable `supabase_realtime` on `list_items` and `list_members` for shared lists (phase D).
- **No new secrets needed.** Stripe/paywall still deferred per your earlier "payments last" instruction.

---

## Recommended order

**A → B → C → D**, one message each. Approve this and I'll start with Phase A (onboarding + grouped lists + micro-wins).

Reply with any tweaks — e.g. "skip barcode", "collapse C+D", "do pantry first" — and I'll revise before touching code.
