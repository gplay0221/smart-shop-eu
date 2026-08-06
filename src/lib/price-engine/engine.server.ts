import { getCached, putCached } from "./cache.server";
import { resolveLocation } from "./location.server";
import { normalizeProduct } from "./normalizer.server";
import {
  getCatalogOffers,
  getFlyerOffers,
  getHeadlessOffers,
  getReceiptOffers,
} from "./sources.server";
import { DISCLAIMER, type Offer, type PriceSearchResult, type ResolvedLocation, type SourceType } from "./types";

export interface SearchParams {
  query?: string;
  barcode?: string;
  location?: string; // "lat,lng", postal code, or city
  countryCode?: string;
  forceRefresh?: boolean;
}

function freshnessScore(label: Offer["freshness_label"]): number {
  switch (label) {
    case "live":
      return 0;
    case "promo":
      return 1;
    case "recent":
      return 2;
    case "catalog":
      return 3;
    case "scraped":
      return 4;
    default:
      return 5;
  }
}

function scoreOffer(offer: Offer): number {
  return 0.7 * offer.price + 0.2 * freshnessScore(offer.freshness_label) + 0.1 * (offer.distance_km ?? 0);
}

function rankOffers(offers: Offer[]): Offer[] {
  const seen = new Map<string, Offer>();
  for (const offer of offers) {
    const key = `${offer.retailer.toLowerCase()}|${offer.store_id}|${offer.price}`;
    const existing = seen.get(key);
    if (!existing || scoreOffer(offer) < scoreOffer(existing)) seen.set(key, offer);
  }
  return Array.from(seen.values()).sort((a, b) => scoreOffer(a) - scoreOffer(b));
}

/** Orchestrates every price source, ranks the result, and caches it. */
export async function searchPrices(params: SearchParams): Promise<PriceSearchResult> {
  const query = (params.query ?? "").trim().replace(/\s+/g, " ");
  const barcode = (params.barcode ?? "").trim();
  const countryCode = (params.countryCode ?? "DE").toUpperCase();
  if (!query && !barcode) throw new Error("Enter a product name or barcode.");
  if (barcode && !/^\d{8,14}$/.test(barcode)) throw new Error("Barcode must contain 8 to 14 digits.");

  const product = await normalizeProduct({ query, barcode });
  const location: ResolvedLocation = await resolveLocation(params.location, countryCode);

  if (!params.forceRefresh) {
    const cached = await getCached(product.id, location.locationKey);
    if (cached) return cached;
  }

  const notes: string[] = [];
  const sourceMix = new Set<SourceType>();

  const [flyer, receipt, catalog] = await Promise.all([
    getFlyerOffers(product, location),
    getReceiptOffers(product, location),
    getCatalogOffers(product, location),
  ]);

  let offers: Offer[] = [...flyer.offers, ...receipt.offers, ...catalog.offers];
  for (const source of [flyer, receipt, catalog]) if (source.note) notes.push(source.note);

  if (offers.length === 0) {
    const headless = await getHeadlessOffers(product);
    offers = headless.offers;
    if (headless.note) notes.push(headless.note);
  }

  for (const offer of offers) sourceMix.add(offer.source_type);
  const ranked = rankOffers(offers);

  const result: PriceSearchResult = {
    normalized_product: product,
    offers: ranked,
    meta: {
      generated_at: new Date().toISOString(),
      location_used: location.displayName,
      source_mix: Array.from(sourceMix),
      from_cache: false,
      notes,
      disclaimer: DISCLAIMER,
    },
  };

  await putCached(product.id, location.locationKey, result, ranked);
  return result;
}
