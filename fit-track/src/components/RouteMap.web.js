// Web version (for testing on a computer): react-native-maps doesn't run in a browser,
// so this draws the route as a simple line without map tiles. The phone shows a real map.
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../ui';

export default function RouteMap({ segments, current, live, height = 300 }) {
  const { c } = useTheme();
  const all = useMemo(() => {
    const pts = segments.flat();
    return live && current ? [...pts, current] : pts;
  }, [segments, current, live]);

  const W = 340;
  const H = height;
  const pad = 24;

  // Project lat/lon onto the box, keeping the shape (1° lon is shorter than 1° lat away from the equator)
  const project = useMemo(() => {
    if (!all.length) return null;
    const lat0 = all[0].latitude;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const xs = all.map((p) => p.longitude * k);
    const ys = all.map((p) => p.latitude);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY, 0.0005);
    const scale = Math.min(W - pad * 2, H - pad * 2) / span;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    return (p) => [W / 2 + (p.longitude * k - cx) * scale, H / 2 - (p.latitude - cy) * scale];
  }, [all, H]);

  const start = segments.flat()[0];
  const end = live ? current : segments.flat().at(-1);

  return (
    <View style={{ height, borderRadius: 24, overflow: 'hidden', backgroundColor: c.card2 }} testID="route-map">
      {project ? (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          {segments.map((seg, i) =>
            seg.length > 1 ? (
              <polyline
                key={i}
                points={seg.map((p) => project(p).join(',')).join(' ')}
                fill="none"
                stroke={c.primary}
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null
          )}
          {start ? <circle cx={project(start)[0]} cy={project(start)[1]} r="7" fill={c.success} stroke={c.card} strokeWidth="2" /> : null}
          {end ? (
            <circle cx={project(end)[0]} cy={project(end)[1]} r={live ? 8 : 7} fill={live ? c.info : c.danger} stroke={c.card} strokeWidth="2" />
          ) : null}
        </svg>
      ) : null}
      <Text style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: c.muted }}>
        {all.length ? 'Route preview (your phone shows the full map)' : 'Waiting for your location…'}
      </Text>
    </View>
  );
}
