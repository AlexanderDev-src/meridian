import type { Airport, LatLon } from "./api";

// Wall-clock ms: the monotonic clock can stop while the machine sleeps.
export type FlightClock = {
  startedAt: number;
  segmentStart: number;
  accumulatedMs: number;
  paused: boolean;
  totalMs: number;
};

export const startClock = (now: number, totalMs: number): FlightClock => ({
  startedAt: now,
  segmentStart: now,
  accumulatedMs: 0,
  paused: false,
  totalMs,
});

export const elapsedMs = (c: FlightClock, now: number): number => {
  const running = c.paused ? 0 : Math.max(0, now - c.segmentStart);
  return Math.min(c.totalMs, c.accumulatedMs + running);
};

export const pauseClock = (c: FlightClock, now: number): FlightClock =>
  c.paused ? c : { ...c, accumulatedMs: elapsedMs(c, now), paused: true };

export const resumeClock = (c: FlightClock, now: number): FlightClock =>
  c.paused ? { ...c, segmentStart: now, paused: false } : c;

export const landingTime = (c: FlightClock, now: number): number =>
  c.paused ? now : Math.min(now, c.segmentStart + c.totalMs - c.accumulatedMs);

export type SavedFlight = { origin: Airport; dest: Airport; minutes: number; clock: FlightClock };

// Saved as paused: time with the app closed must not count as focus.
export const encodeFlight = (flight: SavedFlight, now: number): string =>
  JSON.stringify({ ...flight, clock: pauseClock(flight.clock, now) });

export const decodeFlight = (raw: string | null): SavedFlight | null => {
  if (!raw) return null;
  try {
    const f = JSON.parse(raw) as SavedFlight;
    const validClock =
      f.clock?.paused === true &&
      Number.isFinite(f.clock.startedAt) &&
      Number.isFinite(f.clock.segmentStart) &&
      f.clock.totalMs > 0 &&
      f.clock.accumulatedMs >= 0 &&
      f.clock.accumulatedMs <= f.clock.totalMs;
    return validClock && f.minutes > 0 && f.origin?.iata && f.dest?.iata ? f : null;
  } catch {
    return null;
  }
};

export const positionAt = (points: LatLon[], fraction: number): LatLon => {
  const scaled = Math.min(1, Math.max(0, fraction)) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const t = scaled - index;
  const [a, b] = [points[index], points[index + 1]];
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
};

export const arcHeight = (distanceKm: number): number =>
  Math.min(0.2, (distanceKm / 6371) * 0.18) + 0.012;

export const altitudeAt = (fraction: number, height: number): number =>
  Math.sin(Math.PI * fraction) * height;

export const wrapLongitude = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;

export const formatMinutes = (minutes: number): string => {
  const total = Math.round(minutes);
  const [h, m] = [Math.floor(total / 60), total % 60];
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

export const formatClock = (ms: number): string => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
};

export const flightNumber = (origin: string, dest: string): string => {
  const hash = [...(origin + dest)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7);
  return `MR ${100 + (hash % 900)}`;
};

export const statusLabel = (fraction: number, paused: boolean): string =>
  paused ? "HOLDING" : fraction < 0.08 ? "CLIMBING" : fraction > 0.9 ? "DESCENDING" : "CRUISING";

export const altitudeFeet = (fraction: number): number => {
  const feet =
    fraction < 0.08 ? (fraction / 0.08) * 38000 : fraction > 0.9 ? ((1 - fraction) / 0.1) * 38000 : 38000;
  return Math.round(feet / 100) * 100;
};
