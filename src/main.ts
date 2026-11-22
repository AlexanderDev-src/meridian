import "./style.css";
import {
  findDestinations,
  listSessions,
  longestFlight,
  planRoute,
  saveSession,
  searchAirports,
  searchDestinations,
  type Airport,
  type Destination,
  type Route,
  type Session,
} from "./api";
import {
  altitudeFeet,
  arcHeight,
  decodeFlight,
  elapsedMs,
  encodeFlight,
  formatClock,
  formatMinutes,
  landingTime,
  pauseClock,
  positionAt,
  resumeClock,
  startClock,
  statusLabel,
  type FlightClock,
  type SavedFlight,
} from "./flight";
import { createGlobe, type GlobeRoute } from "./globe";
import { createRenderControl } from "./render-control";
import {
  arrivalPanel,
  boardingPass,
  ctaContent,
  flightHud,
  flightList,
  header,
  limitControl,
  MAX_MINUTES,
  originChoices,
  percentOf,
  planPanel,
  presetButtons,
  VISIBLE_FLIGHTS,
  type ArrivalView,
} from "./view";

const DEFAULT_ORIGINS = ["BKK", "KKC", "SIN", "HND", "DXB", "LHR", "CDG", "JFK", "LAX", "SYD"];
const DEFAULT_MINUTES = 50;
const UI_TICK_MS = 500;
const CAMERA_MOVE_MS = 1000;
const PLAN_CAMERA_ALTITUDE = 1.65;
const FLIGHT_CAMERA_ALTITUDE = 0.85;
const ARRIVAL_CAMERA_ALTITUDE = 1;
const CAMERA_LAT_OFFSET = 7;
const CLICK_MOVE_PX = 5;
const FLIGHT_KEY = "meridian.flight";
const FLIGHT_SAVE_MS = 5000;

type Planned = { dest: Airport; route: Route; globeRoute: GlobeRoute };
type Phase =
  | { kind: "plan" }
  | { kind: "pass"; planned: Planned }
  | { kind: "flight"; planned: Planned; clock: FlightClock; confirming: boolean }
  | { kind: "arrived"; arrival: ArrivalView };

const root = document.querySelector<HTMLElement>("#app")!;
const globeElement = document.querySelector<HTMLElement>("#globe")!;
const globe = createGlobe(globeElement);

let phase: Phase = { kind: "plan" };
let origin: Airport;
let minutes = DEFAULT_MINUTES;
let flights: Destination[] = [];
let selected: Planned | null = null;
let selectedCode: string | null = null;
let extended = false;
let unlockOpen = false;
let longestMinutes = MAX_MINUTES;
let unlockNote: string | null = null;
let longTripMinutes: number | null = null;
let destQuery = "";
let destResults: Destination[] | null = null;
// A destination picked from search stays when the duration changes.
let pinnedDest = false;
let destSearchId = 0;
let originOpen = false;
let defaultChoices: Airport[] = [];
let choices: Airport[] = [];
let planError: string | null = null;
let sessions: Session[] = [];
let requestId = 0;
let followCamera = true;
let followAfter = 0;

const logbookMinutes = () => sessions.reduce((sum, s) => sum + s.focused_ms, 0) / 60000;
const byId = (id: string) => document.getElementById(id);
const setText = (name: string, value: string) => {
  const element = root.querySelector<HTMLElement>(`[data-t="${name}"]`);
  if (element && element.textContent !== value) element.textContent = value;
};

const renderControl = createRenderControl(globe, globeElement, () => {
  if (phase.kind === "flight") {
    const { planned, clock } = phase;
    const fraction = elapsedMs(clock, Date.now()) / clock.totalMs;
    globe.placePlane(planned.globeRoute, fraction);
    if (followCamera && performance.now() > followAfter) {
      const at = positionAt(planned.route.points, fraction);
      globe.lookAt(at.lat - CAMERA_LAT_OFFSET, at.lon, FLIGHT_CAMERA_ALTITUDE, 0);
    }
  }
  globe.drawOverlay();
});

