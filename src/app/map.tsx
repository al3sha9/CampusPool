import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, useThemeColor } from "heroui-native";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ReduceMotion } from "react-native-reanimated";
import { AppIcon, Detail } from "@/components/trip-ui";
import { RouteMap } from "@/features/maps/route-map";
import { useTrip } from "@/features/campus/trip-context";
import { validDestination, type Destination } from "@/lib/destinations";
import { requestDestination, hubFor, type HubId } from "@/lib/trip-demo";
import { withUniwind } from "uniwind";
const SafeArea = withUniwind(SafeAreaView);
export default function MapScreen() {
  const router = useRouter();
  const sheet = useRef<BottomSheet>(null);
  const [expanded, setExpanded] = useState(false);
  const { hub, destination: encoded } = useLocalSearchParams<{
    hub?: string;
    destination?: string;
  }>();
  const trip = useTrip();
  const hubId: HubId = hub ?? "metro";
  let destination: Destination | undefined;
  try {
    const parsed = encoded ? JSON.parse(encoded) : undefined;
    if (
      parsed &&
      validDestination(parsed) &&
      typeof parsed.name === "string" &&
      typeof parsed.id === "string"
    )
      destination = parsed;
  } catch {
    /* Invalid navigation parameters use the current trip. */
  }
  destination ??=
    trip.group?.request.hubId === hubId
      ? requestDestination(trip.group.request)
      : trip.destination?.id === hubId
        ? (trip.destination ?? undefined)
        : undefined;
  const surface = useThemeColor("surface");
  const muted = useThemeColor("muted");
  return (
    <SafeArea className="bg-background flex-1">
      <View className="flex-row items-center justify-between px-6 py-3">
        <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
          Meeting point
        </Text>
        <Button
          isIconOnly
          variant="ghost"
          accessibilityLabel="Close map"
          onPress={() => router.back()}
          style={{ minHeight: 48, minWidth: 48 }}
        >
          <AppIcon name="back" />
        </Button>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 260 }}>
        <RouteMap hubId={hubId} destination={destination} expanded />
      </View>
      <BottomSheet
        ref={sheet}
        onChange={(index) => setExpanded(index > 0)}
        index={0}
        snapPoints={[240, 360]}
        enableDynamicSizing={false}
        animateOnMount={false}
        overrideReduceMotion={ReduceMotion.System}
        backgroundStyle={{ backgroundColor: surface }}
        handleIndicatorStyle={{ backgroundColor: muted }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 20 }}
        >
          <View className="flex-row items-center justify-between gap-3">
            <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
              Your route
            </Text>
            <Button
              size="sm"
              variant="ghost"
              accessibilityLabel={expanded ? "Collapse route details" : "Expand route details"}
              onPress={() => sheet.current?.snapToIndex(expanded ? 0 : 1)}
            >
              {expanded ? "Less" : "More"}
            </Button>
          </View>
          <Detail icon="location" label="Pickup" value="BIIT campus" />
          <Detail icon="flag" label="Destination" value={destination?.name ?? hubFor(hubId).name} />
          <Text className="text-sm text-muted leading-6">
            Confirm the campus gate with your group. Your location is shown only on your device
            while this map is open. Road routing is not connected.
          </Text>
        </BottomSheetScrollView>
      </BottomSheet>
    </SafeArea>
  );
}
