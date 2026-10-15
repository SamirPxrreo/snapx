/** Simula el bus de eventos de Tauri. `window.__snapxEmit` dispara a mano. */
type Handler = (e: { payload: unknown }) => void;
const handlers = new Map<string, Handler>();

export async function listen(event: string, cb: Handler): Promise<() => void> {
  handlers.set(event, cb);
  (window as any).__snapxEmit = (name: string, payload: unknown = {}) => {
    handlers.get(name)?.({ payload });
  };
  return () => handlers.delete(event);
}

export async function emit(_event: string, _payload?: unknown): Promise<void> {}