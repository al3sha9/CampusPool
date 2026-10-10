import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlaces, pinnedDestination, validDestination } from "../src/lib/destinations.ts";

test("place parser rejects invalid/out-of-area results and deduplicates stable OSM IDs", () => {
  const feature = {
    properties: { osm_type: "W", osm_id: 123, name: "Mall", city: "Islamabad" },
    geometry: { coordinates: [73.05, 33.7] },
  };
  const results = parsePlaces({
    features: [
      feature,
      feature,
      {
        ...feature,
        properties: { ...feature.properties, osm_id: 124 },
        geometry: { coordinates: [0, 0] },
      },
      null,
    ],
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "osm:W:123");
  assert.equal(results[0].address, "Islamabad");
  assert.deepEqual(parsePlaces(null), []);
});

test("pins produce stable shared identity and reject invalid points", () => {
  assert.equal(
    pinnedDestination(73.123412, 33.712312).id,
    pinnedDestination(73.123419, 33.712319).id
  );
  assert.equal(validDestination({ longitude: NaN, latitude: 33.7 }), false);
  assert.throws(() => pinnedDestination(0, 0));
});

test("native cancellation gets a usable message instead of Swift internals", async () => {
  const { searchPlaces } = await import("../src/lib/destinations.ts");
  const original = globalThis.fetch;
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = async () => {
    throw new Error("FetchRequestCanceledException NativeResponse.swift:63");
  };
  try {
    await assert.rejects(
      searchPlaces("Centaurus cancellation test", controller.signal),
      /Search timed out\. Retry or choose on the map\./
    );
  } finally {
    globalThis.fetch = original;
  }
});
