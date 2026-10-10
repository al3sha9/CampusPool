import Constants, { ExecutionEnvironment } from "expo-constants";
import { useIsFocused, useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useCallback, useState, type ComponentType } from "react";
import { AppState, Linking, Platform, Text, TurboModuleRegistry, View } from "react-native";
import { useEffect } from "react";
import { AppIcon, Detail } from "@/components/trip-ui";
import { useDeviceLocation, type DevicePoint } from "./use-device-location";
import ExpoGoRouteMap from "./expo-go-route-map";
import type { Destination } from "@/lib/destinations";
import { hubFor, type HubId } from "@/lib/trip-demo";

// MapLibre's barrel eagerly requires native modules. Never load it in Expo Go.
const NativeMap: ComponentType<{
  hubId: HubId;
  onFailure: () => void;
  location: DevicePoint | null;
  locateSignal: number;
  destination?: Destination;
  onPickDestination?: (longitude: number, latitude: number) => void;
}> | null =
  Platform.OS !== "web" &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
  TurboModuleRegistry.get("MLRNMapViewModule")
    ? // A conditional require prevents native module crashes in Expo Go.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("./native-route-map").default
    : null;

export function RouteMap({
  hubId,
  expanded = false,
  destination,
  onPickDestination,
}: {
  hubId: HubId;
  expanded?: boolean;
  destination?: Destination;
  onPickDestination?: (longitude: number, latitude: number) => void;
}) {
  const router = useRouter();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fail = useCallback(() => setFailed(true), []);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active")
    );
    return () => listener.remove();
  }, []);
  const active = focused && foreground;
  const location = useDeviceLocation(active && !failed);
  const [locateSignal, setLocateSignal] = useState(0);
  const MapRenderer = NativeMap ?? ExpoGoRouteMap;
  return (
    <View style={expanded ? { flex: 1, gap: 12 } : { gap: 12 }}>
      <View
        className="bg-default rounded-3xl overflow-hidden"
        style={expanded ? { flex: 1 } : { height: 240 }}
      >
        {!failed && active ? (
          <MapRenderer
            key={`${hubId}:${attempt}`}
            hubId={hubId}
            onFailure={fail}
            location={location.point}
            locateSignal={locateSignal}
            destination={destination}
            onPickDestination={onPickDestination}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: "center", gap: 16, padding: 24 }}>
            <Detail icon="location" label="Campus pickup" value="BIIT campus" />
            <Detail
              icon="flag"
              label="Destination"
              value={destination?.name ?? hubFor(hubId).name}
            />
            <Text className="text-sm text-muted">
              {failed ? "Map unavailable. Check your connection and retry." : "Map paused."}
            </Text>
            {failed && (
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }}
              >
                Retry map
              </Button>
            )}
          </View>
        )}
      </View>
      <View style={{ gap: 8 }}>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs text-muted flex-1" accessibilityLiveRegion="polite">
            {location.status === "ready" && location.point
              ? `Your position${location.point.accuracy == null ? "" : ` · approx. ±${Math.round(location.point.accuracy)} m`}`
              : location.status === "locating"
                ? "Finding your position…"
                : location.status === "denied"
                  ? "Location permission is off. The campus map still works."
                  : location.status === "disabled"
                    ? "Turn on your phone’s location services."
                    : location.status === "error"
                      ? "Position unavailable. Try again outdoors."
                      : "Show your position on this device."}
          </Text>
          <Button
            size="sm"
            variant="secondary"
            isDisabled={!active || failed || location.status === "locating"}
            onPress={() => {
              if (
                (location.status === "denied" && !location.canAskAgain) ||
                location.status === "disabled"
              ) {
                void Linking.openSettings().catch(() => {});
              } else {
                setLocateSignal((n) => n + 1);
                void location.request();
              }
            }}
          >
            {location.status === "locating"
              ? "Locating…"
              : (location.status === "denied" && !location.canAskAgain) ||
                  location.status === "disabled"
                ? "Settings"
                : "My location"}
          </Button>
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs text-muted flex-1">
            BIIT campus · agree on the gate with your group
          </Text>
          {!expanded && !onPickDestination && (
            <Button
              size="sm"
              variant="ghost"
              accessibilityLabel="Open larger route map"
              onPress={() =>
                router.push({
                  pathname: "/map",
                  params: {
                    hub: hubId,
                    ...(destination ? { destination: JSON.stringify(destination) } : {}),
                  },
                })
              }
            >
              <AppIcon name="location" size={18} tone="accent" />
              <Button.Label>View map</Button.Label>
            </Button>
          )}
        </View>
      </View>
    </View>
  );
}
