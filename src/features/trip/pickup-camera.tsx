import { useEffect, useRef, useState } from "react";
import { Linking, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button } from "heroui-native";
import { AppIcon, Notice } from "@/components/trip-ui";

export function PickupCamera({
  onScan,
  onClose,
  preview = true,
}: {
  preview?: boolean;
  onScan: (value: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraError, setCameraError] = useState("");
  const [scanState, setScanState] = useState<"ready" | "verifying" | "failed" | "accepted">(
    "ready"
  );
  const [requesting, setRequesting] = useState(false);
  const scanBusy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Close/unmount ends the capture session; late callbacks cannot reopen it.
  const onBarcode = async ({ data }: { data: string }) => {
    if (scanBusy.current || scanState !== "ready") return;
    scanBusy.current = true;
    setScanState("verifying");
    const accepted = await onScan(data);
    if (mounted.current) setScanState(accepted ? "accepted" : "failed");
  };
  if (!permission) return <Notice>Loading camera permission…</Notice>;
  if (!permission.granted)
    return (
      <View style={{ gap: 16 }}>
        <Notice>Allow camera access to scan a passenger’s pickup QR.</Notice>
        <Button
          isDisabled={requesting}
          onPress={async () => {
            setRequesting(true);
            try {
              if (permission.canAskAgain) await requestPermission();
              else await Linking.openSettings();
            } catch {
              setCameraError("Could not open camera permissions. Try again.");
            } finally {
              setRequesting(false);
            }
          }}
        >
          {requesting ? "Please wait…" : permission.canAskAgain ? "Allow camera" : "Open settings"}
        </Button>
        {cameraError && <Notice danger>{cameraError}</Notice>}
        <Button variant="ghost" onPress={onClose}>
          Close scanner
        </Button>
      </View>
    );
  return (
    <View style={{ gap: 16 }}>
      {!cameraError ? (
        <View style={{ height: 300, overflow: "hidden", borderRadius: 24 }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={scanState === "ready" ? onBarcode : undefined}
            onMountError={() =>
              setCameraError("Camera unavailable. Close the scanner and try again.")
            }
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              inset: 48,
              borderWidth: 2,
              borderColor: "white",
              borderRadius: 16,
            }}
          />
        </View>
      ) : (
        <Notice danger>{cameraError}</Notice>
      )}
      <View className="flex-row items-center gap-3">
        <AppIcon
          name={scanState === "accepted" ? "check" : "info"}
          tone={scanState === "accepted" ? "success" : "muted"}
        />
        <Text accessibilityLiveRegion="polite" className="text-sm text-muted flex-1">
          {scanState === "verifying"
            ? preview
              ? "Checking local demo token…"
              : "Checking pickup token…"
            : scanState === "failed"
              ? "Not confirmed. Review the error and retry."
              : scanState === "accepted"
                ? preview
                  ? "Pickup confirmed in this local demo."
                  : "Passenger pickup confirmed."
                : "Align a passenger QR inside the frame."}
        </Text>
      </View>
      {scanState === "failed" && (
        <Button
          variant="secondary"
          onPress={() => {
            scanBusy.current = false;
            setScanState("ready");
          }}
        >
          Scan again
        </Button>
      )}
      <Button variant="ghost" isDisabled={scanState === "verifying"} onPress={onClose}>
        Close scanner
      </Button>
    </View>
  );
}
