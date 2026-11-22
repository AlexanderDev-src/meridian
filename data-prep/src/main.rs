use rusqlite::{params, Connection};
use std::{env, error::Error, fs, path::Path};

#[derive(Debug, PartialEq)]
struct Airport {
    iata: String,
    name: String,
    city: String,
    country: String,
    lat: f64,
    lon: f64,
    is_large: bool,
}

/// Parses RFC 4180 CSV, including quoted commas, quotes and newlines.
fn parse_csv(text: &str) -> Vec<Vec<String>> {
    let (mut rows, mut row, mut field) = (Vec::new(), Vec::new(), String::new());
    let mut quoted = false;
    let mut chars = text.chars().peekable();

    while let Some(c) = chars.next() {
        match (quoted, c) {
            (true, '"') if chars.peek() == Some(&'"') => {
                chars.next();
                field.push('"');
            }
            (true, '"') => quoted = false,
            (true, _) => field.push(c),
            (false, '"') => quoted = true,
            (false, ',') => row.push(std::mem::take(&mut field)),
            (false, '\r') => {}
            (false, '\n') => {
                row.push(std::mem::take(&mut field));
                rows.push(std::mem::take(&mut row));
            }
            (false, _) => field.push(c),
        }
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }
    rows
}

fn column(header: &[String], name: &str) -> Result<usize, String> {
    header
        .iter()
        .position(|h| h == name)
        .ok_or_else(|| format!("airports.csv has no `{name}` column"))
}

fn select_airports(rows: &[Vec<String>]) -> Result<Vec<Airport>, String> {
    let header = rows.first().ok_or("airports.csv is empty")?;
    let kind = column(header, "type")?;
    let name = column(header, "name")?;
    let lat = column(header, "latitude_deg")?;
    let lon = column(header, "longitude_deg")?;
    let country = column(header, "iso_country")?;
    let city = column(header, "municipality")?;
    let iata = column(header, "iata_code")?;
    let last = [kind, name, lat, lon, country, city, iata].into_iter().max().unwrap_or(0);

    let mut airports: Vec<Airport> = rows[1..]
        .iter()
        .filter(|r| r.len() > last)
        .filter(|r| matches!(r[kind].as_str(), "large_airport" | "medium_airport"))
        .filter(|r| !r[iata].trim().is_empty())
        .filter_map(|r| {
            let (lat, lon) = (r[lat].parse::<f64>().ok()?, r[lon].parse::<f64>().ok()?);
            ((-90.0..=90.0).contains(&lat) && (-180.0..=180.0).contains(&lon)).then(|| Airport {
                iata: r[iata].trim().to_uppercase(),
                name: r[name].clone(),
                city: r[city].clone(),
                country: r[country].clone(),
                lat,
                lon,
                is_large: r[kind] == "large_airport",
            })
        })
        .collect();

    // A few IATA codes repeat: keep the larger airport.
    airports.sort_by(|a, b| a.iata.cmp(&b.iata).then(b.is_large.cmp(&a.is_large)));
    airports.dedup_by(|next, kept| next.iata == kept.iata);
    Ok(airports)
}

fn write_db(airports: &[Airport], out: &Path) -> Result<(), Box<dyn Error>> {
    let tmp = out.with_extension("sqlite.tmp");
    let _ = fs::remove_file(&tmp);
    let mut db = Connection::open(&tmp)?;
    let tx = db.transaction()?;
    tx.execute_batch(
        "CREATE TABLE airports (
            iata TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL,
            country TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL
        ) WITHOUT ROWID;",
    )?;
    {
        let mut insert = tx.prepare("INSERT INTO airports VALUES (?1, ?2, ?3, ?4, ?5, ?6)")?;
        for a in airports {
            insert.execute(params![a.iata, a.name, a.city, a.country, a.lat, a.lon])?;
        }
    }
    tx.commit()?;
    db.close().map_err(|(_, e)| e)?;
    // Rename last, so a failed run keeps the old database.
    fs::rename(&tmp, out)?;
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args().skip(1);
    let input = args.next().unwrap_or_else(|| "data/airports.csv".into());
    let output = args.next().unwrap_or_else(|| "src-tauri/resources/airports.sqlite".into());

    let text = fs::read_to_string(&input).map_err(|e| format!("cannot read {input}: {e}"))?;
    let airports = select_airports(&parse_csv(&text))?;
    if airports.is_empty() {
        return Err("no airports matched, keeping the existing database".into());
    }
    if let Some(dir) = Path::new(&output).parent() {
        fs::create_dir_all(dir)?;
    }
    write_db(&airports, Path::new(&output))?;
    println!("wrote {} airports to {output}", airports.len());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const CSV: &str = "type,name,latitude_deg,longitude_deg,iso_country,municipality,iata_code\n\
medium_airport,Duplicate,1,2,TH,Elsewhere,BKK\n\
large_airport,\"Big, \"\"Main\"\" Intl\",10,20,TH,Bangkok,BKK\n\
medium_airport,No Code,1,2,TH,Nowhere,\n\
small_airport,Small,1,2,TH,Tiny,SML\n\
medium_airport,Bad Latitude,95,2,TH,Broken,BAD\n";

    #[test]
    fn keeps_only_valid_large_and_medium_airports() {
        let airports = select_airports(&parse_csv(CSV)).unwrap();
        assert_eq!(airports.len(), 1);
        assert_eq!(airports[0].iata, "BKK");
        assert_eq!(airports[0].name, "Big, \"Main\" Intl");
    }

    #[test]
    fn reports_a_missing_column() {
        assert!(select_airports(&parse_csv("type,name\nlarge_airport,X\n")).is_err());
    }
}