const shownFlights = () => destResults ?? flights.slice(0, VISIBLE_FLIGHTS);

const sliderMax = () => (extended ? Math.max(MAX_MINUTES, longestMinutes) : MAX_MINUTES);

async function refreshLongest() {
  longestMinutes = await longestFlight(origin.iata);
  minutes = Math.min(minutes, sliderMax());
  if (phase.kind === "plan") render();
}

function resetDestSearch() {
  destSearchId += 1;
  destQuery = "";
  destResults = null;
}

function syncMarkers() {
  const listed = shownFlights().map((f) => f.airport);
  const keepSelected = selected && !listed.some((a) => a.iata === selected?.dest.iata) ? [selected.dest] : [];
  const destinations = phase.kind === "plan" ? [...listed, ...keepSelected] : selected ? [selected.dest] : [];
  globe.setMarkers({ origin, destinations, selected: selectedCode });
  renderControl.refresh();
}

function moveCamera(lat: number, lon: number, altitude: number) {
  globe.lookAt(lat, lon, altitude, CAMERA_MOVE_MS);
  renderControl.hold(CAMERA_MOVE_MS + 100);
}

function render() {
  const top = header(logbookMinutes(), sessions.length);
  globeElement.classList.toggle("plan-shift", phase.kind === "plan" && window.innerWidth > 980);
  if (phase.kind === "plan") {
    root.innerHTML =
      top +
      planPanel({ origin, minutes, flights: shownFlights(), selected: selectedCode, originOpen, choices, destQuery, extended, unlockOpen, unlockNote, maxMinutes: sliderMax(), error: planError });
  } else if (phase.kind === "pass") {
    root.innerHTML = top + boardingPass(origin, phase.planned.dest, minutes);
  } else if (phase.kind === "flight") {
    root.innerHTML = top + flightHud(origin, phase.planned.dest, phase.clock.paused, phase.confirming);
    updateFlightText();
  } else {
    root.innerHTML = top + arrivalPanel(phase.arrival);
  }
  syncMarkers();
}

function updatePlanParts() {
  const list = byId("flights");
  if (list) list.innerHTML = flightList(shownFlights(), selectedCode, minutes, destQuery.trim() !== "");
  const board = byId("board") as HTMLButtonElement | null;
  if (board) {
    board.disabled = !selectedCode;
    board.innerHTML = ctaContent(origin.iata, selectedCode);
  }
  syncMarkers();
}

function updateDurationParts() {
  const text = formatMinutes(minutes);
  const slider = byId("duration") as HTMLInputElement | null;
  if (slider) {
    slider.value = String(minutes);
    slider.style.setProperty("--p", `${percentOf(minutes, sliderMax())}%`);
    slider.setAttribute("aria-valuetext", text);
  }
  byId("duration-label")!.textContent = text;
  byId("flights-title")!.textContent = `FLIGHTS NEAR ${text.toUpperCase()}`;
  byId("presets")!.innerHTML = presetButtons(minutes);
  byId("limit")!.innerHTML = limitControl(minutes, extended, sliderMax());
}

function clearSelection() {
  selected = null;
  selectedCode = null;
  pinnedDest = false;
  globe.showRoute(null);
  renderControl.refresh();
}

async function refreshFlights() {
  const id = ++requestId;
  try {
    const found = await findDestinations(origin.iata, minutes);
    if (id !== requestId) return;
    flights = found;
    planError = null;
    if (!pinnedDest && !found.slice(0, VISIBLE_FLIGHTS).some((f) => f.airport.iata === selectedCode)) clearSelection();
    updatePlanParts();
  } catch (error) {
    if (id === requestId) showPlanError(error);
  }
}

function showPlanError(error: unknown) {
  planError = String(error);
  if (phase.kind === "plan") render();
}

