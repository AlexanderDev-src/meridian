# Meridian

A desktop focus timer where each session is a flight. Pick a departure and a duration, board a real route that takes about that long, and watch the plane cross the globe while you work.

Linux only for now. Built with Tauri v2, TypeScript, Vite, Tailwind CSS, globe.gl and SQLite.

## Requirements

- Rust (stable), Node.js and [Bun](https://bun.sh)
- WebKitGTK 4.1 and the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux)

## Setup

```sh
bun install
```

A prepared airport database is already at `src-tauri/resources/airports.sqlite`, so the app runs right away. To rebuild it from the latest data:

### 1. Download airports.csv

Get `airports.csv` from [OurAirports](https://ourairports.com/data/) and put it at `data/airports.csv`:

```sh
curl -L -o data/airports.csv https://davidmegginson.github.io/ourairports-data/airports.csv
```

The file is ignored by git.

### 2. Run the data-prep step

```sh
cargo run -p data-prep
```

This keeps `large_airport` and `medium_airport` rows with an IATA code and writes `src-tauri/resources/airports.sqlite`. If a code appears twice, the larger airport wins. Optional arguments: `cargo run -p data-prep -- <input.csv> <output.sqlite>`.

## Run

```sh
npm run tauri dev
```

## Test

```sh
cargo test --workspace
bun test src
```

## Build

```sh
npm run tauri build
```

The `.deb` package is written to `target/release/bundle/deb/`.

## Rendering and battery

All frame-rate and pause logic is in `src/render-control.ts`.

| Situation | Rendering |
|---|---|
| Window hidden or minimized | Stopped |
| Planning, no interaction | Stopped until something changes |
| In flight, no interaction | 12 fps |
| Dragging or zooming, and 2 s after | Full frame rate |

In dev mode, the mode and frame rate are printed to the terminal as `[render] mode=capped fps=12.0`.

The timer uses wall-clock timestamps, so it stays correct while the window is hidden or the machine sleeps.

## Assets and data

| Asset | Source | License |
|---|---|---|
| `src/world.json` | Land dots, coastlines, borders and country labels from the Meridian design export | Project design asset |
| `src-tauri/resources/airports.sqlite` | [OurAirports](https://ourairports.com/data/) | Public domain |
| `public/fonts/inter-latin.woff2` | [Inter](https://github.com/rsms/inter) | SIL Open Font License 1.1 |
| `public/fonts/instrument-serif-latin.woff2` | [Instrument Serif](https://github.com/Instrument/instrument-serif) | SIL Open Font License 1.1 |

Everything is bundled, so the app works offline.
