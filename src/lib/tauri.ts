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

/** El editor se puede redimensionar a mano; la ventana de inicio no. */
export const setResizable = (resizable: boolean): Promise<void> =>
  invoke("set_resizable", { resizable });

/** Atajo global efectivamente registrado (o null si ninguno quedo libre). */
export const getHotkey = (): Promise<string | null> => invoke("get_hotkey");

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

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const b64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
  const bin = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/**
 * Pone un data URL PNG en el portapapeles.
 *
 * Primero va por el comando nativo de Rust, que usa CF_DIB directo y es el unico
 * que aguanta capturas 4K. Si ese falla (build viejo, por ejemplo) cae al plugin
 * de Tauri. Solo si ambos fallan se lanza el error, con ambos mensajes, para que
 * la UI pueda explicar que ocurrio en vez de un generico "no se pudo copiar".
 */
export async function copyImageToClipboard(dataUrl: string): Promise<void> {
  let primaryError: string | null = null;
  try {
    await invoke("copy_image_to_clipboard", { dataUrl });
    return;
  } catch (e) {
    primaryError = e instanceof Error ? e.message : String(e);
  }
  try {
    await writeImage(dataUrlToBytes(dataUrl));
  } catch (e) {
    const fallbackError = e instanceof Error ? e.message : String(e);
    throw new Error(`${primaryError} · respaldo: ${fallbackError}`);
  }
}

/** Convierte una ruta local en URL servible por el webview. */
export const fileUrl = (path: string): string => convertFileSrc(path);

/**
 * Tamano de ventana del editor: encaja la captura con margen para la barra
 * superior y la barra de herramientas, sin salirse de la pantalla.
 */
export function editorSize(imageWidth = 16, imageHeight = 9): { w: number; h: number } {
  const availW = window.screen?.availWidth ?? 1600;
  const availH = window.screen?.availHeight ?? 900;
  const chromeH = 132; // barra superior + barra de herramientas
  const margin = 48;

  const maxW = Math.max(560, Math.min(1440, availW - margin));
  const maxH = Math.max(480, Math.min(920, availH - margin));

  const aspect = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 16 / 9;
  let w = maxW;
  let h = w / aspect + chromeH;
  if (h > maxH) {
    h = maxH;
    w = Math.max(560, (h - chromeH) * aspect);
  }
  return {
    w: Math.round(Math.min(w, maxW)),
    h: Math.round(Math.min(h, maxH)),
  };
}

/**
 * Imagen de demostracion: un mock de pantalla con contenido varied, para probar
 * las herramientas sin capturar nada. Es determinista a proposito (sin
 * Math.random) para que una captura del editor sea siempre comparable.
 */
export const DEMO_IMAGE = (w: number, h: number): string => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;

  const bg = ctx.createLinearGradient(0, 0, w * 0.6, h);
  bg.addColorStop(0, "#f8fafc");
  bg.addColorStop(1, "#e2e8f0");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // barra lateral
  const railW = Math.round(w * 0.16);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, railW, h);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(0, 0, railW, 6);
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = i === 2 ? "rgba(56,189,248,0.28)" : "rgba(148,163,184,0.16)";
    ctx.fillRect(16, 40 + i * 38, railW - 32, 26);
  }

  // cabecera
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(railW, 0, w - railW, 64);
  ctx.fillStyle = "#0f172a";
  ctx.font = `700 ${Math.round(h * 0.045)}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Panel de control", railW + 28, 34);
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(railW, 64, w - railW, 1);

  // tarjetas
  const pad = Math.round(w * 0.03);
  const cardW = Math.round((w - railW - pad * 4) / 3);
  const cardH = Math.round(h * 0.26);
  const tints = ["#38bdf8", "#818cf8", "#34d399", "#f472b6", "#fbbf24", "#22d3ee"];
  for (let i = 0; i < 6; i++) {
    const cx = railW + pad + (i % 3) * (cardW + pad);
    const cy = 110 + Math.floor(i / 3) * (cardH + pad);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(cx, cy, cardW, cardH, 12);
    ctx.fill();
    ctx.fillStyle = tints[i % tints.length];
    ctx.beginPath();
    ctx.arc(cx + 30, cy + 34, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(cx + 58, cy + 26, cardW - 84, 9);
    ctx.fillRect(cx + 58, cy + 44, cardW - 120, 8);
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(cx + 20, cy + cardH - 44, cardW - 40, 10);
  }

  // grafica inferior
  const gy = 110 + 2 * (cardH + pad) + 8;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(railW + pad, gy, w - railW - pad * 2, h - gy - pad, 14);
  ctx.fill();
  ctx.strokeStyle = tints[2];
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const px = railW + pad + 30 + (i / 40) * (w - railW - pad * 2 - 60);
    const py = h - pad - 40 - Math.abs(Math.sin(i / 4)) * (h - gy - pad - 110);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.stroke();

  return c.toDataURL("image/png");
};