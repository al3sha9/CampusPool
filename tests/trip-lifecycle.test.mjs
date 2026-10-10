import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import {
  createDemoPickup,
  currentConsent,
  demoTrips,
  parseFare,
  readyToStart,
  splitFare,
} from "../src/lib/trip-demo.ts";

function makePickup() {
  let time = Date.now();
  return {
    advance: (ms) => {
      time += ms;
    },
    pickup: createDemoPickup({
      randomToken: async () => randomBytes(16).toString("hex"),
      hash: async (token) => createHash("sha256").update(token).digest("hex"),
      now: () => time,
    }),
  };
}
async function openGroup(budget = 450) {
  const start = Date.now() + 10 * 60000;
  const request = {
    hubId: "metro",
    earliestAt: new Date(start).toISOString(),
    latestAt: new Date(start + 15 * 60000).toISOString(),
    maxShare: budget,
  };
  return demoTrips.join(request, (await demoTrips.suggestions(request))[0]);
}
async function consent(group) {
  for (const m of group.members) group = await demoTrips.confirm(group, m.id);
  return group;
}
async function lockedGroup(budget) {
  const group = await consent(await openGroup(budget));
  return demoTrips.lock(group, group.organiserId);
}
async function arrived(group, pickup) {
  for (const m of group.members.filter((m) => m.id !== group.organiserId)) {
    const qr = await pickup.issue(group, m.id);
    group = await pickup.verify(group, group.organiserId, qr.value);
  }
  return demoTrips.markOwnArrival(group, group.organiserId);
}

