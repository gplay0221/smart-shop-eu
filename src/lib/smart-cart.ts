import { haversineKm } from "@/lib/geo";

export type Stop = {
  storeId: string;
  chain: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

export type OrderedStop = Stop & { legKm: number | null; cumulativeKm: number | null };

/** Nearest-neighbour ordering of store stops from an origin point. */
export function optimizeRoute(stops: Stop[], origin: { lat: number; lng: number } | null): OrderedStop[] {
  const withCoords = stops.filter((s) => s.lat != null && s.lng != null);
  const without = stops.filter((s) => s.lat == null || s.lng == null);

  if (!origin || withCoords.length === 0) {
    return stops.map((s) => ({ ...s, legKm: null, cumulativeKm: null }));
  }

  const remaining = [...withCoords];
  const ordered: OrderedStop[] = [];
  let current = origin;
  let cumulative = 0;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestKm = Infinity;
    remaining.forEach((s, i) => {
      const km = haversineKm(current, { lat: s.lat!, lng: s.lng! });
      if (km < bestKm) {
        bestKm = km;
        bestIdx = i;
      }
    });
    const [next] = remaining.splice(bestIdx, 1);
    cumulative += bestKm;
    ordered.push({ ...next, legKm: bestKm, cumulativeKm: cumulative });
    current = { lat: next.lat!, lng: next.lng! };
  }

  return [...ordered, ...without.map((s) => ({ ...s, legKm: null, cumulativeKm: null }))];
}

export type CartItem = { id: string; productId: string; quantity: number; storeId: string; priceCents: number };
/** productId -> storeId -> price in cents (only for stores that stock it) */
export type PriceIndex = Map<string, Map<string, number>>;

export type CartPlan = {
  assignments: Map<string, { storeId: string; priceCents: number }>;
  totalCents: number;
  stops: number;
};

const TRAVEL_COST_CENTS = 200; // assumed cost/effort of one extra stop

function planFor(items: CartItem[], allowedStores: Set<string> | null, prices: PriceIndex): CartPlan | null {
  const assignments = new Map<string, { storeId: string; priceCents: number }>();
  let totalCents = 0;
  const stops = new Set<string>();

  for (const item of items) {
    const byStore = prices.get(item.productId);
    if (!byStore || byStore.size === 0) return null;
    let bestStore: string | null = null;
    let bestPrice = Infinity;
    for (const [storeId, price] of byStore) {
      if (allowedStores && !allowedStores.has(storeId)) continue;
      if (price < bestPrice) {
        bestPrice = price;
        bestStore = storeId;
      }
    }
    if (!bestStore) return null;
    assignments.set(item.id, { storeId: bestStore, priceCents: bestPrice });
    totalCents += bestPrice * item.quantity;
    stops.add(bestStore);
  }

  return { assignments, totalCents, stops: stops.size };
}

/**
 * Smart Cart: pick the cheapest store per item, then greedily drop stops when the
 * extra product cost is smaller than the assumed travel cost of the removed stop.
 */
export function optimizeCart(items: CartItem[], prices: PriceIndex): CartPlan | null {
  let plan = planFor(items, null, prices);
  if (!plan) return null;

  let improved = true;
  while (improved && plan.stops > 1) {
    improved = false;
    const stores = Array.from(new Set(Array.from(plan.assignments.values()).map((a) => a.storeId)));
    let bestCandidate: CartPlan | null = null;

    for (const drop of stores) {
      const allowed = new Set(stores.filter((s) => s !== drop));
      const candidate = planFor(items, allowed, prices);
      if (!candidate) continue;
      const extraCost = candidate.totalCents - plan.totalCents;
      const stopsSaved = plan.stops - candidate.stops;
      if (stopsSaved > 0 && extraCost < stopsSaved * TRAVEL_COST_CENTS) {
        if (!bestCandidate || candidate.totalCents < bestCandidate.totalCents) bestCandidate = candidate;
      }
    }

    if (bestCandidate) {
      plan = bestCandidate;
      improved = true;
    }
  }

  return plan;
}
