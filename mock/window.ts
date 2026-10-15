export const getCurrentWindow = () => ({
  setPosition: async () => undefined,
  setSize: async () => undefined,
  startDragging: async () => undefined,
  show: async () => undefined,
  hide: async () => undefined,
  close: async () => undefined,
  minimize: async () => undefined,
  unminimize: async () => undefined,
  setFocus: async () => undefined,
  onCloseRequested: async () => () => undefined,
});

export class LogicalPosition {
  constructor(
    public x: number,
    public y: number
  ) {}
}
export class LogicalSize {
  constructor(
    public width: number,
    public height: number
  ) {}
}
export class PhysicalPosition {
  constructor(
    public x: number,
    public y: number
  ) {}
}