import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyUpdate,
  checkForUpdate,
  CURRENT_VERSION,
  downloadUpdate,
  shouldCheck,
  type UpdateStatus,
} from "../lib/updater";

/**
 * Boton de actualizacion. Solo aparece si hay una version nueva publicada en
 * GitHub: en el estado `idle` no renderiza nada, asi que la barra de titulo
 * queda igual que siempre. La comprobacion es silenciosa, se hace al arrancar y
 * como maximo una vez cada seis horas.
 */
export default function UpdateButton() {
  const [state, setState] = useState<UpdateStatus>({ kind: "idle" });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!shouldCheck()) return;
    void checkForUpdate().then((s) => {
      if (mounted.current && s.kind !== "error") setState(s);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  const onClick = useCallback(async () => {
    if (state.kind === "ready") {
      await applyUpdate();
      return;
    }
    if (state.kind !== "available") return;
    const { update, version } = state;
    setState({ kind: "downloading", version, update, pct: 0 });
    const next = await downloadUpdate(update, (pct) => {
      if (mounted.current) setState({ kind: "downloading", version, update, pct });
    });
    if (mounted.current) setState(next);
  }, [state]);

  if (state.kind === "idle" || state.kind === "error" || state.kind === "checking") return null;

  const label =
    state.kind === "available"
      ? `Actualizar a ${state.version}`
      : state.kind === "downloading"
        ? `Descargando ${state.pct}%`
        : `Reiniciar para instalar ${state.version}`;

  const title =
    state.kind === "available"
      ? `Hay una version nueva (${state.version}). Tienes ${CURRENT_VERSION}.`
      : state.kind === "downloading"
        ? "Descargando la actualizacion…"
        : "Actualizacion lista. Reinicia SnapX para aplicarla.";

  return (
    <button
      type="button"
      className={`update-btn update-${state.kind}`}
      onClick={() => void onClick()}
      title={title}
      aria-label={label}
      disabled={state.kind === "downloading"}
    >
      {state.kind === "downloading" ? (
        <>
          <span className="update-bar" aria-hidden="true">
            <span className="update-bar-fill" style={{ width: `${state.pct}%` }} />
          </span>
          <span className="update-text">{state.pct}%</span>
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {state.kind === "ready" ? (
              <>
                <path d="M20 12a8 8 0 1 1-2.4-5.7" />
                <path d="M20 4 V10 H14" />
              </>
            ) : (
              <>
                <path d="M12 3 V15" />
                <path d="M7 11 L12 16 L17 11" />
                <path d="M4 19 H20" />
              </>
            )}
          </svg>
          <span className="update-text">{state.kind === "ready" ? "Reiniciar" : state.version}</span>
        </>
      )}
    </button>
  );
}