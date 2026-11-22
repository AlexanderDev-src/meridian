import Globe from "globe.gl";
import * as THREE from "three";
import type { Airport, LatLon } from "./api";
import { altitudeAt, positionAt, wrapLongitude } from "./flight";
import worldData from "./world.json";

const ACCENT = "#D4B47C";
const ACCENT_SOFT = "rgba(212, 180, 124, 0.75)";
const MAX_PIXEL_RATIO = 1.5;
const PLANE_SCALE = 0.11;
const HEADING_STEP = 0.004;
const SURFACE_LIFT = 0.002;
const MARKER_HIT_PX = 16;
const DRAG_DAMPING = 0.12;
const ZOOM_PER_PIXEL = 0.0012;
const ZOOM_EASE_MS = 90;
const ZOOM_DONE_DISTANCE = 0.05;

type World = {
  dots: number[];
  coast: number[][];
  lines: number[][];
  labels: [name: string, lon: number, lat: number, tier: number][];
};
const world = worldData as unknown as World;

type PathPoint = [lat: number, lon: number, altitude: number];
type Box = { x: number; y: number; w: number; h: number };
export type GlobeRoute = { points: LatLon[]; height: number };
export type Markers = { origin: Airport | null; destinations: Airport[]; selected: string | null };

function planeMesh() {
  const outline = [
    [13, 0], [3, -1.6], [-2, -11], [-5, -11], [-2, -1.6], [-8, -1.4], [-11, -5], [-13, -5], [-11, 0],
    [-13, 5], [-11, 5], [-8, 1.4], [-2, 1.6], [-5, 11], [-2, 11], [3, 1.6],
  ];
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  // Turn the flat shape so its nose points along +Z for lookAt.
  const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  mesh.scale.setScalar(PLANE_SCALE);
  mesh.visible = false;
  return mesh;
}

const graticule = (): number[][] => {
  const range = (from: number, to: number, step: number) =>
    Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
  const meridians = range(-180, 150, 30).map((lon) => range(-84, 84, 4).flatMap((lat) => [lon * 10, lat * 10]));
  const parallels = range(-60, 60, 30).map((lat) => range(-180, 180, 4).flatMap((lon) => [lon * 10, lat * 10]));
  return [...meridians, ...parallels];
};

