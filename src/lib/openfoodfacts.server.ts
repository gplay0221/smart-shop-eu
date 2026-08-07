// Keyless public product database (Open Food Facts). No API key required.
const BASE = "https://world.openfoodfacts.org";
const UA = "EuroSaver/1.0 (grocery price comparison)";

export type OffProduct = {
  barcode: string;
  name: string;
  brand: string | null;
  category: string | null;
  unit: string | null;
  image_url: string | null;
};

type OffRaw = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  categories?: string;
  quantity?: string;
  image_front_small_url?: string;
};

function toProduct(raw: OffRaw | undefined, fallbackCode = ""): OffProduct | null {
  const name = (raw?.product_name_en || raw?.product_name || "").trim();
  if (!name) return null;
  return {
    barcode: raw?.code ?? fallbackCode,
    name: name.slice(0, 160),
    brand: raw?.brands?.split(",")[0]?.trim() || null,
    category: raw?.categories?.split(",").pop()?.trim() || null,
    unit: raw?.quantity?.trim() || null,
    image_url: raw?.image_front_small_url ?? null,
  };
}

/** Look up a GTIN/EAN barcode. Returns null when unknown. */
export async function offLookupBarcode(barcode: string): Promise<OffProduct | null> {
  try {
    const res = await fetch(`${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json`, {
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { status?: number; product?: OffRaw };
    if (json.status !== 1) return null;
    return toProduct(json.product, barcode);
  } catch {
    return null;
  }
}

/** Brand-aware free text search, e.g. "heinz ketchup". */
export async function offSearch(query: string, limit = 8): Promise<OffProduct[]> {
  try {
    const url = new URL(`${BASE}/cgi/search.pl`);
    url.searchParams.set("search_terms", query);
    url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "1");
    url.searchParams.set("page_size", String(limit));
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    if (!res.ok) return [];
    const json = (await res.json()) as { products?: OffRaw[] };
    return (json.products ?? [])
      .map((p) => toProduct(p))
      .filter((p): p is OffProduct => p !== null);
  } catch {
    return [];
  }
}

/** Health probe: is the public product database reachable? */
export async function offPing(): Promise<{ ok: boolean; detail: string }> {
  const started = Date.now();
  const product = await offLookupBarcode("5449000000996"); // Coca-Cola 1.5L
  return product
    ? { ok: true, detail: `reachable in ${Date.now() - started} ms` }
    : { ok: false, detail: "no response from the public product database" };
}
