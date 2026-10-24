// The iOS app in the iOS Simulator, run from the command line with no Xcode or Simulator window:
//   npm run ios [-- --device ipad|iphone] [--shot out.png] [--wait 10] [--no-build]
// builds the web game, syncs it into the Capacitor project (ios/), builds the app for the simulator with
// xcodebuild, boots a simulator headless with simctl, turns it to landscape, installs and launches the app, and
// with --shot saves a screenshot once the game has had `--wait` seconds to start. The app keeps running; its
// output, which carries the web view's console in debug builds, goes to $TMPDIR/portolan-ios/app.log.
// Tests import the same steps. Step logs go to $TMPDIR/portolan-ios/; a failing step prints its errors.
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { build } from 'vite';
import { root, DEVICES, type DeviceName } from './harness.ts';

export const APP_ID = 'com.portolan.game';
export const LOGS = join(tmpdir(), 'portolan-ios');
export const APP_LOG = join(LOGS, 'app.log');
const DERIVED = join(root, 'ios/DerivedData');
export const APP = join(DERIVED, 'Build/Products/Debug-iphonesimulator/App.app');

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Run a command to completion with its output in LOGS/<name>.log; on failure, throw with its error lines. */
function step(name: string, cmd: string, args: string[]): void {
  mkdirSync(LOGS, { recursive: true });
  const log = join(LOGS, `${name}.log`), fd = openSync(log, 'w');
  try {
    execFileSync(cmd, args, { cwd: root, stdio: ['ignore', fd, fd] });
  } catch {
    const lines = readFileSync(log, 'utf8').trimEnd().split('\n');
    const errors = lines.filter((l) => /error:|FAILED|fatal/i.test(l));
    const tail = (errors.length ? errors : lines).slice(-20).map((l) => l.slice(0, 300)).join('\n');
    throw new Error(`${name} failed (${cmd} ${args.join(' ')}); full log: ${log}\n${tail}`);
  } finally {
    closeSync(fd);
  }
}

const simctl = (...args: string[]) =>
  execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Build the web game, sync it into ios/, and build the app for the simulator. Returns the .app's path. */
export async function buildApp(): Promise<string> {
  await build({ root, logLevel: 'warn' });
  step('cap-sync', 'npx', ['cap', 'sync', 'ios']);
  step('xcodebuild', 'xcodebuild', [
    '-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug',
    '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', DERIVED, '-quiet', 'build',
  ]);
  return APP;
}

/**
 * The UDID of this project's simulator for a device profile ("Portolan <label>"), created if it does not exist yet,
 * so tests never disturb the developer's own simulators. It runs on the newest installed iOS runtime of the selected
 * Xcode's major version (iOS 27 for Xcode 27) that supports the device type. Runtimes made for one new device are
 * skipped (iOS 27.1 24A94425 runs only the iPhone Duo), and an older runtime is an error, never a quiet fallback.
 */
export function simulator(device: DeviceName = 'ipad'): string {
  const { label, simulator: type } = DEVICES[device];
  const name = `Portolan ${label}`;
  const major = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-version'], { encoding: 'utf8' })
    .trim().split('.')[0];
  const { runtimes } = JSON.parse(simctl('list', '-j', 'runtimes', 'available')) as {
    runtimes: { identifier: string; platform: string; version: string; supportedDeviceTypes: { identifier: string }[] }[];
  };
  const runtime = runtimes
    .filter((r) => r.platform === 'iOS' && r.version.split('.')[0] === major
      && r.supportedDeviceTypes.some((t) => t.identifier === type))
    .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true })).pop();
  if (!runtime) throw new Error(`no iOS ${major} Simulator runtime runs the ${label}: run \`xcodebuild -downloadPlatform iOS\``);
  const { devices } = JSON.parse(simctl('list', '-j', 'devices', 'available')) as {
    devices: Record<string, { name: string; udid: string }[]>;
  };
  const found = devices[runtime.identifier]?.find((d) => d.name === name);
  return found ? found.udid : simctl('create', name, type, runtime.identifier);
}

/**
 * Boot a simulator headless (simctl never opens Simulator.app), wait until it has finished booting, and turn it to
 * landscape, as the game is held: a headless simulator otherwise stays in portrait, where iPadOS letterboxes a
 * landscape-only app.
 */
export function boot(udid: string): void {
  if (!simctl('list', 'devices', udid).includes('(Booted)')) simctl('boot', udid);
  simctl('bootstatus', udid, '-b');
  rotate(udid, 3);
}

