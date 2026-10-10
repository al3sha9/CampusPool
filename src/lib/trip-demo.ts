import { metroDestination, type Destination } from "./destinations.ts";

// Local UI fixture only. Replace this adapter with authenticated Supabase RPCs.
export const hubs = [
  { id: "metro", name: "6th Road Metrobus Station", total: 900 },
  { id: "city", name: "City centre hub", total: 1200 },
] as const;
export type HubId = string;
export type RideRequest = {
  hubId: HubId;
  destination?: Destination;
  carEstimate?: number;
  earliestAt: string;
  latestAt: string;
  maxShare: number;
};
export type Member = {
  id: string;
  name: string;
  maxShare: number;
  confirmedVersion: number | null;
  pickupConfirmedAt: string | null;
};
export type Quote = {
  total: number;
  source: "demo_estimate" | "initial_estimate" | "organiser_quote" | "final_total";
  enteredBy: string;
  createdAt: string;
};
export type Group = {
  id: string;
  request: RideRequest;
  total: number;
  initialTotal: number;
  version: number;
  members: Member[];
  shares?: number[];
  leftMembers: Member[];
  organiserId: string;
  status: "open" | "locked" | "in_progress" | "completed" | "cancelled";
  quotes: Quote[];
  startedAt: string | null;
  completedAt: string | null;
  cancellationReason: string | null;
};
export type Suggestion = { id: string; count: number; total: number; departureAt: string };
export const student = { id: "you", name: "Ayesha" };
export const PICKUP_PREFIX = "campuspool:pickup:v1:";
const groups = new Map<string, Group>();
let groupSequence = 0;
const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 150));
export function hubFor(id: HubId) {
  return hubs.find((hub) => hub.id === id) ?? { id, name: "Shared drop-off", total: 900 };
}
export function requestDestination(request: RideRequest): Destination | undefined {
  return request.destination ?? (request.hubId === "metro" ? metroDestination : undefined);
}
export function destinationName(request: RideRequest) {
  return request.destination?.name ?? hubFor(request.hubId).name;
}
export function splitFare(total: number, count: number): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isInteger(count) || count < 1)
    throw new Error("Invalid fare or passenger count.");
  return Array.from(
    { length: count },
    (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0)
  );
}
export function fareShares(group: Group): number[] {
  return group.shares ?? splitFare(group.total, group.members.length);
}
export function parseFare(value: string): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(Number(trimmed)) || Number(trimmed) < 1)
    throw new Error("Enter a whole PKR amount greater than zero.");
  return Number(trimmed);
}
export function validateRequest(request: RideRequest, now = Date.now()) {
  const earliest = Date.parse(request.earliestAt),
    latest = Date.parse(request.latestAt);
  const width = (latest - earliest) / 60000;
  if (
    !Number.isFinite(earliest) ||
    !Number.isFinite(latest) ||
    earliest <= now ||
    latest > now + 86400000 ||
    width < 5 ||
    width > 60
  )
    throw new Error(
      "Choose a future departure window, 5–60 minutes wide, within the next 24 hours."
    );
  if (!Number.isSafeInteger(request.maxShare) || request.maxShare < 1)
    throw new Error("Enter a maximum share in whole PKR, greater than zero.");
}
function current(group: Group) {
  if (groups.get(group.id) !== group) throw new Error("Group changed. Refresh and try again.");
  return group;
}
function save(group: Group) {
  groups.set(group.id, group);
  return group;
}
function member(group: Group, actorId: string) {
  const found = group.members.find((m) => m.id === actorId);
  if (!found) throw new Error("Only an active group member can do this.");
  return found;
}
function organiser(group: Group, actorId: string) {
  member(group, actorId);
  if (group.organiserId !== actorId) throw new Error("Only the organiser can do this.");
}
function state(group: Group, allowed: Group["status"][]) {
  if (!allowed.includes(group.status))
    throw new Error("This action is not available in the current trip state.");
}
function departureValid(group: Group) {
  if (Date.parse(group.request.latestAt) < Date.now())
    throw new Error("Departure window expired. Leave this group and find a new one.");
}
export function withinBudgets(group: Group) {
  return (
    group.members.length > 0 &&
    splitFare(group.total, group.members.length).every(
      (share, i) => share <= group.members[i].maxShare
    )
  );
}
export function currentConsent(group: Group) {
  return (
    group.members.length >= 2 &&
    withinBudgets(group) &&
    group.members.every((m) => m.confirmedVersion === group.version)
  );
}
export function readyToStart(group: Group) {
  return (
    group.status === "locked" &&
    currentConsent(group) &&
    group.members.every((m) => !!m.pickupConfirmedAt)
  );
}
function clearConsent(members: Member[]) {
  return members.map((m) => ({ ...m, confirmedVersion: null, pickupConfirmedAt: null }));
}
function quote(total: number, source: Quote["source"], actorId: string): Quote {
  if (!Number.isSafeInteger(total) || total < 1)
    throw new Error("Enter a whole PKR amount greater than zero.");
  return { total, source, enteredBy: actorId, createdAt: new Date().toISOString() };
}
function removeMember(group: Group, actorId: string): Group {
  current(group);
  state(group, ["open", "locked"]);
  const leaving = member(group, actorId);
  const members = group.members.filter((m) => m.id !== actorId);
  const cancelled = !members.length || (group.status === "locked" && members.length < 2);
  return save({
    ...group,
    members: clearConsent(members),
    leftMembers: [...group.leftMembers, leaving],
    version: group.version + 1,
    status: cancelled ? "cancelled" : group.status,
    organiserId: group.organiserId === actorId ? (members[0]?.id ?? actorId) : group.organiserId,
    cancellationReason: cancelled ? "Not enough passengers to continue." : null,
  });
}
export const demoTrips = {
  async suggestions(request: RideRequest): Promise<Suggestion[]> {
    await wait();
    validateRequest(request);
    const total = hubFor(request.hubId).total;
    return [2, 1]
      .filter((count) => Math.max(...splitFare(total, count + 1)) <= request.maxShare)
      .map((count) => ({ id: `demo-${count}`, count, total, departureAt: request.earliestAt }));
  },
  async join(request: RideRequest, suggestion?: Suggestion): Promise<Group> {
    await wait();
    validateRequest(request);
    const peers =
      suggestion?.count === 2 ? ["Sana", "Bilal"] : suggestion?.count === 1 ? ["Sana"] : [];
    const members = [...peers.map((name) => ({ id: name, name })), student].map((m) => ({
      ...m,
      maxShare: request.maxShare,
      confirmedVersion: null,
      pickupConfirmedAt: null,
    }));
    const total = hubFor(request.hubId).total;
    if (suggestion && Math.max(...splitFare(total, members.length)) > request.maxShare)
      throw new Error("The estimated share exceeds your budget.");
    return save({
      id: `group-${++groupSequence}`,
      request,
      total,
      initialTotal: total,
      version: 1,
      members,
      leftMembers: [],
      organiserId: peers[0] ?? student.id,
      status: "open",
      quotes: [quote(total, "demo_estimate", student.id)],
      startedAt: null,
      completedAt: null,
      cancellationReason: null,
    });
  },
  async confirm(group: Group, actorId: string): Promise<Group> {
    await wait();
    current(group);
    state(group, ["open", "locked"]);
    departureValid(group);
    const actor = member(group, actorId);
    if (
      group.members.length < 2 ||
      splitFare(group.total, group.members.length)[group.members.indexOf(actor)] > actor.maxShare
    )
      throw new Error("Wait for another student or review your budget before confirming.");
    return save({
      ...group,
      members: group.members.map((m) =>
        m.id === actorId ? { ...m, confirmedVersion: group.version } : m
      ),
    });
  },
  async lock(group: Group, actorId: string): Promise<Group> {
    await wait();
    current(group);
    state(group, ["open"]);
    organiser(group, actorId);
    departureValid(group);
    if (!currentConsent(group))
      throw new Error("Everyone must confirm the current estimate within budget before locking.");
    return save({ ...group, status: "locked" });
  },
  async setQuote(group: Group, total: number, actorId: string): Promise<Group> {
    await wait();
    current(group);
    state(group, ["locked"]);
    organiser(group, actorId);
    departureValid(group);
    const entry = quote(total, "organiser_quote", actorId);
    const changed = total !== group.total;
    return save({
      ...group,
      total,
      quotes: [...group.quotes, entry],
      version: group.version + (changed ? 1 : 0),
      members: changed ? clearConsent(group.members) : group.members,
    });
  },
  async markOwnArrival(group: Group, actorId: string): Promise<Group> {
    await wait();
    current(group);
    state(group, ["locked"]);
    organiser(group, actorId);
    departureValid(group);
    if (!currentConsent(group)) throw new Error("Everyone must confirm the current fare first.");
    return save({
      ...group,
      members: group.members.map((m) =>
        m.id === actorId
          ? { ...m, pickupConfirmedAt: m.pickupConfirmedAt ?? new Date().toISOString() }
          : m
      ),
    });
  },
  async start(group: Group, actorId: string): Promise<Group> {
    await wait();
    current(group);
    state(group, ["locked"]);
    organiser(group, actorId);
    departureValid(group);
    if (!readyToStart(group))
      throw new Error("Everyone must confirm the fare and arrive before starting.");
    return save({ ...group, status: "in_progress", startedAt: new Date().toISOString() });
  },
  async complete(group: Group, actorId: string, finalTotal?: number): Promise<Group> {
    await wait();
    current(group);
    state(group, ["in_progress"]);
    organiser(group, actorId);
    const entry = finalTotal === undefined ? null : quote(finalTotal, "final_total", actorId);
    return save({
      ...group,
      status: "completed",
      total: entry?.total ?? group.total,
      quotes: entry ? [...group.quotes, entry] : group.quotes,
      completedAt: new Date().toISOString(),
    });
  },
  async cancel(group: Group, actorId: string, reason: string): Promise<Group> {
    await wait();
    current(group);
    state(group, ["open", "locked", "in_progress"]);
    organiser(group, actorId);
    if (!reason.trim()) throw new Error("Choose a cancellation reason.");
    return save({
      ...group,
      status: "cancelled",
      cancellationReason: reason.trim(),
      version: group.version + 1,
      members: clearConsent(group.members),
    });
  },
  async leave(group: Group, actorId: string): Promise<Group> {
    await wait();
    return removeMember(group, actorId);
  },
  // Explicit fixture controls retained for the existing single-device lobby.
  async update(
    group: Group,
    action: "confirm" | "peer-confirm" | "remove" | "replace" | "lock"
  ): Promise<Group> {
    if (action === "confirm") return demoTrips.confirm(group, student.id);
    if (action === "lock") return demoTrips.lock(group, group.organiserId);
    if (action === "peer-confirm") {
      let next = group;
      for (const peer of group.members.filter((m) => m.id !== student.id))
        next = await demoTrips.confirm(next, peer.id);
      return next;
    }
    await wait();
    current(group);
    state(group, ["open"]);
    departureValid(group);
    if (action === "remove") {
      const peer = group.members.findLast((m) => m.id !== student.id);
      if (!peer) throw new Error("No other passenger to remove.");
      return removeMember(group, peer.id);
    }
    if (group.members.length >= 3) throw new Error("Group just filled.");
    const name = ["Hamza", "Sana", "Bilal"].find((n) => !group.members.some((m) => m.id === n))!;
    return save({
      ...group,
      version: group.version + 1,
      members: clearConsent([
        ...group.members,
        {
          id: name,
          name,
          maxShare: group.request.maxShare,
          confirmedVersion: null,
          pickupConfirmedAt: null,
        },
      ]),
    });
  },
  discard(groupId: string) {
    groups.delete(groupId);
  },
};

