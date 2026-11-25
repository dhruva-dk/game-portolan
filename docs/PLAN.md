# Portolan: the plan

This file is the only plan and the only standing instructions for this repository. It describes the finished game (Part 1), the architecture and conventions (Part 2), the order of work (Part 3), what is deliberately left out (Part 4), and where things are in the code today (Appendix A).

## 0. How to use this plan

Read sections 0 and 2.6 to 2.9 before changing anything. Read the rest as your step cites it.

1. **Work one step at a time.** Part 3 lists milestones made of numbered steps (M1.1, M1.2 and so on) with checkboxes. Do them in order. Tick a step's box in the commit that completes it.
2. **The plan is the spec.** If a step cannot be done as written, or two sections disagree, stop and ask the user. Do not change this file without the user's approval, apart from ticking boxes.
3. **Section numbers are stable.** Cite them in commit bodies ("implements §1.7.2").
4. **Every number in Part 1 is a starting value.** Put it in a tuning file (§2.6 rule 3) exactly as written. Do not adjust numbers before milestone 7. The one exception is §2.7.4 rule 3: widening a stat's range when its direction test fails.
5. **Do not add what Part 4 lists**, and do not add screens, stats, words or systems this plan does not name.
6. **Never push, and never delete remote branches, unless the user asks.**

### 0.1 The game in one paragraph

Portolan is a single-player, offline game for iPad in landscape. You own and captain a two-ship racing team of sailing ships crewed by gulls in sunglasses. Each race is a five-minute, 80-ship battle royale on a small planet generated from a seed: 40 teams of two ships. You sail one ship by hand; a hired driver (at first your Uncle) sails the other as a bot. Between races you spend money in a lobby centered on your ship: you hire a driver, a designer and a mechanic, develop and build ship parts and guns, and sign sponsors. The other 39 teams play by exactly the same rules through a seeded policy. One league, ten races a season, seasons without end. You start last with a junk ship and climb. The tone is deliberate comedy: motorsport-team words applied to galleons.

### 0.2 Baseline, measured 2026-11-24 on the `mm` branch

| Fact | Value |
|---|---|
| `src/` | 91k lines of TypeScript, 17.9k of them comment lines |
| `npm test` | 59 s: 15 s static checks, 44 s for 685 tests, all passing |
| One 80-ship bot match, headless | 9 s wall for 354 s of game time |
| Median time to sink in that match | 1.57 s |

---

# Part 1. The game

## 1.1 Units and terms

- **Units:** meters, seconds, radians. Money is in coins (whole numbers). Stats are whole numbers 1 to 20. Levels are real numbers 0 to 100, shown rounded down.
- **Team:** an owner, two ships, three staff seats, three sponsor slots, a balance, a livery, an emblem, a name. Teams are numbered 0 to 39 and team 0 is yours.
- **Owner:** whoever owns a team and sails its first ship. You are the owner of team 0. Each rival team has a generated owner (§1.5.6). An owner is not one of the game's people (§1.5.1): the rules for people never apply to an owner unless they say so.
- **Ship slot:** each team's ships are slot 0 and slot 1. The owner sails slot 0. The team's driver sails slot 1.
- **Seat:** a team has exactly three: `driver`, `designer`, `mechanic`. Each holds one person or is empty.
- **Stand-in:** who sails slot 1 while the driver seat is empty (§1.5.7). On your team the stand-in is Uncle.
- **Line:** one of seven things a ship is made of: `sails`, `rigging`, `rudder`, `hull`, `keel`, `mounts`, `gun`. Each has a level.
- **Design level:** how good a line your team knows how to build. One per line per team.
- **Fitted level:** how good the part on one ship actually is. One per line per ship. Never above the design level.
- **Race:** one match. **Season:** ten races, then the off-season stop.
- **Standing:** a team's place in the league, 1 (best) to 40 (§1.3.2).
- **Reputation:** a smoothed standing that people and sponsors judge a team by (§1.3.3).
- **Home water:** sea a team has claimed in the current match.

## 1.2 The words allowed on screen

The rule: **a picture for a thing, a word for an idea, a number for an amount.**

- Things you can see get a glyph alone: a ship, each part, each gun kind, a heal, the storm, a coin, a star.
- Ideas get one word beside their glyph. The complete list is below.
- Amounts are numerals with a glyph beside them that says what they measure.
- No sentences, except in the paper (§1.13.1) and Uncle's bubbles (§1.13.2).
- No headings, column titles, subtitles or descriptions.
- Names of people, teams, sponsors and planets, and the game's own name, are text.
- The HUD at sea shows no words apart from Uncle's bubbles and the two sunk buttons.

**The word list.** Nothing else may be drawn as text, apart from names, numerals, the paper and Uncle's bubbles.

| Group | Words |
|---|---|
| Lobby | Ship, Team, Sponsors, Opponents, SAIL |
| Lines | Sails, Rigging, Rudder, Hull, Keel, Mounts, Gun |
| Roles | Owner, Driver, Designer, Mechanic |
| Driver stats | Gunnery, Helm, Nerve, Territory, Stormcraft, Lookout |
| Mechanic stats | Shield, Heal speed, Heal amount, Thrift, Upkeep |
| Ship actions | Build, Focus, Paint |
| Hiring | Scouting, Candidates |
| People actions | Report, Approach, Negotiate, Offer, Renew, Release |
| Contract terms | Contract, Wage, Seasons, Fee, Clause |
| Race conditions | Storm, Heals |
| Sea | Watch, Result, Resume, Forfeit |
| Settings | Settings, Sound, Music, Left-handed, Sensitivity, Seed, New Career |
| New Career | Name, Start |
| Other | Age, Continue, Confirm? |

Designer stats use the seven line words. **Stat order** everywhere (cards, the compass rose, arrays in code) is the order in this table.

## 1.3 The league and the season

1. There is one league of 40 teams.
2. A season is ten races. All 80 ships sail every race.
3. After race ten comes the off-season stop (§1.9), then race one of the next season with all points at zero.
4. Seasons continue without end. There is no promotion, relegation or second league.

### 1.3.1 Points

Per ship, per race:

| Place | Points |
|---|---|
| 1 | 50 |
| 2 | 44 |
| 3 | 40 |
| 4 to 40 | `41 − place` |
| 41 to 80 | 0 |

Each sinking credited to a ship scores 2 more. A team's points are the sum over both ships over the season so far.

### 1.3.2 Standing

Teams are ordered by, in turn:
1. points this season, most first;
2. best single ship place this season, lowest first (a team with no race yet counts as 81);
3. last season's final standing, best first. In a new career this is the generated order (§1.10.1), with your team 40th.

Standing is always computed from these, never stored.

### 1.3.3 Reputation

`reputation = previous + (standing − previous) × racesDone / 10`, where `previous` is last season's final standing and `racesDone` is the number of races sailed this season (10 during the off-season stop). It is a real number from 1 to 40; lower is better.

Reputation, not standing, decides who will join a team (§1.6.4) and what sponsors pay (§1.8.5). One good race early in a season therefore moves it little.

## 1.4 Ships and lines

1. Every team has seven design levels and each of its two ships has seven fitted levels.
2. A ship carries exactly one gun. Its kind is one of five: `cannon`, `scatter`, `repeater`, `harpoon`, `mortar`. The `gun` line's fitted level applies to whichever kind is fitted.
3. Every team starts knowing the cannon. The other four kinds are unlocked by projects (§1.7.3).
4. All ships look the same apart from livery and emblem. Part levels do not change a ship's look (Part 4).
5. No level is ever below 5.

### 1.4.1 What a level does at sea

Each line maps its fitted level linearly from the value at 0 to the value at 100. This table lives in `career/tuning.ts`; the sim receives the resulting physical values (§2.2.1).

| Line | Physical value | At level 0 | At level 100 |
|---|---|---|---|
| Sails | top speed, m/s | 20 | 45 |
| Rigging | acceleration (`gather`), per second | 0.9 | 2.0 |
| Rigging | Gust meter capacity, s | 3 | 8 |
| Rudder | turn rate, rad/s | 0.45 | 0.8 |
| Hull | hull points | 80 | 200 |
| Keel | shot spread factor | 1.3 | 0.6 |
| Mounts | reload time factor | 1.2 | 0.6 |
| Gun | damage factor | 0.8 | 1.4 |
| Gun | aim-assist cone, rad | 0.06 | 0.10 |

The per-kind gun table that exists today (`GUNS` in `sim/handling.ts`: damage, pellets, interval, magazine, range and so on) stays as the base that the damage, spread and reload factors multiply. The five rarity tiers are deleted.

## 1.5 People

### 1.5.1 Roles and stats

Every person has one role, an age, a name, a portrait seed and that role's stats. All stats are whole numbers 1 to 20.

| Role | Stats | What each does |
|---|---|---|
| Driver | Gunnery, Helm, Nerve, Territory, Stormcraft, Lookout | §1.11.8 |
| Designer | Sails, Rigging, Rudder, Hull, Keel, Mounts, Gun | gain per race on that line (§1.7.2); Gun also drives gun unlocks (§1.7.3) |
| Mechanic | Shield | shield rate (§1.5.2) |
| | Heal speed | heal use time (§1.5.2) |
| | Heal amount | heal factor (§1.5.2) |
| | Thrift | build cost (§1.7.4) |
| | Upkeep | how little every line loses over winter (§1.9 step 2) |

For designers and mechanics a higher stat is always better. A driver's stats also set a style: high Nerve fights, low Nerve runs (§1.11.8).

### 1.5.2 The mechanic at sea

| Physical value | No mechanic | With a mechanic |
|---|---|---|
| Shield rate, per second | 1.5 | 2 + 0.2 × Shield |
| Heal use time, s | 2.5 | 2.2 − 0.07 × Heal speed |
| Heal factor | 0.8 | 0.9 + 0.03 × Heal amount |

Both of a team's ships get these values.

### 1.5.3 Stars

`stars = floor(mean(stats) / 4 × 2) / 2`. The result is 0 to 5 in halves. Stars are always derived, never stored.

### 1.5.4 Generating a person

Every value below is a keyed draw from the career seed (§2.3). For a person with `n` stats:

1. **Overall level** `L`, a real number. Its range depends on who is being generated (§1.5.8, §1.10.1).
2. **Spikiness** `k`, uniform from 0 to 1.
3. **Shape:** draw `u_i` uniform from −1 to 1 for each stat; subtract their mean; divide by the largest absolute value among them (if that is 0, leave them at 0). Call the results `z_i`. They sum to 0 and the largest magnitude is 1.
4. **Peak stats:** `peak_i = clamp(round(L + 6 × k × z_i), 1, 20)`. A person's best stat is therefore at most 6 above their overall level.
5. **Peak age:** a whole number uniform from 26 to 31. **Retirement age:** uniform from 36 to 42.
6. **Age:** given by whoever generates the person (§1.5.8).
7. **Current stats:** `stat_i = clamp(round(peak_i × form(age)), 1, 20)` with `form` from §1.5.5.
8. **Wants** (§1.6.4), a name (§1.13.3) and a portrait seed.

### 1.5.5 Ageing

`form(age)` is:

| Age | `form` |
|---|---|
| below peak age | `max(0.5, 1 − 0.05 × (peak age − age))` |
| peak age to peak age + 3 | 1 |
| above peak age + 3 | `max(0.3, 1 − 0.04 × (age − peak age − 3))` |

At each off-season stop (§1.9 step 3), for every person:
1. Age rises by 1.
2. Current stats are recomputed from peak stats and the new age (§1.5.4 item 7). Young people improve, old people decline, and every stat moves together.
3. If age ≥ retirement age the person retires: they are removed from the game, and a seat they held becomes empty at once.
4. For each retirement one rookie of the same role is generated as a free agent, aged 18 to 21, with `L` uniform from 3 to 17. The number of people in the game stays constant.

### 1.5.6 Owners

1. Each rival team has an owner, who sails slot 0. An owner has an id, a name (§1.13.3), a portrait seed and the driver's six stats, and nothing else: no age, no wants, no wage and no contract.
2. The six stats are the peak stats of §1.5.4 items 1 to 4 with `L` uniform from 6 to 14, by keyed draws from the career seed like every other generated value (§2.3). They never change.
3. An owner never ages, never retires, is paid nothing, never changes team, is never a candidate and cannot be approached.
4. **An owner's Nerve sets how the team is run** as well as how its first ship is sailed (§1.11.8). The team's temperament is cautious for Nerve 1 to 8, sensible for 9 to 11 and bold for 12 to 20; the bands hold about a third of owners each. Temperament is derived, never stored, and it sets the policy's spending (§1.10.2).
5. You know an owner's stats as you know any rival's: as ranges, exact while you hold a report (§1.6.1 items 2, 3 and 5). A report on an owner therefore shows how that team will spend.
6. You are the owner of team 0. You are not in the game's data: slot 0 of team 0 is sailed by hand.

### 1.5.7 Uncle and the stand-in

1. While a team's driver seat is empty its slot 1 is sailed by a stand-in with these stats: Gunnery 2, Helm 1, Nerve 1, Territory 2, Stormcraft 1, Lookout 1.
2. A stand-in is not a person in the game's data. It is paid nothing and cannot be approached, reported on or released.
3. On your team the stand-in is drawn as **Uncle**: a named card in your driver seat with those stats (0 stars), no age, no wage and no contract. He is also the face of the first-run guidance (§1.13.2).
4. On a rival team an empty driver seat is drawn as an empty seat.
5. Signing a driver replaces the stand-in. If the seat empties again, the stand-in returns.

### 1.5.8 How many people exist

At the start of a career:

| Who | Count | `L` | Age |
|---|---|---|---|
| Rival owners | 39 | uniform 6 to 14 | none (§1.5.6) |
| Rival staff: one driver, one designer, one mechanic per team | 117 | §1.10.1 | uniform 20 to 37 |
| Free agents | 60 drivers, 60 designers, 60 mechanics | uniform 3 to 17 | uniform 20 to 37 |

If a generated age is at or above that person's retirement age, it is set to one below it. Your team starts with no staff.

### 1.5.9 Portraits

Every portrait is the one gull drawing (`gull.ts`) with a jacket color and one of six sunglasses styles, both chosen from the person's portrait seed. They do not depend on team, so a person looks the same after moving. Uncle has a fixed portrait.

## 1.6 Hiring

### 1.6.1 What you know about people

Only your team has limited knowledge; the rivals' policy uses true values.

1. **Stats of your own staff** are exact.
2. **Stats of anyone else** show as a range unless you hold a report on them. The range for a stat is `[true − 3 × (1 + o), true + 3 × (1 − o)]`, where `o` is a keyed draw from −1 to 1 fixed for that person, stat and knowledge year (§2.3). The low end is rounded down, the high end rounded up, and both are clamped to 1 to 20. The true value is always inside and is usually not at the center.
3. **Stars** of such a person show as the range from the stars of the low ends to the stars of the high ends.
4. **Asking wage** (§1.6.4) of such a person shows as the range from the asking wage at the low stars to the asking wage at the high stars.
5. **A report** makes one person's stats, stars and asking wage exact until the next off-season stop, when all reports are discarded.
6. A person's wants and preferred seasons (§1.6.4) are never shown directly. They show only through the willingness bar (§1.6.5).

### 1.6.2 The deal

1. One of a team's three seats carries the **scouting marker**. It starts on the designer seat. Moving it is free (`SetScoutSeat`).
2. **After every race** each team is dealt candidates. All earlier deals and talks (§1.6.5) are discarded first.
   - The marked seat's role gets a **full deal**.
   - Any other role for which the team holds an approach (§1.6.3) gets a **one-person deal**: the approached person alone.
3. **At the off-season stop** every role gets a full deal.
4. A full deal is built as: the approached person for that role, if the team holds one; then other free agents of that role who are **eligible** for the team (§1.6.4), taken in the order of a keyed draw (§2.3), until the deal has three people or the eligible run out. An approached person who has left the game, or who is by now the team's own employee, is left out of either kind of deal. A full deal may therefore hold fewer than three or be empty, and a one-person deal whose person is left out is not dealt at all.
5. Holding an approach is used up when its deal is dealt.
6. The same free agent may be in several teams' deals at once. If another team signs them first they stay in your deal, and signing them now means buying out their new contract (§1.6.6).
7. **One candidate per deal:** the first offer sent to a candidate locks that deal to them. No offer can be sent to the deal's other candidates.

### 1.6.3 Report and approach

| Action | Cost | Effect |
|---|---|---|
| Report | 200 × the top of the person's star range, minimum 100 | §1.6.1 item 5 |
| Approach | 500 | The team holds an approach on that person for their role. It replaces an earlier approach for the same role, with no refund. The person is in the next deal for that role (§1.6.2), whatever their standing want and wherever the scouting marker is |

You can report on or approach any person whose card you can open: a candidate in your deals, or the driver, designer or mechanic of a rival (under Opponents). Owners, stand-ins and your own staff cannot be approached. Owners can be reported on.

### 1.6.4 What a person wants

Each person has, by keyed draw: three weights `wMoney`, `wStanding`, `wSecurity`; a preferred contract length of 1, 2 or 3 seasons; and a wage factor `f` uniform from 0.7 to 1.3. The weights are drawn as `wMoney` uniform from 0.4 to 0.7, then `wStanding` uniform from 0.1 to `0.9 − wMoney`, then `wSecurity = 1 − wMoney − wStanding`.

- **Asking wage per race:** `ask = 60 × max(stars, 0.5)³ × f`, rounded to the nearest 10, minimum 10. It follows the person's current stars.
- **Expected reputation:** `expected = 40 − 39 × stars / 5`.
- **Standing score** for a team with reputation `rep`: `s = clamp(1 − (rep − expected) / 20, 0, 1.2)`.
- **Eligible to be dealt to a team:** `s ≥ 0.5`, judged on true stars.

### 1.6.5 Negotiation

An offer has four terms: `wage` per race (10 to 30,000 in steps of 10), `seasons` (1, 2 or 3), signing `fee` (0 to 50,000 in steps of 100), and break `clause` (0 to 300,000 in steps of 500).

The **standard clause** for a wage `w` is `ceil(10 × w / 500) × 500`: ten races of that wage, rounded up to a clause step.

`score = wMoney × m + wStanding × s + wSecurity × c − p`, where:
- `m = (wage + 1.5 × fee / (seasons × 10)) / ask`. Cash up front counts half as much again as the same sum in wages;
- `s` is the standing score (§1.6.4);
- `c = 1 − |seasons − preferred seasons| / 2`;
- `p = 0.1 × max(0, clause / (the standard clause for ask) − 1)`. A clause up to the standard clause for the asking wage is free; a larger one costs willingness.

| Score | Answer |
|---|---|
| ≥ 1 | Signs |
| ≥ 0.85 and < 1 | Counters: the same seasons, fee and clause, with the wage raised to the lowest step at which the score is at least 1.05. If no wage up to 30,000 reaches that, the answer is a refusal |
| < 0.85 | Refuses |

Rules:
1. A team's **talks** with a person hold the attempts used (0 to 3), the last answer (signed, countered or refused), and the open counter if any.
2. Every offer that does not sign uses one attempt, whether it is refused or countered.
3. When three attempts are used no further offer can be sent to that person until the next deal.
4. An open counter can be accepted (`AcceptCounter`) at any time before the next deal, including after the third attempt. Sending a new offer discards it.
5. With no fee and a clause no larger than the standard clause for the asking wage, some wage within the range signs anyone who can be offered to. The most ever needed is 2.5 times the asking wage (`wMoney` is at least 0.4 and the other parts of the score are never negative), and the highest asking wage is 9,750.

The **willingness bar** on screen shows `score` for the terms being edited on a 0 to 1.5 scale with marks at 0.85 and 1. With a report it is a single filled length. Without one it is a band from the score at the high end of the asking-wage range to the score at the low end. A report therefore turns a negotiation from a gamble on three attempts into a known price.

### 1.6.6 Signing, contracts, renewing, release

1. **Cost to sign** is the sum of: the signing fee; the person's break clause if another team employs them, paid to that team; and the release cost (item 7) of whoever holds the seat being filled.
2. **An `Offer` or `AcceptCounter` is refused** (`funds`) unless `balance − cost to sign ≥ 3 × the team's wage bill per race after the signing`, worked out as if the terms were accepted. This holds whatever the person's answer would be, so `funds` says nothing about their price. A refused command uses no attempt.
3. **On signing:** the costs are paid; the previous holder of the seat, if any, becomes a free agent; the person's old seat at another team, if any, empties at once; the person takes the seat with a new contract; the team's deal for that role is discarded and its approach for that role, if it holds one, is dropped; its talks with the person stay, with the answer signed, until the next deal.
4. **A contract** holds the team, the wage, the clause and `racesLeft`. Signed in the lobby before race `r` of a season, `racesLeft = (11 − r) + (seasons − 1) × 10`. Signed during the off-season stop, `racesLeft = seasons × 10`.
5. After each race `racesLeft` falls by 1. It reaches 0 after race ten of the contract's last season. People with `racesLeft` 0 stay in their seat through the off-season stop and leave when it finishes (§1.9), unless renewed.
6. **Renewing** is an offer to your own employee. It can be sent only when their `racesLeft` is 10 or less. It does not use a deal. Its cost to sign is the fee alone. If it signs, the wage and clause change at once and `racesLeft` rises by `seasons × 10`; item 3 does not apply, so the team's deals and approaches stay as they are.
7. **Release** costs `ceil(0.5 × wage × racesLeft)` and makes the person a free agent. Release is the one purchase allowed to take a balance below zero: it is never refused for `funds`.
8. **Wages** are paid per race (§1.8.1).

### 1.6.7 Being poached

Rivals approach and sign people by the same rules. If a rival signs one of your staff, your team is paid the break clause, the seat empties at once, and the paper reports it. You get no chance to match. The break clause is the only defense: a high clause protects you, and asking for one above the standard clause lowers the person's score (§1.6.5).

## 1.7 Development and building

### 1.7.1 The focus