/** Turn the simulator to a UIDeviceOrientation (1 portrait, 3 landscape left, 4 landscape right). */
export function rotate(udid: string, orientation: number): void {
  const source = join(root, 'tests/sim-orientation.swift'), tool = join(LOGS, 'sim-orientation');
  if (!existsSync(tool) || statSync(tool).mtimeMs < statSync(source).mtimeMs) {
    mkdirSync(LOGS, { recursive: true });
    step('sim-orientation-build', 'xcrun', ['swiftc', '-O', source, '-o', tool]);
  }
  execFileSync(tool, [udid, String(orientation)]);
}

export function install(udid: string, app = APP): void {
  simctl('install', udid, app);
}

/**
 * Launch the app fresh (any running copy is terminated first), its output and the web view's console streaming to
 * `log` until it exits, and wait until the page has run for `settle` seconds. Returns the app's process id.
 */
export async function launch(udid: string, log = APP_LOG, settle = 8): Promise<number> {
  mkdirSync(dirname(log), { recursive: true });
  const old = pid(udid), fd = openSync(log, 'w');
  // --console-pty: the app writes to a terminal, so its output is line-buffered and arrives as it happens.
  spawn('xcrun', ['simctl', 'launch', '--console-pty', '--terminate-running-process', udid, APP_ID], {
    detached: true, stdio: ['ignore', fd, fd],
  }).unref();
  closeSync(fd);
  let now = 0;
  for (let i = 0; i < 100 && (!now || now === old); i++) {
    await sleep(100);
    now = pid(udid);
  }
  if (!now || now === old) throw new Error(`${APP_ID} did not launch; see ${log}`);
  await sleep(settle * 1000);
  if (readFileSync(log, 'utf8').includes('WebView process terminated')) {
    throw new Error(`${APP_ID}'s web view died while starting; see ${log} and ~/Library/Logs/DiagnosticReports/`);
  }
  return now;
}

/** The web view's console errors and warnings in the app's log, and any crash of its web content process. */
export function appProblems(log = APP_LOG): string[] {
  return readFileSync(log, 'utf8').split('\n').filter((l) => /⚡️ {2}\[(error|warn)\]|process terminated/.test(l));
}

export function terminate(udid: string): void {
  simctl('terminate', udid, APP_ID);
}

/** The running app's process id, or 0 if it is not running. */
export function pid(udid: string): number {
  const line = simctl('spawn', udid, 'launchctl', 'list').split('\n').find((l) => l.includes(`UIKitApplication:${APP_ID}`));
  return line ? +line.split('\t')[0] || 0 : 0;
}

/**
 * Send the app to the background by bringing Settings to the front (simctl has no home button), then bring it
 * back. Returns the app's process ids before and after: equal when it resumed rather than relaunched.
 */
export async function backgroundAndResume(udid: string, seconds = 3): Promise<[number, number]> {
  const before = pid(udid);
  simctl('launch', udid, 'com.apple.Preferences');
  await sleep(seconds * 1000);
  simctl('launch', udid, APP_ID);
  return [before, pid(udid)];
}

/** Save a screenshot as PNG at the device's full resolution, upright in the device's orientation. */
export function screenshot(udid: string, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  simctl('io', udid, 'screenshot', '--type=png', path);
}

if (import.meta.main) {
  const { values: a } = parseArgs({
    options: {
      device: { type: 'string', default: 'ipad' },
      shot: { type: 'string' },
      wait: { type: 'string', default: '10' },
      'no-build': { type: 'boolean', default: false },
    },
  });
  const device = a.device as DeviceName;
  if (!(device in DEVICES)) throw new Error(`--device must be one of ${Object.keys(DEVICES).join(', ')}`);
  const t0 = Date.now(), done = (what: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s  ${what}`);
  if (!a['no-build']) done(`built ${await buildApp()}`);
  const udid = simulator(device);
  boot(udid);
  const os = [...simctl('list', 'devices', udid).split(udid)[0].matchAll(/-- (iOS [\d.]+) --/g)].pop()?.[1];
  done(`booted ${DEVICES[device].label} on ${os} (${udid}) headless, in landscape`);
  install(udid);
  done(`launched ${APP_ID} (pid ${await launch(udid)}); its output: ${APP_LOG}`);
  if (a.shot) {
    await sleep(+a.wait! * 1000);
    screenshot(udid, a.shot);
    done(`screenshot ${a.shot}`);
    for (const p of appProblems()) console.log(`app: ${p}`);
  }
}
