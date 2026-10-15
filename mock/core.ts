export async function invoke(_cmd: string, args: any = {}): Promise<any> {
  const mod: any = await import("./tauri-api");
  return mod.invoke(_cmd, args);
}

export const convertFileSrc = (p: string) => `file:///${p.replace(/\\/g, "/")}`;

export function convertFileSrcSync(p: string) {
  return convertFileSrc(p);
}