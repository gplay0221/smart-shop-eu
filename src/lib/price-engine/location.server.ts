import type { ResolvedLocation } from "./types";

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
}

/** Accepts "lat,lng", a postal code, or a city name. Never throws. */
export async function resolveLocation(
  location: string | undefined,
  countryCode: string,
): Promise<ResolvedLocation> {
  const raw = (location ?? "").trim();
  const base: ResolvedLocation = {
    locationKey: raw ? `${countryCode}:${raw.toLowerCase()}` : `${countryCode}:any`,
    displayName: raw || `${countryCode} (nationwide)`,
    lat: null,
    lng: null,
    postalCode: null,
    countryCode,
  };
  if (!raw) return base;

  const coords = raw.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (coords) {
    return {
      ...base,
      lat: Number(coords[1]),
      lng: Number(coords[2]),
      displayName: `${coords[1]}, ${coords[2]}`,
    };
  }

  if (/^\d{4,5}$/.test(raw)) {
    try {
      const res = await fetch(
        `https://api.zippopotam.us/${countryCode.toLowerCase()}/${raw}`,
      );
      if (res.ok) {
        const json = (await res.json()) as {
          places?: { latitude: string; longitude: string; "place name": string }[];
        };
        const place = json.places?.[0];
        if (place) {
          return {
            ...base,
            postalCode: raw,
            lat: Number(place.latitude),
            lng: Number(place.longitude),
            displayName: `${raw} ${place["place name"]}`,
          };
        }
      }
    } catch {
      /* geocoding is best-effort */
    }
    return { ...base, postalCode: raw };
  }

  return base;
}
