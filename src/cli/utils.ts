export function isTTY(): boolean {
  return process.stdin.isTTY && process.stdout.isTTY;
}