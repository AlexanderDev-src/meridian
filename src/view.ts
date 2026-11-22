import type { Airport, Destination } from "./api";
import { flightNumber, formatMinutes } from "./flight";

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

export const header = (totalMinutes: number, count: number) => `
<header class="absolute inset-x-0 top-0 flex items-center justify-between gap-4 px-[clamp(16px,3vw,40px)] py-7">
  <div class="flex items-center gap-3.5">${globeMark}<span class="text-[13px] font-medium tracking-[0.42em]">MERIDIAN</span></div>
  <div class="flex items-center gap-7 text-xs tracking-[0.08em] text-mute-2">
    <span>LOGBOOK <span class="ml-2 tabular-nums text-paper">${formatMinutes(totalMinutes)}</span></span>
    <span>FLIGHTS <span class="ml-2 tabular-nums text-paper">${count}</span></span>
  </div>
</header>`;

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

export const boardingPass = (o: Airport, d: Airport, minutes: number) => {
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
      <div class="grid grid-cols-4 gap-4">${passField("PASSENGER", "Alex")}${passField("FLIGHT", no)}${passField("SEAT", "1A")}${passField("FOCUS", formatMinutes(minutes))}</div>
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
  saveError: string | null;
};

const stat = (name: string, value: string) =>
  `<div class="flex flex-col gap-1.5"><span class="text-[10px] tracking-[0.2em] text-mute-3">${name}</span><span class="text-xl font-light tabular-nums">${value}</span></div>`;

export const arrivalPanel = (a: ArrivalView) => `
<div class="absolute inset-x-0 bottom-12 flex justify-center px-6">
  <div class="pointer-events-auto flex w-[min(560px,100%)] flex-col items-center gap-[22px] rounded-[26px] border border-white/[0.08] bg-panel px-8 pb-[30px] pt-[34px] text-center">
    <span class="text-[11px] tracking-[0.3em] text-acc">${a.diverted ? "FLIGHT DIVERTED" : "WELCOME TO"}</span>
    <h1 class="m-0 font-serif text-[clamp(48px,7vw,76px)] font-normal leading-[0.95]">${a.diverted ? "Landed early" : esc(a.city)}</h1>
    <div class="grid w-full grid-cols-3 gap-3">${stat("FOCUSED", formatMinutes(a.focusedMinutes))}${stat("DISTANCE", `${km(a.distanceKm)} km`)}${stat("LOGBOOK", formatMinutes(a.logbookMinutes))}</div>
    ${a.saveError ? `<p role="alert" class="m-0 text-[13px] text-acc">Could not save this flight: ${esc(a.saveError)}</p>` : ""}
    <button type="button" data-action="again" class="mr-cta min-h-[54px] rounded-full border-0 bg-acc px-[30px] text-sm font-semibold tracking-[0.04em] text-ink">${a.diverted ? "Plan a new flight" : `Plan next flight from ${esc(a.dest)}`}</button>
  </div>
</div>`;

export const percentOf = percent;
