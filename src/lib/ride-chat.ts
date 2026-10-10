import { supabase } from "./supabase";
export type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  body: string;
  createdAt: string;
};
export async function rideChat(groupId: string, body?: string, nonce?: string) {
  if (!supabase) throw new Error("Please sign in again.");
  const { data, error } = await supabase.rpc("campuspool_chat", {
    trip_id: groupId,
    message_text: body ?? null,
    client_nonce: nonce ?? null,
  });
  if (error) {
    const messages: Record<string, string> = {
      FORBIDDEN: "This chat is only for current ride members.",
      CHAT_CLOSED: "This ride has ended. Chat is now read-only.",
      RATE_LIMITED: "Wait a moment before sending another message.",
      INVALID_MESSAGE: "Enter a message of up to 500 characters.",
    };
    throw new Error(
      error.code === "PGRST202"
        ? "Run the ride_chat SQL in Supabase SQL Editor, then retry."
        : (messages[error.message] ?? "Could not load chat. Check your connection and retry.")
    );
  }
  return data as ChatMessage[];
}
