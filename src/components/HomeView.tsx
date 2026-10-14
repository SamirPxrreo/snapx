import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getSettings, setSettings } from "../lib/tauri";

interface Props {
  hotkey: string | null;
  onCaptureArea: () => void;
  onCapturePrimary: () => void;
  onCaptureAll: () => void;
  onDemo: () => void;
}
const SHORTCUTS: [string, string][] = [
  ["A", "Flecha"],
  ["L", "Linea"],
  ["R", "Rectangulo"],
  ["E", "Elipse"],
  ["T", "Texto"],
  ["N", "Numero"],
  ["H", "Resaltador"],
  ["B", "Blur"],
  ["Ctrl+Z", "Deshacer"],
  ["Ctrl+C", "Copiar"],
  ["Ctrl+S", "Guardar"],
  ["Enter", "Listo"],
  ["Esc", "Descartar"],
];

export default function HomeView({ hotkey, onCaptureArea, onCapturePrimary, onCaptureAll, onDemo }: Props) {
  const close = () => void getCurrentWindow().close();
  const minimize = () => void getCurrentWindow().minimize();
  const [settings, setSettingsState] = useState({ autostart: false, close_to_tray: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then(setSettingsState)
      .catch(() => undefined);
  }, []);

  const toggle = async (key: "autostart" | "close_to_tray") => {
    const prev = settings;
    const next = { ...prev, [key]: !prev[key] };
    setSettingsState(next);
    setSaving(true);
    try {
      await setSettings(next.autostart, next.close_to_tray);
    } catch {
      setSettingsState(prev);
    } finally {
      setSaving(false);
    }
  };
  // Arrastre programatico (mas fiable que solo el atributo): si el clic cae
  // en un boton, se deja pasar para que el boton funcione.
  const beginDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    void getCurrentWindow().startDragging();
  };

  return (
    <div className="home-window" data-tauri-drag-region>
      <div className="titlebar" data-tauri-drag-region onPointerDown={beginDrag}>
        <span className="brand">
          <span className="brand-dot" /> SnapX
        </span>
        <div className="win-btns">
          <button className="win-btn" onClick={minimize} title="Minimizar">
            &minus;
          </button>
          <button className="win-btn close" onClick={close} title="Cerrar">
            &times;
          </button>
        </div>
      </div>

      <div className="home-body">
        <p className="tagline">
          Captura y anota tu pantalla, como CleanShot, pero en Windows.
        </p>

        <div className="hotkey-line">
          {hotkey ? (
            <span>
              Atajo global: <kbd>{hotkey}</kbd> — funciona aunque la ventana este minimizada
            </span>
          ) : (
            <span className="dim">Registrando atajo global…</span>
          )}
        </div>

        <div className="settings">
          <label className="setting-row">
            <input
              type="checkbox"
              checked={settings.autostart}
              disabled={saving}
              onChange={() => void toggle("autostart")}
            />
            <span>Iniciar con Windows (en segundo plano, junto al reloj)</span>
          </label>
          <label className="setting-row">
            <input
              type="checkbox"
              checked={settings.close_to_tray}
              disabled={saving}
              onChange={() => void toggle("close_to_tray")}
            />
            <span>Al cerrar, minimizar a la bandeja en vez de salir</span>
          </label>
        </div>

        <div className="capture-grid">
          <button className="big-btn primary span-all" onClick={onCaptureArea}>
            <strong>Capturar area</strong>
            <span>Arrastra sobre la pantalla para elegir que capturar</span>
          </button>
          <button className="big-btn" onClick={onCapturePrimary}>
            <strong>Pantalla completa</strong>
            <span>Monitor principal</span>
          </button>
          <button className="big-btn" onClick={onCaptureAll}>
            <strong>Todos los monitores</strong>
            <span>Escritorio virtual completo</span>
          </button>
        </div>

        <div className="shortcuts">
          <div className="shortcuts-title">Atajos del editor</div>
          <div className="shortcuts-grid wide">
            {SHORTCUTS.map(([k, v]) => (
              <div className="shortcut" key={k}>
                <kbd>{k}</kbd>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <button className="demo-link" onClick={onDemo}>
          Abrir modo demostracion (probar herramientas sin capturar)
        </button>
      </div>
    </div>
  );
}
