import { useRef, useState } from "react";
import { Keyboard, Linking, View } from "react-native";
import { Button, Card, Description, Input, Label, Switch, TextField } from "heroui-native";
import * as ImagePicker from "expo-image-picker";
import { ProfileAvatar } from "@/components/profile-avatar";
import { Notice } from "@/components/trip-ui";
import { useTrip } from "@/features/campus/trip-context";

export function ProfileEditor({ onClose }: { onClose: () => void }) {
  const { accountName, avatarPath, saveProfile, pending, error } = useTrip();
  const parts = accountName.trim().split(/\s+/);
  const [firstName, setFirstName] = useState(parts[0] ?? "");
  const [lastName, setLastName] = useState(parts.slice(1).join(" "));
  const [photo, setPhoto] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [rideUpdates, setRideUpdates] = useState(true);
  const [photoError, setPhotoError] = useState("");
  const [picking, setPicking] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const busy = useRef(false);
  const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  const invalid = !firstName.trim() || fullName.length > 60;
  async function pickPhoto() {
    if (busy.current || pending) return;
    busy.current = true;
    setPicking(true);
    setPhotoError("");
    Keyboard.dismiss();
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]) {
        setPhoto(result.assets[0].uri);
        setRemovePhoto(false);
      }
    } catch {
      setPhotoError("Could not open photos. Retry or check photo access in Settings.");
    } finally {
      busy.current = false;
      setPicking(false);
    }
  }
  async function save() {
    setSubmitted(true);
    if (invalid || picking || pending) return;
    if (await saveProfile(fullName, photo, removePhoto)) onClose();
  }
  return (
    <Card>
      <Card.Body style={{ gap: 20 }}>
        <Card.Title>Edit profile</Card.Title>
        <View style={{ alignItems: "center", gap: 12 }}>
          <ProfileAvatar
            name={fullName}
            path={removePhoto ? null : avatarPath}
            uri={photo}
            size={88}
          />
          <Button
            variant="secondary"
            isDisabled={pending || picking}
            onPress={() => void pickPhoto()}
          >
            {picking ? "Opening photos…" : "Change photo"}
          </Button>
          {(photo || avatarPath) && !removePhoto && (
            <Button
              variant="ghost"
              isDisabled={pending || picking}
              onPress={() => {
                setPhoto(null);
                setRemovePhoto(true);
              }}
            >
              Remove photo
            </Button>
          )}
        </View>
        {photoError && (
          <>
            <Notice danger>{photoError}</Notice>
            <Button variant="ghost" onPress={() => void Linking.openSettings()}>
              Photo settings
            </Button>
          </>
        )}
        <TextField isRequired isInvalid={submitted && invalid} isDisabled={pending}>
          <Label>First name</Label>
          <Input
            accessibilityLabel="First name"
            value={firstName}
            onChangeText={setFirstName}
            maxLength={60}
            autoComplete="given-name"
          />
          {submitted && invalid && (
            <Description>
              Enter your first name. Full name must be 60 characters or fewer.
            </Description>
          )}
        </TextField>
        <TextField isDisabled={pending}>
          <Label>Last name</Label>
          <Input
            accessibilityLabel="Last name"
            value={lastName}
            onChangeText={setLastName}
            maxLength={60}
            autoComplete="family-name"
          />
        </TextField>
        <TextField isDisabled={pending}>
          <Label>Phone number</Label>
          <Input
            accessibilityLabel="Phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            maxLength={20}
            placeholder="+92"
          />
        </TextField>
        <TextField isDisabled={pending}>
          <Label>Department</Label>
          <Input
            accessibilityLabel="Department"
            value={department}
            onChangeText={setDepartment}
            maxLength={80}
            placeholder="Your department"
          />
        </TextField>
        <View className="flex-row items-center justify-between gap-4">
          <Label>Ride updates</Label>
          <Switch
            accessibilityLabel="Ride updates"
            isSelected={rideUpdates}
            onSelectedChange={setRideUpdates}
            isDisabled={pending}
          />
        </View>
        {error && <Notice danger>{error}</Notice>}
        <Button isDisabled={pending || picking} onPress={() => void save()}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button variant="ghost" isDisabled={pending || picking} onPress={onClose}>
          Cancel
        </Button>
      </Card.Body>
    </Card>
  );
}
