import {
  Button,
  Card,
  Chip,
  Description,
  FieldError,
  Input,
  Label,
  Switch,
  TextField,
} from "heroui-native";
import { useRouter, useIsFocused } from "expo-router";
import { useTrip } from "./trip-context";
import { RouteMap } from "@/features/maps/route-map";
import { useState } from "react";
import { Alert, Keyboard, Text, View } from "react-native";
import { AppIcon, Choices, Detail, Disclosure, Notice, Screen } from "@/components/trip-ui";
import {
  destinationName,
  requestDestination,
  fareShares,
  splitFare,
  tripTime,
} from "@/lib/trip-demo";

import { BrandLockup } from "@/components/brand";
import { DestinationPicker } from "@/features/maps/destination-picker";
import { TripFlow } from "@/features/trip/trip-flow";

export function CampusScreen({ tab = "signin" }: { tab?: "signin" | "home" | "trips" }) {
  const router = useRouter();
  const focused = useIsFocused();
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState("");
  const [womenOnly, setWomenOnly] = useState(false);
  const {
    preview,
    accountName,
    auth,
    refresh,
    trips,
    pickup,
    clearTrip,
    stage,
    setStage,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,

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
    findGroups,
    join,
    update,
  } = useTrip();
  const loginError = auth.error;
  if (auth.loading)
    return (
      <Screen title="CampusPool" subtitle="Restoring your session…">
        <View />
      </Screen>
    );
  if (stage === "signin")
    return (
      <Screen
        key={stage}
        title="Share the ride home."
        subtitle="Same campus. Same hub. One shared ride."
      >
        <BrandLockup />
        <Card>
          <Card.Body style={{ gap: 20 }}>
            <Card.Title>{signup ? "Create account" : "Sign in"}</Card.Title>
            <Card.Description>Your CampusPool account</Card.Description>
            {signup && (
              <TextField isRequired>
                <Label>Your name</Label>
                <Input
                  value={name}
                  onChangeText={setName}
                  autoComplete="name"
                  placeholder="Your name"
                  maxLength={60}
                />
              </TextField>
            )}
            {auth.notice && <Notice>{auth.notice}</Notice>}
            <TextField isInvalid={!!loginError} isRequired>
              <Label className="gap-2">
                <AppIcon name="mail" size={18} />
                <Label.Text>Email</Label.Text>
              </Label>
              <Input
                accessibilityLabel="Email"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
              />
            </TextField>
            <TextField isRequired isInvalid={!!loginError}>
              <Label>Password</Label>
              <View style={{ position: "relative" }}>
                <Input
                  accessibilityLabel="Password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  style={{ paddingRight: 56 }}
                />
                <Button
                  variant="ghost"
                  isIconOnly
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  accessibilityState={{ checked: showPassword }}
                  style={{ position: "absolute", right: 0, top: 0, minWidth: 48, minHeight: 48 }}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <AppIcon name={showPassword ? "hidden" : "eye"} />
                </Button>
              </View>
              <FieldError>{loginError}</FieldError>
            </TextField>
          </Card.Body>
          <Card.Footer style={{ marginTop: 16 }}>
            <Button
              className="w-full"
              isDisabled={auth.pending}
              onPress={() => {
                Keyboard.dismiss();
                void auth.authenticate(email, password, signup, name);
              }}
            >
              <Button.Label>
                {auth.pending ? "Please wait…" : signup ? "Create account" : "Sign in"}
              </Button.Label>
              <AppIcon name="next" tone="accent-foreground" size={20} />
            </Button>
          </Card.Footer>
        </Card>
        <Button
          variant="ghost"
          isDisabled={auth.pending}
          onPress={() => {
            setSignup(!signup);
            auth.clearFeedback();
          }}
        >
          {signup ? "Already have an account? Sign in" : "New here? Create an account"}
        </Button>
      </Screen>
    );

  if (!focused && tab === "trips") return null;
  if (tab === "home" && group)
    return (
      <Screen title="Your ride is here" subtitle="Your group stays together while you explore.">
        <RouteMap hubId={group.request.hubId} destination={requestDestination(group.request)} />
        <Card>
          <Card.Body style={{ gap: 12 }}>
            <Card.Title>{destinationName(group.request)}</Card.Title>
            <Card.Description>
              {group.members.length} passengers · {group.status.replaceAll("_", " ")}
            </Card.Description>
          </Card.Body>
          <Card.Footer style={{ marginTop: 16 }}>
            <Button className="w-full" onPress={() => router.navigate("/(tabs)/trips")}>
              View your trip
            </Button>
          </Card.Footer>
        </Card>
      </Screen>
    );
  if (tab === "trips" && !group)
    return (
      <Screen title="Your trips" subtitle="Your next shared ride starts on Home.">
        <Card>
          <Card.Body style={{ gap: 16 }}>
            <AppIcon name="car" size={32} tone="accent" />
            <Card.Title>No trip yet</Card.Title>
            <Card.Description>Find students heading to the same hub.</Card.Description>
          </Card.Body>
          <Card.Footer style={{ marginTop: 16 }}>
            <Button className="w-full" onPress={() => router.navigate("/(tabs)/home")}>
              Find a group
            </Button>
          </Card.Footer>
        </Card>
      </Screen>
    );
  if (stage === "request")
    return (
      <Screen
        key={stage}
        title={`Where are you heading, ${accountName.trim().split(/\s+/)[0] || "Student"}?`}
        subtitle="Choose one shared car drop-off, departure and budget."
        action={
          <Button size="lg" isDisabled={pending} onPress={findGroups}>
            <Button.Label>{pending ? "Finding groups…" : "Find a group"}</Button.Label>
            <AppIcon name="next" tone="accent-foreground" size={20} />
          </Button>
        }
      >
        <Card>
          <Card.Body style={{ gap: 20 }}>
            <Detail icon="location" label="Campus pickup" value="BIIT campus" />
            <Card.Description>Meet at the campus gate agreed with your group.</Card.Description>
          </Card.Body>
        </Card>
        <DestinationPicker value={destination} onChange={setDestination} />
        <Card variant="secondary">
          <Card.Body className="flex-row items-center gap-4">
            <View style={{ flex: 1, gap: 4 }}>
              <Card.Title>Women only</Card.Title>
            </View>
            <Switch
              accessibilityLabel="Women only"
              isSelected={womenOnly}
              onSelectedChange={setWomenOnly}
            />
          </Card.Body>
        </Card>
        <Notice>Only the car fare is split. Metro tickets are paid individually.</Notice>
        <Choices
          label="Leave campus"
          icon="clock"
          choices={[10, 20, 30].map((value) => ({ value, label: `In ${value} min` }))}
          value={departure}
          onChange={setDeparture}
        />
        <Choices
          label="How long can you wait?"
          icon="clock"
          choices={[5, 15, 30].map((value) => ({ value, label: `${value} min` }))}
          value={windowMinutes}
          onChange={setWindowMinutes}
        />
        <Text className="text-sm text-muted">
          You can leave {departure}–{departure + windowMinutes} minutes from now · Pakistan time.
        </Text>
        <TextField isRequired isInvalid={submitted && budgetInvalid}>
          <Label className="gap-2">
            <AppIcon name="wallet" size={18} />
            <Label.Text>Budget per person (PKR)</Label.Text>
          </Label>
          <Input
            accessibilityLabel="Maximum estimated share in PKR"
            keyboardType="number-pad"
            value={budget}
            onChangeText={setBudget}
            placeholder="450"
          />
          <Description>Your maximum estimated share.</Description>
          <FieldError>Enter a whole PKR amount greater than zero.</FieldError>
        </TextField>
        {error && <Notice danger>{error}</Notice>}
      </Screen>
    );

  if (stage === "suggestions" && request)
    return (
      <Screen
        key={stage}
        title={suggestions.length ? "Find your group" : "No compatible group yet"}
        subtitle={`${destinationName(request)} · ${tripTime(request.earliestAt)}–${tripTime(request.latestAt)} PKT · up to PKR ${request.maxShare}`}
        onBack={() => {
          if (!pending) {
            setError("");
            setStage("request");
          }
        }}
      >
        <Notice>
          Same destination, overlapping departure window. Estimates only; confirm the organiser’s
          external quote.
        </Notice>
        {suggestions.map((suggestion) => (
          <Card key={suggestion.id}>
            <Card.Header>
              <Chip variant="soft" size="sm">
                Same hub · {suggestion.count} of 3 places occupied
              </Chip>
            </Card.Header>
            <Card.Body style={{ gap: 20 }}>
              <Card.Title>{destinationName(request)}</Card.Title>
              <Detail
                icon="clock"
                label="Departure"
                value={`${tripTime(suggestion.departureAt)} PKT`}
              />
              <Detail
                icon="wallet"
                label="Your share after joining"
                value={`PKR ${splitFare(suggestion.total, suggestion.count + 1)[suggestion.count]}`}
              />
              <Card.Description>Car estimate · PKR {suggestion.total} total</Card.Description>
            </Card.Body>
            <Card.Footer style={{ marginTop: 16 }}>
              <Button className="w-full" isDisabled={pending} onPress={() => join(suggestion)}>
                {pending ? "Please wait…" : "Join group"}
              </Button>
            </Card.Footer>
          </Card>
        ))}
        {!suggestions.length && (
          <Notice>Try another hub or create a group and wait for a second student.</Notice>
        )}
        <TextField isRequired isInvalid={!!error && carEstimateInvalid}>
          <Label>Estimated car total (PKR)</Label>
          <Input
            accessibilityLabel="Estimated car fare total"
            value={carEstimate}
            onChangeText={setCarEstimate}
            keyboardType="number-pad"
            placeholder="Enter external car estimate"
          />
          <Description>
            Required only to create your own group. Joining uses the organiser’s estimate.
          </Description>
          <FieldError>Enter a whole PKR amount from 1 to 1,000,000.</FieldError>
        </TextField>
        {error && <Notice danger>{error}</Notice>}
        <Button variant="secondary" isDisabled={pending} onPress={() => join()}>
          {pending ? "Please wait…" : "Create a group"}
        </Button>
        <Button
          variant="ghost"
          isDisabled={pending}
          onPress={() => {
            setError("");
            setStage("request");
          }}
        >
          Change request
        </Button>
      </Screen>
    );

  if (!group) return null;
  if (group.status !== "open")
    return (
      <TripFlow
        key={`${group.id}:${viewerId}:${group.version}:${group.status}`}
        preview={preview}
        trips={trips}
        pickup={pickup}
        group={group}
        viewerId={viewerId}
        pending={pending}
        error={error}
        message={message}
        onReset={resetTrip}
        onViewerChange={(id) => {
          if (!pending) {
            setViewerId(id);
            setError("");
            setMessage("");
          }
        }}
        onChange={(operation, success) =>
          run(async () => {
            const next = await operation();
            setGroup(next);
            setMessage(success);
            if (!next.members.some((m) => m.id === viewerId)) {
              if (preview) setViewerId(next.members[0]?.id ?? viewerId);
              else clearTrip();
            }
          })
        }
      />
    );
  const shares = fareShares(group);
  const yourIndex = group.members.findIndex((m) => m.id === viewerId);
  const confirmed = group.members[yourIndex]?.confirmedVersion === group.version;
  const canPool = group.members.length >= 2;
  const withinBudget = shares[yourIndex] <= group.request.maxShare;
  const allConfirmed = group.members.every((m) => m.confirmedVersion === group.version);
  return (
    <Screen
      key={stage}
      showChat={!preview}
      title="Your group"
      subtitle="Same route. Clear split. Ready when everyone agrees."
    >
      <View className="flex-row flex-wrap gap-2">
        <Chip variant="soft" color="accent">
          {canPool ? "Review estimate" : "Waiting for another student"}
        </Chip>
        <Chip variant="secondary" color="default">
          {group.members.length} of 3 passengers
        </Chip>
      </View>
      <RouteMap hubId={group.request.hubId} destination={requestDestination(group.request)} />
      <Card>
        <Card.Body style={{ gap: 20 }}>
          <Detail icon="location" label="Pickup" value="BIIT campus" />
          <Detail icon="flag" label="Destination" value={destinationName(group.request)} />
          <Detail
            icon="clock"
            label="Departure window"
            value={`${tripTime(group.request.earliestAt)}–${tripTime(group.request.latestAt)} PKT`}
          />
        </Card.Body>
      </Card>
      <Card>
        <Card.Body style={{ gap: 12 }}>
          <Card.Description>
            {canPool ? "Your estimated share" : "Waiting for a pooled estimate"}
          </Card.Description>
          <Text className="text-3xl font-semibold text-foreground">
            {canPool ? `PKR ${shares[yourIndex]}` : "At least 2 passengers"}
          </Text>
          <Card.Description>
            Estimated total PKR {group.total} · Starting estimate
            {canPool ? ` · split between ${group.members.length}` : ""}.
          </Card.Description>
          <Card.Description>Your budget: PKR {group.request.maxShare}</Card.Description>
        </Card.Body>
      </Card>
      {!withinBudget && canPool && (
        <Notice danger>Over your budget. Wait for a replacement or change your request.</Notice>
      )}
      {message && <Notice>{message}</Notice>}
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
          Group members
        </Text>
        {group.members.map((member, i) => (
          <Card key={member.id} variant="secondary">
            <Card.Body style={{ gap: 12 }}>
              <View className="flex-row flex-wrap justify-between gap-2">
                <View className="flex-row items-center gap-3">
                  <AppIcon name="user" />
                  <Card.Title>
                    {member.name}
                    {member.id === viewerId ? " (you)" : ""}
                  </Card.Title>
                </View>
                <Chip
                  size="sm"
                  variant="soft"
                  color={member.confirmedVersion === group.version ? "success" : "default"}
                >
                  {member.confirmedVersion === group.version ? "Confirmed" : "Not confirmed"}
                </Chip>
              </View>
              <Card.Description>
                {member.id === group.organiserId ? "Organiser" : "Passenger"}
                {canPool ? ` · PKR ${shares[i]}` : ""}
              </Card.Description>
            </Card.Body>
          </Card>
        ))}
      </View>
      {error && <Notice danger>{error}</Notice>}
      <>
        <Button
          size="lg"
          isDisabled={pending || confirmed || !canPool || !withinBudget}
          onPress={() => update("confirm")}
        >
          {pending ? "Updating…" : confirmed ? "Estimate confirmed" : "Confirm current estimate"}
        </Button>
        <Notice>
          {canPool
            ? "A change to members or fare needs fresh confirmation."
            : "You need another student before confirming."}
        </Notice>
        {preview && (
          <Disclosure title="Demo controls" icon="settings">
            <Text className="text-sm leading-6 text-muted">
              Simulate the other students on this device.
            </Text>
            <Button
              variant="secondary"
              isDisabled={pending || !canPool || !withinBudget || allConfirmed}
              onPress={() => update("peer-confirm")}
            >
              Simulate others confirming
            </Button>
            {group.members.length > 1 && (
              <Button variant="tertiary" isDisabled={pending} onPress={() => update("remove")}>
                Simulate a passenger leaving
              </Button>
            )}
            {group.members.length < 3 && (
              <Button variant="tertiary" isDisabled={pending} onPress={() => update("replace")}>
                Add demo replacement
              </Button>
            )}
            <Button
              isDisabled={pending || !canPool || !withinBudget || !allConfirmed}
              onPress={() => update("lock")}
            >
              Simulate organiser locking group
            </Button>
          </Disclosure>
        )}
        {!preview && (
          <Button
            isDisabled={pending || !canPool || !allConfirmed || group.organiserId !== viewerId}
            onPress={() => update("lock")}
          >
            Lock group
          </Button>
        )}
        {!preview && (
          <Button variant="ghost" isDisabled={pending} onPress={() => void refresh()}>
            Refresh trip
          </Button>
        )}
        <Button
          variant="danger-soft"
          isDisabled={pending}
          onPress={() =>
            Alert.alert("Leave this group?", "Return to your request and find a new group.", [
              { text: "Stay", style: "cancel" },
              { text: "Leave group", style: "destructive", onPress: () => resetTrip() },
            ])
          }
        >
          Leave group
        </Button>
      </>
    </Screen>
  );
}
