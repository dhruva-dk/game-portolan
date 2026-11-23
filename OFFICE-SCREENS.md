# Office screens: the plan

Every office screen redrawn on the chartroom kit (`src/ui/chartroom/`, UI-TOKENS.md), every piece of the career's
business logic given a screen, and the old kit deleted. The battle HUD stays as it is (SVG on `ink.ts`).

## Decided (owner, 2026-11-23)

- **Redesign each screen**, not a port. For each, one prototype: the one judged best. The owner gives feedback, then
  approves.
- **A prototype is the real screen** on the kit, drawn from a fixture (`src/office/fixtures/`, `?screen=<name>`), shown
  as headless Chromium captures at 1180 × 820. Nothing is thrown away; approval wires it to the live view.
- **Reviews never stall the work**: the next screen is built while one is in review.
- **The missing glyphs are drawn here**, as woodcuts in `glyphs.ts` (D9). No second icon set.
- **Every piece of business logic has UI.** A command no control sends, or state no view shows, is a gap.
- **The result screen takes the podium.**
- **The old kit is junk**: `src/ui/kit/`, `OFFICE`, and the old screens get no fixes; deleted at the end.
- **Rebase onto main once, at the end** (no work is being done on main).
- **Headless Chromium is the check.**

## How a screen is checked (before it is called built)

1. `npm test`: the tokens test, and `tools/layout.ts` on every kit screen's fixture (frame, pixel, centre, inside,
   inset). A new screen joins `layout.ts`'s list when it is built.
