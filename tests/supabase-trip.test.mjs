import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
const db = new PGlite({ extensions: { pgcrypto } });
const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];
let op = 0;
function operation() {
  return `00000000-0000-4000-8000-${String(++op).padStart(12, "0")}`;
}
async function rpc(actor, action, payload = {}) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  const result = await db.query("select public.campuspool_rpc($1,$2::jsonb) result", [
    action,
    JSON.stringify(payload),
  ]);
  return result.rows[0].result;
}
const request = (budget = 450) => ({
  hubId: "metro",
  earliestAt: new Date(Date.now() + 600000).toISOString(),
  latestAt: new Date(Date.now() + 1500000).toISOString(),
  maxShare: budget,
});
async function search(actor, budget = 450) {
  return rpc(actor, "search", { request: request(budget), operationId: operation() });
}
async function mutation(actor, action, g, extra = {}) {
  return rpc(actor, action, {
    groupId: g.id,
    version: g.version,
    operationId: operation(),
    ...extra,
  });
}
async function prepare() {
  await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  await db.exec(
    readFileSync(
      new URL("../supabase/migrations/20261010084407_shared_trip_flow.sql", import.meta.url),
      "utf8"
    )
  );
  await db.exec(
    readFileSync(
      new URL("../supabase/migrations/20261010094653_searchable_destinations.sql", import.meta.url),
      "utf8"
    )
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/20261010103000_optional_search_estimate.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,primary key(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;`);
  await db.exec(
    readFileSync(
      new URL("../supabase/migrations/20261010110000_edit_profile.sql", import.meta.url),
      "utf8"
    )
  );
  await db.exec(
    readFileSync(
      new URL("../supabase/migrations/20261010120000_ride_chat.sql", import.meta.url),
      "utf8"
    )
  );
  await db.exec(
    readFileSync(
      new URL("../supabase/migrations/20261010123000_ride_history.sql", import.meta.url),
      "utf8"
    )
  );
  for (let i = 0; i < ids.length; i++)
    await db.query("insert into auth.users values($1,now(),$2::jsonb)", [
      ids[i],
      JSON.stringify({ display_name: ["Ayesha", "Sana", "Bilal", "Hamza"][i] }),
    ]);
}
await prepare();

test("shared lifecycle, identity, consent, idempotency and one-time pickup", async () => {
  let a = await search(ids[0]);
  let g = await rpc(ids[0], "join", { requestId: a.requestId, operationId: operation() });
  assert.equal(g.members.length, 1);
  let b = await search(ids[1]);
  assert.equal(b.suggestions[0].id, g.id);
  g = await rpc(ids[1], "join", {
    groupId: g.id,
    requestId: b.requestId,
    operationId: operation(),
  });
  await assert.rejects(mutation(ids[1], "lock", g), /FORBIDDEN/);
  g = await mutation(ids[0], "confirm", g);
  await assert.rejects(mutation(ids[0], "lock", g), /CONSENT_REQUIRED/);
  g = await mutation(ids[1], "confirm", g);
  g = await mutation(ids[0], "lock", g);
  assert.equal(g.status, "locked");
  await assert.rejects(rpc(ids[3], "read", { groupId: g.id }), /FORBIDDEN/);
  g = await mutation(ids[0], "quote", g, { total: 1000 });
  assert(g.members.every((m) => m.confirmedVersion === null));
  await assert.rejects(mutation(ids[1], "confirm", g), /BUDGET_EXCEEDED/);
  g = await mutation(ids[0], "quote", g, { total: 899 });
  assert.deepEqual(g.shares, [450, 449]);
  g = await mutation(ids[0], "confirm", g);
  g = await mutation(ids[1], "confirm", g);
  const issueOp = operation();
  const p = { groupId: g.id, version: g.version, operationId: issueOp };
  const first = await rpc(ids[1], "issue_qr", p);
  assert.match(first.value, /^campuspool:pickup:v1:[a-f0-9]{32}$/);
  const repeated = await rpc(ids[1], "issue_qr", p);
  assert.equal(repeated.error, "QR_ALREADY_ISSUED");
  const next = await mutation(ids[1], "issue_qr", g);
  assert.equal(
    (await mutation(ids[0], "verify_qr", g, { token: first.value.split(":").at(-1) })).error,
    "INVALID_QR"
  );
  const verifyPayload = {
    groupId: g.id,
    version: g.version,
    operationId: operation(),
    token: next.value.split(":").at(-1),
  };
  g = await rpc(ids[0], "verify_qr", verifyPayload);
  assert(g.members[1].pickupConfirmedAt);
  const replay = await rpc(ids[0], "verify_qr", verifyPayload);
  assert.equal(replay.id, g.id);
  assert.equal(
    (await mutation(ids[0], "verify_qr", g, { token: verifyPayload.token })).error,
    "INVALID_QR"
  );
  await assert.rejects(mutation(ids[0], "start", g), /PICKUP_REQUIRED/);
  g = await mutation(ids[0], "own_arrival", g);
  g = await mutation(ids[0], "start", g);
  await assert.rejects(mutation(ids[1], "complete", g), /FORBIDDEN/);
  g = await mutation(ids[0], "complete", g, { total: 901 });
  assert.equal(g.status, "completed");
  assert.equal(g.total, 901);
  assert.deepEqual(g.shares, [451, 450]);
  await assert.rejects(mutation(ids[0], "cancel", g, { reason: "No" }), /INVALID_TRANSITION/);
  const resumed = await rpc(ids[1], "bootstrap");
  assert.equal(resumed.group.status, "completed");
  await mutation(ids[1], "dismiss", g);
  assert.equal((await rpc(ids[1], "bootstrap")).group, null);
  const stored = await db.query(
    "select response::text as response from campuspool_private.operations where action='issue_qr'"
  );
  assert(
    stored.rows.every(
      (row) =>
        !row.response.includes("campuspool:pickup") &&
        !row.response.includes(first.value.split(":").at(-1))
    )
  );
});

test("expiry, stale versions, locked leaving, rate limits and authenticated wrapper", async () => {
  const a = await search(ids[2]);
  let g = await rpc(ids[2], "join", { requestId: a.requestId, operationId: operation() });
  const b = await search(ids[3]);
  g = await rpc(ids[3], "join", {
    requestId: b.requestId,
    groupId: g.id,
    operationId: operation(),
  });
  g = await mutation(ids[2], "confirm", g);
  g = await mutation(ids[3], "confirm", g);
  g = await mutation(ids[2], "lock", g);
  let qr = await mutation(ids[3], "issue_qr", g);
  await db.query(
    "update campuspool_private.pickup_secrets set expires_at=now()-interval '1 second' where group_id=$1",
    [g.id]
  );
  assert.equal(
    (await mutation(ids[2], "verify_qr", g, { token: qr.value.split(":").at(-1) })).error,
    "INVALID_QR"
  );
  qr = await mutation(ids[3], "issue_qr", g);
  const old = g;
  g = await mutation(ids[2], "quote", g, { total: 898 });
  await assert.rejects(
    mutation(ids[2], "verify_qr", old, { token: qr.value.split(":").at(-1) }),
    /VERSION_CONFLICT/
  );
  g = await mutation(ids[2], "confirm", g);
  g = await mutation(ids[3], "confirm", g);
  assert.equal(
    (await mutation(ids[2], "verify_qr", g, { token: qr.value.split(":").at(-1) })).error,
    "INVALID_QR"
  );
  for (let i = 0; i < 8; i++) await mutation(ids[2], "verify_qr", g, { token: "not-a-token" });
  assert.equal(
    (await mutation(ids[2], "verify_qr", g, { token: "a".repeat(32) })).error,
    "RATE_LIMITED"
  );
  const newcomer = await search(ids[1]);
  await assert.rejects(
    rpc(ids[1], "join", { requestId: newcomer.requestId, groupId: g.id, operationId: operation() }),
    /INVALID_TRANSITION/
  );
  g = await mutation(ids[3], "leave", g);
  assert.equal(g.status, "cancelled");
  assert(g.members.every((m) => m.confirmedVersion === null && m.pickupConfirmedAt === null));
  await assert.rejects(rpc(ids[3], "read", { groupId: g.id }), /FORBIDDEN/);
  await db.exec(
    "grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; set role authenticated"
  );
  assert.equal((await rpc(ids[2], "bootstrap")).group.status, "cancelled");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(
    db.exec("select public.campuspool_rpc('bootstrap','{}')"),
    /UNAUTHENTICATED/
  );
  await db.exec("reset role");
});

test("no direct reads or writes, unauthenticated RPC access denied", async () => {
  await db.exec("set role authenticated");
  await assert.rejects(
    db.exec("select * from campuspool_private.pickup_secrets"),
    /permission denied/
  );
  await assert.rejects(
    db.exec("update campuspool_private.groups set total=1"),
    /permission denied/
  );
  await db.exec("reset role; set role anon");
  await assert.rejects(
    db.exec("select public.campuspool_rpc('bootstrap','{}')"),
    /permission denied/
  );
  await db.exec("reset role");
});

test("destination identity, windows, exact budgets and car-only estimate", async () => {
  const destination = {
    id: "osm:W:123456",
    name: "Mall",
    address: "Islamabad",
    longitude: 73.05,
    latitude: 33.7,
    source: "osm",
  };
  const find = (actor, dest = destination, budget = 600, extra = {}) =>
    rpc(actor, "search", {
      request: {
        ...request(budget),
        hubId: dest.id,
        destination: dest,
        carEstimate: 1001,
        ...extra,
      },
      operationId: operation(),
    });
  const a = await find(ids[0]);
  let g = await rpc(ids[0], "join", { requestId: a.requestId, operationId: operation() });
  assert.equal(g.total, 1001);
  assert.equal(g.request.destination.name, "Mall");
  assert.equal(g.request.carEstimate, 1001);
  assert.equal((await find(ids[1], { ...destination, id: "osm:W:123457" })).suggestions.length, 0);
  assert.equal((await find(ids[1], destination, 499)).suggestions.length, 0);
  assert.equal(
    (
      await find(ids[1], destination, 600, {
        earliestAt: new Date(Date.now() + 3600000).toISOString(),
        latestAt: new Date(Date.now() + 4200000).toISOString(),
      })
    ).suggestions.length,
    0
  );
  await assert.rejects(find(ids[1], { ...destination, longitude: 73.2 }), /DESTINATION_CONFLICT/);
  await assert.rejects(
    find(ids[1], { ...destination, id: "osm:N:765432", latitude: 20 }),
    /INVALID_DESTINATION/
  );
  const b = await find(ids[1], { ...destination, name: "Same place, another label" }, 500);
  assert.equal(b.suggestions[0].id, g.id);
  g = await rpc(ids[1], "join", {
    requestId: b.requestId,
    groupId: g.id,
    operationId: operation(),
  });
  assert.deepEqual(g.shares, [501, 500]);
  assert.equal(g.total, 1001);
  await mutation(ids[0], "cancel", g, { reason: "Test finished" });
});

test("map pins canonicalise coordinates rather than client-supplied IDs", async () => {
  const destination = {
    id: "arbitrary-client-id",
    name: "Office entrance",
    address: "Street corner",
    longitude: 73.123412,
    latitude: 33.712312,
    source: "pin",
  };
  const result = await rpc(ids[3], "search", {
    request: { ...request(700), hubId: destination.id, destination, carEstimate: 1200 },
    operationId: operation(),
  });
  const g = await rpc(ids[3], "join", { requestId: result.requestId, operationId: operation() });
  assert.equal(g.request.hubId, "pin:33.7123:73.1234");
  assert.equal(g.request.destination.longitude, 73.1234);
  assert.equal(g.request.destination.latitude, 33.7123);
  assert.equal(g.total, 1200);
});

test("search and joining need no estimate; creating requires an explicit fare", async () => {
  const actors = ["55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666"];
  for (const actor of actors)
    await db.query("insert into auth.users values($1,now(),$2::jsonb)", [
      actor,
      JSON.stringify({ display_name: "Student" }),
    ]);
  const destination = {
    id: "osm:N:8888888",
    name: "Office",
    address: "Islamabad",
    longitude: 73.1,
    latitude: 33.75,
    source: "osm",
  };
  const find = (actor) =>
    rpc(actor, "search", {
      request: { ...request(600), hubId: destination.id, destination },
      operationId: operation(),
    });
  const a = await find(actors[0]);
  await assert.rejects(
    rpc(actors[0], "join", { requestId: a.requestId, operationId: operation() }),
    /INVALID_FARE/
  );
  const g = await rpc(actors[0], "join", {
    requestId: a.requestId,
    carEstimate: 1001,
    operationId: operation(),
  });
  const b = await find(actors[1]);
  assert.equal(b.suggestions[0].id, g.id);
  const joined = await rpc(actors[1], "join", {
    requestId: b.requestId,
    groupId: g.id,
    operationId: operation(),
  });
  assert.deepEqual(joined.shares, [501, 500]);
  assert.equal(joined.total, 1001);
});

test("profile names persist; avatar ownership and upload policies prevent cross-account changes", async () => {
  const photo = `${ids[0]}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[0]]);
  await db.exec("set role authenticated");
  await db.query("insert into storage.objects(bucket_id,name) values('avatars',$1)", [photo]);
  await assert.rejects(
    db.query("insert into storage.objects(bucket_id,name) values('avatars',$1)", [
      `${ids[1]}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`,
    ]),
    /row-level security/
  );
  const saved = await db.query("select public.campuspool_save_profile($1,$2) result", [
    "Roshaan Ali",
    photo,
  ]);
  assert.equal(saved.rows[0].result.name, "Roshaan Ali");
  assert.equal((await rpc(ids[0], "bootstrap")).profile.avatarPath, photo);
  await assert.rejects(
    db.query("select public.campuspool_save_profile($1,$2)", ["", photo]),
    /INVALID_NAME/
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[1]]);
  await assert.rejects(
    db.query("select public.campuspool_save_profile($1,$2)", ["Sana", photo]),
    /INVALID_PHOTO/
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[0]]);
  await db.query("select public.campuspool_save_profile($1,null)", ["Roshaan Updated"]);
  const result = await rpc(ids[0], "bootstrap");
  assert.equal(result.profile.name, "Roshaan Updated");
  assert.equal(result.profile.avatarPath, null);
  await db.exec("reset role;set role anon");
  await assert.rejects(
    db.query("select public.campuspool_save_profile($1,null)", ["Intruder"]),
    /permission denied/
  );
  await db.exec("reset role");
});

