import { afterEach, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "./settings";
import { createSound, IDLE_CLOSE_MS } from "./sound";

// Minimal Web Audio stand-in: counts contexts and closes.
let created = 0;
let closed = 0;
const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
const node = () => ({ connect() {}, start() {}, stop() {}, gain: param(), frequency: param(), type: "" });
class FakeContext {
  state = "running";
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  constructor() { created++; }
  createGain = node;
  createOscillator = node;
  createBiquadFilter = node;
  createBufferSource = node;
  createBuffer = (_: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
  close() { closed++; return Promise.resolve(); }
}

const timers: Array<() => void> = [];
Object.assign(globalThis, {
  AudioContext: FakeContext,
  window: { setTimeout: (fn: () => void, ms: number) => (ms === IDLE_CLOSE_MS ? timers.push(fn) : 0), setInterval: () => 1 },
});
const fireIdle = () => timers.splice(0).forEach((fn) => fn());

afterEach(() => { created = 0; closed = 0; timers.length = 0; });

test("an idle context is closed and the next sound opens a fresh one", () => {
  const sound = createSound(() => DEFAULT_SETTINGS);
  sound.play("takeoff");
  fireIdle();
  expect(closed).toBe(1);
  sound.play("takeoff");
  expect(created).toBe(2);
});

test("ambience keeps the context open until it stops", () => {
  const sound = createSound(() => DEFAULT_SETTINGS);
  sound.syncAmbience(true);
  sound.play("half");
  fireIdle();
  expect(closed).toBe(0);
  sound.syncAmbience(false);
  fireIdle();
  expect(closed).toBe(1);
});
