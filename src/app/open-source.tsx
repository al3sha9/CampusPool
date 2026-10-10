import { Button, Card } from "heroui-native";
import { Linking } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/trip-ui";
const projects = [
  ["Photon", "Destination search using OpenStreetMap places.", "https://github.com/komoot/photon"],
  ["Supabase", "Accounts and shared trip data.", "https://supabase.com/"],
  ["Expo & React Native", "The app framework and native screens.", "https://expo.dev/"],
  ["HeroUI Native", "Components and theme.", "https://heroui.com/"],
  ["Hugeicons", "Outline icons.", "https://hugeicons.com/"],
  ["MapLibre", "Native maps and the Expo Go map preview.", "https://maplibre.org/"],
  ["OpenFreeMap", "Map hosting and styles.", "https://openfreemap.org/"],
  [
    "OpenMapTiles & OpenStreetMap",
    "Map schema and community map data.",
    "https://www.openstreetmap.org/copyright",
  ],
  ["Uniwind & Tailwind CSS", "App styling.", "https://uniwind.dev/"],
  [
    "Reanimated & Gesture Handler",
    "Native motion and gestures.",
    "https://docs.swmansion.com/react-native-reanimated/",
  ],
  [
    "Gorhom Bottom Sheet",
    "Expandable route details.",
    "https://gorhom.dev/react-native-bottom-sheet/",
  ],
  [
    "React Native WebView",
    "Interactive map preview in Expo Go.",
    "https://github.com/react-native-webview/react-native-webview",
  ],
  [
    "React Native SVG & QRCode SVG",
    "Passenger pickup QR rendering.",
    "https://github.com/Expensify/react-native-qrcode-svg",
  ],
] as const;
export default function OpenSource() {
  const router = useRouter();
  return (
    <Screen
      title="Built with open source"
      subtitle="Thanks to the projects behind CampusPool."
      onBack={() => router.back()}
    >
      {projects.map(([name, description, url]) => (
        <Card key={name} variant="secondary">
          <Card.Body style={{ gap: 8 }}>
            <Card.Title>{name}</Card.Title>
            <Card.Description>{description}</Card.Description>
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              onPress={() => Linking.openURL(url)}
            >
              Visit project
            </Button>
          </Card.Body>
        </Card>
      ))}
    </Screen>
  );
}
