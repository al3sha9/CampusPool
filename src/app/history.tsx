import { useEffect, useState } from "react";
import { useIsFocused, useRouter } from "expo-router";
import { Button, Card, Chip } from "heroui-native";
import { Text, View } from "react-native";
import { Notice, Screen } from "@/components/trip-ui";
import { supabase } from "@/lib/supabase";

type Ride = {
  id: string;
  destination: string;
  status: "completed" | "cancelled";
  date: string;
  total: number;
  initialTotal: number;
  share: number | null;
  passengers: number;
};
export default function HistoryScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!focused) return;
    let active = true;
    async function load() {
      try {
        if (!supabase) throw new Error("Please sign in again.");
        const { data, error } = await supabase.rpc("campuspool_history");
        if (error)
          throw new Error(
            error.code === "PGRST202"
              ? "Run the ride_history SQL in Supabase SQL Editor, then retry."
              : "Could not load ride history. Check your connection and retry."
          );
        if (active) {
          setRides(data as Ride[]);
          setError("");
        }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : "History unavailable.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [attempt, focused]);
  return (
    <Screen
      title="Ride history"
      subtitle="Your completed and cancelled rides."
      onBack={() => router.back()}
    >
      {loading ? (
        <Text className="text-muted">Loading your rides…</Text>
      ) : error ? (
        <>
          <Notice danger>{error}</Notice>
          <Button
            variant="secondary"
            onPress={() => {
              setLoading(true);
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Retry
          </Button>
        </>
      ) : !rides.length ? (
        <Notice>No past rides yet. Completed rides will appear here.</Notice>
      ) : (
        rides.map((ride) => (
          <Card key={ride.id}>
            <Card.Body style={{ gap: 12 }}>
              <View className="flex-row items-center justify-between gap-3">
                <Card.Title className="flex-1">{ride.destination}</Card.Title>
                <Chip
                  size="sm"
                  variant="soft"
                  color={ride.status === "completed" ? "success" : "default"}
                >
                  {ride.status === "completed" ? "Completed" : "Cancelled"}
                </Chip>
              </View>
              <Card.Description>
                {new Date(ride.date).toLocaleString("en-PK", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Karachi",
                })}
              </Card.Description>
              {ride.status === "completed" && (
                <>
                  <Text className="text-foreground text-lg font-semibold">
                    Your share · {ride.share === null ? "—" : `PKR ${ride.share}`}
                  </Text>
                  <Card.Description>
                    Car total · PKR {ride.total} · {ride.passengers} passengers
                  </Card.Description>
                  <Card.Description>External settlement</Card.Description>
                </>
              )}
            </Card.Body>
          </Card>
        ))
      )}
    </Screen>
  );
}
