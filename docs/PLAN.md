# Portolan: the balance plan

This plan replaces the redesign plan, which is done apart from the items in §8. The old plan is in git history: `git show b2f14ee9:docs/PLAN.md`. The code is now the record of the game's rules: every formula is a named pure function in `src/career/rules/` or `src/sim/`, and every number is in `src/career/tuning.ts` or `src/sim/tuning.ts`.

## 0. How to use this plan

1. Do the steps of §7 in order. Tick a box in the same commit that finishes it.
2. If a step cannot be done as written, or two sections disagree, stop and ask the user.
3. **Never push, and never delete remote branches, unless the user asks.** Work on `captain`. `main` stays untouched; `captain` is rebased onto it at the end, so no merge commits.
4. Nothing here is tuned by running careers. Every number is either one of the chosen numbers of §3.1 or is derived from them by a formula written in this plan. The check is §6: unit tests of the identities.
5. The gates run before every commit: `npm run check`, `npm test`, `npm run build`. `npm run browser -- --budget` runs before the last one.

## 1. What was wrong

Worked from the old formulas, per race, with sea money, sinkings and sponsor bonuses left out:

| Standing | Income | Stars that staff expect there | Wages for three such staff |
|---|---|---|---|
| 1 | 16,400 | 5.0 | 22,500 |
| 10 | 10,300 | 3.85 | 10,200 |
| 20 | 5,100 | 2.56 | 3,000 |
| 30 | 1,700 | 1.28 | 390 |
| 40 | 306 | 0 | 30 |

1. **The curves had four unrelated shapes.** Prizes rose with the square of place, sponsors with the power 1.5, wages with the cube of stars, and the stars a person expects ran in a straight line. They crossed only near 10th.
2. **The top could not spend what it earned.** The top teams held 2.84 stars, about 4,100 a race in wages against 16,400 earned. The richest team stood at 1.38 million after ten seasons.
3. **The bottom could not climb.** 40th earned 306 a race and three 1.5-star staff asked 600. A 1.5-star designer gained 7 levels a season on an unfocused line and winter took 10.
4. **The pool had no top people.** Free agents and rookies were drawn at levels 3 to 17, about 2.5 stars on average, so no price could make the top hold 3.5.
5. **Two things were set by a name, not a number.** A team's spending came from one of three temperaments, and every sponsor objective paid the same bonus however hard it was for that team.
6. **Seven targets were chosen one by one and then searched for.** About 750 settings were tried; none met all seven, two of them pull against each other, and the quick result model was noisier than what it measured.

## 2. What was decided

| | Decision |
|---|---|
| 1 | One rule replaces the seven career targets: **at every standing, income covers the wages and upkeep expected there, plus a margin.** The wage, prize, sponsor and build curves are derived from one income curve. |
| 2 | The shapes of the formulas may change, not only their constants. |
| 3 | Balance is by numbers and formulas. A category (a role, a gun kind, an objective) may name a thing; it never carries a hand-picked balance number. |
| 4 | Nothing is tuned by running careers. Acceptance is unit tests of the identities (§6). The gates still run, and one short career is run once at the end only to see that nothing breaks. |
| 5 | The climb is not a target. It has a closed form (§3.5), and its feel is the user's to judge by playing. |
| 6 | Temperament becomes a function of the owner's Nerve (§3.10). |
| 7 | Some sponsors pay more than others, always the same ones, and an objective's figure follows the team's reputation (§3.8). |
| 8 | Winter takes 20% of a level, not 30%: slower arcs, longer dynasties, a gentler winter. |
| 9 | This plan replaces the old one. |

## 3. The model

### 3.1 The chosen numbers

These are the only numbers chosen by hand. They live in one block, `ECONOMY`, in `src/career/tuning.ts`.

| Name | Value | Meaning |
|---|---|---|
| `income.floor` | 1,000 | income a race at merit 0 |
| `income.rise` | 15,000 | added at merit 1, so the top earns 16,000: sixteen times the bottom |
| `income.power` | 2 | the one exponent |
| `shares.place` | 0.40 | of income, paid by a ship's place |
| `shares.season` | 0.20 | paid as the season prize |
| `shares.sponsors` | 0.30 | paid by three sponsors |
| `shares.deeds` | 0.10 | paid for sea held and sinkings |
| `wages` | 0.50 | of income, asked by three staff of the expected stars |
| `levelCost` | 0.01 | of a race's income, for one level |
| `parTop` | 90 | the level expected at merit 1 (the floor is level 5) |
| `winter` | 0.20 | of a design level above the floor, lost each winter |
| `winterFitted` | 0.20 | the most a fitted level loses on top of that |
| `focus` | 2 | how many times faster the focused line gains |
| `met` | 0.5 | the share of races in which a team at par meets an objective |