export type PickupCrypto = {
  randomToken: () => Promise<string>;
  hash: (token: string) => Promise<string>;
  now?: () => number;
};
type PickupRecord = {
  groupId: string;
  memberId: string;
  version: number;
  expiresAt: number;
  consumed: boolean;
};
export function createDemoPickup(crypto: PickupCrypto) {
  const now = crypto.now ?? Date.now;
  const records = new Map<string, PickupRecord>();
  const issuance = new Map<string, string>();
  const invalid = () =>
    new Error("QR not confirmed. It may be expired, replaced or from another group.");
  function eligible(group: Group) {
    current(group);
    state(group, ["locked"]);
    departureValid(group);
    if (!currentConsent(group)) throw new Error("Everyone must confirm the current fare first.");
  }
  return {
    async issue(group: Group, actorId: string) {
      eligible(group);
      member(group, actorId);
      if (actorId === group.organiserId) throw new Error("The organiser marks their own arrival.");
      if (member(group, actorId).pickupConfirmedAt)
        throw new Error("Your pickup is already confirmed.");
      const token = await crypto.randomToken();
      if (!/^[a-f0-9]{32}$/.test(token))
        throw new Error("Could not create a pickup QR. Try again.");
      const hash = await crypto.hash(token);
      eligible(group);
      const key = `${group.id}:${actorId}`;
      const oldHash = issuance.get(key);
      if (oldHash) records.delete(oldHash);
      const expiresAt = now() + 5 * 60000;
      records.set(hash, {
        groupId: group.id,
        memberId: actorId,
        version: group.version,
        expiresAt,
        consumed: false,
      });
      issuance.set(key, hash);
      return { value: PICKUP_PREFIX + token, expiresAt };
    },
    async verify(group: Group, actorId: string, payload: string): Promise<Group> {
      eligible(group);
      organiser(group, actorId);
      if (!payload.startsWith(PICKUP_PREFIX)) throw invalid();
      const token = payload.slice(PICKUP_PREFIX.length);
      if (!/^[a-f0-9]{32}$/.test(token)) throw invalid();
      const hash = await crypto.hash(token);
      eligible(group);
      organiser(group, actorId);
      const record = records.get(hash);
      if (
        !record ||
        record.groupId !== group.id ||
        record.version !== group.version ||
        record.expiresAt <= now() ||
        record.consumed ||
        record.memberId === actorId ||
        !group.members.some((m) => m.id === record.memberId)
      )
        throw invalid();
      const next = save({
        ...group,
        members: group.members.map((m) =>
          m.id === record.memberId ? { ...m, pickupConfirmedAt: new Date(now()).toISOString() } : m
        ),
      });
      record.consumed = true;
      return next;
    },
    clearGroup(groupId: string) {
      for (const [hash, record] of records) if (record.groupId === groupId) records.delete(hash);
      for (const key of issuance.keys()) if (key.startsWith(groupId + ":")) issuance.delete(key);
    },
  };
}
export function tripTime(value: string) {
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
