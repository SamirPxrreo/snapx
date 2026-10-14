import { useCallback, useEffect, useRef, useState } from "react";
import Toolbar from "./Toolbar";
import { save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { copyCanvasToClipboard, savePng } from "../lib/tauri";
import type { Shape, StrokeShape, TextShape, NumberShape, BlurShape, ToolId } from "../lib/types";

interface Props {
  imageSrc: string;
  width: number;
  height: number;
  onCancel: () => void;
  onDone: () => void;
}

const MIN_DRAG = 3;

export default function AnnotateView({ imageSrc, width, height, onCancel, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLImageElement | null>(null);
  const idRef = useRef(1);
  const numberRef = useRef(1);

  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<ToolId>("arrow");
  const [color, setColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(6);

  const [drawing, setDrawing] = useState(false);
  const startPt = useRef<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<Shape | null>(null);
  const blurPoints = useRef<{ x: number; y: number }[]>([]);

  const [textDraft, setTextDraft] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const baseFont = Math.max(18, Math.min(30, Math.round(height * 0.045)));

  // cargar imagen base
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      baseRef.current = img;
      render();
    };
    img.src = imageSrc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc]);

  const drawShape = useCallback((ctx: CanvasRenderingContext2D, s: Shape) => {
    ctx.save();
    switch (s.kind) {
      case "arrow":
      case "line":
      case "rect":
      case "ellipse":
      case "highlight": {
        const st = s as StrokeShape;
        ctx.strokeStyle = st.color;
        ctx.lineWidth = st.kind === "highlight" ? st.width * 3 : st.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (st.kind === "highlight") ctx.globalAlpha = 0.35;
        ctx.beginPath();
        if (st.kind === "line" || st.kind === "arrow" || st.kind === "highlight") {
          ctx.moveTo(st.x1, st.y1);
          ctx.lineTo(st.x2, st.y2);
        } else if (st.kind === "rect") {
          ctx.rect(
            Math.min(st.x1, st.x2),
            Math.min(st.y1, st.y2),
            Math.abs(st.x2 - st.x1),
            Math.abs(st.y2 - st.y1)
          );
        } else {
          const cx = (st.x1 + st.x2) / 2;
          const cy = (st.y1 + st.y2) / 2;
          const rx = Math.abs(st.x2 - st.x1) / 2;
          const ry = Math.abs(st.y2 - st.y1) / 2;
          ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
        }
        ctx.stroke();
        if (st.kind === "arrow") {
          // cabeza de flecha
          const ang = Math.atan2(st.y2 - st.y1, st.x2 - st.x1);
          const head = Math.max(12, st.width * 3.2);
          ctx.beginPath();
          ctx.moveTo(st.x2, st.y2);
          ctx.lineTo(
            st.x2 - head * Math.cos(ang - Math.PI / 7),
            st.y2 - head * Math.sin(ang - Math.PI / 7)
          );
          ctx.moveTo(st.x2, st.y2);
          ctx.lineTo(
            st.x2 - head * Math.cos(ang + Math.PI / 7),
            st.y2 - head * Math.sin(ang + Math.PI / 7)
          );
          ctx.stroke();
        }
        break;
      }
      case "number": {
        const n = s as NumberShape;
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = `700 ${Math.round(n.radius * 1.15)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(n.value), n.x, n.y + 1);
        break;
      }
      case "text": {
        const t = s as TextShape;
        ctx.fillStyle = t.color;
        ctx.font = `${t.fontSize}px system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(t.text, t.x, t.y);
        break;
      }
      case "blur": {
        const b = s as BlurShape;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        const block = Math.max(10, Math.round(b.radius / 2));
        const base = baseRef.current;
        if (base) {
          for (const p of b.points) {
            // muestrea un bloque de la IMAGEN ORIGINAL y lo pinta ampliado (mosaico)
            const sx = Math.max(0, Math.min(base.width - block, p.x - block / 2));
            const sy = Math.max(0, Math.min(base.height - block, p.y - block / 2));
            ctx.drawImage(
              base,
              sx,
              sy,
              block,
              block,
              p.x - b.radius / 2,
              p.y - b.radius / 2,
              b.radius,
              b.radius
            );
          }
        }
        ctx.restore();
        break;
      }
    }
    ctx.restore();
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    for (const s of shapes) drawShape(ctx, s);
    if (preview) drawShape(ctx, preview);
  }, [shapes, preview, drawShape]);

  useEffect(() => {
    render();
  }, [render]);

  const canvasPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };

  const commit = (s: Shape) => setShapes((prev) => [...prev, s]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (textDraft) return;
    const p = canvasPoint(e);
    if (tool === "number") {
      const radius = baseFont * 0.95;
      commit({
        kind: "number",
        id: idRef.current++,
        color,
        x: p.x,
        y: p.y,
        value: numberRef.current++,
        radius,
      });
      return;
    }
    if (tool === "text") {
      setTextDraft(p);
      setTextValue("");
      return;
    }
    startPt.current = p;
    setDrawing(true);
    if (tool === "blur") {
      blurPoints.current = [p];
      setPreview({
        kind: "blur",
        id: idRef.current,
        color: "#000000",
        points: [p],
        radius: 26,
      });
    } else {
      setPreview({
        kind: tool as StrokeShape["kind"],
        id: idRef.current,
        color,
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
        width: strokeWidth,
      });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing || !startPt.current) return;
    const p = canvasPoint(e);
    if (tool === "blur") {
      blurPoints.current.push(p);
      setPreview((prev) =>
        prev && prev.kind === "blur" ? { ...prev, points: [...blurPoints.current] } : prev
      );
    } else {
      setPreview((prev) =>
        prev && "x2" in prev ? { ...prev, x2: p.x, y2: p.y } : prev
      );
    }
  };

  const onPointerUp = () => {
    if (!drawing || !startPt.current) return;
    setDrawing(false);
    startPt.current = null;
    setPreview((cur) => {
      if (!cur) return null;
      if (cur.kind === "blur") {
        if (cur.points.length > 0) {
          idRef.current++;
          commit(cur);
        }
      } else if (cur.kind !== "number" && cur.kind !== "text") {
        const dist = Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1);
        if (dist >= MIN_DRAG) {
          idRef.current++;
          commit(cur);
        }
      }
      return null;
    });
    blurPoints.current = [];
  };

  const confirmText = () => {
    if (!textDraft) return;
    const text = textValue.trim();
    if (text) {
      commit({
        kind: "text",
        id: idRef.current++,
        color,
        x: textDraft.x,
        y: textDraft.y,
        text,
        fontSize: baseFont,
      });
    }
    setTextDraft(null);
    setTextValue("");
  };

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1400);
  };

  const handleCopy = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      await copyCanvasToClipboard(canvas);
      flash("Copiado al portapapeles");
    } catch (e) {
      flash("No se pudo copiar");
    }
  }, []);

  const handleSave = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const path = await save({
        defaultPath: `snapx-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`,
        filters: [{ name: "Imagen PNG", extensions: ["png"] }],
      });
      if (!path) return;
      await savePng(path, canvas.toDataURL("image/png"));
      flash("Guardado");
    } catch {
      flash("No se pudo guardar");
    }
  }, []);

  const undo = useCallback(() => {
    setShapes((prev) => prev.slice(0, -1));
  }, []);

  // atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textDraft) {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmText();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setTextDraft(null);
          setTextValue("");
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        void handleCopy();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        void handleCopy().then(onDone);
        return;
      }
      const map: Record<string, ToolId> = {
        a: "arrow",
        l: "line",
        r: "rect",
        e: "ellipse",
        t: "text",
        n: "number",
        h: "highlight",
        b: "blur",
      };
      const t = map[e.key.toLowerCase()];
      if (t) {
        e.preventDefault();
        setTool(t);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textDraft, textValue, handleCopy, handleSave, undo, onCancel, onDone]);

  return (
    <div className="annotate-root">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={`annotate-canvas tool-${tool}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {textDraft && (
        <input
          className="text-draft"
          autoFocus
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onBlur={confirmText}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmText();
            if (e.key === "Escape") setTextDraft(null);
          }}
          style={{
            left: (textDraft.x / width) * 100 + "%",
            top: (textDraft.y / height) * 100 + "%",
            fontSize: baseFont + "px",
            color,
          }}
          placeholder="Escribe y pulsa Enter"
        />
      )}

      <div
        className="editor-topbar"
        onPointerDown={(e) => {
          e.stopPropagation();
          // Mover la ventana arrastrando la barra (no los botones/slider).
          if ((e.target as HTMLElement).closest("button, input")) return;
          void getCurrentWindow().startDragging();
        }}
      >
        <button className="act-btn ghost" onClick={onCancel} title="Descartar (Esc)">
          Descartar
        </button>
        <Toolbar
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          onUndo={undo}
          canUndo={shapes.length > 0}
          disabled={!!textDraft}
        />
        <div className="topbar-actions">
          <button className="act-btn" onClick={handleCopy} title="Copiar (Ctrl+C)">
            Copiar
          </button>
          <button className="act-btn" onClick={handleSave} title="Guardar (Ctrl+S)">
            Guardar…
          </button>
          <button className="act-btn primary" onClick={() => void handleCopy().then(onDone)} title="Listo (Enter)">
            Listo
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
