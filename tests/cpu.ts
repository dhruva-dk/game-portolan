// The CPU time this thread has spent, ms: the clock for every cost budget in the tests (S-007). Wall time counts the
// moments another process held the core, so a loaded machine (the browser tests, other agents' suites) made the sim
// look slow; this thread's own user + system time counts only the measured code. Used as performance.now() is:
// t0 = cpuNow(); work(); cost = cpuNow() - t0. Falls back to the process's time where the thread clock is missing.
type Usage = { user: number; system: number };
const thread = (process as { threadCpuUsage?: () => Usage }).threadCpuUsage;

export function cpuNow(): number {
  const u = thread ? thread.call(process) : process.cpuUsage();
  return (u.user + u.system) / 1000;
}
