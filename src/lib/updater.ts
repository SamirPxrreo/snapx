import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";

/**
 * Estado del boton de actualizacion. `idle` significa "no hay nada nuevo"
 * (o que no se ha comprobado): en ese caso el boton no se dibuja.
 */
export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string; update: Update }
  | { kind: "downloading"; version: string; update: Update; pct: number }
  | { kind: "ready"; version: string; update: Update }
  | { kind: "error"; message: string };

/** Version de la app segun su propio manifiesto. */
export const CURRENT_VERSION: string =
  (import.meta.env as { VITE_APP_VERSION?: string }).VITE_APP_VERSION ?? "0.2.0";

const LAST_CHECK_KEY = "snapx.lastUpdateCheck";
const SIX_HOURS = 6 * 60 * 60 * 1000;

/**
 * Comprueba si hay version nueva. Silencioso y sin throw: si GitHub no
 * responde,Dns la app simplemente no muestra el boton.
 */
export async function checkForUpdate(): Promise<UpdateStatus> {
  try {
    const update = await check();
    if (!update) return { kind: "idle" };
    try {
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    } catch {
      /* modo privado: da igual, solo es una cache */
    }
    return { kind: "available", version: update.version, update };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Descarga el paquete firmado y deja lista la reinstalacion. */
export async function downloadUpdate(
  update: Update,
  onProgress: (pct: number) => void
): Promise<UpdateStatus> {
  let downloaded = 0;
  let total = 0;
  try {
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          total = event.data?.contentLength ?? 0;
          onProgress(0);
          break;
        case "Progress":
          downloaded += event.data?.chunkLength ?? 0;
          if (total > 0) onProgress(Math.min(100, Math.round((downloaded / total) * 100)));
          break;
        case "Finished":
          onProgress(100);
          break;
      }
    });
    return { kind: "ready", version: update.version, update };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Reinicia la app para que se aplique la version descargada. */
export async function applyUpdate(): Promise<void> {
  await relaunch();
}

/** Evita pedirle a GitHub en cada arranque de la app. */
export function shouldCheck(): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? "0");
    return Date.now() - last > SIX_HOURS;
  } catch {
    return true;
  }
}