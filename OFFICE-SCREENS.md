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

## The screens: 24 and the shell

Each line: built on the kit from a fixture → in review → approved and live. Additions are the gaps above.

### 0. Shell and Home

- [ ] **Shell**: top bar (team strip, back, title plate, balance, date, Admiralty chip, bell), nav (13 tabs, sunk band,
      chosen gilt), Continue as the gilt banner, folio and modal over `--dim`
- [ ] **Glyphs for the 13 tabs** and the Admiralty
- [ ] **Home** (prototyped on `proto-profile`; G1–G4 decided there)

### 1. Rosters

- [ ] Team · [ ] Drivers · [ ] Staff (one view, `TeamView`) · [ ] Scouting

### 2. Ledgers

- [ ] Standings (rows open Rival) · [ ] Finances (debt floor) · [ ] Sponsors (+ the slot fix) · [ ] Calendar ·
      [ ] Mail (+ glyphs for mail kinds; a vote letter opens Admiralty)

### 3. People

- [x] Profile (layout A, chosen 2026-11-22)
- [ ] Negotiation · [ ] Jobs (+ decline) · [ ] Player

### 4. Race day

- [ ] Plan (+ who sails, parts for the race, each sponsor's objective, forfeit) · [ ] Result (+ podium)

### 5. The yard

- [ ] Ship (+ design for next season, next season's parts, risk) · [ ] Suppliers (new) · [ ] HQ
- [ ] Glyphs for the 6 parts and 9 buildings

### 6. Bare

- [ ] Main menu · [ ] Found (create a team)

### 7. New

- [ ] Admiralty (proposals, vote, lobby, the rules now and next) · [ ] Board (chairman, budget, floor, reputation) ·
      [ ] Rival (manager and team) · [ ] Season review

A new screen's view and fixture are built first (`src/career/views-*.ts`, `src/office/`), then the screen.

### 8. Close

- [ ] Delete `src/ui/kit/`, `OFFICE`, the old screens' leftovers and `views.ts`'s dead builders
- [ ] The architecture test covers every office file (tokens only: no hex, no raw px)
- [ ] Rebase mm onto main
