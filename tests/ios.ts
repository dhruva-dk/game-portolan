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
 * The UDID of this project's simulator for a device profile ("Portolan <label>"), created on the newest iOS
 * runtime if it does not exist yet, so tests never disturb the developer's own simulators.
 */
export function simulator(device: DeviceName = 'ipad'): string {
  const { label, simulator: type } = DEVICES[device];
  const name = `Portolan ${label}`;
  const { devices } = JSON.parse(simctl('list', '-j', 'devices', 'available')) as {
    devices: Record<string, { name: string; udid: string }[]>;
  };
  const found = Object.values(devices).flat().find((d) => d.name === name);
  if (found) return found.udid;
  const { runtimes } = JSON.parse(simctl('list', '-j', 'runtimes', 'available')) as {
    runtimes: { identifier: string; platform: string; version: string }[];
  };
  const ios = runtimes.filter((r) => r.platform === 'iOS')
    .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true })).pop();
  if (!ios) throw new Error('no iOS Simulator runtime installed: run `xcodebuild -downloadPlatform iOS`');
  return simctl('create', name, type, ios.identifier);
}

/**
 * Boot a simulator headless (simctl never opens Simulator.app), wait until it has finished booting, and make it
 * ready for the game:
 * - Malloc=1 for every process it launches, so WebKit uses the system allocator. On this host (macOS 27, Xcode
 *   26.2, iOS 26.3 runtime) WebKit's own allocator crashed every page with real JavaScript (in Safari too); with
 *   the system allocator about half of launches start cleanly, and launch() retries the rest. Simulator only.
 * - Landscape, as the game is held. A headless simulator otherwise stays in portrait, where iPadOS letterboxes a
 *   landscape-only app.
 */
export function boot(udid: string): void {
  if (!simctl('list', 'devices', udid).includes('(Booted)')) simctl('boot', udid);
  simctl('bootstatus', udid, '-b');
  simctl('spawn', udid, 'launchctl', 'setenv', 'Malloc', '1');
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
 * On this host the iOS 26.3 runtime's web content process often dies while it starts (a protection fault reading
 * the dyld shared cache or inside JavaScriptCore, seen in Safari too), so a launch whose web view dies is retried.
 */
export async function launch(udid: string, log = APP_LOG, settle = 8, attempts = 5): Promise<number> {
  mkdirSync(dirname(log), { recursive: true });
  for (let attempt = 1; attempt <= attempts; attempt++) {
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
    if (!readFileSync(log, 'utf8').includes('WebView process terminated')) return now;
    console.warn(`ios: the web view died while starting (attempt ${attempt} of ${attempts}); see ${log}`);
  }
  throw new Error(`${APP_ID}'s web view kept dying; see ${log} and ~/Library/Logs/DiagnosticReports/`);
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

/**
 * Save a screenshot as PNG at the device's full resolution, upright. simctl captures the portrait framebuffer, so
 * the landscape picture that boot() turned the device to lies on its side and is turned back here.
 */
export function screenshot(udid: string, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  simctl('io', udid, 'screenshot', '--type=png', path);
  execFileSync('sips', ['--rotate', '-90', path], { stdio: 'ignore' });
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
  done(`booted ${DEVICES[device].label} (${udid}) headless, in landscape`);
  install(udid);
  done(`launched ${APP_ID} (pid ${await launch(udid)}); its output: ${APP_LOG}`);
  if (a.shot) {
    await sleep(+a.wait! * 1000);
    screenshot(udid, a.shot);
    done(`screenshot ${a.shot}`);
    for (const p of appProblems()) console.log(`app: ${p}`);
  }
}
