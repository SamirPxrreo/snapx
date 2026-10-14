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
  DEMO_IMAGE,
} from "./lib/tauri";
import type { VirtualDesktop, Rect } from "./lib/types";

type View =
  | { kind: "home" }
  | { kind: "capture"; capture: VirtualDesktop }
  | { kind: "annotate"; imageSrc: string; width: number; height: number };

export default function App() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [error, setError] = useState<string | null>(null);
  const [hotkey, setHotkey] = useState<string | null>(null);
  // Ref espejo de la vista para el atajo global (evita capturar dos veces).
  const viewRef = useRef<View>({ kind: "home" });
  viewRef.current = view;

  // Lee el atajo global registrado para mostrarlo en home.
  useEffect(() => {
    getHotkey()
      .then(setHotkey)
      .catch(() => setHotkey(null));
  }, []);

  // Modo demostracion: ?demo=annotate abre directamente el editor
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "annotate") {
      const src = DEMO_IMAGE(960, 620);
      setView({ kind: "annotate", imageSrc: src, width: 960, height: 620 });
      void leaveOverlay(1024, 720);
    }
  }, []);

  const startAreaCapture = useCallback(async () => {
    setError(null);
    try {
      // Estaciona nuestra ventana fuera de la pantalla para que NO salga en la
      // foto, y espera a que el compositor repinte sin ella (como Recortes).
      // (No se usa hide/show: en este entorno dejan la ventana en un estado
      // que cuelga los invokes siguientes.)
      await getCurrentWindow().setPosition(new LogicalPosition(-10000, -10000));
      await new Promise((r) => setTimeout(r, 300));
      const capture = await captureVirtualDesktop();
      // El overlay se coloca en coordenadas logicas del escritorio virtual
      const scale = capture.scale > 0 ? capture.scale : 1;
      const ox = Math.round(capture.min_x / scale);
      const oy = Math.round(capture.min_y / scale);
      const ow = Math.round(capture.width / scale);
      const oh = Math.round(capture.height / scale);
      await enterOverlay(ox, oy, ow, oh);
      setView({ kind: "capture", capture });
    } catch (e) {
      // Si algo fallo, la ventana vuelve a casa centrada (nunca invisible).
      try {
        await leaveOverlay(620, 470);
      } catch {
        /* noop */
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const startFullCapture = useCallback(async (mode: "primary" | "all") => {
    setError(null);
    try {
      // Estaciona nuestra ventana fuera de la pantalla para que NO salga en la foto.
      await getCurrentWindow().setPosition(new LogicalPosition(-10000, -10000));
      await new Promise((r) => setTimeout(r, 300));
      const capture = await captureVirtualDesktop();
      let rect: Rect;
      if (mode === "all") {
        rect = { x: 0, y: 0, width: capture.width, height: capture.height };
      } else {
        const m = capture.monitors.find((m) => m.is_primary) ?? capture.monitors[0];
        rect = {
          x: m.x - capture.min_x,
          y: m.y - capture.min_y,
          width: m.width,
          height: m.height,
        };
      }
      // recorta en Rust y abre el editor en ventana de tamano fijo
      // (la captura se adapta dentro).
      const dataUrl = await cropCapture(capture.path, rect);
      const es = editorSize();
      await leaveOverlay(es.w, es.h);
      setView({ kind: "annotate", imageSrc: dataUrl, width: rect.width, height: rect.height });
    } catch (e) {
      try {
        await leaveOverlay(620, 470);
      } catch {
        /* noop */
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const backHome = useCallback(async () => {
    await leaveOverlay(620, 470);
    setView({ kind: "home" });
  }, []);

  const captureError = useCallback((msg: string) => setError(msg), []);

  // Atajo global (PrintScreen o Ctrl+Shift+S): abre captura de area solo si
  // estamos en home; en overlay/editor se ignora.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("snapx-global-capture", () => {
      if (viewRef.current.kind === "home") {
        void startAreaCapture();
      }
    }).then((u) => {
      unlisten = u;
    });
    return () => unlisten?.();
  }, [startAreaCapture]);

  if (error) {
    return (
      <div className="error-window">
        <h2>Algo fallo</h2>
        <pre>{error}</pre>
        <button onClick={() => setError(null)}>Volver</button>
      </div>
    );
  }

  if (view.kind === "capture") {
    return (
      <CaptureView
        capture={view.capture}
        onCancel={backHome}
        onError={captureError}
        onSelect={(rect) => {
          void (async () => {
            try {
              const dataUrl = await cropCapture(view.capture.path, rect);
              // Ventana de editor de tamano fijo: la captura se adapta dentro.
              const es = editorSize();
              await leaveOverlay(es.w, es.h);
              setView({
                kind: "annotate",
                imageSrc: dataUrl,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          })();
        }}
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
        onCancel={backHome}
        onDone={backHome}
      />
    );
  }

  return (
    <HomeView
      hotkey={hotkey}
      onCaptureArea={startAreaCapture}
      onCapturePrimary={() => startFullCapture("primary")}
      onCaptureAll={() => startFullCapture("all")}
      onDemo={() => {
        const src = DEMO_IMAGE(960, 620);
        setView({ kind: "annotate", imageSrc: src, width: 960, height: 620 });
      }}
    />
  );
}
