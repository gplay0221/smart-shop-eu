import type { NormalizedProduct } from "./types";

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9%\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SIZE_RE = /(\d+[.,]?\d*)\s?(kg|g|l|ml|cl|stk|st|pcs|pack)\b/i;

/** Resolve free text or a barcode to a catalog product when possible. */
export async function normalizeProduct(input: {
  query?: string;
  barcode?: string;
}): Promise<NormalizedProduct> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const query = (input.query ?? "").trim();
  const barcode = (input.barcode ?? "").trim();
  const norm = normalizeText(query);
  const sizeMatch = query.match(SIZE_RE);

  let row: {
    id: string;
    name: string;
    brand: string | null;
    category: string | null;
    unit: string | null;
    barcode: string | null;
  } | null = null;

  if (barcode) {
    const { data } = await supabaseAdmin
      .from("products")
      .select("id, name, brand, category, unit, barcode")
      .eq("barcode", barcode)
      .maybeSingle();
    row = data ?? null;
  }
  if (!row && norm) {
    const words = norm.split(" ").filter((w) => w.length > 2);
    const filters = [`name.ilike.%${query}%`, `brand.ilike.%${query}%`];
    for (const w of words) filters.push(`name.ilike.%${w}%`, `brand.ilike.%${w}%`);
    const { data } = await supabaseAdmin
      .from("products")
      .select("id, name, brand, category, unit, barcode")
      .or(filters.join(","))
      .limit(5);
    // Prefer a row that matches brand and name when the user typed both.
    row =
      data?.find((p) =>
        words.every((w) => `${p.brand ?? ""} ${p.name}`.toLowerCase().includes(w)),
      ) ??
      data?.[0] ??
      null;
  }

  const terms = Array.from(
    new Set(
      [norm, row ? normalizeText(row.name) : ""]
        .flatMap((t) => [t, ...t.split(" ")])
        .filter((t) => t.length > 2),
    ),
  );

  return {
    id: barcode || norm.replace(/\s+/g, "_") || "unknown",
    name: row?.name ?? query ?? "Unknown product",
    barcode: barcode || row?.barcode || null,
    brand: row?.brand ?? null,
    size: sizeMatch?.[0] ?? row?.unit ?? null,
    category: row?.category ?? null,
    productId: row?.id ?? null,
    terms: terms.length > 0 ? terms : [norm].filter(Boolean),
  };
}
