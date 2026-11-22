import { expect, test } from "bun:test";
import { decodeFlight, elapsedMs, encodeFlight, formatClock, landingTime, pauseClock, positionAt, resumeClock, startClock, type SavedFlight } from "./flight";

test("a saved flight comes back paused, without counting closed-app time", () => {
  const airport = { iata: "BKK" } as SavedFlight["origin"];
  const flight = { origin: airport, dest: airport, minutes: 1, clock: startClock(0, 60_000) };
  const restored = decodeFlight(encodeFlight(flight, 10_000))!;
  expect(restored.clock.paused).toBe(true);
  expect(elapsedMs(restored.clock, 999_999)).toBe(10_000);
});

test("a damaged saved flight is ignored", () => {
  expect(decodeFlight("{oops")).toBeNull();
  expect(decodeFlight(JSON.stringify({ minutes: 1 }))).toBeNull();
  expect(decodeFlight(null)).toBeNull();
});

test("elapsed time survives a long gap such as sleep", () => {
  expect(elapsedMs(startClock(1000, 60_000), 31_000)).toBe(30_000);
});

test("elapsed time is clamped when the clock moves back or past the end", () => {
  const clock = startClock(1000, 60_000);
  expect(elapsedMs(clock, 0)).toBe(0);
  expect(elapsedMs(clock, 999_999)).toBe(60_000);
});

test("paused time does not count", () => {
  const paused = pauseClock(startClock(0, 60_000), 10_000);
  expect(elapsedMs(paused, 50_000)).toBe(10_000);
  expect(elapsedMs(resumeClock(paused, 50_000), 55_000)).toBe(15_000);
});

test("landing time is the scheduled end, even if noticed later", () => {
  const resumed = resumeClock(pauseClock(startClock(0, 60_000), 10_000), 20_000);
  expect(landingTime(resumed, 500_000)).toBe(70_000);
});

test("position interpolates and keeps endpoints", () => {
  const points = [{ lat: 0, lon: 170 }, { lat: 10, lon: 190 }];
  expect(positionAt(points, 0)).toEqual(points[0]);
  expect(positionAt(points, 1)).toEqual(points[1]);
  expect(positionAt(points, 0.5)).toEqual({ lat: 5, lon: 180 });
});

test("clock format", () => {
  expect(formatClock(3_000_000)).toBe("50:00");
  expect(formatClock(3_661_000)).toBe("1:01:01");
});
