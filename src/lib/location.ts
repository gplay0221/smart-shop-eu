// Client-side location preference stored in localStorage.
// Read via useHydrated pattern (in useEffect) to avoid SSR mismatch.

export type Location = { countryCode: string; cityId: string; cityName: string; countryName: string; flag: string };

const KEY = "eurosaver.location";

export function readLocation(): Location | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Location) : null;
  } catch { return null; }
}

export function writeLocation(loc: Location | null) {
  if (typeof window === "undefined") return;
  if (loc) window.localStorage.setItem(KEY, JSON.stringify(loc));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("eurosaver:location"));
}

export function formatPrice(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(cents / 100);
}