### 3.2 Merit

Merit is a number from 0 to 1. Four things have one:

| Of | Merit |
|---|---|
| a reputation or standing `r` (1 to 40) | `(40 − r) / 39` |
| a ship's place `p` (1 to 80) | `(80 − p) / 79` |
| a star count `s` (0 to 5) | `s / 5` |
| a level `d` (5 to 100) | `(d − 5) / 85`, which passes 1 above level 90 |

The stars a person expects (`expected reputation = 40 − 39 × stars / 5`) is the same line read the other way, and does not change. **Par** for a merit `v` is `5 × v` stars and level `5 + 85 × v`.

### 3.3 Income

`income(v) = 1,000 + 15,000 × v²` a race. Its four parts:

| Part | Formula | Was |
|---|---|---|
| Place prize, per ship | `0.40 × income(merit of place) / 2` = `200 + 3,000 × u²` | `3,000 × ((81 − place) / 80)²` |
| Season prize | `0.20 × 10 × income(merit of final standing)` = `2,000 + 30,000 × v²` | `60,000 × ((41 − standing) / 40)²` |
| Sponsors | §3.8 | |
| Sea held | `seaPrize × mean share`, `seaPrize = 0.05 × league income` = 12,128 | 40,000 |
| Sinkings | `0.05 × league income / 79` = 154 each, rounded | 150 |

`league income` is the sum of `income` over the 40 standings: 242,564 a race. The two deeds are set from league totals (all the sea is one whole; a race has at most 79 sinkings), not standing by standing, so the income identity is exact for 90% of income and holds across the league for the other 10%.

### 3.4 Wages

`ask = 0.50 × income(merit of stars) / 3 × f` = `(167 + 100 × stars²) × f`, rounded to the nearest 10. `f` is the person's wage factor, 0.7 to 1.3, as before.

| Stars | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| Was | 10 | 60 | 480 | 1,620 | 3,840 | 7,500 |
| Now | 170 | 270 | 570 | 1,070 | 1,770 | 2,670 |

Three staff of par stars therefore ask half of income at every standing. The highest asking wage is 3,470 and the most ever needed to sign is 2.5 times that, 8,675, so the offer ranges stand.

### 3.5 Development and winter

- **Gain per race:** `design[line] += rate × skill`, capped at 100. It no longer slows as the level rises.
- `rate` for an unfocused line is derived: `winter × 85 / (10 races × 20)` = 0.085. For the focused line it is twice that, 0.17.
- **Winter, design levels:** `level = 5 + (level − 5) × (1 − 0.20)`.
- **Winter, fitted levels:** the same with `0.20 + 0.20 × (1 − Upkeep / 20)` in place of 0.20, and 0.40 with no mechanic. A fitted level never ends above its design level. The mechanic's Upkeep no longer protects the designs; it saves refitting.

**The steady level.** Ten races of gain equal winter's loss at `level = 5 + 4.25 × skill` on an unfocused line. A designer of par stars (`skill = 20 × v`) therefore holds exactly the par level, `5 + 85 × v`. The focused line holds twice the height, capped at 100.

**The climb.** A team moves toward its steady level by the winter share each season: after `n` seasons it has covered `1 − 0.8ⁿ` of the gap. That is 59% in 4 seasons, 74% in 6 and 89% in 10. This is where the old "top 10 in 4 to 6 seasons" target went.

Unlocking a gun kind does not change.

### 3.6 Building

One level costs 1% of a race's income at the merit of that level: `income(merit of level) / 100`. A build from fitted `f` to design `d` is the sum of its levels:

`cost = ceil((10 × (d − f) + 4,250 × (m(d)³ − m(f)³)) × (1 − 0.02 × Thrift))`, with `m(x) = (x − 5) / 85`.

It was `30 × (d − f) × (1 + d / 25)`. The new cost is the same whether a gap is built in one step or several, apart from the rounding up of each step. One line from 5 to 90 costs 5,100; both ships on all seven lines cost 71,400, about four and a half races of the top's income. `FitGun` keeps its minimum of 200.

### 3.7 The budget at every standing

With par staff, before Thrift:

| Standing | Income a race | Wages | Refitting winter's loss | Margin |
|---|---|---|---|---|
| 1 | 16,000 | 50% | 20% | 30% |
| 10 | 9,876 | 50% | 18% | 32% |
| 20 | 4,945 | 50% | 14% | 36% |
| 30 | 1,986 | 50% | 9% | 41% |
| 40 | 1,000 | 51% | 0% | 49% |

