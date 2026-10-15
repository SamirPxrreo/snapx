// Tipos compartidos del frontend

export interface MonitorInfo {
  name: string;
  /** coordenadas fisicas */
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  is_primary: boolean;
}

export interface VirtualDesktop {
  /** ruta local del PNG cosido de todos los monitores */
  path: string;
  width: number;
  height: number;
  min_x: number;
  min_y: number;
  /** escala (pixeles fisicos por pixel logico) del monitor primario */
  scale: number;
  monitors: MonitorInfo[];
}

export type ToolId =
  | "select"
  | "arrow"
  | "line"
  | "rect"
  | "ellipse"
  | "text"
  | "number"
  | "pencil"
  | "blur";

/** Herramientas que dibujan arrastrando sobre el canvas. */
export const DRAW_TOOLS: ToolId[] = [
  "arrow",
  "line",
  "rect",
  "ellipse",
  "pencil",
  "blur",
];

export interface BaseShape {
  id: number;
  color: string;
}

export interface StrokeShape extends BaseShape {
  kind: "arrow" | "line" | "rect" | "ellipse";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

/** Punto del trazo a mano. `w` es el factor de grosor (0..1) según la velocidad. */
export interface PathPoint {
  x: number;
  y: number;
  w?: number;
}

/** Trazo libre del lápiz: una polilineal suavizada, sin Beginning ni final rectos. */
export interface PathShape extends BaseShape {
  kind: "pencil";
  points: PathPoint[];
  width: number;
}

export interface NumberShape extends BaseShape {
  kind: "number";
  x: number;
  y: number;
  value: number;
  radius: number;
}

export interface TextShape extends BaseShape {
  kind: "text";
  x: number;
  y: number;
  /** puede llevar saltos de linea */
  text: string;
  fontSize: number;
}

export interface BlurShape extends BaseShape {
  kind: "blur";
  points: { x: number; y: number }[];
  radius: number;
}

export type Shape = StrokeShape | PathShape | NumberShape | TextShape | BlurShape;

export type StrokeKind = StrokeShape["kind"];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Pt {
  x: number;
  y: number;
}

const STROKE_KINDS: StrokeKind[] = ["arrow", "line", "rect", "ellipse"];

export const isStroke = (s: Shape): s is StrokeShape =>
  STROKE_KINDS.includes(s.kind as StrokeKind);

export const isPath = (s: Shape): s is PathShape => s.kind === "pencil";

/** Altura de una linea de texto (multiples lineas share la misma fuente). */
export const textLineHeight = (fontSize: number): number => Math.round(fontSize * 1.25);

/** Distancia minima (en px de captura) entre dos puntos del lapiz. */
export const PENCIL_MIN_STEP = 2;

/** Caja que ocupa una forma, en pixeles de la captura. */
export function shapeBounds(s: Shape): Rect {
  switch (s.kind) {
    case "text": {
      const lines = s.text.split("\n");
      return {
        x: s.x,
        y: s.y,
        width: Math.max(24, longestLineWidth(lines, s.fontSize)),
        height: lines.length * textLineHeight(s.fontSize),
      };
    }
    case "number":
      return { x: s.x - s.radius, y: s.y - s.radius, width: s.radius * 2, height: s.radius * 2 };
    case "pencil": {
      if (s.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      const pad = s.width / 2 + 1;
      const box = pointsBounds(s.points);
      return {
        x: box.x - pad,
        y: box.y - pad,
        width: box.width + pad * 2,
        height: box.height + pad * 2,
      };
    }
    case "blur": {
      if (s.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      const pad = s.radius / 2;
      const box = pointsBounds(s.points);
      return {
        x: box.x - pad,
        y: box.y - pad,
        width: box.width + pad * 2,
        height: box.height + pad * 2,
      };
    }
    default: {
      const st = s as StrokeShape;
      const pad = st.width / 2 + 2;
      return {
        x: Math.min(st.x1, st.x2) - pad,
        y: Math.min(st.y1, st.y2) - pad,
        width: Math.abs(st.x2 - st.x1) + pad * 2,
        height: Math.abs(st.y2 - st.y1) + pad * 2,
      };
    }
  }
}

function pointsBounds(points: { x: number; y: number }[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Ancho aproximado de un texto en pixeles (medido con el canvas, si se puede). */
export function measureText(
  lines: string[],
  fontSize: number,
  font = 'system-ui, "Segoe UI", sans-serif'
): number {
  if (typeof document === "undefined") return 0;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return 0;
  ctx.font = `600 ${fontSize}px ${font}`;
  let max = 0;
  for (const line of lines) max = Math.max(max, ctx.measureText(line).width);
  return max;
}

const longestLineWidth = (lines: string[], fontSize: number): number =>
  Math.max(24, measureText(lines, fontSize));

/** Desplaza una forma. */
export function translateShape(s: Shape, dx: number, dy: number): Shape {
  switch (s.kind) {
    case "text":
      return { ...s, x: s.x + dx, y: s.y + dy };
    case "number":
      return { ...s, x: s.x + dx, y: s.y + dy };
    case "pencil":
      return { ...s, points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
    case "blur":
      return { ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    default:
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  }
}

/** Escala una forma alrededor de un punto fijo (para los tiradores de resize). */
export function scaleShape(s: Shape, origin: Pt, factor: number): Shape {
  const f = (v: number) => origin.x + (v - origin.x) * factor;
  const g = (v: number) => origin.y + (v - origin.y) * factor;
  switch (s.kind) {
    case "text":
      return { ...s, x: f(s.x), y: g(s.y), fontSize: Math.max(8, s.fontSize * factor) };
    case "number":
      return { ...s, x: f(s.x), y: g(s.y), radius: Math.max(6, s.radius * factor) };
    case "pencil":
      return {
        ...s,
        points: s.points.map((p) => ({ ...p, x: f(p.x), y: g(p.y) })),
        width: Math.max(1, s.width * factor),
      };
    case "blur":
      return {
        ...s,
        points: s.points.map((p) => ({ x: f(p.x), y: g(p.y) })),
        radius: Math.max(6, s.radius * factor),
      };
    default:
      return {
        ...s,
        x1: f(s.x1),
        y1: g(s.y1),
        x2: f(s.x2),
        y2: g(s.y2),
        width: Math.max(1, s.width * factor),
      };
  }
}

/** Distancia de un punto al segmento AB (para detectar clics sobre el lapiz). */
function distToSegment(p: Pt, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Comprueba si un punto cae dentro de la forma (con margen en pixeles). */
export function hitTest(s: Shape, p: Pt, tolerance: number): boolean {
  if (s.kind === "blur") {
    for (const pt of s.points) {
      const r = s.radius / 2 + tolerance;
      if (Math.abs(p.x - pt.x) <= r && Math.abs(p.y - pt.y) <= r) return true;
    }
    return false;
  }
  if (s.kind === "pencil") {
    const r = s.width / 2 + tolerance;
    if (s.points.length === 1) {
      return Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) <= r;
    }
    for (let i = 1; i < s.points.length; i++) {
      if (distToSegment(p, s.points[i - 1], s.points[i]) <= r) return true;
    }
    return false;
  }
  if (s.kind === "number") {
    return Math.hypot(p.x - s.x, p.y - s.y) <= s.radius + tolerance;
  }
  const b = shapeBounds(s);
  return (
    p.x >= b.x - tolerance &&
    p.x <= b.x + b.width + tolerance &&
    p.y >= b.y - tolerance &&
    p.y <= b.y + b.height + tolerance
  );
}

/** La ultima forma dibujada encima (la de arriba en la pila). */
export function topShapeAt(shapes: Shape[], p: Pt, tolerance: number): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitTest(shapes[i], p, tolerance)) return shapes[i];
  }
  return null;
}

/**
 * Suaviza el trazo del lapiz: el raton entrega puntos con angulos duros y a
 * saltos, asi que se promedia cada punto con sus vecinos (los extremos se
 * mantienen clavados). Sin esto el "rayado" sale como una poligonal dentada.
 */
export function smoothPath(points: PathPoint[]): PathPoint[] {
  if (points.length < 3) return points;
  const out: PathPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    out.push({
      x: cur.x * 0.5 + (prev.x + next.x) * 0.25,
      y: cur.y * 0.5 + (prev.y + next.y) * 0.25,
      w: cur.w,
    });
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Grosor relativo de un punto del lapiz segun lo rapido que se movia el raton:
 * al rayar rapido sale mas fino, como un lapiz de verdad.
 */
export function penWidthFactor(prev: PathPoint | null, cur: PathPoint): number {
  if (!prev) return 1;
  const step = Math.hypot(cur.x - prev.x, cur.y - prev.y);
  if (step <= 0) return 1;
  // ~6 px entre muestras es el ritmo natural del raton sin aceleracion.
  const factor = 1 - Math.min(step, 40) / 40 / 1.6;
  return Math.max(0.35, Math.min(1, factor));
}