export function createGlobe(element: HTMLElement) {
  const globe = new Globe(element, {
    animateIn: false,
    rendererConfig: { antialias: true, alpha: false, powerPreference: "low-power" },
  })
    .globeMaterial(new THREE.MeshBasicMaterial({ color: 0x0b0b0d }))
    .backgroundColor("#000000")
    .showAtmosphere(false)
    .showGraticules(false)
    .pathPoints((route: object) => route as PathPoint[])
    .pathPointLat((p: object) => (p as PathPoint)[0])
    .pathPointLng((p: object) => (p as PathPoint)[1])
    .pathPointAlt((p: object) => (p as PathPoint)[2])
    .pathColor(() => ACCENT)
    .pathStroke(1.6)
    .pathResolution(1)
    .pathTransitionDuration(0);

  const renderer = globe.renderer();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(pixelRatio);
  // Markers use their own hit test, so skip the per-frame raycast.
  globe.enablePointerInteraction(false);
  const controls = globe.controls() as { enableDamping: boolean; dampingFactor: number; minDistance: number; maxDistance: number };
  // Render control keeps the full loop running long enough for this to settle.
  controls.enableDamping = true;
  controls.dampingFactor = DRAG_DAMPING;

  let zoomTarget: number | null = null;
  let zoomAt = 0;
  // Capture phase: OrbitControls would otherwise jump one step per wheel notch.
  element.addEventListener("wheel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const from = zoomTarget ?? (globe.camera() as any).position.length();
    zoomTarget = THREE.MathUtils.clamp(from * Math.exp(pixels * ZOOM_PER_PIXEL), controls.minDistance, controls.maxDistance);
  }, { capture: true, passive: false });

  // Runs after the overlay so the globe and labels always share one camera position.
  const settleZoom = (camera: any) => {
    const now = performance.now();
    const step = Math.min(50, now - zoomAt);
    zoomAt = now;
    if (zoomTarget === null) return;
    const distance = camera.position.length();
    const next = distance + (zoomTarget - distance) * (1 - Math.exp(-step / ZOOM_EASE_MS));
    const done = Math.abs(zoomTarget - next) < ZOOM_DONE_DISTANCE;
    camera.position.setLength(done ? zoomTarget : next);
    if (done) zoomTarget = null;
  };

  const radius = globe.getGlobeRadius();
  const surface = (lonTenths: number, latTenths: number) => {
    const { x, y, z } = globe.getCoords(latTenths / 10, lonTenths / 10, SURFACE_LIFT);
    return [x, y, z];
  };

  const lineLayer = (polylines: number[][], opacity: number) => {
    const positions = polylines.flatMap((line) => {
      const segments: number[] = [];
      for (let i = 0; i + 3 < line.length; i += 2) {
        segments.push(...surface(line[i], line[i + 1]), ...surface(line[i + 2], line[i + 3]));
      }
      return segments;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false });
    return new THREE.LineSegments(geometry, material);
  };

  const dotLayer = () => {
    const positions = new Float32Array(world.dots.length * 1.5);
    for (let i = 0; i < world.dots.length; i += 2) {
      positions.set(surface(world.dots[i], world.dots[i + 1]), i * 1.5);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { size: { value: 1.7 * pixelRatio } },
      vertexShader: `
        uniform float size;
        varying float vAlpha;
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          vec3 normal = normalize(normalMatrix * position);
          vAlpha = 0.16 + 0.7 * max(0.0, dot(normal, normalize(-view.xyz)));
          gl_PointSize = size;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        varying float vAlpha;
        void main() { gl_FragColor = vec4(vec3(1.0), vAlpha); }`,
    });
    return new THREE.Points(geometry, material);
  };

  const plane = planeMesh();
  globe.scene().add(
    lineLayer(graticule(), 0.045),
    dotLayer(),
    lineLayer(world.coast, 0.26),
    lineLayer(world.lines, 0.12),
    plane,
  );

  const overlay = document.createElement("canvas");
  overlay.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
  element.append(overlay);
  const ctx = overlay.getContext("2d")!;
  let markers: Markers = { origin: null, destinations: [], selected: null };
  let hitPoints: { iata: string; x: number; y: number }[] = [];

  const toVector = (p: LatLon, altitude: number) => {
    const { x, y, z } = globe.getCoords(p.lat, wrapLongitude(p.lon), altitude);
    return new THREE.Vector3(x, y, z);
  };

  const resize = () => {
    const [w, h] = [window.innerWidth, window.innerHeight];
    globe.width(w).height(h);
    overlay.width = Math.round(w * pixelRatio);
    overlay.height = Math.round(h * pixelRatio);
  };
  window.addEventListener("resize", resize);
  resize();

  const setSpacing = (px: number) => {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
  };

  const drawOverlay = () => {
    const [w, h] = [window.innerWidth, window.innerHeight];
    const camera = globe.camera() as any;
    const distance = camera.position.length();
    const toCamera = camera.position.clone().normalize();
    const horizon = radius / distance;
    const altitude = distance / radius - 1;

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const center = new THREE.Vector3().project(camera);
    const [cx, cy] = [((center.x + 1) / 2) * w, ((1 - center.y) / 2) * h];
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const rimRadius = ((h / 2) * Math.tan(Math.asin(horizon))) / Math.tan(halfFov);
    const glow = ctx.createRadialGradient(cx, cy, rimRadius * 0.99, cx, cy, rimRadius * 1.22);
    glow.addColorStop(0, "rgba(255,255,255,0.09)");
    glow.addColorStop(0.3, "rgba(255,255,255,0.03)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, rimRadius * 1.22, 0, Math.PI * 2);
    ctx.arc(cx, cy, rimRadius, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rimRadius, 0, Math.PI * 2);
    ctx.stroke();

    const facing = (lat: number, lon: number) => toVector({ lat, lon }, 0).normalize().dot(toCamera);
    const placed: Box[] = [];
    const isFree = (b: Box) =>
      !placed.some((p) => b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y);

    const drawMarker = (a: Airport, kind: "origin" | "selected" | "option") => {
      if (facing(a.lat, a.lon) <= horizon) return;
      const { x, y } = globe.getScreenCoords(a.lat, a.lon, SURFACE_LIFT);
      const strong = kind !== "option";
      const dot = kind === "option" ? 3 : 3.5;
      hitPoints.push({ iata: a.iata, x, y });
      if (strong) {
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = kind === "origin" ? "rgba(255,255,255,0.55)" : ACCENT_SOFT;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, dot, 0, Math.PI * 2);
      ctx.fillStyle = kind === "origin" ? "#FFFFFF" : kind === "selected" ? ACCENT : ACCENT_SOFT;
      ctx.fill();

      const text = strong ? `${a.iata}  ${(a.city || a.name).toUpperCase()}` : a.iata;
      ctx.font = "600 11px Inter, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      setSpacing(1);
      const box = { x: x + dot + 6, y: y - 8, w: ctx.measureText(text).width + 4, h: 16 };
      if (strong || isFree(box)) {
        placed.push(box);
        ctx.fillStyle = strong ? "#F5F4F0" : "rgba(232, 230, 224, 0.72)";
        ctx.fillText(text, box.x, y);
      }
      setSpacing(0);
    };

    hitPoints = [];
    const selected = markers.destinations.find((d) => d.iata === markers.selected);
    if (markers.origin) drawMarker(markers.origin, "origin");
    if (selected) drawMarker(selected, "selected");
    markers.destinations.filter((d) => d !== selected).forEach((d) => drawMarker(d, "option"));

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setSpacing(2);
    for (const [name, lon, lat, tier] of world.labels) {
      if ((tier === 2 && altitude > 1.7) || (tier === 3 && altitude > 1)) continue;
      const face = facing(lat, lon);
      const fadeStart = horizon + 0.12;
      if (face < fadeStart) continue;
      const { x, y } = globe.getScreenCoords(lat, lon, SURFACE_LIFT);
      ctx.font = `500 ${tier === 1 ? 11 : 9.5}px Inter, system-ui, sans-serif`;
      const width = ctx.measureText(name).width;
      const box = { x: x - width / 2, y: y - 7, w: width, h: 14 };
      if (Math.hypot(Math.abs(x - cx) + width / 2, y - cy) > rimRadius - 6 || !isFree(box)) continue;
      placed.push(box);
      ctx.globalAlpha = Math.min(1, (face - fadeStart) / 0.3) * (tier === 1 ? 0.62 : 0.5);
      ctx.fillStyle = "#E8E6E0";
      ctx.fillText(name, x, y);
    }
    ctx.globalAlpha = 1;
    setSpacing(0);
    settleZoom(camera);
  };

  return {
    pause: () => globe.pauseAnimation(),
    resume: () => globe.resumeAnimation(),
    renderOnce: () => renderer.render(globe.scene(), globe.camera()),
    drawOverlay,
    setMarkers: (next: Markers) => {
      markers = next;
    },
    markerAt: (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      const [x, y] = [clientX - rect.left, clientY - rect.top];
      const hits = hitPoints
        .filter((p) => p.iata !== markers.origin?.iata)
        .map((p) => ({ iata: p.iata, gap: Math.hypot(p.x - x, p.y - y) }))
        .filter((p) => p.gap <= MARKER_HIT_PX)
        .sort((a, b) => a.gap - b.gap);
      return hits[0]?.iata ?? null;
    },
    lookAt: (lat: number, lon: number, altitude: number, ms: number) => {
      zoomTarget = null;
      globe.pointOfView({ lat, lng: wrapLongitude(lon), altitude }, ms);
    },
    showRoute: (route: GlobeRoute | null) => {
      const path = route?.points.map((p, i, all): PathPoint => {
        return [p.lat, p.lon, altitudeAt(i / (all.length - 1), route.height)];
      });
      globe.pathsData(path ? [path] : []);
      if (!route) plane.visible = false;
    },
    placePlane: (route: GlobeRoute, fraction: number) => {
      const at = (f: number) => toVector(positionAt(route.points, f), altitudeAt(f, route.height));
      const position = at(fraction);
      const ahead = fraction + HEADING_STEP <= 1 ? at(fraction + HEADING_STEP) : position.clone().add(position.clone().sub(at(fraction - HEADING_STEP)));
      plane.position.copy(position);
      plane.up.copy(position).normalize();
      plane.lookAt(ahead);
      plane.visible = true;
    },
    hidePlane: () => {
      plane.visible = false;
    },
  };
}
