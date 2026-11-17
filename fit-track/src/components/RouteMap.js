// Phone version: a real map (Apple Maps on iPhone, Google Maps on Android).
// The web build uses RouteMap.web.js instead, because react-native-maps doesn't run on web.
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { regionForPoints } from '../geo';
import { useTheme } from '../ui';

const CLOSE_DELTA = 0.004; // roughly a few streets across

// segments: [[{ latitude, longitude }, ...], ...]  (one per stretch between pauses)
// current:  where you are now (live mode), or null
// live:     true while tracking or waiting to start (map follows you)
export default function RouteMap({ segments, current, live, height = 300 }) {
  const { c, scheme } = useTheme();
  const ref = useRef(null);
  const all = useMemo(() => segments.flat(), [segments]);

  const initialRegion = useMemo(() => {
    if (!live) return regionForPoints(all);
    if (current) return { ...pick(current), latitudeDelta: CLOSE_DELTA, longitudeDelta: CLOSE_DELTA };
    return undefined;
    // Only used for the first render; later moves are animated below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live mode: keep the map centred on you
  useEffect(() => {
    if (live && current && ref.current) {
      ref.current.animateToRegion(
        { ...pick(current), latitudeDelta: CLOSE_DELTA, longitudeDelta: CLOSE_DELTA },
        500
      );
    }
  }, [live, current?.latitude, current?.longitude]);

  // Past walk: fit the whole route on screen
  useEffect(() => {
    if (!live && all.length > 1 && ref.current) {
      ref.current.fitToCoordinates(all, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: false,
      });
    }
  }, [live, all]);

  return (
    <View style={[s.wrap, { height, backgroundColor: c.card2 }]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation={live}
        showsMyLocationButton={live}
        toolbarEnabled={false}
        userInterfaceStyle={scheme}
      >
        {segments.map((seg, i) =>
          seg.length > 1 ? (
            <Polyline key={i} coordinates={seg.map(pick)} strokeColor={c.primary} strokeWidth={6} lineCap="round" lineJoin="round" />
          ) : null
        )}
        {!live && all.length ? (
          <>
            <Marker coordinate={pick(all[0])} pinColor="green" title="Start" />
            <Marker coordinate={pick(all[all.length - 1])} pinColor="red" title="Finish" />
          </>
        ) : null}
      </MapView>
    </View>
  );
}

const pick = (p) => ({ latitude: p.latitude, longitude: p.longitude });

const s = StyleSheet.create({
  wrap: { borderRadius: 24, overflow: 'hidden' },
});
