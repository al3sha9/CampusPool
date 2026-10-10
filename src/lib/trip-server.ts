import { randomUUID } from "expo-crypto";
import { supabase } from "./supabase";
import type { Group, RideRequest, Suggestion } from "./trip-demo";
const messages: Record<string, string> = {
  UNAUTHENTICATED: "Please sign in again.",
  FORBIDDEN: "Only the authorised group member can do this.",
  VERSION_CONFLICT: "The group changed. Refresh and confirm the new share.",
  CONSENT_REQUIRED: "Everyone must confirm the current share first.",
  BUDGET_EXCEEDED: "This share exceeds your budget.",
  PICKUP_REQUIRED: "Everyone must confirm their fare and arrive before departure.",
  INVALID_TRANSITION: "This action is no longer available. Refresh your trip.",
  WINDOW_EXPIRED: "The departure window has expired.",
  ACTIVE_REQUEST_EXISTS: "You already have an active request or trip.",
  INVALID_QR: "This QR is invalid, expired or already used. Ask for a new QR.",
  RATE_LIMITED: "Too many attempts. Wait a minute and retry.",
  QR_ALREADY_ISSUED: "Generate a new QR code.",
  GROUP_FULL: "This group is full. Search again.",
  INVALID_DESTINATION: "Select a destination in Islamabad–Rawalpindi.",
  DESTINATION_CONFLICT:
    "This place has a different saved point. Choose it again or select a map pin.",
  INCOMPATIBLE_GROUP: "This group uses a different destination or departure window.",
  INVALID_FARE: "Enter a whole PKR amount between 1 and 1,000,000.",
};
export async function tripRpc<T>(
  action: string,
  payload: Record<string, unknown> = {},
  mutation = true
): Promise<T> {
  if (!supabase)
    throw new Error(
      "Supabase is not configured. Restart Expo after adding your environment variables."
    );
  const { data, error } = await supabase.rpc("campuspool_rpc", {
    action,
    payload: mutation ? { ...payload, operationId: randomUUID() } : payload,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883")
      throw new Error(
        "Database setup is needed. Run the shared_trip_flow and searchable_destinations SQL files in Supabase SQL Editor, then refresh."
      );
    throw new Error(
      messages[error.message] ?? "Could not update your trip. Check your connection and refresh."
    );
  }
  if (data?.error)
    throw new Error(messages[data.error] ?? "Could not update your trip. Refresh and retry.");
  return data as T;
}
const change = (action: string, group: Group, extra: Record<string, unknown> = {}) =>
  tripRpc<Group>(action, { groupId: group.id, version: group.version, ...extra });
export const serverTrips = {
  bootstrap: () =>
    tripRpc<{
      profile: { id: string; name: string; affiliation: string; avatarPath?: string | null };
      group: Group | null;
    }>("bootstrap", {}, false),
  search: (request: RideRequest) =>
    tripRpc<{ requestId: string; suggestions: Suggestion[] }>("search", { request }),
  join: (requestId: string, groupId?: string, carEstimate?: number) =>
    tripRpc<Group>("join", {
      requestId,
      ...(groupId ? { groupId } : {}),
      ...(carEstimate === undefined ? {} : { carEstimate }),
    }),
  confirm: (group: Group, _actor: string) => change("confirm", group),
  lock: (group: Group, _actor: string) => change("lock", group),
  setQuote: (group: Group, total: number, _actor: string) => change("quote", group, { total }),
  markOwnArrival: (group: Group, _actor: string) => change("own_arrival", group),
  start: (group: Group, _actor: string) => change("start", group),
  complete: (group: Group, _actor: string, total?: number) =>
    change("complete", group, total === undefined ? {} : { total }),
  cancel: (group: Group, _actor: string, reason: string) => change("cancel", group, { reason }),
  leave: (group: Group, _actor: string) => change("leave", group),
  dismiss: (group: Group) => change("dismiss", group),
};
export const serverPickup = {
  async issue(group: Group, actor: string) {
    const result = await tripRpc<{ value: string; expiresAt: number }>("issue_qr", {
      groupId: group.id,
      version: group.version,
    });
    return {
      ...result,
      expiresAt: Number(result.expiresAt),
      memberId: actor,
      version: group.version,
    };
  },
  async verify(group: Group, _actor: string, value: string) {
    if (!/^campuspool:pickup:v1:[a-f0-9]{32}$/.test(value)) throw new Error(messages.INVALID_QR);
    return change("verify_qr", group, { token: value.slice("campuspool:pickup:v1:".length) });
  },
};
