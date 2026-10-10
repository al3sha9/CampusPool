import type { JSX, ReactNode } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { HeroUINativeProvider, useThemeColor } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemePreferenceProvider, useThemePreference } from "@/features/theme/theme-preference";

import * as SplashScreen from "expo-splash-screen";
import { BrandMark } from "@/components/brand";
import { AuthProvider, useAuth } from "@/features/auth/auth-context";
import { TripProvider } from "@/features/campus/trip-context";
import "../global.css";

void SplashScreen.preventAutoHideAsync().catch(() => {});

function Startup({ children }: { children: ReactNode }) {
  const { loading: authLoading } = useAuth();
  const { loading: themeLoading, theme } = useThemePreference();
  const loading = authLoading || themeLoading;
  const background = useThemeColor("background");
  return (
    <View
      style={{ flex: 1, backgroundColor: loading ? "#f7f7f7" : background }}
      onLayout={() => {
        void SplashScreen.hideAsync().catch(() => {});
      }}
    >
      <StatusBar style={loading || theme === "light" ? "dark" : "light"} />
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 24 }}>
          <BrandMark size={200} />
          <Text style={{ fontSize: 30, fontWeight: "600", color: "#111114" }}>CampusPool</Text>
          <Text style={{ fontSize: 14, color: "#52525b" }}>Share the ride home.</Text>
        </View>
      ) : (
        children
      )}
    </View>
  );
}

export default function RootLayout(): JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemePreferenceProvider>
        <SafeAreaProvider>
          <HeroUINativeProvider>
            <AuthProvider>
              <Startup>
                <TripProvider>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="history" options={{ presentation: "modal" }} />
                    <Stack.Screen name="chat" options={{ presentation: "modal" }} />
                    <Stack.Screen name="map" options={{ presentation: "modal" }} />
                    <Stack.Screen name="open-source" options={{ presentation: "modal" }} />
                  </Stack>
                </TripProvider>
              </Startup>
            </AuthProvider>
          </HeroUINativeProvider>
        </SafeAreaProvider>
      </ThemePreferenceProvider>
    </GestureHandlerRootView>
  );
}
