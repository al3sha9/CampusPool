import { useRouter } from "expo-router";
import { useTrip } from "@/features/campus/trip-context";
import { ProfileAvatar } from "./profile-avatar";
import { HugeiconsIcon } from "@hugeicons/react-native";
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon";
import Car01Icon from "@hugeicons/core-free-icons/Car01Icon";
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon";
import Clock01Icon from "@hugeicons/core-free-icons/Clock01Icon";
import EyeIcon from "@hugeicons/core-free-icons/EyeIcon";
import Flag01Icon from "@hugeicons/core-free-icons/Flag01Icon";
import InformationCircleIcon from "@hugeicons/core-free-icons/InformationCircleIcon";
import Location01Icon from "@hugeicons/core-free-icons/Location01Icon";
import Logout01Icon from "@hugeicons/core-free-icons/Logout01Icon";
import Mail01Icon from "@hugeicons/core-free-icons/Mail01Icon";
import Settings02Icon from "@hugeicons/core-free-icons/Settings02Icon";
import UserGroupIcon from "@hugeicons/core-free-icons/UserGroupIcon";
import UserIcon from "@hugeicons/core-free-icons/UserIcon";
import ViewOffIcon from "@hugeicons/core-free-icons/ViewOffIcon";
import Wallet01Icon from "@hugeicons/core-free-icons/Wallet01Icon";
import { Accordion, Button, useThemeColor } from "heroui-native";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import Animated, { Easing, FadeIn, ReduceMotion, useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

const StyledSafeAreaView = withUniwind(SafeAreaView);
const icons = {
  location: Location01Icon,
  clock: Clock01Icon,
  wallet: Wallet01Icon,
  flag: Flag01Icon,
  car: Car01Icon,
  back: ArrowLeft01Icon,
  next: ArrowRight01Icon,
  logout: Logout01Icon,
  info: InformationCircleIcon,
  users: UserGroupIcon,
  user: UserIcon,
  mail: Mail01Icon,
  eye: EyeIcon,
  hidden: ViewOffIcon,
  check: CheckmarkCircle02Icon,
  settings: Settings02Icon,
};
export type IconName = keyof typeof icons;
export function AppIcon({
  name,
  size = 22,
  tone = "muted",
}: {
  name: IconName;
  size?: number;
  tone?: "muted" | "foreground" | "accent" | "accent-foreground" | "success" | "danger";
}) {
  const color = useThemeColor(tone);
  return (
    <HugeiconsIcon
      icon={icons[name]}
      size={size}
      color={color}
      strokeWidth={1.7}
      accessible={false}
    />
  );
}
export function Disclosure({
  title,
  icon = "info",
  children,
}: {
  title: string;
  icon?: IconName;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <Accordion selectionMode="single" animation={reduced ? "disable-all" : undefined}>
      <Accordion.Item value="details">
        <Accordion.Trigger className="min-h-12 gap-3">
          <AppIcon name={icon} size={20} />
          <Text className="flex-1 text-sm font-medium text-muted">{title}</Text>
          <Accordion.Indicator />
        </Accordion.Trigger>
        <Accordion.Content>
          <View className="gap-4 pb-4 pt-2">{children}</View>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}
export function Screen({
  children,
  title,
  subtitle,
  onBack,
  action,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  const router = useRouter();
  const { accountName, avatarPath, auth } = useTrip();
  return (
    <StyledSafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View className="flex-row items-center justify-between px-6 py-3" style={{ gap: 12 }}>
          <View className="flex-1 flex-row items-center" style={{ gap: 10 }}>
            {onBack && (
              <Button
                isIconOnly
                variant="ghost"
                accessibilityLabel="Back"
                onPress={onBack}
                style={{ minWidth: 48, minHeight: 48 }}
              >
                <AppIcon name="back" tone="foreground" />
              </Button>
            )}
            <Text className="text-lg font-semibold text-foreground">CampusPool</Text>
          </View>
          {auth.session && (
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel="Open profile"
              onPress={() => router.navigate("/(tabs)/profile")}
            >
              <ProfileAvatar name={accountName} path={avatarPath} size={40} />
            </Button>
          )}
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 16,
            gap: 28,
          }}
        >
          <View style={{ gap: 12 }}>
            <Text
              accessibilityRole="header"
              className="text-3xl font-semibold text-foreground"
              style={{ lineHeight: 38 }}
            >
              {title}
            </Text>
            <Text className="text-base text-muted" style={{ lineHeight: 24 }}>
              {subtitle}
            </Text>
          </View>
          {children}
          <View style={{ marginTop: "auto", paddingTop: 12 }}>
            <Disclosure title="About this demo">
              <Text className="text-sm leading-6 text-muted">
                Fictional students, illustrative pickup points and fares. Data resets on restart.
                Booking and settlement happen outside CampusPool.
              </Text>
            </Disclosure>
          </View>
        </ScrollView>
        {action && (
          <View
            className="bg-background border-t border-separator"
            style={{ paddingHorizontal: 24, paddingVertical: 16 }}
          >
            {action}
          </View>
        )}
      </KeyboardAvoidingView>
    </StyledSafeAreaView>
  );
}
export function Detail({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View className="flex-row items-center" style={{ gap: 16 }}>
      <View
        className="rounded-xl bg-default items-center justify-center"
        style={{ width: 44, height: 44 }}
      >
        <AppIcon name={icon} />
      </View>
      <View className="flex-1" style={{ gap: 4 }}>
        <Text className="text-sm text-muted">{label}</Text>
        <Text className="text-base font-medium text-foreground">{value}</Text>
      </View>
    </View>
  );
}
const noticeEntrance = FadeIn.duration(180)
  .easing(Easing.bezier(0.23, 1, 0.32, 1))
  .reduceMotion(ReduceMotion.System);
export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return (
    <Animated.View entering={noticeEntrance}>
      <View
        className={danger ? "rounded-2xl bg-danger-soft" : "rounded-2xl bg-default"}
        style={{ padding: 16, flexDirection: "row", gap: 12 }}
      >
        <AppIcon name="info" tone={danger ? "danger" : "muted"} size={20} />
        <Text
          accessibilityLiveRegion="polite"
          className={
            danger ? "flex-1 text-danger text-sm leading-6" : "flex-1 text-muted text-sm leading-6"
          }
        >
          {children}
        </Text>
      </View>
    </Animated.View>
  );
}
export function Choices<T extends number | string>({
  label,
  icon,
  choices,
  value,
  onChange,
}: {
  label: string;
  icon?: IconName;
  choices: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={{ gap: 16 }}>
      <View className="flex-row items-center" style={{ gap: 10 }}>
        {icon && <AppIcon name={icon} size={20} />}
        <Text className="text-base font-medium text-foreground">{label}</Text>
      </View>
      <View className="flex-row flex-wrap" style={{ gap: 10 }}>
        {choices.map((choice) => (
          <Button
            key={choice.value}
            variant={value === choice.value ? "primary" : "secondary"}
            accessibilityState={{ selected: value === choice.value }}
            style={{ minHeight: 48 }}
            onPress={() => onChange(choice.value)}
          >
            {choice.label}
          </Button>
        ))}
      </View>
    </View>
  );
}