Each team has at most one **focus**: a line, or the unlocking of a gun kind, or nothing. `SetFocus` changes it at any time, at no cost.

### 1.7.2 Gain per race

After each race, for a team with a designer, **every** line gains:

`design[line] += rate × (skill / 4) × (1 − design[line] / 110)`

where `skill` is the designer's stat for that line and `rate` is 1 for the focused line and 0.5 for every other line. Design levels are capped at 100. A team with no designer gains nothing.

### 1.7.3 Unlocking a gun kind

If the focus is a gun kind, then after each race its unlock progress rises by `designer's Gun stat / 4`, and no line gets the focused rate. At 20 the kind is unlocked for that team for good, and the focus becomes nothing; progress stops at 20. The cannon and kinds already unlocked cannot be focused.

### 1.7.4 Building

| Command | Effect | Cost |
|---|---|---|
| `Build {slot, line}` | Sets that ship's fitted level for the line to the team's design level | `ceil(30 × (design − fitted) × (1 + design / 25) × (1 − 0.02 × Thrift))`; Thrift is 0 with no mechanic |
| `FitGun {slot, kind}` | Changes that ship's gun to an unlocked kind and sets its fitted `gun` level to the design level | The `Build` cost of the `gun` line for that ship, minimum 200 |

`Build` is refused (`same`) if the fitted level is at or above the design level. `FitGun` is refused (`same`) if the ship already carries that kind, and (`locked`) if the kind is not unlocked. Both take effect at once.

### 1.7.5 The start

Every design level and every fitted level on your team starts at 5. Both your ships carry a cannon.

### 1.7.6 What you know about rival ships

1. Your own design and fitted levels are exact. A rival's design levels are never shown.
2. For each fitted level of each rival ship you hold a **range** `[lo, hi]` that always contains the true level.
3. **At the start of a career and at each off-season stop** (after winter): `lo = true − 30 × u`, `hi = lo + 30`, with `u` a keyed draw from 0 to 1; then both are clamped to 0 to 100.
4. **After each race:** `lo += (true − lo) × 0.25 × a` and `hi −= (hi − true) × 0.25 × b`, with `a` and `b` keyed draws from 0 to 1. The range narrows by a different amount each race, so it cannot be solved for the true value.
5. **When that team builds that line on that ship** (or fits a gun, for the `gun` line): the range is redrawn as in item 3 with 20 in place of 30.
6. Ranges are shown with `lo` rounded down and `hi` rounded up. A rival ship's gun kind is always known.

## 1.8 Money

### 1.8.1 After every race

Applied to every team, in this order:

| Item | Amount |
|---|---|
| Place prize, per ship | `3000 × ((81 − place) / 80)²`, rounded |
| Sinkings | 150 each |
| Sea held | `40000 × the mean of the team's seven sea-share samples` (§1.11.6), rounded |
| Sponsor fees | each signed sponsor's fee |
| Sponsor bonuses | each sponsor's bonus if its objective was met (§1.8.5) |
| Wages | minus the sum of the team's wages per race |
| Interest | if the balance is then negative: minus 5% of the debt, rounded up |

### 1.8.2 At the off-season stop

Season prize: `60000 × ((41 − final standing) / 40)²`, rounded.

### 1.8.3 Spending and debt

1. A command that costs money is refused (`funds`) unless the balance is at least the cost. `Release` is the exception (§1.6.6 item 7). A signing must also leave the reserve of §1.6.6 item 2.
2. Only wages, interest and release costs can take a balance below zero.

### 1.8.4 Repossession

After a race's money is applied, a team whose balance is below −10,000 is repossessed. It is reset to the state a new team starts in:
- every design level and every fitted level becomes 5; both guns become cannons; only the cannon is unlocked; unlock progress and the focus are cleared;
- all staff become free agents at no cost; approaches, deals and talks are discarded;
- all sponsors and sponsor offers are removed;
- the balance becomes 1,500;
- if it is a rival, your ranges for its two ships are redrawn as at the start of a career (§1.7.6 item 3).

It keeps its name, livery, emblem, owner, points and standing. Repossession applies to rivals too. The game never ends.

### 1.8.5 Sponsors

1. A team has three sponsor slots.
2. After every race, and at the off-season stop, each team is dealt three **offers**, replacing any unsigned ones.
3. An offer has a sponsor from the fixed roster (§1.13.3), a `fee` per race, one `objective`, a `bonus` of twice the fee, and a length of 5 to 10 races. The three offers dealt together have three different sponsors, none of them already in one of the team's slots.
4. `fee = (100 + 1400 × ((40 − reputation) / 39)^1.5) × f`, rounded to the nearest 10, with `f` a keyed draw from 0.8 to 1.2.
5. `SignSponsor {offer, slot}` puts the offer in an **empty** slot at no cost and removes it from the team's offers; the other offers stay. A filled slot cannot be signed over (`locked`) and a sponsor cannot be dropped: a deal runs its length.
6. After each race a sponsor pays its fee, and its bonus if the objective was met. Its races left then fall by 1; at 0 the slot empties.
7. There is no penalty for missing an objective.

| Objective | Met when |
|---|---|
| `top10` | either ship places in the top 10 |
| `sinkTwo` | the team's ships are credited with two or more sinkings between them |
| `sea` | the mean of the team's seven sea-share samples is 0.03 or more |
| `bothAfloat` | both ships are afloat when the fourth storm phase finishes closing |

### 1.8.6 Repaint

Changing livery or emblem after New Career costs 1,000 (`Repaint`). Two teams never wear the same livery: a livery worn by another team is refused (`taken`).

### 1.8.7 Your start

Balance 1,500, no staff, no sponsors, no sponsor offers, no deals.

## 1.9 The off-season stop

When race ten has been recorded (§2.2.5) the career enters the `offseason` phase and these happen at once, in order:

1. **Prize:** the final standings are fixed and each team is paid its season prize (§1.8.2).
2. **Winter:** every design level and every fitted level of every team becomes `max(5, level − loss)`, where `loss = 10 − 0.3 × Upkeep` with a mechanic and `11` without. The mechanic is the one in the seat now, before anyone retires or leaves.
3. **People:** ageing, retirement and rookies (§1.5.5).
4. **Knowledge:** your reports are discarded (§1.6.1) and your ranges for rival ships are redrawn (§1.7.6).
5. **Deals:** each team is dealt a deal for every role (§1.6.2) and three sponsor offers (§1.8.5).

You then see the off-season report (§1.12.11) and return to the lobby, still in the `offseason` phase. Everything in the lobby works as usual: renewing, negotiating (one candidate per role), sponsors, focus, building, paint.

Pressing SAIL sends `FinishOffseason`, which does these in order:
1. The rivals' policy runs (§1.10.2).
2. Every person whose contract has `racesLeft` 0 becomes a free agent and their seat empties.
3. Last season's final standing becomes `previous` for §1.3. The season number rises by 1, the race number becomes 1, all points are cleared and every best place becomes 81 (no race yet). `lastStanding` is set to the new standings, so no movement arrows show. A winning streak carries over from one season to the next.
4. The phase becomes `lobby`.

The app sends `StartRace` straight after it (§2.9.2).

## 1.10 The rival teams

### 1.10.1 Generating the league

A new career generates 39 rival teams by keyed draws. Team `i` (1 to 39) has strength `t = 1 − (i − 1) / 38`, so team 1 is strongest.

| Property | Starting value |
|---|---|
| Design levels | `clamp(10 + 70 × t + d, 5, 100)`, with `d` uniform from −8 to 8 for each line |
| Fitted levels | the design level minus a draw uniform from 0 to 6, for each ship and line, not below 5 |
| Staff | one driver, one designer, one mechanic, each generated with `L = 4 + 12 × t + e`, `e` uniform from −2 to 2 |
| Staff contracts | wage = the person's asking wage; `racesLeft` 10, 20 or 30 by draw; clause = the standard clause for the wage (§1.6.5) |
| Owner | §1.5.6 |
| Balance | `2000 + 30000 × t`, rounded |
| Gun taste | a keyed shuffle of the five kinds: the order in which this team prefers them |
| Gun kinds unlocked | the cannon, plus the first `floor(4 × t)` other kinds in its taste order |
| Guns fitted | both ships carry the unlocked kind that comes first in its taste order |
| Sponsors | three, generated as offers (§1.8.5) for a reputation equal to `i`, with races left drawn from 5 to 10 |
| Focus | none (the policy sets it before race one) |
| Scouting marker | designer |
| Livery and emblem | the 39 rivals are dealt 39 different liveries from the 48 (§1.13.4), none equal to yours; emblems by draw |
| Name | §1.13.3 |

The generated order is team 1 first through team 39, then your team 40th. It is the `previous` standing for the first season.

### 1.10.2 The policy

A rival's decisions are made by one pure function, `policy(state, team) → Command | null`: the next command that team wants to send, or null when it wants nothing more. `runPolicy(state, team)` applies commands from it one at a time until it returns null (at most 40). Because each command is chosen from the state left by the one before, the policy never acts on stale information.

The policy runs for every rival, **worst standing first**, inside `StartRace` and inside `FinishOffseason`. You therefore always act before the rivals on a shared candidate.

A team's temperament comes from its owner's Nerve (§1.5.6 item 4). Team 0 has no owner in the data; when the harness plays team 0 with the policy (§2.8), team 0 is sensible.

Terms used below:
- **Holder stars** of a seat: the stars of the person in it, or −1 if it is empty.
- **Weak seat:** the seat with the lowest holder stars; ties go to the earlier of driver, designer, mechanic.
- **Minimum terms** for a person: the person's preferred seasons, no fee, the standard clause for their asking wage, and the lowest wage step at which the score (§1.6.5) is at least 1. Such a wage always exists (§1.6.5 rule 5). The policy reads the true wants.
- **Affordable signing:** `balance − cost to sign ≥ R × the wage bill per race after the signing`.
- **Affordable purchase** of cost `x`: `x ≤ S × balance` and `balance − x ≥ R × the wage bill per race`.

`policy` returns the first of these that applies:

1. **Marker.** If the scouting marker is not on the weak seat: `SetScoutSeat` to it.
2. **Renew** (only in the `offseason` phase). For each employee with `racesLeft` 0 and no talks yet: if no candidate in that role's deal has more stars and is an affordable signing, and the renewal at minimum terms is an affordable signing: `Offer` those terms.
3. **Sign.** For each role, in the order driver, designer, mechanic, whose deal is not locked: take the candidates who are affordable signings at minimum terms and have at least 0.5 more stars than the holder; if any, `Offer` minimum terms to the one with the most stars (ties: lowest person id).
4. **Approach.** If the team's reputation is 10 or better, it holds no approach for the weak seat's role, and a keyed draw for this team and race is below 0.10: among people employed in that role by teams of worse standing, with at least 1 more star than the holder and an affordable signing at minimum terms, take the one with the most stars; if one exists and 500 is an affordable purchase: `Approach`.
5. **Focus.** Work out the wanted focus and `SetFocus` if it differs from the current one. With no designer the wanted focus is nothing. Otherwise:
   - if fewer than five kinds are unlocked and `design.gun ≥ 25 × the number of kinds unlocked`: the locked kind that comes first in the team's gun taste;
   - otherwise the line with the highest `skill × (1 − design / 110) × w`, where `w` is 1.5 for a line below the mean of the team's seven design levels and 1 otherwise (ties: the earlier line).
6. **Fit.** For slot 0 then slot 1: if the unlocked kind that comes first in the gun taste is not the kind fitted and the `FitGun` cost is an affordable purchase: `FitGun`.
7. **Build.** Among all slot-and-line pairs with `design − fitted ≥ B` whose cost is an affordable purchase: `Build` the one with the largest gap (ties: slot 0 first, then the earlier line).
8. **Sponsors.** If a slot is empty and offers exist: `SignSponsor` the offer with the highest `fee + 0.5 × bonus` into the first empty slot.
9. Otherwise null.

| Temperament | Owner's Nerve (§1.5.6) | `B` (levels) | `S` (share of balance) | `R` (races of wages) |
|---|---|---|---|---|
| Cautious | 1 to 8 | 12 | 0.25 | 6 |
| Sensible | 9 to 11 | 8 | 0.40 | 4 |
| Bold | 12 to 20 | 5 | 0.60 | 3 |

The policy never releases anyone. A rival whose income falls below its wages runs into debt and may be repossessed (§1.8.4).

The policy must never issue a command the reducer refuses (§2.7.2); if one is refused, that team's run stops and the refusal is listed in the accepted result's `refused` field, which the harness treats as a failure. Ties among sponsor offers and approach targets go to the earliest offer and the lowest id. The harness plays your seat with the policy, as a sensible team (§2.8.2).

## 1.11 The match

The sea controls, the camera, the aim assist, ramming, the planet and the storm's shape are as they are today unless this section says otherwise.

### 1.11.1 Setup

A match is 80 ships: 40 teams of two. It is described completely by a `MatchSetup` (§2.2.1): the planet seed, the match seed, a storm rating and a heal rating from 1 to 5, and for each ship its team, slot, team standing, physical values and either `player` or six driver stats. Ships of one team never damage each other, share home water, and are never aim-assist targets for each other.

### 1.11.2 Race conditions

Each race has two ratings by keyed draw, each a whole number 1 to 5, shown as stars on the next-race slip.

| Stars | Storm factor: every wait and closing time is multiplied by | Heal count factor: the number of heal spots is multiplied by |
|---|---|---|
| 1 | 1.30 | 0.50 |
| 2 | 1.15 | 0.75 |
| 3 | 1.00 | 1.00 |
| 4 | 0.85 | 1.25 |
| 5 | 0.70 | 1.50 |

There are no match types. The existing match-type table (`persona.ts`) is deleted.

### 1.11.3 The storm

The storm keeps its seven phases and their radii. Every wait and closing time in today's schedule (`STORM` in `sim/storm.ts`, 458 s in total) is multiplied by `300 / 458`, then by the race's storm factor. Storm damage bypasses the shield, as today.

### 1.11.4 Guns

One gun per ship, fixed for the match. There is no gun loot, no gun switching and no equip delay. A ship's damage, spread, reload and assist cone come from its physical values (§1.4.1).

### 1.11.5 Heals

1. The only item is the **heal**, in four rarities.

| Rarity | Restores, as a share of the ship's hull points | Share of heals found |
|---|---|---|
| Common | 0.15 | 50% |
| Rare | 0.30 | 30% |
| Epic | 0.50 | 15% |
| Legendary | 1.00 | 5% |

2. The amount restored is multiplied by the ship's heal factor (§1.5.2) and cannot take the hull above its hull points.
3. A ship carries up to three heals, one per slot. Sailing over a heal with a free slot takes it. With no free slot, a heal of higher rarity than the ship's lowest replaces that lowest one, which is dropped where the ship is; otherwise it is left.
4. Using a heal takes the ship's heal use time (§1.5.2). While using, the ship sails at 0.6 of the speed asked, as today. **A hit does not cancel it.**
5. Heals come from three places: spots strewn at the start (today's 640 spots, times the race's heal count factor, rounded), one cache of 8 at the start of each storm phase after the first (rarities 50% rare, 35% epic, 15% legendary), and a sunk ship's unused heals spilled where it sank.
6. Shield items, repair kits and gun pickups are deleted.
7. A spot holds one heal, and a second with today's chance of 40%. A heal cannot be started at full hull. The slot being used is never the one replaced. Gust may be switched on while healing.

### 1.11.6 Territory, shield and hull

1. Claiming sea works as today (`sim/territory.ts`): a home patch, a brush along the course, and enclosing a loop floods the smaller side. A team's ships share their water.
2. **Sea-share samples:** at the moment each of the seven storm phases finishes closing, the sim records each team's share of the sea that is inside the storm's ring (0 to 1). The result carries seven samples per team. If the match ends before a phase finishes closing, each missing sample is 0 for a team with no ship afloat at the end, and otherwise that team's share at the moment the match ended.
3. **Shield:** starts at 0, maximum 100, absorbs before the hull. It refills wherever the ship is, by today's rule (`sim/holding.ts`): the rate is the ship's shield rate (§1.5.2) when the team holds at least 1% of the sea inside the ring, and proportionally less below that. A team holding no sea gets no shield.
4. **Hull:** the ship's hull points (§1.4.1). Hull never mends by itself; the hull mending that exists today is deleted. Only heals restore it.
5. **Smoke:** a ship below 40% hull smokes, heavier below 25%. This keeps today's low-hull smoke without the fault system.
6. Faults, fault zones and part reliability are deleted.

### 1.11.7 Gust

Gust is a sprint with an energy meter.
1. A tap turns it on; a tap turns it off.
2. While on, the meter drains 1 s per second and the ship gets today's Gust speed and acceleration boost.
3. While off, the meter refills at half the drain rate.
4. Capacity is the ship's Gust meter capacity (§1.4.1). It starts full.
5. At empty it turns off. It cannot be turned on while the meter is below 30% of capacity.
6. Shots fired while it is on have today's Gust spread penalty.
7. Bots use the same meter.

### 1.11.8 Drivers

A bot's behavior comes only from its six stats. `sim/driver.ts` turns a `DriverStats` into the parameter set the bot code already reads (today's `Temper` in `sim/temper.ts`), by the tables below. Parameters the tables do not name take one fixed value each, the mean of today's six styles. The persona labels, the six styles, the per-bot seeded skill and mood, and the per-persona brain variants are deleted. Today's behaviors stay (storm avoidance, healing, fleeing, fighting, hunting, collecting, claiming, roaming, in `sim/bot.ts` and the modules it gathers).

**How much a driver wants each thing.** Each option's weight is today's base weight times `0.25 + 1.5 × x / 20`, where `x` is:

| Option | `x` |
|---|---|
| Fight, hunt | Nerve |
| Claim | Territory |
| Flee | `21 − Nerve` |
| Heal (use and collect), storm avoidance | not scaled |

**How well they do it.** Each row runs linearly from the value at stat 1 to the value at stat 20.

