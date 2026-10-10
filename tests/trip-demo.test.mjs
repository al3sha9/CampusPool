import assert from "node:assert/strict";
import { test } from "node:test";
import { demoTrips, splitFare, validateRequest } from "../src/lib/trip-demo.ts";

function request(maxShare = 450) {
  const start = Date.now() + 10 * 60000;
  return {
    hubId: "metro",
    earliestAt: new Date(start).toISOString(),
    latestAt: new Date(start + 15 * 60000).toISOString(),
    maxShare,
  };
}
test("integer shares preserve the fare including remainder", () => {
  assert.deepEqual(splitFare(1000, 3), [334, 333, 333]);
  for (let fare = 1; fare <= 1500; fare++) {
    for (const count of [2, 3])
      assert.equal(
        splitFare(fare, count).reduce((a, b) => a + b, 0),
        fare
      );
  }
});
test("invalid windows and fractional budgets are rejected", () => {
  const valid = request();
  assert.doesNotThrow(() => validateRequest(valid));
  assert.throws(() => validateRequest({ ...valid, maxShare: 0.5 }));
  assert.throws(() => validateRequest({ ...valid, latestAt: valid.earliestAt }));
  assert.throws(() =>
    validateRequest({ ...valid, earliestAt: new Date(Date.now() - 60000).toISOString() })
  );
});
test("suggestions respect post-join budget and empty results", async () => {
  assert.deepEqual(
    (await demoTrips.suggestions(request(300))).map((s) => s.count),
    [2]
  );
  assert.deepEqual(await demoTrips.suggestions(request(299)), []);
});
test("cancellation reprices, resets consent and prevents stale lock", async () => {
  const req = request();
  let group = await demoTrips.join(req, (await demoTrips.suggestions(req))[0]);
  group = await demoTrips.update(group, "confirm");
  group = await demoTrips.update(group, "peer-confirm");
  const oldVersion = group.version;
  group = await demoTrips.update(group, "remove");
  assert.deepEqual(splitFare(group.total, group.members.length), [450, 450]);
  assert.equal(group.version, oldVersion + 1);
  assert.ok(group.members.every((m) => m.confirmedVersion === null));
  await assert.rejects(demoTrips.update(group, "lock"));
  group = await demoTrips.update(group, "replace");
  assert.deepEqual(splitFare(group.total, group.members.length), [300, 300, 300]);
  await assert.rejects(demoTrips.update(group, "replace"));
  group = await demoTrips.update(group, "confirm");
  group = await demoTrips.update(group, "peer-confirm");
  group = await demoTrips.update(group, "lock");
  assert.equal(group.status, "locked");
  await assert.rejects(demoTrips.update(group, "remove"));
});
test("solo group cannot confirm or lock and replacements remain unique", async () => {
  let group = await demoTrips.join(request());
  await assert.rejects(demoTrips.update(group, "confirm"));
  await assert.rejects(demoTrips.update(group, "lock"));
  group = await demoTrips.update(group, "replace");
  group = await demoTrips.update(group, "replace");
  assert.equal(new Set(group.members.map((m) => m.id)).size, 3);
});
