import { Redirect } from "expo-router";
import { CampusScreen } from "@/features/campus/campus-screen";
import { useTrip } from "@/features/campus/trip-context";
export default function SignIn() {
  const { stage } = useTrip();
  return stage === "signin" ? <CampusScreen /> : <Redirect href="/(tabs)/home" />;
}
