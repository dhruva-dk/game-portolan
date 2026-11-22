// Phase B section 12: the twelve dilemmas (each trigger met in a played season, each answer taken or refused with a
// reason), AnswerDilemma and MarkRead's refusals, a lapse at the next draw, and every mail template rendered whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, type CareerState } from '../src/career/career.ts';
import { dice, seeded } from '../src/career/dice.ts';
import { dilemmaComes } from '../src/career/dilemmas.ts';
import { DILEMMAS } from '../src/career/events.ts';
import { TEMPLATES, render } from '../src/career/mail.ts';
import { founded, invariants, must, refused, sailed } from './career-kit.ts';

/** In two played seasons, the first state at which each dilemma's trigger holds for the player's team (AT), and for
 *  any team (ANY, with the team). */
function found(): {
  at: Map<string, CareerState>;
  any: Map<string, { s: CareerState; team: number }>;
} {
  const at = new Map<string, CareerState>(),
    any = new Map<string, { s: CareerState; team: number }>();
  let s = founded();
  while (s.season < 2 && any.size < DILEMMAS.length) {
    if (s.player?.sacked)
      s = must(s, { kind: 'TakeJob', team: s.player.offers[0].team });
    else if (s.race !== null) s = sailed(s, 0.3);
    else s = must(s, { kind: 'Advance' });
    if (s.player?.sacked || s.race !== null) continue;
    for (const d of DILEMMAS) {
      if (!at.has(d.id) && d.trigger(s, s.teams[s.player!.team], seeded(1, 2)))
        at.set(d.id, s);
      if (any.has(d.id)) continue;
      const c = s.teams.find((x) => d.trigger(s, x, seeded(1, 2)) !== null);
      if (c) any.set(d.id, { s, team: c.id });
    }
  }
  return { at, any };
}
const { at: AT, any: ANY } = found();

/** A state with the player's dilemma posted, and its mail's id. */
function posted(s: CareerState, id: string): { s: CareerState; mail: number } {
  const team = s.player!.team;
  const out = dilemmaComes(
    s,
    { kind: 'dilemma', id, team, day: s.day, seq: 0 },
    dice(s.seed, {})
  );
  const m = out.mail.find(
    (x) => x.dilemma?.id === id && x.dilemma.answer === null && x.day === s.day
  );
  assert.ok(m, `${id}: its mail came`);
  return { s: out, mail: m.id };
}

test("every dilemma's trigger is met for some team within two seasons, and each personality's option answers it", () => {
  assert.deepEqual([...ANY.keys()].sort(), DILEMMAS.map((d) => d.id).sort());
  assert.ok(AT.size >= 4, `met for the player: ${[...AT.keys()].join(', ')}`);
  for (const [id, { s, team }] of ANY) {
    const d = DILEMMAS.find((x) => x.id === id)!;
    const slots = d.trigger(s, s.teams[team], seeded(1, 2))!;
    for (const o of new Set([...d.rival, d.options.length - 1])) {
      const a = d.answer(s, s.teams[team], slots, o);
      if ('state' in a) invariants(a.state);
      else assert.ok(a.no.code.length > 0, `${id}/${o}`);
    }
    const last = d.answer(s, s.teams[team], slots, d.options.length - 1);
    assert.ok(
      'state' in last,
      `${id}: the last option (a lapse) can always be taken`
    );
  }
});

test('every option of every met dilemma is taken, or refused with a code; the mail is then answered and read', () => {
  for (const [id, s0] of AT) {
    const { s, mail } = posted(s0, id);
    const d = DILEMMAS.find((x) => x.id === id)!;
    let taken = 0;
    for (let o = 0; o < d.options.length; o++) {
      const r = apply(s, { kind: 'AnswerDilemma', mail, option: o });
      if (!r.ok) {
        assert.ok(
          r.reason.code.length > 0 && r.reason.sentence.length > 0,
          `${id}/${o}`
        );
        continue;
      }
      taken++;
      const m = r.state.mail.find((x) => x.id === mail)!;
      assert.equal(m.dilemma?.answer, o);
      assert.ok(m.read);
      invariants(r.state);
      refused(r.state, { kind: 'AnswerDilemma', mail, option: o }, 'answered');
    }
    assert.ok(taken > 0, `${id}: some answer can be taken`);
    assert.ok(render(s, s.mail.find((x) => x.id === mail)!).body.length > 0);
  }
});

