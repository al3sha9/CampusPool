export type Destination = {
  id: string;
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  source: "osm" | "pin" | "preset";
};
export const metroDestination: Destination = {
  id: "metro",
  name: "6th Road Metrobus Station",
  address: "6th Road, Rawalpindi",
  longitude: 73.0777149,
  latitude: 33.6433767,
  source: "preset",
};
export function validDestination(point: Pick<Destination, "longitude" | "latitude">) {
  return (
    Number.isFinite(point.longitude) &&
    Number.isFinite(point.latitude) &&
    point.longitude >= 72.5 &&
    point.longitude <= 74 &&
    point.latitude >= 33 &&
    point.latitude <= 34.5
  );
}
export function pinnedDestination(
  longitude: number,
  latitude: number,
  name = "Shared drop-off"
): Destination {
  if (!validDestination({ longitude, latitude }))
    throw new Error("Choose a drop-off in the Islamabad–Rawalpindi area.");
  const lon = Number(longitude.toFixed(4)),
    lat = Number(latitude.toFixed(4));
  return {
    id: `pin:${lat.toFixed(4)}:${lon.toFixed(4)}`,
    name: name.trim().slice(0, 160) || "Shared drop-off",
    address: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    longitude: lon,
    latitude: lat,
    source: "pin",
  };
}
export function parsePlaces(data: unknown): Destination[] {
  if (!data || typeof data !== "object" || !("features" in data) || !Array.isArray(data.features))
    return [];
  const seen = new Set<string>();
  return data.features
    .flatMap((feature) => {
      const p = feature?.properties,
        coords = feature?.geometry?.coordinates;
      if (
        !p ||
        !Array.isArray(coords) ||
        !["N", "W", "R"].includes(p.osm_type) ||
        !Number.isSafeInteger(p.osm_id) ||
        p.osm_id < 1
      )
        return [];
      const longitude = coords[0],
        latitude = coords[1];
      if (!validDestination({ longitude, latitude })) return [];
      const id = `osm:${p.osm_type}:${p.osm_id}`;
      if (seen.has(id)) return [];
      const name = typeof p.name === "string" && p.name.trim() ? p.name : p.street;
      if (typeof name !== "string" || !name.trim()) return [];
      seen.add(id);
      const address = [
        ...new Set(
          [p.housenumber, p.street, p.district, p.city, p.state].filter(
            (x) => typeof x === "string" && x.trim()
          )
        ),
      ]
        .join(", ")
        .slice(0, 300);
      return [
        {
          id,
          name: name.trim().slice(0, 160),
          address,
          longitude,
          latitude,
          source: "osm" as const,
        },
      ];
    })
    .slice(0, 8);
}
const cache = new Map<string, Destination[]>();
let lastSearch = 0;
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Destination[]> {
  const q = query.trim();
  if (q.length < 3) throw new Error("Enter at least 3 characters.");
  const key = q.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  if (Date.now() - lastSearch < 1000) throw new Error("Wait a moment before searching again.");
  lastSearch = Date.now();
  const params = new URLSearchParams({
    q: q.slice(0, 120),
    limit: "8",
    lang: "en",
    lat: "33.6432666",
    lon: "73.0790092",
    bbox: "72.5,33,74,34.5",
  });
  let response: Response;
  let data: unknown;
  try {
    response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
    if (response.ok) data = await response.json();
  } catch {
    throw new Error(
      signal?.aborted
        ? "Search timed out. Retry or choose on the map."
        : "Couldn’t reach place search. Check your connection, retry or choose on the map."
    );
  }
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Place search is busy. Try again shortly or choose on the map."
        : "Place search unavailable. Retry or choose on the map."
    );
  const places = parsePlaces(data);
  if (cache.size >= 30) cache.delete(cache.keys().next().value!);
  cache.set(key, places);
  return places;
}