2. `node tools/career/play.ts --tour`: the live career through it, real data, no page errors.
3. Its 2× capture (`tools/capture.ts`, the iPad's density), looked at last: measured first, judged second.
4. A fault found by eye becomes a rule: a check that fails on the old code and passes on the fix. A fault in a kit
   piece is fixed in the kit, not the screen.

## Gaps found (career logic with no UI, 2026-11-23)

| Gap                                                                                            | Where                                                                   | Goes to             |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------- |
| `Vote`, `Lobby` never sent; proposals, this season's and next season's rules in no view        | `office/command.ts:138`, `career/admiralty.ts`, `state.ts:180`          | Admiralty (new)     |
| The strip's Admiralty chip opens nothing                                                       | `ui/office/shell.ts:160`                                                | Shell               |
| `ChooseSupplier` never sent; supplier cards and window in no view                              | `career/suppliers.ts:181,198,282`                                       | Suppliers (new)     |
| Race plan fixed: drivers as they stand, `parts: []`, sponsor objective 0; `Forfeit` never sent | `career/office.ts:433`                                                  | Race day            |
| Can't design for next season (`forNext` false); next season's parts hidden; no part risk shown | `ui/office/yard.ts:655`, `career/papers.ts:339`, `office/papers.ts:114` | Ship                |
| A sponsor offer's sign check looks at slot 0 only, though three slots are offered (bug)        | `career/papers.ts:159`                                                  | Sponsors            |
| `DeclineJob` never sent; Continue takes the best post unasked                                  | `ui/office/career.ts:75`, `manager.ts:158`                              | Jobs                |
| Rivals: managers' personalities and moves, their teams; standings rows lead nowhere            | `career/rivals.ts`, `leadership.ts`, `ui/office/standings.ts`           | Rival (new)         |
| Chairman's temper, own budget and debt floor, sacking rules, team reputation and marketability | `career/chairmen.ts`, `reputation.ts`, `views.ts:210`                   | Board (new)         |
| Season's end (prize money, promotion, relegation, retirements, the new intake) only as letters | `career/season.ts`, `round.ts`                                          | Season review (new) |
| Dead builders: `views.ts` `homeView`, `racePanel`, the `tier` blocker                          | `career/views.ts`, `desk.ts:73`                                         | Reuse or delete     |

## Links: one game, not a stack of spreadsheets (2026-11-23)

As in MM, every named thing on every screen opens its own page: a driver their profile, a team its page, a planet
its round. So a view never hands a screen a bare name: each name comes with what it names (its ref), and a screen
draws every ref as a link (one kit piece). A name with no ref is a gap, like a command no control sends.

How: `link(text, go)` (`src/ui/chartroom/controls.ts`) sets a name in the act ink; alone it takes its own tap, in a
table the row takes it (`tap`), the bigger target. `src/ui/office/links.ts` holds the ways to each page
(`toPerson`). `tools/layout.ts` fails a link that opens nothing (dead) and a row that opens a page with no name drawn
as a link (unmarked); `play.ts --tour` follows one (a rival's driver in Standings to their profile).

| Thing                                     | Opens                             | Ref in the views now                    | Needs                                               |
| ----------------------------------------- | --------------------------------- | --------------------------------------- | --------------------------------------------------- |
| A person (driver, staff, scout, chairman) | Profile (built)                   | every built screen, linked (2026-11-23) | mail's senders and subjects (Mail)                  |
| A team                                    | Rival: its manager and team (new) | `id` on every `Team` (2026-11-23)       | Rival; then every team name linked                  |
| A championship                            | Standings at that championship    | none                                    | its tier wherever it is named (the bar, Home, mail) |
| A planet, a round                         | Calendar at that round            | a name                                  | its round on Home's next race, results, the bar     |
| A part, a building                        | Ship, HQ at it                    | in the yard only                        | ids on Home's work under way, mail links            |
| A sponsor, a supplier                     | Sponsors, Suppliers at it         | none                                    | ids on Finances' ledger lines, mail                 |
| A rule, a proposal                        | Admiralty at it                   | none                                    | ids on mail's vote letters, the bar's chip          |

What the career does not keep, that a coherent office needs:

- **Last round's standings**: places gained and lost (▲▼) on Standings and Home.
- **Each round's results, the season through**: a team's and a driver's form (Rival, Profile).
- **The chairman's target place for her team**, on Standings beside where she stands (Home has it; Standings
  should).

## The screens: 24 and the shell

Each line: built on the kit from a fixture → in review → approved and live. Additions are the gaps above.

### 0. Shell and Home

- [x] **Shell** _(approved 2026-11-23, `5983c689`)_: top bar (team, back and forward, title plate, balance, standings, next
      race, Admiralty, bell), nav (13 tabs, sunk band, chosen gilt), date and Continue as the gilt banner at the right
- [x] **Glyphs for the 13 tabs**, the Admiralty, the bell, forward
- [x] **Home** _(approved 2026-11-23)_: next race (its planet in the brass port, the season's rounds), the chairman, her ship
      through a brass-framed window under her team's plate, her drivers, the team against the grid, the news, the
      standings (heads fixed, her row in view), the work under way

### 1. Rosters

- [x] **Drivers** _(approved 2026-11-23)_, after MM 005: a card a ship (post, portrait, stars and potential, morale, the ship's mechanic and their bond by levels, the contract, traits, Renew shut with its reason), the reserve and the market in the last column
- [x] **Staff** _(approved 2026-11-23)_, after MM 007: the four mechanics a row, each wearing its role's woodcut, their chemistry with the ship's driver; the designer, the scouts, an open post's Find, the market
- [x] **Team** _(approved 2026-11-23)_: the ledger: wages a race against income, the chairman, open posts; everyone on the books ruled by role; the pit crew and each ship's stop
- [x] **Scouting** _(approved 2026-11-23)_, after MM 009: the search (role, championship, contract, scouted only, stars at least) and her scouts under the crow's nest (on whom, days to report, Cancel; Find a Scout while there is room); the market or her shortlist, a star a row to keep them (the shortlist was in the view but never filled: `favourite` asks now)

### 2. Ledgers

- [x] **Finances** _(approved 2026-11-23, the ledgers' pathfinder)_, after MM 013: the purse (the balance, the chairman's floor
      under it, the room to spend), what a race brings and costs, netted, where the season will end on what is signed
      (races left, place now, its prize); the balance's course this season, by days, dotted on to the season's end, the
      floor ruled under it; the transactions; this season's money by what it was for, netted (floor, projection and the
      season's sums never shown before)
- [ ] **Standings** _(in review)_, after MM 016: the three championships to choose among (hers first shown), its
      plate, the season's rounds, its prize fund, the leaders, her place and its prize, her drivers' places, which
      places go up and down and where to; its teams or its drivers, a broad table (prize at each place and where the
      season's end would move a team, never shown before). Rows open Rival once it is built
- [ ] Sponsors (+ the slot fix) · [ ] Calendar ·
      [ ] Mail (+ glyphs for mail kinds; a vote letter opens Admiralty)

### 3. People

- [x] Profile (layout A, chosen 2026-11-22)
- [x] **Negotiation** _(approved 2026-11-23, the people's pathfinder)_, after MM 011: the person and their patience as pips, the
      talks (the last answer, those before, who else is talking); the terms, each control beside what they ask or counter,
      the bonus terms with the break clause (never shown before); what they expect, each met so far; the cost and the
      ways on
- [ ] Jobs (+ decline) · [ ] Player

### 4. Race day

- [x] **Result** _(approved 2026-11-23, race day's pathfinder)_, after MM 042–044: the podium under the race's name (the first
      three over their woodcut plinths, the winner's gilt, each with their team and points), then how every ship
      finished (the podium ruled off, her lines gilt); the team report (a line a driver: what they did, their place and
      points) and the chairman (the place expected, where the team stands, the verdict stamped)
- [ ] Plan (+ parts for the race, each sponsor's objective, forfeit)

### 5. The yard

- [ ] Ship (+ design for next season, next season's parts, risk) · [ ] Suppliers (new) · [ ] HQ
- [x] **Glyphs for the 6 parts and 9 buildings** _(approved 2026-11-23)_: `part.<type>` (a bellied sail on its yard, a block, the
      rudder on its stock, the hull broadside, the keel laid down with its frames, a swivel's yoke) and
      `building.<id>` (the sawtoothed shed, a set square and ship's curve, a model in the tank, the crucible pouring,
      a book open, a hammock, the crow's nest, a fish, the pier and its bollard)

### 6. Bare

- [x] **Main menu** _(approved 2026-11-23)_, after MM 047: the mark on its plate; New Career (her ship through a brass-framed
      window) and Single Race (the planet, still), each a woodcut head over its picture and its plate; Continue (the
      career kept: its emblem, team and date; shut with none kept) and Preferences as strips
- [x] **Found** _(approved 2026-11-23)_, after MM 048–050: the making in four steps, one open (name, owner, emblem, livery:
      a pattern stepped, a dye of the swatches), each shut step a strip with what it holds; her ship through the
      window, the team's plate under it (the championship it joins, whose place it takes), the owner, why the last
      making was refused, the way on. (The ship through the window does not yet wear the drafted livery.)

### 7. New

- [ ] Admiralty (proposals, vote, lobby, the rules now and next) · [ ] Board (chairman, budget, floor, reputation) ·
      [ ] Rival (manager and team) · [ ] Season review

A new screen's view and fixture are built first (`src/career/views-*.ts`, `src/office/`), then the screen.

### 8. Close

- [ ] Delete `src/ui/kit/`, `OFFICE`, the old screens' leftovers and `views.ts`'s dead builders
- [ ] The architecture test covers every office file (tokens only: no hex, no raw px)
- [ ] Rebase mm onto main
