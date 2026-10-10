import { useState } from "react";
import { Image, Text, View } from "react-native";
import { avatarUrl } from "@/lib/profile";

export function ProfileAvatar({
  name,
  path,
  uri,
  size = 44,
}: {
  name: string;
  path?: string | null;
  uri?: string | null;
  size?: number;
}) {
  const source = uri ?? avatarUrl(path);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "CP";
  return (
    <View
      className="bg-accent-soft items-center justify-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      {source && source !== failedSource ? (
        <Image
          accessibilityLabel={`${name}'s profile photo`}
          source={{ uri: source }}
          style={{ width: size, height: size }}
          onError={() => setFailedSource(source)}
        />
      ) : (
        <Text className="text-accent font-semibold" style={{ fontSize: size * 0.34 }}>
          {initials}
        </Text>
      )}
    </View>
  );
}
