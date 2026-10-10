import { Camera, Map, Marker, type CameraRef } from "@maplibre/maplibre-react-native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, useThemeColor } from "heroui-native";
import { AppIcon } from "@/components/trip-ui";
import { validDestination, type Destination } from "@/lib/destinations";
import type { DevicePoint } from "./use-device-location";
import type { HubId } from "@/lib/trip-demo";
import { MAP_STYLE, mapBounds, mapCatalog, destinationCoordinate } from "./map-catalog";

export default function NativeRouteMap({
  hubId,
  onFailure,
  location,
  locateSignal,
  destination,
  onPickDestination,
}: {
  hubId: HubId;
  location: DevicePoint | null;
  locateSignal: number;
  destination?: Destination;
  onPickDestination?: (longitude: number, latitude: number) => void;
  onFailure: () => void;
}) {
  const centered = useRef(false);
  const lastLocate = useRef(locateSignal);
  const camera = useRef<CameraRef>(null);
  const [loaded, setLoaded] = useState(false);
  const accent = useThemeColor("accent");
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");
  useEffect(() => {
    if (loaded) return;
    const timeout = setTimeout(onFailure, 20000);
    return () => clearTimeout(timeout);
  }, [loaded, onFailure]);
  useEffect(() => {
    if (!loaded || !location) return;
    if ((!centered.current && !onPickDestination) || lastLocate.current !== locateSignal) {
      camera.current?.easeTo({
        center: [location.longitude, location.latitude],
        zoom: 16,
        duration: 0,
      });
      centered.current = true;
      lastLocate.current = locateSignal;
    }
  }, [loaded, location, locateSignal, onPickDestination]);
  const bounds = mapBounds(hubId, destination);
  const dropOff = destinationCoordinate(hubId, destination);
  const padding = { top: 65, left: 65, right: 65, bottom: 65 };
  return (
    <View style={{ flex: 1 }}>
      <Map
        mapStyle={MAP_STYLE}
        style={{ flex: 1 }}
        attribution
        logo={false}
        compass={false}
        touchPitch={false}
        touchRotate={false}
        androidView="texture"
        attributionPosition={{ top: 12, left: 12 }}
        onPress={
          onPickDestination
            ? (event) => {
                const [longitude, latitude] = event.nativeEvent.lngLat;
                if (validDestination({ longitude, latitude }))
                  onPickDestination(longitude, latitude);
              }
            : undefined
        }
        onDidFinishLoadingMap={() => setLoaded(true)}
        onDidFailLoadingMap={onFailure}
      >
        <Camera ref={camera} initialViewState={{ bounds, padding }} />
        <Marker id="pickup" lngLat={mapCatalog.pickup.coordinate}>
          <View
            accessibilityLabel="BIIT campus pickup"
            style={[styles.pin, { backgroundColor: background, borderColor: accent }]}
          >
            <AppIcon name="location" tone="accent" size={24} />
            <Text style={{ color: foreground, fontSize: 12, fontWeight: "600" }}>Pickup</Text>
          </View>
        </Marker>
        {dropOff && (
          <Marker id="destination" lngLat={dropOff}>
            <View
              accessibilityLabel="Destination hub"
              style={[styles.pin, { backgroundColor: background, borderColor: foreground }]}
            >
              <AppIcon name="flag" tone="foreground" size={24} />
              <Text style={{ color: foreground, fontSize: 12, fontWeight: "600" }}>Drop-off</Text>
            </View>
          </Marker>
        )}
        {location && (
          <Marker id="your-location" lngLat={[location.longitude, location.latitude]}>
            <View
              accessibilityLabel="Your location"
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: "#38bdf8",
                borderWidth: 3,
                borderColor: "white",
              }}
            />
          </Marker>
        )}
      </Map>
      {!loaded && (
        <View pointerEvents="none" style={[styles.loading, { backgroundColor: background }]}>
          <Text style={{ color: foreground }}>Loading map…</Text>
        </View>
      )}
      <Button
        size="sm"
        variant="secondary"
        isIconOnly
        accessibilityLabel="Show both locations"
        style={styles.recenter}
        onPress={() => camera.current?.fitBounds(bounds, { padding, duration: 0 })}
      >
        <AppIcon name="location" tone="foreground" size={20} />
      </Button>
    </View>
  );
}
const styles = StyleSheet.create({
  pin: { alignItems: "center", gap: 2, borderWidth: 2, borderRadius: 16, padding: 8, minWidth: 64 },
  loading: {
    position: "absolute",
    top: 12,
    right: 12,
    borderRadius: 12,
    padding: 10,
  },
  recenter: { position: "absolute", bottom: 12, right: 12, minWidth: 48, minHeight: 48 },
});
