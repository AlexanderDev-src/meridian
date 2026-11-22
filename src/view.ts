import type { Airport, Destination } from "./api";
import { flightNumber, formatMinutes } from "./flight";
import { DESCENT_MINUTES, LANDING_SOUNDS, type Settings, type ToggleKey } from "./settings";
import { MAX_TAG_LENGTH, tagColor, UNTAGGED, type FlightStats } from "./stats";
import type { Session } from "./api";

export const MIN_MINUTES = 5;
export const MAX_MINUTES = 300;
const PRESETS = [25, 50, 90];
const TICKS = [5, 60, 120, 180, 240, 300];
export const VISIBLE_FLIGHTS = 12;
const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "code" });
const countryName = (code: string) => {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
};

const esc = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const km = (value: number) => Math.round(value).toLocaleString("en-US");
const percent = (minutes: number, max: number) => ((minutes - MIN_MINUTES) / (max - MIN_MINUTES)) * 100;

const label = "text-[11px] tracking-[0.18em] text-mute-2";
const overlay = "pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6";
const primary = "mr-cta rounded-[14px] border-0 bg-acc font-semibold text-ink";
const ghost = "mr-ghost rounded-[14px] border border-white/20 bg-transparent font-medium";

const globeMark = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true"><circle cx="13" cy="13" r="12" stroke="#F5F4F0"/><ellipse cx="13" cy="13" rx="5" ry="12" stroke="#F5F4F0"/><path d="M1 13h24" stroke="#F5F4F0"/></svg>`;
const arrow = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 9h12M10 4l5 5-5 5" stroke="#0A0A0A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const chevron = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 5l4 4 4-4" stroke="#C7C7CC" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const planeIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 12l-7-1.5L10 4H8l1.6 6.2L5 9.5 3.5 7H2l1 5-1 5h1.5L5 14.5l4.6-.7L8 20h2l4-6.5L21 12z" stroke="#0A0A0A" stroke-width="1.2" stroke-linejoin="round"/></svg>`;

