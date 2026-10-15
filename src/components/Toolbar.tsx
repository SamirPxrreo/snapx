import type { ToolId } from "../lib/types";

const TOOLS: { id: ToolId; label: string; key: string; icon: JSX.Element }[] = [
  {
    id: "select",
    label: "Seleccionar",
    key: "V",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M6 3 L18 12.5 L12.2 13.6 L15.5 20 L12.8 21 L9.6 14.6 L6 18.5 Z" />
      </svg>
    ),
  },
  {
    id: "arrow",
    label: "Flecha",
    key: "A",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 20 L20 4 M20 4 L13 4 M20 4 L20 11" />
      </svg>
    ),
  },
  {
    id: "line",
    label: "Línea",
    key: "L",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 20 L20 4" />
      </svg>
    ),
  },
  {
    id: "rect",
    label: "Rectángulo",
    key: "R",
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="4" y="6" width="16" height="12" rx="1.5" />
      </svg>
    ),
  },
  {
    id: "ellipse",
    label: "Elipse",
    key: "E",
    icon: (
      <svg viewBox="0 0 24 24">
        <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />
      </svg>
    ),
  },
  {
    id: "text",
    label: "Texto",
    key: "T",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M6 5 L18 5 M12 5 L12 19" />
      </svg>
    ),
  },
  {
    id: "number",
    label: "Número",
    key: "N",
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7.5" />
        <path d="M12 8.5 L12 15.5 M9.5 8 L14.5 8 M9.5 15 L14.5 15" />
      </svg>
    ),
  },
  {
    id: "pencil",
    label: "Lápiz",
    key: "P",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 20 L4.8 16.6 L15.6 5.8 L18.2 8.4 L7.4 19.2 Z" />
        <path d="M15.6 5.8 L17.2 4.2 A1.6 1.6 0 0 1 19.8 6.8 L18.2 8.4" />
      </svg>
    ),
  },
  {
    id: "blur",
    label: "Pixelar",
    key: "B",
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="5" y="5" width="4" height="4" />
        <rect x="10" y="5" width="4" height="4" />
        <rect x="15" y="5" width="4" height="4" />
        <rect x="5" y="10" width="4" height="4" />
        <rect x="15" y="10" width="4" height="4" />
        <rect x="5" y="15" width="4" height="4" />
        <rect x="10" y="15" width="4" height="4" />
        <rect x="15" y="15" width="4" height="4" />
      </svg>
    ),
  },
];

const COLORS: { hex: string; name: string }[] = [
  { hex: "#ef4444", name: "Rojo" },
  { hex: "#f97316", name: "Naranja" },
  { hex: "#facc15", name: "Amarillo" },
  { hex: "#22c55e", name: "Verde" },
  { hex: "#38bdf8", name: "Cian" },
  { hex: "#3b82f6", name: "Azul" },
  { hex: "#a855f7", name: "Morado" },
  { hex: "#ffffff", name: "Blanco" },
  { hex: "#111827", name: "Negro" },
];

