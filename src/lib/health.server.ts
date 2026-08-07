// Server-only health probes for the scraper, scan and auto-list subsystems.
import { offPing } from "./openfoodfacts.server";

export type Check = {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  metric?: string;
};

export type HealthReport = {
  generated_at: string;
  overall: "ok" | "warn" | "fail";
  groups: { id: string; label: string; checks: Check[] }[];
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

async function timedFetch(url: string, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const proxy = process.env['SCRAPER_PROXY_URL'];
    const target = proxy ? proxy.replace("{url}", encodeURIComponent(url)) : url;
    const started = Date.now();
    const res = await fetch(target, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "de-DE,de;q=0.9" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    return { status: res.status, ms: Date.now() - started, proxied: Boolean(proxy) };
  } finally {
    clearTimeout(timer);
  }
}

/** Probe every configured retailer source and report reachability + freshness. */
export async function scraperHealth(): Promise<Check[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const checks: Check[] = [];

  const [{ data: sources }, { data: runs }, { count: offerCount }] = await Promise.all([
    supabaseAdmin.from("price_sources").select("chain, catalog_url, deals_url, active").eq("active", true),
    supabaseAdmin
      .from("price_sync_runs")
      .select("chain, status, offers_found, error, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin.from("scraped_offers").select("id", { count: "exact", head: true }),
  ]);

  checks.push({
    id: "scraper.proxy",
    label: "Scraping proxy",
    status: process.env['SCRAPER_PROXY_URL'] ? "ok" : "warn",
    detail: process.env['SCRAPER_PROXY_URL']
      ? "proxy configured — retailer pages fetched through it"
      : "no SCRAPER_PROXY_URL — German chains usually answer 403 from datacenter IPs",
  });

  for (const src of sources ?? []) {
    const url = src.catalog_url ?? src.deals_url;
    if (!url) {
      checks.push({ id: `scraper.${src.chain}`, label: src.chain, status: "warn", detail: "no URL configured" });
      continue;
    }
    try {
      const r = await timedFetch(url);
      const blocked = r.status === 403 || r.status === 429;
      checks.push({
        id: `scraper.${src.chain}`,
        label: src.chain,
        status: r.status < 400 ? "ok" : blocked ? "warn" : "fail",
        detail: blocked
          ? `bot-protected (HTTP ${r.status})${r.proxied ? "" : " — needs a scraping proxy"}`
          : `HTTP ${r.status}`,
        metric: `${r.ms} ms`,
      });
    } catch (e) {
      checks.push({
        id: `scraper.${src.chain}`,
        label: src.chain,
        status: "fail",
        detail: e instanceof Error ? e.message : "request failed",
      });
    }
  }

  const last = runs?.[0];
  checks.push({
    id: "scraper.lastRun",
    label: "Last sync run",
    status: !last ? "warn" : last.status === "success" ? "ok" : "warn",
    detail: last
      ? `${last.chain} · ${last.status} · ${last.offers_found ?? 0} offers${last.error ? ` · ${last.error}` : ""}`
      : "no sync has run yet",
    ...(last ? { metric: new Date(last.created_at).toLocaleString("en-GB") } : {}),
  });

  checks.push({
    id: "scraper.offers",
    label: "Cached retailer offers",
    status: (offerCount ?? 0) > 0 ? "ok" : "warn",
    detail: (offerCount ?? 0) > 0 ? "scraped offers available as fallback" : "no scraped offers stored yet",
    metric: String(offerCount ?? 0),
  });

  checks.push({
    id: "scraper.flyer",
    label: "Flyer/promo API",
    status: process.env['MARKTGURU_API_KEY'] ? "ok" : "warn",
    detail: process.env['MARKTGURU_API_KEY']
      ? "flyer key configured"
      : "no MARKTGURU_API_KEY — flyer offers are skipped (free sources still run)",
  });

  return checks;
}

/** Barcode scanning: catalogue coverage plus the keyless public product database. */
export async function scanHealth(): Promise<Check[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ count: total }, { count: withBarcode }, { count: withBrand }] = await Promise.all([
    supabaseAdmin.from("products").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("products").select("id", { count: "exact", head: true }).not("barcode", "is", null),
    supabaseAdmin.from("products").select("id", { count: "exact", head: true }).not("brand", "is", null),
  ]);
  const off = await offPing();
  const coverage = total ? Math.round(((withBarcode ?? 0) / total) * 100) : 0;

  return [
    {
      id: "scan.off",
      label: "Open Food Facts lookup",
      status: off.ok ? "ok" : "fail",
      detail: off.ok ? `keyless barcode fallback ${off.detail}` : off.detail,
    },
    {
      id: "scan.coverage",
      label: "Barcodes in catalogue",
      status: coverage > 0 ? "ok" : "warn",
      detail: `${withBarcode ?? 0} of ${total ?? 0} products carry a barcode; unknown codes fall back to Open Food Facts`,
      metric: `${coverage}%`,
    },
    {
      id: "scan.brands",
      label: "Brand coverage",
      status: (withBrand ?? 0) > 0 ? "ok" : "warn",
      detail: "brand names power searches like “heinz ketchup”",
      metric: `${withBrand ?? 0}/${total ?? 0}`,
    },
  ];
}

