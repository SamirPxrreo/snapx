/**
 * Simula la capa de Tauri para poder trabajar la UI en un navegador normal.
 * Solo se usa con `npm run ui` (vite.mock.config.ts); la app real nunca lo
 * importa porque Vite resuelve los alias solo en esa configuracion.
 */

type Handler = (cmd: string, args: any) => any;

const handlers: Record<string, Handler> = {
  get_hotkey: () => "Ctrl+Shift+X",
  get_settings: () => ({ autostart: false, close_to_tray: true }),
  set_settings: () => undefined,
  set_resizable: () => undefined,
  enter_overlay: () => undefined,
  leave_overlay: () => undefined,
  crop_capture: () => makeShot(),
  capture_virtual_desktop: () => ({
    path: "C:/mock/snapx-capture.png",
    width: 2560,
    height: 1440,
    min_x: 0,
    min_y: 0,
    scale: 1,
    monitors: [{ name: "Monitor 1", x: 0, y: 0, width: 2560, height: 1440, scale: 1, is_primary: true }],
  }),
  save_png: (_cmd, args) => {
    (window as any).__snapxLastSave = { path: args.path, bytes: args.dataUrl.length };
  },
  copy_image_to_clipboard: (_cmd, args) => {
    if ((window as any).__snapxFailNative) {
      throw new Error("no se pudo abrir el portapapeles: la aplicacion no responde");
    }
    (window as any).__snapxLastCopy = args.dataUrl;
    (window as any).__snapxCopyCalls = ((window as any).__snapxCopyCalls ?? 0) + 1;
  },
};

function makeShot(w = 1280, h = 800): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#0ea5e9");
  g.addColorStop(1, "#6366f1");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.round(h / 12)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("captura simulada", w / 2, h / 2);
  return c.toDataURL("image/png");
}

export async function invoke(cmd: string, args: any = {}): Promise<any> {
  const h = handlers[cmd];
  if (!h) throw new Error(`[mock] comando no simulado: ${cmd}`);
  await new Promise((r) => setTimeout(r, 60));
  return h(cmd, args);
}

export const convertFileSrc = (p: string) => `file:///${p.replace(/\\/g, "/")}`;