test("ride chat restricts membership, deduplicates retries, limits spam and closes after the ride", async () => {
  const a = "55555555-5555-4555-8555-555555555555",
    b = "66666666-6666-4666-8666-666666666666";
  const g = (await rpc(a, "bootstrap")).group;
  const chat = async (actor, body = null, nonce = null) => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
    return (await db.query("select public.campuspool_chat($1,$2,$3) result", [g.id, body, nonce]))
      .rows[0].result;
  };
  const nonce = operation();
  let result = await chat(a, "At the library gate", nonce);
  assert.equal(result[0].body, "At the library gate");
  assert.equal(result[0].userId, a);
  assert.equal((await chat(a, "At the library gate", nonce)).length, 1);
  await assert.rejects(chat(a, "Different message", nonce), /NONCE_REUSED/);
  assert.equal((await chat(b)).length, 1);
  await assert.rejects(chat(ids[0]), /FORBIDDEN/);
  await assert.rejects(chat(a, "   ", operation()), /INVALID_MESSAGE/);
  for (let i = 0; i < 4; i++) await chat(a, `Message ${i}`, operation());
  await assert.rejects(chat(a, "Too many", operation()), /RATE_LIMITED/);
  await db.query("update campuspool_private.groups set status=$1 where id=$2", ["completed", g.id]);
  await assert.rejects(chat(b, "Late message", operation()), /CHAT_CLOSED/);
  assert.equal((await chat(b)).length, 5);
  await db.query(
    "update campuspool_private.members set active=false,current_trip=false where group_id=$1 and user_id=$2",
    [g.id, b]
  );
  await assert.rejects(chat(b), /FORBIDDEN/);
  await db.exec("set role authenticated");
  await assert.rejects(db.exec("select * from campuspool_private.messages"), /permission denied/);
  await db.exec("reset role; set role anon");
  await assert.rejects(db.query("select public.campuspool_chat($1)", [g.id]), /permission denied/);
  await db.exec("reset role");
});

test("ride history survives dismissal, returns exact shares and only the callers rides", async () => {
  const history = async (actor) => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
    return (await db.query("select public.campuspool_history() result")).rows[0].result;
  };
  const a = await history(ids[0]);
  const completed = a.find((ride) => ride.status === "completed" && ride.total === 901);
  assert(completed);
  assert.equal(completed.share, 451);
  const b = await history(ids[1]);
  assert.equal(b.find((ride) => ride.id === completed.id).share, 450);
  assert(a.some((ride) => ride.status === "cancelled" && ride.share === null));
  assert(!(await history(ids[3])).some((ride) => ride.id === completed.id));
  await db.exec("set role authenticated");
  assert((await history(ids[0])).some((ride) => ride.id === completed.id));
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(db.exec("select public.campuspool_history()"), /UNAUTHENTICATED/);
  await db.exec("reset role;set role anon");
  await assert.rejects(db.exec("select public.campuspool_history()"), /permission denied/);
  await db.exec("reset role");
});