| Stat | Effect | At 1 | At 20 |
|---|---|---|---|
| Gunnery | reaction time before firing, s | 2.2 | 0.3 |
| Gunnery | aim skill (today's gunnery skill in `sim/gunner.ts`) | 0 | 1 |
| Helm | helm skill (today's helm skill in `sim/helmsman.ts`) | 0 | 1 |
| Nerve | hull share at which it breaks off a fight | 0.6 | 0.15 |
| Territory | width of the loops it tries to close, m (from Territory 8 up) | 60 | 250 |
| Stormcraft | how long before a ring starts closing it sets off for the next one, s | 0 | 25 |
| Lookout | distance at which it notices ships and heals, m | 60 | 300 |

**Tricks, each on only at or above a stat level.**

| Trick | Needs |
|---|---|
| The aim assist leads its shots (below this a bot fires where the target is now) | Gunnery 8 |
| Returns fire at targets beyond 90 m | Lookout 10 |
| Uses Gust to dodge incoming fire | Helm 12 |
| Uses Gust to outrun the storm | Stormcraft 10 |
| Closes loops on purpose to claim large areas (below this it claims only along its course) | Territory 8 |
| Uses a heal while under fire | Nerve 12 |

If a stat's effect is not visible when comparing 20 against 1, widen that stat's range in the tables above (§2.7.4). Do not add special cases.

"Under fire" means hit in the last 5 s. The notice distance also lifts today's 240 m limit of sight, so Lookout 20 sees to 300 m. Each bot keeps a seed made from the match seed and its ship id for tie-breaks, aim wander and route choices; no personality is drawn from it.

### 1.11.9 Where ships start

Berths are found as today (`sim/spawn.ts`). They are then assigned by standing: order the berths along a path that starts at a berth chosen by the match seed and repeatedly visits the nearest unvisited berth; order the teams by the standing in their ship specs; give each team consecutive berths for its ships, slot 0 first. Teams of similar standing therefore start near each other, and the bottom of the league starts far from the top.

### 1.11.10 How a match ends and how ships are placed

1. The match ends when ships of at most one team are afloat, or 180 s after the last storm phase finishes closing, as today's team-race rule does.
2. Places are today's order (`finishing` in `play/result.ts`): ships afloat first, ordered by sinkings, then their team's current sea share, then ship id; then sunk ships, last sunk first.
3. A storm sinking is credited to the last ship that hit the victim within 8 s, as today. A sinking with no such ship is credited to nobody.
4. In the result, a team's sea share is its claimed area over the whole area inside the ring, land included, as the shield rule reads it. A sample that the match ended before taking holds the team's share at the end, or 0 with no ship afloat; `afloatAtPhaseFour` is then afloat at the end. If a team's two specs carry different standings, berths use the better one.

### 1.11.11 When you sink or forfeit

When your ship sinks, or you choose Forfeit from the pause sheet (which sinks your ship at once, credited to nobody), two buttons appear after the sinking has played: Watch and Result. If the match ends before either is tapped, the app goes on as after any race.
- **Watch** follows your other ship if afloat, otherwise the best-placed ship afloat (the first ship afloat in the placing order of §1.11.10), at normal speed, with the Result button still on screen and the vitals slip gone.
- **Result** finishes the match without drawing it: the app steps the sim in slices of at most 12 ms per display frame until it ends, drawing no 3D frame, only the ships-afloat count and the storm clock running fast. The match always ends (§1.11.10), so this is bounded. Then the app goes on as after any race (§2.9.2).

### 1.11.12 Aground

A ship cannot sail into water shallower than its draft (2.2 m); the bank stops it. One change from today gets it off again:

1. **Backing off.** A ship that is stopped (under 1 m/s) with a bank within 3 m of its bow, steered more than 1 radian off its bow with any throttle, goes astern at up to one fifth of its top speed, turning as it goes, until its bow is within 1 radian of the course it is steered on; then it goes ahead as usual. Nowhere else does a ship go astern: in open water a stopped ship steered astern turns and goes ahead.
2. **Bots.** A bot held by a bank looks for the deepest water round it. If that lies more than half a radian off its bow it stops its engine and pivots toward it one way, giving a pivot 8 seconds without swinging 0.15 rad (1.5 seconds when the hull is not turning at all) before it pivots the other way, and only gives the pivot up when both ways have failed; when that water is abaft its beam it backs off by rule 1. A held bot with another hull within 3 m lies stopped as today, unless that hull is ahead of its beam and it is aground, when it backs away by rule 1.
3. Both are in `sim/handling.ts` (`SHIP.astern`, `aback`, `ahead`, `stopped`) and `sim/helmsman.ts` (`HELM.pivot`, `patience`), and count as tuning numbers for Milestone 7.

## 1.12 Screens

All screens use the sea UI's drawing system (§2.5): paper slips, round ink buttons, drawn glyphs, italic numerals. Positions below are for the 1180 × 820 point landscape screen and sit inside the safe area. "Round button" means the existing paper-disc button; "ribbon button" means the existing SAIL ribbon. Every lobby screen is drawn only from its view data (§2.5.3). A control that cannot be used is drawn faint and does nothing when tapped.

### 1.12.0 How the screens fit together

1. **The lobby** is the base: the 3D scene with slips and buttons over it (§1.12.2).
2. **A screen** opens over the lobby: Ship, Team, Sponsors, Opponents, Planet or Settings. One is open at a time. While a screen is open the lobby's four bottom-left buttons and SAIL are hidden, the three top-right slips (money, standing, race) stay, and the Settings button's place at the far top right is taken by a round **close button** that returns to the lobby.
3. **A sheet** is a paper panel. It never covers the whole screen; the ship stays visible beside or behind it.
4. **A sheet may open over a screen:** the deal and negotiation over Team; the team sheet beside the standings in Opponents; the paint picker over Ship. There is still one close button, the round one at the far top right, and it always goes back one step: from an enlarged card to its sheet, from a sheet to the screen under it, from a screen to the lobby. While a sheet is open the screen under it fades out, so that nothing of it shows round the sheet; the team sheet in Opponents is the exception, since it sits beside the standings and both stay. Nothing closes on a tap outside it.
5. **A person card** can be enlarged in place by a tap and shrunk by a second tap. While a card is enlarged, the round close button shrinks it; with no card enlarged it goes back one step as usual.
6. **Flows** take over the whole interface until finished and offer no way out except forward: New Career (§1.12.1), the result flow (§1.12.10) and the off-season report (§1.12.11). The one thing that opens over a flow is a team sheet from a link in the paper (§1.13.1); closing it returns to the paper.
7. **A two-tap button** guards an action that cannot be undone. The first tap arms it: its face changes to the word Confirm? with a tick glyph. A second tap on it acts. A tap anywhere else disarms it and does nothing more.

### 1.12.1 New Career

Shown when no career is saved, and when opened from Settings in the lobby.

- **Scene:** one ship at anchor, painted neutral gray with white sails until a dye is picked, then in the picked livery. With no career it is on a fixed planet (seed `portolan`); opened from Settings it is your slot 0 ship on the planet already built.
- **Left sheet (40% width):**

| Element | Detail |
|---|---|
| The game's name | "Portolan", as a title |
| Name | The word and a text field for the team name, 1 to 16 characters; prefilled with a team name from the list (§1.13.3) |
| Seed | The word and a text field, 1 to 24 characters; beside it a round die button that fills in a random word (`rolled` in `world/seeds.ts`). Prefilled the same way |
| Livery | 16 dye swatches in two rows of 8, a row of 3 pattern swatches and 12 emblems in two rows of 6 (§1.13.4), every swatch at least 44 points across. One of each is always selected; the first of each at the start. The pattern and emblem swatches are drawn in the selected dye |
| Start | Ribbon button; faint until Name and Seed are non-empty |
| Close | Round button at the sheet's corner, only when a career exists; returns to Settings |

- **Start** creates the career with `newCareer` (§2.2.3), sends `StartRace`, saves and reloads the page; the match for race one then begins (§2.9.3). The lobby is not shown first.
- If a career already exists, Start is a two-tap button (§1.12.0 item 7).
- The ship stays gray until a dye swatch is tapped, the already selected one included; picking a pattern or an emblem first leaves it gray. It then repaints as each choice is made.
- The die tumbles, then the seed word types itself into the field.
- The Name and Seed fields sit in the upper 40% of the sheet so that the iPad keyboard does not cover them, and the layout does not move while a field has focus.

### 1.12.2 Lobby

The home screen whenever a career exists, no race is under way and no flow is showing.

- **Scene:** your two ships at anchor on the next race's planet, slot 0 in front. A one-finger drag orbits the camera round them.

| Position | Element | Shows | Tap |
|---|---|---|---|
| Top left | Next-race slip | A small inked globe of the planet (`orb.ts`), the planet's name, a storm glyph with 1 to 5 stars, a heal glyph with 1 to 5 stars | Opens the Planet screen (§1.12.9) |
| Top right, left to right | Money slip | Coin glyph and balance. Red, with the interest due after the next race beneath, when the balance is negative | None |
| | Standing slip | Laurel glyph, standing as a numeral, and an arrow up or down with the places moved since before the last race (nothing if unmoved) | Opens Opponents, once that button has appeared |
| | Race slip | Flag glyph and the next race as "4/10". During the off-season stop: a winter glyph alone | None |
| | Settings button | Round, wheel glyph | Opens Settings (§1.12.12) |
| Bottom left, left to right | Ship button | Round, ship glyph, the word Ship | Opens the Ship screen |
| | Team button | Round, gull glyph, the word Team | Opens the Team screen |
| | Sponsors button | Round, pennant glyph, the word Sponsors | Opens the Sponsors screen |
| | Opponents button | Round, table glyph, the word Opponents | Opens the Opponents screen |
| Bottom right | SAIL | Ribbon button with a galleon on waves and the word SAIL | Starts the race (§2.9.2) |

**Dots.** A button shows a small red dot while a condition holds. They are computed from the career state alone.
- Team: a seat is empty (Uncle counts as empty) and its role has a deal with at least one candidate; or an employee has 3 or fewer races left on their contract.
- Ship: you have a designer and no focus; or some design level is 8 or more above a fitted level and you can afford that build.
- Sponsors: a slot is empty and at least one offer is waiting.

**First run.** Buttons that have not been introduced yet are hidden (§1.13.2).

### 1.12.3 Ship

- **Entering:** the camera eases to the first stop.
- **Stops:** seven, in the order sails, rigging, rudder, hull, keel, mounts, gun. Each has a fixed camera pose on slot 0 (the existing `FOCI` in `play/anchorage.ts` has six; add one for the gun, looking along the gun deck from the stern quarter). Your anchored ships carry the gun kind fitted to them, so a fitted mortar stands on deck.
- **Motion:** changing stop slides the sidebar in from the side the stops moved toward while the ring glides along the stop row and the camera moves. A build puts an ink burst over the ship and a camera kick; the fitted numeral counts up as its bar grows, a green "+N" floats up, the tick stamps in and the money slip counts down. Setting the focus glides the designer's portrait along the stop row to the line and pulses the camera.

| Position | Element | Shows | Tap |
|---|---|---|---|
| Left edge, middle | Previous arrow | Round, arrow glyph | Previous stop, wrapping |
| Middle, at the sidebar's left edge | Next arrow | Round, arrow glyph | Next stop, wrapping |
| Bottom center of the scene | Stop row | Seven line glyphs; the current one ringed; the focused line carries the designer's small portrait | Jumps to that stop |
| Top left | Paint button | Round, dye-pot glyph, the word Paint | Opens the paint picker |
| Right third | Sidebar sheet | See below | |

**Sidebar, top to bottom:**
1. The line's glyph and its word.
2. **Design level:** a large numeral over a 0 to 100 bar.
3. **Two ship rows**, slot 0 then slot 1. Each shows who sails it (a helm glyph for you; the driver's or Uncle's small portrait), the fitted level as a numeral and a mark on a 0 to 100 bar, and a **Build** button showing the cost with a coin glyph and the gain as "+14". Build is faint, with the reason drawn as a glyph, when fitted equals design (a tick) or the balance is short (the **short-balance mark**: a faint coin under a rubric cross). Tap sends `Build`.
4. **Focus button:** the word Focus, the designer's small portrait and this line's gain per race at the focused rate, to one decimal, as "+2.4". When this line is the focus it is drawn pressed, and a tap clears the focus (`SetFocus` with nothing). Otherwise a tap makes it the focus. With no designer it is faint and shows an empty portrait outline.

**The gun stop adds:**
- Between items 2 and 3, a **kinds row** of five gun-kind glyphs. Unlocked kinds are inked. Locked kinds are faint with their unlock progress beneath as "12/20". Tapping a locked kind makes its unlocking the focus (tapping the one being unlocked clears the focus); with no designer the tap is refused with a shake. The kind being unlocked carries the designer's small portrait. Tapping an unlocked kind does nothing.
- In each ship row, before the Build button and right of the sailor's column, a **fit row** of the unlocked kinds as small glyphs with the ship's fitted kind ringed. Tapping another kind selects it for that row: the Build button then shows the `FitGun` cost and sends `FitGun` for that kind. Tapping the fitted kind returns the button to Build.

**Paint picker.** A sheet at the left, as wide as New Career's (272 units, so that every swatch keeps its 44 points): the word Paint beside a dye pot that takes the selected dye, then §1.12.1's Livery element, with liveries worn by other teams drawn faint along the row that would make them. A tap on a faint swatch is refused with a shake. While the picker is open the camera shows the whole ship beside the sheet, and the ship shows the selected dye and pattern as they change (the emblem shows on the ship from step M6.1). A ribbon button shows a coin glyph and 1,000; it is faint when nothing has changed or the balance is short. Tap sends `Repaint` and closes the picker. The picker's corner close button discards the selection and the ship returns to what it wore.

### 1.12.4 Team

A sheet across the lower two-thirds of the screen with three **person cards** in a row: driver, designer, mechanic.

**Person card, front:**

| Element | Detail |
|---|---|
| Portrait | The gull with the person's jacket and sunglasses |
| Name, and the word Age with the age | Text and numeral |
| Role | The role's glyph and word |
| Stars | Five star glyphs, filled to the half |
| Compass rose | §1.12.13 |
| Wage | The word Wage, coin glyph, wage per race |
| Contract | The word Contract, flag glyph and the races left as a numeral; beneath them pips, one per race left, in rows of ten, up to 30 |

- **Empty seat:** a card outline with the role's glyph and word.
- **Uncle** (in your driver seat when it is empty) shows no age, no wage and no contract.
- **An owner's card** (§1.12.8) shows the word Owner and the helm glyph as its role, and no age, no wage and no contract.
- **Scouting marker:** a paper tab on the top edge of one seat's card, at its left, with the spyglass glyph and the word Scouting. The same place on the other two cards shows a faint tab with the spyglass alone; tapping it moves the marker (`SetScoutSeat`).
- **A deal waiting** for a role: a **candidates slip** at the top left of the screen, above the sheet. It shows the word Candidates, the candidates' small portraits fanned like a hand of cards and shown whole, and the role's glyph. Tapping it opens that role's deal (§1.12.5). With deals for several roles the slips stand side by side in seat order, and the fans narrow so that three slips stay clear of the money slip. The slips are hidden while a card is enlarged.

**Enlarged** (§1.12.0 item 5), a card covers the other two and adds:
- every stat as its glyph, its word, a numeral and a 1 to 20 bar;
- **Renew** (opens negotiation with that person, §1.12.6); faint while they have more than 10 races left;
- **Release**, showing its cost with a coin glyph; a two-tap button (§1.12.0 item 7) that sends `Release`.

Uncle's enlarged card has neither button.

### 1.12.5 The deal

A sheet over the Team sheet, the same size, showing one role's deal: up to three **candidate cards** side by side. A candidate card is a person card with these differences:

| Element | Detail |
|---|---|
| Stars | Filled to the low end of the star range, hatched to the high end |
| Compass rose | Each point drawn as a band between the low and high ends of that stat. The current holder of the seat is overlaid as a thin outline; an empty seat shows none; Uncle counts as a holder |
| Wage | The asking wage, as two numerals if it is a range |
| Current team | If employed by another team: that team's emblem and the word Clause with a coin glyph and the amount |
| Pin | A pin glyph at the top right corner while you hold an approach on them |

**Under each card, three buttons:**

| Button | Shows | Tap | Faint when |
|---|---|---|---|
| Report | The word, coin glyph, cost | `BuyReport`; the ranges on that card become exact | You hold a report on them (a tick in place of the cost), or the balance is short (the short-balance mark over the coin) |
| Approach | The word, coin glyph, cost | `Approach`; the card gains the pin | You hold an approach on them (the pin in place of the cost), or the balance is short (the short-balance mark over the coin) |
| Negotiate | The word | Opens negotiation | Another candidate in this deal has been sent an offer |

**Enlarged**, a candidate card shows every stat with its glyph, word and range as two numerals on a 1 to 20 bar (one numeral when exact), with the current holder's value as a tick on the same bar. The numerals are blue where the candidate's low end is above the holder's value and red where the high end is below it.

### 1.12.6 Negotiation

A sheet over the Team sheet, the same size, replacing the deal sheet while open. The close button returns to the deal (for a candidate) or to Team (for a renewal). Closing it loses nothing: the talks are in the career state.

- **Left third:** the person's card (candidate form if not yours).
- **Right two-thirds, top to bottom:**

| Element | Detail |
|---|---|
| Wage | The word, a stepper (minus, numeral, plus) in steps of 10. A stepper's two signs are the characters − and + in the numeral face, not glyphs |
| Seasons | The word, a three-way picker: 1, 2, 3 |
| Fee | The word, a stepper in steps of 100 |
| Clause | The word, a stepper in steps of 500 |
| Cost | Coin glyph and the cost to sign now (§1.6.6); an arrow; the balance after. Red when the signing would be refused for funds |
| Willingness bar | §1.6.5: a bar with marks at 0.85 and 1, filled to the score, or a band for a range. It follows the steppers as they change. Over the mark at 0.85 sits a small counter mark and over the mark at 1 a small tick, so each says what it is for |
| Attempts | Three pips; a used attempt is a cross |
| Answer | Empty at first. Then the last answer: a large tick (signed), a large cross (refused), or a counter mark with their wage numeral and a round tick button that sends `AcceptCounter` |
| Offer | Round button with the word; sends `Offer`. Faint when the signing would be refused for funds or all three attempts are used |

Holding a stepper's button repeats it, faster the longer it is held. The steppers start at the asking wage (the low end if a range), 2 seasons, no fee, and the standard clause for the wage (§1.6.5). The clause follows the wage as its standard clause until you change the clause yourself. A signing shows the tick for one second, then closes the sheet and returns to Team, where the new card drops into its seat.

- An answer does not appear at once: an hourglass shows for half a second, then the answer is stamped in. The terms and the money slip stay as they were until it lands.
- The large cross of a refusal is red.
- A held stepper button moves in larger steps the longer it is held: 5 steps at a time, then 25.
- The card in this sheet cannot be enlarged.
- A signing also presses a red seal with a tick onto the person's card; the card gives under it and ink spreads from it. All of it ends inside the one second.
- Accepting a counter ticks the Wage numeral to the countered wage before the signing lands.
- Reopening the sheet on a talk that has already ended in a signing shows an empty answer corner.

### 1.12.7 Sponsors

A sheet across the lower two-thirds.

- **Upper row: three slots**, drawn as pennants.

| State | Shows |
|---|---|
| Filled | The sponsor's emblem and name; coin glyph and fee; the objective's glyph (a laurel with "10", a gun with "2", a territory glyph with "3%", or two ship glyphs); coin glyph and bonus; one knot on a line for each race left; a wax seal with a tick |
| Empty | A dashed pennant outline with a ghost shield |

- **Lower row: up to three offers**, drawn as smaller pennants on hooks with the same contents and no seal. An offer that cannot be signed is faint. With no offers the row shows a faint hourglass.
- **Colors:** a sponsor has no colors in the roster. Its pennant takes a dye from the livery list by the sponsor's place in the roster, and its roster emblem is drawn on a shield in that dye and its mark color.
- **Signing:** tap an offer (it lifts), then tap an empty slot; that sends `SignSponsor`. Tapping the lifted offer again puts it down. A filled slot, a faint offer, and an empty slot with no offer lifted shake as a refusal.
- **Motion:** pennants sway on their staffs when the sheet opens, and offers that can be signed keep drifting in a light breeze. A lifted offer rises with a shadow while the empty slots breathe. On signing, the offer furls, flies to its slot and unfurls there; the seal is pressed with a burst; a coin with "+N" counts up above the sheet, N being the fee times the races left, which is what the deal pays if it runs its length. The money slip does not change, since fees are paid race by race.

### 1.12.8 Opponents

A sheet over the left 55% of the screen holding the standings; a team sheet opens over the right 45%. Both are 360 units tall and sit at the bottom, and the camera stands as it does for the paint picker, so the ship shows above them.

**Standings:** a vertically scrolling list of 40 rows, with no header row. This is the only table in the game.

| Column | Shows |
|---|---|
| Place | Numeral |
| Movement | Arrow up or down and the places moved since before the last race |
| Team | Emblem and name |
| Points | Numeral with a small star-burst glyph |
| Strength | A 0 to 100 bar showing the range of the mean of that team's 14 fitted levels (the mean of the low ends to the mean of the high ends); your own team's mean as a tick on every row |

Your row is highlighted in gilt with a stripe in your dye. The list opens scrolled so your row is in view. A team that has not moved shows no arrow. The row whose team sheet is open is outlined, with a pointer toward the sheet; tapping it again shakes it.

**Team sheet** (tap a row; tapping another row replaces it):

| Element | Detail |
|---|---|
| Header | Emblem, name, laurel glyph and place |
| Two ship columns | Seven rows, one per line: the line's glyph once, then for each ship a 0 to 100 range bar with your own slot 0 fitted level as a tick. Each ship's gun-kind glyph stands at the end of its gun row. The columns have no headings |
| Four small cards | Owner, driver, designer, mechanic, two by two: name, portrait, star range, role glyph and the role's word. An empty seat is an outline; your own empty driver seat shows Uncle |

Tapping a small card enlarges it as a candidate card (§1.12.5), the 196-unit card and not the wide one, with **Report** beneath it, and **Approach** as well unless it is the owner. The holder overlaid and compared is whoever holds the same seat in your team: Uncle for your empty driver seat, nobody for another empty seat. An owner's card has no holder outline, no ticks, no blue or red, no wage and no clause. Your own row opens your team with exact values and no buttons; its owner card is the helm glyph and the word Owner, and your staff enlarge as the front of their card.

**Motion:** the rows ink in outward from your row, the arrows bounce in and the strength bars draw out. A tapped row answers at once; its team sheet slides in from the right over the one before, which drops away, and its small cards deal in. The list moves like paper under a finger: a drag takes over from a row's tap once it travels, it coasts, and it gives softly past either end.

### 1.12.9 Planet

Opened from the next-race slip.

- **Scene:** the live planet seen from space among stars, with a soft glow at its limb, using the existing full-map view (`globe.ts`): one finger spins it with inertia, two fingers pinch. The spin and pinch are one base piece that the sea map uses as well.
- **Marks:** your two berths, each a pulsing ring in your dye; the storm's first ring, drawn as a dashed line with a purple band and turning swirls on its stormy side. Berths and ring come from the next race's setup and reach the screen through the port.
- **Top left slip:** the planet's name; storm glyph with stars and the word Storm; heal glyph with stars and the word Heals. The stars ink in one after another.
- **Motion:** opening from the next-race slip, the camera pulls back from the anchorage to the planet; the corner close flies back down.

The seed field, the die and the persona bars of today's seed panel are deleted at step M6.6, once the career flow has replaced the flow that still uses them.

### 1.12.10 The result flow

Shown on launch whenever the career's `unread` flag is set (§2.9.1), which is the case after every recorded race. It is drawn from the career's `lastRace` report while the next planet builds behind it; the lobby's slips and buttons are hidden until it ends. Three steps; a tap anywhere advances steps 1 and 2. A tap while a step is still moving finishes its motion at once, and the next tap advances, so nobody waits.

**Step 1, the race.** A sheet across the center.

| Element | Detail |
|---|---|
| Two ship rows | For slot 0 and slot 1: who sailed it (helm glyph, or the driver's or Uncle's portrait), laurel glyph with place as "12/80", a gun glyph with sinkings, and either an afloat glyph or the emblem and name of the team that sank it (a storm glyph if nobody was credited) |
| Shots | Target glyph and the share of your team's shots that landed, as a percentage |
| Sea | Territory glyph and the mean of your seven sea-share samples, as a percentage |
| Podium | The emblems and names of the teams of the ships placed 1, 2 and 3 |
| Points | Star-burst glyph and "+n" |

The sheet lands; each ship row is dealt, its place counts up and stamps, its sinkings punch in one by one, and a ship that was sunk shows who did it with a strike; the podium rises third, second, first, the winner's emblem largest; the points burst last.

**Step 2, the money.** A sheet across the center. Rows appear one at a time and count up, each with its mark: place (the laurel), sinkings (the gun glyph), sea (the territory glyph), each sponsor (emblem, a tick or cross for its objective, the amount), wages (the small portraits of the people paid; negative), interest if any (the short-balance mark of §1.12.3; negative), then a rule and the total. The place, sinkings and sea rows always show; wages show only when someone was paid, and interest only when it is not zero. A sponsor's tick or cross is stamped; the total lands heavier than the rows. Below: coin glyph, the balance before, an arrow, the balance after, rolling from one to the other; laurel glyph, the standing before, an arrow, the standing after, and the places moved.

**Step 3, the paper** (§1.13.1). After race ten the off-season report (§1.12.11) takes this step's place.

| Element | Detail |
|---|---|
| Masthead | "The Gullible" between a gull's head and a ship in boxes, over a dateline rule with the season and race as "Season 2, Race 4" |
| Headlines | Up to five, most important first: the first large across the page, the rest in columns below, with grey bars standing for body copy |
| Workshop strip | A boxed notice. If you had a designer: the focused line's glyph and its design level before and after as "42 → 44" (for a gun unlock: the kind's glyph and its progress) |
| Continue | Ribbon button with the word; faint, showing a turning ring, until the world is built. Sends `MarkRead` and goes to the lobby |

The paper is drawn as a newspaper, not a sheet: it spins in and slaps down, then prints its headlines; on Continue it is tossed aside and the lobby rises.

If your team was repossessed this race, steps 1 and 2 show as usual and step 3 is the special edition (§1.13.1).

### 1.12.11 The off-season report

Shown in place of step 3 after race ten, drawn from the career's `lastOffseason` report. Four pages; a ribbon button with the word Continue advances. Apart from names and the paper, the pages hold no text: every change is a shape, a bar or a numeral.

| Page | Shows |
|---|---|
| 1. The table | The top three teams (emblem, name, points) with the champion's emblem large inside a laurel, second and third beside it under their places; below a rule, your own row with your emblem, name and final standing out of the number of teams (no points); coin glyph and your season prize |
| 2. Your people | Your three seats as three **season cards** side by side. A season card is the front of a person card (§1.12.4) with these differences: the role is its glyph alone; the age is a numeral without its word; there is no Wage row and there are no buttons; there is no word Contract; and under the rose every stat is drawn as its glyph, a numeral and a bar whose full length is 20, without its word, in two columns. A seat that was empty is an empty seat outline, and Uncle is not drawn. Each compass rose shows last season's shape as a thin outline under this season's filled shape (the comparison of §1.12.13), so growth and decline read as the gap between the two. Beside each numeral, a stat that changed shows its change in blue (up) or red (down). Age shows "+1". A retired person's card is drawn struck through and slid aside off an empty seat outline. A flag, a numeral and pips show races left; a card with none left is drawn with an hourglass glyph |
| 3. Winter | The seven lines as rows. Each row is the line's glyph and three 0 to 100 bars: design, slot 0 fitted, slot 1 fitted, headed by the designer glyph, the helm glyph and the driver glyph. Each bar is filled to the level after winter, with the part lost drawn faint beyond the fill and the new level as one numeral at the bar's end. A winter glyph heads the page. No other numerals |
| 4. The paper | The season edition (§1.13.1). Continue is faint, showing a turning ring, until the world is built; it sends `MarkRead` and goes to the lobby |

**Motion.** A tap while a page is still moving finishes its motion at once, as in the result flow; each page lifts away as the next lands. Page 1: the champion's emblem arrives large, a laurel draws itself round it and a burst follows; second and third step in beside it; your row slides in, your place stamps and the prize counts up. Page 2: the cards are dealt; on each, last season's outline draws and this season's shape grows out of it, the bars and numerals run from last season's values to this season's, the changes pop in and the age ticks over; a retired card is struck through with a drawn stroke and slides aside. Page 3: the winter glyph settles like frost, then line by line each bar drains from its level before winter to its level after, the numeral counting down with it.

The lobby is then in the off-season stop (§1.9): the race slip shows the winter glyph, every role has a deal, and SAIL starts the new season.

### 1.12.12 Settings and pause

**Settings screen** (a sheet at the center, 50% width):

| Element | Detail |
|---|---|
| Sound | The word and a slider, 0 to 1, default 0.8. The level reaches the audio as the thumb moves, and letting go plays the ready cue at the chosen level |
| Music | The word and a slider, 0 to 1, default 0.6. The game has no music yet, so the level is only stored |
| Left-handed | The word and a switch, default off; swaps the stick with Fire and Gust |
| Sensitivity | The word and a slider for aim drag, 0.5 to 2, default 1, with a notch at the default |
| Seed | The word and the career seed as text on a slip (lobby only). A tap copies it and a green tick answers; if the clipboard refuses, the seed shakes |
| New Career | Ribbon button across the sheet's foot (lobby only); opens New Career (§1.12.1), whose close button returns to Settings |

A slider's thumb swells and lifts when grabbed and settles with a slight overshoot; the fill follows it with no lag; a tap on the track moves the thumb there. The switch throws with a snap and its track dyes over, showing a tick when on. The lobby's Settings button becomes the close button while the sheet is open.

**Pause.** At sea, a small round pause button sits in the top center group of the HUD (§1.12.14). It stops the match, dims the sea, ducks the sound and opens a sheet at the center with three round buttons, each over its word: Resume (the arrow glyph), Settings (the wheel) and Forfeit (the flag). Resume lets the match back in over a soft release of 650 ms. Settings opens the same sheet (`ui/base/settings.ts`, §2.5.3 item 9) without its last two rows, with a round close button at its corner that returns to the pause sheet; Left-handed and Sensitivity apply when the match resumes. Forfeit is a two-tap button (§1.12.0 item 7). Putting the app in the background pauses the match the same way.

### 1.12.13 The compass rose

The stat shape on every person card.
- One point per stat, at equal angles, the first at the top, going clockwise in the stat order of §1.2.
- Each point's length is the stat on a 0 to 20 scale. The points are joined into a filled shape over faint rings at 5, 10, 15 and 20.
- The web fills the room the card gives it. The stat's glyph sits at each tip. On an enlarged card the numeral sits above or below the glyph, away from the web.
- A range is drawn as a band between the shapes of the low and high ends.
- A comparison overlays a second shape as a thin outline.

### 1.12.14 The HUD at sea

| Position | Element | Detail |
|---|---|---|
| Top left | Vitals slip | Shield bar (blue) with numeral, hull bar with numeral. Half the width of today's slip. A small plus glyph beside the shield bar while the shield is refilling (the engine's refill rate is above zero). The ship diagram is removed |
| Top center, left to right (the group sits in the gap between the vitals slip and the minimap, a little left of true center, because that is where it fits at the narrowest layout) | Storm clock | As today |
| | Ships afloat | As today |
| | Sea share | Territory glyph and your team's current share of the sea inside the ring, as a percentage: the same share the shield rule uses (§1.11.6). Below 10% it shows tenths ("0.2%"), since a whole percentage would read 0% for most of the opening |
| | Wingman chip | Your driver's (or Uncle's) small portrait and slot 1's hull bar; a cross when sunk. Not drawn in a match with no teammate |
| | Pause button | §1.12.12 |
| Top right | Minimap | As today; a tap opens the full map |
| Bottom center | Heal slots | Three squares. A held heal shows the heal glyph with its border in the rarity color (gray, blue, purple, gold). A tap uses it; a ring fills round it while it is being used |
| Right thumb | Fire | Round button. Holding fires. A drag that starts on it also moves the aim, scaled by Sensitivity, once the finger has moved more than 8 units; within that it fires without moving the aim. A ring round it shows reload |
| | Gust | Round button above Fire. A tap toggles. A ring round it shows the meter, with a notch at 30% |
| Left thumb | Stick | As today |

