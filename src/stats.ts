import type { Airport, Session } from "./api";

export const DEFAULT_TAGS = ["Study", "Coding", "Reading", "Exam prep", "Writing", "Work"];
export const MAX_TAG_LENGTH = 18;
export const UNTAGGED = "Untagged";
const TAG_COLORS = ["#D4B47C", "#8DB4FF", "#7FD1AE", "#E58FB0", "#B79CFF", "#FF9F6B", "#9FD8E8", "#E8E07A"];
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const parseTags = (raw: string | null): string[] => {
  try {
    const tags = JSON.parse(raw ?? "null") as unknown;
    if (!Array.isArray(tags)) return DEFAULT_TAGS;
    const valid = tags.filter((t): t is string => typeof t === "string" && t.trim() !== "" && t.length <= MAX_TAG_LENGTH);
    return valid.length ? [...new Set(valid)] : DEFAULT_TAGS;
  } catch {
    return DEFAULT_TAGS;
  }
};

export const tagColor = (name: string, tags: string[]) => {
  const index = tags.indexOf(name);
  const slot = index >= 0 ? index : [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 0);
  return TAG_COLORS[slot % TAG_COLORS.length];
};

const minutesOf = (s: Session) => s.focused_ms / 60000;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
// Calendar arithmetic, so a daylight-saving day cannot skip or repeat a date.
const daysBefore = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - days);

export function flightStats(sessions: Session[], places: Map<string, Airport>, now: Date) {
  const byDay = new Map<string, number>();
  const byTag = new Map<string, number>();
  for (const s of sessions) {
    const key = dayKey(new Date(s.ended_at_ms));
    byDay.set(key, (byDay.get(key) ?? 0) + minutesOf(s));
    const tag = s.tag ?? UNTAGGED;
    byTag.set(tag, (byTag.get(tag) ?? 0) + minutesOf(s));
  }

  let streak = 0;
  let cursor = byDay.get(dayKey(now)) ? now : daysBefore(now, 1);
  while (byDay.get(dayKey(cursor))) {
    streak += 1;
    cursor = daysBefore(cursor, 1);
  }

  const week = [6, 5, 4, 3, 2, 1, 0].map((back) => {
    const day = daysBefore(now, back);
    return { label: back === 0 ? "TODAY" : DAY_NAMES[day.getDay()], minutes: byDay.get(dayKey(day)) ?? 0, today: back === 0 };
  });

  const totalMinutes = sessions.reduce((sum, s) => sum + minutesOf(s), 0);
  const landed = sessions.filter((s) => s.status === "completed");
  const longest = sessions.reduce<Session | null>((best, s) => (!best || s.focused_ms > best.focused_ms ? s : best), null);

  return {
    totalMinutes,
    flights: sessions.length,
    landed: landed.length,
    diverted: sessions.length - landed.length,
    km: sessions.reduce((sum, s) => sum + s.distance_km, 0),
    longest: longest && { minutes: minutesOf(longest), route: `${longest.origin_iata} → ${longest.dest_iata}` },
    streak,
    cities: new Set(landed.map((s) => s.dest_iata)).size,
    countries: new Set(landed.flatMap((s) => places.get(s.dest_iata)?.country ?? [])).size,
    week,
    weekMinutes: week.reduce((sum, d) => sum + d.minutes, 0),
    byTag: [...byTag]
      .sort((a, b) => b[1] - a[1])
      .map(([name, minutes]) => ({ name, minutes, percent: Math.round((minutes / Math.max(totalMinutes, 1 / 60000)) * 100) })),
  };
}

export type FlightStats = ReturnType<typeof flightStats>;
