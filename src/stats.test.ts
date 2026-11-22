import { expect, test } from "bun:test";
import type { Airport, Session } from "./api";
import { DEFAULT_TAGS, flightStats, parseTags } from "./stats";

const now = new Date(2026, 10, 22, 12);
const session = (daysAgo: number, minutes: number, patch: Partial<Session> = {}): Session => {
  const ended = new Date(2026, 10, 22 - daysAgo, 10).getTime();
  return {
    origin_iata: "BKK",
    dest_iata: "NRT",
    distance_km: 100,
    planned_minutes: minutes,
    focused_ms: minutes * 60000,
    started_at_ms: ended - minutes * 60000,
    ended_at_ms: ended,
    status: "completed",
    tag: "Study",
    ...patch,
  };
};

test("stats total time, status, tags, places and the longest flight", () => {
  const places = new Map([["NRT", { country: "JP" } as Airport]]);
  const stats = flightStats([session(0, 30), session(1, 90, { tag: null, status: "cancelled", dest_iata: "HKG" })], places, now);
  expect(stats.totalMinutes).toBe(120);
  expect([stats.landed, stats.diverted]).toEqual([1, 1]);
  expect([stats.cities, stats.countries]).toEqual([1, 1]);
  expect(stats.longest?.route).toBe("BKK → HKG");
  expect(stats.byTag).toEqual([{ name: "Untagged", minutes: 90, percent: 75 }, { name: "Study", minutes: 30, percent: 25 }]);
});

test("streak survives a day with no flight yet, and stops at a gap", () => {
  expect(flightStats([session(1, 10), session(2, 10), session(4, 10)], new Map(), now).streak).toBe(2);
  expect(flightStats([session(0, 10), session(2, 10)], new Map(), now).streak).toBe(1);
});

test("the week ends today and ignores older flights", () => {
  const { week, weekMinutes } = flightStats([session(0, 10), session(6, 20), session(7, 40)], new Map(), now);
  expect(week.length).toBe(7);
  expect(week[6]).toEqual({ label: "TODAY", minutes: 10, today: true });
  expect(weekMinutes).toBe(30);
});

test("damaged saved tags fall back to the defaults", () => {
  expect(parseTags("{oops")).toEqual(DEFAULT_TAGS);
  expect(parseTags('["Math", 4, "", "Math"]')).toEqual(["Math"]);
});
