import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

export type DevicePoint = {
  longitude: number;
  latitude: number;
  accuracy: number | null;
  timestamp: number;
};
export function useDeviceLocation(active: boolean) {
  const [point, setPoint] = useState<DevicePoint | null>(null);
  const [status, setStatus] = useState<
    "idle" | "locating" | "ready" | "denied" | "disabled" | "error"
  >("idle");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const generation = useRef(0);
  const watcher = useRef<Location.LocationSubscription | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    watcher.current?.remove();
    watcher.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
  }, []);
  const start = useCallback(
    async (revision: number) => {
      if (revision !== generation.current) return;
      stop();
      setPoint(null);
      setStatus("locating");
      if (!(await Location.hasServicesEnabledAsync())) {
        if (revision === generation.current) setStatus("disabled");
        return;
      }
      if (revision !== generation.current) return;
      timeout.current = setTimeout(() => {
        if (revision === generation.current) {
          setPoint(null);
          setStatus("error");
        }
      }, 25000);
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5000 },
        (location) => {
          if (revision !== generation.current) return;
          if (timeout.current) clearTimeout(timeout.current);
          const { longitude, latitude, accuracy } = location.coords;
          if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
          setPoint({ longitude, latitude, accuracy, timestamp: location.timestamp });
          setStatus("ready");
        },
        () => {
          if (revision === generation.current) {
            setPoint(null);
            setStatus("error");
          }
        }
      );
      if (revision !== generation.current) subscription.remove();
      else watcher.current = subscription;
    },
    [stop]
  );
  const cancel = useCallback(() => {
    generation.current++;
    stop();
  }, [stop]);
  useEffect(() => {
    const revision = ++generation.current;
    if (active) {
      void Location.getForegroundPermissionsAsync()
        .then((permission) => {
          if (revision !== generation.current) return;
          setCanAskAgain(permission.canAskAgain);
          if (permission.granted) return start(revision);
          setStatus(permission.status === "denied" ? "denied" : "idle");
        })
        .catch(() => {
          if (revision === generation.current) {
            setPoint(null);
            setStatus("error");
          }
        });
    }
    return cancel;
  }, [active, start, cancel]);
  const request = useCallback(async () => {
    if (!active) return;
    const revision = ++generation.current;
    stop();
    setPoint(null);
    setStatus("locating");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (revision !== generation.current) return;
      setCanAskAgain(permission.canAskAgain);
      if (!permission.granted) {
        setStatus("denied");
        return;
      }
      await start(revision);
    } catch {
      if (revision === generation.current) setStatus("error");
    }
  }, [active, start, stop]);
  return { point: active ? point : null, status, canAskAgain, request };
}