Removed: the two gun slots, the pit wall, team calls, the mates panel and the fault diagram. With Left-handed on, the stick and the two right-thumb buttons swap sides.

**Motion.** The HUD changes attributes only when a value changes; nothing is rebuilt each frame. Damage flashes the lost part of a bar white and then drains it, and the numeral rolls. The shield bar shimmers and its plus glyph pulses while it refills; a broken shield cracks out with a shake. At a quarter of the hull or less the slip throbs in rubric. The sea share pops when your team gains water. The wingman's portrait flinches when slot 1 is hit and its cross stamps in when it sinks. A heal drops into its square with a bounce and a glint in its rarity color; using it fills the ring and the square empties with a puff; a tap on an empty square shakes. Fire kicks on each shot and its ring sweeps the reload. Gust's ring fills, the button wakes with a pulse as the meter passes the notch, and glows while on.

## 1.13 Text

### 1.13.1 The paper

"The Gullible" appears once per race (§1.12.10 step 3) and once per season (§1.12.11 page 4). An edition has at most five headlines, chosen by `career/paper.ts` from the career's `news` list (§2.2.4).

**Which headlines.** The edition takes events in this order of importance and keeps the first five: `repossessed` (your team), `yourSeason`, `title`, `yourFinish`, `poached` (involving your team), `raceWon`, `streak`, `repossessed` (others), `poached` (others), `retired`, `hired`, `unlocked`, `lineLead`, `sponsorSigned`, `rookie`. Within one kind, events involving your team come first, then better-standing teams first.
- A race edition always has `yourFinish`.
- The season edition always has `yourSeason` and `title`, and has no `yourFinish` or `raceWon`.

**Which wording.** Each kind has the wordings below. The variant is chosen by keyed draw among those whose placeholders all have values. Placeholders in braces are filled from the event.

| Kind | Wordings |
|---|---|
| `yourFinish` | "{team} finish {place}. Owner 'encouraged'." / "{team} finish {place}. Fish supper canceled." / "{team} finish {place}, ahead of several ships that sank." |
| `yourSeason` | "{team} end the season {place}. Board of one expresses full confidence." / "Season over: {team} are {place}. Next year, apparently." |
| `raceWon` | "{team} take {planet}. Rivals blame the wind." / "{person} wins at {planet}, thanks nobody." |
| `hired` | "{team} sign {person}. Sunglasses remain on." / "{person} joins {team} for an undisclosed amount of fish." |
| `poached` | "{team} lure {person} from {team2}. Clause paid in full, feelings not." / "{person} swaps {team2} for {team}. 'Purely about the project.'" |
| `retired` | "{person} retires at {age} to spend more time near chips." / "{person}, {age}, hangs up the sunglasses." |
| `rookie` | "{person}, {age}, enters the market. Scouts report 'a gull'." |
| `repossessed` | "Creditors strip {team} to the planks." / "{team} lose everything except the name." |
| `streak` | "{team} make it {n} in a row. League considers a rule about that." |
| `title` | "{team} are champions. Parade route: one lap of the planet." |
| `sponsorSigned` | "{sponsor} back {team}, citing 'brand alignment with sinking'." |
| `unlocked` | "{team} unveil a {gun}. Nobody is reassured." |
| `lineLead` | "{team} now have the league's best {line}." |

When your own team is repossessed, the edition is a special: the single headline "Creditors take everything from {team} except Uncle." in large type between heavy rules, and nothing else on the page. It falls harder than an ordinary paper and shakes as it lands, and Uncle's portrait peeks over its corner from outside the page. The money step before it still shows the balance that caused it; the reset shows in the lobby.

`{place}` is written as an ordinal ("12th"). `{gun}` and `{line}` are the kind's or line's name in lower case. Do not add kinds or wordings.

**Names in headlines are links.** A link is drawn underlined.
- A team's name opens that team's sheet (the team sheet of §1.12.8) over the paper.
- A person's name opens the sheet of the team they are with now, with their card enlarged. This covers owners and anyone under contract. The name of someone who has retired or is a free agent is plain text.
- The sheet works exactly as it does in Opponents, including Report and Approach. It opens in the middle of the screen with the paper faded behind it, and carries its own round close button at its corner, since a flow has none; that button shrinks an enlarged card first and then returns to the paper.
- Links are active once the Opponents button has appeared (§1.13.2). Before that, and in the special edition, every name is plain text.

### 1.13.2 Uncle's bubbles

First-run guidance is Uncle's small portrait with a speech bubble, placed beside the control it is about, with a pointer to it. Each is shown once per career and remembered (`MarkSeen`). A tap dismisses it. At most one shows at a time; a second waits for the first to be dismissed. At sea nothing counts before the race begins, and the other sea bubbles wait until `steer` and `fire` have been seen, since the Gust meter starts full with rivals near. `steer` points at a faint ring drawn where the thumb lands, because the stick only appears on touch. If you sink while a bubble is up, it is dropped without being marked seen and returns next race. The match never pauses for a bubble.

Uncle pops in with a bob, the bubble unrolls from him and folds away on the tap; while he waits he blinks and tilts his head, and the control he points to glows softly. The lobby's bubbles behave the same.

| Id | Shown when | Beside | Line |
|---|---|---|---|
| `steer` | Race one starts | The stick | "Thumb here. Point where you want to go." |
| `fire` | 6 s after `steer` is dismissed | Fire | "Hold to fire. Drag to aim." |
| `gust` | The first time the Gust meter is full and a ship of another team is within 150 m | Gust | "Tap for a sprint." |
| `heal` | Your ship first picks up a heal | The heal slots | "That's a heal. Tap it when you're hurt." |
| `home` | Your team first holds any sea | The vitals slip | "That's our water. More water, faster shield." |
| `storm` | The first storm phase begins closing | The storm clock | "Storm's closing. Stay inside the ring." |
| `sunk` | The first time you sink | The Result button | "Happens to everyone. Mostly me." |
| `team` | The first time the lobby shows | Team button | "Hire somebody. I can't do everything." |
| `ship` | The first time the lobby shows with a designer employed | Ship button | "A designer makes the ship less bad." |
| `sponsors` | The first time the lobby shows after race two | Sponsors button | "Sponsors pay. Take the money." |
| `opponents` | The first time the lobby shows after race three | Opponents button | "That's everyone better than us." |

**Lobby buttons appear in step with these.** Team and SAIL are present from the first lobby. Ship appears once `ship` has been shown, Sponsors once `sponsors` has, Opponents once `opponents` has. Whether a button is present is computed from the career's `seen` list. Once shown a button stays.

Do not add lines.

### 1.13.3 Names

All names come from fixed data in `career/names.ts`, chosen by keyed draw. The team, sponsor and planet lists are written by hand and contain no banned word.

| List | Size | Rule |
|---|---|---|
| People and owners | built, not listed: an initial and a family name, such as "M. Brackwater". The initial is the first letter, in upper case, of a keyed pick from `GIVEN_START`; the family name is a keyed pick from `FAMILY_START` joined to one from `FAMILY_END`, with a capital. These three tables are today's, in `career/names.ts`, with two changes made in step M1.10: `'person'` is removed from `FAMILY_START` (it is the residue of an old search and replace) and `'grey'` becomes `'gray'` | Two people may share a name. A name that `allowed` rejects (it contains a word in `BANNED`) is drawn again with the next attempt number (§2.3) |
| Teams | at least 60 | The 39 rivals have 39 different names. Your own name is typed and may equal one |
| Sponsors | a roster of exactly 60, each a name and an emblem number | §1.8.5 item 3 |
| Planets | at least 200 | Chosen by keyed draw for each race; names may repeat |

Write the team, sponsor and planet lists in the tone of §0.1. Each name is at most 16 characters.

### 1.13.4 Liveries and emblems

A **livery** is a dye and a pattern, as today: 16 dyes (`DYES` in today's `play/colors.ts`) and 3 patterns (`PATTERNS` in today's `player.ts`: plain, band, stripes), which gives 48 liveries. An **emblem** is one of the 12 devices in today's `ui/emblem.ts`, drawn in the team's dye. The count of emblems is a constant in `world/livery.ts` beside the dyes and patterns, so that `career/` can use it. The twelve devices' outlines are one table in `world/livery.ts` too, read by both the shield drawings in `ui/base/emblem.ts` and the sails, which cannot import from `ui/`, so the two cannot drift. On a ship every square sail carries the device in the mark color over the dye, 0.8 of the sail's drop tall, smaller on the topsails; on the band pattern it is counterchanged (dye where it crosses the band), and on stripes it keeps a fringe of dye round it. All ships' devices come from one shared texture, with each ship's emblem number carried per instance, so emblems add no draw. A newly picked emblem shrinks out and bleeds back in during the repaint. The chooser's pattern swatches show the chosen emblem. A team has one livery and one emblem; both its ships wear them. Emblems may repeat between teams; liveries may not.

---

# Part 2. Architecture and conventions

## 2.1 Folders

Everything is under `src/`. Today's layout and where each piece goes are in Appendix A.

| Folder | Holds | May import |
|---|---|---|
| `world/` | The planet, terrain, sphere math, seeded random, color math, the livery list | nothing outside `world/` |
| `sim/` | The match engine: takes a `MatchSetup`, steps at a fixed rate, returns a `MatchResult`. Owns the contract files `kinds.ts`, `setup.ts`, `result.ts`, `hands.ts` | `world/` |
| `career/` | The league: state, commands, rules, policy, names, views | `world/`, and from `sim/` only `kinds.ts`, `setup.ts`, `result.ts` |
| `render/` | Everything drawn with three.js: `ship/`, `water/`, `sky/`, `land/`, `post/`, `gunfire/`, `loot/`, `view/`, the frame, and its input contract `snapshot.ts` | `world/`, `sim/` |
| `play/` | The running game: feeds input to the engine, turns engine state into snapshots and HUD data, cameras, the lobby scene. Owns the HUD contract `player.ts` | `world/`, `sim/`, `render/`, `audio/` |
| `audio/` | Sound | `world/`, `render/snapshot.ts`, `play/player.ts` |
| `ui/base/` | The drawing system, glyphs, the gull, shared pieces | `world/`, `sim/kinds.ts`, `render/snapshot.ts`, `play/player.ts` |
| `ui/sea/` | The HUD | what `ui/base/` may, and `ui/base/` |
| `ui/lobby/` | Every lobby screen, sheet and flow | what `ui/base/` may, `ui/base/`, `career/views/`, `career/commands.ts` |
| `app/` | The entry point, the flow between screens and matches, the save, settings, debug switches | everything |

Rules that matter most:
1. **`sim/` and `world/` import nothing above them.** This is what lets a match run headless in Node with no GPU. Every rule of the match is in `sim/`; `play/` decides only what is shown.
2. **`career/` never imports `sim/` code**, only its contract files, and never imports `play/`, `render/`, `ui/` or `app/`.
3. **`ui/sea/` and `ui/lobby/` never import each other.** Anything both need lives in `ui/base/`.
4. **`ui/` never imports three.js**, and imports nothing from `render/` or `play/` except the two contract files `render/snapshot.ts` and `play/player.ts`. Those two files hold only types and small pure helpers.
5. **`play/` never imports `career/` or `ui/`.** `app/` passes each what it needs from the other.
6. `tools/` and `tests/` may import anything.

These rules are enforced by ESLint `no-restricted-imports` blocks in `eslint.config.js`, one per folder, alongside the existing rules that ban clocks and `Math.random` in `world/`, `sim/` and `career/`. In flat config a later block's `no-restricted-imports` replaces an earlier one for the same files, so each folder block must repeat the existing repository-wide restriction (the `three/src/*` ban).

## 2.2 Contracts

### 2.2.1 The sim's input and output

`sim/setup.ts`:

```ts
export type DriverStats = {
  gunnery: number; helm: number; nerve: number;
  territory: number; stormcraft: number; lookout: number;
};

export type ShipSpec = {
  team: number;
  slot: 0 | 1;
  standing: number;
  hands: 'player' | DriverStats;
  topSpeed: number;
  gather: number;
  turnRate: number;
  hullPoints: number;
  spreadFactor: number;
  reloadFactor: number;
  gun: GunKind;
  damageFactor: number;
  assistCone: number;
  gustCapacity: number;
  shieldRate: number;
  healTime: number;
  healFactor: number;
};

export type MatchSetup = {
  planet: string;
  match: number;
  storm: 1 | 2 | 3 | 4 | 5;
  heals: 1 | 2 | 3 | 4 | 5;
  ships: readonly ShipSpec[];
};
```

- `ships` has 2 to 80 entries and the index is the ship's id. Teams are the `team` numbers the specs carry, numbered from 0 with no gaps; a team has one or two ships.
- A race of a career always has 80 ships, with the ship of team `t` and slot `s` at index `2 × t + s`. Every other setup comes from `evenSetup` in `sim/even.ts` (step M2.2), which tests, the harness and debug states use, and the app until milestone 6.
- At most one ship has `hands: 'player'`, and when present it is ship 0.
- `standing` is the team's standing (1 to 40), used only for berths (§1.11.9).
- The sim knows nothing about levels, staff, money, liveries or names. `career/fit.ts` turns levels and staff into the physical values, using §1.4.1 and §1.5.2.

`sim/result.ts`:

```ts
export type ShipResult = {
  place: number;
  sunkAt: number | null;
  sunkBy: number | null;
  sinkings: number;
  shotsFired: number;
  shotsLanded: number;
  damageDealt: number;
  damageTaken: number;
  afloatAtPhaseFour: boolean;
};

export type MatchResult = {
  seconds: number;
  hash: string;
  ships: readonly ShipResult[];
  sea: readonly (readonly number[])[];
};
```

- `ships[i]` is ship `i`. `place` is 1 to the number of ships. `sunkBy` is the id of the ship credited, or null for none.
- `sea[t]` is team `t`'s seven sea-share samples (§1.11.6).
- `afloatAtPhaseFour` is true if the ship was afloat when the fourth phase finished closing, and also if the match ended before that with the ship afloat.
- `hash` is a hash of the final sim state, used by the determinism tests.

`sim/hands.ts` holds the `Hands` type: what the player's ship is asked to do in one step, in the sim's own terms (a course and throttle, an aim, fire, Gust, and the heal slot used). It is not the touch input: that type, which today is `Hands` in `play/player.ts`, stays there under the name `Thumbs`, because `ui/sea/` reads it and may not import from `sim/`. `play/` turns `Thumbs` into `Hands` each step.

`sim/engine.ts` is the sim's one entry point:

```ts
export function createMatch(setup: MatchSetup, waters: Waters): Match;

export type Match = {
  step(hands: Hands): void;
  readonly done: boolean;
  result(): MatchResult;
  readonly view: MatchView;
};
```

- `Waters` is what the engine needs from a built planet (depth, the routing chart, the berths, and the swell worked out ahead of time). `sim/waters.ts` holds the computation that today's `play/sounding.ts` does, without its timing calls. `play/` keeps the Worker that runs it in the browser (`watersOf`); `tools/` and `tests/` call it directly.
- `step` advances one fixed step of 1/30 s. `hands` is ignored when no ship has `hands: 'player'`.
- `view` is read-only access to the state `play/` draws from: ships, shots, heals, the storm, territory, and what happened in the last step. Only `play/`, `tools/` and `tests/` read it.

### 2.2.2 Career state

`career/state.ts` defines one plain-data `CareerState`. It must survive `JSON.parse(JSON.stringify(state))` unchanged: no classes, Maps, Sets, functions or `undefined` values.

