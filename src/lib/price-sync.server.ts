// Server-only: live price sync for German supermarket chains.
// Port of the Python scraper (requests + BeautifulSoup) to a Worker-safe
// fetch + node-html-parser pipeline, with DB ingestion and product mapping.
import { parse } from "node-html-parser";

export type NormalizedOffer = {
  chain: string;
  name: string;
  name_norm: string;
  price_cents: number;
  currency: string;
  unit: string | null;
  kind: "catalog" | "deal";
  source_url: string;
};

export type SourceRow = {
  chain: string;
  currency: string;
  catalog_url: string | null;
  deals_url: string | null;
  item_selector: string;
  name_selector: string;
  price_selector: string;
  unit_selector: string | null;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

export function normalizeName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9%\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "1,29 €" / "€ 1.29" / "1,29" -> 129 cents. Returns null when unparsable. */
export function parsePriceCents(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/\s/g, " ").match(/(\d{1,4})[.,](\d{2})|(\d{1,4})\s*€/);
  if (!m) return null;
  const value = m[1] ? Number(`${m[1]}.${m[2]}`) : Number(m[3]);
  if (!Number.isFinite(value) || value <= 0 || value > 999) return null;
  return Math.round(value * 100);
}

/**
 * German chains sit behind bot protection (Akamai/Cloudflare) and reject
 * datacenter IPs with 403. When SCRAPER_PROXY_URL is configured (a template
 * containing {url}, e.g. a ScraperAPI/ScrapingBee/Browserless endpoint) we
 * fetch through it; otherwise we go direct and surface the block clearly.
 */
async function fetchHtml(url: string) {
  const template = process.env.SCRAPER_PROXY_URL;
  const target = template
    ? template.replace("{url}", encodeURIComponent(url))
    : url;

  const res = await fetch(target, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "de-DE,de;q=0.9",
    },
    redirect: "follow",
  });
  if (res.status === 403 || res.status === 429) {
    throw new Error(
      `blocked (HTTP ${res.status}) by ${new URL(url).hostname}${template ? "" : " — no scraping proxy configured"}`,
    );
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  return await res.text();
}

/** Scrape one page of a chain using its configured CSS selectors. */
export async function scrapePage(
  source: SourceRow,
  url: string,
  kind: "catalog" | "deal",
): Promise<NormalizedOffer[]> {
  const html = await fetchHtml(url);
  const root = parse(html);
  const offers: NormalizedOffer[] = [];
  const seen = new Set<string>();

  for (const item of root.querySelectorAll(source.item_selector)) {
    const name = item.querySelector(source.name_selector)?.textContent?.trim();
    const priceRaw = item.querySelector(source.price_selector)?.textContent;
    const unit = source.unit_selector
      ? (item.querySelector(source.unit_selector)?.textContent?.trim() ?? null)
      : null;

    const price_cents = parsePriceCents(priceRaw);
    if (!name || !price_cents) continue;

    const name_norm = normalizeName(name);
    if (!name_norm || seen.has(name_norm)) continue;
    seen.add(name_norm);

    offers.push({
      chain: source.chain,
      name: name.replace(/\s+/g, " ").slice(0, 200),
      name_norm,
      price_cents,
      currency: source.currency,
      unit: unit ? unit.replace(/\s+/g, " ").slice(0, 80) : null,
      kind,
      source_url: url,
    });
  }
  return offers;
}

/** German keywords -> catalog product names, so scraped offers can price real products. */
const PRODUCT_KEYWORDS: Record<string, string[]> = {
  "Whole Milk": ["vollmilch", "frischmilch", "milch"],
  "Organic Oat Milk": ["haferdrink", "hafermilch", "oat drink"],
  "Free-Range Eggs": ["freilandeier", "eier"],
  "Greek Yogurt": ["griechischer joghurt", "joghurt"],
  "Cheddar Cheese": ["cheddar"],
  "Chicken Breast": ["hahnchenbrust", "haehnchenbrust", "hahnchenbrustfilet"],
  "Salmon Fillet": ["lachsfilet", "lachs"],
  "Sourdough Bread": ["sauerteigbrot", "brot"],
  Croissants: ["croissant"],
  Bananas: ["bananen"],
  Tomatoes: ["tomaten"],
  Avocados: ["avocado"],
  "Basmati Rice": ["basmati", "reis"],
  "Penne Rigate": ["penne"],
  "Spaghetti No. 5": ["spaghetti"],
  "Olive Oil": ["olivenol", "natives olivenol"],
  "Ground Coffee": ["filterkaffee", "kaffee gemahlen", "kaffee"],
  "Green Tea": ["gruner tee", "grüner tee", "tee"],
  "Sparkling Water": ["mineralwasser", "sprudel"],
  "Dark Chocolate 70%": ["zartbitterschokolade", "schokolade"],
  "Sea Salt Chips": ["chips"],
  "Roasted Almonds": ["mandeln"],
  Toothpaste: ["zahnpasta", "zahncreme"],
  "Dish Soap": ["spulmittel", "spülmittel"],
  "Diapers Size 4": ["windeln"],
};

