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
  | "arrow"
  | "line"
  | "rect"
  | "ellipse"
  | "text"
  | "number"
  | "highlight"
  | "blur";

export interface BaseShape {
  id: number;
  color: string;
}

export interface StrokeShape extends BaseShape {
  kind: "arrow" | "line" | "rect" | "ellipse" | "highlight";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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
  text: string;
  fontSize: number;
}

export interface BlurShape extends BaseShape {
  kind: "blur";
  points: { x: number; y: number }[];
  radius: number;
}

export type Shape = StrokeShape | NumberShape | TextShape | BlurShape;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
