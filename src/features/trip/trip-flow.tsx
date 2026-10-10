import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Text, View, useWindowDimensions } from "react-native";
import {
  Button,
  Card,
  Chip,
  Description,
  FieldError,
  Input,
  Label,
  TextField,
} from "heroui-native";
import QRCode from "react-native-qrcode-svg";
import { AppIcon, Choices, Detail, Disclosure, Notice, Screen } from "@/components/trip-ui";
import {
  currentConsent,
  demoTrips,
  fareShares,
  destinationName,
  requestDestination,
  parseFare,
  readyToStart,
  splitFare,
  tripTime,
  withinBudgets,
  type Group,
} from "@/lib/trip-demo";
import { pickupDemo } from "@/lib/pickup-runtime";
import { RouteMap } from "@/features/maps/route-map";
import { PickupCamera } from "./pickup-camera";

type Change = (operation: () => Promise<Group>, message: string) => Promise<boolean>;
type Props = {
  preview?: boolean;
  trips?: Pick<
    typeof demoTrips,
    "leave" | "cancel" | "complete" | "setQuote" | "confirm" | "start" | "markOwnArrival"
  >;
  pickup?: Pick<typeof pickupDemo, "issue" | "verify">;
  group: Group;
  viewerId: string;
  onViewerChange: (id: string) => void;
  onChange: Change;
  pending: boolean;
  error: string;
  message: string;
  onReset: () => void;
};

