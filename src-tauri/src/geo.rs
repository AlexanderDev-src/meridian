use serde::Serialize;
use std::f64::consts::PI;

pub const EARTH_RADIUS_KM: f64 = 6371.0;
pub const CRUISE_KMH: f64 = 800.0;
pub const ROUTE_POINTS: usize = 128;
const PARALLEL_EPSILON: f64 = 1e-9;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct LatLon {
    pub lat: f64,
    pub lon: f64,
}

type Vec3 = [f64; 3];

fn dot(a: Vec3, b: Vec3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn cross(a: Vec3, b: Vec3) -> Vec3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn scale(a: Vec3, k: f64) -> Vec3 {
    [a[0] * k, a[1] * k, a[2] * k]
}

fn add(a: Vec3, b: Vec3) -> Vec3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

fn normalized(a: Vec3) -> Vec3 {
    scale(a, 1.0 / dot(a, a).sqrt())
}

fn to_unit(p: LatLon) -> Vec3 {
    let (lat, lon) = (p.lat.to_radians(), p.lon.to_radians());
    [lat.cos() * lon.cos(), lat.cos() * lon.sin(), lat.sin()]
}

fn to_lat_lon(v: Vec3) -> LatLon {
    LatLon {
        lat: v[2].clamp(-1.0, 1.0).asin().to_degrees(),
        lon: v[1].atan2(v[0]).to_degrees(),
    }
}

pub fn haversine_km(a: LatLon, b: LatLon) -> f64 {
    let d_lat = (b.lat - a.lat).to_radians();
    let d_lon = (b.lon - a.lon).to_radians();
    let h = (d_lat / 2.0).sin().powi(2)
        + a.lat.to_radians().cos() * b.lat.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
    2.0 * EARTH_RADIUS_KM * h.sqrt().min(1.0).asin()
}

pub fn flight_minutes(distance_km: f64) -> f64 {
    distance_km / CRUISE_KMH * 60.0
}

fn perpendicular(a: Vec3) -> Vec3 {
    let axis = if a[0].abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] };
    normalized(cross(a, axis))
}

fn slerp(a: Vec3, b: Vec3, t: f64) -> Vec3 {
    let sin_d = dot(cross(a, b), cross(a, b)).sqrt();
    let cos_d = dot(a, b);
    if sin_d > PARALLEL_EPSILON {
        let d = sin_d.atan2(cos_d);
        add(scale(a, ((1.0 - t) * d).sin() / sin_d), scale(b, (t * d).sin() / sin_d))
    } else if cos_d > 0.0 {
        normalized(add(scale(a, 1.0 - t), scale(b, t)))
    } else {
        // Antipodes have endless great circles, so pick one.
        add(scale(a, (PI * t).cos()), scale(perpendicular(a), (PI * t).sin()))
    }
}

/// Keeps longitude continuous, so it may leave [-180, 180] past the antimeridian.
fn unwrap_longitudes(points: Vec<LatLon>) -> Vec<LatLon> {
    points
        .into_iter()
        .scan(None, |previous: &mut Option<f64>, p| {
            let lon = previous.map_or(p.lon, |prev| p.lon + 360.0 * ((prev - p.lon) / 360.0).round());
            *previous = Some(lon);
            Some(LatLon { lat: p.lat, lon })
        })
        .collect()
}

pub fn great_circle(from: LatLon, to: LatLon, count: usize) -> Vec<LatLon> {
    let (a, b) = (to_unit(from), to_unit(to));
    let last = count.saturating_sub(1).max(1);
    let points = (0..count)
        .map(|i| match i {
            0 => from,
            i if i == last => to,
            i => to_lat_lon(slerp(a, b, i as f64 / last as f64)),
        })
        .collect();
    unwrap_longitudes(points)
}

#[cfg(test)]
mod tests {
    use super::*;

    const BKK: LatLon = LatLon { lat: 13.681, lon: 100.747 };
    const NRT: LatLon = LatLon { lat: 35.765, lon: 140.386 };
    const LAX: LatLon = LatLon { lat: 33.9425, lon: -118.408 };

    fn same_longitude(a: f64, b: f64) -> bool {
        ((a - b).rem_euclid(360.0)).min((b - a).rem_euclid(360.0)) < 1e-9
    }

    #[test]
    fn haversine_bkk_nrt_is_about_4600_km() {
        let km = haversine_km(BKK, NRT);
        assert!((km - 4600.0).abs() / 4600.0 < 0.02, "got {km}");
    }

    #[test]
    fn slerp_endpoints_equal_origin_and_destination() {
        let path = great_circle(BKK, NRT, ROUTE_POINTS);
        assert_eq!(path.len(), ROUTE_POINTS);
        assert_eq!(path[0], BKK);
        assert_eq!(path[ROUTE_POINTS - 1], NRT);
    }

    #[test]
    fn antimeridian_route_has_no_longitude_jump() {
        let path = great_circle(NRT, LAX, ROUTE_POINTS);
        let biggest = path.windows(2).map(|w| (w[1].lon - w[0].lon).abs()).fold(0.0, f64::max);
        assert!(biggest < 5.0, "largest step {biggest}");
        assert!(path.iter().any(|p| p.lon > 180.0), "route should cross the antimeridian");
        assert_eq!(path[ROUTE_POINTS - 1].lat, LAX.lat);
        assert!(same_longitude(path[ROUTE_POINTS - 1].lon, LAX.lon));
    }

    #[test]
    fn identical_points_stay_put() {
        let path = great_circle(BKK, BKK, ROUTE_POINTS);
        assert!(path.iter().all(|p| (p.lat - BKK.lat).abs() < 1e-9 && same_longitude_loose(p.lon, BKK.lon)));
    }

    fn same_longitude_loose(a: f64, b: f64) -> bool {
        ((a - b).rem_euclid(360.0)).min((b - a).rem_euclid(360.0)) < 1e-6
    }

    #[test]
    fn antipodal_points_give_a_valid_half_circle() {
        let antipode = LatLon { lat: -BKK.lat, lon: BKK.lon - 180.0 };
        let path = great_circle(BKK, antipode, ROUTE_POINTS);
        assert!(path.iter().all(|p| p.lat.is_finite() && p.lon.is_finite()));
        let step = haversine_km(path[0], path[1]);
        let expected = PI * EARTH_RADIUS_KM / (ROUTE_POINTS - 1) as f64;
        assert!((step - expected).abs() < 1.0, "step {step}, expected {expected}");
    }
}
