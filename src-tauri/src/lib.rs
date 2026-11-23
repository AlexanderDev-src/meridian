mod airports;
mod geo;
mod sessions;

use airports::{Airport, Destination, Route};
use rusqlite::Connection;
use sessions::Session;
use std::{fs, process::Command, sync::Mutex};
use tauri::{Manager, State};

struct AppState {
    airports: Vec<Airport>,
    sessions: Mutex<Connection>,
}

impl AppState {
    fn with_sessions<T>(
        &self,
        action: impl FnOnce(&Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        action(&*self.sessions.lock().map_err(|_| "session database is locked".to_string())?)
    }
}

#[tauri::command]
fn search_airports(state: State<AppState>, query: String, countries: Vec<String>) -> Vec<Airport> {
    airports::search(&state.airports, &query, &countries)
}

#[tauri::command]
fn find_destinations(
    state: State<AppState>,
    origin_iata: String,
    minutes: u32,
) -> Result<Vec<Destination>, String> {
    airports::destinations(&state.airports, &origin_iata, minutes)
}

#[tauri::command]
fn search_destinations(
    state: State<AppState>,
    origin_iata: String,
    query: String,
    countries: Vec<String>,
) -> Result<Vec<Destination>, String> {
    airports::search_destinations(&state.airports, &origin_iata, &query, &countries)
}

#[tauri::command(async)]
fn notify(title: String, body: String) -> Result<(), String> {
    let status = Command::new("notify-send")
        .args(["--app-name=Meridian", "--", &title, &body])
        .status()
        .map_err(|error| format!("notify-send is not available: {error}"))?;
    status.success().then_some(()).ok_or_else(|| "the desktop rejected the notification".to_string())
}

// Lets desktop widgets (a Quickshell bar item) follow the flight; written atomically so a reader never sees half a file.
#[tauri::command]
fn publish_flight(app: tauri::AppHandle, json: Option<String>) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join("flight-status.json");
    match json {
        Some(json) => {
            let tmp = dir.join("flight-status.json.tmp");
            fs::write(&tmp, json).map_err(|e| e.to_string())?;
            fs::rename(&tmp, &path).map_err(|e| e.to_string())
        }
        None => match fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        },
    }
}

#[tauri::command]
fn airports_by_code(state: State<AppState>, codes: Vec<String>) -> Vec<Airport> {
    state.airports.iter().filter(|a| codes.contains(&a.iata)).cloned().collect()
}

#[tauri::command]
fn longest_flight(state: State<AppState>, origin_iata: String) -> Result<u32, String> {
    airports::longest_minutes(&state.airports, &origin_iata)
}

#[tauri::command]
fn plan_route(
    state: State<AppState>,
    origin_iata: String,
    dest_iata: String,
) -> Result<Route, String> {
    airports::route(&state.airports, &origin_iata, &dest_iata)
}

#[tauri::command]
fn save_session(state: State<AppState>, session: Session) -> Result<(), String> {
    state.with_sessions(|db| sessions::save(db, &session))
}

#[tauri::command]
fn list_sessions(state: State<AppState>) -> Result<Vec<Session>, String> {
    state.with_sessions(sessions::list)
}

// Prints render stats to the terminal, in dev builds only.
#[tauri::command]
fn dev_log(message: String) {
    if cfg!(debug_assertions) {
        println!("[render] {message}");
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let airport_db = app.path().resource_dir()?.join("airports.sqlite");
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let db = Connection::open(data_dir.join("sessions.sqlite"))?;
            sessions::open(&db)?;
            app.manage(AppState { airports: airports::load(&airport_db)?, sessions: Mutex::new(db) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search_airports,
            find_destinations,
            search_destinations,
            airports_by_code,
            longest_flight,
            plan_route,
            save_session,
            list_sessions,
            notify,
            publish_flight,
            dev_log
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Meridian");
}
