// The screens' selectors (career/read.ts): mail, a league's table, the calendar, race day's preview, a dilemma's view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dilemmaView,
  fixtures,
  mailView,
  preview,
  table,
  unread,
} from '../src/career/read.ts';
import { founded, must, sailed, toRaceDay } from './career-kit.ts';

const DAY = toRaceDay(founded());
const AFTER = sailed(DAY);

test('mail: newest first, rendered, read marks it; unread counts', () => {
  const v = mailView(AFTER);
  assert.equal(v.length, AFTER.mail.length);
  for (let i = 1; i < v.length; i++) assert.ok(v[i - 1].day >= v[i].day);
  assert.ok(
    v.every((m) => m.subject.length > 0 && !/\{\w+\}/.test(m.subject + m.body))
  );
  const read = must(AFTER, { kind: 'MarkRead', mail: v[0].id });
  assert.equal(unread(read), unread(AFTER) - 1);
});

test("a league's table: every crew once, by points, the player's marked", () => {
  const me = AFTER.player!.crew,
    league = AFTER.crews[me].league;
  const t = table(AFTER, league);
  assert.equal(t.length, AFTER.leagues[league].crews.length);
  for (let i = 1; i < t.length; i++) assert.ok(t[i - 1].points >= t[i].points);
  assert.deepEqual(
    t.filter((r) => r.mine).map((r) => r.crew),
    [me]
  );
  assert.deepEqual(
    t.map((r) => r.place),
    t.map((_, i) => i + 1)
  );
});

test('the calendar: today on race day, sailed after it, the rest ahead', () => {
  assert.deepEqual(
    fixtures(DAY)
      .slice(0, 2)
      .map((f) => f.when),
    ['today', 'ahead']
  );
  assert.deepEqual(
    fixtures(AFTER)
      .slice(0, 2)
      .map((f) => f.when),
    ['sailed', 'ahead']
  );
  assert.equal(fixtures(AFTER).length, AFTER.calendar!.rounds.length);
});

test("race day's preview: ship two's captain, the stance and order; none off race day", () => {
  const p = preview(DAY)!;
  assert.equal(p.round, 0);
  assert.equal(p.captain, DAY.crews[DAY.player!.crew].staff.ships[1].captain);
  assert.equal(p.order.length, 4);
  assert.equal(preview(AFTER), null);
  assert.equal(
    preview(must(DAY, { kind: 'RaceStarted', round: 0 }))!.started,
    true
  );
});

test("a dilemma's view: its options and the lapse; null for a plain message", () => {
  const plain = AFTER.mail.find((m) => !m.dilemma)!;
  assert.equal(dilemmaView(AFTER, plain.id), null);
  const m = {
    ...plain,
    id: 9999,
    kind: 'riseAsk',
    slots: { gull: 0, own: AFTER.player!.crew },
    dilemma: {
      id: 'riseAsk',
      options: ['pay', 'refuse', 'promise'],
      answer: null,
    },
  };
  const v = dilemmaView({ ...AFTER, mail: [...AFTER.mail, m] }, 9999)!;
  assert.deepEqual(v.options, ['pay', 'refuse', 'promise']);
  assert.equal(v.lapse, 2);
  assert.equal(v.answer, null);
});
