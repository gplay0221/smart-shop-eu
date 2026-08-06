/** Shared offer contract for every price source. */
export type SourceType = "flyer" | "receipt" | "catalog" | "headless" | "live";
export type FreshnessLabel = "promo" | "recent" | "scraped" | "live" | "catalog";

export interface Offer {
  store_name: string;
  store_id: string;
  retailer: string;
  distance_km: number | null;
  price: number;
  currency: string;
  discount_percent: number;
  unit: string | null;
  title: string;
  source_type: SourceType;
  freshness_label: FreshnessLabel;
  flyer_badge?: string | null;
  valid_to?: string | null;
  url?: string | null;
  captured_at: string;
}

export interface NormalizedProduct {
  id: string;
  name: string;
  barcode: string | null;
  brand: string | null;
  size: string | null;
  category: string | null;
  productId: string | null;
  terms: string[];
}

export interface ResolvedLocation {
  locationKey: string;
  displayName: string;
  lat: number | null;
  lng: number | null;
  postalCode: string | null;
  countryCode: string;
}

export interface PriceSearchResult {
  normalized_product: NormalizedProduct;
  offers: Offer[];
  meta: {
    generated_at: string;
    location_used: string;
    source_mix: SourceType[];
    from_cache: boolean;
    notes: string[];
    disclaimer: string;
  };
}

export const DISCLAIMER =
  "Prices and availability may change. Check the retailer before purchase.";
