export async function writeImage(bytes: Uint8Array): Promise<void> {
  if ((window as any).__snapxFailFallback) {
    throw new Error("plugin: no permitido");
  }
  (window as any).__snapxPluginCopyBytes = bytes.length;
  (window as any).__snapxUsedFallback = true;
}

export async function readText(): Promise<string> {
  return "";
}

export async function writeText(_text: string): Promise<void> {}