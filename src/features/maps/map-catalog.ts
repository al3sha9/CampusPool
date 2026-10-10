import type { Destination } from "@/lib/destinations";
import type { HubId } from "@/lib/trip-demo";
// Public place coordinates from the Google Maps links supplied by the organiser.
// The campus point identifies BIIT, not an independently verified gate entrance.
export const mapCatalog = {
  pickup: { name: "BIIT campus", coordinate: [73.0790092, 33.6432666] as [number, number] },
  metro: {
    name: "6th Road Metrobus Station",
    coordinate: [73.0777149, 33.6433767] as [number, number],
  },
  city: { name: "City centre hub · location unconfirmed", coordinate: null },
};
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
export function destinationCoordinate(
  hubId: HubId,
  destination?: Destination
): [number, number] | null {
  if (destination) return [destination.longitude, destination.latitude];
  return hubId === "metro" ? mapCatalog.metro.coordinate : null;
}
export function mapBounds(
  hubId: HubId,
  destination?: Destination
): [number, number, number, number] {
  const a = mapCatalog.pickup.coordinate,
    b = destinationCoordinate(hubId, destination) ?? a;
  return [
    Math.min(a[0], b[0]) - 0.002,
    Math.min(a[1], b[1]) - 0.002,
    Math.max(a[0], b[0]) + 0.002,
    Math.max(a[1], b[1]) + 0.002,
  ];
}
