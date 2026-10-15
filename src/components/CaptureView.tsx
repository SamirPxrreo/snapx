import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VirtualDesktop, Rect, Pt } from "../lib/types";

interface Props {
  capture: VirtualDesktop;
  onCancel: () => void;
  /** Rectangulo en pixeles FISICOS. El recorte lo hace Rust (sin taint). */
  onSelect: (rect: Rect) => void;
}

/**
 * Overlay de seleccion sobre el escritorio EN VIVO (estilo Win+Shift+S).
 * No se muestra ninguna foto congelada: solo una capa oscura transparente y el
 * rectangulo de seleccion. Asi es imposible que se vea "zoom" o descuadre.
 * Los pixeles se capturaron antes de abrir el overlay y el recorte lo hace
 * Rust sobre esa captura.
 * La escala efectiva se mide de la ventana real (px fisicos / CSS px), de modo
 * que un overlay descuadrado por DPI igualmente mapea bien las coordenadas.
 */
export default function CaptureView({ capture, onCancel, onSelect }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<Pt | null>(null);
  const [dragCur, setDragCur] = useState<Pt | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Pixeles fisicos por CSS px, medidos de la ventana real. */
  const effScale = useCallback((): number => {
    const el = rootRef.current;
    if (el && el.clientWidth > 0) return capture.width / el.clientWidth;
    return capture.scale > 0 ? capture.scale : 1;
  }, [capture.width, capture.scale]);

  const commitSelection = useCallback(
    (rectCss: Rect) => {
      const s = effScale();
      onSelect({
        x: Math.max(0, Math.round(rectCss.x * s)),
        y: Math.max(0, Math.round(rectCss.y * s)),
        width: Math.max(1, Math.round(rectCss.width * s)),
        height: Math.max(1, Math.round(rectCss.height * s)),
      });
    },
    [effScale, onSelect]
  );

  // seleccion normalizada en coordenadas CSS mostradas
  const sel: Rect | null = useMemo(
    () =>
      dragStart && dragCur
        ? {
            x: Math.min(dragStart.x, dragCur.x),
            y: Math.min(dragStart.y, dragCur.y),
            width: Math.abs(dragCur.x - dragStart.x),
            height: Math.abs(dragCur.y - dragStart.y),
          }
        : null,
    [dragStart, dragCur]
  );

  const confirmSelection = useCallback(() => {
    if (!sel || sel.width < 4 || sel.height < 4) return;
    commitSelection(sel);
  }, [sel, commitSelection]);

  const confirmMonitorAt = useCallback(
    (p: Pt) => {
      const s = effScale();
      const px = p.x * s + capture.min_x;
      const py = p.y * s + capture.min_y;
      const m = capture.monitors.find(
        (m) => px >= m.x && px < m.x + m.width && py >= m.y && py < m.y + m.height
      );
      if (!m) {
        setNotice("No se encontro ningun monitor bajo el cursor.");
        return;
      }
      onSelect({
        x: Math.max(0, m.x - capture.min_x),
        y: Math.max(0, m.y - capture.min_y),
        width: m.width,
        height: m.height,
      });
    },
    [capture, effScale, onSelect]
  );

  // teclado: Enter confirma, Esc cancela
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (sel) confirmSelection();
        else
          commitSelection({
            x: 0,
            y: 0,
            width: capture.width / effScale(),
            height: capture.height / effScale(),
          });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, confirmSelection, commitSelection, onCancel, capture, effScale]);

  const localPoint = (e: React.PointerEvent): Pt => {
    const rect = rootRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = localPoint(e);
    setDragStart(p);
    setDragCur(p);
    setNotice(null);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    setDragCur(localPoint(e));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragStart) return;
    const p = localPoint(e);
    const dist = Math.hypot(p.x - dragStart.x, p.y - dragStart.y);
    setDragStart(null);
    setDragCur(null);
    if (dist < 4) return; // clic simple: sin accion (doble clic captura el monitor)
    commitSelection({
      x: Math.min(dragStart.x, p.x),
      y: Math.min(dragStart.y, p.y),
      width: Math.abs(p.x - dragStart.x),
      height: Math.abs(p.y - dragStart.y),
    });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    confirmMonitorAt({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const dimsScale = effScale();

  return (
    <div
      className="capture-root"
      ref={rootRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      {sel && (
        <div
          className="selection"
          style={{ left: sel.x, top: sel.y, width: sel.width, height: sel.height }}
        >
          <span className="sel-dims">
            {Math.round(sel.width * dimsScale)} × {Math.round(sel.height * dimsScale)}
          </span>
        </div>
      )}

      <div className="capture-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <span className="capture-title">SnapX</span>
        <button className="act-btn ghost" onClick={onCancel} title="Cancelar (Esc)">
          Cancelar
        </button>
      </div>

      <div className="capture-hint">
        <strong>Arrastra</strong> para elegir un área · <strong>Doble clic</strong> captura ese
        monitor · <strong>Enter</strong> confirma · <strong>Esc</strong> cancela
      </div>

      <div className="monitor-badges">
        {capture.monitors.map((m, i) => (
          <span key={`${m.name}-${i}`}>
            {i + 1}. {m.name}
            {m.is_primary ? " (principal)" : ""} — {m.width}×{m.height}
          </span>
        ))}
      </div>

      {notice && <div className="toast toast-err capture-notice">{notice}</div>}
    </div>
  );
}