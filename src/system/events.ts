export type LeafmarkEvent = {
  schemaVersion: 1;
  type: string;
  [key: string]: unknown;
};

export function emitEvent(type: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ schemaVersion: 1, type, ...data } satisfies LeafmarkEvent));
}