export function matchProduct(
  nameNorm: string,
  products: { id: string; name: string }[],
): string | null {
  for (const p of products) {
    if (nameNorm.includes(normalizeName(p.name))) return p.id;
  }
  for (const [productName, keywords] of Object.entries(PRODUCT_KEYWORDS)) {
    if (keywords.some((k) => nameNorm.includes(normalizeName(k)))) {
      const p = products.find((x) => x.name === productName);
      if (p) return p.id;
    }
  }
  return null;
}

type SyncResult = {
  chain: string;
  status: "success" | "partial" | "failed";
  offers_found: number;
  offers_upserted: number;
  prices_updated: number;
  error: string | null;
};

/** Scrape every active source, store the offers and push matched prices onto German stores. */
export async function runPriceSync(opts?: { chain?: string }): Promise<{
  ok: boolean;
  results: SyncResult[];
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let q = supabaseAdmin
    .from("price_sources")
    .select("chain, currency, catalog_url, deals_url, item_selector, name_selector, price_selector, unit_selector")
    .eq("active", true);
  if (opts?.chain) q = q.eq("chain", opts.chain);
  const { data: sources, error: srcErr } = await q;
  if (srcErr) throw new Error(srcErr.message);

  const [{ data: products }, { data: deCities }] = await Promise.all([
    supabaseAdmin.from("products").select("id, name"),
    supabaseAdmin.from("cities").select("id").eq("country_code", "DE"),
  ]);
  const deCityIds = (deCities ?? []).map((c) => c.id);
  const { data: deStores } = await supabaseAdmin
    .from("stores")
    .select("id, chain")
    .in("city_id", deCityIds.length ? deCityIds : ["00000000-0000-0000-0000-000000000000"]);

  const results: SyncResult[] = [];

  for (const source of (sources ?? []) as SourceRow[]) {
    const { data: run } = await supabaseAdmin
      .from("price_sync_runs")
      .insert({ chain: source.chain, status: "running" })
      .select("id")
      .maybeSingle();

    const errors: string[] = [];
    let offers: NormalizedOffer[] = [];

    for (const [url, kind] of [
      [source.catalog_url, "catalog"],
      [source.deals_url, "deal"],
    ] as [string | null, "catalog" | "deal"][]) {
      if (!url) continue;
      try {
        offers = offers.concat(await scrapePage(source, url, kind));
      } catch (e) {
        errors.push(`${kind}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    let upserted = 0;
    let pricesUpdated = 0;

    if (offers.length > 0) {
      const rows = offers.map((o) => ({
        ...o,
        product_id: matchProduct(o.name_norm, products ?? []),
        scraped_at: new Date().toISOString(),
      }));

      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error } = await supabaseAdmin
          .from("scraped_offers")
          .upsert(chunk, { onConflict: "chain,name_norm,kind" });
        if (error) errors.push(`upsert: ${error.message}`);
        else upserted += chunk.length;
      }

      // Cheapest matched offer per product becomes the live price at that chain's German stores.
      const cheapest = new Map<string, number>();
      for (const r of rows) {
        if (!r.product_id) continue;
        const prev = cheapest.get(r.product_id);
        if (prev == null || r.price_cents < prev) cheapest.set(r.product_id, r.price_cents);
      }
      const chainStores = (deStores ?? []).filter((s) =>
        normalizeName(source.chain).startsWith(normalizeName(s.chain)) ||
        normalizeName(s.chain).startsWith(normalizeName(source.chain)),
      );
      for (const [productId, priceCents] of cheapest) {
        for (const store of chainStores) {
          const { error } = await supabaseAdmin
            .from("prices")
            .update({ price_cents: priceCents, currency: source.currency })
            .eq("product_id", productId)
            .eq("store_id", store.id);
          if (!error) pricesUpdated++;
        }
      }
    }

    const status: SyncResult["status"] =
      offers.length === 0 ? "failed" : errors.length > 0 ? "partial" : "success";
    const result: SyncResult = {
      chain: source.chain,
      status,
      offers_found: offers.length,
      offers_upserted: upserted,
      prices_updated: pricesUpdated,
      error: errors.length ? errors.join(" | ").slice(0, 500) : null,
    };
    results.push(result);

    if (run?.id) {
      await supabaseAdmin
        .from("price_sync_runs")
        .update({
          status: result.status,
          offers_found: result.offers_found,
          offers_upserted: result.offers_upserted,
          prices_updated: result.prices_updated,
          error: result.error,
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }
  }

  return { ok: results.some((r) => r.status !== "failed"), results };
}
