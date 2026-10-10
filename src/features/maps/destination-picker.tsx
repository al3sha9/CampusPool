import { useEffect, useRef, useState } from "react";
import { Keyboard, Text, View } from "react-native";
import { Button, Card, Input, Label, TextField } from "heroui-native";
import { AppIcon, Notice } from "@/components/trip-ui";
import {
  metroDestination,
  pinnedDestination,
  searchPlaces,
  type Destination,
} from "@/lib/destinations";
import { RouteMap } from "./route-map";

export function DestinationPicker({
  value,
  onChange,
}: {
  value: Destination | null;
  onChange: (destination: Destination) => void;
}) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Destination[]>([]);
  const [pending, setPending] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [pickMap, setPickMap] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const currentQuery = useRef("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  async function search() {
    if (busy.current) return;
    busy.current = true;
    Keyboard.dismiss();
    setPending(true);
    setError("");
    setPlaces([]);
    setSearched(false);
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 30000);
    try {
      const results = await searchPlaces(query, abort.signal);
      if (alive.current && currentQuery.current === query) {
        setPlaces(results);
        setSearched(true);
      }
    } catch (failure) {
      if (alive.current && currentQuery.current === query)
        setError(
          !abort.signal.aborted && failure instanceof Error && failure.name !== "AbortError"
            ? failure.message
            : "Search timed out. Retry or choose on the map."
        );
    } finally {
      clearTimeout(timeout);
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  return (
    <View style={{ gap: 16 }}>
      <TextField>
        <Label>Shared destination</Label>
        <Input
          accessibilityLabel="Search destination"
          placeholder="Neighbourhood, mall, office, station"
          value={query}
          onChangeText={(text) => {
            currentQuery.current = text;
            setQuery(text);
            setSearched(false);
            setPlaces([]);
            setError("");
          }}
          returnKeyType="search"
          onSubmitEditing={() => void search()}
          maxLength={120}
        />
      </TextField>
      <View className="flex-row gap-3">
        <Button
          variant="secondary"
          isDisabled={pending || query.trim().length < 3}
          onPress={() => void search()}
        >
          <AppIcon name="flag" />
          <Button.Label>{pending ? "Searching…" : "Search places"}</Button.Label>
        </Button>
        <Button
          variant="ghost"
          onPress={() => {
            Keyboard.dismiss();
            setPickMap(!pickMap);
          }}
        >
          {pickMap ? "Hide map" : "Choose on map"}
        </Button>
      </View>
      {error && <Notice danger>{error}</Notice>}
      {searched && !places.length && (
        <Notice>No results nearby. Try a fuller name or choose on the map.</Notice>
      )}
      {places.map((place) => (
        <Button
          key={place.id}
          variant="tertiary"
          className="w-full"
          style={{ height: "auto", justifyContent: "flex-start", paddingVertical: 14 }}
          onPress={() => {
            onChange(place);
            setPlaces([]);
            setSearched(false);
            setPickMap(false);
          }}
        >
          <AppIcon name="flag" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text className="text-foreground font-medium">{place.name}</Text>
            <Text className="text-muted text-xs">{place.address}</Text>
          </View>
        </Button>
      ))}
      {!pickMap && (
        <Button variant="ghost" className="self-start" onPress={() => onChange(metroDestination)}>
          6th Road Metrobus Station
        </Button>
      )}
      {pickMap && (
        <>
          <Notice>Tap the map to choose one shared car drop-off.</Notice>
          <RouteMap
            hubId={value?.id ?? "metro"}
            destination={value ?? undefined}
            onPickDestination={(longitude, latitude) => {
              try {
                onChange(pinnedDestination(longitude, latitude));
                setError("");
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : "Choose a nearby point.");
              }
            }}
          />
        </>
      )}
      {value && (
        <Card variant="secondary">
          <Card.Body style={{ gap: 8 }}>
            <Card.Title>{value.name}</Card.Title>
            <Card.Description>{value.address}</Card.Description>
            <Card.Description>One drop-off shared by everyone in this group.</Card.Description>
            {value.source === "pin" && (
              <TextField isInvalid={!value.name.trim()}>
                <Label>Drop-off label</Label>
                <Input
                  value={value.name}
                  maxLength={160}
                  onChangeText={(name) => onChange({ ...value, name })}
                  placeholder="Mall entrance, street corner…"
                />
              </TextField>
            )}
          </Card.Body>
        </Card>
      )}
      <Text className="text-xs text-muted">Place search: Photon · © OpenStreetMap</Text>
    </View>
  );
}
