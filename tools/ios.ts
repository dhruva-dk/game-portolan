import { writeNotices } from './notices.ts';
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { build, createServer } from 'vite';
import { root, DEVICES, type DeviceName } from './harness.ts';
import { diff, formatDiff, metrics, parseConsole, type DeviceProfile } from './profile.ts';

export const APP_ID = 'com.dhruvakumar.portolan';
export const LOGS = join(tmpdir(), 'portolan-ios');
export const APP_LOG = join(LOGS, 'app.log');
const DERIVED = join(root, 'ios/DerivedData');
export const APP = join(DERIVED, 'Build/Products/Debug-iphonesimulator/App.app');

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function step(name: string, cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  mkdirSync(LOGS, { recursive: true });
  const log = join(LOGS, `${name}.log`), fd = openSync(log, 'w');
  try {
    execFileSync(cmd, args, { cwd: root, env, stdio: ['ignore', fd, fd] });
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
 *  first if it is not yet, so the build's provisioning profile lets it install there. With `dev` (the dev server's
 *  address), the app is the dev shell (devShell) instead of the production build. */
export async function buildDeviceApp(team: string, device?: RealDevice, dev?: string): Promise<string> {
  if (dev) step('cap-sync', 'npx', ['cap', 'sync', 'ios'], { ...process.env, PORTOLAN_DEV_SHELL: devShell(dev) });
  else {
    await build({ root, logLevel: 'warn' });
    step('cap-sync', 'npx', ['cap', 'sync', 'ios'], { ...process.env, PORTOLAN_DEV_SHELL: '' });
  }
  step('xcodebuild-device', 'xcodebuild', [
    '-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug',
    '-destination', device ? `platform=iOS,id=${device.udid}` : 'generic/platform=iOS', '-derivedDataPath', DERIVED,
    '-allowProvisioningUpdates', ...(device ? ['-allowProvisioningDeviceRegistration'] : []),
    `DEVELOPMENT_TEAM=${team}`, 'CODE_SIGN_STYLE=Automatic', '-quiet', 'build',
  ]);
  return DEVICE_APP;
}

/** A Release archive of the production build with the test hooks taken out, signed by `team`. With `upload` it goes to
 *  App Store Connect, for internal TestFlight testers only; without, it is exported beside the archive and stays here. */
export async function archiveApp(team: string, upload: boolean): Promise<string> {
  const archive = join(DERIVED, 'Portolan.xcarchive'), exported = join(DERIVED, 'export');
  process.env.VITE_RELEASE = '1';
  await build({ root, logLevel: 'warn' });
  writeNotices(join(root, 'dist'));
  step('cap-sync', 'npx', ['cap', 'sync', 'ios'], { ...process.env, PORTOLAN_DEV_SHELL: '' });
  // a new build number each time: App Store Connect refuses one it has seen
  const number = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
  step('xcodebuild-archive', 'xcodebuild', [
    '-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Release', '-destination', 'generic/platform=iOS',
    '-derivedDataPath', DERIVED, '-archivePath', archive, '-allowProvisioningUpdates',
    `DEVELOPMENT_TEAM=${team}`, 'CODE_SIGN_STYLE=Automatic', `CURRENT_PROJECT_VERSION=${number}`, '-quiet', 'archive',
  ]);
  const options = join(LOGS, 'export-options.plist');
  writeFileSync(options, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>${upload ? 'upload' : 'export'}</string>
  <key>teamID</key><string>${team}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>testFlightInternalTestingOnly</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
`);
  step('xcodebuild-export', 'xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportPath', exported, '-exportOptionsPlist', options, '-allowProvisioningUpdates']);
  return upload ? archive : exported;
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

// ---------------------------------------------------------------- the dev loop on a real device

/** The dev server's port: fixed, since the shell is built with it. */
const DEV_PORT = 5173;

/** This Mac's address on the network it reaches the internet by (the interface of the default route), for the device
 *  to load the dev server from. */
export function lanAddress(): string {
  let iface = '';
  try {
    iface = /interface:\s*(\S+)/.exec(execFileSync('route', ['-n', 'get', 'default'], { encoding: 'utf8' }))?.[1] ?? '';
  } catch {
    // (no default route: any interface with an address)
  }
  const all = networkInterfaces();
  const v4 = (name: string) => all[name]?.find((a) => a.family === 'IPv4' && !a.internal)?.address;
  const found = (iface && v4(iface)) || Object.keys(all).map(v4).find(Boolean);
  if (!found) throw new Error('this Mac has no network address for the device to reach: join the same Wi-Fi as the device');
  return found;
}

/**
 * The dev shell: the app's own page with the public assets (textures) as the production build has them, whose
 * code is loaded from the dev server at `origin` on this Mac, so a change to the code is a reload on the device, not a
 * rebuild. The page itself stays the app's (capacitor://localhost) rather than the dev server's: WebGPU is given only
 * to a secure context, which a page served over plain http from a LAN address is not. The page is free to load
 * scripts over http (WebKit only blocks that on https pages); workers must come from the page's own origin, so each
 * is started from a blob that imports its script from the dev server. Written outside the repo, and named to the
 * Capacitor sync by PORTOLAN_DEV_SHELL alone, so it can't reach a production build.
 */
function devShell(origin: string): string {
  const dir = join(LOGS, 'dev-shell');
  rmSync(dir, { recursive: true, force: true });
  // a copy-on-write clone of the public assets: instant on APFS
  execFileSync('cp', ['-cR', join(root, 'public'), dir]);
  const worker = `<script>
      // workers are started from the page's own origin, importing their scripts from the dev server
      const Native = Worker;
      window.Worker = class extends Native {
        constructor(url, options) {
          const u = new URL(url, location.href);
          if (u.origin !== location.origin) {
            const src = options && options.type === 'module' ? 'import ' + JSON.stringify(u.href) + ';' : 'importScripts(' + JSON.stringify(u.href) + ');';
            url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
          }
          super(url, options);
        }
      };
    </script>
    <script type="module" src="${origin}/@vite/client"></script>`;
  const page = readFileSync(join(root, 'index.html'), 'utf8')
    .replace('</head>', `  ${worker}\n  </head>`)
    .replace('src="/src/app/main.ts"', `src="${origin}/src/app/main.ts"`);
  if (!page.includes(`${origin}/src/app/main.ts`)) throw new Error('index.html no longer loads /src/app/main.ts: the dev shell needs updating');
  writeFileSync(join(dir, 'index.html'), page);
  return dir;
}

/** Starts the dev server the shell loads from, on every interface; resolves once it is listening. */
async function serveDev(): Promise<{ close(): Promise<void> }> {
  const server = await createServer({ root, server: { port: DEV_PORT, strictPort: true, host: true } });
  await server.listen();
  return server;
}

/** Installs the device build on a real device and starts it. */
export function installOnDevice(device: RealDevice, app = DEVICE_APP, launch = true): void {
  step('devicectl-install', 'xcrun', ['devicectl', 'device', 'install', 'app', '--device', device.id, app]);
  if (launch) step('devicectl-launch', 'xcrun', ['devicectl', 'device', 'process', 'launch', '--device', device.id, '--terminate-existing', APP_ID]);
}

/** The device's console, as the last profile run heard it. */
export const DEVICE_LOG = join(LOGS, 'device.log');

/**
 * Starts the installed app on `device` with its output bridged here (devicectl --console: Capacitor prints the page's
 * console to stdout in a Debug build), writes it to DEVICE_LOG, and reads it into a profile once `windows` perf
 * windows have come in after the first. It never waits on silence: no output within `quiet` seconds of the launch, or no
 * perf window within `boot` seconds, and it stops and says so.
 */
export async function profileOnDevice(device: RealDevice, windows: number, o: { quiet?: number; boot?: number; screen?: string } = {}): Promise<DeviceProfile> {
  const quiet = (o.quiet ?? 60) * 1000, bootLimit = (o.boot ?? 300) * 1000;
  mkdirSync(LOGS, { recursive: true });
  const lines: string[] = [], log = openSync(DEVICE_LOG, 'w'), t0 = Date.now(), steps: Record<string, number> = {};
  const child = spawn('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', device.id, '--terminate-existing', '--console', APP_ID], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const since = () => +((Date.now() - t0) / 1000).toFixed(1);
  let seen = 0, failure: string | null = null;
  try {
    await new Promise<void>((done, fail) => {
      const stop = (why: string | null) => {
        clearTimeout(silent);
        clearTimeout(slow);
        failure = why;
        child.kill('SIGINT');
        if (why) fail(new Error(`${why}; the console so far: ${DEVICE_LOG}`));
        else done();
      };
      const silent = setTimeout(() => stop(`the app printed nothing within ${quiet / 1000} s of its launch (is it a Debug build? is the device unlocked?)`), quiet);
      const slow = setTimeout(() => stop(`no ${o.screen ? `${o.screen} ` : ''}perf window within ${bootLimit / 1000} s of the launch`), bootLimit);
      const hear = (chunk: Buffer) => {
        writeSync(log, chunk);
        for (const line of chunk.toString('utf8').split('\n')) {
          if (!line.trim()) continue;
          lines.push(line);
          if (steps['first output'] === undefined) {
            steps['first output'] = since();
            clearTimeout(silent);
          }
          if (!line.includes('perfjson ')) continue;
          // only the screen asked for counts (the title's windows come first while the rest is prepared)
          if (o.screen && !line.includes(`"screen":"${o.screen}"`)) continue;
          seen++;
          if (seen === 1) {
            steps['first perf window'] = since();
            clearTimeout(slow);
          }
          try {
            const w = JSON.parse(line.slice(line.indexOf('perfjson ') + 9)) as { screen: string; p50: number; p95: number; gpu: number };
            console.log(`  window ${seen}/${windows + 1}: ${w.screen} p50 ${w.p50} ms, p95 ${w.p95} ms, gpu ${w.gpu} ms`);
          } catch {
            console.log(`  window ${seen}/${windows + 1}: (cut short in the console)`);
          }
          if (seen > windows) stop(null);
        }
      };
      child.stdout.on('data', hear);
      child.stderr.on('data', hear);
      child.on('exit', (code) => { if (failure === null && seen <= windows) stop(`devicectl ended (code ${code}) before ${windows + 1} perf windows`); });
    });
  } finally {
    closeSync(log);
  }
  const profile = parseConsole(lines, device.name);
  profile.steps = { ...steps, total: since() };
  return profile;
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
      // with --real: the dev shell, loading the code from the dev server this keeps running (devShell)
      dev: { type: 'boolean', default: false },
      // a Release archive for TestFlight, kept here; with --upload, sent to App Store Connect
      archive: { type: 'boolean', default: false },
      upload: { type: 'boolean', default: false },
      // with --real: start with the console bridged here and gather this many perf windows after the first into
      // captures/device/, compared with tools/baselines/device-<device>.json (--save makes this run that baseline)
      profile: { type: 'string' },
      save: { type: 'boolean', default: false },
      // with --profile: count only this screen's windows (match, title, lobby…)
      screen: { type: 'string' },
    },
  });
  const device = a.device as DeviceName;
  if (!(device in DEVICES)) throw new Error(`--device must be one of ${Object.keys(DEVICES).join(', ')}`);
  const t0 = Date.now(), done = (what: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s  ${what}`);
  if (a.archive) {
    done(`archived to ${await archiveApp(signingTeam(), a.upload)}`);
    process.exit(0);
  }
  if (a.real) {
    const target = realDevice(device === 'ipad' ? 'iPad' : 'iPhone');
    const team = signingTeam();
    const origin = a.dev ? `http://${lanAddress()}:${DEV_PORT}` : undefined;
    done(`installing on ${target.name}, signed by team ${team}${origin ? `, loading its code from ${origin}` : ''}`);
    if (a.profile !== undefined && !origin) {
      const steps: Record<string, number> = {}, timed = async <T>(name: string, work: () => T | Promise<T>): Promise<T> => {
        const t = Date.now(), r = await work();
        steps[name] = +((Date.now() - t) / 1000).toFixed(1);
        done(`${name} (${steps[name]} s)`);
        return r;
      };
      // with --no-build the app already on the device is only started again: the install is most of a run's minute
      if (!a['no-build']) {
        await timed('build', () => buildDeviceApp(team, target));
        await timed('install', () => installOnDevice(target, DEVICE_APP, false));
      }
      done(`launching with its console bridged here (${DEVICE_LOG}); waiting for ${+a.profile + 1} ${a.screen ? `${a.screen} ` : ''}perf windows`);
      const profile = await profileOnDevice(target, Math.max(1, +a.profile), { screen: a.screen });
      profile.steps = { ...steps, ...profile.steps };
      const dir = join(root, 'captures/device'), stamp = profile.at.replace(/[:.]/g, '-');
      mkdirSync(dir, { recursive: true });
      const json = JSON.stringify(profile, null, 2) + '\n';
      writeFileSync(join(dir, `${stamp}.json`), json);
      writeFileSync(join(dir, 'latest.json'), json);
      done(`profile written to ${join(dir, `${stamp}.json`)} (and latest.json)`);
      for (const e of profile.errors) console.log(`app: ${e}`);
      const baseline = join(root, `tools/baselines/device-${device}.json`);
      if (a.save) {
        mkdirSync(dirname(baseline), { recursive: true });
        writeFileSync(baseline, json);
        done(`baseline saved to ${baseline}`);
      } else if (existsSync(baseline)) {
        console.log(formatDiff(diff(metrics(JSON.parse(readFileSync(baseline, 'utf8'))), metrics(profile))));
      } else {
        console.log(formatDiff(diff({}, metrics(profile))));
      }
      process.exit(0);
    }
    if (!a['no-build']) done(`built ${await buildDeviceApp(team, target, origin)}`);
    if (!origin) {
      installOnDevice(target);
      done(`installed and launched ${APP_ID} on ${target.name}`);
      process.exit(0);
    }
    // the dev shell: served first, then (re)started; with --no-build the shell already installed is only restarted
    const server = await serveDev();
    if (a['no-build']) step('devicectl-launch', 'xcrun', ['devicectl', 'device', 'process', 'launch', '--device', target.id, '--terminate-existing', APP_ID]);
    else installOnDevice(target);
    done(`launched ${APP_ID} on ${target.name}; serving its code from ${origin}, where a change reloads the page. Ctrl-C stops`);
    process.on('SIGINT', () => void server.close().then(() => process.exit(0)));
    await new Promise<never>(() => {});
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
