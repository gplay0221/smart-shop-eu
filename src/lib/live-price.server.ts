/**
 * Live price lookup.
 *
 * Two sources, in priority order:
 *  1. A permitted price provider (connector contract: /v1/locations/resolve,
 *     /v1/stores, /v1/offers/online, /v1/offers/prospekt) configured via the
 *     PRICE_PROVIDER_BASE_URL / PRICE_PROVIDER_TOKEN secrets.
 *  2. The in-app German sync engine's `scraped_offers` feed.
 *
 * Results are cached in `search_cache` for 30 minutes.
 */

export type LiveOffer = {
  retailer: string;
  storeName: string | null;
  distanceKm: number | null;
  kind: "online" | "prospekt" | "catalog";
  title: string;
  brand: string | null;
  priceCents: number;
  currency: string;
  unit: string | null;
  unitPrice: number | null;
  promotionText: string | null;
  validFrom: string | null;
  validTo: string | null;
  isExactProductMatch: boolean;
  sourceUrl: string | null;
  capturedAt: string;
};

export type LiveResult = {
  query: { text: string; gtin: string | null };
  location: { postalCode: string | null };
  offers: LiveOffer[];
  source: "provider" | "sync-engine" | "none";
  sourceStatus: { online: string; prospekt: string };
  isDemoData: boolean;
  cached: boolean;
  disclaimer: string;
};

type ProviderOffer = {
  externalId: string;
  retailerId: string;
  storeExternalId?: string;
  kind: "online" | "prospekt";
  product: { title: string; gtin?: string; brand?: string };
  price: number;
  currency: string;
  unitPrice?: number;
  unit?: string;
  promotionText?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  sourceUrl: string;
  capturedAt: string;
};
type ProviderLocation = { postalCode: string; latitude?: number; longitude?: number };
type ProviderStore = {
  externalId: string;
  retailerId: string;
  name: string;
  latitude?: number;
  longitude?: number;
};

const DISCLAIMER = "Prices and availability may change. Check the retailer before purchase.";

const isGtin = (v: string) => /^\d{8,14}$/.test(v);
const isPostalCode = (v: string) => /^\d{5}$/.test(v);

function berlinDate(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}

function distanceKm(a: ProviderLocation | null, b: ProviderStore | undefined): number | null {
  if (!a || !b) return null;
  const { latitude: la, longitude: lo } = a;
  const { latitude: lb, longitude: lob } = b;
  if ([la, lo, lb, lob].some((v) => typeof v !== "number" || !Number.isFinite(v))) return null;
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(lb! - la!);
  const dLon = rad(lob! - lo!);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(la!)) * Math.cos(rad(lb!)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
}

function validOffer(o: ProviderOffer, today: string): boolean {
  if (!o.retailerId || !o.product?.title || !o.sourceUrl) return false;
  if (o.currency !== "EUR" || !Number.isFinite(o.price) || o.price < 0) return false;
  if (o.product.gtin && !isGtin(o.product.gtin)) return false;
  if (o.kind === "prospekt") {
    if (!o.validFrom || !o.validTo || o.validFrom > o.validTo) return false;
    if (o.validFrom > today || o.validTo < today) return false;
  }
  return true;
}

const demoMode = () => process.env['PRICE_PROVIDER_DEMO_MODE'] === "true";
const providerConfigured = () =>
  Boolean(process.env['PRICE_PROVIDER_BASE_URL'] && process.env['PRICE_PROVIDER_TOKEN']);

