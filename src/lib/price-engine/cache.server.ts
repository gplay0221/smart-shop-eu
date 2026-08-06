import type { Offer, PriceSearchResult, SourceType } from "./types";

async function sha256(input: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function cacheTtlSeconds(sourceMix: SourceType[]): number {
  if (sourceMix.includes("live")) return 1800; // 30 min
  if (sourceMix.includes("flyer")) return 86400; // 24 h
  if (sourceMix.includes("receipt")) return 604800; // 7 d
  if (sourceMix.includes("headless")) return 172800; // 48 h
  return 3600;
}

export async function cacheKey(productId: string, locationKey: string) {
  return sha256(`v2:${productId}:${locationKey}`);
}

export async function getCached(
  productId: string,
  locationKey: string,
): Promise<PriceSearchResult | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const key = await cacheKey(productId, locationKey);
  const { data } = await supabaseAdmin
    .from("search_cache")
    .select("response")
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data?.response) return null;
  const result = data.response as unknown as PriceSearchResult;
  return { ...result, meta: { ...result.meta, from_cache: true } };
}

export async function putCached(
  productId: string,
  locationKey: string,
  result: PriceSearchResult,
  offers: Offer[],
) {
  if (offers.length === 0) return; // never cache an empty answer
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const key = await cacheKey(productId, locationKey);
  const ttl = cacheTtlSeconds(result.meta.source_mix);
  await supabaseAdmin.from("search_cache").upsert({
    cache_key: key,
    response: result as unknown as never,
    expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
  });
}