The margin is what a team chooses with: a person above its station, a break clause, a fee, a report, or the bank. The bottom keeps half its income free and the top under a third, so the bottom can climb and the top can bank at most about 48,000 a season.

When the budget split was agreed its figures were 35% and 15% at the top. They were worked at a winter of 30%; at the 20% chosen later they are 20% and 30%.

### 3.8 Sponsors

1. **Wealth.** Each sponsor in the roster has a wealth from 0.8 to 1.2, a keyed draw from the career seed and the sponsor, the same for the whole career. It replaces the draw made for each offer. The same names always pay more, and you can learn them.
2. **Fee.** A slot is worth a third of the sponsors' share, and at par an objective is met half the time with a bonus of twice the fee, so `fee = 0.30 × income(v) / 3 / (1 + 2 × 0.5) × wealth` = `(50 + 750 × v²) × wealth`, rounded to the nearest 10. It was `(100 + 1,400 × v^1.5) × f`.
3. **Bonus:** twice the fee, as before.
4. **Objectives carry a figure**, set when the offer is dealt from the team's reputation, and kept for the life of the deal:

| Objective | Met when | Figure | Was |
|---|---|---|---|
| `place` | either ship places in the top `N` | `N = ceil(2 × reputation) − 1` | top 10 |
| `sinkings` | the team is credited with `N` or more | `N = max(1, round(4 × v))` | 2 |
| `sea` | the mean share is `N`% or more | `N = max(1, round(5 × v))` | 3% |
| `bothAfloat` | both ships are afloat when the fourth storm phase finishes closing | none | the same |

The figures are par: a team's better ship is expected at place `2r − 1`; the 79 sinkings of a race and the whole sea are shared out in proportion to merit, and the merits sum to 20. `bothAfloat` is left fixed because the result carries only that one fact; scaling it needs a change to the sim's contract.

5. `Sponsor` gains a `target` number and the objective names `top10` and `sinkTwo` become `place` and `sinkings`. The state changes shape, so `VERSION` becomes 2 and an older save is treated as no career.

### 3.9 People and the league's start

| | Was | Now |
|---|---|---|
| Free agents' level | 3 to 17 | 2 to 20 |
| Rookies' level | 3 to 17 | 2 to 20 |
| A rival's first staff, team of merit `v` | `4 + 12 × t ± 2` | `2 + 18 × v ± 2` |
| A rival's first design levels | `10 + 70 × t ± 8` | `5 + 85 × v ± 8` |
| A rival's first balance | `2,000 + 30,000 × t` | two races of its income |
| Gun kinds unlocked | `floor(4 × t)` | `floor(4 × v)` |

`v` is the merit of the team's generated standing, which replaces the separate strength `t`. A level is a peak; a young or old person's current stars are below it, so the pool matches par by its range and not by an identity.

Your start does not change: balance 1,500, every level 5, no staff.

### 3.10 The policy

With `n = (Nerve − 1) / 19`:

| | At Nerve 1 | At Nerve 20 | Was |
|---|---|---|---|
| Build when a gap is at least | 12 levels | 5 | 12, 8 or 5 |
| Spend at most this share of the balance | 0.25 | 0.60 | 0.25, 0.40 or 0.60 |
| Keep this many races of wages | 6 | 3 | 6, 4 or 3 |

Each runs in a straight line between its ends. Team 0 under the harness has Nerve 10. The three temperament names and the three Nerve bands are deleted.

The policy's choice of focus was `skill × (1 − design / 110) × w`. With no slowing it is `skill × w`.

### 3.11 What does not change

Points, standing, reputation, the people's wants and the negotiation score, contracts and release, reports and approaches and their costs, repaint, interest, repossession at −10,000, your start, gun unlocking, the reserve rule, and everything at sea.

## 4. Where it lives

1. `src/career/tuning.ts` holds `ECONOMY` (§3.1). These groups lose the numbers that are now derived: `RACE_MONEY` (prize and sea figures), `SEASON_PRIZE`, `SPONSORS` (base, top, power, factor and the three fixed figures), `WANTS` (the three ask numbers), `BUILD` (level and scale), `WINTER`, `GAIN`, `LEAGUE_START`, `POLICY` (the three temperaments), `OWNERS` (the three bands).
2. `src/career/rules/money.ts` holds the anchor: the four merits, `income`, `leagueIncome`, and par. Every other rule calls these. No rule file writes its own curve.
3. A derived constant is computed from `ECONOMY` where it is used, never typed in as a number.
4. The layering does not change. The sim knows nothing of this.

## 5. What the player sees

