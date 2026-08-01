export function emitEvent(type, data = {}) {
    console.log(JSON.stringify({ schemaVersion: 1, type, ...data }));
}
//# sourceMappingURL=events.js.map