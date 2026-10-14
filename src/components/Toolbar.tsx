import type { ToolId } from "../lib/types";

const TOOLS: { id: ToolId; label: string; key: string; icon: JSX.Element }[] = [
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
    label: "Linea",
    key: "L",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 20 L20 4" />
      </svg>
    ),
  },
  {
    id: "rect",
    label: "Rectangulo",
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
  {
    id: "number",
    label: "Numero",
    key: "N",
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7.5" />
        <path d="M12 8.5 L12 15.5 M9.5 8 L14.5 8 M9.5 15 L14.5 15" />
      </svg>
    ),
  },
  {
    id: "highlight",
    label: "Resaltador",
    key: "H",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 15 L14 5 L19 10 L9 20 L4 20 Z" />
      </svg>
    ),
  },
];

const COLORS: { hex: string; name: string }[] = [
  { hex: "#ef4444", name: "Rojo" },
  { hex: "#f97316", name: "Naranja" },
  { hex: "#facc15", name: "Amarillo" },
  { hex: "#22c55e", name: "Verde" },
  { hex: "#3b82f6", name: "Azul" },
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
  onUndo: () => void;
  canUndo: boolean;
  disabled?: boolean;
}

/** Pildora de herramientas estilo CleanShot: herramientas, grosor, colores. */
export default function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  onUndo,
  canUndo,
  disabled,
}: Props) {
  return (
    <div className="toolbar" onPointerDown={(e) => e.stopPropagation()}>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`tool-btn${tool === t.id ? " active" : ""}`}
          title={`${t.label} (${t.key})`}
          onClick={() => setTool(t.id)}
          disabled={disabled}
        >
          {t.icon}
        </button>
      ))}

      <div className="tool-sep" />

      <button className="tool-btn" title="Deshacer (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
        <svg viewBox="0 0 24 24">
          <path d="M8 6 L3 11 L8 16 M3 11 L14 11 A6 6 0 0 1 20 17" />
        </svg>
      </button>

      <div className="tool-sep" />

      <input
        className="width-slider"
        type="range"
        min={2}
        max={16}
        step={1}
        value={strokeWidth}
        title={`Grosor ${strokeWidth}`}
        onChange={(e) => setStrokeWidth(Number(e.target.value))}
        disabled={disabled}
      />

      <div className="tool-sep" />

      <div className="tool-group">
        {COLORS.map((c) => (
          <button
            key={c.hex}
            className={`swatch${color === c.hex ? " active" : ""}`}
            style={{ background: c.hex }}
            title={c.name}
            onClick={() => setColor(c.hex)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