function RouteCard({ group }: { group: Group }) {
  return (
    <View style={{ gap: 20 }}>
      <RouteMap hubId={group.request.hubId} destination={requestDestination(group.request)} />
      <Card>
        <Card.Body style={{ gap: 20 }}>
          <Detail icon="location" label="Campus pickup" value="BIIT campus" />
          <Detail icon="flag" label="Destination" value={destinationName(group.request)} />
          <Detail
            icon="clock"
            label="Departure window"
            value={`${tripTime(group.request.earliestAt)}–${tripTime(group.request.latestAt)} PKT`}
          />
        </Card.Body>
      </Card>
    </View>
  );
}
function MemberList({
  group,
  viewerId,
  arrivals = false,
  summary = false,
}: {
  group: Group;
  viewerId: string;
  arrivals?: boolean;
  summary?: boolean;
}) {
  const shares = group.members.length ? fareShares(group) : [];
  return (
    <View style={{ gap: 12 }}>
      <View className="flex-row items-center gap-2">
        <AppIcon name="users" />
        <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
          {arrivals ? "At the pickup" : "Your group"}
        </Text>
      </View>
      {group.members.map((m, i) => (
        <Card key={m.id} variant="secondary">
          <Card.Body style={{ gap: 8 }}>
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Card.Title>
                {m.name}
                {m.id === viewerId ? " (you)" : ""}
              </Card.Title>
              {!summary && (
                <Chip
                  size="sm"
                  variant="soft"
                  color={
                    (arrivals ? !!m.pickupConfirmedAt : m.confirmedVersion === group.version)
                      ? "success"
                      : "default"
                  }
                >
                  {arrivals
                    ? m.pickupConfirmedAt
                      ? "Arrived"
                      : "Not arrived"
                    : m.confirmedVersion === group.version
                      ? "Confirmed"
                      : "Review fare"}
                </Chip>
              )}
            </View>
            <Card.Description>
              Campus unverified{m.id === group.organiserId ? " · Organiser" : ""} · PKR {shares[i]}
            </Card.Description>
          </Card.Body>
        </Card>
      ))}
    </View>
  );
}
function DemoViewer({
  group,
  viewerId,
  onChange,
  disabled,
}: {
  group: Group;
  viewerId: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <Disclosure title="Demo controls" icon="settings">
      <Text className="text-sm leading-6 text-muted">
        Preview each role on this device. There is no shared state between devices yet.
      </Text>
      <View pointerEvents={disabled ? "none" : "auto"}>
        <Choices
          label="View as"
          icon="user"
          value={viewerId}
          choices={group.members.map((m) => ({
            value: m.id,
            label: `${m.name}${m.id === group.organiserId ? " · organiser" : ""}`,
          }))}
          onChange={onChange}
        />
      </View>
    </Disclosure>
  );
}
function FareCard({ group, viewerId }: { group: Group; viewerId: string }) {
  const index = group.members.findIndex((m) => m.id === viewerId);
  const share = index >= 0 ? fareShares(group)[index] : null;
  return (
    <Card>
      <Card.Body style={{ gap: 12 }}>
        <View className="flex-row items-center gap-2">
          <AppIcon name="wallet" />
          <Card.Description>
            {group.members[index]?.confirmedVersion === group.version
              ? "Your confirmed share"
              : "Your share to review"}
          </Card.Description>
        </View>
        <Text className="text-3xl font-semibold text-foreground">
          {share === null ? "—" : `PKR ${share}`}
        </Text>
        <Card.Description>
          PKR {group.total} total · {group.members.length} passengers
        </Card.Description>
        <Card.Description>
          {["demo_estimate", "initial_estimate"].includes(group.quotes.at(-1)?.source ?? "")
            ? "Starting estimate"
            : "Manually entered fare"}{" "}
          · car fare only · settlement is external
        </Card.Description>
      </Card.Body>
    </Card>
  );
}
export function TripFlow({
  preview = true,
  trips = demoTrips,
  pickup = pickupDemo,
  group,
  viewerId,
  onViewerChange,
  onChange,
  pending,
  error,
  message,
  onReset,
}: Props) {
  const [page, setPage] = useState<"booking" | "pickup">("booking");
  const [quoteInput, setQuoteInput] = useState(String(group.total));
  const [quoteError, setQuoteError] = useState("");
  const [finalInput, setFinalInput] = useState("");
  const [finalError, setFinalError] = useState("");
  const [scanner, setScanner] = useState(false);
  const [qr, setQr] = useState<{
    value: string;
    expiresAt: number;
    memberId: string;
    version: number;
  } | null>(null);
  const [qrError, setQrError] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const generation = useRef(0);
  const issueBusy = useRef(false);
  const { width } = useWindowDimensions();
  const actor = group.members.find((m) => m.id === viewerId);
  const isOrganiser = group.organiserId === viewerId;
  const consent = currentConsent(group);
  const confirmed = actor?.confirmedVersion === group.version;
  const budgets = withinBudgets(group);
  const qrSize = Math.max(120, Math.min(240, width - 112));
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function navigate(next: "booking" | "pickup") {
    generation.current++;
    setQr(null);
    setQrError("");
    setScanner(false);
    setIssuing(false);
    issueBusy.current = false;
    setPage(next);
  }
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const active = next === "active";
      setAppActive(active);
      if (!active) {
        generation.current++;
        setQr(null);
        setScanner(false);
        setIssuing(false);
        issueBusy.current = false;
      }
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!qr) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [qr]);

  async function showQr() {
    if (issueBusy.current || pending) return;
    issueBusy.current = true;
    setIssuing(true);
    setQrError("");
    setQr(null);
    const attempt = ++generation.current;
    try {
      const result = await pickup.issue(group, viewerId);
      if (alive.current && attempt === generation.current) {
        setNow(Date.now());
        setQr({ ...result, memberId: viewerId, version: group.version });
      }
    } catch (e) {
      if (alive.current && attempt === generation.current)
        setQrError(e instanceof Error ? e.message : "QR unavailable. Try again.");
    } finally {
      if (alive.current && attempt === generation.current) {
        setIssuing(false);
        issueBusy.current = false;
      }
    }
  }
  const feedback = (
    <>
      {error && <Notice danger>{error}</Notice>}
      {message && <Notice key={message}>{message}</Notice>}
    </>
  );
  const viewer = preview ? (
    <DemoViewer
      group={group}
      viewerId={viewerId}
      onChange={onViewerChange}
      disabled={pending || issuing}
    />
  ) : null;
  const leave = (
    <Button
      variant="danger-soft"
      isDisabled={pending}
      onPress={() =>
        Alert.alert(
          "Leave this group?",
          "The remaining group must review its fare again. No replacement is added after lock.",
          [
            { text: "Stay", style: "cancel" },
            {
              text: "Leave group",
              style: "destructive",
              onPress: () =>
                onChange(
                  () => trips.leave(group, viewerId),
                  "Member left. Review the updated share."
                ),
            },
          ]
        )
      }
    >
      Leave group
    </Button>
  );
  const cancel = (
    <Button
      variant="danger-soft"
      isDisabled={pending}
      onPress={() =>
        Alert.alert("Cancel the trip?", "Choose why the organiser is cancelling.", [
          { text: "Keep trip", style: "cancel" },
          {
            text: "Booking unavailable",
            onPress: () =>
              onChange(
                () => trips.cancel(group, viewerId, "External booking unavailable."),
                "Trip cancelled."
              ),
          },
          {
            text: "Plans changed",
            style: "destructive",
            onPress: () =>
              onChange(
                () => trips.cancel(group, viewerId, "Travel plans changed."),
                "Trip cancelled."
              ),
          },
        ])
      }
    >
      Cancel trip
    </Button>
  );

  if (group.status === "completed" || group.status === "cancelled") {
    const completed = group.status === "completed";
    const shares = group.members.length ? fareShares(group) : [];
    const index = group.members.findIndex((m) => m.id === viewerId);
    // Comparison uses the immutable original estimate at the group level.
    const difference = group.total - group.initialTotal;
    const estimateShare =
      index >= 0 ? splitFare(group.initialTotal, group.members.length)[index] : 0;
    const shareDifference = index >= 0 ? shares[index] - estimateShare : 0;
    return (
      <Screen
        showChat={!preview}
        key={group.status}
        title={completed ? "Journey complete" : "Trip cancelled"}
        subtitle={
          completed
            ? "Here’s the split for your shared ride."
            : (group.cancellationReason ?? "This group is no longer travelling.")
        }
        action={
          <Button size="lg" onPress={onReset}>
            Find another group
          </Button>
        }
      >
        <View className="flex-row items-center gap-3">
          <AppIcon
            name={completed ? "check" : "info"}
            tone={completed ? "success" : "muted"}
            size={32}
          />
          <Chip variant="soft" color={completed ? "success" : "default"}>
            {completed ? "Completed" : "Cancelled"}
          </Chip>
        </View>
        {completed ? (
          <>
            <Card>
              <Card.Body style={{ gap: 12 }}>
                <Card.Description>Your final share</Card.Description>
                <Text className="text-3xl font-semibold text-foreground">
                  {index >= 0 ? `PKR ${shares[index]}` : "—"}
                </Text>
                <Card.Description>
                  {shareDifference === 0
                    ? "Your share matches the demo estimate."
                    : `Your share ${shareDifference > 0 ? "increased" : "decreased"} by PKR ${Math.abs(shareDifference)} from the estimate for this passenger count.`}
                </Card.Description>
                <Card.Description>
                  PKR {group.total} final total ·{" "}
                  {group.quotes.at(-1)?.source === "final_total"
                    ? "Final fare entered by organiser"
                    : "Accepted fare retained"}
                </Card.Description>
                <Card.Description>
                  {difference === 0
                    ? "Total matches the original demo estimate."
                    : `Total ${difference > 0 ? "increased" : "decreased"} by PKR ${Math.abs(difference)} from the original demo estimate.`}
                </Card.Description>
              </Card.Body>
            </Card>
            <MemberList group={group} viewerId={viewerId} summary />
            <Notice>Settlement happens directly between students. Payment is unverified.</Notice>
            <Disclosure title="Fare history">
              {group.quotes.map((q, i) => (
                <Text key={i} className="text-sm text-muted">
                  PKR {q.total} · {q.source.replaceAll("_", " ")} · {tripTime(q.createdAt)} PKT
                </Text>
              ))}
            </Disclosure>
          </>
        ) : (
          <Notice>No payment or provider cancellation is handled by CampusPool.</Notice>
        )}
        <RouteCard group={group} />
        {feedback}
        {group.members.length > 0 && viewer}
      </Screen>
    );
  }
  if (group.status === "in_progress")
    return (
      <Screen
        showChat={!preview}
        key="journey"
        title="On your way"
        subtitle={destinationName(group.request)}
      >
        <Chip className="self-start" variant="soft" color="success">
          Journey in progress
        </Chip>
        <RouteCard group={group} />
        <FareCard group={group} viewerId={viewerId} />
        {isOrganiser ? (
          <Card>
            <Card.Body style={{ gap: 20 }}>
              <Card.Title>End your journey</Card.Title>
              <TextField isInvalid={!!finalError}>
                <Label>Final total (PKR) · optional</Label>
                <Input
                  accessibilityLabel="Optional final fare in PKR"
                  keyboardType="number-pad"
                  value={finalInput}
                  onChangeText={(v) => {
                    setFinalInput(v);
                    setFinalError("");
                  }}
                  placeholder={String(group.total)}
                />
                <Description>Leave blank to retain PKR {group.total}.</Description>
                <FieldError>{finalError}</FieldError>
              </TextField>
              <Button
                isDisabled={pending}
                onPress={() => {
                  let total: number | undefined;
                  try {
                    total = finalInput.trim() ? parseFare(finalInput) : undefined;
                  } catch (e) {
                    setFinalError((e as Error).message);
                    return;
                  }
                  void onChange(() => trips.complete(group, viewerId, total), "Ride complete.");
                }}
              >
                {pending ? "Updating…" : "End journey"}
              </Button>
            </Card.Body>
          </Card>
        ) : (
          <Notice>Your organiser will end the journey.</Notice>
        )}
        {feedback}
        {viewer}
        {isOrganiser && cancel}
      </Screen>
    );

  if (page === "booking")
    return (
      <Screen
        showChat={!preview}
        key="booking"
        title="Ready for booking"
        subtitle="One organiser. One external booking."
        action={
          <Button size="lg" isDisabled={pending || !consent} onPress={() => navigate("pickup")}>
            Continue to pickup
          </Button>
        }
      >
        <Chip className="self-start" variant="soft" color="success">
          Group locked · {group.members.length} passengers
        </Chip>
        <RouteCard group={group} />
        <FareCard group={group} viewerId={viewerId} />
        <Notice>
          {group.members.find((m) => m.id === group.organiserId)?.name} books externally for{" "}
          {group.members.length} passengers. Recording a quote does not book a vehicle.
        </Notice>
        {isOrganiser && (
          <Card>
            <Card.Body style={{ gap: 20 }}>
              <Card.Title>External quote</Card.Title>
              <TextField isRequired isInvalid={!!quoteError}>
                <Label>Quoted total (PKR)</Label>
                <Input
                  accessibilityLabel="External quoted fare in PKR"
                  keyboardType="number-pad"
                  value={quoteInput}
                  onChangeText={(v) => {
                    setQuoteInput(v);
                    setQuoteError("");
                  }}
                />
                <FieldError>{quoteError}</FieldError>
              </TextField>
              <Button
                variant="secondary"
                isDisabled={pending}
                onPress={() => {
                  let total: number;
                  try {
                    total = parseFare(quoteInput);
                  } catch (e) {
                    setQuoteError((e as Error).message);
                    return;
                  }
                  void onChange(
                    () => trips.setQuote(group, total, viewerId),
                    total === group.total
                      ? "External quote recorded."
                      : "Quote changed. Confirm the new share before pickup."
                  );
                }}
              >
                Record quote
              </Button>
            </Card.Body>
          </Card>
        )}
        {!budgets && (
          <Notice danger>
            The new fare exceeds a member’s budget. The organiser can revise the quote, or you can
            leave.
          </Notice>
        )}
        {!confirmed && (
          <Button
            isDisabled={pending || !budgets}
            onPress={() =>
              onChange(() => trips.confirm(group, viewerId), "Your current share is confirmed.")
            }
          >
            Confirm my share
          </Button>
        )}
        <MemberList group={group} viewerId={viewerId} />
        {feedback}
        {viewer}
        {leave}
        {isOrganiser && cancel}
      </Screen>
    );

  const remaining = qr ? Math.max(0, Math.ceil((qr.expiresAt - now) / 1000)) : 0;
  return (
    <Screen
      showChat={!preview}
      key="pickup"
      title="Meet at the pickup"
      subtitle="BIIT campus · agree on the gate with your group"
      onBack={pending ? undefined : () => navigate("booking")}
      action={
        isOrganiser ? (
          <Button
            size="lg"
            isDisabled={pending || !readyToStart(group)}
            onPress={() => onChange(() => trips.start(group, viewerId), "Journey started.")}
          >
            Start journey
          </Button>
        ) : undefined
      }
    >
      <Chip className="self-start" variant="soft">
        {preview ? "Local demo verification" : "Account-based demo verification"}
      </Chip>
      {!consent && (
        <Notice danger>Fare changed. Return to booking and reconfirm before pickup.</Notice>
      )}
      {isOrganiser ? (
        <>
          {!actor?.pickupConfirmedAt && (
            <Button
              variant="secondary"
              isDisabled={pending || !consent}
              onPress={() =>
                onChange(() => trips.markOwnArrival(group, viewerId), "Your arrival is recorded.")
              }
            >
              I’m at the pickup
            </Button>
          )}
          {scanner && appActive && consent ? (
            <PickupCamera
              preview={preview}
              onClose={() => setScanner(false)}
              onScan={(value) =>
                onChange(
                  () => pickup.verify(group, viewerId, value),
                  preview
                    ? "Passenger pickup confirmed in this local demo."
                    : "Passenger pickup confirmed."
                )
              }
            />
          ) : (
            <Button isDisabled={pending || !consent} onPress={() => setScanner(true)}>
              Scan passenger QR
            </Button>
          )}
        </>
      ) : actor?.pickupConfirmedAt ? (
        <Notice>
          Connected with {group.members.find((m) => m.id === group.organiserId)?.name}, your group
          organiser.{" "}
          {preview
            ? "Local demo confirmation only."
            : "Shared demo confirmation; campus affiliation unverified."}
        </Notice>
      ) : (
        <Card>
          <Card.Body style={{ gap: 16 }}>
            <Card.Title>
              Show {group.members.find((m) => m.id === group.organiserId)?.name} your QR
            </Card.Title>
            {qr &&
            qr.memberId === viewerId &&
            qr.version === group.version &&
            remaining > 0 &&
            appActive ? (
              <View className="items-center" style={{ gap: 12 }}>
                <View style={{ backgroundColor: "white", padding: 16, borderRadius: 16 }}>
                  <QRCode
                    value={qr.value}
                    size={qrSize}
                    quietZone={12}
                    color="black"
                    backgroundColor="white"
                    ecl="M"
                  />
                </View>
                <Text accessibilityLiveRegion="none" className="text-sm text-muted">
                  Expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
                </Text>
              </View>
            ) : (
              <Card.Description>
                {qr
                  ? "QR expired. Generate a new code."
                  : "A personal, short-lived QR for this matched group."}
              </Card.Description>
            )}
            <Button isDisabled={pending || issuing || !consent || !appActive} onPress={showQr}>
              {issuing ? "Generating…" : qr ? "Generate new QR" : "Show my pickup QR"}
            </Button>
            {qrError && <Notice danger>{qrError}</Notice>}
          </Card.Body>
        </Card>
      )}
      <MemberList group={group} viewerId={viewerId} arrivals />
      <Notice>This checks demo group membership, not identity or personal safety.</Notice>
      {feedback}
      {viewer}
      {leave}
      {isOrganiser && cancel}
    </Screen>
  );
}