test('AnswerDilemma and MarkRead refusals', () => {
  const [id, s0] = [...AT][0];
  const { s, mail } = posted(s0, id);
  refused(s, { kind: 'AnswerDilemma', mail: 99999, option: 0 }, 'mail');
  refused(s, { kind: 'AnswerDilemma', mail: -1, option: 0 }, 'mail');
  refused(s, { kind: 'AnswerDilemma', mail, option: 9 }, 'option');
  refused(s, { kind: 'AnswerDilemma', mail, option: 0.5 }, 'option');
  const plain = s.mail.find((x) => !x.dilemma)!;
  refused(s, { kind: 'AnswerDilemma', mail: plain.id, option: 0 }, 'mail');
  const stale = {
    ...s,
    mail: s.mail.map((x) =>
      x.id === mail ? { ...x, slots: { ...x.slots, own: -5 } } : x
    ),
  };
  refused(stale, { kind: 'AnswerDilemma', mail, option: 0 }, 'stale');
  refused(s, { kind: 'MarkRead', mail: 99999 }, 'mail');
  const read = must(s, { kind: 'MarkRead', mail: plain.id });
  assert.ok(read.mail.find((x) => x.id === plain.id)!.read);
  refused(read, { kind: 'MarkRead', mail: plain.id }, 'read');
});

test("an unanswered dilemma lapses to its last option at the next round's draw", () => {
  const [id, s0] = [...AT][0];
  let { s } = posted(s0, id);
  while (s.race === null)
    s = s.player?.sacked
      ? must(s, { kind: 'TakeJob', team: s.player.offers[0].team })
      : must(s, { kind: 'Advance' });
  s = sailed(s);
  const m = s.mail.find((x) => x.dilemma?.id === id && x.day === s0.day)!;
  assert.equal(m.dilemma?.answer, m.dilemma!.options.length - 1);
});

test('every template renders in each wording with no slot left unfilled', () => {
  const s = founded();
  const slots = {
    person: 0,
    team: 1,
    first: 2,
    second: 3,
    third: 4,
    scout: 5,
    mechanic: 6,
    tier: 1,
    day: 30,
    expires: 40,
    closes: 50,
    firstDay: 14,
    fine: 300,
    balance: 500,
    prize: 1000,
    wage: 80,
    building: 'factory',
    component: 'x',
    trait: 'hothead',
    measure: 'perf',
    objective: 'podium',
    supplier: 'x',
    place: 3,
    standing: 2,
    rising: 1,
    carried: 1,
    moved: 1,
    season: 0,
    ship: 1,
    found: '1,2',
    type: 'sails',
    name: 'Kestrel',
    level: 2,
    take: 'hull',
    give: 'keel',
    struck: 4,
    races: 3,
    points: 20,
    planet: 'Wend',
    perf: 50,
    perfMax: 60,
    parts: 2,
    n: 2,
    inspected: 3,
    for: 12,
    against: 8,
    job: 'mend',
    own: s.player!.team,
  };
  for (const [kind, tpl] of Object.entries(TEMPLATES)) {
    for (let w = 0; w < Math.max(tpl.subject.length, tpl.body.length); w++) {
      const r = render(s, {
        id: 0,
        day: 0,
        category: 'team',
        sender: null,
        kind,
        slots,
        links: [],
        wording: w,
        read: false,
        dilemma: null,
      });
      for (const text of [r.subject, r.body])
        assert.ok(
          !/\{\w+\}/.test(text) && !/undefined|NaN/.test(text),
          `${kind}/${w}: ${text}`
        );
    }
  }
  const race = render(s, {
    id: 0,
    day: 0,
    category: 'team',
    sender: null,
    kind: 'raceResult',
    slots: { place: 1, standing: 2, points: 25, tier: 0 },
    links: [],
    wording: 0,
    read: false,
    dilemma: null,
  });
  assert.ok(
    race.body.startsWith(
      'Our best ship finished 1st: 25 points. We stand 2nd in '
    ),
    race.body
  );
});
