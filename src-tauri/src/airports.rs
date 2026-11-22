use crate::geo::{flight_minutes, great_circle, haversine_km, LatLon, ROUTE_POINTS};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::Path;

const MAX_SEARCH_RESULTS: usize = 20;
const TIME_WINDOW: f64 = 0.10;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Airport {
    pub iata: String,
    pub name: String,
    pub city: String,
    pub country: String,
    pub lat: f64,
    pub lon: f64,
}

impl Airport {
    fn position(&self) -> LatLon {
        LatLon { lat: self.lat, lon: self.lon }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Destination {
    pub airport: Airport,
    pub distance_km: f64,
    pub duration_minutes: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Route {
    pub distance_km: f64,
    pub duration_minutes: f64,
    pub points: Vec<LatLon>,
}

pub fn load(path: &Path) -> rusqlite::Result<Vec<Airport>> {
    let db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut query = db.prepare("SELECT iata, name, city, country, lat, lon FROM airports")?;
    let rows = query.query_map([], |r| {
        Ok(Airport {
            iata: r.get(0)?,
            name: r.get(1)?,
            city: r.get(2)?,
            country: r.get(3)?,
            lat: r.get(4)?,
            lon: r.get(5)?,
        })
    })?;
    rows.collect()
}

fn find<'a>(airports: &'a [Airport], iata: &str) -> Result<&'a Airport, String> {
    airports
        .iter()
        .find(|a| a.iata.eq_ignore_ascii_case(iata))
        .ok_or_else(|| format!("unknown airport: {iata}"))
}

fn search_rank(airport: &Airport, query: &str, countries: &[String]) -> Option<u8> {
    let (iata, city, name) =
        (airport.iata.to_lowercase(), airport.city.to_lowercase(), airport.name.to_lowercase());
    match () {
        _ if iata == query => Some(0),
        _ if iata.starts_with(query) => Some(1),
        _ if city.starts_with(query) => Some(2),
        _ if city.contains(query) || name.contains(query) => Some(3),
        _ if countries.contains(&airport.country) => Some(4),
        _ => None,
    }
}

/// `countries` holds ISO codes matched from the text; a country search lists all its airports.
pub fn search(airports: &[Airport], query: &str, countries: &[String]) -> Vec<Airport> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Vec::new();
    }
    let mut hits: Vec<(u8, &Airport)> = airports
        .iter()
        .filter_map(|a| search_rank(a, &query, countries).map(|rank| (rank, a)))
        .collect();
    hits.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.iata.cmp(&b.1.iata)));
    let limit = if countries.is_empty() { MAX_SEARCH_RESULTS } else { hits.len() };
    hits.into_iter().take(limit).map(|(_, a)| a.clone()).collect()
}

/// Finds any airport by text, with its distance from the origin.
pub fn search_destinations(
    airports: &[Airport],
    origin_iata: &str,
    query: &str,
    countries: &[String],
) -> Result<Vec<Destination>, String> {
    let origin = find(airports, origin_iata)?;
    let others: Vec<Airport> = airports.iter().filter(|a| a.iata != origin.iata).cloned().collect();
    Ok(search(&others, query, countries)
        .into_iter()
        .map(|airport| {
            let distance_km = haversine_km(origin.position(), airport.position());
            Destination { airport, distance_km, duration_minutes: flight_minutes(distance_km) }
        })
        .collect())
}

/// Returns airports within 10% of `minutes`, closest match first.
pub fn destinations(
    airports: &[Airport],
    origin_iata: &str,
    minutes: u32,
) -> Result<Vec<Destination>, String> {
    if minutes == 0 {
        return Err("minutes must be above zero".into());
    }
    let origin = find(airports, origin_iata)?;
    let target = f64::from(minutes);
    let mut found: Vec<Destination> = airports
        .iter()
        .filter(|a| a.iata != origin.iata)
        .map(|a| {
            let distance_km = haversine_km(origin.position(), a.position());
            Destination { airport: a.clone(), distance_km, duration_minutes: flight_minutes(distance_km) }
        })
        .filter(|d| (d.duration_minutes - target).abs() <= target * TIME_WINDOW)
        .collect();
    found.sort_by(|a, b| {
        (a.duration_minutes - target).abs().total_cmp(&(b.duration_minutes - target).abs())
    });
    Ok(found)
}

