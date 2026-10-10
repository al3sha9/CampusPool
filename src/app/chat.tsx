import { useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import { useIsFocused, useRouter } from "expo-router";
import { Button, Card, Input, TextField } from "heroui-native";
import { randomUUID } from "expo-crypto";
import { Notice, Screen } from "@/components/trip-ui";
import { useTrip } from "@/features/campus/trip-context";
import { rideChat, type ChatMessage } from "@/lib/ride-chat";

export default function ChatScreen() {
  const { group, auth } = useTrip();
  const router = useRouter();
  const focused = useIsFocused();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const pending = useRef<{ body: string; nonce: string } | null>(null);
  const sendBusy = useRef(false);
  const readBusy = useRef(false);
  const revision = useRef(0);
  const alive = useRef(true);
  const groupId = group?.id;
  const closed = group?.status === "completed" || group?.status === "cancelled";
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!groupId || !focused) return;
    let active = true;
    const refresh = async () => {
      if (!active || AppState.currentState !== "active" || readBusy.current || sendBusy.current)
        return;
      readBusy.current = true;
      const current = revision.current;
      try {
        const result = await rideChat(groupId);
        if (active && current === revision.current) {
          setMessages(result);
          setError("");
        }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : "Chat unavailable.");
      } finally {
        readBusy.current = false;
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      active = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [groupId, focused]);
  async function send(body = text.trim()) {
    if (!groupId || !body || sendBusy.current || closed) return;
    sendBusy.current = true;
    revision.current++;
    setSending(true);
    setError("");
    if (pending.current?.body !== body) pending.current = { body, nonce: randomUUID() };
    try {
      const result = await rideChat(groupId, body, pending.current.nonce);
      pending.current = null;
      if (alive.current) {
        setMessages(result);
        setText("");
      }
    } catch (failure) {
      if (alive.current)
        setError(failure instanceof Error ? failure.message : "Message failed. Retry.");
    } finally {
      sendBusy.current = false;
      if (alive.current) setSending(false);
    }
  }
  return (
    <Screen
      title="Ride chat"
      subtitle="Coordinate pickup with your group."
      onBack={() => router.back()}
      action={
        group && !closed ? (
          <View style={{ gap: 12 }}>
            <TextField isDisabled={sending}>
              <Input
                accessibilityLabel="Message your ride group"
                value={text}
                onChangeText={setText}
                placeholder="Where are you waiting?"
                multiline
                maxLength={500}
                style={{ maxHeight: 100 }}
              />
            </TextField>
            <Button isDisabled={sending || !text.trim()} onPress={() => void send()}>
              {sending ? "Sending…" : "Send message"}
            </Button>
          </View>
        ) : undefined
      }
    >
      {!group ? (
        <Notice>Your ride chat appears after joining a group.</Notice>
      ) : (
        <>
          {error && <Notice danger>{error}</Notice>}
          {loading && !messages.length ? (
            <Text className="text-muted">Loading messages…</Text>
          ) : (
            !messages.length && (
              <Notice>No messages yet. Say hello or share your pickup spot.</Notice>
            )
          )}
          <View style={{ gap: 12 }}>
            {messages.map((message) => (
              <Card
                key={message.id}
                variant={message.userId === auth.session?.user.id ? "secondary" : "default"}
              >
                <Card.Body style={{ gap: 6 }}>
                  <Card.Description>
                    {message.userId === auth.session?.user.id ? "You" : message.name} ·{" "}
                    {new Date(message.createdAt).toLocaleTimeString("en-PK", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Karachi",
                    })}
                  </Card.Description>
                  <Text selectable className="text-foreground text-base">
                    {message.body}
                  </Text>
                </Card.Body>
              </Card>
            ))}
          </View>
          {closed ? (
            <Notice>This ride has ended. You can still read its messages.</Notice>
          ) : (
            <Button
              variant="secondary"
              isDisabled={sending}
              onPress={() => void send("I'm at the campus gate.")}
            >
              I’m at the campus gate
            </Button>
          )}
        </>
      )}
    </Screen>
  );
}