```ts
export type Line = 'sails' | 'rigging' | 'rudder' | 'hull' | 'keel' | 'mounts' | 'gun';
export type Role = 'driver' | 'designer' | 'mechanic';
export type Levels = Record<Line, number>;
export type Focus = { line: Line } | { gun: GunKind } | null;
export type Terms = { wage: number; seasons: 1 | 2 | 3; fee: number; clause: number };

export type Contract = { team: number; wage: number; clause: number; racesLeft: number };

export type Person = {
  id: number;
  role: Role;
  name: string;
  portrait: number;
  age: number;
  peakAge: number;
  retireAge: number;
  peak: number[];
  stats: number[];
  wants: { money: number; standing: number; security: number };
  preferred: 1 | 2 | 3;
  wageFactor: number;
  contract: Contract | null;
};

export type Owner = { id: number; name: string; portrait: number; stats: number[] };

export type Deal = { candidates: number[]; locked: number | null };
export type Talk = {
  person: number;
  attempts: number;
  answer: 'signed' | 'refused' | 'countered' | null;
  counter: Terms | null;
};
export type Objective = 'top10' | 'sinkTwo' | 'sea' | 'bothAfloat';
export type Sponsor = {
  sponsor: number; fee: number; bonus: number; objective: Objective; racesLeft: number;
};
export type Ship = { fitted: Levels; gun: GunKind };

export type Team = {
  name: string;
  livery: Livery;
  emblem: number;
  taste: GunKind[];
  owner: Owner | null;
  balance: number;
  design: Levels;
  unlocked: GunKind[];
  unlockProgress: Record<GunKind, number>;
  focus: Focus;
  ships: [Ship, Ship];
  seats: Record<Role, number | null>;
  scoutSeat: Role;
  approached: Record<Role, number | null>;
  deals: Record<Role, Deal | null>;
  talks: Talk[];
  sponsors: [Sponsor | null, Sponsor | null, Sponsor | null];
  offers: Sponsor[];
};

export type Range = { lo: number; hi: number };
export type Knowledge = { reports: number[]; lines: Record<Line, Range>[][] };

export type CareerState = {
  version: number;
  seed: string;
  season: number;
  race: number;
  phase: 'lobby' | 'racing' | 'offseason';
  unread: boolean;
  teams: Team[];
  people: Person[];
  nextPersonId: number;
  points: number[];
  bestPlace: number[];
  previousStanding: number[];
  lastStanding: number[];
  winStreak: { team: number; n: number } | null;
  lineLeaders: Record<Line, number | null>;
  knowledge: Knowledge;
  lastRace: RaceReport | null;
  lastOffseason: OffseasonReport | null;
  pendingEvents: NewsEvent[];
  news: NewsEvent[];
  seen: string[];
};
```

- `season` starts at 1. `race` is the next race to sail, 1 to 10, in the `lobby` and `racing` phases; in the `offseason` phase it stays at 10 and `season` is still the season just finished.
- `teams[0]` is yours; its `owner` is null. A rival's `owner` is its owner (§1.5.6), with `stats` in the driver's stat order. Owners are not in `people`. Their ids come from the same counter as person ids, so an id names one owner or one person, and `knowledge.reports` and the range keys of §2.3 hold either.
- `stats` and `peak` are in the stat order of §1.2 for the person's role.
- Free agents are the people with `contract: null`. Retired people are removed from `people`.
- `points[t]`, `bestPlace[t]`, `previousStanding[t]` and `lastStanding[t]` are per team. `bestPlace[t]` is 81 until team `t` has raced this season. `lastStanding` is the standing before the last recorded race (for movement arrows).
- `knowledge.lines[t][slot]` is your range for each line of that rival ship (§1.7.6). Entry 0 is unused.
- `RaceReport` holds exactly what the result flow shows (§1.12.10): season, race, planet name; for each of your ships its place, sinkings, whether it sank, the team that sank it or null, and whether anybody was credited; the portrait seed of the driver who sailed slot 1, or null for Uncle (the driver may retire in the same step); shots fired and landed; mean sea share; the podium teams; points gained; each money row; balance and standing before and after; the workshop strip's before and after; and whether you were repossessed.
- `OffseasonReport` holds exactly what the off-season report shows (§1.12.11): the final standings order and points; your prize; for each of your three seats, as it was when race ten was recorded, the person's name, role, portrait seed, age before and after, stats before and after, races left, and whether they retired (an empty seat is recorded as empty); and your design and fitted levels before and after winter. The report copies these values because a retired person is no longer in `people`.
- Uncle and other stand-ins are not in the state; their stats are in `career/tuning.ts`.
- Standing, reputation, stars and asking wages are computed by functions in `career/rules/`, never stored.

### 2.2.3 Commands

`career/commands.ts` defines the command union. `career/apply.ts` exports:

```ts
export function newCareer(options: {
  seed: string; name: string; livery: Livery; emblem: number;
}): CareerState;

export function apply(state: CareerState, command: Command): Applied;
export type Applied =
  | { ok: true; state: CareerState }
  | { ok: false; reason: Reason };
```

`newCareer` generates the career (§1.10.1, §1.5.8, §1.8.7) in the `lobby` phase at season 1, race 1, with `unread` false. `apply` never throws and never mutates its input. Every command has a `team` field. You send `team: 0`; the policy sends the rival's index.

| Command | Fields | Valid in phase | Effect |
|---|---|---|---|
| `StartRace` | | lobby | Runs the policy for every rival (§1.10.2); phase becomes `racing` |
| `RecordRace` | result | racing | §2.2.5 |
| `FinishOffseason` | | offseason | §1.9 |
| `MarkRead` | | lobby, offseason | Clears `unread` |
| `MarkSeen` | id | any | Adds a bubble id to `seen` |
| `SetFocus` | focus | lobby, offseason | §1.7.1 |
| `Build` | slot, line | lobby, offseason | §1.7.4 |
| `FitGun` | slot, kind | lobby, offseason | §1.7.4 |
| `Repaint` | livery, emblem | lobby, offseason | §1.8.6 |
| `SetScoutSeat` | role | lobby, offseason | §1.6.2 |
| `BuyReport` | person (the id of a person or of an owner) | lobby, offseason | §1.6.3 |
| `Approach` | person | lobby, offseason | §1.6.3 |
| `Offer` | person, terms | lobby, offseason | §1.6.5, §1.6.6 |
| `AcceptCounter` | person | lobby, offseason | Signs at the open counter's terms |
| `Release` | person | lobby, offseason | §1.6.6 |
| `SignSponsor` | offer, slot | lobby, offseason | §1.8.5 |

That is 16 commands. Only team 0 may send the first five.

**Refusal reasons** are codes, never sentences. A command is checked in the order of this table and refused with the first reason that applies. Before any of them, a command that is not an object or whose type is not one of the 16 is refused `invalid`. A `RecordRace` result is `invalid` unless it has 80 ships with each place from 1 to 80 used once, `sunkBy` ids that are ships, and 40 teams of seven sea samples each from 0 to 1. `SignSponsor`'s `offer` is an index into the team's offers. `MarkSeen` of an id already seen is accepted and changes nothing.

