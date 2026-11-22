import { expect, test } from "bun:test";
import { DEFAULT_SETTINGS, descentDue, parseSettings } from "./settings";

test("damaged or invalid settings fall back to defaults", () => {
  expect(parseSettings("{oops")).toEqual(DEFAULT_SETTINGS);
  const parsed = parseSettings(JSON.stringify({ vol: 900, sound: "nope", descentMin: 7, amb: true }));
  expect(parsed).toEqual({ ...DEFAULT_SETTINGS, amb: true });
});

test("descent warning fires inside the window and skips short flights", () => {
  expect(descentDue(3_000_000, 2_600_000, 5)).toBe(false);
  expect(descentDue(3_000_000, 2_700_000, 5)).toBe(true);
  expect(descentDue(360_000, 100_000, 5)).toBe(false);
});
