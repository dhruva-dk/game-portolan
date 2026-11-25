import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edition, headlineText } from '../src/career/paper.ts';
import { apply } from '../src/career/apply.ts';
import type { Command } from '../src/career/commands.ts';
import { matchSetup } from '../src/career/fit.ts';
import { personOf } from '../src/career/lookup.ts';
import { moneyTotal } from '../src/career/record/pay.ts';
import type { CareerState, RaceReport } from '../src/career/state.ts';
import { LEAGUE, REPOSSESSION } from '../src/career/tuning.ts';
import { paperView } from '../src/career/views/paper.ts';
import {
  moneyView,
  resultView,
  type MoneyView,
  type ResultView,
} from '../src/career/views/result.ts';
import { standInResult } from '../src/career/standin.ts';
import { dismissed, owing, recorded, rehearsed } from '../src/app/rehearse.ts';

const YOURS = 0;
const FRESH = rehearsed('test', 0);
const FIRST = recorded(FRESH);
const SANK = rehearsed('test', 2);
const THIRD = rehearsed('test', 3);
const LINKED = rehearsed('test', 4);
const SEASON_END = rehearsed('test', 10);
function sent(state: CareerState, command: Command): CareerState {
  const applied = apply(state, command);
  if (!applied.ok) throw new Error(`refused for ${applied.reason}`);
  return applied.state;
}

function won(state: CareerState): CareerState {
  const started = sent(dismissed(state), { type: 'StartRace', team: YOURS });
  const result = standInResult(matchSetup(started, { hands: 'player' }));
  const first = result.ships.findIndex((ship) => ship.place === 1);
  const ships = result.ships.map((ship, i) =>
    i === 0 ? result.ships[first] : i === first ? result.ships[0] : ship
  );
  return sent(started, {
    type: 'RecordRace',
    team: YOURS,
    result: { ...result, ships },
  });
}

const WON = won(rehearsed('test', 41));
const BOTH_AFLOAT = rehearsed('test6', 19);
const FIFTH = rehearsed('test', 5);
const SHORT = recorded(owing(FIFTH, -4000));
const BROKE = recorded(owing(FIFTH, REPOSSESSION.below * 4));

function reportOf(state: CareerState): RaceReport {
  if (state.lastRace === null) throw new Error('no race recorded');
  return state.lastRace;
}

function resultOf(state: CareerState): ResultView {
  const v = resultView(state);
  if (v === null) throw new Error('no result view');
  return v;
}

function moneyOf(state: CareerState): MoneyView {
  const v = moneyView(state);
  if (v === null) throw new Error('no money view');
  return v;
}

const kinds = (v: MoneyView) => v.rows.map((row) => row.mark.kind);

test('a career that has sailed no race has no result or money to show', () => {
  assert.equal(resultView(FRESH), null);
  assert.equal(moneyView(FRESH), null);
});

test('the first race of a career is left unread and shows you and Uncle', () => {
  assert.equal(FIRST.unread, true);
  const v = resultOf(FIRST),
    report = reportOf(FIRST);
  assert.deepEqual(
    v.ships.map((ship) => ship.sailor),
    [{ who: 'you' }, { who: 'uncle' }]
  );
  assert.deepEqual(
    v.ships.map((ship) => ship.place),
    report.ships.map((ship) => ship.place)
  );
  assert.equal(v.of, LEAGUE.teams * LEAGUE.shipsPerTeam);
  assert.equal(v.points, report.points);
});

test('a sunk ship names the team that sank it', () => {
  const v = resultOf(FIRST),
    report = reportOf(FIRST);
  v.ships.forEach((ship, slot) => {
    const by = report.ships[slot].sunkBy;
    assert.ok(by !== null);
    assert.deepEqual(ship.fate, {
      kind: 'sunk',
      by: {
        team: by,
        name: FIRST.teams[by].name,
        emblem: FIRST.teams[by].emblem,
        livery: FIRST.teams[by].livery,
        yours: false,
      },
    });
  });
});

test('your sinkings are counted on the ship that made them', () => {
  const v = resultOf(SANK),
    report = reportOf(SANK);
  assert.ok(report.ships[0].sinkings > 0);
  assert.deepEqual(
    v.ships.map((ship) => ship.sinkings),
    report.ships.map((ship) => ship.sinkings)
  );
  const sinkings = moneyOf(SANK).rows.find(
    (row) => row.mark.kind === 'sinkings'
  );
  assert.ok(sinkings && sinkings.amount > 0);
});

test('a ship that won is afloat and its team heads the podium', () => {
  const v = resultOf(WON);
  const winner = v.ships.find((ship) => ship.place === 1);
  assert.ok(winner);
  assert.deepEqual(winner.fate, { kind: 'afloat' });
  assert.equal(v.podium[0].team, YOURS);
  assert.equal(v.podium[0].yours, true);
});

test('both ships can stay afloat', () => {
  assert.deepEqual(
    resultOf(BOTH_AFLOAT).ships.map((ship) => ship.fate),
    [{ kind: 'afloat' }, { kind: 'afloat' }]
  );
});

test('shots and sea are whole percentages of the report', () => {
  const v = resultOf(SANK),
    report = reportOf(SANK);
  assert.equal(
    v.shots,
    Math.round((100 * report.shotsLanded) / report.shotsFired)
  );
  assert.equal(v.sea, Math.round(100 * report.sea));
  assert.ok(Number.isInteger(v.shots) && Number.isInteger(v.sea));
});

test('the podium holds the teams of the first three ships', () => {
  const v = resultOf(SANK),
    report = reportOf(SANK);
  assert.deepEqual(
    v.podium.map((mark) => [mark.team, mark.name]),
    report.podium.map((team) => [team, SANK.teams[team].name])
  );
});

