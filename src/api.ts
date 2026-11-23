import { invoke } from "@tauri-apps/api/core";
import { countryCodes } from "./country";

export type Airport = {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
};

export type Destination = { airport: Airport; distance_km: number; duration_minutes: number };
export type LatLon = { lat: number; lon: number };
export type Route = { distance_km: number; duration_minutes: number; points: LatLon[] };

export type Session = {
  origin_iata: string;
  dest_iata: string;
  distance_km: number;
  planned_minutes: number;
  focused_ms: number;
  started_at_ms: number;
  ended_at_ms: number;
  status: "completed" | "cancelled";
  tag: string | null;
};

export const searchAirports = (query: string) =>
  invoke<Airport[]>("search_airports", { query, countries: countryCodes(query) });

export const findDestinations = (originIata: string, minutes: number) =>
  invoke<Destination[]>("find_destinations", { originIata, minutes });

export const searchDestinations = (originIata: string, query: string) =>
  invoke<Destination[]>("search_destinations", { originIata, query, countries: countryCodes(query) });

export const airportsByCode = (codes: string[]) => invoke<Airport[]>("airports_by_code", { codes });

export const longestFlight =(originIata: string) => invoke<number>("longest_flight", { originIata });

export const planRoute = (originIata: string, destIata: string) =>
  invoke<Route>("plan_route", { originIata, destIata });

export const saveSession = (session: Session) => invoke<void>("save_session", { session });
export const listSessions = () => invoke<Session[]>("list_sessions");
export const notifyDesktop = (title: string, body: string) => invoke<void>("notify", { title, body });
export const publishFlight = (json: string | null) => invoke<void>("publish_flight", { json });
export const devLog =(message: string) => invoke<void>("dev_log", { message });
