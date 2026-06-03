export function die(msg: string, code = 1): never {
  console.error(msg);
  process.exit(code);
}
