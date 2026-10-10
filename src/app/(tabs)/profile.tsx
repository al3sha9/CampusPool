import { Button, Card, Switch } from "heroui-native";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { ProfileAvatar } from "@/components/profile-avatar";
import { ProfileEditor } from "@/features/profile/profile-editor";
import { useState } from "react";
import { Detail, Notice, Screen } from "@/components/trip-ui";
import { useTrip } from "@/features/campus/trip-context";
import { useThemePreference } from "@/features/theme/theme-preference";
export default function Profile() {
  const { theme, setTheme } = useThemePreference();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const { signOut, pending, preview, accountName, avatarPath, auth, error } = useTrip();
  return (
    <Screen
      title="Your profile"
      subtitle={preview ? "Local preview on this device." : "Your signed-in CampusPool account."}
    >
      {editing ? (
        <ProfileEditor onClose={() => setEditing(false)} />
      ) : (
        <Card>
          <Card.Body style={{ gap: 20 }}>
            <ProfileAvatar name={accountName} path={avatarPath} size={72} />
            <Card.Title>{accountName}</Card.Title>
            {!preview && <Card.Description>{auth.session?.user.email}</Card.Description>}
            <Detail icon="location" label="Campus" value="BIIT" />
            <Button variant="secondary" isDisabled={pending} onPress={() => setEditing(true)}>
              Edit profile
            </Button>
          </Card.Body>
        </Card>
      )}
      <Card variant="secondary">
        <Card.Body className="flex-row items-center gap-4">
          <View style={{ flex: 1, gap: 4 }}>
            <Card.Title>Dark mode</Card.Title>
            <Card.Description>
              {theme === "dark" ? "Dark appearance" : "Light appearance"}
            </Card.Description>
          </View>
          <Switch
            accessibilityLabel="Dark mode"
            isSelected={theme === "dark"}
            onSelectedChange={(selected) => setTheme(selected ? "dark" : "light")}
          />
        </Card.Body>
      </Card>
      <Card variant="secondary">
        <Card.Body style={{ gap: 12 }}>
          <Card.Title>About CampusPool</Card.Title>
          <Text className="text-sm text-muted leading-6">
            Find a group, agree on the split and meet at one pickup. Booking and settlement happen
            externally.
          </Text>
          <Card.Description>
            {preview
              ? "Local preview · resets on restart."
              : "Shared trips use your email account."}
          </Card.Description>
        </Card.Body>
      </Card>
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        onPress={() => router.push("/open-source")}
      >
        Open source
      </Button>
      {(error || auth.error) && <Notice danger>{error || auth.error}</Notice>}
      <Button variant="danger-soft" isDisabled={pending} onPress={signOut}>
        Sign out
      </Button>
    </Screen>
  );
}