const chartIcon = (size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 15V9M7 15V4M11 15v-7M15 15V6" stroke="#F5F4F0" stroke-width="1.4" stroke-linecap="round"/></svg>`;

export const header = (totalMinutes: number, count: number) => `
<header class="absolute inset-x-0 top-0 flex items-center justify-between gap-4 px-[clamp(16px,3vw,40px)] py-7">
  <div class="flex items-center gap-3.5">${globeMark}<span class="text-[13px] font-medium tracking-[0.42em]">MERIDIAN</span></div>
  <div class="flex items-center gap-7 text-xs tracking-[0.08em] text-mute-2">
    <span>LOGBOOK <span class="ml-2 tabular-nums text-paper">${formatMinutes(totalMinutes)}</span></span>
    <span>FLIGHTS <span class="ml-2 tabular-nums text-paper">${count}</span></span>
    <button type="button" data-action="open-data" aria-label="Flight data" class="mr-ghost pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.14] bg-[rgba(10,10,12,0.6)]">${chartIcon(18)}</button>
    <button type="button" data-action="open-settings" aria-label="Sound and alert settings" class="mr-ghost pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.14] bg-[rgba(10,10,12,0.6)]">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 7v4h3l4 3V4L6 7H3z" stroke="#F5F4F0" stroke-width="1.3" stroke-linejoin="round"/><path d="M12.5 6.5a3.5 3.5 0 010 5M14.5 4.5a6.4 6.4 0 010 9" stroke="#F5F4F0" stroke-width="1.3" stroke-linecap="round"/></svg>
    </button>
  </div>
</header>`;

const settingToggle = (key: ToggleKey, name: string, on: boolean) =>
  `<button id="set-${key}" type="button" role="switch" aria-checked="${on}" aria-label="${name}" data-action="setting-toggle" data-value="${key}" class="relative h-[30px] w-[50px] shrink-0 rounded-full border-0 p-0 transition-colors ${on ? "bg-acc" : "bg-white/[0.14]"}"><span class="absolute left-[3px] top-[3px] h-6 w-6 rounded-full transition-transform ${on ? "translate-x-5 bg-ink" : "bg-paper"}"></span></button>`;

const settingRow = (key: ToggleKey, name: string, hint: string, on: boolean, extra = "") => `
<div class="flex items-center justify-between gap-5 border-t border-white/[0.07] py-[18px]">
  <div class="flex min-w-0 flex-col gap-1"><span class="text-[15px] text-paper">${name}</span><span class="text-[13px] leading-normal text-mute-3">${hint}</span>${extra}</div>
  ${settingToggle(key, name, on)}
</div>`;

const settingRange = (id: "vol" | "ambVol", name: string, value: number, small: boolean) => `
<div class="flex items-baseline justify-between">
  <label for="set-${id}" class="${small ? "text-[13px] text-mute-3" : "text-[15px] text-paper"}">${name}</label>
  <span id="set-${id}-label" class="text-[13px] tabular-nums text-mute-2">${value}%</span>
</div>
<input id="set-${id}" class="mr-range" type="range" min="0" max="100" step="5" value="${value}" style="--p:${value}%" />`;

const settingSection = (title: string, body: string) =>
  `<section aria-label="${title}" class="flex flex-col"><h2 class="m-0 mb-1.5 text-[11px] font-normal tracking-[0.22em] text-mute-2">${title.toUpperCase()}</h2>${body}</section>`;

export const settingsPanel = (s: Settings, notifBlocked: boolean, ambPreview: boolean) => `
<div id="overlay-scroll" class="mr-scroll pointer-events-auto absolute inset-0 z-20 overflow-y-auto bg-black/95">
  <div role="dialog" aria-label="Settings" class="mx-auto flex max-w-[760px] flex-col gap-10 px-[clamp(20px,4vw,40px)] pb-[72px] pt-10">
    <div class="flex items-end justify-between gap-4">
      <div class="flex flex-col gap-2"><span class="text-[11px] tracking-[0.3em] text-acc">MERIDIAN</span><h1 class="m-0 font-serif text-[clamp(44px,6vw,64px)] font-normal leading-none">Sound &amp; alerts</h1></div>
      <button type="button" data-action="close-settings" aria-label="Close settings" class="mr-ghost flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/[0.16] bg-transparent"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="#F5F4F0" stroke-width="1.4" stroke-linecap="round"/></svg></button>
    </div>
    ${settingSection("Landing alert", `
      ${settingRow("landing", "Play a sound when you land", "The moment your focus time is up.", s.landing)}
      <div class="grid grid-cols-2 gap-2.5 pb-[18px] pt-1 ${s.landing ? "" : "opacity-40"}">
        ${LANDING_SOUNDS.map(([id, name, hint]) => {
          const on = s.sound === id;
          return `<div class="flex items-stretch overflow-hidden rounded-2xl border ${on ? "border-acc bg-acc/[0.08]" : "border-white/[0.08] bg-white/[0.02]"}">
            <button id="sound-${id}" type="button" role="radio" aria-checked="${on}" data-action="pick-sound" data-value="${id}" class="flex min-h-[72px] min-w-0 grow flex-col gap-1 border-0 bg-transparent p-4 text-left"><span class="text-[15px] text-paper">${name}</span><span class="text-xs text-mute-3">${hint}</span></button>
            <button type="button" data-action="preview-sound" data-value="${id}" aria-label="Preview ${name}" class="mr-ghost flex w-14 shrink-0 items-center justify-center border-0 border-l border-white/[0.08] bg-transparent"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M4 2.5v9l7.5-4.5L4 2.5z" stroke="${on ? "#D4B47C" : "#C7C7CC"}" stroke-width="1.3" stroke-linejoin="round"/></svg></button>
          </div>`;
        }).join("")}
      </div>
      <div class="flex flex-col gap-1.5 border-t border-white/[0.07] py-[18px]">${settingRange("vol", "Alert volume", s.vol, false)}</div>
      ${settingRow("repeat", "Keep ringing until I dismiss", "Repeats every few seconds so you do not miss the landing.", s.repeat)}
      ${settingRow("notif", "Desktop notification", "A banner on your screen when you land, even if the window is hidden.", s.notif, notifBlocked ? `<span role="alert" class="text-xs text-[#FF9F7A]">Notifications are not available on this desktop.</span>` : "")}`)}
    ${settingSection("In-flight cues", `
      ${settingRow("takeoff", "Takeoff sound", "A soft rising tone when the session starts.", s.takeoff)}
      ${settingRow("half", "Halfway chime", "One quiet ding when you are halfway there.", s.half)}
      ${settingRow("descent", "Descent warning", "A heads-up before landing, so you can wrap up your thought.", s.descent)}
      <div class="flex items-center justify-between gap-4 pb-[18px] ${s.descent ? "" : "opacity-40"}">
        <span class="text-[13px] text-mute-3">Warn me before landing</span>
        <div role="radiogroup" aria-label="Descent warning time" class="flex gap-1.5">
          ${DESCENT_MINUTES.map((m) => {
            const on = s.descentMin === m;
            return `<button id="descent-${m}" type="button" role="radio" aria-checked="${on}" data-action="descent-min" data-value="${m}" class="min-h-11 min-w-16 rounded-full border px-3.5 text-[13px] ${on ? "border-acc bg-acc text-ink" : "border-white/[0.16] bg-transparent text-paper"}">${m} min</button>`;
          }).join("")}
        </div>
      </div>`)}
    ${settingSection("Cabin ambience", `
      ${settingRow("amb", "Cabin noise while flying", "A low engine hum that masks distractions. Stops when you pause.", s.amb)}
      <div class="flex flex-col gap-1.5 pb-[18px] ${s.amb ? "" : "opacity-40"}">
        ${settingRange("ambVol", "Ambience volume", s.ambVol, true)}
        <button id="preview-amb" type="button" data-action="preview-amb" class="mr-ghost mt-2 min-h-11 self-start rounded-full border border-white/[0.16] bg-transparent px-4 text-[13px]">${ambPreview ? "Stop preview" : "Preview ambience"}</button>
      </div>`)}
    <button type="button" data-action="close-settings" class="mr-cta min-h-[54px] self-start rounded-full border-0 bg-acc px-[30px] text-sm font-semibold tracking-[0.04em] text-ink">Done</button>
  </div>
</div>`;

const dataCard = (name: string, value: string, hint: string) => `
<div class="flex flex-col gap-2 rounded-[18px] border border-white/[0.07] bg-white/[0.025] p-5">
  <span class="text-[10px] tracking-[0.2em] text-mute-3">${name}</span>
  <span class="text-[26px] font-light tabular-nums">${value}</span>
  <span class="text-xs text-mute-3">${esc(hint)}</span>
</div>`;

const logRow = (s: Session, places: Map<string, Airport>, tags: string[]) => {
  const when = new Date(s.ended_at_ms);
  const date = when.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const time = when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const place = (code: string) => places.get(code)?.city || places.get(code)?.name || code;
  const tag = s.tag ?? UNTAGGED;
  const landed = s.status === "completed";
  return `<div class="grid grid-cols-[110px_minmax(0,1fr)_auto_auto] items-center gap-4 border-t border-white/[0.07] px-1 py-4">
    <span class="flex flex-col gap-0.5"><span class="text-[13px]">${date}</span><span class="text-xs tabular-nums text-mute-3">${time}</span></span>
    <span class="flex min-w-0 flex-col gap-0.5"><span class="font-serif text-[22px] leading-none">${esc(s.origin_iata)} → ${esc(s.dest_iata)}</span><span class="truncate text-xs text-mute-3">${esc(place(s.origin_iata))} to ${esc(place(s.dest_iata))} · ${km(s.distance_km)} km</span></span>
    <span class="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/[0.12] px-3 py-1.5 text-xs"><span class="h-1.5 w-1.5 rounded-full" style="background:${tagColor(tag, tags)}"></span>${esc(tag)}</span>
    <span class="flex min-w-[72px] flex-col items-end gap-0.5"><span class="text-[15px] tabular-nums">${formatMinutes(s.focused_ms / 60000)}</span><span class="text-[11px] tracking-[0.1em] ${landed ? "text-mute-3" : "text-[#FF9F7A]"}">${landed ? "LANDED" : "DIVERTED"}</span></span>
  </div>`;
};

export const dataPanel = (stats: FlightStats, sessions: Session[], places: Map<string, Airport>, tags: string[]) => {
  const peak = Math.max(1 / 60000, ...stats.week.map((d) => d.minutes));
  return `
<div id="overlay-scroll" class="mr-scroll pointer-events-auto absolute inset-0 z-20 overflow-y-auto bg-black/95">
  <div role="dialog" aria-label="Flight data" class="mx-auto flex max-w-[1040px] flex-col gap-9 px-[clamp(20px,4vw,40px)] pb-[72px] pt-10">
    <div class="flex items-end justify-between gap-4">
      <div class="flex flex-col gap-2">
        <span class="text-[11px] tracking-[0.3em] text-acc">FLIGHT DATA</span>
        <h1 class="m-0 font-serif text-[clamp(56px,8vw,96px)] font-normal leading-[0.95] tabular-nums">${formatMinutes(stats.totalMinutes)}</h1>
        <span class="text-sm text-mute-2">total time in the air</span>
      </div>
      <button type="button" data-action="close-data" aria-label="Close flight data" class="mr-ghost flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/[0.16] bg-transparent"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="#F5F4F0" stroke-width="1.4" stroke-linecap="round"/></svg></button>
    </div>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
      ${dataCard("FLIGHTS", String(stats.flights), `${stats.landed} landed · ${stats.diverted} diverted`)}
      ${dataCard("DISTANCE", km(stats.km), "kilometres flown")}
      ${dataCard("LONGEST", stats.longest ? formatMinutes(stats.longest.minutes) : "–", stats.longest?.route ?? "no flights yet")}
      ${dataCard("STREAK", String(stats.streak), "days in a row")}
      ${dataCard("CITIES", String(stats.cities), `${stats.countries} ${stats.countries === 1 ? "country" : "countries"}`)}
    </div>
    <div class="flex flex-wrap gap-3">
      <section aria-label="Last 7 days" class="flex min-w-0 flex-[999_1_520px] flex-col gap-5 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-6">
        <div class="flex items-baseline justify-between"><h2 class="m-0 text-[11px] font-normal tracking-[0.22em] text-mute-2">LAST 7 DAYS</h2><span class="text-[13px] tabular-nums text-mute-2">${formatMinutes(stats.weekMinutes)} this week</span></div>
        <div class="grid h-[200px] grid-cols-7 items-end gap-3">
          ${stats.week.map((d) => `<div class="flex h-full flex-col items-center justify-end gap-2">
            <span class="text-[11px] tabular-nums text-mute-1">${d.minutes ? formatMinutes(d.minutes) : "–"}</span>
            <div title="${formatMinutes(d.minutes)}" class="min-h-0.5 w-full max-w-11 rounded-t ${d.today ? "bg-acc" : "bg-acc/45"}" style="height:${(d.minutes / peak) * 150}px"></div>
            <span class="text-[11px] tracking-[0.08em] ${d.today ? "text-paper" : "text-mute-3"}">${d.label}</span>
          </div>`).join("")}
        </div>
      </section>
      <section aria-label="Time by tag" class="flex min-w-0 flex-[1_1_300px] flex-col gap-[18px] rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-6">
        <h2 class="m-0 text-[11px] font-normal tracking-[0.22em] text-mute-2">BY TAG</h2>
        <div class="flex flex-col gap-3.5">
          ${stats.byTag.map((t) => `<div class="flex flex-col gap-1.5">
            <div class="flex justify-between gap-2.5 text-[13px]"><span class="flex items-center gap-2"><span class="h-[7px] w-[7px] rounded-full" style="background:${tagColor(t.name, tags)}"></span>${esc(t.name)}</span><span class="tabular-nums text-mute-2">${formatMinutes(t.minutes)} · ${t.percent}%</span></div>
            <div class="h-1 rounded bg-white/[0.08]"><div class="h-full rounded" style="width:${t.percent}%;background:${tagColor(t.name, tags)}"></div></div>
          </div>`).join("")}
          ${stats.flights ? "" : `<span class="text-[13px] text-mute-3">No flights yet.</span>`}
        </div>
      </section>
    </div>
    <section aria-label="Flight log" class="flex flex-col gap-1.5">
      <div class="flex items-baseline justify-between pb-2.5"><h2 class="m-0 text-[11px] font-normal tracking-[0.22em] text-mute-2">FLIGHT LOG</h2><span class="text-xs text-mute-3">${stats.flights} sessions</span></div>
      ${sessions.map((s) => logRow(s, places, tags)).join("")}
    </section>
  </div>
</div>`;
};

export const originChoices = (airports: Airport[], current: string) => `
<div class="grid grid-cols-2 gap-1.5">
  ${airports
    .map(
      (a) => `<button type="button" data-action="origin" data-value="${esc(a.iata)}" class="mr-ghost flex min-h-11 items-baseline gap-2.5 rounded-[10px] border bg-transparent px-3 py-2.5 text-left ${a.iata === current ? "border-acc" : "border-white/10"}">
        <span class="text-[13px] font-semibold tracking-[0.06em]">${esc(a.iata)}</span>
        <span class="truncate text-xs text-mute-2">${esc(a.city || a.name)}</span>
      </button>`,
    )
    .join("")}
</div>`;

export const flightList = (flights: Destination[], selected: string | null, minutes: number, searching = false) => {
  if (!flights.length) {
    const message = searching
      ? "No airport matches that search."
      : `No flights land within 10% of ${formatMinutes(minutes)} from here. Try another duration, or search above.`;
    return `<p class="rounded-[14px] border border-white/10 p-4 text-sm leading-relaxed text-mute-2">${message}</p>`;
  }
  return flights
    .map((f) => {
      const on = f.airport.iata === selected;
      const diff = f.duration_minutes - minutes;
      const near = Math.abs(diff) <= 5;
      const badge = near ? "MATCH" : `${diff > 0 ? "+" : "−"}${formatMinutes(Math.abs(diff))}`;
      return `<button type="button" role="radio" aria-checked="${on}" data-action="pick" data-value="${esc(f.airport.iata)}" class="mr-flight grid min-h-[60px] shrink-0 grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left ${on ? "border-acc bg-acc/10" : "border-white/[0.07] bg-white/[0.015]"}">
        <span class="font-serif text-[26px] leading-none">${esc(f.airport.iata)}</span>
        <span class="flex min-w-0 flex-col gap-[3px]">
          <span class="truncate text-sm text-paper">${esc(f.airport.city || f.airport.name)}</span>
          <span class="truncate text-xs text-mute-3">${esc(countryName(f.airport.country))} · ${km(f.distance_km)} km</span>
        </span>
        <span class="flex flex-col items-end gap-[3px]">
          <span class="text-sm tabular-nums">${formatMinutes(f.duration_minutes)}</span>
          <span class="text-[11px] tracking-[0.04em] ${near ? "text-acc" : "text-mute-3"}">${badge}</span>
        </span>
      </button>`;
    })
    .join("");
};

export const presetButtons = (minutes: number) =>
  PRESETS.map(
    (p) => `<button type="button" data-action="preset" data-value="${p}" aria-pressed="${p === minutes}" class="mr-ghost min-h-11 flex-1 rounded-[10px] border text-[13px] tabular-nums ${p === minutes ? "border-acc text-acc" : "border-white/10 text-mute-1"}">${p}m</button>`,
  ).join("");

export const ctaContent = (origin: string, selected: string | null) =>
  `<span>${selected ? `Board  ${esc(origin)} → ${esc(selected)}` : "Choose a flight"}</span>${arrow}`;

export type PlanView = {
  origin: Airport;
  minutes: number;
  flights: Destination[];
  selected: string | null;
  originOpen: boolean;
  choices: Airport[];
  destQuery: string;
  extended: boolean;
  unlockOpen: boolean;
  unlockNote: string | null;
  maxMinutes: number;
  error: string | null;
};

export const limitControl = (minutes: number, extended: boolean, maxMinutes: number) => {
  if (extended) {
    return `<div class="mt-2 flex items-center justify-between gap-3">
      <span class="text-[11px] tracking-[0.16em] text-acc">LONG HAUL · UP TO ${formatMinutes(maxMinutes).toUpperCase()}</span>
      <button type="button" data-action="lock-back" class="mr-ghost min-h-9 rounded-full border border-white/15 bg-transparent px-3 text-xs text-mute-1">Back to 5h max</button>
    </div>`;
  }
  if (minutes < MAX_MINUTES) return "";
  return `<div class="mt-2 flex justify-end"><button type="button" data-action="open-unlock" class="mr-ghost flex min-h-11 items-center gap-2 rounded-full border border-dashed border-acc bg-transparent px-3.5 text-xs tracking-[0.06em] text-acc">
    <span>Need more than 5h?</span>
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button></div>`;
};

const unlockDialog = (note: string | null) => `
<div class="${overlay}">
  <div role="dialog" aria-label="Unlock sessions longer than 5 hours" class="flex w-[min(460px,100%)] flex-col gap-[18px] rounded-3xl border border-white/10 bg-dialog p-8 shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
    <span class="text-[11px] tracking-[0.3em] text-acc">LIMIT TEST</span>
    <h2 class="m-0 font-serif text-[40px] font-normal leading-[1.02]">Whoa; exam season already?</h2>
    <p class="m-0 text-sm leading-[1.6] text-mute-2">${note ? esc(note) : "Five hours is where most flights land. Want to see how far you can really go? Unlock long-haul sessions, as far as the map goes."} Water, snacks and the odd stretch are on you, captain.</p>
    <div class="mt-1.5 flex flex-wrap gap-2.5">
      <button type="button" data-action="confirm-unlock" class="${primary} min-h-[52px] grow px-5 text-sm tracking-[0.02em]">Bring it on</button>
      <button type="button" data-action="close-unlock" class="${ghost} min-h-[52px] grow px-5 text-sm">Maybe next time</button>
    </div>
  </div>
</div>`;

const durationTicks = (extended: boolean, max: number) => {
  const step = max > 720 ? 240 : 120;
  const middle = Array.from({ length: Math.floor(max / step) }, (_, i) => (i + 1) * step).filter((t) => t < max - step / 2);
  const ticks = extended ? [MIN_MINUTES, ...middle, max] : TICKS;
  return ticks
    .map((t, i) => `<span class="absolute text-[11px] tabular-nums text-mute-3" style="left:${percent(t, max)}%;transform:translateX(${i === 0 ? "0" : i === ticks.length - 1 ? "-100%" : "-50%"})">${formatMinutes(t)}</span>`)
    .join("");
};

export const planPanel = (p: PlanView) => `
<section aria-label="Plan a focus flight" class="mr-scroll pointer-events-auto absolute bottom-8 left-[clamp(16px,3vw,40px)] top-[92px] box-border flex w-[min(400px,calc(100%-32px))] flex-col gap-[26px] overflow-y-auto rounded-[22px] border border-white/[0.08] bg-panel p-7">
  <div class="flex flex-col gap-2.5">
    <span class="${label}">DEPARTURE</span>
    <button type="button" data-action="toggle-origin" aria-expanded="${p.originOpen}" class="mr-ghost flex min-h-14 items-center justify-between gap-3 rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left">
      <span class="flex min-w-0 items-baseline gap-3.5">
        <span class="font-serif text-[30px] leading-none">${esc(p.origin.iata)}</span>
        <span class="truncate text-sm text-mute-1">${esc(p.origin.city || p.origin.name)}, ${esc(countryName(p.origin.country))}</span>
      </span>${chevron}
    </button>
    ${p.originOpen ? `<input id="origin-search" type="search" autocomplete="off" placeholder="Search city, airport or code" aria-label="Search airports" class="min-h-11 rounded-[10px] border border-white/10 bg-transparent px-3 text-sm text-paper placeholder:text-mute-3" />
    <div id="origin-choices">${originChoices(p.choices, p.origin.iata)}</div>` : ""}
  </div>

  <div class="flex flex-col gap-1.5">
    <div class="flex items-end justify-between gap-3">
      <label for="duration" class="${label} pb-2.5">FOCUS DURATION</label>
      <span id="duration-label" class="font-serif text-[56px] leading-none tracking-[-0.01em]">${formatMinutes(p.minutes)}</span>
    </div>
    <div id="presets" class="mb-1 flex gap-1.5">${presetButtons(p.minutes)}</div>
    <input id="duration" class="mr-range" type="range" min="${MIN_MINUTES}" max="${p.maxMinutes}" step="5" value="${p.minutes}" style="--p:${percent(p.minutes, p.maxMinutes)}%" aria-valuetext="${formatMinutes(p.minutes)}" />
    <div class="relative h-4">${durationTicks(p.extended, p.maxMinutes)}</div>
    <div id="limit">${limitControl(p.minutes, p.extended, p.maxMinutes)}</div>
  </div>

  <div class="flex min-h-[230px] flex-1 flex-col gap-2.5">
    <div class="flex items-baseline justify-between">
      <span id="flights-title" class="${label}">FLIGHTS NEAR ${formatMinutes(p.minutes).toUpperCase()}</span>
      <span class="text-[11px] text-mute-3">from ${esc(p.origin.iata)}</span>
    </div>
    <input id="dest-search" type="search" autocomplete="off" value="${esc(p.destQuery)}" placeholder="Search any destination" aria-label="Search any destination" class="min-h-11 shrink-0 rounded-[10px] border border-white/10 bg-transparent px-3 text-sm text-paper placeholder:text-mute-3" />
    <div id="flights" role="radiogroup" aria-label="Available flights" class="mr-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">${flightList(p.flights, p.selected, p.minutes, p.destQuery.trim() !== "")}</div>
  </div>
  ${p.error ? `<p role="alert" class="text-[13px] text-acc">${esc(p.error)}</p>` : ""}
  <button id="board" type="button" data-action="board" ${p.selected ? "" : "disabled"} class="mr-cta flex min-h-[58px] shrink-0 items-center justify-center gap-3 rounded-2xl border-0 bg-acc px-5 text-[15px] font-semibold tracking-[0.04em] text-ink">${ctaContent(p.origin.iata, p.selected)}</button>
</section>
<p class="absolute bottom-8 right-[clamp(16px,3vw,40px)] m-0 text-[11px] tracking-[0.14em] text-mute-3">DRAG TO ROTATE · SCROLL TO ZOOM</p>
${p.unlockOpen ? unlockDialog(p.unlockNote) : ""}`;

const barcode = (seedText: string) => {
  let seed = [...seedText].reduce((s, c) => (s * 33 + c.charCodeAt(0)) % 100003, 0);
  return Array.from({ length: 44 }, () => {
    seed = (seed * 1103515 + 12345) % 2147483648;
    return `<span class="bg-ink" style="width:${1 + ((seed >> 8) % 3)}px"></span>`;
  }).join("");
};

const passField = (name: string, value: string) =>
  `<div class="flex flex-col gap-1.5"><span class="text-[10px] tracking-[0.2em] text-mute-4">${name}</span><span class="text-[15px] font-medium">${esc(value)}</span></div>`;

const tagPicker = (tags: string[], current: string, newTag: string) => `
<div class="flex flex-col gap-3">
  <span id="tag-heading" class="text-[10px] tracking-[0.2em] text-mute-4">WHAT ARE YOU FOCUSING ON?</span>
  <div role="radiogroup" aria-labelledby="tag-heading" class="flex flex-wrap gap-2">
    ${tags.map((name, i) => {
      const on = name === current;
      return `<button id="tag-${i}" type="button" role="radio" aria-checked="${on}" data-action="pick-tag" data-value="${esc(name)}" class="flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium ${on ? "border-ink bg-ink text-pass" : "border-ink/[0.22] bg-transparent text-ink"}"><span class="h-[7px] w-[7px] rounded-full" style="background:${tagColor(name, tags)}"></span><span>${esc(name)}</span></button>`;
    }).join("")}
    <div class="flex min-h-10 items-center gap-1 rounded-full border border-dashed border-ink/30 py-0 pl-3.5 pr-1">
      <label for="new-tag" class="sr-only">New tag</label>
      <input id="new-tag" type="text" maxlength="${MAX_TAG_LENGTH}" placeholder="New tag" value="${esc(newTag)}" class="w-24 border-0 bg-transparent text-[13px] text-ink outline-none" />
      <button type="button" data-action="add-tag" aria-label="Add tag" class="flex h-8 w-8 items-center justify-center rounded-full border-0 bg-ink"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 2v8M2 6h8" stroke="#F4F2EC" stroke-width="1.5" stroke-linecap="round"/></svg></button>
    </div>
  </div>
</div>`;

export const boardingPass = (o: Airport, d: Airport, minutes: number, tags: string[], tag: string, newTag: string) => {
  const no = flightNumber(o.iata, d.iata);
  const end = (a: Airport, align: string) =>
    `<div class="flex flex-col gap-1 ${align}"><span class="font-serif text-[76px] leading-[0.9]">${esc(a.iata)}</span><span class="text-[13px] text-mute-5">${esc(a.city || a.name)}</span></div>`;
  return `
<div class="${overlay}">
  <div role="dialog" aria-label="Boarding pass" class="w-[min(600px,100%)] overflow-hidden rounded-3xl bg-pass text-ink shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
    <div class="flex flex-col gap-7 px-9 pb-7 pt-8">
      <div class="flex items-center justify-between text-[11px] tracking-[0.3em] text-mute-4"><span>MERIDIAN</span><span>BOARDING PASS</span></div>
      <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-5">
        ${end(o, "")}
        <div class="flex items-center gap-2"><span class="h-px grow bg-ink opacity-25"></span>${planeIcon}<span class="h-px grow bg-ink opacity-25"></span></div>
        ${end(d, "items-end")}
      </div>
      <div class="grid grid-cols-4 gap-4">${passField("PASSENGER", "Alex")}${passField("FLIGHT", no)}${passField("PURPOSE", tag)}${passField("FOCUS", formatMinutes(minutes))}</div>
      ${tagPicker(tags, tag, newTag)}
    </div>
    <div class="flex flex-wrap items-center justify-between gap-5 border-t border-dashed border-ink/30 px-9 pb-[30px] pt-6">
      <div aria-hidden="true" class="flex h-11 items-stretch gap-0.5">${barcode(no + o.iata + d.iata)}</div>
      <div class="flex gap-2.5">
        <button type="button" data-action="cancel-pass" class="min-h-[50px] rounded-[14px] border border-ink/25 bg-transparent px-5 text-sm font-medium text-ink">Cancel</button>
        <button type="button" data-action="takeoff" class="mr-cta min-h-[50px] rounded-[14px] border-0 bg-ink px-[26px] text-sm font-semibold tracking-[0.06em] text-acc">Take off</button>
      </div>
    </div>
  </div>
</div>`;
};

export const flightHud = (o: Airport, d: Airport, paused: boolean, confirming: boolean) => `
<div class="absolute left-1/2 top-[84px] flex -translate-x-1/2 items-center gap-3.5 whitespace-nowrap rounded-full border border-white/[0.08] bg-panel px-[18px] py-2.5 text-xs tracking-[0.14em]">
  <span class="h-1.5 w-1.5 rounded-full bg-acc"></span>
  <span>${flightNumber(o.iata, d.iata)}</span><span class="text-mute-3">${esc(o.iata)} → ${esc(d.iata)}</span><span data-t="status" class="text-mute-3"></span>
</div>
<div class="absolute inset-x-0 bottom-9 flex flex-col items-center gap-[22px] px-6">
  <div class="flex flex-col items-center gap-1">
    <span data-t="remaining" role="timer" class="text-[clamp(72px,10vw,136px)] font-extralight leading-none tracking-[-0.02em] tabular-nums"></span>
    <span class="text-[11px] tracking-[0.3em] text-mute-2">TO LANDING IN ${esc((d.city || d.name).toUpperCase())}</span>
  </div>
  <div class="grid w-[min(640px,100%)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 text-xs font-semibold tracking-[0.1em]">
    <span>${esc(o.iata)}</span>
    <div class="relative h-0.5 rounded-sm bg-white/15">
      <div data-t="bar" class="absolute inset-y-0 left-0 rounded-sm bg-acc"></div>
      <div data-t="dot" class="absolute -top-1 -ml-[5px] h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_0_4px_rgba(0,0,0,0.8)]"></div>
    </div>
    <span>${esc(d.iata)}</span>
  </div>
  <div class="flex flex-wrap justify-center gap-9 text-[11px] tracking-[0.14em] text-mute-3">
    <span>DISTANCE LEFT <span data-t="km" class="ml-1.5 tabular-nums text-paper"></span></span>
    <span>ALTITUDE <span data-t="alt" class="ml-1.5 tabular-nums text-paper"></span></span>
    <span>FOCUSED <span data-t="focused" class="ml-1.5 tabular-nums text-paper"></span></span>
  </div>
  <div class="pointer-events-auto flex gap-2.5">
    <button type="button" data-action="toggle-pause" class="mr-cta min-h-[50px] min-w-[132px] rounded-full border-0 bg-acc px-[22px] text-sm font-semibold tracking-[0.04em] text-ink">${paused ? "Resume" : "Pause"}</button>
    <button type="button" data-action="ask-end" class="mr-ghost min-h-[50px] rounded-full border border-white/15 bg-panel px-[22px] text-sm font-medium">End flight</button>
  </div>
</div>
${
  confirming
    ? `<div class="${overlay}"><div role="alertdialog" aria-label="End flight early" class="flex w-[min(420px,100%)] flex-col gap-[18px] rounded-[22px] border border-white/10 bg-dialog p-[30px]">
  <h2 class="m-0 font-serif text-[34px] font-normal leading-[1.05]">Divert this flight?</h2>
  <p class="m-0 text-sm leading-[1.55] text-mute-2">You will land early. The minutes you have focused so far still go into your logbook, marked as diverted.</p>
  <div class="flex flex-wrap gap-2.5">
    <button type="button" data-action="keep-flying" class="${primary} min-h-[50px] grow px-5 text-sm">Keep flying</button>
    <button type="button" data-action="divert" class="${ghost} min-h-[50px] grow px-5 text-sm">Divert</button>
  </div>
</div></div>`
    : ""
}`;

export type ArrivalView = {
  city: string;
  dest: string;
  diverted: boolean;
  focusedMinutes: number;
  distanceKm: number;
  logbookMinutes: number;
  tag: string;
  saveError: string | null;
};

const stat = (name: string, value: string) =>
  `<div class="flex flex-col gap-1.5"><span class="text-[10px] tracking-[0.2em] text-mute-3">${name}</span><span class="text-xl font-light tabular-nums">${value}</span></div>`;

export const arrivalPanel = (a: ArrivalView, ringing: boolean) => `
<div class="absolute inset-x-0 bottom-12 flex justify-center px-6">
  <div class="pointer-events-auto flex w-[min(560px,100%)] flex-col items-center gap-[22px] rounded-[26px] border border-white/[0.08] bg-panel px-8 pb-[30px] pt-[34px] text-center">
    <span class="text-[11px] tracking-[0.3em] text-acc">${a.diverted ? "FLIGHT DIVERTED" : "WELCOME TO"}</span>
    <h1 class="m-0 font-serif text-[clamp(48px,7vw,76px)] font-normal leading-[0.95]">${a.diverted ? "Landed early" : esc(a.city)}</h1>
    <div class="grid w-full grid-cols-3 gap-3">${stat("FOCUSED", formatMinutes(a.focusedMinutes))}${stat("DISTANCE", `${km(a.distanceKm)} km`)}${stat("PURPOSE", esc(a.tag))}</div>
    ${a.saveError ? `<p role="alert" class="m-0 text-[13px] text-acc">Could not save this flight: ${esc(a.saveError)}</p>` : ""}
    ${ringing ? `<button type="button" data-action="silence" class="mr-ghost min-h-12 rounded-full border border-acc bg-transparent px-[22px] text-[13px] tracking-[0.06em] text-acc">Silence alarm</button>` : ""}
    <div class="flex flex-wrap justify-center gap-2.5">
      <button type="button" data-action="open-data" class="mr-ghost flex min-h-[54px] items-center gap-2.5 rounded-full border border-white/[0.18] bg-transparent px-6 text-sm font-medium">${chartIcon(16)}<span>View data</span></button>
      <button type="button" data-action="again" class="mr-cta min-h-[54px] rounded-full border-0 bg-acc px-[30px] text-sm font-semibold tracking-[0.04em] text-ink">${a.diverted ? "Plan a new flight" : `Plan next flight from ${esc(a.dest)}`}</button>
    </div>
  </div>
</div>`;

export const percentOf = percent;
