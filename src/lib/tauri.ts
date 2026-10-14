import { invoke } from "@tauri-apps/api/core";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { VirtualDesktop, MonitorInfo } from "./types";

/** Captura todos los monitores y los cose en una unica imagen (escritorio virtual). */
export const captureVirtualDesktop = (): Promise<VirtualDesktop> =>
  invoke("capture_virtual_desktop");

/** Lista de monitores con sus rectangulos fisicos. */
export const getMonitors = (): Promise<MonitorInfo[]> => invoke("get_monitors");

/** Pone la ventana en modo overlay transparente a pantalla completa. */
export const enterOverlay = (x: number, y: number, w: number, h: number): Promise<void> =>
  invoke("enter_overlay", { x, y, w, h });

/** Recorta la captura en Rust y devuelve un data URL PNG (mismo origen, sin taint). */
export const cropCapture = (
  path: string,
  rect: { x: number; y: number; width: number; height: number }
): Promise<string> =>
  invoke("crop_capture", {
    path,
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    w: Math.max(1, Math.round(rect.width)),
    h: Math.max(1, Math.round(rect.height)),
  });

/** Devuelve la ventana a su tamano normal de aplicacion. */
export const leaveOverlay = (w = 620, h = 470): Promise<void> =>
  invoke("leave_overlay", { w, h });

/** Atajo global efectivamente registrado (o null si ninguno quedo libre). */
export const getHotkey = (): Promise<string | null> => invoke("get_hotkey");

/** Tamano fijo de la ventana del editor: la captura se adapta dentro. */
export function editorSize(): { w: number; h: number } {
  const availW = window.screen?.availWidth ?? 1600;
  const availH = window.screen?.availHeight ?? 900;
  return {
    w: Math.max(560, Math.min(1100, availW - 80)),
    h: Math.max(500, Math.min(740, availH - 80)),
  };
}

/** Lee los ajustes (inicio con Windows, cerrar a bandeja). */
export const getSettings = (): Promise<{ autostart: boolean; close_to_tray: boolean }> =>
  invoke("get_settings");

/** Guarda los ajustes y aplica el autostart. */
export const setSettings = (autostart: boolean, close_to_tray: boolean): Promise<void> =>
  // Tauri convierte los params Rust a camelCase: la clave es closeToTray.
  invoke("set_settings", { autostart, closeToTray: close_to_tray });

/** Escribe un data URL PNG en una ruta del disco. */
export const savePng = (path: string, dataUrl: string): Promise<void> =>
  invoke("save_png", { path, dataUrl });

/** Copia un canvas al portapapeles como PNG. */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) throw new Error("No se pudo exportar el canvas");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeImage(bytes);
}

/** Convierte una ruta local en URL servible por el webview. */
export const fileUrl = (path: string): string => convertFileSrc(path);

export const DEMO_IMAGE = (w: number, h: number): string => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#0f172a");
  grad.addColorStop(0.5, "#1e3a8a");
  grad.addColorStop(1, "#7c3aed");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 30 + Math.random() * 120, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#f8fafc";
  ctx.font = `600 ${Math.round(h * 0.09)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("SnapX · modo demostracion", w / 2, h * 0.44);
  ctx.font = `400 ${Math.round(h * 0.04)}px system-ui, sans-serif`;
  ctx.fillStyle = "rgba(248,250,252,0.75)";
  ctx.fillText("Prueba aqui las flechas, numeros, texto y blur", w / 2, h * 0.55);
  ctx.font = `400 ${Math.round(h * 0.03)}px system-ui, sans-serif`;
  ctx.fillText("A/L/R/E/T/N/H/B cambian de herramienta", w / 2, h * 0.63);
  return c.toDataURL("image/png");
};
