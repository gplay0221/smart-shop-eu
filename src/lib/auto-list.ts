export type PurchaseRow = {
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price_cents: number;
  currency: string;
  purchased_on: string;
};

export type Suggestion = {
  key: string;
  name: string;
  productId: string | null;
  timesBought: number;
  avgQuantity: number;
  avgIntervalDays: number | null;
  lastPurchased: string;
  daysSince: number;
  dueScore: number; // 1 = due today, >1 = overdue
  avgPriceCents: number;
  currency: string;
  reason: string;
  inPantry: boolean;
};

const DAY = 86_400_000;

function norm(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Builds an automated shopping list from ~3 months of purchase history.
 * Combines purchase frequency (median restock interval), mean quantity,
 * mean paid price, and what is currently sitting in the pantry.
 */
export function buildAutoList(
  purchases: PurchaseRow[],
  pantryNames: string[],
  now = new Date(),
): Suggestion[] {
  const pantry = new Set(pantryNames.map(norm));
  const groups = new Map<string, PurchaseRow[]>();

  for (const p of purchases) {
    const key = p.product_id ?? norm(p.name);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(p);
    else groups.set(key, [p]);
  }

  const out: Suggestion[] = [];

  for (const [key, rows] of groups) {
    rows.sort((a, b) => a.purchased_on.localeCompare(b.purchased_on));
    const dates = [...new Set(rows.map((r) => r.purchased_on))].map((d) => new Date(`${d}T00:00:00Z`).getTime());
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / DAY);
    const avgIntervalDays = median(gaps.filter((g) => g > 0));

    const last = dates[dates.length - 1];
    const daysSince = Math.max(0, Math.round((now.getTime() - last) / DAY));
    const avgQuantity = rows.reduce((s, r) => s + (Number(r.quantity) || 1), 0) / rows.length;
    const avgPriceCents = Math.round(
      rows.reduce((s, r) => s + (r.unit_price_cents || 0), 0) / rows.length,
    );
    const name = rows[rows.length - 1].name;
    const inPantry = pantry.has(norm(name));

    // Due score: how far through the typical restock cycle we are.
    const dueScore = avgIntervalDays ? daysSince / avgIntervalDays : daysSince / 30;

    const reason = avgIntervalDays
      ? `Bought ${rows.length}× — roughly every ${Math.round(avgIntervalDays)} days, last ${daysSince} days ago`
      : `Bought ${rows.length}× — last ${daysSince} days ago`;

    out.push({
      key,
      name,
      productId: rows[rows.length - 1].product_id,
      timesBought: rows.length,
      avgQuantity: Math.max(1, Math.round(avgQuantity)),
      avgIntervalDays: avgIntervalDays ? Math.round(avgIntervalDays) : null,
      lastPurchased: rows[rows.length - 1].purchased_on,
      daysSince,
      dueScore,
      avgPriceCents,
      currency: rows[rows.length - 1].currency || "EUR",
      reason: inPantry ? `${reason} — still in your pantry` : reason,
      inPantry,
    });
  }

  return out
    .filter((s) => s.timesBought >= 1)
    .sort((a, b) => Number(a.inPantry) - Number(b.inPantry) || b.dueScore - a.dueScore);
}
