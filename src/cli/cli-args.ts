/** Giá trị đứng sau `--<name>` trong argv; không có thì `undefined`. */
export function argOf(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Cờ không kèm giá trị (`--<name>`) có mặt trong argv không. */
export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function usage(line: string): never {
  process.stderr.write(`Cách dùng: ${line}\n`);
  process.exit(2);
}