/** Auto list: does the purchase history have enough signal to predict restocks? */
export async function autoListHealth(): Promise<Check[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const [{ count: purchases }, { count: recent }, { count: pantry }] = await Promise.all([
    supabaseAdmin.from("purchases").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("purchases").select("id", { count: "exact", head: true }).gte("purchased_on", since),
    supabaseAdmin.from("pantry_items").select("id", { count: "exact", head: true }),
  ]);

  return [
    {
      id: "autolist.history",
      label: "Purchase history (90 days)",
      status: (recent ?? 0) >= 5 ? "ok" : (purchases ?? 0) > 0 ? "warn" : "fail",
      detail:
        (recent ?? 0) >= 5
          ? "enough history to predict restock rhythm"
          : "tick items off a list or scan a receipt to build history",
      metric: `${recent ?? 0} rows`,
    },
    {
      id: "autolist.pantry",
      label: "Pantry stock signal",
      status: (pantry ?? 0) > 0 ? "ok" : "warn",
      detail: (pantry ?? 0) > 0 ? "pantry levels subtracted from suggestions" : "pantry is empty — suggestions use history only",
      metric: `${pantry ?? 0} items`,
    },
    {
      id: "autolist.ai",
      label: "AI gateway",
      status: process.env['LOVABLE_API_KEY'] ? "ok" : "fail",
      detail: process.env['LOVABLE_API_KEY'] ? "meal + prediction models available" : "AI key missing",
    },
  ];
}

/** Core data + geocoding checks. */
export async function coreHealth(): Promise<Check[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ count: stores }, { count: located }, { count: prices }] = await Promise.all([
    supabaseAdmin.from("stores").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("stores").select("id", { count: "exact", head: true }).not("lat", "is", null),
    supabaseAdmin.from("prices").select("id", { count: "exact", head: true }),
  ]);

  let geo: Check = { id: "core.geo", label: "Postal code geocoder", status: "fail", detail: "unreachable" };
  try {
    const res = await fetch("https://api.zippopotam.us/de/10115");
    geo = {
      id: "core.geo",
      label: "Postal code geocoder",
      status: res.ok ? "ok" : "warn",
      detail: res.ok ? "keyless geocoding (Zippopotam) reachable" : `HTTP ${res.status}`,
    };
  } catch {
    /* keep fail */
  }

  return [
    {
      id: "core.db",
      label: "Database",
      status: (prices ?? 0) > 0 ? "ok" : "fail",
      detail: "catalogue prices available",
      metric: `${prices ?? 0} prices`,
    },
    {
      id: "core.stores",
      label: "Store coordinates",
      status: stores && located === stores ? "ok" : "warn",
      detail:
        stores && located === stores
          ? "every store is mapped to real coordinates"
          : `${(stores ?? 0) - (located ?? 0)} stores have no coordinates`,
      metric: `${located ?? 0}/${stores ?? 0}`,
    },
    geo,
  ];
}

export async function buildHealthReport(): Promise<HealthReport> {
  const [core, scraper, scan, autolist] = await Promise.all([
    coreHealth(),
    scraperHealth(),
    scanHealth(),
    autoListHealth(),
  ]);
  const groups = [
    { id: "core", label: "Core data", checks: core },
    { id: "scraper", label: "Price scraper", checks: scraper },
    { id: "scan", label: "Barcode scan", checks: scan },
    { id: "autolist", label: "Auto shopping list", checks: autolist },
  ];
  const all = groups.flatMap((g) => g.checks);
  const overall = all.some((c) => c.status === "fail")
    ? "fail"
    : all.some((c) => c.status === "warn")
      ? "warn"
      : "ok";
  return { generated_at: new Date().toISOString(), overall, groups };
}
