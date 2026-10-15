import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getSettings, setSettings } from "../lib/tauri";

interface Props {
  hotkey: string | null;
  busy: boolean;
  onCaptureArea: () => void;
  onCapturePrimary: () => void;
  onCaptureAll: () => void;
  onDemo: () => void;
}

const SHORTCUTS: [string, string][] = [
  ["V", "Seleccionar"],
  ["A", "Flecha"],
  ["L", "Línea"],
  ["R", "Rectángulo"],
  ["E", "Elipse"],
  ["T", "Texto"],
  ["N", "Número"],
  ["P", "Lápiz"],
  ["B", "Pixelar"],
  ["Supr", "Borrar"],
  ["Ctrl+Z", "Deshacer"],
  ["Ctrl+Y", "Rehacer"],
  ["Ctrl+C", "Copiar"],
  ["Ctrl+S", "Guardar"],
  ["Enter", "Listo"],
  ["Esc", "Descartar"],
];

export default function HomeView({
  hotkey,
  busy,
  onCaptureArea,
  onCapturePrimary,
  onCaptureAll,
  onDemo,
}: Props) {
  const close = () => void getCurrentWindow().close();
  const minimize = () => void getCurrentWindow().minimize();
  const [settings, setSettingsState] = useState({ autostart: false, close_to_tray: true });
  const [saving, setSaving] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

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
          <span className="brand-dot" />
          SnapX
        </span>
        <div className="win-btns">
          <button className="win-btn" onClick={minimize} title="Minimizar" aria-label="Minimizar">
            &minus;
          </button>
          <button className="win-btn close" onClick={close} title="Cerrar a la bandeja" aria-label="Cerrar">
            &times;
          </button>
        </div>
      </div>

      <div className="home-body">
        <div className="hero">
          <p className="tagline">Captura y anota tu pantalla, en dos toques.</p>
          <p className="hotkey-line">
            {hotkey ? (
              <>
                Atajo global <kbd>{hotkey}</kbd> · funciona aunque la ventana esté minimizada
              </>
            ) : (
              <span className="dim">Registrando atajo global…</span>
            )}
          </p>
        </div>

        <div className="capture-grid">
          <button className="big-btn primary span-all" onClick={onCaptureArea} disabled={busy}>
            <span className="big-btn-icon">
              <svg viewBox="0 0 24 24">
                <path d="M4 8 V6 a2 2 0 0 1 2-2 h2 M16 4 h2 a2 2 0 0 1 2 2 v2 M20 16 v2 a2 2 0 0 1-2 2 h-2 M8 20 H6 a2 2 0 0 1-2-2 v-2" />
                <path d="M8 12 H16 M12 8 V16" strokeDasharray="0 0" opacity="0" />
              </svg>
            </span>
            <span className="big-btn-text">
              <strong>Capturar área</strong>
              <span>Arrastra sobre la pantalla para elegir qué capturar</span>
            </span>
          </button>

          <button className="big-btn" onClick={onCapturePrimary} disabled={busy}>
            <span className="big-btn-icon">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="13" rx="2" />
                <path d="M8 21 H16 M12 17 V21" />
              </svg>
            </span>
            <span className="big-btn-text">
              <strong>Pantalla completa</strong>
              <span>Monitor principal</span>
            </span>
          </button>

          <button className="big-btn" onClick={onCaptureAll} disabled={busy}>
            <span className="big-btn-icon">
              <svg viewBox="0 0 24 24">
                <rect x="2" y="6" width="13" height="10" rx="2" />
                <rect x="9" y="9" width="13" height="10" rx="2" />
              </svg>
            </span>
            <span className="big-btn-text">
              <strong>Todos los monitores</strong>
              <span>Escritorio virtual completo</span>
            </span>
          </button>
        </div>

        <details className="shortcuts" open={shortcutsOpen} onToggle={(e) => setShortcutsOpen(e.currentTarget.open)}>
          <summary>Atajos del editor</summary>
          <div className="shortcuts-grid">
            {SHORTCUTS.map(([k, v]) => (
              <div className="shortcut" key={k}>
                <kbd>{k}</kbd>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </details>

        <div className="home-foot">
          <label className="setting-row">
            <input
              type="checkbox"
              checked={settings.autostart}
              disabled={saving}
              onChange={() => void toggle("autostart")}
            />
            <span>Iniciar con Windows, minimizado en la bandeja</span>
          </label>
          <label className="setting-row">
            <input
              type="checkbox"
              checked={settings.close_to_tray}
              disabled={saving}
              onChange={() => void toggle("close_to_tray")}
            />
            <span>Al cerrar, ir a la bandeja en vez de salir</span>
          </label>
          <button className="demo-link" onClick={onDemo} disabled={busy}>
            Probar sin capturar (modo demostración)
          </button>
        </div>
      </div>
    </div>
  );
}