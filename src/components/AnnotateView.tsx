import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Toolbar from "./Toolbar";
import { save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { copyImageToClipboard, savePng } from "../lib/tauri";
import {
  isStroke,
  penWidthFactor,
  scaleShape,
  shapeBounds,
  smoothPath,
  textLineHeight,
  topShapeAt,
  translateShape,
  PENCIL_MIN_STEP,
  type BlurShape,
  type NumberShape,
  type PathPoint,
  type PathShape,
  type Pt,
  type Rect,
  type Shape,
  type StrokeShape,
  type TextShape,
  type ToolId,
} from "../lib/types";

interface Props {
  imageSrc: string;
  width: number;
  height: number;
  onCancel: () => void;
  onDone: () => void;
}

type HandleId = "nw" | "ne" | "sw" | "se";
const HANDLES: HandleId[] = ["nw", "ne", "sw", "se"];

type Interaction =
  | { type: "draw"; start: Pt }
  | { type: "move"; start: Pt; id: number; origin: Shape }
  | { type: "resize"; handle: HandleId; start: Pt; id: number; origin: Shape; bounds: Rect };

interface Draft {
  x: number;
  y: number;
  value: string;
}

const MIN_DRAG = 3;
const MIN_SIZE = 8;
const MAX_ZOOM = 8;
const MIN_ZOOM = 0.25;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const strokeKind = (tool: ToolId): StrokeShape["kind"] | null => {
  switch (tool) {
    case "arrow":
      return "arrow";
    case "line":
      return "line";
    case "rect":
      return "rect";
    case "ellipse":
      return "ellipse";
    default:
      return null;
  }
};

export default function AnnotateView({ imageSrc, width, height, onCancel, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const baseRef = useRef<HTMLImageElement | null>(null);
  const idRef = useRef(1);
  const interaction = useRef<Interaction | null>(null);
  const blurPoints = useRef<Pt[]>([]);
  const penPoints = useRef<PathPoint[]>([]);
  /** Espejo del borrador para que los handlers de puntero no vean estado viejo. */
  const draftMirror = useRef<Draft | null>(null);

  const [shapes, setShapes] = useState<Shape[]>([]);
  const [past, setPast] = useState<Shape[][]>([]);
  const [future, setFuture] = useState<Shape[][]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [tool, setTool] = useState<ToolId>("arrow");
  const [color, setColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(6);
  const [fontSize, setFontSize] = useState(() => clamp(Math.round(height * 0.045), 14, 96));

  const [preview, setPreviewState] = useState<Shape | null>(null);
  /** Espejo del preview: StrictMode puede invocar los updaters dos veces, asi que
   *  ninguna funcion con efectos (commitShapes, setSelectedId) puede vivir ahi. */
  const previewRef = useRef<Shape | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  draftMirror.current = draft;

  const setPreview = useCallback((s: Shape | null) => {
    previewRef.current = s;
    setPreviewState(s);
  }, []);

  const updatePreview = useCallback((fn: (prev: Shape | null) => Shape | null) => {
    const next = fn(previewRef.current);
    previewRef.current = next;
    setPreviewState(next);
  }, []);

  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [toast, setToastState] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const scale = fitScale * zoom;
  const dispW = Math.round(width * scale);
  const dispH = Math.round(height * scale);

  const showToast = useCallback((kind: "ok" | "err", msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToastState({ kind, msg });
    if (kind === "ok") {
      toastTimer.current = window.setTimeout(() => setToastState(null), 1800);
    }
  }, []);

  /* ---------- historial ---------- */

  const commitShapes = useCallback((next: Shape[]) => {
    setPast((p) => [...p.slice(-99), shapes]);
    setFuture([]);
    setShapes(next);
  }, [shapes]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setFuture((f) => [shapes, ...f].slice(0, 100));
    setPast((p) => p.slice(0, -1));
    setShapes(prev);
    setSelectedId(null);
  }, [past, future, shapes]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setPast((p) => [...p, shapes].slice(-99));
    setFuture((f) => f.slice(1));
    setShapes(next);
    setSelectedId(null);
  }, [future, shapes]);

  const deleteSelected = useCallback(() => {
    if (selectedId === null) return;
    const victim = shapes.find((s) => s.id === selectedId);
    commitShapes(shapes.filter((s) => s.id !== selectedId));
    setSelectedId(null);
    showToast("ok", victim ? `Borrada la forma «${LABEL[victim.kind]}»` : "Borrada");
  }, [selectedId, shapes, commitShapes, showToast]);

  const clearAll = useCallback(() => {
    if (shapes.length === 0) return;
    commitShapes([]);
    setSelectedId(null);
    showToast("ok", "Lienzo limpio");
  }, [shapes, commitShapes, showToast]);

  /* ---------- borrador de texto ---------- */

  const finishDraft = useCallback(() => {
    const d = draftMirror.current;
    if (!d) return;
    draftMirror.current = null;
    setDraft(null);
    const text = d.value.trim();
    if (!text) return;
    commitShapes([
      ...shapes,
      {
        kind: "text",
        id: idRef.current++,
        color,
        x: d.x,
        y: d.y,
        text,
        fontSize,
      } satisfies TextShape,
    ]);
    setSelectedId(idRef.current - 1);
  }, [color, fontSize, shapes, commitShapes]);

  const cancelDraft = useCallback(() => {
    draftMirror.current = null;
    setDraft(null);
  }, []);

  useLayoutEffect(() => {
    if (draft) draftRef.current?.focus();
  }, [draft]);

  /* ---------- render ---------- */

  const drawShape = useCallback(
    (ctx: CanvasRenderingContext2D, s: Shape, base: HTMLImageElement) => {
      ctx.save();
      switch (s.kind) {
        case "arrow":
        case "line":
        case "rect":
        case "ellipse": {
          const st = s as StrokeShape;
          ctx.strokeStyle = st.color;
          ctx.lineWidth = st.width;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          if (st.kind === "line" || st.kind === "arrow") {
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
          ctx.font = `700 ${Math.round(n.radius * 1.15)}px system-ui, "Segoe UI", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(n.value), n.x, n.y + 1);
          break;
        }
        case "pencil": {
          // Trazo a mano libre: cada segmento se pinta con su propio grosor y
          // tapas redondeadas, asi el trazo sale continuo y afina al acelerar.
          const p = s as PathShape;
          ctx.strokeStyle = p.color;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          if (p.points.length === 1) {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.points[0].x, p.points[0].y, p.width / 2, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          for (let i = 1; i < p.points.length; i++) {
            const a = p.points[i - 1];
            const b = p.points[i];
            ctx.lineWidth = Math.max(0.75, p.width * ((a.w ?? 1) + (b.w ?? 1)) / 2);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          break;
        }
        case "text": {
          const t = s as TextShape;
          ctx.fillStyle = t.color;
          ctx.font = `600 ${t.fontSize}px system-ui, "Segoe UI", sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          const lh = textLineHeight(t.fontSize);
          t.text.split("\n").forEach((line, i) => ctx.fillText(line, t.x, t.y + i * lh));
          break;
        }
        case "blur": {
          const b = s as BlurShape;
          ctx.imageSmoothingEnabled = true;
          const block = Math.max(6, Math.round(b.radius / 2));
          for (const p of b.points) {
            // muestrea un bloque de la IMAGEN ORIGINAL y lo pinta ampliado (mosaico)
            const sx = clamp(p.x - block / 2, 0, Math.max(0, base.width - block));
            const sy = clamp(p.y - block / 2, 0, Math.max(0, base.height - block));
            ctx.drawImage(base, sx, sy, block, block, p.x - b.radius / 2, p.y - b.radius / 2, b.radius, b.radius);
          }
          break;
        }
      }
      ctx.restore();
    },
    []
  );

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    for (const s of shapes) drawShape(ctx, s, base);
    if (preview) drawShape(ctx, preview, base);
  }, [shapes, preview, drawShape]);

  useEffect(() => {
    render();
  }, [render]);

  // carga la imagen base
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      baseRef.current = img;
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (!canvas || !baseRef.current) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(baseRef.current, 0, 0, canvas.width, canvas.height);
      }, 0);
    };
    img.onerror = () => showToast("err", "No se pudo cargar la captura");
    img.src = imageSrc;
    return () => {
      alive = false;
    };
  }, [imageSrc, showToast]);

  // la captura se encaja sola al abrir el editor
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const pad = 28;
      const w = el.clientWidth - pad * 2;
      const h = el.clientHeight - pad * 2;
      if (w > 0 && h > 0) setFitScale(Math.min(w / width, h / height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  /* ---------- coordenadas ---------- */

  const canvasPoint = useCallback(
    (clientX: number, clientY: number): Pt => {
      const canvas = canvasRef.current!;
      const r = canvas.getBoundingClientRect();
      return {
        x: ((clientX - r.left) / r.width) * canvas.width,
        y: ((clientY - r.top) / r.height) * canvas.height,
      };
    },
    []
  );

  /* ---------- interaccion ---------- */

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    // Si hay texto a medio escribir, el clic lo confirma y no empieza nada mas.
    if (draftMirror.current) {
      finishDraft();
      return;
    }
    const p = canvasPoint(e.clientX, e.clientY);
    const tolerance = 6 / scale;

    if (tool === "select") {
      const hit = topShapeAt(shapes, p, tolerance);
      setSelectedId(hit ? hit.id : null);
      if (!hit) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      interaction.current = { type: "move", start: p, id: hit.id, origin: hit };
      setPreview(hit);
      return;
    }

    if (tool === "text") {
      // Sin preventDefault, al soltar el clic el navegador devuelve el foco al
      // body, el textarea se queda sin enfocar y lo que escribes se pierde:
      // por eso el texto "no funcionaba". Esto mantiene el foco en el textarea.
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const d: Draft = { x: p.x, y: p.y, value: "" };
      draftMirror.current = d;
      setDraft(d);
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "number") {
      const radius = clamp(fontSize * 0.95, 14, 200);
      // El numero continua desde el mas alto que exista AHORA MISMO, no desde
      // un contador que nunca retrocede. Asi, si borras el 3 con Supr o con
      // Ctrl+Z, el siguiente vuelve a ser 3 y la serie queda 1,2,3,4,5.
      let maxValue = 0;
      for (const s of shapes) {
        if (s.kind === "number" && s.value > maxValue) maxValue = s.value;
      }
      const n: NumberShape = {
        kind: "number",
        id: idRef.current++,
        color,
        x: p.x,
        y: p.y,
        value: maxValue + 1,
        radius,
      };
      commitShapes([...shapes, n]);
      setSelectedId(n.id);
      return;
    }

    interaction.current = { type: "draw", start: p };
    if (tool === "pencil") {
      const first: PathPoint = { x: p.x, y: p.y, w: 1 };
      penPoints.current = [first];
      setPreview({
        kind: "pencil",
        id: idRef.current,
        color,
        points: [first],
        width: Math.max(2, strokeWidth),
      });
      return;
    }
    if (tool === "blur") {
      blurPoints.current = [p];
      setPreview({
        kind: "blur",
        id: idRef.current,
        color: "#000000",
        points: [p],
        radius: Math.max(16, strokeWidth * 4),
      });
    } else {
      const kind = strokeKind(tool);
      if (!kind) return;
      setPreview({
        kind,
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

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement | HTMLDivElement>) => {
    const act = interaction.current;
    if (!act) return;
    const p = canvasPoint(e.clientX, e.clientY);

    if (act.type === "move") {
      const dx = p.x - act.start.x;
      const dy = p.y - act.start.y;
      setPreview(translateShape(act.origin, dx, dy));
      return;
    }

    if (act.type === "draw") {
      if (tool === "pencil") {
        const last = penPoints.current[penPoints.current.length - 1];
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < PENCIL_MIN_STEP) return;
        const next: PathPoint = { x: p.x, y: p.y, w: penWidthFactor(last, p) };
        penPoints.current = [...penPoints.current, next];
        setPreview({
          kind: "pencil",
          id: idRef.current,
          color,
          points: penPoints.current,
          width: Math.max(2, strokeWidth),
        });
      } else if (tool === "blur") {
        const last = blurPoints.current[blurPoints.current.length - 1];
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
        blurPoints.current.push(p);
        setPreview({
          kind: "blur",
          id: idRef.current,
          color: "#000000",
          points: [...blurPoints.current],
          radius: Math.max(16, strokeWidth * 4),
        });
      } else {
        updatePreview((prev) => (prev && "x2" in prev ? { ...prev, x2: p.x, y2: p.y } : prev));
      }
      return;
    }

    if (act.type === "resize") {
      const b = act.bounds;
      const h = act.handle;
      let left = b.x;
      let right = b.x + b.width;
      let top = b.y;
      let bottom = b.y + b.height;
      if (h.includes("e")) right = p.x;
      if (h.includes("w")) left = p.x;
      if (h.includes("s")) bottom = p.y;
      if (h.includes("n")) top = p.y;
      if (right - left < MIN_SIZE) {
        if (h.includes("w")) left = right - MIN_SIZE;
        else right = left + MIN_SIZE;
      }
      if (bottom - top < MIN_SIZE) {
        if (h.includes("n")) top = bottom - MIN_SIZE;
        else bottom = top + MIN_SIZE;
      }
      const fx = (right - left) / b.width;
      const fy = (bottom - top) / b.height;
      const f = clamp(Math.max(fx, fy), 0.05, 20);
      // la esquina opuesta al tirador se queda fija
      const anchor: Pt = { x: h.includes("w") ? right : left, y: h.includes("n") ? bottom : top };
      setPreview(scaleShape(act.origin, anchor, f));
    }
  };

  const endInteraction = useCallback(
    (cancel = false) => {
      const act = interaction.current;
      interaction.current = null;
      const cur = previewRef.current;
      setPreview(null);
      blurPoints.current = [];
      penPoints.current = [];
      if (cancel || !cur || !act) return;

      if (act.type === "move" || act.type === "resize") {
        if (cur.id === act.id) {
          commitShapes(shapes.map((s) => (s.id === act.id ? cur : s)));
        }
        return;
      }

      if (cur.kind === "pencil") {
        // Un solo clic tambien deja punto: rayar un pixel es valido.
        const shape: PathShape = {
          ...cur,
          id: idRef.current++,
          points: smoothPath(cur.points),
        };
        commitShapes([...shapes, shape]);
        setSelectedId(shape.id);
        return;
      }
      if (cur.kind === "blur") {
        const shape: BlurShape = { ...cur, id: idRef.current++ };
        commitShapes([...shapes, shape]);
        setSelectedId(shape.id);
        return;
      }
      if (isStroke(cur) && Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1) >= MIN_DRAG) {
        const shape: StrokeShape = { ...cur, id: idRef.current++ };
        commitShapes([...shapes, shape]);
        setSelectedId(shape.id);
      }
    },
    [shapes, commitShapes, setPreview]
  );

  const onPointerUp = () => {
    if (!interaction.current) return;
    endInteraction(false);
  };

  /* ---------- zoom ---------- */

  const applyZoom = useCallback((next: number) => setZoom(clamp(next, MIN_ZOOM, MAX_ZOOM)), []);

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    applyZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
  };

  /* ---------- copiar / guardar ---------- */

  const runCopy = useCallback(async (): Promise<boolean> => {
    const canvas = canvasRef.current;
    if (!canvas) {
      showToast("err", "No hay imagen que copiar");
      return false;
    }
    try {
      await copyImageToClipboard(canvas.toDataURL("image/png"));
      showToast("ok", "Copiado al portapapeles");
      return true;
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [showToast]);

  const runSave = useCallback(async (): Promise<boolean> => {
    const canvas = canvasRef.current;
    if (!canvas) {
      showToast("err", "No hay imagen que guardar");
      return false;
    }
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const path = await save({
        defaultPath: `snapx-${stamp}.png`,
        filters: [{ name: "Imagen PNG", extensions: ["png"] }],
      });
      if (!path) return false;
      await savePng(path, canvas.toDataURL("image/png"));
      showToast("ok", "Guardado");
      return true;
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [showToast]);

  /** Confirma el texto pendiente y espera a que el canvas se repinte. */
  const settleThen = useCallback(
    async (fn: () => Promise<boolean>) => {
      if (draftMirror.current) {
        finishDraft();
        // React repinta el canvas en un efecto posterior al commit: sin esperar
        // estos dos frames la copia saldria sin el texto recien escrito.
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r(null)))
        );
      }
      return fn();
    },
    [finishDraft]
  );

  const handleCopy = useCallback(() => settleThen(runCopy), [settleThen, runCopy]);

  const handleSave = useCallback(() => settleThen(runSave), [settleThen, runSave]);

  const handleDone = useCallback(async () => {
    if (await handleCopy()) onDone();
  }, [handleCopy, onDone]);

  /* ---------- atajos ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draftMirror.current) return; // el textarea gestiona sus propias teclas
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && key === "c") {
        e.preventDefault();
        void handleCopy();
        return;
      }
      if (mod && key === "s") {
        e.preventDefault();
        void handleSave();
        return;
      }
      if (mod && (key === "+" || key === "=")) {
        e.preventDefault();
        applyZoom(zoom * 1.25);
        return;
      }
      if (mod && key === "-") {
        e.preventDefault();
        applyZoom(zoom / 1.25);
        return;
      }
      if (mod && key === "0") {
        e.preventDefault();
        setZoom(1);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (selectedId !== null) setSelectedId(null);
        else onCancel();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        void handleDone();
        return;
      }
      if (key === "v") {
        e.preventDefault();
        setTool("select");
        return;
      }
      const map: Record<string, ToolId> = {
        v: "select",
        a: "arrow",
        l: "line",
        r: "rect",
        e: "ellipse",
        t: "text",
        n: "number",
        p: "pencil",
        b: "blur",
      };
      const next = map[key];
      if (next && !mod) {
        e.preventDefault();
        setTool(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    undo,
    redo,
    handleCopy,
    handleSave,
    deleteSelected,
    selectedId,
    handleDone,
    onCancel,
    applyZoom,
    zoom,
  ]);

  /* ---------- seleccion ---------- */

  const selected = shapes.find((s) => s.id === selectedId) ?? null;
  const selBounds = selected ? shapeBounds(selected) : null;

  const startResize = (e: React.PointerEvent<HTMLSpanElement>, handle: HandleId) => {
    e.stopPropagation();
    if (!selected) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    interaction.current = {
      type: "resize",
      handle,
      start: canvasPoint(e.clientX, e.clientY),
      id: selected.id,
      origin: selected,
      bounds: shapeBounds(selected),
    };
    setPreview(selected);
  };

  // si cambias de herramienta con algo seleccionado, la seleccion se suelta
  useEffect(() => {
    if (tool !== "select") setSelectedId(null);
  }, [tool]);

  const cursor =
    tool === "select" ? "default" : tool === "text" ? "text" : tool === "pencil" ? "pen" : "crosshair";

  return (
    <div className={`annotate-root${draft ? " is-editing-text" : ""}`}>
      <header
        className="editor-topbar"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button, input")) return;
          void getCurrentWindow().startDragging();
        }}
      >
        <div className="topbar-left">
          <button className="icon-btn" onClick={onCancel} title="Descartar y volver (Esc)">
            <svg viewBox="0 0 24 24">
              <path d="M15 6 L9 12 L15 18" />
            </svg>
            <span>Descartar</span>
          </button>
          <span className="dims-badge">
            {width} × {height} px
          </span>
        </div>

        <div className="topbar-actions">
          <button className="act-btn" onClick={() => void handleCopy()} title="Copiar (Ctrl+C)">
            Copiar
          </button>
          <button className="act-btn" onClick={() => void handleSave()} title="Guardar (Ctrl+S)">
            Guardar…
          </button>
          <button className="act-btn primary" onClick={() => void handleDone()} title="Copiar y cerrar (Enter)">
            Listo
          </button>
        </div>
      </header>

      <div className="editor-stage" ref={stageRef} onWheel={onWheel}>
        <div className="canvas-sizer" style={{ width: dispW, height: dispH }}>
          {/* pointermove/up viven en el contenedor, no en el canvas: al arrastrar un
            tirador de esquina el puntero queda capturado por ese <span>, que es
            hermano del canvas, asi que los eventos nunca llegarian al canvas. */}
          <div
            className="canvas-wrap"
            style={{ width: dispW, height: dispH }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => endInteraction(true)}
          >
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              style={{ width: dispW, height: dispH }}
              className={`annotate-canvas cursor-${cursor}`}
              onPointerDown={onPointerDown}
            />

            {selBounds && selected && (
              <div
                className="selection-box"
                style={{
                  left: selBounds.x * scale,
                  top: selBounds.y * scale,
                  width: selBounds.width * scale,
                  height: selBounds.height * scale,
                }}
              >
                <span className="selection-tag">{LABEL[selected.kind]}</span>
                {HANDLES.map((h) => (
                  <span
                    key={h}
                    className={`handle handle-${h}`}
                    onPointerDown={(e) => startResize(e, h)}
                  />
                ))}
              </div>
            )}

            {draft && (
              <textarea
                ref={draftRef}
                className="text-draft"
                value={draft.value}
                placeholder="Escribe…  ⏎ confirmar · ⇧⏎ nueva línea · Esc cancelar"
                spellCheck={false}
                style={{
                  left: draft.x * scale,
                  top: draft.y * scale,
                  fontSize: fontSize * scale,
                  lineHeight: `${textLineHeight(fontSize) * scale}px`,
                  color,
                }}
                onChange={(e) => {
                  const value = e.target.value;
                  const cur = draftMirror.current;
                  if (!cur) return;
                  draftMirror.current = { ...cur, value };
                  setDraft({ ...cur, value });
                }}
                onKeyDown={(e) => {
                  // Sin esto, el handler de window tambien recibiria Enter/Escape
                  // y confirmaria el texto dos veces.
                  e.stopPropagation();
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    finishDraft();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelDraft();
                  }
                }}
                onBlur={() => {
                  // El borrador NUNCA se descarta por perder el foco: solo con
                  // Esc o con Enter. Aqui solo se recupera el foco si el
                  // usuario lo perdio por accident (clic fuera del textarea).
                  const el = draftRef.current;
                  if (el && draftMirror.current && document.activeElement !== el) {
                    el.focus();
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      <footer className="editor-bottombar">
        <Toolbar
          tool={tool}
          setTool={(t) => {
            finishDraft();
            setTool(t);
          }}
          color={color}
          setColor={setColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          fontSize={fontSize}
          setFontSize={setFontSize}
          onUndo={undo}
          onRedo={redo}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
          onDelete={deleteSelected}
          canDelete={selectedId !== null}
          onClear={clearAll}
          canClear={shapes.length > 0}
          disabled={!!draft}
        />

        <div className="zoom-group">
          <button
            type="button"
            className="tool-btn"
            title="Alejar"
            aria-label="Alejar"
            onClick={() => applyZoom(zoom / 1.25)}
            disabled={!!draft}
          >
            <svg viewBox="0 0 24 24">
              <path d="M5 12 H19" />
            </svg>
          </button>
          <button
            type="button"
            className="zoom-value"
            onClick={() => setZoom(1)}
            title="Ajustar a la ventana"
            aria-label="Ajustar a la ventana"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="tool-btn"
            title="Acercar"
            aria-label="Acercar"
            onClick={() => applyZoom(zoom * 1.25)}
            disabled={!!draft}
          >
            <svg viewBox="0 0 24 24">
              <path d="M12 5 V19 M5 12 H19" />
            </svg>
          </button>
        </div>
      </footer>

      {toast && (
        <div className={`toast toast-${toast.kind}`} role="status">
          {toast.msg}
        </div>
      )}
    </div>
  );
}

const LABEL: Record<Shape["kind"], string> = {
  arrow: "Flecha",
  line: "Línea",
  rect: "Rectángulo",
  ellipse: "Elipse",
  text: "Texto",
  number: "Número",
  pencil: "Lápiz",
  blur: "Pixelado",
};