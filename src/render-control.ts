import { getCurrentWindow } from "@tauri-apps/api/window";
import { devLog } from "./api";

const CAPPED_FPS = 12;
const INTERACTION_HOLD_MS = 2000;
const STATS_INTERVAL_MS = 2000;

type Mode = "hidden" | "full" | "capped" | "still";

export type RenderTarget = {
  pause: () => void;
  resume: () => void;
  renderOnce: () => void;
};

export function createRenderControl(target: RenderTarget, surface: HTMLElement, onFrame: () => void) {
  let mode: Mode | null = null;
  let hidden = document.hidden;
  let flying = false;
  let dragging = false;
  let holdUntil = 0;
  let holdTimer = 0;
  let capTimer = 0;
  let raf = 0;
  let frames = 0;

  const frame = () => {
    frames += 1;
    onFrame();
  };

  const stopLoops = () => {
    cancelAnimationFrame(raf);
    clearInterval(capTimer);
  };

  const fullLoop = () => {
    frame();
    raf = requestAnimationFrame(fullLoop);
  };

  const desiredMode = (): Mode => {
    if (hidden) return "hidden";
    if (dragging || performance.now() < holdUntil) return "full";
    return flying ? "capped" : "still";
  };

  const apply = () => {
    const next = desiredMode();
    if (next === mode) return;
    mode = next;
    stopLoops();
    if (import.meta.env.DEV) void devLog(`mode=${next}`);

    if (next === "full") {
      target.resume();
      raf = requestAnimationFrame(fullLoop);
      return;
    }
    target.pause();
    if (next === "hidden") return;
    frame();
    target.renderOnce();
    if (next === "capped") {
      capTimer = window.setInterval(() => {
        frame();
        target.renderOnce();
      }, 1000 / CAPPED_FPS);
    }
  };

  const hold = (ms = INTERACTION_HOLD_MS) => {
    holdUntil = Math.max(holdUntil, performance.now() + ms);
    clearTimeout(holdTimer);
    holdTimer = window.setTimeout(apply, holdUntil - performance.now() + 1);
    apply();
  };

  const syncWindowState = async () => {
    const appWindow = getCurrentWindow();
    const [minimized, visible] = await Promise.all([appWindow.isMinimized(), appWindow.isVisible()]);
    hidden = document.hidden || minimized || !visible;
    apply();
  };

  surface.addEventListener("pointerdown", () => {
    dragging = true;
    hold();
  });
  surface.addEventListener("pointermove", () => dragging && hold());
  window.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    hold();
  });
  window.addEventListener("pointercancel", () => {
    dragging = false;
    hold();
  });
  // Capture: the globe's zoom handler stops this event from bubbling.
  surface.addEventListener("wheel", () => hold(), { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => void syncWindowState());

  const appWindow = getCurrentWindow();
  void appWindow.onResized(() => void syncWindowState());
  void appWindow.onFocusChanged(() => void syncWindowState());

  if (import.meta.env.DEV) {
    setInterval(() => {
      void devLog(`mode=${mode} fps=${(frames / (STATS_INTERVAL_MS / 1000)).toFixed(1)}`);
      frames = 0;
    }, STATS_INTERVAL_MS);
  }

  apply();

  return {
    hold,
    refresh: () => {
      if (mode !== "still") return;
      frame();
      target.renderOnce();
    },
    setFlying: (value: boolean) => {
      flying = value;
      apply();
    },
  };
}
