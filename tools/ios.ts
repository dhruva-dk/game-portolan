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

export async function buildApp(): Promise<string> {
  await build({ root, logLevel: 'warn' });
  step('cap-sync', 'npx', ['cap', 'sync', 'ios']);
  step('xcodebuild', 'xcodebuild', [
    '-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug',
    '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', DERIVED, '-quiet', 'build',
  ]);
  return APP;
}

// ---------------------------------------------------------------- a real device

/** The app built for real devices (Debug, so Safari's Web Inspector can attach to its web view). */
export const DEVICE_APP = join(DERIVED, 'Build/Products/Debug-iphoneos/App.app');

/** The team that signs a build for a real device: PORTOLAN_TEAM, else the paid team Xcode is signed in to. */
export function signingTeam(): string {
  if (process.env.PORTOLAN_TEAM) return process.env.PORTOLAN_TEAM;
  const plist = join(LOGS, 'xcode-defaults.plist');
  mkdirSync(LOGS, { recursive: true });
  execFileSync('defaults', ['export', 'com.apple.dt.Xcode', plist]);
  let teams: { teamID: string; isFreeProvisioningTeam: boolean }[] = [];
  try {
    const byAccount = JSON.parse(execFileSync('plutil', ['-extract', 'IDEProvisioningTeamByIdentifier', 'json', '-o', '-', plist], { encoding: 'utf8' }));
    teams = Object.values(byAccount).flat() as typeof teams;
  } catch {
    // (no account signed in)
  }
  const paid = teams.find((t) => !t.isFreeProvisioningTeam) ?? teams[0];
  if (!paid) throw new Error('no signing team: sign in to Xcode (Settings › Accounts) with your Apple Developer account, or set PORTOLAN_TEAM');
  return paid.teamID;
}

/** Builds the app for real devices, signed by `team`. Built for one device, that device is registered with the team
 *  first if it is not yet, so the build's provisioning profile lets it install there. */
export async function buildDeviceApp(team: string, device?: RealDevice): Promise<string> {
  await build({ root, logLevel: 'warn' });
  step('cap-sync', 'npx', ['cap', 'sync', 'ios']);
  step('xcodebuild-device', 'xcodebuild', [
    '-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug',
    '-destination', device ? `platform=iOS,id=${device.udid}` : 'generic/platform=iOS', '-derivedDataPath', DERIVED,
    '-allowProvisioningUpdates', ...(device ? ['-allowProvisioningDeviceRegistration'] : []),
    `DEVELOPMENT_TEAM=${team}`, 'CODE_SIGN_STYLE=Automatic', '-quiet', 'build',
  ]);
  return DEVICE_APP;
}

export interface RealDevice { id: string; udid: string; name: string; type: string; paired: boolean; developerMode: boolean; connected: boolean }

/** The real iPads and iPhones this Mac knows, paired or not. */
export function realDevices(): RealDevice[] {
  const out = join(LOGS, 'devices.json');
  mkdirSync(LOGS, { recursive: true });
  execFileSync('xcrun', ['devicectl', 'list', 'devices', '--json-output', out], { stdio: 'ignore' });
  const { result } = JSON.parse(readFileSync(out, 'utf8')) as {
    result: { devices: {
      identifier: string;
      deviceProperties: { name: string; developerModeStatus?: string };
      hardwareProperties: { reality: string; deviceType: string; udid: string };
      connectionProperties: { pairingState: string; tunnelState?: string; transportType?: string };
    }[] };
  };
  return result.devices.filter((d) => d.hardwareProperties.reality === 'physical').map((d) => ({
    id: d.identifier, udid: d.hardwareProperties.udid, name: d.deviceProperties.name, type: d.hardwareProperties.deviceType,
    paired: d.connectionProperties.pairingState === 'paired',
    developerMode: d.deviceProperties.developerModeStatus === 'enabled',
    connected: d.connectionProperties.tunnelState === 'connected' || !!d.connectionProperties.transportType,
  }));
}

/** The real device of a kind ('iPad' or 'iPhone') to install on, or why there is none ready. */
export function realDevice(type: 'iPad' | 'iPhone'): RealDevice {
  const all = realDevices().filter((d) => d.type === type);
  const ready = all.find((d) => d.paired && d.developerMode);
  if (ready) return ready;
  if (!all.length) throw new Error(`no ${type} known to this Mac: connect it by USB, unlock it and tap Trust`);
  const d = all[0];
  if (!d.paired) throw new Error(`${d.name} is not paired: connect it by USB, unlock it and tap Trust`);
  throw new Error(`${d.name} has Developer Mode off: Settings › Privacy & Security › Developer Mode, then restart it`);
}

/** Installs the device build on a real device and starts it. */
export function installOnDevice(device: RealDevice, app = DEVICE_APP): void {
  step('devicectl-install', 'xcrun', ['devicectl', 'device', 'install', 'app', '--device', device.id, app]);
  step('devicectl-launch', 'xcrun', ['devicectl', 'device', 'process', 'launch', '--device', device.id, '--terminate-existing', APP_ID]);
}


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

export function boot(udid: string): void {
  if (!simctl('list', 'devices', udid).includes('(Booted)')) simctl('boot', udid);
  simctl('bootstatus', udid, '-b');
  rotate(udid, 3);
}

export function rotate(udid: string, orientation: number): void {
  const source = join(root, 'tools/sim-orientation.swift'), tool = join(LOGS, 'sim-orientation');
  if (!existsSync(tool) || statSync(tool).mtimeMs < statSync(source).mtimeMs) {
    mkdirSync(LOGS, { recursive: true });
    step('sim-orientation-build', 'xcrun', ['swiftc', '-O', source, '-o', tool]);
  }
  execFileSync(tool, [udid, String(orientation)]);
}

export function install(udid: string, app = APP): void {
  simctl('install', udid, app);
}

export async function launch(udid: string, log = APP_LOG, settle = 8): Promise<number> {
  mkdirSync(dirname(log), { recursive: true });
  const old = pid(udid), fd = openSync(log, 'w');
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

export function appProblems(log = APP_LOG): string[] {
  return readFileSync(log, 'utf8').split('\n').filter((l) => /⚡️ {2}\[(error|warn)\]|process terminated/.test(l));
}

export function terminate(udid: string): void {
  simctl('terminate', udid, APP_ID);
}

export function pid(udid: string): number {
  const line = simctl('spawn', udid, 'launchctl', 'list').split('\n').find((l) => l.includes(`UIKitApplication:${APP_ID}`));
  return line ? +line.split('\t')[0] || 0 : 0;
}

export async function backgroundAndResume(udid: string, seconds = 3): Promise<[number, number]> {
  const before = pid(udid);
  simctl('launch', udid, 'com.apple.Preferences');
  await sleep(seconds * 1000);
  simctl('launch', udid, APP_ID);
  return [before, pid(udid)];
}

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
      // install on the real iPad (or iPhone, with --device iphone) instead of the Simulator
      real: { type: 'boolean', default: false },
    },
  });
  const device = a.device as DeviceName;
  if (!(device in DEVICES)) throw new Error(`--device must be one of ${Object.keys(DEVICES).join(', ')}`);
  const t0 = Date.now(), done = (what: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s  ${what}`);
  if (a.real) {
    const target = realDevice(device === 'ipad' ? 'iPad' : 'iPhone');
    const team = signingTeam();
    done(`installing on ${target.name}, signed by team ${team}`);
    if (!a['no-build']) done(`built ${await buildDeviceApp(team, target)}`);
    installOnDevice(target);
    done(`installed and launched ${APP_ID} on ${target.name}`);
    process.exit(0);
  }
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