test("fare input rejects decimals, negatives, empty strings, exponent notation and overflow", () => {
  assert.equal(parseFare(" 1000 "), 1000);
  for (const invalid of ["", "0", "-1", "1000.5", "1e3", "Infinity", "9007199254740992", "PKR 900"])
    assert.throws(() => parseFare(invalid));
});
test("changed locked quote resets consent and arrivals; same fare preserves them", async () => {
  const { pickup } = makePickup();
  let group = await lockedGroup();
  const token = await pickup.issue(group, "you");
  group = await pickup.verify(group, group.organiserId, token.value);
  const same = await demoTrips.setQuote(group, 900, group.organiserId);
  assert.equal(same.version, group.version);
  assert.ok(same.members.find((m) => m.id === "you").pickupConfirmedAt);
  group = await demoTrips.setQuote(same, 1000, same.organiserId);
  assert.equal(group.status, "locked");
  assert.equal(group.quotes.length, 3);
  assert.equal(group.initialTotal, 900);
  assert.ok(
    group.members.every((m) => m.confirmedVersion === null && m.pickupConfirmedAt === null)
  );
  await assert.rejects(pickup.issue(group, "you"));
  group = await consent(group);
  await assert.rejects(pickup.verify(group, group.organiserId, token.value));
  assert.deepEqual(splitFare(group.total, 3), [334, 333, 333]);
});
test("over-budget quote cannot be confirmed, issued a QR or started", async () => {
  let group = await lockedGroup(300);
  group = await demoTrips.setQuote(group, 1000, group.organiserId);
  assert.equal(currentConsent(group), false);
  await assert.rejects(demoTrips.confirm(group, "you"));
  await assert.rejects(makePickup().pickup.issue(group, "you"));
  await assert.rejects(demoTrips.start(group, group.organiserId));
});
test("organiser-only mutations reject passenger and unrelated actors", async () => {
  let group = await consent(await openGroup());
  await assert.rejects(demoTrips.lock(group, "you"));
  group = await demoTrips.lock(group, group.organiserId);
  await assert.rejects(demoTrips.setQuote(group, 1000, "you"));
  await assert.rejects(demoTrips.markOwnArrival(group, "you"));
  await assert.rejects(demoTrips.start(group, "you"));
  await assert.rejects(demoTrips.cancel(group, "you", "Changed plans"));
  await assert.rejects(demoTrips.confirm(group, "stranger"));
  const { pickup } = makePickup();
  await assert.rejects(pickup.issue(group, group.organiserId));
  await assert.rejects(pickup.issue(group, "stranger"));
  const qr = await pickup.issue(group, "you");
  await assert.rejects(pickup.verify(group, "Bilal", qr.value));
});
test("QR regeneration, expiry, prefix validation, and group binding", async () => {
  const { pickup, advance } = makePickup();
  let group = await lockedGroup();
  const old = await pickup.issue(group, "you");
  const replacement = await pickup.issue(group, "you");
  await assert.rejects(pickup.verify(group, group.organiserId, old.value));
  for (const invalid of [
    "https://example.com",
    "campuspool:pickup:v1:",
    replacement.value + "extra",
    replacement.value.replace("v1", "v2"),
  ])
    await assert.rejects(pickup.verify(group, group.organiserId, invalid));
  const other = await lockedGroup();
  await assert.rejects(pickup.verify(other, other.organiserId, replacement.value));
  advance(5 * 60000);
  await assert.rejects(pickup.verify(group, group.organiserId, replacement.value));
  const fresh = await pickup.issue(group, "you");
  group = await pickup.verify(group, group.organiserId, fresh.value);
  assert.ok(group.members.find((m) => m.id === "you").pickupConfirmedAt);
  await assert.rejects(pickup.verify(group, group.organiserId, fresh.value));
  await assert.rejects(pickup.issue(group, "you"));
});
test("duplicate concurrent scans consume a token once", async () => {
  const { pickup } = makePickup();
  const group = await lockedGroup();
  const qr = await pickup.issue(group, "you");
  const outcomes = await Promise.allSettled([
    pickup.verify(group, group.organiserId, qr.value),
    pickup.verify(group, group.organiserId, qr.value),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((r) => r.status === "rejected").length, 1);
});
test("stale quote-version QR is rejected after fresh consent", async () => {
  const { pickup } = makePickup();
  let group = await lockedGroup();
  const qr = await pickup.issue(group, "you");
  group = await demoTrips.setQuote(group, 1000, group.organiserId);
  group = await consent(group);
  await assert.rejects(pickup.verify(group, group.organiserId, qr.value));
});
test("start requires every passenger and organiser arrival; completion retains accepted fare", async () => {
  const { pickup } = makePickup();
  let group = await lockedGroup();
  await assert.rejects(demoTrips.start(group, group.organiserId));
  for (const m of group.members.filter((m) => m.id !== group.organiserId)) {
    const qr = await pickup.issue(group, m.id);
    group = await pickup.verify(group, group.organiserId, qr.value);
  }
  assert.equal(readyToStart(group), false);
  await assert.rejects(demoTrips.start(group, group.organiserId));
  group = await demoTrips.markOwnArrival(group, group.organiserId);
  assert.equal(readyToStart(group), true);
  group = await demoTrips.start(group, group.organiserId);
  await assert.rejects(demoTrips.complete(group, "you"));
  await assert.rejects(demoTrips.leave(group, "you"));
  group = await demoTrips.complete(group, group.organiserId);
  assert.equal(group.status, "completed");
  assert.equal(group.total, 900);
  assert.ok(group.completedAt);
  await assert.rejects(demoTrips.complete(group, group.organiserId));
  await assert.rejects(demoTrips.setQuote(group, 1000, group.organiserId));
  await assert.rejects(demoTrips.cancel(group, group.organiserId, "Changed plans"));
});
test("optional final fare is append-only and splits exactly", async () => {
  let group = await arrived(await lockedGroup(), makePickup().pickup);
  group = await demoTrips.start(group, group.organiserId);
  await assert.rejects(demoTrips.complete(group, group.organiserId, -1));
  group = await demoTrips.complete(group, group.organiserId, 1000);
  assert.equal(group.quotes.at(-1).source, "final_total");
  assert.equal(group.quotes[0].total, 900);
  assert.equal(group.initialTotal, 900);
  assert.deepEqual(splitFare(group.total, group.members.length), [334, 333, 333]);
});
test("locked departure resets pickup and consent, prohibits replacements and cancels below two", async () => {
  const { pickup } = makePickup();
  let group = await arrived(await lockedGroup(), pickup);
  group = await demoTrips.leave(group, "Bilal");
  assert.equal(group.status, "locked");
  assert.equal(group.members.length, 2);
  assert.ok(
    group.members.every((m) => m.pickupConfirmedAt === null && m.confirmedVersion === null)
  );
  await assert.rejects(demoTrips.update(group, "replace"));
  group = await demoTrips.leave(group, "you");
  assert.equal(group.status, "cancelled");
  assert.ok(group.cancellationReason);
  await assert.rejects(demoTrips.start(group, group.organiserId));
});
test("organiser departure transfers control; cancellation requires a reason and clears arrival", async () => {
  let group = await lockedGroup();
  group = await demoTrips.leave(group, group.organiserId);
  assert.equal(group.organiserId, "Bilal");
  await assert.rejects(demoTrips.cancel(group, group.organiserId, ""));
  group = await demoTrips.cancel(group, group.organiserId, "Booking unavailable.");
  assert.equal(group.status, "cancelled");
  assert.ok(
    group.members.every((m) => m.pickupConfirmedAt === null && m.confirmedVersion === null)
  );
  await assert.rejects(demoTrips.confirm(group, "you"));
});
test("discarded groups reject stale operations and QR records can be cleared", async () => {
  const { pickup } = makePickup();
  const group = await lockedGroup();
  const qr = await pickup.issue(group, "you");
  pickup.clearGroup(group.id);
  await assert.rejects(pickup.verify(group, group.organiserId, qr.value));
  demoTrips.discard(group.id);
  await assert.rejects(demoTrips.markOwnArrival(group, group.organiserId));
});
