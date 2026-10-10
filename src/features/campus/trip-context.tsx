import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, AppState, Keyboard } from "react-native";
import { useRouter } from "expo-router";
import {
  demoTrips,
  student,
  type Group,
  type HubId,
  type RideRequest,
  type Suggestion,
} from "@/lib/trip-demo";
import { metroDestination, type Destination } from "@/lib/destinations";
import { pickupDemo } from "@/lib/pickup-runtime";
import { useAuth } from "@/features/auth/auth-context";
import { serverTrips, serverPickup } from "@/lib/trip-server";
import { saveAccountProfile } from "@/lib/profile";
type Stage = "signin" | "request" | "suggestions" | "lobby";
function useTripState() {
  const router = useRouter();
  const auth = useAuth();
  const preview = !auth.session;
  const [accountName, setAccountName] = useState(
    auth.session
      ? typeof auth.session.user.user_metadata.display_name === "string"
        ? auth.session.user.user_metadata.display_name
        : "Student"
      : "Ayesha"
  );
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [requestId, setRequestId] = useState("");
  const refreshBusy = useRef(false);
  const mutationRevision = useRef(0);
  const [stage, setStage] = useState<Stage>(auth.session ? "request" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [destination, setDestination] = useState<Destination | null>(metroDestination);
  const [carEstimate, setCarEstimate] = useState("");
  const hubId: HubId = destination?.id ?? "metro";
  const [departure, setDeparture] = useState(10);
  const [windowMinutes, setWindowMinutes] = useState(15);
  const [budget, setBudget] = useState("450");
  const [request, setRequest] = useState<RideRequest | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [viewerId, setViewerId] = useState(auth.session?.user.id ?? student.id);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const budgetInvalid =
    !/^\d+$/.test(budget) || !Number.isSafeInteger(Number(budget)) || Number(budget) < 1;

  const carEstimateInvalid =
    !/^\d+$/.test(carEstimate) ||
    !Number.isSafeInteger(Number(carEstimate)) ||
    Number(carEstimate) < 1 ||
    Number(carEstimate) > 1000000;
  async function refresh() {
    if (!auth.session || refreshBusy.current || busy.current) return;
    refreshBusy.current = true;
    const revision = mutationRevision.current;
    try {
      const result = await serverTrips.bootstrap();
      if (revision !== mutationRevision.current) return;
      setAccountName(result.profile.name);
      setAvatarPath(result.profile.avatarPath ?? null);
      setGroup((previous) =>
        JSON.stringify(previous) === JSON.stringify(result.group) ? previous : result.group
      );
      if (result.group) {
        setRequest(result.group.request);
        setStage("lobby");
      } else setStage((current) => (current === "lobby" ? "request" : current));
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not refresh your trip.");
    } finally {
      refreshBusy.current = false;
    }
  }
  useEffect(() => {
    const userId = auth.session?.user.id;
    if (!userId) return;
    let active = true;
    const load = async () => {
      if (!active || AppState.currentState !== "active" || busy.current || refreshBusy.current)
        return;
      refreshBusy.current = true;
      const revision = mutationRevision.current;
      try {
        const result = await serverTrips.bootstrap();
        if (!active || revision !== mutationRevision.current) return;
        setAccountName(result.profile.name);
        setAvatarPath(result.profile.avatarPath ?? null);
        setGroup((previous) =>
          JSON.stringify(previous) === JSON.stringify(result.group) ? previous : result.group
        );
        if (result.group) {
          setRequest(result.group.request);
          setStage("lobby");
        } else setStage((current) => (current === "lobby" ? "request" : current));
      } catch (failure) {
        if (active)
          setError(failure instanceof Error ? failure.message : "Could not load your trip.");
      } finally {
        refreshBusy.current = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      active = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [auth.session?.user.id]);
  async function run(operation: () => Promise<void>) {
    if (busy.current) return false;
    busy.current = true;
    mutationRevision.current++;
    setPending(true);
    setError("");
    Keyboard.dismiss();
    try {
      await operation();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function saveProfile(fullName: string, photoUri: string | null, removePhoto: boolean) {
    return run(async () => {
      const profile = await saveAccountProfile(fullName, photoUri, avatarPath, removePhoto);
      setAccountName(profile.name);
      setAvatarPath(profile.avatarPath);
    });
  }
  function resetTrip(navigateHome = true) {
    if (!preview && group) {
      void run(async () => {
        if (group.status === "completed" || group.status === "cancelled")
          await serverTrips.dismiss(group);
        else if (group.members.some((member) => member.id === viewerId))
          await serverTrips.leave(group, viewerId);
        clearTrip(navigateHome);
      });
      return;
    }
    clearTrip(navigateHome);
  }
  function clearTrip(navigateHome = true) {
    if (preview && group) {
      pickupDemo.clearGroup(group.id);
      demoTrips.discard(group.id);
    }
    setViewerId(auth.session?.user.id ?? student.id);
    setGroup(null);
    setRequest(null);
    setSuggestions([]);
    setError("");
    setMessage("");
    setStage("request");
    if (navigateHome) router.navigate("/(tabs)/home");
  }
  function signOut() {
    if (pending) return;
    if (!preview) {
      void run(async () => {
        if (!(await auth.signOut())) throw new Error("Could not sign out. Retry.");
        clearTrip(false);
        setStage("signin");
        router.replace("/");
      });
      return;
    }
    const finish = () => {
      resetTrip(false);
      setEmail("");
      setPassword("");
      setLoginError("");
      setStage("signin");
      router.replace("/");
    };
    if (group)
      Alert.alert("Sign out of the preview?", "Your local demo trip will be cleared.", [
        { text: "Stay", style: "cancel" },
        { text: "Sign out", onPress: finish },
      ]);
    else finish();
  }
  function enterDemo() {
    Keyboard.dismiss();
    setAccountName("Ayesha");
    setPassword("");
    setLoginError("");
    setStage("request");
    router.replace("/(tabs)/home");
  }
  async function findGroups() {
    setSubmitted(true);
    if (budgetInvalid || !destination || !destination.name.trim()) return;
    await run(async () => {
      const earliest = Date.now() + departure * 60000;
      const next = {
        hubId,
        destination,
        ...(carEstimate.trim() && !carEstimateInvalid ? { carEstimate: Number(carEstimate) } : {}),
        earliestAt: new Date(earliest).toISOString(),
        latestAt: new Date(earliest + windowMinutes * 60000).toISOString(),
        maxShare: Number(budget),
      };
      const response = preview ? null : await serverTrips.search(next);
      const results = response ? response.suggestions : await demoTrips.suggestions(next);
      setRequestId(response?.requestId ?? "");
      setRequest(next);
      setSuggestions(results);
      setStage("suggestions");
    });
  }
  async function join(suggestion?: Suggestion) {
    if (!request) return;
    if (!suggestion && carEstimateInvalid) {
      setError("Enter an estimated car total to create your group.");
      return;
    }
    await run(async () => {
      setGroup(
        preview
          ? await demoTrips.join(request, suggestion)
          : await serverTrips.join(
              requestId,
              suggestion?.id,
              suggestion ? undefined : Number(carEstimate)
            )
      );
      setViewerId(auth.session?.user.id ?? student.id);
      setMessage("");
      setStage("lobby");
      router.navigate("/(tabs)/trips");
    });
  }
  async function update(action: Parameters<typeof demoTrips.update>[1]) {
    if (!group) return;
    await run(async () => {
      const next = preview
        ? await demoTrips.update(group, action)
        : action === "confirm"
          ? await serverTrips.confirm(group, viewerId)
          : action === "lock"
            ? await serverTrips.lock(group, viewerId)
            : (() => {
                throw new Error("Demo controls are unavailable on shared trips.");
              })();
      setGroup(next);
      setMessage(
        action === "remove" || action === "replace"
          ? "Group changed. Review your share and confirm again."
          : action === "confirm"
            ? "You confirmed the current estimate."
            : action === "peer-confirm"
              ? "Demo students confirmed."
              : "Group locked. Book externally."
      );
    });
  }

  return {
    preview,
    accountName,
    avatarPath,
    saveProfile,
    auth,
    refresh,
    clearTrip,
    trips: preview ? demoTrips : serverTrips,
    pickup: preview ? pickupDemo : serverPickup,
    stage,
    setStage,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    loginError,
    setLoginError,
    hubId,
    destination,
    setDestination,
    carEstimate,
    setCarEstimate,
    carEstimateInvalid,
    departure,
    setDeparture,
    windowMinutes,
    setWindowMinutes,
    budget,
    setBudget,
    request,
    suggestions,
    group,
    setGroup,
    viewerId,
    setViewerId,
    error,
    setError,
    message,
    setMessage,
    pending,
    submitted,
    budgetInvalid,
    run,
    resetTrip,
    signOut,
    enterDemo,
    findGroups,
    join,
    update,
  };
}
const TripContext = createContext<ReturnType<typeof useTripState> | null>(null);
function TripSession({ children }: { children: ReactNode }) {
  const trip = useTripState();
  return <TripContext.Provider value={trip}>{children}</TripContext.Provider>;
}
export function TripProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  return <TripSession key={session?.user.id ?? "preview"}>{children}</TripSession>;
}
export function useTrip() {
  const trip = useContext(TripContext);
  if (!trip) throw new Error("TripProvider is missing.");
  return trip;
}
