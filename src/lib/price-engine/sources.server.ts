import { haversineKm } from "./location.server";
import { normalizeText } from "./normalizer.server";
import type { NormalizedProduct, Offer, ResolvedLocation } from "./types";

type SourceResult = { offers: Offer[]; note?: string };

const nowIso = () => new Date().toISOString();

function distanceTo(
  loc: ResolvedLocation,
  store: { lat: number | null; lng: number | null },
): number | null {
  if (loc.lat == null || loc.lng == null || store.lat == null || store.lng == null) return null;
  return haversineKm({ lat: loc.lat, lng: loc.lng }, { lat: store.lat, lng: store.lng });
}

function matchesTerms(name: string, terms: string[]) {
  const norm = normalizeText(name);
  return terms.some((t) => norm.includes(t));
}

/** 1. Flyer / promo offers (Marktguru-compatible API, optional). */
export async function getFlyerOffers(
  product: NormalizedProduct,
  loc: ResolvedLocation,
): Promise<SourceResult> {
  const apiKey = process.env['MARKTGURU_API_KEY'];
  const baseUrl = process.env['FLYER_API_BASE_URL'] ?? "https://api.marktguru.de/api/v1";
  if (!apiKey) return { offers: [], note: "flyer source not configured" };

  const url = new URL(`${baseUrl}/offers/search`);
  url.searchParams.set("as", "web");
  url.searchParams.set("limit", "24");
  url.searchParams.set("offset", "0");
  url.searchParams.set("q", product.name);
  if (loc.postalCode) url.searchParams.set("zipCode", loc.postalCode);

  try {
    const res = await fetch(url, {
      headers: { "x-apikey": apiKey, accept: "application/json" },
    });
    if (!res.ok) return { offers: [], note: `flyer source HTTP ${res.status}` };
    const json = (await res.json()) as {
      results?: {
        id?: string | number;
        product?: { name?: string; brand?: { name?: string } };
        price?: number;
        oldPrice?: number;
        unit?: { shortName?: string };
        validityDates?: { from?: string; to?: string }[];
        advertisers?: { name?: string }[];
      }[];
    };
    const offers: Offer[] = (json.results ?? [])
      .filter((r) => typeof r.price === "number" && r.price > 0)
      .map((r) => {
        const retailer = r.advertisers?.[0]?.name ?? "Flyer offer";
        const validTo = r.validityDates?.[0]?.to ?? null;
        const oldPrice = typeof r.oldPrice === "number" ? r.oldPrice : null;
        return {
          store_name: retailer,
          store_id: `flyer:${retailer}:${r.id ?? r.product?.name ?? ""}`,
          retailer,
          distance_km: null,
          price: r.price!,
          currency: "EUR",
          discount_percent:
            oldPrice && oldPrice > r.price! ? Math.round((1 - r.price! / oldPrice) * 100) : 0,
          unit: r.unit?.shortName ?? null,
          title: r.product?.name ?? product.name,
          source_type: "flyer" as const,
          freshness_label: "promo" as const,
          flyer_badge: "Prospekt",
          valid_to: validTo,
          url: null,
          captured_at: nowIso(),
        };
      });
    return { offers };
  } catch (error) {
    return { offers: [], note: `flyer source failed: ${(error as Error).message}` };
  }
}

/** 2. Crowdsourced receipt & community prices (last 30 days). */
export async function getReceiptOffers(
  product: NormalizedProduct,
  loc: ResolvedLocation,
): Promise<SourceResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!product.productId) return { offers: [] };
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();

  const [{ data: reports }, { data: stores }] = await Promise.all([
    supabaseAdmin
      .from("price_reports")
      .select("store_id, price_cents, currency, created_at")
      .eq("product_id", product.productId)
      .eq("status", "approved")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin.from("stores").select("id, chain, address, lat, lng"),
  ]);

  const storeById = new Map((stores ?? []).map((s) => [s.id, s]));
  const seen = new Set<string>();
  const offers: Offer[] = [];
  for (const r of reports ?? []) {
    if (seen.has(r.store_id)) continue;
    seen.add(r.store_id);
    const store = storeById.get(r.store_id);
    if (!store) continue;
    offers.push({
      store_name: `${store.chain} · ${store.address}`,
      store_id: store.id,
      retailer: store.chain,
      distance_km: distanceTo(loc, store),
      price: r.price_cents / 100,
      currency: r.currency,
      discount_percent: 0,
      unit: product.size,
      title: product.name,
      source_type: "receipt",
      freshness_label: "recent",
      url: null,
      captured_at: r.created_at,
    });
  }
  return { offers };
}

/** 3. Verified in-app catalog prices for nearby stores. */
export async function getCatalogOffers(
  product: NormalizedProduct,
  loc: ResolvedLocation,
): Promise<SourceResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!product.productId) return { offers: [] };

  const { data } = await supabaseAdmin
    .from("prices")
    .select("price_cents, currency, store_id, stores(id, chain, address, lat, lng)")
    .eq("product_id", product.productId)
    .order("price_cents", { ascending: true })
    .limit(60);

  const offers: Offer[] = (data ?? [])
    .filter((row) => row.stores)
    .map((row) => {
      const store = row.stores as unknown as {
        id: string;
        chain: string;
        address: string;
        lat: number | null;
        lng: number | null;
      };
      return {
        store_name: `${store.chain} · ${store.address}`,
        store_id: store.id,
        retailer: store.chain,
        distance_km: distanceTo(loc, store),
        price: row.price_cents / 100,
        currency: row.currency,
        discount_percent: 0,
        unit: product.size,
        title: product.name,
        source_type: "catalog" as const,
        freshness_label: "catalog" as const,
        url: null,
        captured_at: nowIso(),
      };
    });

  const near = offers.filter((o) => o.distance_km == null || o.distance_km <= 40);
  return { offers: (near.length > 0 ? near : offers).slice(0, 24) };
}

/** 4. Headless / scraped retailer feed — fallback only. */
export async function getHeadlessOffers(
  product: NormalizedProduct,
): Promise<SourceResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const term = product.terms[0] ?? normalizeText(product.name);
  if (!term) return { offers: [] };

  const { data } = await supabaseAdmin
    .from("scraped_offers")
    .select("id, chain, name, name_norm, price_cents, currency, unit, kind, source_url, scraped_at")
    .ilike("name_norm", `%${term}%`)
    .order("price_cents", { ascending: true })
    .limit(24);

  const offers: Offer[] = (data ?? [])
    .filter((o) => matchesTerms(o.name, product.terms))
    .map((o) => ({
      store_name: o.chain,
      store_id: `scraped:${o.chain}:${o.id}`,
      retailer: o.chain,
      distance_km: null,
      price: o.price_cents / 100,
      currency: o.currency,
      discount_percent: 0,
      unit: o.unit ?? null,
      title: o.name,
      source_type: "headless" as const,
      freshness_label: o.kind === "deal" ? ("promo" as const) : ("scraped" as const),
      flyer_badge: o.kind === "deal" ? "Angebot" : null,
      url: o.source_url,
      captured_at: o.scraped_at,
    }));

  return {
    offers,
    ...(offers.length === 0 ? { note: "no scraped retailer offers cached yet" } : {}),
  };
}