async function pickDestination(code: string) {
  const dest = shownFlights().find((f) => f.airport.iata === code)?.airport;
  if (!dest) return;
  const id = ++requestId;
  selectedCode = code;
  pinnedDest = destResults !== null;
  updatePlanParts();
  try {
    const route = await planRoute(origin.iata, code);
    if (id !== requestId) return;
    const globeRoute = { points: route.points, height: arcHeight(route.distance_km) };
    selected = { dest, route, globeRoute };
    globe.showRoute(globeRoute);
    const middle = positionAt(route.points, 0.5);
    moveCamera(middle.lat, middle.lon, Math.min(2.4, Math.max(PLAN_CAMERA_ALTITUDE, 0.9 + (route.distance_km / 6371) * 1.2)));
    if (pinnedDest && route.duration_minutes > MAX_MINUTES) offerLongHaul(dest, route);
  } catch (error) {
    if (id === requestId) showPlanError(error);
  }
}

function offerLongHaul(dest: Airport, route: Route) {
  const timer = Math.ceil(route.duration_minutes / 5) * 5;
  if (extended) {
    minutes = timer;
    updateDurationParts();
    void refreshFlights();
    return;
  }
  longTripMinutes = timer;
  unlockNote = `${origin.iata} to ${dest.iata} is a ${formatMinutes(route.duration_minutes)} flight. Unlock long-haul and your focus timer becomes ${formatMinutes(timer)}.`;
  unlockOpen = true;
  render();
}

async function chooseOrigin(code: string) {
  const airport = [...choices, ...defaultChoices].find((a) => a.iata === code);
  if (!airport) return;
  origin = airport;
  originOpen = false;
  choices = defaultChoices;
  resetDestSearch();
  clearSelection();
  moveCamera(origin.lat, origin.lon, PLAN_CAMERA_ALTITUDE);
  flights = [];
  render();
  await refreshLongest();
  await refreshFlights();
}

function setMinutes(value: number) {
  minutes = value;
  updateDurationParts();
  void refreshFlights();
}

let flightSavedAt = 0;
function storeFlight() {
  if (phase.kind !== "flight") return;
  flightSavedAt = Date.now();
  try {
    localStorage.setItem(FLIGHT_KEY, encodeFlight({ origin, dest: phase.planned.dest, minutes, clock: phase.clock }, flightSavedAt));
  } catch (error) {
    console.warn("Could not save the flight", error);
  }
}

function clearStoredFlight() {
  try {
    localStorage.removeItem(FLIGHT_KEY);
  } catch (error) {
    console.warn("Could not clear the saved flight", error);
  }
}

function readStoredFlight() {
  try {
    return decodeFlight(localStorage.getItem(FLIGHT_KEY));
  } catch {
    return null;
  }
}

async function restoreFlight(saved: SavedFlight) {
  const route = await planRoute(saved.origin.iata, saved.dest.iata);
  const globeRoute = { points: route.points, height: arcHeight(route.distance_km) };
  selected = { dest: saved.dest, route, globeRoute };
  selectedCode = saved.dest.iata;
  globe.showRoute(globeRoute);
  phase = { kind: "flight", planned: selected, clock: saved.clock, confirming: false };
  followCamera = true;
  followAfter = 0;
  renderControl.setFlying(true);
}

function takeOff() {
  if (phase.kind !== "pass") return;
  const { planned } = phase;
  phase = { kind: "flight", planned, clock: startClock(Date.now(), minutes * 60000), confirming: false };
  storeFlight();
  followCamera = true;
  followAfter = performance.now() + CAMERA_MOVE_MS;
  const start = planned.route.points[0];
  globe.placePlane(planned.globeRoute, 0);
  moveCamera(start.lat - CAMERA_LAT_OFFSET, start.lon, FLIGHT_CAMERA_ALTITUDE);
  renderControl.setFlying(true);
  render();
}