/// Returns the longest flight from the origin, rounded up to 5 minutes.
pub fn longest_minutes(airports: &[Airport], origin_iata: &str) -> Result<u32, String> {
    let origin = find(airports, origin_iata)?;
    let longest = airports
        .iter()
        .map(|a| flight_minutes(haversine_km(origin.position(), a.position())))
        .fold(0.0, f64::max);
    Ok((longest / 5.0).ceil() as u32 * 5)
}

pub fn route(airports: &[Airport], origin_iata: &str, dest_iata: &str) -> Result<Route, String> {
    let (from, to) = (find(airports, origin_iata)?.position(), find(airports, dest_iata)?.position());
    let distance_km = haversine_km(from, to);
    Ok(Route {
        distance_km,
        duration_minutes: flight_minutes(distance_km),
        points: great_circle(from, to, ROUTE_POINTS),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn airport(iata: &str, city: &str, lat: f64, lon: f64) -> Airport {
        Airport {
            iata: iata.into(),
            name: format!("{city} International"),
            city: city.into(),
            country: "XX".into(),
            lat,
            lon,
        }
    }

    fn fixture() -> Vec<Airport> {
        vec![
            airport("BKK", "Bangkok", 13.681, 100.747),
            airport("CNX", "Chiang Mai", 18.767, 98.963),
            airport("SIN", "Singapore", 1.359, 103.989),
            airport("HKG", "Hong Kong", 22.309, 113.915),
            airport("NRT", "Tokyo", 35.765, 140.386),
            airport("LAX", "Los Angeles", 33.9425, -118.408),
        ]
    }

    #[test]
    fn find_destinations_returns_only_airports_in_the_time_window() {
        let airports = fixture();
        let found = destinations(&airports, "BKK", 125).unwrap();
        let codes: Vec<&str> = found.iter().map(|d| d.airport.iata.as_str()).collect();
        assert_eq!(codes, ["HKG"]);
        assert!((112.5..=137.5).contains(&found[0].duration_minutes));
    }

    #[test]
    fn find_destinations_rejects_bad_input() {
        assert!(destinations(&fixture(), "BKK", 0).is_err());
        assert!(destinations(&fixture(), "ZZZ", 50).is_err());
    }

    #[test]
    fn search_matches_code_city_and_name_with_exact_code_first() {
        let airports = fixture();
        assert_eq!(search(&airports, "bkk", &[])[0].iata, "BKK");
        assert_eq!(search(&airports, "chiang", &[])[0].iata, "CNX");
        assert_eq!(search(&airports, "international", &[]).len(), 6);
        assert!(search(&airports, "  ", &[]).is_empty());
    }

    #[test]
    fn search_destinations_ignores_time_and_excludes_origin() {
        let found = search_destinations(&fixture(), "BKK", "international", &[]).unwrap();
        assert_eq!(found.len(), 5);
        assert!(found.iter().all(|d| d.airport.iata != "BKK" && d.distance_km > 0.0));
        assert!(search_destinations(&fixture(), "ZZZ", "tokyo", &[]).is_err());
    }

    #[test]
    fn country_search_lists_every_airport_past_the_limit() {
        let many: Vec<Airport> = (0..30)
            .map(|i| Airport { country: "JP".into(), ..airport(&format!("A{i:02}"), "Somewhere", 0.0, 0.0) })
            .collect();
        assert_eq!(search(&many, "japan", &["JP".to_string()]).len(), 30);
        assert!(search(&many, "japan", &[]).is_empty());
    }

    #[test]
    fn longest_flight_covers_the_farthest_airport() {
        let airports = fixture();
        let farthest = flight_minutes(haversine_km(airports[0].position(), airports[5].position()));
        let longest = f64::from(longest_minutes(&airports, "BKK").unwrap());
        assert!(longest >= farthest && longest < farthest + 5.0);
    }

    #[test]
    fn search_returns_at_most_20() {
        let many: Vec<Airport> =
            (0..30).map(|i| airport(&format!("A{i:02}"), "Sameville", 0.0, 0.0)).collect();
        assert_eq!(search(&many, "sameville", &[]).len(), MAX_SEARCH_RESULTS);
    }

    #[test]
    fn route_reports_distance_duration_and_128_points() {
        let r = route(&fixture(), "BKK", "NRT").unwrap();
        assert_eq!(r.points.len(), 128);
        assert!((r.duration_minutes - r.distance_km / 800.0 * 60.0).abs() < 1e-9);
    }
}
