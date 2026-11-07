// Capture tools for looking at the game headless. Each command writes PNG frames, a contact sheet (contact.png) and any logs to
// captures/<name>/ (gitignored).
//
//   npm run capture -- regions [--region <id>]           fixed scenes in each region at dawn, midday, dusk and night
//   npm run capture -- borders                            each region from orbit, and 8 m up on the sea at every border
//   npm run capture -- lap [--ring equator|north|south]   a frame every 4 s of sailing a full lap (all three by default)
//   npm run capture -- moment <name|all> [--seed n]       a scripted mechanic moment as a frame strip plus its effect log
//   npm run capture -- ui [--device ipad,ipadSmall,iphone,iphoneSmall] [--only a,b]  transition strips for each screen change (all four by default)
//   npm run capture -- layout [--device …] [--only a,b]  every screen's touch targets against the layout rules (fails on a break)
//   npm run capture -- perf                               frame time, triangles and draw calls per region
//   npm run capture -- shape [--save]                     the frame log's table for the title, the lobby and a match
//   npm run capture -- list                               the moments and transitions there are
//
// Shared options: --headed (watch it), --dpr <n> (default 1).
import { parseArgs } from 'node:util';
import { log, rig } from './common.ts';
import { regions } from './regions.ts';
import { borders } from './borders.ts';
import { lap } from './lap.ts';
import { moment, MOMENTS } from './moment.ts';
import { ui, TRANSITIONS } from './ui.ts';
import { perf } from './perf.ts';
import { shapes } from './shape.ts';
import { layout, SCREENS } from './layout.ts';

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    region: { type: 'string' },
    ring: { type: 'string' },
    device: { type: 'string' },
    only: { type: 'string' },
    seed: { type: 'string', default: '7' },
    dpr: { type: 'string', default: '1' },
    every: { type: 'string', default: '4' },
    headed: { type: 'boolean', default: false },
    save: { type: 'boolean', default: false },
  },
});

const [command, arg] = positionals;
const opts = { seed: Number(a.seed), dpr: Number(a.dpr), every: Number(a.every) };

if (!command || command === 'list' || command === 'help') {
  console.log('commands: regions, borders, lap, moment <name|all>, ui, layout, perf, shape');
  console.log(`moments: ${MOMENTS.map((m) => m.name).join(', ')}`);
  console.log(`transitions: ${TRANSITIONS.map((t) => t.name).join(', ')}`);
  console.log(`layout screens: ${SCREENS.map((s) => s.name).join(', ')}`);
  process.exit(0);
}

const r = await rig(a.headed);
log(`Chromium: ${r.renderer}`);
const t0 = Date.now();
try {
  switch (command) {
    case 'regions': await regions(r, { ...opts, region: a.region }); break;
    case 'borders': await borders(r, opts); break;
    case 'lap': await lap(r, { ...opts, ring: a.ring }); break;
    case 'moment': await moment(r, { ...opts, name: arg ?? 'all' }); break;
    case 'ui': await ui(r, { ...opts, device: a.device, only: a.only }); break;
    case 'layout': await layout(r, { ...opts, device: a.device, only: a.only }); break;
    case 'perf': await perf(r, opts); break;
    case 'shape': await shapes(r, { ...opts, save: !!a.save }); break;
    default: throw new Error(`unknown capture command "${command}"`);
  }
} finally {
  await r.close();
}
log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