async function land(diverted: boolean) {
  if (phase.kind !== "flight") return;
  const { planned, clock } = phase;
  const now = Date.now();
  const focusedMs = elapsedMs(clock, now);
  const distanceKm = planned.route.distance_km * (diverted ? focusedMs / clock.totalMs : 1);
  const session: Session = {
    origin_iata: origin.iata,
    dest_iata: planned.dest.iata,
    distance_km: distanceKm,
    planned_minutes: minutes,
    focused_ms: Math.round(focusedMs),
    started_at_ms: clock.startedAt,
    ended_at_ms: diverted ? now : landingTime(clock, now),
    status: diverted ? "cancelled" : "completed",
  };

  const arrival: ArrivalView = {
    city: planned.dest.city || planned.dest.name,
    dest: planned.dest.iata,
    diverted,
    focusedMinutes: focusedMs / 60000,
    distanceKm,
    logbookMinutes: logbookMinutes() + focusedMs / 60000,
    saveError: null,
  };
  phase = { kind: "arrived", arrival };
  globe.hidePlane();
  renderControl.setFlying(false);
  if (!diverted) moveCamera(planned.dest.lat - 6, planned.dest.lon, ARRIVAL_CAMERA_ALTITUDE);
  render();

  try {
    await saveSession(session);
    // Only after a successful save, so a failed save can be retried on next launch.
    clearStoredFlight();
    sessions = await listSessions();
    arrival.logbookMinutes = logbookMinutes();
  } catch (error) {
    arrival.saveError = String(error);
  }
  if (phase.kind === "arrived" && phase.arrival === arrival) render();
}

function planAgain(arrival: ArrivalView, dest: Airport | undefined) {
  if (!arrival.diverted && dest) origin = dest;
  phase = { kind: "plan" };
  resetDestSearch();
  clearSelection();
  moveCamera(origin.lat, origin.lon, PLAN_CAMERA_ALTITUDE);
  flights = [];
  render();
  void refreshLongest().then(refreshFlights);
}

function updateFlightText() {
  if (phase.kind !== "flight") return;
  const { clock, planned } = phase;
  const elapsed = elapsedMs(clock, Date.now());
  const fraction = elapsed / clock.totalMs;
  const percent = `${(fraction * 100).toFixed(2)}%`;
  setText("remaining", formatClock(clock.totalMs - elapsed));
  setText("status", statusLabel(fraction, clock.paused));
  setText("km", `${Math.round(planned.route.distance_km * (1 - fraction)).toLocaleString("en-US")} KM`);
  setText("alt", `${altitudeFeet(fraction).toLocaleString("en-US")} FT`);
  setText("focused", formatMinutes(elapsed / 60000));
  root.querySelector<HTMLElement>('[data-t="bar"]')?.style.setProperty("width", percent);
  root.querySelector<HTMLElement>('[data-t="dot"]')?.style.setProperty("left", percent);
}

function tick() {
  if (phase.kind !== "flight") return;
  if (!phase.clock.paused && elapsedMs(phase.clock, Date.now()) >= phase.clock.totalMs) {
    void land(false);
    return;
  }
  if (!phase.clock.paused && Date.now() - flightSavedAt >= FLIGHT_SAVE_MS) storeFlight();
  if (!document.hidden) updateFlightText();
}

