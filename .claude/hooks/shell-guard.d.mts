/** Why this command is turned back, or null if it may run. `cwd` is where it would run. */
export function refuse(command: string, cwd?: string): string | null;
