export type LeafmarkEvent = {
    schemaVersion: 1;
    type: string;
    [key: string]: unknown;
};
export declare function emitEvent(type: string, data?: Record<string, unknown>): void;
