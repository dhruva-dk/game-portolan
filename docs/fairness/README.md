# Fairness report

What the manager's game claims of itself (MANAGER.md 6), and what was measured.
The numbers are from 90 whole careers sailed headless on real races (30 idle,
30 sensible, 30 shrewd managers, five seasons each: 13,500 races of 80 ships)
at tuning 10, commit `88d489ca`. The tables are in [careers.md](careers.md),
written by `node tools/career/fairness.ts <results folder>`.

| # | Claim | Verdict |
| --- | --- | --- |
| 1 | A race and a career are deterministic | Holds |
| 2 | The same on every machine | Fails across processor families (holds within one) |
| 3 | No seat has an advantage | Holds |
| 4 | Strength pays | Holds |
| 5 | Decisions pay | Holds |
| 6 | No hidden help for the player's seat | Holds |
| 7 | The economy holds, and the three managers land in their bands | In part: see below |

## 1. Deterministic

A race is a pure function of its card and its planet; a career is a reducer
over a journal of commands, its dice counted by stream.

- `tests/golden.test.ts`: a match of bots comes out the same, to the bit.
- `tests/race.test.ts`: "the same card on the same planet gives the same
  result, hash and all; another seed another" (the hash is pinned).
- `tests/career-reducer.test.ts`: "the same counters give the same numbers;
  streams are independent".
- `tests/career-save.test.ts`: "replay equals state: the whole journal from the
  world seed gives the state the session kept".

## 2. The same on every machine

Three one-season careers (idle, sensible and shrewd, seed 201) were each run
on three kinds of machine, all on Node 26.11.1, and their results hashed:

| Career | Lab i5 | Lab Xeon | This Mac (Apple Silicon) |
| --- | --- | --- | --- |
| idle | `a2dcb0ca` | `a2dcb0ca` | `45c7a9f8` |
| sensible | `555ef100` | `555ef100` | `74af75c6` |
| shrewd | `a53ac20d` | `a53ac20d` | `19a2f560` |

The two Intel kinds agree on all three. The Mac agrees with neither on any.
So a career is the same on machines of one processor family and not across
families. The sim uses the platform's floating-point `Math`, and the
exact-arithmetic module that would make it the same by construction is not
written. What this costs today: a career cannot be checked on one family
against a run on another. A career played and saved on one device is not
affected (its journal replays on the device that wrote it).

## 3. No seat advantage

A team's slot on its grid against its points in the first season, before any
team has changed championship: 0.02, 0.00 and −0.01 in the three championships
(front half of the grid 84.2, 86.9, 88.3 points; back half 86.2, 85.1, 85.9).

This was not so before. Ships were berthed by their number and the berths come
roomiest first, so the first teams had the open water every race (slot against
points −0.25; front half 108 points, back half 86). A race's berths are now
drawn among its ships by its seed (`sim/spawn.ts drawn`). Over all five seasons
a small figure remains (−0.05 to −0.08): a team relegated from the championship
above is stronger than its new rivals and has a low number.

## 4. Strength pays

Mean points a season by quarter of the championship, weakest to strongest:

| | Lowest | Second | Third | Highest |
| --- | --- | --- | --- | --- |
| By drivers' stars, championship 1 | 65.5 | 82.3 | 95.7 | 113.2 |
| By drivers' stars, championship 3 | 59.3 | 75.9 | 85.5 | 96.8 |
| By parts' performance, championship 1 | 69.2 | 82.8 | 92.7 | 112.1 |
| By parts' performance, championship 3 | 59.9 | 78.4 | 84.1 | 95.2 |

This too was not so at first: at tuning 7 the quarters were out of order, and a
team with no drivers at all and parts at 196 against its championship's 521
still finished eighth. Three things changed. A card's drivers are read against
their field (`career/card.ts fielded`): teams of one championship lie within
half a star of one another, which the race could not tell apart. Parts are
worth four times what they were. And a ship with no driver signed to her takes
the least of the free drivers for the day, not the best.

## 5. Decisions pay

By buildings' levels the quarters run 69.5 to 94.4 points in championship 3 and
74.1 to 109.1 in championship 2; by wages paid, 61.3 to 96.1 and 67.3 to 114.0.
Doing nothing is punished: the idle manager's team is 16th then 18th (median)
in its second and third seasons, and 27 of 30 idle managers are sacked.

## 6. No hidden help for the player's seat

- The player's team sends the same commands through the same checks as every
  rival (`tests/career-chairmen.test.ts`: "a rival with an open post fills it
  through the player's own checks"), and its ships are on the same card.
- `tests/race.test.ts`: "ship 0 with no driver is sailed by the pilot's hands,
  asked every step; with one, by her bot".
- In these careers her ship was sailed by the field's median driver
  (`tools/career/sail.ts piloted`), so the figures are a manager's, with
  average sailing.
- The chairman's rules (debt past the floor, a ship with no driver signed to
  her, the target) are every team's alike.

## 7. The economy and the three managers

The economy holds: a rival's balance over a season is +1,036 (median) in
championship 3, +1,758 in championship 2 and +12,085 in championship 1, where
money piles up unspent (31,049 at the end, median). Between 92% and 98% of
rival seats are manned through a season; drivers' stars and parts' performance
hold from season to season. At tuning 7 neither did: seats fell from 236 to 19
in three seasons, because a renewal signed in a contract's last days ended the
day the old one did, and nine in ten offers were refused.

The bands agreed for the three managers, and where they landed:

| Band | Measured | Met |
| --- | --- | --- |
| The player starts about 17th to 18th of 20 | The 18th strongest team by staff; first season's place 11th to 14th (median) with her own ship sailed at the field's median | By strength, not by result |
| Idle: bottom five, and sacked | 16th then 18th; 27 of 30 sacked | Yes |
| Sensible: upper half over 4 to 5 seasons | 14, 11, 14, 11, 12 (median place by season); 6 of 30 promoted | No: mid-table |
| Shrewd: a few places in season one; promotion in 4 to 5 seasons (median) | 11, 12, 13, 9, 9; 4 of 30 promoted within five seasons | The first, not the second |

Why the last two are missed: the scripted sensible and shrewd managers decide
as a rival manager of 10s and of 16s does, and end five seasons with money
unspent (12,594 and 11,244, median) and drivers only a third of a star above
their championship's. With one team promoted a season, that is not enough to
finish first of twenty. What a person who spends it, and sails her own ship
better than the median, would do is not measured here.
