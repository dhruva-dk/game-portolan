type Usage = { user: number; system: number };
const thread = (process as { threadCpuUsage?: () => Usage }).threadCpuUsage;

export function cpuNow(): number {
  const u = thread ? thread.call(process) : process.cpuUsage();
  return (u.user + u.system) / 1000;
}