1. Sponsor offers show their figure: "top 37", "3 sinkings", "2% of the sea".
2. Wages, fees, prizes and build costs are different numbers in the same places.
3. The off-season report shows winter's loss, which now differs between a design and its fitted level and grows with the level.
4. An older save starts a new career.

## 6. The tests

Each is a unit test of pure functions over all 40 standings or all levels. A test that pinned an old figure is rewritten to state the identity it now follows; no test is weakened or deleted without a replacement.

1. The four income shares sum to 1, and the four merits run from 0 to 1 at their ends.
2. Two ships at a place's merit earn `0.40 × income` in place prizes; ten races of the season share equal the season prize.
3. Three people of par stars at wage factor 1 ask `0.50 × income`, within rounding.
4. Three sponsors of wealth 1, each met half the time, pay `0.30 × income`, within rounding.
5. The sea prize is `0.05 × league income`, and 79 sinkings pay the same, within rounding.
6. Ten races of unfocused gain from a designer of skill `20 × v` equal winter's design loss at par.
7. A build's cost is the same in one step as in two, within the rounding of each step; one level at level `d` costs `income(merit of d) / 100`, within the curve's change over that level; the cost falls by 2% a point of Thrift.
8. After winter no fitted level is above its design level, for every Upkeep and for none.
9. Refitting winter's loss with par staff, plus par wages, leaves a margin of at least 0.29 at every standing.
10. The par figures of `sinkings` and `sea`, before rounding, sum over the 40 standings to 79 and to the whole sea, within 2%.
11. The policy's three means move in one direction as Nerve rises, and meet the table of §3.10 at Nerve 1 and 20.
12. `tests/exports.test.ts` still passes: nothing is exported that no other file uses.

## 7. Steps

- [x] **B1. The anchor.** `ECONOMY`, the four merits, `income`, `leagueIncome` and par, with test 1.
- [x] **B2. Income.** Place prize, season prize, sea prize and sinking money from the anchor. Tests 2 and 5.
- [x] **B3. Wages.** The asking wage from the anchor. Test 3.
- [x] **B4. Development.** Gain, the two winter shares, the build cost, the policy's focus value. Tests 6, 7, 8 and 9.
- [x] **B5. Sponsors.** Wealth, fee, figures, the `target` field, the two renames, `VERSION` 2, the sponsor view and the Sponsors screen. Tests 4 and 10.
- [x] **B6. People and the league's start** (§3.9).
- [x] **B7. The policy's means** (§3.10). Test 11.
- [ ] **B8. Clear out.** Delete every number and name this plan made unused. Remove the old plan's section marks (`§`) from the test names and from the ESLint message. The harness's `career` scenario keeps printing its figures; nothing judges them.
- [ ] **B9. See that nothing breaks.** The gates and the browser budget. One two-season career with the quick result model: it finishes, no rival command is refused, no figure is not a number. One browser drive through a race, the result flow and the Sponsors screen, with shots saved.

## 8. Before the rebase onto `main`

These are the old plan's open items that are not balance:

- [ ] **The real iPad.** One full race and result flow on the device. The simulator shows blank parchment; the cause is not known.
- [ ] **Feel, by the user's hand:** top speed across levels, turn rate, the five muzzle speeds, Gust, aim sensitivity. Then the five sea targets are measured once more.
- [ ] **One season played by hand** on the new numbers.

Open decisions carried over, none blocking: whether to keep the steep sea damage line (its revert is `a364806b`); bots healing in the storm; the 30-second storm warning; teammates colliding; a single close button; the `balance` debug switch; Uncle's scouting line; the New Career sheet on a 16:9 phone; dead-end inlets; the harpoon's base spread; Mounts above level 89; the sounds have not been judged by ear.

## 9. Conventions no tool enforces

1. No comments in code, apart from an ESLint directive with its reason.
2. US English, metric units. A ship is "it".
3. A commit message is one sentence that states what is now true. Commit often.
4. Files hold one concept. Rules are grouped by subject, one file a subject. No file exists only to hold one small function that a single caller uses.
5. Every formula is a named pure function, and every number has a name in a tuning file.
6. The UI stays rich: every screen is drawn in the house style, answers a touch at once, and is checked in the browser before it is called done.
7. Screenshots for the user go to `~/Downloads/portolan-screens/`, numbered.

## 10. Assumptions that are not measured

1. A team at par meets an objective in about half its races. At the two ends of the table this is not so: the champion must win to meet `place`, and the last team needs only not to be last.
2. All the sea is held by someone, and sea and sinkings fall to teams in proportion to merit.
3. The rivals' policy was written for the old numbers. It is not retuned. It may bank more or less than intended.
4. A team's standing follows its levels and staff. Nothing here checks how strongly.
