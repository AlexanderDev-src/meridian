export const LANDING_SOUNDS = [
  ["cabin", "Cabin chime", "Classic two-tone ding-dong"],
  ["crystal", "Crystal", "Bright rising arpeggio"],
  ["bell", "Soft bell", "Warm, long and gentle"],
  ["runway", "Runway lights", "Three pulses and a glow"],
] as const;
export const DESCENT_MINUTES = [1, 5, 10] as const;

export type LandingSound = (typeof LANDING_SOUNDS)[number][0];
export type Settings = {
  landing: boolean;
  sound: LandingSound;
  vol: number;
  repeat: boolean;
  notif: boolean;
  takeoff: boolean;
  half: boolean;
  descent: boolean;
  descentMin: number;
  amb: boolean;
  ambVol: number;
};
export type ToggleKey = "landing" | "repeat" | "notif" | "takeoff" | "half" | "descent" | "amb";

export const DEFAULT_SETTINGS: Settings = {
  landing: true,
  sound: "cabin",
  vol: 70,
  repeat: false,
  notif: false,
  takeoff: true,
  half: false,
  descent: true,
  descentMin: 5,
  amb: false,
  ambVol: 40,
};

const percent = (value: unknown, fallback: number) =>
  typeof value === "number" && value >= 0 && value <= 100 ? value : fallback;
const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

export const parseSettings = (raw: string | null): Settings => {
  const d = DEFAULT_SETTINGS;
  try {
    const s = JSON.parse(raw ?? "{}") as Partial<Settings>;
    return {
      landing: flag(s.landing, d.landing),
      sound: LANDING_SOUNDS.some(([id]) => id === s.sound) ? s.sound! : d.sound,
      vol: percent(s.vol, d.vol),
      repeat: flag(s.repeat, d.repeat),
      notif: flag(s.notif, d.notif),
      takeoff: flag(s.takeoff, d.takeoff),
      half: flag(s.half, d.half),
      descent: flag(s.descent, d.descent),
      descentMin: DESCENT_MINUTES.some((m) => m === s.descentMin) ? s.descentMin! : d.descentMin,
      amb: flag(s.amb, d.amb),
      ambVol: percent(s.ambVol, d.ambVol),
    };
  } catch {
    return { ...d };
  }
};

// Skips a warning that would fire right at takeoff on a short flight.
export const descentDue = (totalMs: number, elapsed: number, descentMin: number) => {
  const warnMs = descentMin * 60000;
  return totalMs > warnMs * 1.5 && totalMs - elapsed <= warnMs;
};
