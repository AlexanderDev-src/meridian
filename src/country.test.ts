import { expect, test } from "bun:test";
import { countryCodes } from "./country";

test("country names resolve to ISO codes", () => {
  expect(countryCodes("Japan")).toEqual(["JP"]);
  expect(countryCodes(" thai")).toEqual(["TH"]);
  expect(countryCodes("korea").sort()).toEqual(["KP", "KR"]);
  expect(countryCodes("usa")).toEqual(["US"]);
});

test("very short text does not match every country", () => {
  expect(countryCodes("ja")).toEqual([]);
});