interface Props {
  tool: ToolId;
  setTool: (t: ToolId) => void;
  color: string;
  setColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (w: number) => void;
  fontSize: number;
  setFontSize: (n: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDelete: () => void;
  canDelete: boolean;
  onClear: () => void;
  canClear: boolean;
  disabled?: boolean;
}

const fillStyle = (pct: number) =>
  ({ "--fill": `${pct}%` }) as React.CSSProperties;

export default function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  fontSize,
  setFontSize,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDelete,
  canDelete,
  onClear,
  canClear,
  disabled,
}: Props) {
  const off = disabled || undefined;

  return (
    <div className="toolbar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="tool-group" role="group" aria-label="Herramientas">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tool-btn${tool === t.id ? " active" : ""}`}
            title={`${t.label} (${t.key})`}
            aria-label={`${t.label} — atajo ${t.key}`}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
            disabled={off}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="tool-sep" />

      <div className="tool-group" role="group" aria-label="Historial">
        <button
          type="button"
          className="tool-btn"
          title="Deshacer (Ctrl+Z)"
          aria-label="Deshacer"
          onClick={onUndo}
          disabled={!canUndo || off}
        >
          <svg viewBox="0 0 24 24">
            <path d="M8 6 L3 11 L8 16 M3 11 L14 11 A6 6 0 0 1 20 17" />
          </svg>
        </button>
        <button
          type="button"
          className="tool-btn"
          title="Rehacer (Ctrl+Y)"
          aria-label="Rehacer"
          onClick={onRedo}
          disabled={!canRedo || off}
        >
          <svg viewBox="0 0 24 24">
            <path d="M16 6 L21 11 L16 16 M21 11 L10 11 A6 6 0 0 0 4 17" />
          </svg>
        </button>
        <button
          type="button"
          className={`tool-btn${canDelete ? " has-selection" : ""}`}
          title="Borrar la forma seleccionada (Supr)"
          aria-label="Borrar la forma seleccionada"
          onClick={onDelete}
          disabled={!canDelete || off}
        >
          <svg viewBox="0 0 24 24">
            <path d="M5 7 H19 M9 7 V5 H15 V7 M7 7 L8 20 H16 L17 7 M11 11 V16 M13 11 V16" />
          </svg>
        </button>
        <button
          type="button"
          className="tool-btn"
          title="Borrar todas las anotaciones"
          aria-label="Borrar todas las anotaciones"
          onClick={onClear}
          disabled={!canClear || off}
        >
          <svg viewBox="0 0 24 24">
            <path d="M4 5 L20 5 M8 5 V3 H16 V5 M6 5 L7 20 H17 L18 5 M11 9 V16 M15 9 V16" />
          </svg>
        </button>
      </div>

      <div className="tool-sep" />

      <label className="slider-field" title={`Grosor ${strokeWidth} px`}>
        <span className="slider-label">Grosor</span>
        <input
          className="width-slider"
          type="range"
          min={2}
          max={24}
          step={1}
          value={strokeWidth}
          aria-label="Grosor del trazo"
          style={fillStyle(((strokeWidth - 2) / 22) * 100)}
          onChange={(e) => setStrokeWidth(Number(e.target.value))}
          disabled={off}
        />
        <span className="slider-value">{strokeWidth}</span>
      </label>

      <label className="slider-field" title={`Tamaño del texto ${fontSize} px`}>
        <span className="slider-label">Texto</span>
        <input
          className="width-slider"
          type="range"
          min={12}
          max={160}
          step={1}
          value={fontSize}
          aria-label="Tamaño del texto"
          style={fillStyle(((fontSize - 12) / 148) * 100)}
          onChange={(e) => setFontSize(Number(e.target.value))}
          disabled={off}
        />
        <span className="slider-value">{fontSize}</span>
      </label>

      <div className="tool-sep" />

      <div className="tool-group" role="group" aria-label="Colores">
        {COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            className={`swatch${color.toLowerCase() === c.hex ? " active" : ""}`}
            style={{ background: c.hex }}
            title={c.name}
            aria-label={c.name}
            aria-pressed={color.toLowerCase() === c.hex}
            onClick={() => setColor(c.hex)}
            disabled={off}
          />
        ))}
        <label className="swatch custom" title="Color personalizado">
          <input
            type="color"
            value={color}
            aria-label="Color personalizado"
            onChange={(e) => setColor(e.target.value)}
            disabled={off}
          />
          <svg viewBox="0 0 24 24">
            <path d="M12 3 C12 3 4 11.5 4 16 A8 8 0 0 0 20 16 C20 11.5 12 3 12 3 Z" />
            <circle cx="9" cy="15" r="1.2" />
            <circle cx="14" cy="16.5" r="1.2" />
          </svg>
        </label>
      </div>
    </div>
  );
}