async function providerFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  if (demoMode()) return demoResponse(path, params) as T;
  const baseUrl = process.env['PRICE_PROVIDER_BASE_URL'];
  const token = process.env['PRICE_PROVIDER_TOKEN'];
  if (!baseUrl || !token) throw new Error("Price provider is not configured");
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Provider request failed: ${res.status}`);
  return (await res.json()) as T;
}

/** Development-only fixture — deliberately fictional retailer results. */
function demoResponse(path: string, params: Record<string, string>): unknown {
  const capturedAt = new Date().toISOString();
  const product = { title: params['query'] || params['gtin'] || "Demo product", gtin: params['gtin'] || undefined };
  const store = {
    externalId: "demo-markt:berlin-mitte",
    retailerId: "Demo Markt",
    name: "Demo Markt Berlin Mitte",
    latitude: 52.532,
    longitude: 13.384,
  };
  if (path === "/v1/locations/resolve") return { postalCode: "10115", latitude: 52.532, longitude: 13.384 };
  if (path === "/v1/stores") return { stores: [store] };
  if (path === "/v1/offers/online")
    return {
      offers: [
        {
          externalId: "demo-online-1", retailerId: store.retailerId, storeExternalId: store.externalId,
          kind: "online", product, price: 1.49, currency: "EUR", unitPrice: 2.98, unit: "kg",
          sourceUrl: "https://example.invalid/demo-online", capturedAt,
        },
      ],
    };
  if (path === "/v1/offers/prospekt")
    return {
      offers: [
        {
          externalId: "demo-prospekt-1", retailerId: store.retailerId, storeExternalId: store.externalId,
          kind: "prospekt", product, price: 0.99, currency: "EUR", unitPrice: 1.98, unit: "kg",
          promotionText: "DEMO – example weekly offer", validFrom: berlinDate(), validTo: berlinDate(),
          sourceUrl: "https://example.invalid/demo-prospekt", capturedAt,
        },
      ],
    };
  throw new Error(`Unsupported demo route: ${path}`);
}

async function sha256(input: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function searchLivePrices(input: {
  query: string;
  gtin?: string;
  postalCode?: string;
  forceRefresh?: boolean;
}): Promise<LiveResult> {
  const query = input.query.trim().replace(/\s+/g, " ");
  const gtin = (input.gtin ?? "").trim();
  const postalCode = (input.postalCode ?? "").trim();
  if (!query && !gtin) throw new Error("Enter a product name or GTIN/EAN.");
  if (gtin && !isGtin(gtin)) throw new Error("GTIN/EAN must contain 8 to 14 digits.");
  if (postalCode && !isPostalCode(postalCode)) throw new Error("Use a five-digit German postal code.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cacheKey = await sha256(JSON.stringify({ query, gtin, postalCode }));

  if (!input.forceRefresh) {
    const { data: cached } = await supabaseAdmin
      .from("search_cache")
      .select("response")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (cached?.response) return { ...(cached.response as unknown as LiveResult), cached: true };
  }

  const today = berlinDate();
  let offers: LiveOffer[] = [];
  let source: LiveResult["source"] = "none";
  let sourceStatus = { online: "unconfigured", prospekt: "unconfigured" };

  if (providerConfigured() || demoMode()) {
    source = "provider";
    let location: ProviderLocation | null = postalCode ? { postalCode } : null;
    let stores: ProviderStore[] = [];
    try {
      const res = await providerFetch<{ stores: ProviderStore[] }>("/v1/stores", {
        postalCode: location?.postalCode ?? "",
        radiusKm: "25",
      });
      stores = res.stores.filter((s) => s.externalId && s.name && s.retailerId);
      if (!location && stores[0]) location = { postalCode: "", latitude: stores[0].latitude, longitude: stores[0].longitude };
    } catch {
      stores = [];
    }
    const storeById = new Map(stores.map((s) => [s.externalId, s]));
    const baseParams = { query, gtin, postalCode: location?.postalCode ?? "" };

    const [onlineRes, prospektRes] = await Promise.allSettled([
      providerFetch<{ offers: ProviderOffer[] }>("/v1/offers/online", baseParams),
      providerFetch<{ offers: ProviderOffer[] }>("/v1/offers/prospekt", { ...baseParams, asOf: today }),
    ]);
    sourceStatus = {
      online: onlineRes.status === "fulfilled" ? "ok" : "unavailable",
      prospekt: prospektRes.status === "fulfilled" ? "ok" : "unavailable",
    };
    const raw = [
      ...(onlineRes.status === "fulfilled" ? onlineRes.value.offers : []),
      ...(prospektRes.status === "fulfilled" ? prospektRes.value.offers : []),
    ];
    offers = raw
      .filter((o) => validOffer(o, today))
      .map((o) => {
        const store = o.storeExternalId ? storeById.get(o.storeExternalId) : stores[0];
        return {
          retailer: o.retailerId,
          storeName: store?.name ?? null,
          distanceKm: distanceKm(location, store),
          kind: o.kind,
          title: o.product.title,
          brand: o.product.brand ?? null,
          priceCents: Math.round(o.price * 100),
          currency: o.currency,
          unit: o.unit ?? null,
          unitPrice: o.unitPrice ?? null,
          promotionText: o.promotionText ?? null,
          validFrom: o.validFrom ?? null,
          validTo: o.validTo ?? null,
          isExactProductMatch: Boolean(gtin && o.product.gtin === gtin),
          sourceUrl: o.sourceUrl,
          capturedAt: o.capturedAt,
        } satisfies LiveOffer;
      });
  }

  // Fallback: offers pulled by the in-app German sync engine.
  if (offers.length === 0) {
    const term = (query || gtin).toLowerCase();
    const { data: scraped } = await supabaseAdmin
      .from("scraped_offers")
      .select("chain, name, price_cents, currency, unit, kind, source_url, scraped_at")
      .ilike("name_norm", `%${term}%`)
      .order("price_cents", { ascending: true })
      .limit(24);
    if (scraped && scraped.length > 0) {
      source = "sync-engine";
      sourceStatus = { online: "ok", prospekt: "ok" };
      offers = scraped.map((o) => ({
        retailer: o.chain,
        storeName: null,
        distanceKm: null,
        kind: o.kind === "deal" ? "prospekt" : "catalog",
        title: o.name,
        brand: null,
        priceCents: o.price_cents,
        currency: o.currency,
        unit: o.unit ?? null,
        unitPrice: null,
        promotionText: null,
        validFrom: null,
        validTo: null,
        isExactProductMatch: false,
        sourceUrl: o.source_url ?? null,
        capturedAt: o.scraped_at,
      }));
    }
  }

  offers.sort((a, b) => a.priceCents - b.priceCents);

  const result: LiveResult = {
    query: { text: query || gtin, gtin: gtin || null },
    location: { postalCode: postalCode || null },
    offers,
    source,
    sourceStatus,
    isDemoData: demoMode(),
    cached: false,
    disclaimer: DISCLAIMER,
  };

  await supabaseAdmin.from("search_cache").upsert({
    cache_key: cacheKey,
    response: result as unknown as never,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });

  return result;
}
