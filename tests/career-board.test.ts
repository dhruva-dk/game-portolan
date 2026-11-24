// The board: what the player asks of their chairman (granted at the bar his temper and the standing set, each once a
// season, each costing confidence), his confidence kept race by race, and the season kept in the archive at its end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askBar, askGives } from '../src/career/board.ts';
import { apply, start, type CareerState } from '../src/career/career.ts';
import { standingOf } from '../src/career/standings.ts';
import { boardView, seasonView } from '../src/career/views-board.ts';
import { careerView } from '../src/career/views-career.ts';
import { TUNING } from '../src/career/tuning.ts';
import {
  founded,
  invariants,
  must,
  refused,
  sailed,
  toRaceDay,
  withTeam,
} from './career-kit.ts';

const B = TUNING.board;
const S = founded();
const ME = S.player!.team;
const at = (s: CareerState, confidence: number) =>
  withTeam(s, ME, (c) => ({ ...c, confidence }));

test('AskBoard: refusals; once a season each; at the bar granted, under it refused, either way confidence spent', () => {
  refused(start(), { kind: 'AskBoard', ask: 'money' }, 'unfounded');
  refused(S, { kind: 'AskBoard', ask: 'more' as 'money' }, 'ask');
  const c = S.teams[ME];
  for (const ask of ['money', 'floor', 'target'] as const) {
    const bar = askBar(S, c, ask),
      gives = askGives(S, c, ask);
    assert.ok(bar > 0 && bar <= 100, `${ask}: a bar within confidence`);
    assert.ok(gives > 0, `${ask}: gives something`);
    // at the bar: granted
    const yes = must(at(S, bar), { kind: 'AskBoard', ask });
    const t = yes.teams[ME];
    assert.equal(t.confidence, bar - B.granted);
    assert.deepEqual(yes.player!.asks, [{ season: 0, ask, granted: true }]);
    assert.equal(t.balance, c.balance + (ask === 'money' ? gives : 0));
    assert.equal(t.debtFloor, c.debtFloor - (ask === 'floor' ? gives : 0));
    assert.equal(t.target, c.target + (ask === 'target' ? gives : 0));
    if (ask === 'money') assert.equal(yes.ledger.at(-1)?.amount, gives);
    refused(yes, { kind: 'AskBoard', ask }, 'asked');
    invariants(yes);
    // under it: refused, and nothing but confidence moves
    const no = must(at(S, bar - 1), { kind: 'AskBoard', ask });
    assert.equal(no.teams[ME].confidence, bar - 1 - B.refused);
    assert.deepEqual(
      { ...no.teams[ME], confidence: 0 },
      { ...c, confidence: 0 }
    );
    assert.equal(no.player!.asks[0]?.granted, false);
  }
  // behind the target, the bar rises a place at a time
  const behind = withTeam(S, ME, (x) => ({
    ...x,
    target: standingOf(S, ME) - 2,
  }));
  assert.ok(
    askBar(behind, behind.teams[ME], 'money') >=
      askBar(S, { ...c, target: standingOf(S, ME) }, 'money')
  );
  // under way, or sacked: not asked
  const day = toRaceDay(S);
  const racing = apply(day, { kind: 'RaceStarted', round: day.race!.round });
  if (racing.ok)
    refused(racing.state, { kind: 'AskBoard', ask: 'money' }, 'racing');
  refused(
    { ...S, player: { ...S.player!, sacked: true } },
    { kind: 'AskBoard', ask: 'money' },
    'sacked'
  );
});

test("the chairman's confidence is kept after each of the player's races; the season is archived at its end", () => {
  let s = toRaceDay(S),
    races = 0;
  while (s.season === 0) {
    if (s.player?.sacked)
      s = must(s, { kind: 'TakeJob', team: s.player.offers[0].team });
    else if (s.race !== null) {
      const before = s;
      s = sailed(s);
      if (s.round > before.round || s.season > before.season) races++;
    } else s = must(s, { kind: 'Advance' });
  }
  const p = s.player!;
  const season = p.board.filter((l) => l.season === 0);
  assert.equal(season.length, races, 'a line a race');
  assert.deepEqual(
    season.map((l) => l.round),
    season.map((_, i) => i),
    'in round order'
  );
  for (const l of season) {
    assert.ok(l.confidence >= 0 && l.confidence <= 100);
    assert.ok(l.place >= 1 && l.place <= 20);
  }
  assert.equal(p.seasons.length, 1);
  const a = p.seasons[0];
  assert.equal(a.season, 0);
  assert.equal(a.of, 20);
  assert.ok(a.place >= 1 && a.place <= a.of);
  assert.equal(a.place, season.at(-1)?.place, 'its place the last race left');
  assert.equal(a.champions.length, 3);
  assert.equal(a.moves.length, TUNING.race.swap * 4);
  assert.ok(a.moves.every((m) => m.move === 1 || m.move === -1));
  assert.ok(a.arrivals.length > 0, 'the promising newcomers');
  assert.ok(a.prize > 0 || a.sacked);
  invariants(s);
  // the review: the season kept, its team's honours as the archive has them; Player's row opens it
  const v = seasonView(s, 0)!;
  assert.equal(v.season, 0);
  assert.equal(v.place, a.place);
  assert.equal(v.met, a.target - a.place);
  assert.equal(v.moves.length, a.moves.length);
  assert.equal(v.honours.includes('Champions'), a.place === 1);
  assert.equal(seasonView(s, 7)?.season, 0, 'one not kept: the last');
  assert.equal(seasonView(S, null), null, 'none kept yet');
  const row = careerView(s).record.find((r) => r.season === v.year);
  assert.equal(row?.review, 0);
  // the board: this season's marks only (a new season: none yet), each request with its bar and its check
  const b = boardView(s);
  assert.deepEqual(b.marks, []);
  assert.equal(b.requests.length, 3);
  for (const r of b.requests) {
    assert.equal(r.bar, askBar(s, s.teams[s.player!.team], r.ask));
    assert.equal(r.act.ok, !s.player!.sacked, r.act.why);
    assert.equal(r.asked, null);
  }
  const mid = boardView(toRaceDay(S));
  assert.equal(mid.marks.length, 0);
  assert.equal(mid.temper.length, 4);
});
