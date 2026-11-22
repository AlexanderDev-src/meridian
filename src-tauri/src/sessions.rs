use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Completed,
    Cancelled,
}

impl Status {
    fn as_str(self) -> &'static str {
        match self {
            Status::Completed => "completed",
            Status::Cancelled => "cancelled",
        }
    }

    fn parse(text: &str) -> Option<Self> {
        match text {
            "completed" => Some(Status::Completed),
            "cancelled" => Some(Status::Cancelled),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Session {
    pub origin_iata: String,
    pub dest_iata: String,
    pub distance_km: f64,
    pub planned_minutes: u32,
    pub focused_ms: i64,
    pub started_at_ms: i64,
    pub ended_at_ms: i64,
    pub status: Status,
}

pub fn open(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY,
            origin_iata TEXT NOT NULL,
            dest_iata TEXT NOT NULL,
            distance_km REAL NOT NULL,
            planned_minutes INTEGER NOT NULL,
            focused_ms INTEGER NOT NULL,
            started_at_ms INTEGER NOT NULL,
            ended_at_ms INTEGER NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('completed', 'cancelled'))
        );",
    )
}

fn validate(s: &Session) -> Result<(), String> {
    let valid = s.distance_km.is_finite()
        && s.distance_km >= 0.0
        && s.planned_minutes > 0
        && s.focused_ms >= 0
        && s.ended_at_ms >= s.started_at_ms;
    valid.then_some(()).ok_or_else(|| "invalid session".to_string())
}

pub fn save(db: &Connection, s: &Session) -> Result<(), String> {
    validate(s)?;
    db.execute(
        "INSERT INTO sessions (origin_iata, dest_iata, distance_km, planned_minutes,
            focused_ms, started_at_ms, ended_at_ms, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            s.origin_iata,
            s.dest_iata,
            s.distance_km,
            s.planned_minutes,
            s.focused_ms,
            s.started_at_ms,
            s.ended_at_ms,
            s.status.as_str()
        ],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// Returns sessions newest first.
pub fn list(db: &Connection) -> Result<Vec<Session>, String> {
    let mut query = db
        .prepare(
            "SELECT origin_iata, dest_iata, distance_km, planned_minutes, focused_ms,
                started_at_ms, ended_at_ms, status
             FROM sessions ORDER BY ended_at_ms DESC, id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = query
        .query_map([], |r| {
            let status: String = r.get(7)?;
            Ok(Session {
                origin_iata: r.get(0)?,
                dest_iata: r.get(1)?,
                distance_km: r.get(2)?,
                planned_minutes: r.get(3)?,
                focused_ms: r.get(4)?,
                started_at_ms: r.get(5)?,
                ended_at_ms: r.get(6)?,
                status: Status::parse(&status).ok_or(rusqlite::Error::InvalidQuery)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(ended_at_ms: i64, status: Status) -> Session {
        Session {
            origin_iata: "BKK".into(),
            dest_iata: "HKG".into(),
            distance_km: 1690.0,
            planned_minutes: 125,
            focused_ms: 60_000,
            started_at_ms: 0,
            ended_at_ms,
            status,
        }
    }

    #[test]
    fn saves_and_lists_newest_first() {
        let db = Connection::open_in_memory().unwrap();
        open(&db).unwrap();
        save(&db, &session(10, Status::Completed)).unwrap();
        save(&db, &session(20, Status::Cancelled)).unwrap();
        assert_eq!(list(&db).unwrap(), vec![session(20, Status::Cancelled), session(10, Status::Completed)]);
    }

    #[test]
    fn rejects_a_session_that_ends_before_it_starts() {
        let db = Connection::open_in_memory().unwrap();
        open(&db).unwrap();
        assert!(save(&db, &session(-1, Status::Completed)).is_err());
    }
}
