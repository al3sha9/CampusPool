import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useThemeColor } from "heroui-native";
import { useTrip } from "@/features/campus/trip-context";

export default function TabsLayout() {
  const { stage } = useTrip();
  const accent = useThemeColor("accent");
  const muted = useThemeColor("muted");
  const background = useThemeColor("background");
  if (stage === "signin") return <Redirect href="/" />;
  return (
    <NativeTabs
      tintColor={accent}
      backgroundColor={background}
      iconColor={{ default: muted, selected: accent }}
      labelStyle={{ default: { color: muted }, selected: { color: accent } }}
      minimizeBehavior="never"
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="home" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon
          src={require("../../../assets/icons/home.png")}
          renderingMode="template"
        />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="trips" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon
          src={require("../../../assets/icons/trips.png")}
          renderingMode="template"
        />
        <NativeTabs.Trigger.Label>Trips</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon
          src={require("../../../assets/icons/profile.png")}
          renderingMode="template"
        />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
