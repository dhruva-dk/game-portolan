// The headless harness (tools/sim): the same scenario sails the same match to
// the bit, a different one does not; and what each runner writes is well
// formed, every line of it, for an agent to read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLobby } from '../tools/sim/lobby.ts';
import { runMatch, type MatchScenario } from '../tools/sim/match.ts';

const MATCH: MatchScenario = { kind: 'match', match: 1, seconds: 60 };
const DUEL: MatchScenario = {
  kind: 'match',
  match: 1,
  race: { teams: 2, ships: 1, close: true },
};

const jsonl = (path: string): Record<string, unknown>[] =>
  readFileSync(path, 'utf8')
    .trimEnd()
    .split('\n')
    .map((l) => JSON.parse(l));

test('determinism: a scenario sails the same twice, to the bit; another match does not', () => {
  const a = runMatch(MATCH),
    b = runMatch(MATCH);
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.account.ships, b.account.ships);
  assert.notEqual(runMatch({ ...MATCH, match: 2 }).hash, a.hash);
  assert.equal(runMatch(DUEL).hash, runMatch(DUEL).hash);
});

test('a match writes its record: events from start to end, every ship each second, the summary', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sim-'));
  const s = runMatch(DUEL, dir);
  assert.equal(s.end, 'race decided');
  assert.equal(s.invariants.broken, 0);
  assert.ok(s.combat.shots > 0, 'the two fought');
  const events = jsonl(join(dir, 'events.jsonl'));
  assert.equal(events[0].type, 'start');
  assert.equal(events.at(-1)!.type, 'end');
  assert.equal(events.at(-1)!.hash, s.hash);
  for (const e of events)
    assert.ok(
      typeof e.t === 'number' &&
        typeof e.step === 'number' &&
        typeof e.type === 'string'
    );
  for (const type of ['shot', 'hit', 'sunk', 'storm', 'mind'])
    assert.ok(
      events.some((e) => e.type === type),
      type
    );
  const ships = jsonl(join(dir, 'ships.jsonl'));
  assert.ok(ships.length >= 2 * Math.floor(s.seconds));
  for (const k of ships)
    assert.ok(
      Array.isArray(k.at) &&
        typeof k.hull === 'number' &&
        typeof k.id === 'number'
    );
  const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  assert.equal(summary.hash, s.hash);
  assert.equal(summary.files.events, events.length);
});

test('the lobby writes each command, taken or refused with what it changed, and the views it showed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lobby-'));
  const log = console.log;
  console.log = () => {};
  try {
    assert.ok(
      await runLobby(
        {
          kind: 'lobby',
          seed: 1,
          manager: 'sensible',
          seasons: 1,
          commands: 4,
        },
        dir
      )
    );
  } finally {
    console.log = log;
  }
  const commands = jsonl(join(dir, 'commands.jsonl'));
  assert.equal(commands.length, 4);
  assert.deepEqual(
    commands.map((c) => (c.command as { kind: string }).kind),
    ['Found', 'SetImprovement', 'StartScout', 'Advance']
  );
  for (const c of commands) {
    assert.equal(typeof c.ok, 'boolean');
    if (c.ok)
      assert.ok(
        Array.isArray(c.changed) && (c.changed as unknown[]).length > 0
      );
    else assert.ok(c.refused);
  }
  const screens = new Set(jsonl(join(dir, 'views.jsonl')).map((v) => v.screen));
  for (const s of ['home', 'team', 'career', 'board'])
    assert.ok(screens.has(s), s);
});
