import { Image, Text, View } from "react-native";

export function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <Image
      source={require("../../assets/images/brand-mark.png")}
      accessibilityLabel="CampusPool logo"
      resizeMode="contain"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}

export function BrandLockup() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <BrandMark />
      <Text className="text-xl font-semibold text-foreground">CampusPool</Text>
    </View>
  );
}
