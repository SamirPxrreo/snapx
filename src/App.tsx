import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalPosition } from "@tauri-apps/api/window";
import HomeView from "./components/HomeView";
import CaptureView from "./components/CaptureView";
import AnnotateView from "./components/AnnotateView";
import {
  captureVirtualDesktop,
  cropCapture,
  editorSize,
  enterOverlay,
  getHotkey,
  leaveOverlay,
  setResizable,
  DEMO_IMAGE,
} from "./lib/tauri";
import type { VirtualDesktop, Rect } from "./lib/types";

type View =
  | { kind: "home" }
  | { kind: "capture"; capture: VirtualDesktop }
  | { kind: "annotate"; imageSrc: string; width: number; height: number };

const HOME_SIZE = { w: 620, h: 470 };

export default function App() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [error, setError] = useState<string | null>(null);
  const [hotkey, setHotkey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Ref espejo de la vista para el atajo global (evita capturar dos veces).
  const viewRef = useRef<View>({ kind: "home" });
  viewRef.current = view;

  useEffect(() => {
    getHotkey()
      .then(setHotkey)
      .catch(() => setHotkey(null));
  }, []);

  /** Vuelve a la ventana de inicio: tamaño fijo, centrada y sin zoom. */
  const goHome = useCallback(async () => {
    try {
      await setResizable(false);
      await leaveOverlay(HOME_SIZE.w, HOME_SIZE.h);
    } catch {
      /* si el ajuste de ventana falla seguimos: la vista ya ha cambiado */
    }
    setView({ kind: "home" });
  }, []);

  /** Abre el editor con la captura ya recortada. */
  const openEditor = useCallback(async (dataUrl: string, w: number, h: number) => {
    const es = editorSize(w, h);
    await leaveOverlay(es.w, es.h);
    await setResizable(true);
    setView({ kind: "annotate", imageSrc: dataUrl, width: Math.round(w), height: Math.round(h) });
  }, []);

  // Modo demostracion: ?demo=annotate abre directamente el editor
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "annotate") {
      void openEditor(DEMO_IMAGE(1280, 800), 1280, 800);
    }
  }, [openEditor]);

  /** Estaciona la ventana fuera del escritorio para que no salga en la foto. */
  const park = useCallback(async () => {
    await getCurrentWindow().setPosition(new LogicalPosition(-10000, -10000));
    await new Promise((r) => setTimeout(r, 320));
  }, []);

  const startAreaCapture = useCallback(async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await park();
      const capture = await captureVirtualDesktop();
      // El overlay se coloca en coordenadas lógicas del escritorio virtual
      const scale = capture.scale > 0 ? capture.scale : 1;
      const ox = Math.round(capture.min_x / scale);
      const oy = Math.round(capture.min_y / scale);
      const ow = Math.round(capture.width / scale);
      const oh = Math.round(capture.height / scale);
      await enterOverlay(ox, oy, ow, oh);
      setView({ kind: "capture", capture });
    } catch (e) {
      // Si algo fallo, la ventana vuelve a casa centrada (nunca invisible).
      await goHome();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [busy, park, goHome]);

  const startFullCapture = useCallback(
    async (mode: "primary" | "all") => {
      if (busy) return;
      setError(null);
      setBusy(true);
      try {
        await park();
        const capture = await captureVirtualDesktop();
        let rect: Rect;
        if (mode === "all") {
          rect = { x: 0, y: 0, width: capture.width, height: capture.height };
        } else {
          const m = capture.monitors.find((m) => m.is_primary) ?? capture.monitors[0];
          if (!m) throw new Error("No se detecto ningun monitor.");
          rect = {
            x: m.x - capture.min_x,
            y: m.y - capture.min_y,
            width: m.width,
            height: m.height,
          };
        }
        // recorta en Rust y abre el editor (la captura se adapta dentro)
        const dataUrl = await cropCapture(capture.path, rect);
        await openEditor(dataUrl, rect.width, rect.height);
      } catch (e) {
        await goHome();
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, park, openEditor, goHome]
  );

  const handleSelect = useCallback(
    async (capture: VirtualDesktop, rect: Rect) => {
      try {
        const dataUrl = await cropCapture(capture.path, rect);
        await openEditor(dataUrl, rect.width, rect.height);
      } catch (e) {
        await goHome();
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [openEditor, goHome]
  );

  // Atajo global (o menu de la bandeja): captura de area solo desde el inicio,
  // en overlay o editor se ignora para no romper lo que estas haciendo.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("snapx-global-capture", () => {
      if (viewRef.current.kind === "home") {
        void startAreaCapture();
      }
    })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, [startAreaCapture]);

  if (view.kind === "capture") {
    return (
      <CaptureView
        capture={view.capture}
        onCancel={goHome}
        onSelect={(rect) => void handleSelect(view.capture, rect)}
      />
    );
  }

  if (view.kind === "annotate") {
    return (
      <AnnotateView
        key={view.imageSrc.slice(-64)}
        imageSrc={view.imageSrc}
        width={view.width}
        height={view.height}
        onCancel={goHome}
        onDone={goHome}
      />
    );
  }

  if (error) {
    return (
      <div className="error-window">
        <div className="error-head">
          <span className="error-dot" />
          <h2>Algo salió mal</h2>
          <button
            className="icon-btn"
            onClick={() => setError(null)}
            title="Volver al inicio"
            aria-label="Volver al inicio"
          >
            <svg viewBox="0 0 24 24">
              <path d="M18 6 L6 18 M6 6 L18 18" />
            </svg>
          </button>
        </div>
        <pre className="error-body">{error}</pre>
        <p className="error-hint">
          El detalle tecnico quedo anotado en <code>%TEMP%\snapx-debug.log</code>.
        </p>
        <button className="act-btn primary" onClick={() => void goHome()}>
          Volver al inicio
        </button>
      </div>
    );
  }

  return (
    <HomeView
      hotkey={hotkey}
      busy={busy}
      onCaptureArea={() => void startAreaCapture()}
      onCapturePrimary={() => void startFullCapture("primary")}
      onCaptureAll={() => void startFullCapture("all")}
      onDemo={() => void openEditor(DEMO_IMAGE(1280, 800), 1280, 800)}
    />
  );
}