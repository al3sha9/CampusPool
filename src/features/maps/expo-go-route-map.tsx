import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Button, useThemeColor } from "heroui-native";
import { AppIcon } from "@/components/trip-ui";
import { validDestination, type Destination } from "@/lib/destinations";
import type { DevicePoint } from "./use-device-location";
import type { HubId } from "@/lib/trip-demo";
import { MAP_STYLE, mapBounds, mapCatalog, destinationCoordinate } from "./map-catalog";

// A contained MapLibre GL preview for Expo Go; native builds use MapLibre Native.
function mapDocument(hubId: HubId, destination?: Destination, picking = false) {
  const bounds = mapBounds(hubId, destination);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link href="https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.css" rel="stylesheet">
<style>html,body,#map{margin:0;width:100%;height:100%;background:#111114} .pin{font:600 12px system-ui;color:#fafafa;background:#242429;border:2px solid #a8b5ff;padding:8px 12px;border-radius:14px} .hub{border-color:#fafafa} .you{width:18px;height:18px;background:#38bdf8;border:3px solid white;border-radius:50%;box-shadow:0 0 0 7px #38bdf833}.maplibregl-ctrl-attrib{font:10px system-ui}</style></head>
<body><div id="map" role="img" aria-label="Campus pickup, destination and your location map"></div>
<script>function send(type){window.ReactNativeWebView.postMessage(type)};</script>
<script src="https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.js" onerror="send('failed')"></script>
<script>
try {
 const bounds=${JSON.stringify([
   [bounds[0], bounds[1]],
   [bounds[2], bounds[3]],
 ])};
 const map=new maplibregl.Map({container:'map',style:${JSON.stringify(MAP_STYLE)},bounds:bounds,fitBoundsOptions:{padding:55,duration:0},attributionControl:false,pitchWithRotate:false,dragRotate:false});
 map.addControl(new maplibregl.AttributionControl({compact:true}),'top-left');
 const points=[{label:'Pickup',coords:${JSON.stringify(mapCatalog.pickup.coordinate)},className:'pin'},{label:'Drop-off',coords:${JSON.stringify(destinationCoordinate(hubId, destination))},className:'pin hub'}];
 points.filter(p=>p.coords).forEach(p=>{const el=document.createElement('div');el.className=p.className;el.textContent=p.label;new maplibregl.Marker({element:el}).setLngLat(p.coords).addTo(map)});
 let userMarker=null;
 window.updateUserPosition=(p,center)=>{
   if(!p){userMarker?.remove();userMarker=null;return;}
   if(!userMarker){const el=document.createElement('div');el.className='you';el.setAttribute('aria-label','Your location');userMarker=new maplibregl.Marker({element:el}).setLngLat([p.longitude,p.latitude]).addTo(map);}
   else userMarker.setLngLat([p.longitude,p.latitude]);
   if(center)map.jumpTo({center:[p.longitude,p.latitude],zoom:16});
 };
 window.fitTrip=()=>map.fitBounds(bounds,{padding:55,duration:0});
 map.on('click',e=>{if(${picking})send(JSON.stringify({type:'pick',longitude:e.lngLat.lng,latitude:e.lngLat.lat}))});
 map.once('idle',()=>send('ready'));
} catch(e) {send('failed')}
</script></body></html>`;
}
export default function ExpoGoRouteMap({
  hubId,
  onFailure,
  location,
  locateSignal,
  destination,
  onPickDestination,
}: {
  hubId: HubId;
  location: DevicePoint | null;
  locateSignal: number;
  destination?: Destination;
  onPickDestination?: (longitude: number, latitude: number) => void;
  onFailure: () => void;
}) {
  const picking = !!onPickDestination;
  const source = useMemo(
    () => ({
      html: mapDocument(hubId, destination, picking),
      baseUrl: "https://tiles.openfreemap.org/",
    }),
    [hubId, destination, picking]
  );
  const centered = useRef(false);
  const lastLocate = useRef(locateSignal);
  const web = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");
  useEffect(() => {
    if (loaded) return;
    const timeout = setTimeout(onFailure, 25000);
    return () => clearTimeout(timeout);
  }, [loaded, onFailure]);
  useEffect(() => {
    if (!loaded) return;
    const center =
      !!location &&
      ((!centered.current && !onPickDestination) || lastLocate.current !== locateSignal);
    if (location) {
      centered.current = true;
      lastLocate.current = locateSignal;
    }
    web.current?.injectJavaScript(
      `window.updateUserPosition?.(${JSON.stringify(location)},${center}); true;`
    );
  }, [loaded, location, locateSignal, onPickDestination]);
  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={web}
        source={source}
        style={{ flex: 1, backgroundColor: background }}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        onError={onFailure}
        onHttpError={onFailure}
        onMessage={({ nativeEvent }) => {
          if (nativeEvent.data === "ready") setLoaded(true);
          if (nativeEvent.data === "failed") onFailure();
          if (onPickDestination && nativeEvent.data.startsWith("{")) {
            try {
              const point = JSON.parse(nativeEvent.data);
              if (point.type === "pick" && validDestination(point))
                onPickDestination(point.longitude, point.latitude);
            } catch {
              /* Ignore unrelated or malformed map events. */
            }
          }
        }}
        onShouldStartLoadWithRequest={({ url }) => {
          if (url === "about:blank" || url === "https://tiles.openfreemap.org/") return true;
          try {
            const host = new URL(url).hostname;
            if (
              [
                "openfreemap.org",
                "www.openmaptiles.org",
                "openmaptiles.org",
                "www.openstreetmap.org",
                "openstreetmap.org",
              ].includes(host) &&
              url.startsWith("https://")
            )
              void Linking.openURL(url);
          } catch {
            /* Ignore unrelated navigation. */
          }
          return false;
        }}
      />
      {!loaded && (
        <View pointerEvents="none" style={[styles.loading, { backgroundColor: background }]}>
          <Text style={{ color: foreground }}>Loading map…</Text>
        </View>
      )}
      <Button
        size="sm"
        variant="secondary"
        isIconOnly
        accessibilityLabel="Show both locations"
        style={styles.recenter}
        onPress={() => web.current?.injectJavaScript("window.fitTrip?.(); true;")}
      >
        <AppIcon name="location" tone="foreground" size={20} />
      </Button>
    </View>
  );
}
const styles = StyleSheet.create({
  loading: { position: "absolute", top: 12, right: 12, borderRadius: 12, padding: 10 },
  recenter: { position: "absolute", bottom: 12, right: 12, minWidth: 48, minHeight: 48 },
});