test('the money of a first race is place, sinkings and sea, with no wages', () => {
  const v = moneyOf(FIRST),
    report = reportOf(FIRST);
  assert.deepEqual(kinds(v), ['place', 'sinkings', 'sea']);
  assert.equal(v.total, moneyTotal(report.money));
  assert.equal(v.balance.after, v.balance.before + v.total);
});

test('the money rows come in the plan order with sponsors met and missed', () => {
  const v = moneyOf(SANK),
    report = reportOf(SANK);
  assert.deepEqual(kinds(v), [
    'place',
    'sinkings',
    'sea',
    ...report.money.sponsors.map(() => 'sponsor'),
    'wages',
  ]);
  const sponsors = v.rows.flatMap((row) =>
    row.mark.kind === 'sponsor' ? [row.mark] : []
  );
  assert.ok(sponsors.some((mark) => mark.met));
  assert.ok(sponsors.some((mark) => !mark.met));
  sponsors.forEach((mark, i) => {
    assert.equal(mark.sponsor, report.money.sponsors[i].sponsor);
    assert.ok(mark.name.length > 0);
  });
});

test('wages are negative and show the people paid', () => {
  const v = moneyOf(THIRD),
    report = reportOf(THIRD);
  const wages = v.rows.find((row) => row.mark.kind === 'wages');
  assert.ok(wages && wages.mark.kind === 'wages');
  assert.ok(wages.amount < 0);
  assert.deepEqual(wages.mark.paid, report.money.paid);
});

test('interest on a short balance comes last and is negative', () => {
  const v = moneyOf(SHORT);
  assert.equal(kinds(v).at(-1), 'interest');
  assert.ok((v.rows.at(-1)?.amount ?? 0) < 0);
  assert.ok(v.balance.before < 0);
  assert.equal(v.balance.after, v.balance.before + v.total);
  assert.equal(
    v.rows.reduce((sum, row) => sum + row.amount, 0),
    v.total
  );
});

test('the standing shows before, after and how far you moved', () => {
  const v = moneyOf(FIRST),
    report = reportOf(FIRST);
  assert.equal(v.standing.before, report.standing.before);
  assert.equal(v.standing.after, report.standing.after);
  assert.equal(
    v.standing.moved,
    report.standing.before - report.standing.after
  );
});

test('a race edition is dated by season and race and leads with your finish', () => {
  const v = paperView(FIRST);
  assert.equal(v.kind, 'race');
  assert.equal(v.title, 'The Gullible');
  assert.equal(v.dateline, 'Season 1, Race 1');
  assert.equal(v.headlines[0].kind, 'yourFinish');
  assert.ok(v.headlines.length <= 5);
});

test('headline runs spell the chosen wording', () => {
  for (const state of [FIRST, SANK, LINKED]) {
    const paper = edition(state);
    paperView(state).headlines.forEach((line, i) => {
      assert.equal(
        line.runs.map((run) => run.text).join(''),
        headlineText(paper.kind, paper.items[i])
      );
      assert.ok(line.runs.every((run) => run.text.length > 0));
    });
  }
});

test('before Opponents appears every name is plain text', () => {
  assert.ok(!SANK.seen.includes('opponents'));
  const runs = paperView(SANK).headlines.flatMap((line) => line.runs);
  assert.ok(runs.every((run) => run.team === null && run.person === null));
});

test('once Opponents appears names link to the sheet of their team', () => {
  const runs = paperView(LINKED).headlines.flatMap((line) => line.runs);
  const links = runs.filter((run) => run.team !== null);
  assert.ok(links.length > 0);
  for (const run of links) {
    assert.ok(run.team !== null);
    if (run.person === null) {
      assert.equal(run.text, LINKED.teams[run.team].name);
      continue;
    }
    const owned = LINKED.teams.findIndex(
      (team) => team.owner?.id === run.person
    );
    const at =
      owned >= 0 ? owned : personOf(LINKED, run.person)?.contract?.team;
    assert.equal(run.team, at);
  }
});

test('the workshop strip shows the focused line before and after', () => {
  const v = paperView(THIRD),
    shop = reportOf(THIRD).workshop;
  assert.ok(shop);
  assert.deepEqual(v.workshop, {
    focus: shop.focus,
    before: Math.round(shop.before),
    after: Math.round(shop.after),
    whole: 100,
  });
});

test('without a designer there is no workshop strip', () => {
  assert.equal(reportOf(FIRST).workshop, null);
  assert.equal(paperView(FIRST).workshop, null);
});

test('the season edition is dated by season alone and has no strip', () => {
  const v = paperView(SEASON_END);
  assert.equal(v.kind, 'season');
  assert.equal(v.dateline, 'Season 1');
  assert.equal(v.workshop, null);
  assert.ok(!v.headlines.some((line) => line.kind === 'yourFinish'));
});

test('a repossession shows the race and money as usual and a special paper', () => {
  assert.equal(reportOf(BROKE).repossessed, true);
  assert.equal(resultOf(BROKE).ships.length, 2);
  assert.ok(moneyOf(BROKE).balance.after < REPOSSESSION.below);
  const v = paperView(BROKE);
  assert.equal(v.kind, 'special');
  assert.equal(v.workshop, null);
  assert.deepEqual(v.headlines, [
    {
      kind: 'repossessed',
      runs: [
        {
          text: `Creditors take everything from ${BROKE.teams[YOURS].name} except Uncle.`,
          team: null,
          person: null,
        },
      ],
    },
  ]);
});