const actions: Record<string, (value: string) => void> = {
  "toggle-origin": () => {
    originOpen = !originOpen;
    choices = defaultChoices;
    render();
  },
  origin: (code) => void chooseOrigin(code),
  preset: (value) => setMinutes(Number(value)),
  pick: (code) => void pickDestination(code),
  "open-unlock": () => {
    unlockOpen = true;
    render();
  },
  "close-unlock": () => {
    if (longTripMinutes !== null) clearSelection();
    longTripMinutes = null;
    unlockNote = null;
    unlockOpen = false;
    render();
  },
  "confirm-unlock": () => {
    const timer = longTripMinutes;
    extended = true;
    longTripMinutes = null;
    unlockNote = null;
    unlockOpen = false;
    if (timer !== null && selected) {
      minutes = timer;
      phase = { kind: "pass", planned: selected };
      void refreshFlights();
    }
    render();
  },
  "lock-back": () => {
    extended = false;
    minutes = Math.min(MAX_MINUTES, minutes);
    render();
    void refreshFlights();
  },
  board: () => {
    if (selected && selected.dest.iata === selectedCode) {
      phase = { kind: "pass", planned: selected };
      render();
    }
  },
  "cancel-pass": () => {
    phase = { kind: "plan" };
    render();
  },
  takeoff: takeOff,
  "toggle-pause": () => {
    if (phase.kind !== "flight") return;
    const now = Date.now();
    phase = { ...phase, clock: phase.clock.paused ? resumeClock(phase.clock, now) : pauseClock(phase.clock, now) };
    storeFlight();
    render();
  },
  "ask-end": () => {
    if (phase.kind === "flight") {
      phase = { ...phase, confirming: true };
      render();
    }
  },
  "keep-flying": () => {
    if (phase.kind === "flight") {
      phase = { ...phase, confirming: false };
      render();
    }
  },
  divert: () => void land(true),
  again: () => {
    if (phase.kind !== "arrived") return;
    const { arrival } = phase;
    planAgain(arrival, selected?.dest);
  },
};

root.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (button && !(button as HTMLButtonElement).disabled) actions[button.dataset.action!]?.(button.dataset.value ?? "");
});

root.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id === "duration") setMinutes(Number(input.value));
  if (input.id === "origin-search") void searchOrigins(input.value);
  if (input.id === "dest-search") void searchDest(input.value);
});

async function searchDest(query: string) {
  const id = ++destSearchId;
  destQuery = query;
  try {
    const found = query.trim() ? await searchDestinations(origin.iata, query) : null;
    if (id !== destSearchId) return;
    destResults = found;
    updatePlanParts();
  } catch (error) {
    if (id === destSearchId) showPlanError(error);
  }
}

let searchId = 0;
async function searchOrigins(query: string) {
  const id = ++searchId;
  const found = query.trim() ? await searchAirports(query) : defaultChoices;
  if (id !== searchId) return;
  choices = found;
  const box = byId("origin-choices");
  if (box) box.innerHTML = originChoices(choices, origin.iata);
}

let pressAt: { x: number; y: number } | null = null;
globeElement.addEventListener("pointerdown", (event) => {
  followCamera = false;
  pressAt = { x: event.clientX, y: event.clientY };
});
window.addEventListener("pointerup", (event) => {
  const press = pressAt;
  pressAt = null;
  if (!press || phase.kind !== "plan") return;
  if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_MOVE_PX) return;
  const code = globe.markerAt(event.clientX, event.clientY);
  if (code) void pickDestination(code);
});
globeElement.addEventListener("wheel", () => { followCamera = false; }, { capture: true, passive: true });
window.addEventListener("resize", () => renderControl.refresh());
void document.fonts.ready.then(() => renderControl.refresh());

document.addEventListener("visibilitychange", tick);
setInterval(tick, UI_TICK_MS);

async function start() {
  const results = await Promise.all(DEFAULT_ORIGINS.map(searchAirports));
  defaultChoices = results.flatMap((list, i) => list.filter((a) => a.iata === DEFAULT_ORIGINS[i]));
  choices = defaultChoices;
  const saved = readStoredFlight();
  origin = saved?.origin ?? defaultChoices[0];
  if (saved) {
    minutes = saved.minutes;
    extended = minutes > MAX_MINUTES;
  }
  sessions = await listSessions();
  longestMinutes = await longestFlight(origin.iata);
  flights = await findDestinations(origin.iata, minutes);
  if (saved) await restoreFlight(saved).catch((error) => console.warn("Could not restore the flight", error));
  render();
  if (phase.kind === "plan") globe.lookAt(origin.lat, origin.lon, PLAN_CAMERA_ALTITUDE, 0);
  renderControl.hold(1500);
}

start().catch((error) => {
  root.innerHTML = `<p role="alert" class="absolute left-6 top-6 text-sm text-acc"></p>`;
  root.querySelector("p")!.textContent = `Meridian could not start: ${error}`;
});