| Reason | When |
|---|---|
| `team` | A rival sent one of the first five commands, or the team index is out of range |
| `phase` | The command is not valid in the current phase |
| `invalid` | A field is out of its range (a slot, a term outside §1.6.5's ranges, a livery or emblem number that does not exist) |
| `unknown` | No such person, owner, offer or bubble id |
| `fixed` | The id is an owner's (for `Approach`, `Offer`, `Release`), or the person is your own employee (for `Approach`) |
| `seat` | `Offer` or `AcceptCounter` to someone who is neither a candidate in the team's deals nor its employee with 10 or fewer races left; `Release` of someone the team does not employ; `AcceptCounter` with no open counter |
| `locked` | `Offer` to a candidate when the deal is locked to another; `FitGun` of a kind not unlocked; `SetFocus` on the cannon or a kind already unlocked; `SignSponsor` into a filled slot |
| `attempts` | `Offer` when three attempts are used |
| `taken` | `Repaint` to a livery another team wears |
| `same` | Nothing would change: `Build` with fitted equal to design; `FitGun` of the fitted kind; `SetFocus` to the current focus; `SetScoutSeat` to the marked seat; `Repaint` to the current livery and emblem; `BuyReport` on someone already reported or employed by you; `Approach` on someone you already hold an approach on |
| `funds` | §1.8.3 |

### 2.2.4 News events

```ts
export type NewsEvent = {
  kind: NewsKind;
  team?: number; team2?: number; person?: string; personId?: number;
  sponsor?: string; line?: Line; gun?: GunKind;
  place?: number; n?: number; age?: number; planet?: string;
};
```

`NewsKind` is exactly the thirteen kinds in §1.13.1. An event stores a person's name as well as their id, because people retire and leave `people` while the paper still names them. The id is used only to make the name a link (§1.13.1): when the paper is drawn, a name is a link if that id is an owner's or belongs to a person under contract. Team names are read from the state when the paper is drawn.

Events are appended to `pendingEvents` as they happen:

| Kind | Appended by |
|---|---|
| `hired` | Any signing of a free agent, by any team |
| `poached` | Any signing of a person employed by another team (`team` signs from `team2`) |
| `sponsorSigned` | `SignSponsor` |
| `yourFinish` | `RecordRace`: the better place of your two ships |
| `raceWon` | `RecordRace`: the team of the ship placed 1st; `person` is the owner's or driver's name, absent for your slot 0 and for a stand-in |
| `streak` | `RecordRace`, when one team has won 3 or more races in a row (`n`) |
| `unlocked` | `RecordRace`, when an unlock completes |
| `lineLead` | `RecordRace`, when the team with the single highest design level in a line changes (a tie for highest changes nothing) |
| `repossessed` | `RecordRace` |
| `title`, `yourSeason` | The start of the off-season stop |
| `retired`, `rookie` | The start of the off-season stop |

At the end of `RecordRace`, `news` is replaced by `pendingEvents` and `pendingEvents` is emptied. `career/paper.ts` exports a function from the state to an edition: at most five items, each a kind, a variant index and its placeholder values, each value carrying the team to open and the person to enlarge when it is a link (§1.13.1). The paper opens the sheet with the port's `open`. The wordings table lives in `career/wordings.ts`, because the paper picks a variant by its placeholders and `career/` may not import `ui/`.

### 2.2.5 What `RecordRace` does

In this order:
1. `lastStanding` is set from the current standings. League points and best places are updated for every ship (§1.3.1).
2. Money for every team (§1.8.1).
3. Repossession (§1.8.4).
4. Development gains and unlock progress for every team (§1.7.2, §1.7.3).
5. Sponsor races left and contract `racesLeft` fall by 1; finished sponsors leave (§1.8.5).
6. Your ranges for rival ships narrow (§1.7.6).
7. The events of §2.2.4.
8. `lastRace` is filled in and `unread` is set.
9. If `race` is less than 10: `race` rises by 1, the phase becomes `lobby`, and each team is dealt its deals (§1.6.2) and sponsor offers (§1.8.5). If `race` is 10: the phase becomes `offseason` and the five steps of §1.9 run, filling in `lastOffseason`.
10. `news` is replaced (§2.2.4).

A sponsor has one money row, its fee plus its bonus when the objective is met. After race 10 offers and deals are dealt once, at the off-season stop. An approach is used up whenever its role is dealt, even when its person is left out. A rival's `BuyReport` is refused `same`. A person you release goes from exact back to a range. If you are repossessed in race 10 the paper is the special edition. A streak is told on every race at three wins or more. In the reports a money row that takes money (wages, interest) is stored negative, so a balance's change is the sum of its rows. The race report's balance "after" is taken after step 2. `paid` holds portrait seeds, not ids, because a person may retire in the same step. The report's shots are both your ships' totals and its sea share the mean of your seven samples.

## 2.3 Seeds and determinism

1. A career has one seed, a string the player types or rolls.
2. **Every random draw is keyed.** `career/draw.ts` exports `draw(seed, ...keys)`, which returns a number from 0 up to but not including 1. It joins the keys with `/` into one string, turns that string and the seed into numbers with `seedOf` (`world/seeds.ts`), and mixes the two with `hash01` (`world/random.ts`). The same file builds `uniform(lo, hi)`, `whole(lo, hi)` and a keyed ordering on top of it. There are no stored random counters and no random streams.

| Draw | Keys |
|---|---|
| A person's or an owner's generated values | `'person'`, id, field name (and stat index for `u_i`; and for the name, the part and an attempt number counted from 0) |
| A team's generated values | `'team'`, team index, field name (and slot and line where needed; and for the name and the livery an attempt number counted from 0, redrawn until no earlier team has it). Your team's gun taste is drawn this way too. A staff member's level and contract length are drawn under that person's `'person'` keys |
| The planet's name for a race | `'planet'`, season, race |
| The match seed, storm stars, heal stars | `'match'` / `'storm'` / `'heals'`, season, race |
| The order of eligible free agents for a deal | `'deal'`, season, race, team, role, person id |
| A team's sponsor offers | `'offer'`, season, race, team, offer index, field name |
| A stat range's offset | `'range'`, `y`, id, stat index |
| A rival ship range: `u` | `'line'`, `y`, team, slot, line; followed by `'built'` and the race when redrawn by a build, or by `'repossessed'` and the race when redrawn by a repossession |
| A rival ship range: `a`, `b` | `'narrow'`, season, race, team, slot, line, `'a'` or `'b'` |
| The policy's approach chance | `'approach'`, season, race, team |
| A headline's wording | `'wording'`, season, race, item index |
| A rookie's values | `'person'` keys as above (a rookie gets the next person id) |

During the off-season stop the race key is 11.

`y` is the **knowledge year**: the season number in the `lobby` and `racing` phases, and the season number plus 1 in the `offseason` phase. The ranges you see during the off-season stop are therefore already next season's, and last season's offsets tell you nothing about them.

3. The planet's seed string for a race is `` `${seed}/${season}/${race}` ``.
4. `world/`, `sim/` and `career/` use no clock and no `Math.random` (already enforced by lint).
5. **The guarantee:** the same seed, the same commands and the same stick-and-button input give the same career, to the bit. With bots at every helm, the same seed alone gives the same career.

## 2.4 Saving

1. The save is the `CareerState` as JSON. Its `version` field is the only version.
2. `app/save.ts` defines a `Store` with `read(key): Promise<string | null>` and `write(entries): Promise<void>`, where `write` stores several keys in one transaction and resolves only when the transaction has completed. Two implementations: IndexedDB (database `portolan`, one object store) and in-memory (for tests and the harness).
3. After every accepted command from team 0, the app writes, in one transaction, the previous state to `career.bak` and the new state to `career`.
4. Writes go through one queue, so they land in order. Before any page reload the app waits for the queue to empty. A write that fails is tried again after 0.5 s, doubling to at most 8 s, until it lands; the writes behind it wait, and so does a reload. While a write is failing, the loading mark turns rubric.
5. On load: read `career`; if it is missing or does not parse, read `career.bak`. If the state's `version` differs from the code's `VERSION`, treat it as no career, without trying the backup. A read that fails, or JSON that is not an object, counts as not parsing.
6. There are no migrations (Part 4). Raise `VERSION` whenever `CareerState` changes shape.
7. Settings (§1.12.12) are saved separately in `localStorage` under `portolan.settings`.

## 2.5 The UI system

### 2.5.1 One drawing system

All UI is DOM elements placed over the canvas and filled with inline SVG produced by functions in `ui/base/ink.ts`: `slip`, `paperDisc`, `bar`, `ring`, `glyph`, `figure`, `roughRect`, `roughCircle`. Glyphs are data in `ui/base/glyphs.ts`, and a few drawn marks are functions in `ui/base/marks.ts`. There is no other component library and no CSS framework. The old kit (`ui/kit/`) and the chartroom kit (`ui/chartroom/`) are deleted.

### 2.5.2 Pieces to add to `ui/base/`

| File | Piece |
|---|---|
| `house.ts` | The shared sizes, spacing and motion of §2.5.5 |
| `word.ts` | A short text label in the house face; the `Word` type is the word list of §1.2, so a word outside it does not compile |
| `lexicon.ts` | The glyph and word of every stat and role, and the smallest size each glyph may be drawn at |
| `button.ts` | The round button, the ribbon, the close button, the red dot, press feedback, and the two-tap button (§1.12.0 item 7) |
| `sheet.ts` | A paper panel (built from `sheet` in today's `screens.ts`), with a round close button of its own only where no screen's close button exists: a sheet opened over a flow (§1.12.0 item 6) |
| `field.ts` | A text field on a slip (taken from today's seed field in `panel.ts`); it can type a word into itself |
| `livery.ts` | The Livery element of §1.12.1: the dye, pattern and emblem swatches with their marks, shared by New Career and the paint picker. It can draw any swatch faint; a faint swatch can still be tapped, and the screen decides what a tap on it does |
| `grouped.ts` | `grouped`: a whole number with grouped thousands and a true minus sign (U+2212). Every numeral on a screen goes through it |
| `stepper.ts` | Minus button, numeral slip, plus button, with hold-to-repeat |
| `picker.ts` | A row of mutually exclusive choices |
| `slider.ts`, `switch.ts` | For Settings (built from today's settings controls in `screens.ts`) |
| `rangebar.ts` | A 0 to 100 or 1 to 20 bar showing a value or a range, with an optional tick |
| `list.ts` | A vertically scrolling list of rows: touch drag with inertia and a soft give past either end, a thin thumb, faded edges, rows far from the window hidden, and opening at or gliding to a row |
| `ticker.ts` | Counters that run a numeral, or an attribute such as a bar's length or a shape, from one value to another, and can be finished at once |
| `card.ts` | The person card: front, small and enlarged, in exact and candidate forms |
| `rose.ts` | The compass rose (§1.12.13) |
| `bubble.ts` | Uncle's portrait and speech bubble with a pointer |
| `clock.ts` | The storm clock, moved out of `hud.ts` so that `globe.ts` no longer imports the HUD |
| `settings.ts` | The settings sheet and the `Settings` type (§2.5.3 item 9) |

**Glyphs** are specified in §2.5.4.

### 2.5.3 Screens, views and the port

1. Each screen in `ui/lobby/` is a function `create(port) → { el, show(view) }`. The lobby also has `cover(on)`, which hides its bottom buttons, SAIL and the next-race slip and turns its Settings button into the close button while a screen is open (§1.12.0 item 2). The negotiation sheet's `show` takes a function from the terms being edited to its view, not a view, because every step of a stepper needs a new view.
2. Each screen has a matching **view function** in `career/views/` that takes `CareerState` (and screen arguments such as the current stop, the role whose deal is open, or the terms being edited) and returns plain data holding exactly what the screen draws: every number, name, glyph id, range and faint flag.
3. A screen draws only from its view and acts only through its port. It never reads `CareerState` and never computes a rule.
4. A screen may keep local state that no rule depends on: which card is enlarged, the terms being edited, a lifted sponsor offer, scroll position, the page of a flow.
5. `career/commands.ts` defines `Command` and `Reason` and re-exports the state types that commands and views are written in (`Role`, `Line`, `Terms`, `Focus`, `GunKind`, `Livery`). Screens import career types from it and from `career/views/` and from nowhere else in `career/`.

   View functions: `newCareerView` (the one view that takes no career state: it takes the form being edited, the rolled seed and whether a career exists, and returns the prefilled team name, which is the first name in the team list, the dyes, patterns and emblems to choose from, the livery the ship wears, and Start's faint and two-tap flags), `lobbyView` (which also carries the career seed for the settings sheet), `shipView`, `paintView`, `teamView`, `dealView`, `negotiationView` (takes the terms being edited and returns the willingness and cost), `sponsorsView`, `opponentsView`, `teamSheetView`, `planetView`, `resultView`, `offseasonView`, `paperView`.
6. **The port** is defined in `ui/lobby/port.ts` and implemented in `app/`:

```ts
export type LobbyPort = {
  send(command: Command): Reason | null;
  open(screen: ScreenName, argument?: ScreenArgument): void;
  close(): void;
  scene: {
    stop(index: number | null): void;
    wear(livery: Livery | null, emblem: number | null): void;
    planet(on: boolean): void;
  };
  chart(): Chart | null;
  marks(): PlanetMarks | null;
};
```

- `send` applies the command, saves, redraws the open screens from fresh views, and returns the refusal reason or null.
- `open` and `close` move through the screens and sheets of §1.12.0. The same file defines the names and the argument:

```ts
export type ScreenName =
  | 'ship' | 'paint' | 'team' | 'deal' | 'negotiation'
  | 'sponsors' | 'opponents' | 'teamSheet' | 'planet' | 'settings';
export type ScreenArgument = { role?: Role; person?: number; team?: number };
```

  `deal` takes the `role`. `negotiation` takes the `person` (a candidate or your own employee). `teamSheet` takes the `team`, and a `person` to open with that person's card enlarged; a link in the paper (§1.13.1) opens it this way. The other screens take no argument. New Career, the result flow and the off-season report are not opened through the port; the app shows them (§2.9).
- `scene.stop` moves the lobby camera to a Ship stop, or back to the lobby pose with null. `scene.wear` previews a livery and emblem on the anchored ship, or restores the real ones with nulls. `scene.planet` switches between the anchorage and the planet seen from space.
- `chart` returns the inked-globe data for the built planet (`Chart` in `play/player.ts`), or null while it is being prepared.
- `marks` returns what the Planet screen marks on the globe (`PlanetMarks` in `play/player.ts`): your two berths and the center and radius of the storm's first ring, or null while the planet is being prepared. `app/` computes them from the next race's `MatchSetup` and the built planet with the engine's own berth and storm functions, so the career never needs them.

7. New Career is a screen in `ui/lobby/` that takes a smaller port: `start(options)`, `close()` and `scene.wear`. It draws from `newCareerView`.
8. The HUD keeps its existing view contract, `play/player.ts`, with two additions for Uncle's bubbles at sea (§1.13.2). The HUD data carries `bubble`: the id of the sea bubble to show now, or null. The HUD is created with a callback `onBubbleSeen(id)`, called when the bubble is dismissed. `play/` chooses the bubble from what happens in the match and from the ids already seen, which `app/` passes in when the match starts; `app/` implements the callback by sending `MarkSeen` and passing the new list back. The sea bubble ids are a type in `play/player.ts`.
9. **The settings sheet** is `ui/base/settings.ts`, because both the lobby and the pause sheet at sea open it. It is created with its own port, `{ get(): Settings; set(settings: Settings): void; heard?(id): void }` (`heard` is called when a slider is let go, so that the app can play the sample sound), implemented in `app/` over `localStorage` (§2.4 item 7), and an optional pair of lobby rows `{ seed: string; newCareer(): void }`. The `Settings` type is defined in that file. Settings are not career state and changing one is not a command.

### 2.5.4 Glyphs

Glyphs carry meanings that words used to carry, so they are drawn richer than today's and every one that survives is redrawn to one standard.

1. **One format, extended.** A glyph stays a list of shapes on a 24-unit square in `ui/base/glyphs.ts`, drawn by `glyph` in `ink.ts`: hatched fills, strokes, and cuts in the paper's color. `Prim` gains one field, `ink?: 'gold' | 'green' | 'blue' | 'storm' | 'rubric'`: a shape with it is drawn in that ink whatever ink the caller asked for. There is no free-form artwork and no second glyph renderer.
2. **Color says what kind of thing it is.** A glyph uses iron and at most one other ink, fixed by meaning:

| Ink | Meaning |
|---|---|
| gold | money |
| green | healing |
| blue | the shield |
| storm | the storm |
| rubric | gunfire landing, sinking, refusal |
| iron | everything else |

3. **Outline first.** A glyph must be recognizable from its filled outline alone at its smallest size in the table below. Detail and color add to the meaning and never carry it. Shapes marked `fine` are drawn only at 40 units and above, and carry the detail.
4. **Smallest size.** No screen draws a glyph smaller than its smallest size in the table, in points on the 1180 × 820 screen. Where §1.12 calls a glyph small, it means this size. Screens draw in UI units, not points: one unit is `view.k` (`ui/base/ui.ts`), about 1.735 points on that screen, so 40 points is 23 units and 24 points is 14 units.
5. **Callers do not recolor.** A screen may draw a whole glyph faint (locked, disabled) or in red iron for a negative amount. It never changes a shape's own ink.
6. The marks in `marks.ts` that the screens use (spyglass, die, dye pot, laurel) stay as functions and follow rules 2 to 5.

**The full set.** "Redraw" means the glyph exists today under the name given and is redrawn to this standard. Every other glyph in `glyphs.ts` is deleted.

| Name | It shows | Ink | Smallest | Today |
|---|---|---|---|---|
| `part.sails` | A square sail filled by wind on its yard | iron | 40 | redraw |
| `part.rigging` | Shrouds and ratlines rising to a masthead | iron | 40 | redraw |
| `part.rudder` | A rudder blade on its sternpost, turned | iron | 40 | redraw |
| `part.hull` | A hull in cross-section with its planks | iron | 40 | redraw |
| `part.keel` | A hull from the side with the keel drawn heavy beneath | iron | 40 | redraw |
| `part.mounts` | A gun carriage with no barrel | iron | 40 | redraw |
| `part.gun` | A gun barrel seen end-on: the muzzle ring and bore | iron | 40 | new |
| `weapon.cannon`, `.scatter`, `.repeater`, `.harpoon`, `.mortar` | Each gun kind from the side, told apart by outline: one long barrel; a flared mouth; a cluster of barrels; a barbed spear on a line; a short fat barrel pointing up | iron | 32 | redraw |
| `stat.gunnery` | A gun sight laid on a ball | rubric | 40 | new |
| `stat.helm` | A small hull with a tightly curved wake | iron | 40 | new |
| `stat.nerve` | A heart | rubric | 40 | new |
| `territory` | A patch of waves with a flag planted in it. Also the Territory stat | iron | 40 | new |
| `stat.stormcraft` | A small hull riding beneath the storm's swirl | storm | 40 | new |
| `stat.lookout` | An open eye above a crow's nest | iron | 40 | new |
| `stat.shield` | A round shield with a boss | blue | 40 | new |
| `stat.healSpeed` | The heal's mallet mid-swing with three speed strokes | green | 40 | new |
| `stat.healAmount` | A hull with a large patch over a hole | green | 40 | new |
| `stat.thrift` | A coin dropping into a purse | gold | 40 | new |
| `stat.upkeep` | A hull propped on a slip under a tarpaulin | iron | 40 | new |
| `role.owner` (also "you sail it") | A hand on a tiller | iron | 40 | new |
| `role.driver` | A sailor's cap above sunglasses | iron | 40 | new |
| `role.designer` | A pair of dividers standing on a ship's plan | iron | 40 | new |
| `role.mechanic` | A caulking mallet crossed with an iron | iron | 40 | redraw |
| `ship` | A two-masted ship from the side | iron | 24 | redraw of `hud.shipsLeft` |
| `afloat` | The ship upright on a waterline with a tick-shaped pennant | iron | 40 | new |
| `heal` | A caulking mallet over a patched plank | green | 40 | new, replaces the four `item.` glyphs |
| `storm` | The storm's swirl | storm | 32 | redraw of `hud.storm` |
| `storm.holding`, `storm.closing` | The storm clock's mark: a lightning bolt in outline while the ring holds, the same bolt filled while it closes | storm | 24 | redraw of `hud.bolt` and `hud.boltFilled` |
| `gust` | Three wind strokes curling at their ends | iron | 32 | redraw of `hud.gust` |
| `target` | Three rings with a shot hole off-center | rubric | 40 | new |
| `pennant` | A long swallow-tailed pennant on a staff | iron | 40 | new |
| `table` | Three stacked rows that shorten downward, a laurel beside the top one | iron | 40 | new |
| `flag` | A square signal flag on a staff, quartered | iron | 40 | new |
| `winter` | A bare mast and yard with snow on the yard | iron | 40 | new |
| `starburst` | A star of twelve thin points | iron | 24 | new |
| `coin` | A solid coin with a heavy rim, a milled edge and a stamped star | gold | 24 | new |
| `star`, `starHalf` | A five-pointed star; the same with only its left half filled | iron | 24 | new |
| `plus` | A plus sign | blue | 24 | new |
| `tick` | A tick | iron | 24 | new |
| `cross` | A cross (the refusal and the close button) | rubric when it means refusal, iron as the close button | 24 | redraw of `menu.close` |
| `arrow` | An arrow pointing right; screens rotate it | iron | 24 | redraw of `menu.forward` |
| `counter` | Two arrows passing in opposite directions | iron | 24 | new |
| `pause` | Two upright bars | iron | 24 | new |
| `wheel` | A ship's wheel with eight spokes | iron | 24 | redraw of `menu.wheel` |
| `pin` | A map pin | iron | 24 | new |
| `hourglass` | An hourglass with the sand nearly run | iron | 24 | new |

`cross` is the one glyph whose ink the caller chooses, between iron and rubric. In §1.12 the "helm glyph" is `role.owner`, the "gun glyph" is `part.gun`, the "star-burst" is `starburst`, the "counter mark" is `counter`, the "short-balance mark" is `coin` drawn faint with a rubric `cross` over it, and the "gull glyph" on the Team button is the gull's head drawn by `gull.ts`, not a glyph.

**The glyph sheet.** The debug screen `glyphs` (§2.8.3) draws every glyph in the table and every mark of rule 6 on paper, each at its smallest size, at 40 units if that is larger, and at 64 units, with its name beneath, once inked and once faint. The agent drawing or changing a glyph screenshots this sheet with `npm run browser`, looks at the picture, and redraws until each glyph plainly shows what its row says and no two glyphs could be confused at their smallest sizes. Nobody else approves the glyphs.

### 2.5.5 House rules

Every screen takes its type sizes, spacing, sizes of shared pieces and motion from `ui/base/house.ts`. A screen uses these rather than restating them; a layout number that belongs to one screen alone stays a named constant beside its use (§2.6 item 3). All lengths are UI units (§2.5.4 rule 4).

| Type, `TYPE` | Units | Used for |
|---|---|---|
| `ribbon` | 26 | The word on a ribbon button |
| `figure` | 21 | Numerals on slips and cards |
| `name` | 14 | Names of people, teams, sponsors and planets |
| `speech` | 13 | Uncle's bubbles |
| `word` | 11 | Words from the list of §1.2 |
| `small` | 9.5 | The smallest text allowed |

| Spacing, `SPACE` | Units | Used for |
|---|---|---|
| `margin` | 16 | From the screen's edge to a piece |
| `pad` | 12 | Inside a sheet, card or button |
| `gap` | 8 | Between neighboring pieces |
| `hair` | 4 | Between a glyph and its word or numeral |

All spacing is a multiple of `STEP`, 4 units.

| Size, `SIZE` | Units | Used for |
|---|---|---|
| `slip` | 38 | Height of a slip |
| `disc` | 26 | Radius of a round button |
| `close` | 19 | Radius of the close button |
| `rule` | 3 | Inset of the inner frame line on a card or sheet |
| `corner` | 7 | Corner radius of a bubble |
| `dot` | 5.5 | Radius of the red dot |

| Motion, `MOTION` | Time | Used for |
|---|---|---|
| `sheet` | 300 ms in, 200 ms out | A sheet arriving and leaving |
| `card` | 240 ms | A card enlarging and shrinking |
| `press` | 80 ms down to 0.94 scale, 160 ms back | Every tappable piece under the finger |
| `number` | 450 ms | A numeral counting to a new value |
| `dot` | 220 ms, with a slight overshoot | The red dot appearing |
| `deal` | 240 ms, the first 100 ms after the screen opens and each next one 70 ms later | Like pieces arriving one after another |
| `fan` | 320 ms, with a slight overshoot | A hand of small cards fanning out from a stack |
| `glide` | 300 ms | A marker traveling to its new place |
| `arm` | 160 ms, from 0.9 scale | A two-tap button changing face |
| `stamp` | 280 ms, from 1.9 scale, with a slight overshoot | A mark pressed onto paper: the pin, a report's tick, an answer |
| `refuse` | 280 ms, 3 points side to side | A piece shaking its head: a faint button tapped, a stepper at its limit, a refused offer |
| `dealt` | From 0.55 scale, turned 9° | How a card of a deal starts its `deal` arrival |
| `hold` | First repeat after 380 ms, then 150 ms apart, each gap 0.86 of the last down to 40 ms; 5 steps a repeat after 26 repeats and 25 after 60 | A held stepper button |
| `tick` | 140 ms, rising 3 points | A numeral changing by a step |
| `bar` | 160 ms | A bar following the value it shows |
| `suspense` | 520 ms | The wait between an offer and its answer |
| `signed` | 1,000 ms hold | A signing staying on screen before the sheet leaves |
| `seal` | Starts 140 ms after the answer and takes 300 ms, from 2.4 scale and turned 26°, coming to rest turned 9° | The seal of a signing pressed onto the card |
| `blow` | Starts at 330 ms and takes 300 ms, to 0.955 scale and 2 points down | The card giving under the seal |
| `flourish` | Starts at 330 ms and takes 480 ms, from 0.55 to 1.65 scale | Ink spreading from the seal |
| `seated` | 420 ms, dropping 22 points, with a slight overshoot | A newly signed card landing in its seat |
| `answer` | 260 ms, swelling to 1.16 scale, with a slight overshoot | A swatch answering the tap that picked it |
| `roll` | 520 ms, hopping 9 points and turning 400°; the word lands at 300 ms and types in at 34 ms a letter | The die and the seed it rolls |
| `repaint` | 700 ms, through a midpoint lifted 0.22 toward paper | The ship in the scene changing livery |
| `wake` | 360 ms, swelling to 1.08 scale, with a slight overshoot | A button coming out of faint |
| `title` | Starts 90 ms after the sheet; the rose 720 ms, the rhumb lines 900 ms, the word 560 ms, the rule 460 ms | The game's name inking in on New Career |
| `turn` | 280 ms, a 16-unit slide | The Ship sidebar changing stop |
| `built` | An ink burst of 620 ms; the "+N" floats 26 units up over 760 ms | A build or a fit on the Ship screen |
| `painted` | The picker holds 320 ms before it closes | Repaint |
| `sway` | 1500 ms, swinging 3.2° and dying away, 90 ms between pennants | Pennants when the Sponsors sheet opens or one lands |
| `breeze` | 3400 ms each way, 0.8° | An offer that can be signed, all the time |
| `lift` | 200 ms, rising 8 units and swelling to 1.05 | An offer picked up |
| `invite` | 1100 ms each way | Empty slots while an offer is lifted |
| `flown` | 680 ms, furled to 0.16 of its width and lifted 18 units | A signed offer flying to its slot |
| `paid` | Starts 560 ms after the tap; counts up over 1500 ms and rises 24 units | What a new sponsor deal pays |
| `inked` | 300 ms with a slight overshoot, starting after 120 ms, 80 ms apart | Stars inking in on the Planet slip |
| `planet` | The camera rises in 1700 ms and falls in 950 ms; the slip arrives at 1050 ms | Opening and closing the Planet screen |
| `rows` | 280 ms and a 12-unit slide, starting after 140 ms, 30 ms apart | List rows inking in |
| `moved` | 460 ms with a 7-unit hop and a slight overshoot | Movement arrows in the standings |
| `drawn` | 460 ms, 26 ms apart | Range bars drawing out |
| `swap` | In over 340 ms from 64 units right; out over 200 ms, dropping 18 units and turning 1.6° | One team sheet replacing another |
| `chosen` | 160 ms | The outline of the row whose team is open |
| `list` | Coasting with a 325 ms time constant; 0.55 give past an end and a spring back; a glide to a row in 520 ms; the thumb lingers 700 ms | Any scrolling list |
| `landed`, `tossed` | In over 460 ms, dropping 44 units with a slight overshoot; out over 260 ms, thrown 140 units aside | A result sheet arriving and leaving |
| `ranked` | Rows dealt 150 ms apart; a place counts for 560 ms and stamps for 300 ms; a sinking punches in over 230 ms; the podium rises 190 ms apart; the points burst over 560 ms | Step 1 of the result flow |
| `ledger` | A row arrives in 240 ms and counts for 380 ms; a stamp takes 300 ms; the total lands in 360 ms and the sheet gives 3 units under it; the balance rolls for 900 ms | Step 2 of the result flow |
| `thrown` | 760 ms, two turns, growing from 0.16, ending 1.1° askew with a slap | The paper arriving |
| `printed` | 300 ms, starting after 640 ms, 110 ms apart | Headlines printing |
| `turning` | 1100 ms a turn | The ring on a faint Continue |
| `slider` | The thumb swells to 1.22 in 110 ms when grabbed and settles in 320 ms with a slight overshoot | A slider |
| `flip` | 240 ms with a slight overshoot; the track dyes over in 280 ms | A switch |
| `copied` | The tick holds 1100 ms | The seed in Settings |
| `vitals` | The lost part holds 240 ms and drains in 460 ms; the shimmer passes every 1400 ms; the plus pulses every 900 ms; a crack takes 720 ms; the throb beats every 860 ms; a numeral rolls for 420 ms | The vitals slip |
| `sea` | A pop to 1.2 in 300 ms, at most once every 1400 ms | The sea share gaining |
| `flinch` | 340 ms, 10° and 3 units | The wingman's portrait when hit |
| `pickup`, `puff` | A drop of 16 units in 520 ms with a 640 ms glint; a puff of 7 motes over 520 ms | A heal arriving and being used |
| `kick` | 220 ms, giving to 0.86 | Fire on each shot |
| `glow` | 1200 ms between 0.35 and 0.85 | Gust while on |
| `paused` | The sea dims to 0.42 in 260 ms; the release takes 650 ms; sound ducks to 0.15 | Pause |
| `leafed` | 420 ms, rising 46 units with a slight turn | A page of the off-season report lifting away |
| `ceremony` | The champion lands in 620 ms from 2.6 times its size; the laurel's stems draw in 520 ms and its leaves 34 ms apart; second and third step in 180 ms apart; your row slides in over 460 ms; the prize counts for 1000 ms | Page 1 of the off-season report |
| `season` | Cards dealt 170 ms apart; last season's outline draws in 560 ms and this season's shape grows in 700 ms; bars run for 640 ms, 45 ms apart; a strike draws in 360 ms and the card slides aside in 420 ms | Page 2 of the off-season report |
| `frost` | The glyph settles in 1000 ms; lines start 260 ms apart and each drains for 700 ms | Page 3 of the off-season report |
| `fade` | 180 ms | Anything else that appears or goes |

Rules:
1. **Faint** means drawn at `FAINT`, 0.32 of full strength, and not tappable unless §1.12 says a faint piece can be tapped.
2. **Every tappable piece** is at least 44 points across, gives the `press` feedback, and sets `touch-action: manipulation` so that two quick taps are two taps.
3. **The interface answers the hand.** Every tap gets feedback within one frame. A piece that arrives, leaves or changes state moves there rather than swapping: sheets rise, cards grow, numerals count, a marker travels to its new place, a group of like pieces arrives staggered. No motion delays a tap from taking effect.
4. **Idle motion is rare and means something is waiting:** the red dot, a deal not yet opened. Nothing else moves while the screen is idle.
5. A new timing or easing is added to `MOTION` by name, never written as a literal in a screen.

## 2.6 Code conventions

1. **No comments.** The only comments allowed are ESLint directives with their reason (`// eslint-disable-next-line rule -- why`). Names carry the meaning. History belongs in commits.
2. **US English** in identifiers, file names and on-screen text.
3. **Every number from Part 1 lives in a tuning file** and nowhere else: `sim/tuning.ts` for §1.11, `career/tuning.ts` for everything else. Formulas read from these; no literal from a Part 1 table appears in logic. The one exception is a number used only where `career/` may not be imported (the sea bubbles' timings of §1.13.2, the six sunglasses styles of §1.5.9, the layout numbers of §1.12): it lives as a named constant beside its use.
4. **Every formula in Part 1 is a named pure function** in `career/rules/` (or `sim/` for §1.11), one concept per file.
5. **Units are those of §1.1.** Do not put units in names.
6. **A ship is "it"**, in code and on screen. No gendered pronouns for ships anywhere.
7. **TypeScript strict.** No `any`, no type assertions in `src/`, no `@ts-ignore` (already enforced by lint).
8. **`apply` never throws**; refusals are codes (§2.2.3).
9. **No fixture data files.** Any state needed for a test, a debug screen or a screenshot is produced by running commands from a seed (§2.8.3).
10. **Files hold one concept.** There is no size limit.
11. **No new documents.** This plan and the README are the only docs.
12. **Deleting a feature** means deleting its files and then every use the compiler and the linter report, until both are clean. A test of a deleted thing is deleted. A test of a kept thing is kept and made to pass.

### 2.6.1 Commits

- Commit often, one logical change each.
- Subject: one short imperative line. Body: what changed and why, citing section numbers.
- Before each commit run the static checks and the test files for what you changed (§2.7.5).

## 2.7 Tests

`npm test` runs typecheck, lint, format check and every `tests/*.test.ts` with Node's test runner. Nothing in it needs a browser or a GPU. It should stay under about two minutes; if a new test would add more than ten seconds, make its match smaller, not its checks weaker. The one exception is the end-to-end test with real matches (§2.7.2), which must use full 80-ship races and costs about 30 seconds of wall-clock time.

### 2.7.1 Three kinds of rule, three kinds of test

| Kind | Examples | Test |
|---|---|---|
| Formula | stars, asking wage, score, gain, build cost, winter loss, prizes, fee, ranges, level-to-value | Exact: fixed inputs give fixed outputs, at both ends of each range and one point between |
| Algorithm | bot behavior, the policy, spawn, terrain, sea samples | Properties over a few seeds: a direction ("Gunnery 20 lands more shots than Gunnery 1"), an invariant ("no ship spawns aground"), or determinism |
| Emergent result | does a sensible team climb, does money run away | Not tested before milestone 7. The harness prints the figures (§2.8) |

Judgement (feel, look, comedy) is the user's, on the iPad.

### 2.7.2 What must be covered

- **`world/` and `sim/`:** the tests that exist, less those for deleted features. New: each physical value in `ShipSpec` changes what it should; each driver stat's direction and each trick's threshold (§1.11.8); the Gust meter (§1.11.7); heals (§1.11.5); berths by standing (§1.11.9); sea samples (§1.11.6); a match always ends; the same setup gives the same hash. Direction and threshold tests use small matches (2 to 8 ships, built with `sim/even.ts`) on a few fixed seeds; only the determinism test and one "always ends" test run all 80 ships.
- **`career/`:** every formula; every command accepted, and refused with each reason that applies to it; the policy never issues a refused command over two full seasons for all three temperaments; the true value is inside every range after every race; ageing, retirement and rookies keep the head count; winter; repossession; `CareerState` survives a JSON round trip after every command of a scripted season; the save falls back to the backup.
- **`career/views/`:** each view function, on a state produced by a scripted season.
- **End to end:** three races of a career from a fixed seed with bots at every helm and real matches, run twice in parallel workers, with identical final states. And one full season with the stand-in (§2.7.3), run twice, with identical final states.

### 2.7.3 A stand-in for results

`career/standin.ts` produces a plausible `MatchResult` from a `MatchSetup` instantly and deterministically:
With `N` ships:
- **Strength** of a ship: the mean of its nine values of §1.4.1 (top speed, `gather`, Gust capacity, turn rate, hull points, spread factor, reload factor, damage factor, aim-assist cone), each scaled 0 to 1 between its level-0 and level-100 values, plus the mean of its six driver stats over 20. The shield and heal values do not count. A ship with `hands: 'player'` counts 10 in every stat, here and in the shots and sea rules below.
- **Places** are a keyed ordering weighted by strength: each ship draws `u` and takes the time `−ln(1 − u) / strength`, and the earliest finishes first, so a ship's chance of winning is in proportion to its strength. A ship with no strength finishes last.
- **Afloat at the end:** the winner, and the winner's teammate if it has one and the teammate placed in the top `ceil(N / 8)`. Every other ship is sunk. A ship afloat has `sunkAt` and `sunkBy` null.
- **`seconds`** is 480. A sunk ship's `sunkAt` is `30 + 420 × (N − place) / (N − 1)`, rounded, so the last place sinks first.
- **`sunkBy`** for each sunk ship is a keyed pick, weighted by strength, among the ships of other teams with a better place, or null when there is none. `sinkings` are the counts that follow from it.
- **`afloatAtPhaseFour`** is true for places 1 to `ceil(N / 4)`.
- **Shots:** `shotsFired` is 100; `shotsLanded` is `round(100 × (0.1 + 0.4 × Gunnery / 20))`. `damageDealt` is 100 per sinking; `damageTaken` is 100 for a sunk ship and 50 for one afloat.
- **Sea:** sample `k` of 7 is taken at `480 × k / 8`. A team's weight at a sample is the sum, over its ships not yet sunk at that time, of `strength + Territory / 20`. Its share is its weight divided by the total of all teams' weights, times 0.8.
- **`hash`** is a hash of the rest of the result.

Its keyed draws use `'standin'` as the seed and the keys of the setup's match seed, the ship id and the field name. A ship whose `sunkAt` equals a sample's time counts as sunk at that sample. With eight ships or fewer `ceil(N / 8)` is 1, so only the winner is afloat.

Career and view tests, debug screens and screenshots use it. The harness uses it when asked (`--standin`, §2.8).

### 2.7.4 No balance numbers before milestone 7

1. Tests check direction and structure, never amounts. "Higher Gunnery lands more" is a test. "Hit rate is 62% to 68%" is not.
2. Compare extremes: 20 against 1, level 100 against level 0, over a few seeds.
3. If a direction test fails, widen that stat's range in the tuning file until the effect is plain. Do not search for a seed that passes, add a special case, or loosen the test. This is the only tuning change allowed before milestone 7.
4. The harness reports figures and never fails on them.
5. Do not change a tuning number to improve a harness figure before milestone 7.

### 2.7.5 When to run what

- **While working:** the one test file for what you are changing (`node --test tests/<file>.test.ts`).
- **Before each commit:** `npm run check` (typecheck, lint, format) and the test files for what you changed.
- **When ticking a step in Part 3:** the full `npm test`.
- Every test is deterministic. A failing test fails every time; never rerun to see if it passes.
- Never wait on a harness run to decide whether a step is done, unless that step's text or its milestone's harness check names the run.

## 2.8 The harness

`npm run sim -- <scenario> [--seed s] [--runs n] [--seasons n] [--workers n] [--standin] [--subject name] [--levels a,b] [--stats a,b] [--gunnery a,b]` runs the game headless and writes to `captures/<date>-<subject>/`. Long runs print one line per race. Every run prints a final state hash; wall-clock times are printed separately and are not part of it.

### 2.8.1 Scenarios

| Scenario | Runs | Prints |
|---|---|---|
| `duel` | Two ships, with physical values and driver stats given in the scenario file or by flags | Time to sink, shots, hit rate, the winner |
| `match` | One 80-ship race. Through milestone 2 it is built with `sim/even.ts`; from milestone 3 it is race one of a career from the seed | Length, time-to-sink median, hit rate by range, heals used, sea shares, places by standing |
| `season` | Ten races with all 40 teams on the policy | Per race: your place, balance, standing. At the end: the table |
| `career` | `--seasons n` seasons | Per season: your standing, balance, mean level, staff stars; the league's spread of balances, levels and staff stars; repossessions |
| `terrain` | Planet surveys | As today |

`duel` takes `--levels a,b` and `--stats a,b` for its two ships. `match --gunnery a,b` sails an even race whose teams alternate between the two Gunnery values and prints each side's hit rate and their ratio. A `career` run ends with the tuning figures of milestone 7 (seasons to the top 10, your standing by season, your lowest balance in the first five races, rival repossessions a season, the richest balance, and the design levels and staff stars of the top and bottom five teams); the `idle` scenario is a five-season career with your policy off.

`season` and `career` run real matches unless `--standin` is given. A real match costs about 10 s on one core, so a real season costs about two minutes. Each race's setup depends on the standings the race before it left, so one career runs on one worker; `--workers` spreads the `--runs` careers, whose seeds are `s`, `s-2`, `s-3` and so on.

### 2.8.2 Your seat in the harness

Your team is played by the policy as a sensible team (§1.10.2). Until the policy exists (step M4.7) your team sends no commands. Your ship is sailed by a bot with driver stats set in the scenario file (default 10 in every stat). A scenario file may also switch your policy off (your team then sends no commands), for the "no purchases" target of milestone 7.

### 2.8.3 Debug states

`app/debug.ts` reads `?debug` switches (used by `npm run browser`). `?debug&screen=<name>&seed=<s>&races=<n>` builds a career from the seed, advances it `n` races with the stand-in and the policy for every team including yours (§1.10.2), and opens that screen. The names are `new`, `lobby`, `ship`, `paint`, `team`, `deal`, `negotiation`, `sponsors`, `opponents`, `planet`, `settings`, `result`, `paper`, `offseason`, `glyphs` (the glyph sheet of §2.5.4, which needs no career). There are no hand-written fixture states. Three more switches change the state built: `balance=<n>` sets your balance to `n` after the career is advanced (no seed reaches debt by itself, and the red money slip needs a state to be drawn on); `signed`, at the off-season stop, finishes the stop so the lobby of the next season shows; `meter` shows the frame meter over a screen; `approach=<roles>` (a comma-separated list) sends `Approach` for a candidate of each named role before the last race, so that several deals are waiting at once. The `deal` and `negotiation` screens also read `role=<role>` (whose deal to open; the scouted role if left out). `sponsors` reads `sponsors=<n>`, which signs the first `n` offers into the slots with real `SignSponsor` commands. `opponents` reads `team=<place>` (whose team sheet is open) and `card=<seat>` (which of `owner`, `driver`, `designer`, `mechanic` is enlarged). `result` and `paper` sail the last of the `n` races and leave it unread; `result` reads `step=<1|2|3>` and `paper` reads `special` (your team is repossessed in that race, reached by owing before it). On these two screens `balance` and `sponsors` apply before the last race, so that interest and sponsor objectives show in the money. `offseason` records the last race of `races=<n>` (10, 20, …) unread and reads `page=<1|2|3|4>`; `paper` on such a state shows the season edition. The old match-end debug screen is now `screen=over`. `?debug&saved=<none|racing|unread|lobby>&seed=<s>&races=<n>` writes a state reached by real commands into the save and then launches as the real game does, one value for each launch case of §2.9.1; it takes `balance=<n>` as the debug screens do. `screen=match` reads `bubble=<id>` (a sea bubble shown) and, for the HUD's states: `paused` (the pause sheet open), `forfeit` (Forfeit armed), `left` (left-handed), `wingman` and `mate` (a teammate, and one sunk), `heals=<rarities>` (held heals), `shot` (a shot fired at a given time) and `hurt` (damage to a named ship at a given time). `negotiation` reads four more: `pick=<n>` (which candidate of the deal, from 0), `report` (buy a report on them first), `renew` (negotiate with the holder of the seat instead of a candidate), and `offers=<answers>` (a comma-separated list of `refuse`, `counter` and `sign`: offers are sent, in order, that get those answers; the helper searches for terms that really get each answer and fails, naming the person, when none do). These states are reached by sending real commands, never by writing the state. `screen=new` shows New Career with no career unless `seed=` is given, and with one when it is; `name=`, `dye=`, `pattern=` and `emblem=` then set that career's team name and livery. `screen=ship` reads `stop=<n>` (which stop to open on, from 0) and, as the one exception to reaching states by commands, `unlocked=<kinds>&progress=<n>`, which writes unlocked gun kinds and unlock progress into the state the way `balance` writes the balance (the policy playing your seat keeps moving the focus, so no seed gets there).

`npm run browser` (headless Chromium, iPad Air size) takes screenshots and reads frame cost. It adds `debug` to every query unless `--bare` is given, which opens the address as it is, so the real game can be driven; every run starts with no save. `--wait <what>` waits for a text or selector to show, across reloads, for up to `--patience` ms; `--hold <ms>` waits and takes a shot. `--from <what>` starts the next `--drag` on that element. It is never part of `npm test`. Its existing budget stands: 100 draws, 900,000 triangles and 20 passes a frame.

## 2.9 The app flow

What the app shows is decided from the saved state alone. There are no URL flags outside `?debug`, and debug needs `?debug` in the address on the dev server too. While a planet builds with nothing else to show (launch cases 2, 3 and 5, and the reload after a race), the screen is paper with a turning wheel; `index.html` paints the paper before any script runs, so a reload never flashes white.

### 2.9.1 Launch

1. Load settings and the save (§2.4).
2. **No career:** build the planet `portolan` and show New Career (§1.12.1).
3. **Phase `racing`:** build that race's planet and start its match from the beginning. This is both the normal way a race starts after New Career and what happens if the app was closed during a race: the race is sailed again from its start, with the same setup.
4. **`unread` set:** build the next race's planet and, while it builds, show the result flow (§1.12.10, §1.12.11). Its last Continue sends `MarkRead` and shows the lobby. If the app is closed during the flow, the flow shows again from step 1 at the next launch.
5. **Otherwise** (phase `lobby` or `offseason`): build the next race's planet and show the lobby.

The next race's planet is `(season, race)` in the `lobby` phase and `(season + 1, 1)` in the `offseason` phase.

### 2.9.2 One race

1. SAIL sends `StartRace` (after `FinishOffseason`, in the off-season stop); the app saves.
2. The app builds the `MatchSetup` (`career/fit.ts`) and starts the match on the planet already built for the lobby. SAIL never reloads the page: the lobby's interface fades, the anchorage dissolves into the match's arrival, which comes down from a high view to your ship, and the HUD rises.
3. The match ends (§1.11.10), with or without the Result fast-forward (§1.11.11).
4. The app sends `RecordRace`, waits for the save, and reloads the page (`location.replace` to the same address). One world is built per page; this is the only reload in the loop.
5. Launch case 4 follows.

### 2.9.3 New Career

Start calls `newCareer`, applies `StartRace` to the result, saves that state, waits for the save and reloads the page. Launch case 3 then starts race one. Opening New Career from Settings changes nothing until Start is confirmed.

---

# Part 3. The path

Seven milestones, in order. Each step is one or a few commits. The game must build and `npm test` must pass at the end of every step.

**A milestone is done when all of these hold:**
1. `npm test` passes.
2. The milestone's harness check, stated below, holds.
3. For UI work, a screenshot of each screen it touched is saved under `captures/` and matches its section of §1.12.
4. Every box of the milestone is ticked.
5. For milestones 5, 6 and 7, the user has played it on the iPad and accepted it.

Until milestone 6 the app keeps today's way in: the title, today's lobby with its seed panel, and a match started from it. The new career and its screens are reached only through tests, the harness and `?debug` until then.

## Milestone 1. Clear out

Goal: the old career, office and cut sea features are gone; what remains is today's battle royale in the new folder layout, with no comments, in US English.

- [x] **M1.1 Tags and branch.** `git tag old-main main`; `git tag pre-redesign mm`; fast-forward `main` to `mm`; create branch `captain` from it and work there. Local only.
- [x] **M1.2 Housekeeping.** Commit `docs/PLAN.md` and the deletions of `.claude/settings.json` and `docs/.gitkeep`. In `README.md`, replace the Docs line with: "**Plan:** `docs/PLAN.md` is the plan and the standing instructions. Read it first."
- [x] **M1.3 Delete the old career and office.** First save the people-name data: reduce `src/career/names.ts` to a file that holds only the tables `GIVEN_START`, `FAMILY_START` and `FAMILY_END`, the `BANNED` list and the function `allowed` (§1.13.3). Then remove the rest of `src/career/`, and `src/office/`, `src/ui/office/`, `src/ui/kit/`, `src/ui/chartroom/`, `src/store/`, `src/desk.ts`, `src/desk-fixtures.ts`, `src/manager.ts`, `src/ui/pitwall.ts` (the last user of the old kit), the career's and office's uses in `src/main.ts` and `src/debug.ts`, and `src/play/racing.ts` with whatever only it uses (the off-thread races of a career's other championships), including `racedApart` in `src/play/setup.ts`, which starts that file as a Worker by URL so that neither the typechecker nor the linter reports it missing, and its use in `src/main.ts`. Run `npm run build` before ticking this step. Remove `tools/sim/lobby.ts`, `tools/sim/managers.ts`, `tools/sim/scenarios/season.json` and the scenarios in `tools/sim/cli.ts` that use them. Remove the tests named `career-*`, `office`, `chartroom`, `views`, `store-*` and `tests/fixtures/`; for every other test apply §2.6 rule 12.
- [x] **M1.4 Delete pit stops.** `sim/pit.ts`, `sim/pitting.ts`, the `pit` mode and option in the bot, the pit input, the pit jobs in `kinds.ts`, their HUD parts and tests.
- [x] **M1.5 Delete team calls.** `sim/called.ts`, the call in the bot's weighting, the call input and its HUD parts, the `Call` type in `race.ts`, their tests.
- [x] **M1.6 Delete faults.** `sim/faults.ts` and every use of fault zones, bands and reliability, including the drawing in `ship/faults.ts`, the vitals diagram and the audio cues. Delete hull mending. Keep low-hull smoke, driven by hull share (§1.11.6 item 5).
- [x] **M1.7 Delete the campus.** `world/harbour.ts`, `world/harbour-site.ts`, `land/harbour.ts`, `play/overlook.ts`, the camera over the harbor in `play/anchorage.ts`, and the terrace cut into the planet (`planetOf` in `world/land.ts` becomes the plain terrain planet). The lobby anchorage itself stays.
- [x] **M1.8 Delete every comment.** Write a one-off script (do not commit it) that uses the TypeScript scanner to remove every comment in `src/`, `tests/`, `tools/` and the root config files except ESLint directive comments, then run the formatter. Remove the CSS comments in `index.html` by hand.
- [x] **M1.9 Remove ship pronouns.** In test titles and any remaining strings, replace "she" and "her" used of a ship with "it" and "its". Do it mechanically and fix what reads wrongly; do not rewrite titles otherwise. Rename the constant `HER` in `player.ts` to `PLAYER_SHIP`.
- [x] **M1.10 US English.** Rename identifiers, file names and strings: colour to color, centre to center, metre to meter, grey to gray, neighbour to neighbor, honour to honor, favour to favor, harbour to harbor. Take care that `metre` renames do not collide with the frame-cost `meter`. In `career/names.ts`, remove `'person'` from `FAMILY_START` (§1.13.3).
- [x] **M1.11 Move to the new layout.** Per §2.1 and Appendix A: create `render/` and `app/`, move the root files, split `ui/` into `base/`, `sea/` and `lobby/`. Move `race.ts` to `sim/race.ts` for now (step M2.3 replaces it). Move the livery list and the count of emblems to `world/livery.ts` and the storm clock to `ui/base/clock.ts` (Appendix A.3). Add the import rules to `eslint.config.js`; where a file still breaks a rule, move the shared symbol down a layer rather than loosening the rule. Add the `check` script (§2.7.5). The engine still lives in `play/` after this step; the lint rule "every rule of the match is in `sim/`" is met by step M2.1.

**Harness check:** `npm run sim -- match` completes and reports no failed check of its own. A search for comments in `src/`, `tests/` and `tools/` finds only ESLint directives. `npm run browser` still draws the lobby and a match within the frame budget.

## Milestone 2. The sim contract

Goal: the match engine is in `sim/`; a match is created from a `MatchSetup` of 2 to 80 ship specs and returns a `MatchResult`; the sea rules of §1.11 are in place.

- [x] **M2.1 Move the engine into `sim/`.** No behavior changes. Today the match is stepped by `play/state.ts`, with `play/orders.ts`, `play/result.ts`, `play/setup.ts`, `play/race.ts` and `play/indexed.ts`, mixed with building what is drawn. Split it by one rule: whatever decides what happens goes to `sim/`; whatever decides what is shown stays in `play/`. Create `sim/engine.ts` holding the stepping, with `createMatch` taking the arguments today's `createState` takes (it takes a `MatchSetup` from step M2.3), with `sim/orders.ts`, `sim/tally.ts` (the tally and `finishing`), `sim/waters.ts` and `sim/indexed.ts` beside it. `play/state.ts` becomes the adapter that steps the engine and fills snapshots and HUD data from its `view`. Afterwards `tools/` and `tests/` run a match without importing `src/play/`, and the clock ban covers all of it. **Check:** the hash printed by `npm run sim -- match` is the same before and after this step.
- [x] **M2.2 Contract files.** `sim/kinds.ts`, `sim/setup.ts`, `sim/result.ts` (§2.2.1). Add `sim/even.ts`: `evenSetup({ planet, match, storm, heals, teams?, perTeam?, values, stats, standings?, player? })` passes `planet`, `match`, `storm` and `heals` straight into the setup and returns a setup of `teams` teams (2 to 40, default 40) of `perTeam` ships each (1 or 2, default 2), where `values` (the physical fields of a `ShipSpec`, `topSpeed` to `healFactor`) and `stats` are either one set for every ship or a function of the ship index. `standings` defaults to team order: team `t` has standing `t + 1`. With `player: true`, ship 0 has `hands: 'player'`. A duel is two teams of one ship. Tests, the harness and debug states use it, and so does the app until milestone 6. Also start two career files here, because this milestone needs the numbers of §1.4.1 and §1.5.2 and §2.6 rule 3 allows them in one place only: `career/tuning.ts` holding those two tables, and `career/fit.ts` holding one pure function from seven fitted levels, a gun kind and a mechanic's Shield, Heal speed and Heal amount (or no mechanic) to the physical fields of a `ShipSpec`. The app, the harness and the tests take their level-0, level-50 and level-100 values from that function. Steps M3.1 and M3.6 add the rest of both files.
- [x] **M2.3 Matches from a setup.** `createMatch` takes a `MatchSetup` and returns the `Match` of §2.2.1; add `sim/hands.ts` and rename the touch-input type in `play/player.ts` to `Thumbs` (§2.2.1). Teams come from `ShipSpec.team`. Delete `sim/race.ts`, the race-card types and their dealing (in `sim/racing.ts` and `sim/matches.ts` since step M2.1), the free-for-all mode, `sim/fitted.ts`, and the constants `TEAM`, `TEAMS` and `SHIPS`. Keep the team functions (mates, shared water, no friendly fire). Until milestone 6 the app gives every team a livery by its index from `world/livery.ts`, and its existing way into a match (the title, the seed panel) builds the setup with `evenSetup`: the physical values, from `career/fit.ts`, of level 50 on every line with a cannon and a mechanic with 10 in every stat; 10 in every driver stat; standings in team order; and `player: true`.
- [x] **M2.4 Per-ship physical values.** Top speed, `gather`, turn rate, hull points, spread factor and reload factor come from the ship's spec, replacing the shared values in `sim/handling.ts`.
- [x] **M2.5 One gun.** Remove the second gun, gun switching, the equip delay, gun loot and the rarity tiers. Damage factor and assist cone come from the spec (§1.11.4).
- [x] **M2.6 Heals.** §1.11.5.
- [x] **M2.7 Shield.** §1.11.6 item 3.
- [x] **M2.8 Gust meter.** §1.11.7.
- [x] **M2.9 Drivers from stats.** §1.11.8: add `sim/driver.ts`; delete `sim/persona.ts` (`sim/driven.ts` went in step M2.3), the styles and seeded draws of `sim/temper.ts` (keep the parameter type), and the match types.
- [x] **M2.10 Race conditions.** Storm scaling and the two ratings (§1.11.2, §1.11.3).
- [x] **M2.11 Berths by standing.** §1.11.9.
- [x] **M2.12 The result.** Sea samples, `afloatAtPhaseFour`, the end rule and places (§1.11.6, §1.11.10); `result()` returns a `MatchResult`.
- [x] **M2.13 Harness.** `duel` runs on `evenSetup`; `match` is race one of a career since milestone 3 (§2.8.1). Remove the persona and distinctness metrics. Print the figures of §2.8.1.
- [x] **M2.14 Minimum HUD.** Remove the gun slots; show three heal slots; make Gust a toggle with its ring. Enough for the browser game to be played; the full HUD is step M5.17.

**Harness check:** `npm run sim -- match` runs 80 ships in 40 teams to an end and prints every figure in §2.8.1. `npm run sim -- duel`, with one ship given the level-100 physical values of §1.4.1 and the other the level-0 values, is won by the first.

## Milestone 3. The career core

Goal: a career can be created from a seed and played for whole seasons in the harness, with rivals that do nothing yet.

- [x] **M3.1 Skeleton.** `career/state.ts`, `commands.ts`, `apply.ts` with phases and the refusal reasons `team`, `phase`, `invalid` and `unknown`; `career/tuning.ts` (started in step M2.2) extended to hold every Part 1 number outside §1.11. Write the whole of `CareerState` (§2.2.2) now, so later steps fill fields in rather than add them.
- [x] **M3.2 Draws and names.** `career/draw.ts` (§2.3) and `career/names.ts` (§1.13.3).
- [x] **M3.3 People.** Generation, stars, ageing, asking wage (§1.5, §1.6.4).
- [x] **M3.4 `newCareer`.** The league, owners, staff with contracts, and the free agents (§1.10.1, §1.5.8, §1.8.7). Sponsors are left empty until step M4.2.
- [x] **M3.5 Points, standing, reputation.** §1.3.
- [x] **M3.6 Fit.** `career/fit.ts` (started in step M2.2): levels and staff to `ShipSpec` (§1.4.1, §1.5.2, §1.5.7); `matchSetup(state, { hands })`; the race's planet seed, planet name, match seed and ratings (§2.3). In the `offseason` phase "the race" for all of these is race 1 of season + 1 (§2.9.1), and `matchSetup` gives each team its current standing, which is the standing it holds when that race starts (§1.9). The next-race slip, the Planet screen and the port's `marks` therefore need no special case.
- [x] **M3.7 Stand-in.** `career/standin.ts` (§2.7.3).
- [x] **M3.8 `StartRace`, `RecordRace`, `MarkRead`.** With no policy yet. Of §2.2.5: steps 1, 2 (place, sinkings, sea, wages, interest), 5 (contracts), 8, 9 (without deals and offers) and 10.
- [x] **M3.9 The off-season.** §1.9 steps 1 to 3, `lastOffseason`, and `FinishOffseason`.
- [x] **M3.10 Saving.** `app/save.ts` and its two stores (§2.4).
- [x] **M3.11 Harness.** The `season` and `career` scenarios, with real matches and with `--standin` (§2.8).
- [x] **M3.12 End to end.** The two end-to-end tests of §2.7.2.

**Harness check:** `npm run sim -- season --seed test` completes ten real races and prints a table of 40 teams; running it twice prints the same final state hash.

## Milestone 4. Career depth

Goal: every rule of §1.6 to §1.10 works, and rivals play.

- [x] **M4.1 Development.** `SetFocus`, gains, unlocks, `Build`, `FitGun` (§1.7.1 to §1.7.5).
- [x] **M4.2 Sponsors.** Offers, `SignSponsor`, fees, objectives, and the rivals' starting sponsors (§1.8.5, §1.10.1).
- [x] **M4.3 Hiring.** Deals, `SetScoutSeat`, `Approach`, `Offer`, `AcceptCounter`, talks, contracts, renewing, `Release`, buying out another team's contract (§1.6.2 to §1.6.7).
- [x] **M4.4 Knowledge.** People's ranges, `BuyReport`, rival ship ranges (§1.6.1, §1.7.6).
- [x] **M4.5 Repossession.** §1.8.4.
- [x] **M4.6 `Repaint`.** §1.8.6.
- [x] **M4.7 The policy.** §1.10.2, the three temperaments derived from owners' Nerve (§1.5.6), run inside `StartRace` and `FinishOffseason`. The harness plays your seat with it.
- [x] **M4.8 News.** Every event of §2.2.4, and `career/paper.ts` (§1.13.1).
- [x] **M4.9 Harness figures.** The `career` scenario prints everything in §2.8.1.

**Harness check:** `npm run sim -- career --seasons 3 --seed test --standin` completes; every team has hired, built and signed a sponsor at least once; no command from the policy was refused. `npm run sim -- season --seed test` (real matches) still completes.

## Milestone 5. Screens

Goal: every screen of §1.12 exists and can be opened on a debug state.

- [x] **M5.1 The first two screens.** Build the lobby (§1.12.2, with its anchorage scene) and the Team screen (§1.12.4) to the finished standard on the real code path: the base pieces they need (§2.5.2), their view functions and tests (§2.5.3), the port with the screen stack of §1.12.0 and the debug screens (§2.8.3). They are drawn from a real career state (`?debug&screen=lobby` and `screen=team`, `seed=test&races=14`), never from hard-coded data. The user judges them on the iPad through the dev server before any other screen is built. Changes to §1.12 that follow need the user's approval. Steps M5.2, M5.4, M5.5, M5.7 and M5.9 then cover only what this step left.
- [x] **M5.2 Base pieces and glyphs.** §2.5.2 and §2.5.4: extend the glyph format, draw and redraw the full set, delete the rest, and add the `glyphs` debug screen. Check the glyph sheet as §2.5.4 says before ticking. The glyph half is done (the format, the set, the sheet); the `ui/base/` pieces of §2.5.2 remain.
- [x] **M5.3 Portraits.** Jacket color and six sunglasses styles from the portrait seed; Uncle's fixed portrait (§1.5.9).
- [x] **M5.4 Views.** Every view function and its test (§2.5.3).
- [x] **M5.5 The port and the debug screens.** `ui/lobby/port.ts`, its implementation in `app/` with the screen stack of §1.12.0, and `?debug&screen=` (§2.8.3); update the screen list in `tools/browser.ts`.
- [x] **M5.6 New Career.** §1.12.1. Start builds the career with `newCareer` and sends `StartRace` through the port; saving, the reload and showing New Career at launch are step M6.1 (under `?debug` Start reloads into the new career's lobby).
- [x] **M5.7 Lobby.** §1.12.2, including the two-ship anchorage scene and the orbit drag. SAIL starting the race is step M6.1.
- [x] **M5.8 Ship.** §1.12.3, including the seventh camera stop and the paint picker.
- [x] **M5.9 Team.** §1.12.4.
- [x] **M5.10 The deal.** §1.12.5.
- [x] **M5.11 Negotiation.** §1.12.6.
- [x] **M5.12 Sponsors.** §1.12.7.
- [x] **M5.13 Opponents.** §1.12.8.
- [x] **M5.14 Planet.** §1.12.9.
- [x] **M5.15 The result flow and the paper.** §1.12.10, §1.13.1. The launch path that shows the flow when a career is unread is step M6.1; until then it is reached through `screen=result` and `screen=paper`.
- [x] **M5.16 The off-season report.** §1.12.11.
- [x] **M5.17 The HUD and pause.** §1.12.14, §1.12.12. Forfeit sinks your ship at once, credited to nobody (§1.11.11), through the match's own interface; what the flow does after a forfeit is steps M6.1 and M6.2.
- [x] **M5.18 Settings.** §1.12.12. Starting a new career from Settings joins the launch flow at step M6.1; until then it founds the career and shows its lobby in the debug build only.

**Harness check:** `npm run browser` saves a screenshot of every screen name in §2.8.3 on the state `seed=test&races=14` (or the nearest state that has the screen: `offseason` needs a season's end, `result` and `paper` an unread race), and the frame budget holds on the lobby and at sea.

## Milestone 6. Joining up

Goal: the game is played from first launch through seasons by hand.

- [x] **M6.1 The flow.** §2.9: launch from the saved state, New Career, SAIL, `RecordRace`, the save queue and the reload. Team liveries now come from the career, and ships wear their team's emblem (§1.13.4) on the mainsail in place of the cross every ship wears today, in the lobby, on New Career, in the paint picker and at sea. For New Career this step saves the state `port.start` hands over, waits for the save, reloads so that launch case 3 starts race one, shows New Career at launch when no career is saved, and routes its close button to Settings.
- [x] **M6.2 After sinking.** Watch, and the Result fast-forward (§1.11.11).
- [x] **M6.3 Fire drag.** A drag that starts on Fire moves the aim (§1.12.14).
- [x] **M6.4 Uncle's bubbles** and the lobby buttons appearing in step (§1.13.2).
- [x] **M6.5 Going broke on screen.** The red money slip and the special edition (§1.12.2, §1.13.1). In debt, builds, the repaint and Report are faint and shake when tapped; SAIL, signing a sponsor and Release still work. The slip stamps red and throbs twice when the lobby comes into view, then is still.
- [x] **M6.6 Remove what the old flow leaves behind.** The title screen, the seed panel (`panel.ts`, `fleet.ts`, `play/fleet.ts`, `play/survey.ts` if nothing else uses it), the old end screens, the old lobby in `screens.ts`, and any transition code nothing uses. Gone: `app/flow.ts`, `app/address.ts`, `ui/sea/ends.ts`, `ui/lobby/panel.ts`, `ui/lobby/livery.ts`, `ui/base/passage.ts`, `ui/base/screens.ts`, `ui/base/ways.ts`, the broadside camera and the kept livery. `play/survey.ts` stays, since the lobby's preview uses it. `screen=match` and its switches run on `app/bench.ts`, which wires the game, HUD, pause and the after-sinking buttons as the real race does, so its sunk and over states show the real Watch and Result buttons.
- [ ] **M6.7 iOS.** `npm run ios` builds and runs on the iPad. Measure the reload between races; if the wait before the result flow's first step is over two seconds, tell the user.

**Harness check:** `npm run sim -- career --seasons 1 --standin` still passes, and the user has played one full season by hand on the iPad.

## Milestone 7. Tuning

Goal: the numbers. Only tuning files change in this milestone.

### Targets

| Target | Measured by | Band | At the start (M7.1) | After tuning |
|---|---|---|---|---|
| Time to sink, two ships at level-50 values, stats 10 | `duel`, median over 20 seeds | 8 to 12 s | 17.48 s | 8.8 s (8.65 s over 60 seeds) |
| Match length at a 3-star storm | `match`, median over 10 seeds | 270 to 330 s | 291.1 s | 290.6 s |
| A level-100 ship against a level-0 ship, equal stats | `duel`, 10 seeds | at least 9 wins | 10 | 10 |
| A stats-18 driver at level 30 against a stats-6 driver at level 60 | `duel`, 20 seeds | 6 to 14 wins | 18.5 | 14 (13.3 in 20 over 60 seeds) |
| Hit rate of Gunnery-20 ships over Gunnery-1 ships, in a match where teams alternate between the two | `match` on `evenSetup` | at least 3× | 2.23× (78% against 35%) | 3.46× (3.68× over 30 matches: 81% against 22%) |
| Seasons for your seat (sensible policy, stats-10 bot) to reach the top 10 from 40th | `career`, median over 5 seeds | 4 to 6 | never (never, 9, 9, never, never in 10 seasons) | |
| Your seat's standing after 5 seasons with your policy off | `career`, 5 seeds | 36th or worse | 34th, 38th, 35th, 39th, 40th | |
| Your balance in the first five races under the sensible policy | `career`, 5 seeds | never below 0 | lowest 1,634 | |
| Rival teams repossessed per season | `career`, mean over 10 seasons | 0.2 to 3 | 0.00 | |
| Richest team's balance after 10 seasons | `career` | under 300,000 | 1,040,483 | |
| Mean design level after 10 seasons | `career` | top five teams 70 to 95; bottom five teams 5 to 30 | top five 64.4; bottom five 45.9 | |
| Mean staff stars after 10 seasons | `career` | top five teams 3.5 to 4.5 | 2.79 | |

The starting figures were measured at commit `6946e2e3`. The harness sails each duel seed twice, with the two ships' places swapped, so a count of wins out of 20 seeds is half the duels won out of 40. The career figures are from stand-in results on seeds `1` to `1-5`: `npm run sim -- career --seasons 10 --runs 5 --standin`, and `npm run sim -- idle --runs 5 --standin` for the policy switched off.

### Procedure

- [x] **M7.1 Record the starting figures** for every target.
- [x] **M7.2 Tune the sea** (the first five targets), changing only `sim/tuning.ts` and the §1.4.1 table in `career/tuning.ts`. Done by two numbers: the Gun line's damage factor runs 0.6 to 4.6 (it ran 0.8 to 1.4), and a driver's aim skill runs −0.55 at Gunnery 1 to 1 at Gunnery 20 (it ran 0 to 1). The steeper damage is what lets level 60 stand against a far better driver at level 30; the lower aim is what opens the gap between Gunnery 1 and 20. Other levers were tried and did not move the targets: hull, reload, spread and keel lines, `react`, `helm`, `breakOff`, `notice`, and the trick thresholds. What it costs, for M7.3 to judge: at level 50 a cannon ball takes 52 of a hull of 140 (it took 22), a scatter's full blast or a harpoon sinks an unshielded ship of its own level from level 20 up, bots use fewer heals because fights are shorter, and a stats-10 bot lands about one shot in twenty-five on a steady ship at 100 m. Level 5 hits as it did. Six tests pinned the old numbers and follow the new ones in the same commit.
- [ ] **M7.3 The user tunes feel by hand** on the iPad: top speed across levels, turn rate, the five muzzle speeds against the new top speeds, Gust, aim sensitivity.
- [ ] **M7.4 Tune the money and the league** (the last seven targets), changing only `career/tuning.ts`. Work with `--standin` runs, which take seconds. Before finishing, confirm every one of these targets once with real matches on parallel workers.
- [ ] **M7.5 Re-check the sea targets** after M7.3 and M7.4.

Each tuning commit states in its body the figures before and after for the targets it moved. If two targets cannot both be met, or the stand-in and real matches disagree about a target, stop and ask the user. When every target is in its band and the user accepts the feel, tuning is done.

## 3.1 Known risks

| Risk | Where it bites | What to do |
|---|---|---|
| The engine split (M2.1) is the largest refactor in the plan: 1,133 lines of `play/state.ts` mix rules with drawing | Milestone 2 | Do it first and alone, with the unchanged match hash as the check. Do not change behavior in the same step |
| At 45 m/s a ship circles the 3,481 m planet in 77 s | Feel, gun lead, how fast sea is claimed | Judged in step M7.3. The planet's radius (`R` in `world/sphere.ts`) is the lever of last resort and changes terrain, spawn and storm radii |
| Muzzle speeds are literals with no link to top speed | Hit rates change when ships get faster | Step M7.3 |
| The sim assumes the player is ship 0 (`PLAYER = 0`) | Setups | §2.2.1 keeps that assumption on purpose |
| The page reloads once per race | Load time on the iPad | The result flow covers it (§2.9.1 case 4). Measured in step M6.7 |
| The Result fast-forward steps the sim on the main thread | A slow iPad | It is time-sliced (§1.11.11) and shows progress; worst case is the rest of a 480 s match |
| Weak staff pin a team's levels at the floor (§1.7.2 against §1.9 step 2) | The first seasons of a career, and the bottom of the league | By design: you climb by sailing well and hiring better. The "top 10 in 4 to 6 seasons" target decides whether the numbers allow it |
| About 50 glyphs are drawn or redrawn by an agent that cannot see while it draws | Step M5.2 | The glyph sheet (§2.5.4): the agent screenshots it and redraws until every glyph shows what its row says |

---

# Part 4. Later

These are deliberately not in the game. Do not build them.

- Part levels changing how a ship looks.
- A scout seat, or a second designer.
- More leagues, promotion, relegation or prestige resets.
- Wind affecting sailing.
- iPhone layouts, multiplayer, other languages.
- Save migrations.
- Staff morale, traits, form or injuries.
- Rival owners ageing, retiring or selling up.
- Ending a sponsor deal early.
- A penalty for closing the app during a race.
- A mail inbox, a calendar of days, headquarters buildings, a board, regulations, suppliers.
- Pit stops, team calls, faults and part reliability.
- Gun loot and gun rarity.
- A separate title screen, a single-race mode.

---

# Appendix A. The code today and where it goes

Measured on `mm` at commit `b9fbb24c`. Line counts include comments.

## A.1 Folders

| Today | Size | Fate |
|---|---|---|
| `src/sim/` | 50 files, 11.4k lines | Stays. Pure: imports only `world/`, `kinds.ts` and types from `race.ts`. Fixed step of 1/30 s. It holds the parts of a match (ships, guns, bots, storm, territory) but **not the engine that steps them** |
| `src/play/` | 28 files, 5.9k | Stays, and loses the engine to `sim/` in step M2.1. Today `state.ts` (1,133 lines) steps the match and also builds what is drawn; `orders.ts`, `result.ts`, `setup.ts`, `race.ts` and `indexed.ts` are engine code too. The rest is cameras (`chase`, `arrival`, `finale`, `shake`, `lens`, `stops`), the lobby scene (`anchorage.ts`, with a camera pose per part in `FOCI`), drawing adapters (`drawing`, `held`, `moments`, `sinking`, `colours`, `standings`), workers (`sounding`, `survey`, `preview`, `racing`) and the game loop (`game.ts`, `referee.ts`) |
| `src/world/` | 26 files, 5.2k | Stays, less the two `harbour` files. Gains `color.ts`, `livery.ts`, `environment.ts` |
| `src/ship/`, `water/`, `sky/`, `land/`, `post/`, `gunfire/`, `loot/`, `view/` | 71 files, 19.6k | Move under `src/render/` unchanged in name |
| `src/audio/` | 14 files, 3.1k | Stays |
| `src/ui/*.ts` | 34 files, 8.2k | The sea UI. Split per A.3 |
| `src/ui/kit/`, `src/ui/chartroom/` | 20 files, 2.7k | Deleted |
| `src/ui/office/` | 29 files, 7.1k | Deleted |
| `src/office/` | 30 files, 4.5k | Deleted (types between the old career and its UI, and fixture data) |
| `src/career/` | 81 files, 18.1k | Deleted except the people-name lists, then written fresh in milestones 3 and 4 |
| `src/store/` | 2 files | Deleted; replaced by `app/save.ts` |

## A.2 Root files of `src/`

| File | Goes to |
|---|---|
| `main.ts`, `address.ts`, `debug.ts`, `probe.ts`, `fly.ts`, `meter.ts` | `app/` |
| `frame.ts`, `gpu.ts`, `tsl.ts`, `palette.ts`, `load.ts` | `render/` |
| `snapshot.ts` | `render/snapshot.ts` |
| `environment.ts` | `world/environment.ts` (it imports only `world/`, and the harness uses it) |
| `colour.ts` | `world/color.ts` |
| `kinds.ts` | `sim/kinds.ts` |
| `player.ts` | `play/player.ts`; its `Hands` type (the touch input) is renamed `Thumbs` in step M2.3 |
| `race.ts` | `sim/race.ts` in step M1.11; deleted in step M2.3, replaced by `sim/setup.ts` and `sim/result.ts` |
| `desk.ts`, `desk-fixtures.ts`, `manager.ts` | Deleted |

## A.3 Splitting `src/ui/`

Derived from each file's imports on `mm`.

| Goes to | Files |
|---|---|
| `ui/base/` | `ink`, `glyphs`, `marks`, `ui`, `touch`, `drawn`, `gull`, `emblem`, `ways`, `veil`, `screens`, `passage`, `globe`, `calm`, `coasts` |
| `ui/sea/` | `hud`, `vitals`, `minimap`, `disc`, `ground`, `held`, `hits`, `flash`, `juice`, `stick`, `input`, `ends` |
| `ui/lobby/` | `livery`, `orb`, `panel`, `fleet` |
| `app/` | `flow` (it joins sea and lobby pieces), `kept` (settings storage) |
| Deleted in M1.3 | `pitwall` |

Things that must move for the import rules to hold:
- `globe.ts` imports the storm clock and a state type from `hud.ts`, and a type from `sim/storm.ts`. Move the clock to `ui/base/clock.ts`, give `globe.ts` its own input type, and take the storm's shape from `StormDraw` in `snapshot.ts`.
- The dyes (`DYES`, `COLOURS` in `play/colours.ts`, with the color constants they take from `palette.ts`), `PATTERNS`, the `Livery` type and `LIVERY` (in `player.ts`) move to `world/livery.ts`.
- `ink.ts`, `orb.ts`, `ways.ts` and `livery.ts` import from `snapshot.ts` or `player.ts`; §2.1 allows that.

Deleted in step M6.6: `panel`, `fleet`, `passage`, and whatever of `screens`, `ways`, `ends` and `app/flow` the new flow does not use.

## A.4 Facts worth knowing before you start

- **Imports that cross the new boundaries today:** `water/` imports `sim/wake.ts` and `sky/` imports `sim/storm.ts`. Both are allowed (§2.1 lets `render/` import `sim/`). Render folders import nothing from `play/`, `ui/` or `audio/`, and neither `ui/` nor `play/` imports three.js.
- **Running a match headless today** goes through `play/`: `tools/sim/match.ts` calls `createMatches` (`play/setup.ts`), `raceOf` (`play/race.ts`) and `createState` (`play/state.ts`).
- **Teams in the sim** are an array of team ids indexed by ship (`teamsOf`); nothing in `sim/` depends on four ships to a team. `TEAM = 4` and `TEAMS = 20` are in `race.ts` and are used by `play/race.ts`.
- **Per-ship values** exist today as `Handling { top, turn, reload, gather, spread }` plus `Health.most`. Milestone 2 extends this.
- **Guns:** five kinds with a per-kind table (`GUNS` in `sim/handling.ts`). A ship carries two today, with three item slots (`sim/hold.ts`). Muzzle speeds are literals in that table.
- **The aim assist** is in `sim/gun.ts`: it picks a target inside the cone and leads it. Bots use it too, which is why §1.11.8 switches its lead off below Gunnery 8.
- **A bot's parameters** are the `Temper` type in `sim/temper.ts` (fight, notice, run, margin, standoff, loot, claim, skill, gunnery, helm, lookout and more), read by about ten sim files. Today they come from six styles plus seeded draws, or from a driver's stats through `sim/driven.ts`. §1.11.8 keeps the type and replaces where the values come from.
- **The shield** refills wherever the ship is, at `HOLDING.shield` (4.5 a second) scaled by the share of the sea inside the ring that the team holds, reaching the full rate at `HOLDING.full` (1%) (`sim/holding.ts`, `sim/handling.ts`).
- **The storm** is `sim/storm.ts`: seven phases closing to 800, 480, 320, 220, 150, 110 and 75 m; waits and closing times total 458 s.
- **The match ends** 180 s after the last phase closes at the latest (`sim/carded.ts`); a storm sinking is credited within 8 s (`sim/match.ts`).
- **Spawn** is `sim/spawn.ts`: a lattice of berths, farthest-first, then relaxed.
- **Random:** `world/random.ts` has `random(seed)` (a stream), `hash(a, b)` and `hash01(a, b)`, each taking two numbers. `world/seeds.ts` has `seedOf(text)` (text to a number) and `rolled(u)` (a random seed word).
- **Liveries today:** 16 dyes × 3 patterns; the player's is kept in `localStorage` and bots are dealt the rest by seed (`play/colours.ts`).
- **The world is built once per page** (`main.ts`), and a new planet means `location.replace` (`address.ts`). §2.9 keeps this.
- **The match already records** who sank whom and shots fired, landed and dealt.
- **Pit stops are referenced in about 20 files and faults in about 21.** Delete by feature and follow §2.6 rule 12.
- **The old career's ideas worth reading before deleting it:** `career/market.ts` (scoring an offer against ranked wants), `career/sponsors.ts` (objectives), `career/names.ts` (the name data that is kept), `career/dice.ts` (seeded streams; the new career uses keyed draws instead).
