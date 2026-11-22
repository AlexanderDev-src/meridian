import type { Settings } from "./settings";

const RING_EVERY_MS = 5000;
const AMBIENCE_GAIN = 0.6;
const SILENT = 0.0001;

export type Cue = Settings["sound"] | "takeoff" | "half" | "descent";

export function createSound(settings: () => Settings) {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let ambience: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  let ringTimer = 0;

  const audio = () => {
    try {
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        master.connect(context.destination);
      }
      if (context.state === "suspended") void context.resume();
      master!.gain.value = settings().vol / 100;
      return context;
    } catch (error) {
      console.warn("Audio is not available", error);
      return null;
    }
  };

  const tone = (ac: AudioContext, freq: number, at: number, length: number, type: OscillatorType, level: number, endFreq?: number) => {
    const oscillator = ac.createOscillator();
    const gain = ac.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, at);
    if (endFreq) oscillator.frequency.exponentialRampToValueAtTime(endFreq, at + length * 0.8);
    gain.gain.setValueAtTime(SILENT, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(SILENT, at + length);
    oscillator.connect(gain);
    gain.connect(master!);
    oscillator.start(at);
    oscillator.stop(at + length + 0.05);
  };

  const play = (cue: Cue) => {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime + 0.03;
    const note = (freq: number, at: number, length: number, type: OscillatorType, level: number, endFreq?: number) =>
      tone(ac, freq, t + at, length, type, level, endFreq);
    if (cue === "cabin") {
      note(880, 0, 1.6, "sine", 0.32);
      note(1760, 0, 0.5, "sine", 0.04);
      note(698.5, 0.55, 2.1, "sine", 0.32);
      note(1397, 0.55, 0.6, "sine", 0.04);
    } else if (cue === "crystal") {
      [1046.5, 1318.5, 1568, 2093].forEach((freq, i) => note(freq, i * 0.11, 1.9, "sine", 0.16));
    } else if (cue === "bell") {
      note(523.25, 0, 3.2, "sine", 0.3);
      note(1046.5, 0, 2, "sine", 0.08);
      note(523.25 * 2.76, 0, 1.3, "sine", 0.06);
      note(523.25 * 5.4, 0, 0.6, "sine", 0.03);
    } else if (cue === "runway") {
      [440, 554.4, 659.3].forEach((freq, i) => note(freq, i * 0.3, 0.26, "triangle", 0.2));
      note(880, 0.95, 1.4, "triangle", 0.16);
    } else if (cue === "half") {
      note(1318.5, 0, 1.3, "sine", 0.2);
    } else if (cue === "descent") {
      note(987.8, 0, 0.5, "sine", 0.22);
      note(987.8, 0.3, 1, "sine", 0.22);
    } else {
      note(196, 0, 1.8, "triangle", 0.12, 587);
      note(392, 0.1, 1.6, "sine", 0.05, 1174);
    }
  };

  const startAmbience = () => {
    const ac = audio();
    if (!ac) return;
    const length = ac.sampleRate * 4;
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const samples = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      samples[i] = last * 3.5;
    }
    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(SILENT, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(SILENT, (settings().ambVol / 100) * AMBIENCE_GAIN), ac.currentTime + 1.2);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master!);
    source.start();
    ambience = { source, gain };
  };

  const silence = () => {
    clearInterval(ringTimer);
    ringTimer = 0;
  };

  return {
    play,
    silence,
    syncAmbience: (wanted: boolean) => {
      if (wanted && !ambience) startAmbience();
      if (!wanted && ambience) {
        ambience.source.stop();
        ambience = null;
      }
      if (master) master.gain.value = settings().vol / 100;
      if (ambience && context) {
        ambience.gain.gain.cancelScheduledValues(context.currentTime);
        ambience.gain.gain.setValueAtTime(Math.max(SILENT, (settings().ambVol / 100) * AMBIENCE_GAIN), context.currentTime);
      }
    },
    // Returns true while the alarm keeps repeating.
    ring: () => {
      const { landing, repeat } = settings();
      if (!landing) return false;
      play(settings().sound);
      if (!repeat) return false;
      silence();
      ringTimer = window.setInterval(() => play(settings().sound), RING_EVERY_MS);
      return true;
    },
  };
}
