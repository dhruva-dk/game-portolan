# UI kit, taken from MM's screens

Each MM reference screen (`reference/`), broken into the kit components it needs. Each component is mapped to our
mechanics. Component names are reused across screens, so the inventory at the end is the kit.

**Terms:** car → ship · driver → captain · parts: sails, rigging, rudder, hull, keel, mounts · buildings: factory,
drawingLoft, testTank, foundry, sailingSchool, pitHouse, crowsNest, fishMarket, landingPad · race calls: free,
attack, hold, form · 3 championship tiers. MM's practice, qualifying, tyres, fuel and car setup have no equivalent: race day is
the battle royale.

**Our use:** ✅ we need it as MM has it · 🔁 adapt it to our mechanics · ❌ not needed.

---

## Shell (shared by every screen)

| MM element                                                                                            | Kit component                                         | Our use                   |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------- |
| Team crest, screen title and caption, top left                                                        | **TopBar** › `Crest`, `ScreenTitle`                   | ✅                        |
| Balance pill (green, red when negative) with a dropdown                                               | **TopBar** › `BalancePill`                            | ✅                        |
| Series and Standings dropdown                                                                         | **TopBar** › `Dropdown`                               | 🔁 tier and standings     |
| Weather and next race ("Next Race in 16 Days, Black Sea GP")                                          | **TopBar** › `NextRace`                               | 🔁 planet and storm pace  |
| GMA (politics) button                                                                                 | **TopBar** › `IconButton`                             | 🔁 Admiralty              |
| Bell with a red count                                                                                 | **TopBar** › `IconButton` + `Badge`                   | ✅                        |
| Bottom nav: icon and label tabs, active tab filled, red badges, a progress stripe under building tabs | **BottomNav** › `NavTab` + `Badge` + `ProgressStripe` | ✅                        |
| Back and forward arrows, bottom left                                                                  | **BottomNav** › `IconButton`                          | ✅                        |
| Date button                                                                                           | **BottomNav** › `DateButton`                          | ✅                        |
| Gold Continue / "Must Respond ⓘ"                                                                      | **ContinueButton** (states: go, must-respond, racing) | ✅                        |
| Dimmed live 3D behind every panel                                                                     | **Backdrop**                                          | ✅ (no blur: iPad budget) |

## 001 Home dashboard

| MM element                                                                                                            | Kit component                                                      | Our use                                |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| Three-column dark panels with centred caps titles                                                                     | **Panel** (title, caption, `info` button) in a **Columns** layout  | ✅                                     |
| Team logo, series name                                                                                                | `Crest` + text                                                     | ✅                                     |
| Two drivers: round portrait, flag, name, standing position                                                            | **PersonChip** (portrait, flag, name, figure)                      | 🔁 3 captains                          |
| The car in a 3D shot                                                                                                  | **SceneWindow** (live 3D or a still)                               | ✅ the ship                            |
| Chairman's happiness half-dial, Disappointed to Happy                                                                 | **Gauge** (half-dial, end labels)                                  | 🔁 or ❌ if the chairman goes          |
| "VERY SECURE" boxed purple word                                                                                       | **Stamp** (tone: good / warn / bad / special)                      | ✅                                     |
| Season objective "3rd or above" with "BELOW TARGET" in red                                                            | **KeyValue** + `Stamp`                                             | ✅                                     |
| Team stats: columns per area with ◀ markers for the championship best and the grid average, tab-like labels          | **ColumnChart** (bars, reference markers, legend) + **Tabs** below | ✅ ship, captains, HQ, staff, sponsors |
| "BUILDING UNLOCKED" card with a picture, text and a link button                                                       | **NewsCard** (image, heading, body, action)                        | ✅                                     |
| Work in progress: dropdown filter; rows with a striped progress fill, flag, name, days, Details and Cancel            | **Dropdown** + **ProgressRow** (fill, label, days, actions)        | ✅ scouting, design, building          |
| Next race: track picture, flag, event number, name, Calendar button                                                   | **SceneWindow** with **Caption** overlay + `Button`                | 🔁 planet portrait                     |
| Segmented season progress under the picture                                                                           | **SegmentBar** (done / now / to come)                              | ✅                                     |
| Standings: Teams/Drivers toggle; table with a team colour edge on each row, your row lit, a red line under the leader | **Segmented** + **Table** (`edge` colour, `mine` row, divider)     | ✅                                     |
| Wide "Standings" button at the panel foot                                                                             | **Button** (neutral, full width)                                   | ✅                                     |

## 002 Mail inbox

| MM element                                                                                                  | Kit component                                         | Our use     |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------- |
| Left rail: inbox tile with count; categories with a colour bar and (n)                                      | **FilterRail** (items: colour, label, count)          | ✅          |
| All / This Week / This Month                                                                                | **Segmented**                                         | ✅          |
| Mail row: unread dot, portrait, sender, orange "MUST RESPOND" tag, subject, preview, time; selected row lit | **MessageRow** + **Tag**                              | ✅          |
| Message pane: up/down pager, logo, date                                                                     | **Panel** + `IconButton` pager                        | ✅          |
| Letter: portrait, subject, from, role; body paragraphs on a light sheet                                     | **Letter** (light paper sheet, the one light surface) | ✅          |
| Reply choices as wide buttons at the foot                                                                   | **ChoiceBar** (2–4 `Button`s)                         | ✅ dilemmas |
| Continue becomes "Must Respond"                                                                             | **ContinueButton** state                              | ✅          |

## 004 Driver profile

| MM element                                                                          | Kit component                                                              | Our use                 |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------- |
| Crest; DRIVER and MAIN role heading                                                 | `Crest` + **RoleHeading** (role, post)                                     | ✅                      |
| Portrait between ‹ › arrows, favourite star                                         | **PersonHeader** (portrait, pager, `favourite`)                            | ✅                      |
| Helmet, age, flag, name, partial stars                                              | **PersonHeader** › `StarRating` (halves; `Range` shows unknown as outline) | ✅ `stars`, `potential` |
| Contract details: label/value rows, costs in red                                    | **KeyValue** (tone per value)                                              | ✅                      |
| Fire / Renew Contract / Compare                                                     | **Button** (danger / primary / neutral, disabled with a reason)            | ✅                      |
| Morale half-dial, Low to High                                                       | **Gauge**                                                                  | ✅                      |
| 3×3 stat tiles: value out of 20, band colour, potential strip, trait mark, ⊕ rising | **StatTile** in a **TileGrid**                                             | ✅ 9 captain stats      |
| "45 WEEKS TOGETHER" pill and a bar with two ✓ markers                               | **Pill** + **MarkerBar**                                                   | ✅ mechanic bond        |
| Race mechanic portrait, name, stars                                                 | **PersonChip**                                                             | ✅                      |
| Marketability "51%", ⊕, a thin meter                                                | **Meter** (figure, trend, bar)                                             | ✅                      |
| Championship form: series and position, a button, table by event                    | `KeyValue` + `Button` + **Table**                                          | ✅                      |
| Driver form, last 5 races: green/teal columns with values                           | **ColumnChart** (values under bars)                                        | ✅ (needs form stored)  |
| Traits as outlined chips with icons; legend for temporary and permanent             | **ChipList** (icon, `temporary` / `permanent`) + **Legend**                | ✅                      |
| Career history: year, team logo, championship, races, podiums, wins                 | **Table** (logo cell)                                                      | ✅                      |
| Person tabs at the bottom: Ivone, Ana, Bjørn                                        | **PersonSwitcher** (Segmented)                                             | ✅                      |

## 005 Driver roster

| MM element                                                                                | Kit component                                      | Our use                 |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------- |
| A card per driver: DRIVER and MAIN DRIVER / RESERVE heading                               | **PersonCard** (Panel variant) + `RoleHeading`     | ✅ 3 captains + reserve |
| Portrait, helmet, age, weight, flag, name, stars                                          | **PersonHeader** (compact)                         | ✅                      |
| Driver Details / Compare Driver                                                           | **Button** pair                                    | ✅                      |
| Team mate comparison: label/value rows with a green or red tick at the right; a Total row | **KeyValue** (`compare` tick) + total row          | ✅                      |
| Contract details, with "Driveable Series" as car icons                                    | **KeyValue** + `IconSet` (lit / unlit)             | 🔁 tiers                |
| Fire / Renew Contract; "Promote Reserve Driver"                                           | **Button**                                         | ✅                      |
| "Driver negotiations: Looking for new drivers?" with a Scouting link                      | **EmptyState** (Panel with a prompt and an action) | ✅                      |
| Person tabs at the bottom                                                                 | **PersonSwitcher**                                 | ✅                      |

## 006 Lead designer profile

| MM element                                                                                                              | Kit component                                               | Our use                   |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------- |
| Same left card as the driver: role heading, portrait pager, stars, contract, Fire / Negotiating (greyed) / Compare      | **PersonHeader** + **KeyValue** + **Button** (`busy` state) | ✅ designer               |
| "Race Bonus: 5TH OR ABOVE \| -$63,000" two-part value                                                                   | **KeyValue** (split value)                                  | ✅                        |
| Six stat tiles in a 3×2 grid, one per part                                                                              | **StatTile** in a **TileGrid**                              | ✅ one per part (6 tiles) |
| Known components: five round icons, "None" when empty, each with a rarity label (Average, Good, Great, Epic, Legendary) | **SlotGrid** of **Token** + **RarityTag**                   | ✅ uses main's `RARITY`   |
| Info "i" on panel corners                                                                                               | **Panel** › `info` → **Popover**                            | ✅                        |
| Career history                                                                                                          | **Table**                                                   | ✅                        |

## 007 Staff roster

| MM element                                                                                                                                             | Kit component                                 | Our use                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------- |
| A card per staff member: heading, portrait with a role badge, age, flag, name, stars                                                                   | **PersonCard** + `Badge` on the portrait      | ✅ designer, scout, mechanics |
| Details / Compare                                                                                                                                      | **Button** pair                               | ✅                            |
| Contract details; "Rolling Contract"                                                                                                                   | **KeyValue**                                  | ✅                            |
| Scout Designer / Scout Mechanic                                                                                                                        | **Button**                                    | ✅                            |
| Known components grid                                                                                                                                  | **SlotGrid** + **RarityTag**                  | ✅                            |
| Relationship with driver: "Chemistry with André Gomes", weeks pill, a track with level nodes; under each node a round "Locked" token and "Level 1 / 2" | **Pill** + **MarkerBar** with **UnlockNode**s | ✅ bond levels                |
| "Swap driver with Faith Anthony"                                                                                                                       | **Button**                                    | ✅                            |
| Staff negotiations empty panel with Scouting                                                                                                           | **EmptyState**                                | ✅                            |
| Person tabs                                                                                                                                            | **PersonSwitcher**                            | ✅                            |

## 008 Race mechanic profile

| MM element                                                                                     | Kit component                                | Our use           |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------- |
| Left card (as for drivers)                                                                     | **PersonHeader** + **KeyValue** + **Button** | ✅                |
| Six stat tiles                                                                                 | **StatTile**                                 | ✅ mechanic stats |
| Tooltip: purple hex icon, "LIGHTFOOTED: SOFT TYRES", a Level 1 tag, a lock, one line of effect | **Popover** (icon, title, `Tag`, lock, body) | ✅ bond unlocks   |
| Relationship track with locked level nodes                                                     | **MarkerBar** + **UnlockNode**               | ✅                |
| Race mechanic for: portrait, number, flag, name, stars, swap button                            | **PersonChip** (large) + **Button**          | ✅                |
| Past relationships table                                                                       | **Table**                                    | ✅                |
| Top bar during the design phase: "Car Design 1–2–3" step chips, "Adapt Parts NOW"              | **TopBar** › **StepChips**, `ContextItem`    | 🔁 design phase   |
| Continue with a second line, "Next: Unread Mail"                                               | **ContinueButton** (subline)                 | ✅                |

## 009 Scouting search

| MM element                                                                                                   | Kit component                                                       | Our use                                   |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------- |
| Filters panel: job role as a segmented control                                                               | **Segmented**                                                       | ✅ captains, designers, mechanics, scouts |
| View: All (with a count badge) / Favourites; Age bands; Ability All / Specific with an "at least" star pager | **FilterGroup** (label over a `Segmented`) + **StarRating** (input) | ✅                                        |
| Table: favourite star column, flag, age, star cells, a sorted header lit with ▲, "-" for unknown cells       | **Table** (sortable, `favourite`, star cell, empty cell)            | ✅                                        |
| Scrollbar                                                                                                    | **ScrollArea** (thin kit scrollbar)                                 | ✅                                        |
| Chief scout: portrait, name                                                                                  | **PersonChip**                                                      | ✅                                        |
| Scouting slots dropdown: empty slots, then locked slots with a lock                                          | **SlotList** (empty / filled / locked)                              | ✅ crowsNest level                        |

## 010 Unscouted driver

| MM element                                                | Kit component                                   | Our use                |
| --------------------------------------------------------- | ----------------------------------------------- | ---------------------- |
| "UNEMPLOYED" big boxed label                              | **Stamp** (large)                               | ✅                     |
| Stat tiles as ranges ("10 - 15") on grey                  | **StatTile** `range` variant                    | ✅ `Range` / `ceiling` |
| "Scout Driver" (with a search icon), "Approach Driver"    | **Button** (icon)                               | ✅                     |
| Panels with "DETAILS UNAVAILABLE" and "Scouting Required" | **Unavailable** (panel overlay: label + reason) | ✅                     |
| Driveable series icons lit                                | `IconSet`                                       | 🔁 tiers               |
| Career history with logo-only rows                        | **Table**                                       | ✅                     |

## 011 Contract negotiation

| MM element                                                                                    | Kit component                                            | Our use  |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------- |
| Term rows: caps label, − big figure + , unit below                                            | **TermRow** › **Stepper** (−/+, big figure, unit)        | ✅       |
| Contract length as three outlined choices, one lit                                            | **ChoiceRow** (outlined, one selected)                   | ✅       |
| Bonus terms: a checkbox "Add" column, two steppers (target ‹ › and value − +) split by a rule | **Checkbox** + **Stepper** (`pick` ‹ › and `amount` − +) | ✅       |
| Faded "BONUS TERMS" section label                                                             | **SectionLabel**                                         | ✅       |
| Expectations column: a card per term with a mood face (red / amber / green) and a quote       | **MoodCard** (`Mood` face + quote)                       | ✅ wants |
| Person: portrait, "UNEMPLOYED" stamp, age, flag, name, stars                                  | **PersonHeader** + **Stamp**                             | ✅       |
| Patience: three ✕ boxes, the used ones red                                                    | **Pips** (count, used)                                   | ✅       |
| Terms / Existing contract / Offer / Reaction table; the reaction coloured with a small face   | **Table** + **Mood** cell                                | ✅       |
| Bottom bar without nav: Cancel (grey) + Continue                                              | **ModalFooter** (`Button` neutral + **ContinueButton**)  | ✅       |

## 012 Sponsors

| MM element                                                                               | Kit component                                                    | Our use                    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------- |
| Full-screen 3D car with sponsor liveries                                                 | **SceneWindow** (full bleed)                                     | ✅ ship with sponsor marks |
| Floating marketability panel: % meter; breakdown by person; "Sponsor Appeal level" stars | **Panel** (floating) + **Meter** + **KeyValue** + **StarRating** | ✅                         |
| Two slot groups, "Race bonus" and "Fixed payment"                                        | **Panel** + **SlotGrid**                                         | ✅                         |
| Slot card: "Slot 1" header strip, sponsor logo, "time remaining: 2 Races"                | **SlotCard** (header, art, footer figure)                        | ✅                         |

## 013 Finances, next year's car budget

| MM element                                                                      | Kit component                            | Our use                   |
| ------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------- |
| Modal over a dimmed screen: title, paragraph                                    | **Modal** (title, body) over a **Scrim** | ✅                        |
| Three choice cards (picture, name, cost line), one selected                     | **ChoiceCard** group                     | 🔁 supplier / budget tier |
| "Confirm and Continue"                                                          | **Button** primary                       | ✅                        |
| Behind it: big figures ("Available Budget £15,000,000", "Cost Per Race" in red) | **BigFigure** (label, value, tone)       | ✅                        |
| Chairman card, happiness gauge                                                  | **PersonChip** + **Gauge**               | 🔁 or ❌                  |
| Balance area chart with a dotted projection and date axis                       | **LineChart** (area, projection, axes)   | ✅                        |
| Year-to-date costs list with icons                                              | **KeyValue** (`icon`)                    | ✅                        |

## 015 Season calendar

| MM element                                                                               | Kit component                                        | Our use                                     |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| Event list: colour edge, venue, flag, date; current row lit with ›                       | **ListRail** (rows: edge, label, flag, sub, chevron) | ✅ rounds and planets                       |
| Event header: flag, "GP DOHA, Round 1 of 16", series logo                                | **SceneHeader**                                      | ✅                                          |
| Big track picture                                                                        | **SceneWindow**                                      | 🔁 planet portrait                          |
| Track layout drawn as a line on dark                                                     | **MapDrawing**                                       | 🔁 the planet's map (main's coasts/minimap) |
| "Watch all circuit types"                                                                | **Button**                                           | ✅                                          |
| Weather forecast cards: session name and weather icon                                    | **InfoCard** (title, icon)                           | 🔁 storm pace                               |
| Track guide rows: icon, quality, importance tag ("Crucial" orange, "Useful")             | **KeyValue** (`icon`, tone tag)                      | 🔁 what the planet favours                  |
| Track info: three labelled cells                                                         | **StatCells** (label over value)                     | ✅                                          |
| Tyre compounds as coloured letter circles                                                | **TokenRow**                                         | ❌                                          |
| Event results with Race / Qualifying tabs; position table with team colour edge and gaps | **Segmented** + **Table**                            | ✅ race only                                |

## 016 Championship standings

| MM element                                                                                                       | Kit component                              | Our use    |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------- |
| Series tabs (Single Seater / GT / Endurance)                                                                     | **Segmented** (large)                      | ✅ 3 tiers |
| Series logo; series ‹ › and year ‹ › pagers                                                                      | `Crest` + **Pager**                        | ✅         |
| Prize fund, TV audience                                                                                          | **BigFigure**                              | ✅         |
| Current Rules / View Season Calendar                                                                             | **Button**                                 | ✅         |
| Team and driver standings tables: colour edge, flag, wins, points, gap; your rows lit; ▲▼ position-change arrows | **Table** (`edge`, `mine`, **Delta** cell) | ✅         |
| "Round 10 of 10"                                                                                                 | **Panel** › `aside` text                   | ✅         |

## 017 HQ, factory upgrade

| MM element                                                                  | Kit component                                      | Our use               |
| --------------------------------------------------------------------------- | -------------------------------------------------- | --------------------- |
| Full-screen 3D HQ campus                                                    | **SceneWindow** (full bleed, pickable)             | ✅ harbour / yard     |
| Floating labels on buildings: icon, name, "Level 1 of 4"                    | **WorldLabel** (pinned to a 3D point)              | ✅ 9 buildings        |
| Building card: icon, name, level, picture, cost per race (red), description | **Panel** (floating) + `KeyValue` + body           | ✅                    |
| "YOUR CURRENT KNOWLEDGE" orange section label                               | **SectionLabel** (accent)                          | ✅                    |
| Unlock rows: text, a segmented pip bar, "1/4"                               | **PipBar** (segments, count)                       | ✅                    |
| Upgrade button; upgrade time and cost below                                 | **Button** + **KeyValue** (inline pair)            | ✅                    |
| "New Buildings 3" / "Upgrade Buildings 3" list buttons with red counts      | **MenuButton** + `Badge`                           | ✅                    |
| HQ stats column chart with best and average markers and icon labels         | **ColumnChart** (icon axis)                        | ✅                    |
| Part knowledge rows: icon, name, quality tag (GOOD / GREAT), pip bar, "2/5" | **KeyValue** (`icon`) + **RarityTag** + **PipBar** | ✅ knowledge per part |

## 019 Car overview

| MM element                                                                                    | Kit component                                         | Our use                           |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------- |
| Full-screen 3D car                                                                            | **SceneWindow**                                       | ✅ the ship                       |
| Car stats: column chart, hatched columns for spec parts, icon and abbreviation axis           | **ColumnChart** (`hatched` state)                     | ✅ 6 parts; spec parts per tier   |
| Chassis make-up: four star ratings with labels                                                | **StarRating** grid                                   | 🔁 the hull's fixed traits, or ❌ |
| All Suppliers, VIEW (orange search button)                                                    | **Button** (`accent`)                                 | ✅ suppliers                      |
| Four action cards: title, caption, status chip ("NO WORK IN PROGRESS", "IDLE"), action button | **ActionCard** (title, caption, `Chip` state, button) | ✅ design, fit, improve, livery   |
| Sub-tabs at the bottom: Design / Fit / Improve                                                | **SubTabs** (the PersonSwitcher strip)                | ✅                                |

## 021 Part design, choosing a part

| MM element                                                                                | Kit component                                                      | Our use                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------- |
| A 3D window of the car beside a stats chart                                               | **SceneWindow** + **ColumnChart**                                  | ✅                           |
| "CHOOSE A PART TO BUILD": one card per part with the name, the stat it drives, a big icon | **PartCard** (name, stat, icon)                                    | ✅ 6 parts                   |
| Current best and knowledge available as rarity tags                                       | **RarityTag** pair                                                 | ✅                           |
| A thin performance bar and a red/green reliability bar                                    | **Meter** (`performance`) + **SplitBar** (red zone / good)         | ✅                           |
| A bulb icon (an idea or knowledge)                                                        | `Icon`                                                             | ✅                           |
| Base cost and base time (red days)                                                        | **KeyValue** (inline)                                              | ✅                           |
| Spec part: gold outline "SPEC PART" stamp, ⚠ "You can't upgrade this part"               | **Stamp** (gold) + **Notice** (⚠ warn line) + card `locked` state | ✅ spec rules                |
| "Next Race CRUCIAL" above a card                                                          | **Tag** (accent) above the card                                    | 🔁 the planet favours a part |

## 022 Gearbox design

| MM element                                                                                             | Kit component                                          | Our use                       |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------- |
| "0/4 Slots filled", "Empty Slots" in red                                                               | **BigFigure** (fraction) + warn line                   | ✅                            |
| Part icon, "GEARBOX PART DESIGN"                                                                       | **SceneHeader**                                        | ✅                            |
| Designer chip                                                                                          | **PersonChip**                                         | ✅                            |
| Component tiers: rarity bar header, ⏱ days, cost each                                                 | **TierHeader** (`RarityTag`, time, cost)               | ✅                            |
| Component cards: hexagonal rarity icon, effect lines, ⚠ risk mark; locked tier faded with 🔒 "LOCKED" | **ComponentCard** (hex `Token`, lines, risk, `locked`) | ✅ the dealt components       |
| Designer's own components column                                                                       | **ComponentCard**                                      | ✅                            |
| Five hexagonal slots "Empty", the last locked; rarity pips under each; a tree joining them to the part | **SlotGrid** (hex) + **PipBar** + **Connector** lines  | ✅                            |
| "ORIGINAL" grey part tile                                                                              | **PartTile** (quality header, icon, name)              | ✅                            |
| Performance "158/167": a bar with Base, Max and a ▲ Current Best marker                                | **RangeBar** (base, max, marker, legend)               | ✅ the design's outcome range |
| Reliability "40%/100%": red zone and green                                                             | **SplitBar**                                           | ✅                            |
| "RISK OF RULE BREAK: NONE"                                                                             | **KeyValue** chip                                      | ✅ Admiralty inspection       |
| Build time and cost                                                                                    | **KeyValue** (inline, large)                           | ✅                            |
| Footer: Cancel + "Build Part"                                                                          | **ModalFooter**                                        | ✅                            |

## 023 Part improvement

| MM element                                                                                                                                               | Kit component                                                                         | Our use             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------- |
| Tabs: Parts List / one per driver                                                                                                                        | **Segmented**                                                                         | 🔁 per ship         |
| Parts table grouped by part (an icon column); quality tag with pips; performance "13 (29)"; reliability % with a small split bar; toggle buttons per row | **Table** (grouped rows, `RarityTag` + `PipBar`, **SplitBar** cell, **Toggle** cells) | ✅                  |
| Spec values in purple                                                                                                                                    | tone `special`                                                                        | ✅                  |
| Improvement departments: a slider splitting staff                                                                                                        | **Slider** (split)                                                                    | ✅ `SetImprovement` |
| Department headers: big count, "Staff Allocated", purple / green fill                                                                                    | **BigFigure** on a tone band                                                          | ✅                  |
| Mechanic chip with a swap button; impact per day                                                                                                         | **PersonChip** + **IconButton** + **KeyValue**                                        | ✅                  |
| Queue slots: part tiles, then locked slots                                                                                                               | **SlotGrid** (`PartTile`, locked)                                                     | ✅                  |
| Hover card: part, stat, quality, performance bar "2/35", reliability bar                                                                                 | **Popover** (large) with **Meter** + **SplitBar**                                     | ✅                  |
| "Completion Time: 14 DAYS AFTER RACE"; progress line                                                                                                     | **KeyValue** (tone) + **Meter**                                                       | ✅                  |
| Clear (grey) / Auto Fill                                                                                                                                 | **Button**                                                                            | ✅                  |

## 024 New car design, suppliers

| MM element                                                                                                                 | Kit component                                           | Our use                                |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| Top bar in the design phase: "Car Design 1–2–3", "Design Car Starts NOW"                                                   | **TopBar** › **StepChips** + `ContextItem`              | 🔁 preseason                           |
| Collapsible sections with a check box in the header ("ENGINE SUPPLIER ⌄ ✓")                                                | **Accordion** (header strip, chevron, done check)       | ✅ preseason and race-day steps        |
| Supplier table: logo cell, word ratings coloured from Very Weak (red) to Very Strong (green), modifier, cost, a select box | **Table** (logo cell, **Rating** word cell, `Checkbox`) | ✅ `ChooseSupplier`                    |
| Estimated output: stars per quality, faded until chosen                                                                    | **StarRating** grid (`muted`)                           | ✅                                     |
| "Total Cost: $55,000,000"                                                                                                  | **BigFigure**                                           | ✅                                     |
| Preference sliders: a label with an orange value, a range band and a knob                                                  | **Slider** (with a band and a value)                    | 🔁 if the hull or rig gets preferences |
| Full-screen 3D car                                                                                                         | **SceneWindow**                                         | ✅                                     |

## 025 Race weekend preparation

| MM element                                                                                        | Kit component                                              | Our use               |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------- |
| Race-weekend top bar: standings dropdown, weather, water on track, track grip, each a small meter | **TopBar** (race variant) › `ContextItem` with a **Meter** | 🔁 storm pace, planet |
| Car 1 / Car 2 cards: portrait with a tyre badge, flag, name, stars                                | **PersonChip** (card, `Badge`)                             | ✅ 3 ships            |
| "Today's session: RACE" blue banner with an icon                                                  | **SessionBanner** (tone per session)                       | ✅                    |
| Accordion steps: Knowledge ✓, Car setup, Driver strategy                                          | **Accordion**                                              | ✅ race-day plan      |
| Per-driver slot cards: "PITSTOPS Level 1 +5%"; "EMPTY SLOT ⊕ Add knowledge"                       | **SlotCard** (filled / empty with ⊕)                       | 🔁 or ❌              |
| Clear Selection                                                                                   | **Button** (neutral)                                       | ✅                    |
| Bottom nav in race mode: Hub, Car 1 Setup, Car 2 Setup, Grid, Results, Standings                  | **BottomNav** (race tabs)                                  | 🔁 race-day nav       |

## 028 Practice session preparation

| MM element                                                                                                       | Kit component                                          | Our use             |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------- |
| "Select drivers" accordion: three driver cards (portrait, flag, name, stars, a feedback stat tile, a select box) | **PersonCard** (compact) + **StatTile** + **Checkbox** | 🔁 choose who sails |
| "Active Knowledge" two meters in the top bar                                                                     | **TopBar** › `ContextItem` meters                      | ❌                  |
| Purple "PRACTICE" banner                                                                                         | **SessionBanner**                                      | ❌ practice         |

## 029 Practice live (pace controls)

| MM element                                                                                        | Kit component                                       | Our use                                       |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| Live timing column at the left: position, ▲▼, colour edge, name, tyre token, "Pit"                | **Leaderboard** (compact rows)                      | ✅ battle royale field, already in main's HUD |
| Knowledge level rows with progress                                                                | **ProgressRow**                                     | ❌                                            |
| Driver bubble on the track: portrait, flag, name, tyre %, "OUT LAP", mode icons                   | **WorldLabel** (rich)                               | 🔁 main's HUD marks ships                     |
| Track minimap with numbered car dots                                                              | **Minimap**                                         | ✅ main's `minimap.ts`                        |
| Bottom driver strips: portrait, status, a ring gauge with %, fuel bar, star pips, Strategy ⌃ menu | **ShipStrip** (portrait, **Ring**, **Meter**, menu) | 🔁 pit wall                                   |
| Centre: flag, ⏸ and ⏩ buttons, big clock, session status "Green Flag"                           | **RaceClock** (+ `IconButton`s)                     | ✅                                            |
| "Setup Knowledge" bar with a MEDIUM / LOW tag                                                     | **Meter** + **Tag**                                 | ❌                                            |

## 030 Car setup and feedback

| MM element                                                                                       | Kit component                      | Our use                    |
| ------------------------------------------------------------------------------------------------ | ---------------------------------- | -------------------------- |
| Setup tiles: icon, slider with end labels and a value; a dial with +/−; a stepper with a picture | **Slider**, **Dial**, **Stepper**  | ❌ no car setup            |
| Car balance bars: a green target band and a yellow marker, end labels                            | **RangeBar** (target band, marker) | 🔁 reused by design ranges |
| Feedback cards: mood face, "EXCELLENT"                                                           | **MoodCard**                       | ❌                         |
| Stints table with "Use Setup" buttons                                                            | **Table** (button cell)            | ❌                         |
| Session length: big clock                                                                        | **BigFigure**                      | ✅                         |
| "Unchanged ✓" chip in an accordion header                                                        | **Accordion** › `Chip`             | ✅                         |

## 031 Qualifying, live

| MM element                                                                                                 | Kit component                                             | Our use                            |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------- |
| "Sponsor Objective: ON TARGET" green chip in the top bar                                                   | **TopBar** › `ContextItem` + **Stamp** (small)            | ✅ the sponsor's race target       |
| Standings column with threshold dividers in the rows ("▲ SPONSOR OBJECTIVE", "▼ Q2 ELIMINATION THRESHOLD") | **Leaderboard** + **ThresholdRow**                        | ✅ sponsor target; the storm's cut |
| Radio message: amber card, a waveform, ⓘ, a quote, Ignore / Send Out                                       | **RadioCard** (quote, 2 actions)                          | 🔁 captains ask during the race    |
| Paired car bubbles on the track ("2nd Kaluza IN GARAGE")                                                   | **WorldLabel** (rich)                                     | 🔁                                 |
| Speed controls: view toggles, clock with progress, ⏸ ▶ x2 x4 x12                                         | **SpeedControl** (segmented icon buttons) + **RaceClock** | 🔁 watching captains' ships        |
| Driver strip: portrait with a rating badge, position, status                                               | **ShipStrip**                                             | ✅                                 |

## 032 Qualifying results

| MM element                                                                                                                                        | Kit component                     | Our use                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------- |
| A single wide panel: header "2029 MILAN – WORLD MOTORSPORT CHAMPIONSHIP" with an "OFF TARGET / 4th or above / 1,250,000€" chip group at the right | **Panel** (wide) + **StampGroup** | ✅ the sponsor target result |
| Result table: colour edge, flag, driver, team, tyre token, best, gap; your rows lit; a threshold row                                              | **Table** + **ThresholdRow**      | ✅                           |
| Top bar in event mode: weather and "In Progress, Milan GP"                                                                                        | **TopBar** (event variant)        | ✅                           |

## 033 Race, live timing

| MM element                                                                                                                                         | Kit component                                             | Our use                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------- |
| Dense live table: position, ▲▼, name, tyre token, sector pips, stops, last lap, leader gap, gap, strategy icons; a divider after the points places | **Leaderboard** (dense) + `PipBar` cells + `ThresholdRow` | 🔁 the field: hull, kills, alive |
| "32 LAPS REMAINING"                                                                                                                                | **Banner** (thin)                                         | 🔁 ships left / storm            |
| Driver strips: Pit / Condition ⌃ / Strategy ⌃ menu buttons; pace ± figures; the sector rank chip "6th"                                             | **ShipStrip** + **MenuButton** (opens upward)             | ✅ race-day calls, pit call      |
| Floating "2nd" label                                                                                                                               | **WorldLabel**                                            | ✅                               |
| Centre: flag, ⏸ ⏩, "LAP 4/35", race status                                                                                                       | **RaceClock**                                             | ✅                               |
| Minimap                                                                                                                                            | **Minimap**                                               | ✅ main's                        |

## 034 Position tracker

| MM element                                                                                                               | Kit component                                                         | Our use                    |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------- |
| "My drivers" and "Drivers" lists: portrait, flag, name, team, a check box; Deselect All / Select All                     | **PersonRow** (with `Checkbox`) in a **ScrollArea** + **Button** pair | ✅ filter                  |
| Bump chart: a coloured line per driver, a numbered dot at the end, a lap header with the current lap lit and a ‹ › pager | **BumpChart**                                                         | ✅ positions over the race |
| Race-mode bottom nav: Position Tracker, Live Timings, Tyre History, Tyre Selection, Commentary, Standings, Event Results | **BottomNav** (race tabs)                                             | 🔁                         |

## 035 Live timing table

| MM element                                                                         | Kit component                           | Our use          |
| ---------------------------------------------------------------------------------- | --------------------------------------- | ---------------- |
| Full-width table with many numeric columns, personal bests in green, your rows lit | **Table** (dense, numeric, `best` tone) | ✅               |
| Tyre legend: a token and name for each compound                                    | **Legend**                              | 🔁 rarity legend |

## 036 Tyre history

| MM element                                                                                                | Kit component                                         | Our use                                     |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| A row per driver: a timeline of stints, a token at each change, lines coloured by compound, a stops count | **TimelineRow** (tokens on a line, coloured segments) | 🔁 a ship's race: hits, sinkings, pit stops |
| Your rows lit; a compound legend                                                                          | **Table** `mine` + **Legend**                         | ✅                                          |

## 037 Tyre sets per team

| MM element                                                                                                    | Kit component                     | Our use                                                   |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| A row per team: colour edge, team; two drivers each with a long row of compound tokens, worn ones part-filled | **TokenRow** (tokens with a fill) | ❌ (🔁 ammunition or fittings if they become consumables) |

## 038 Driver radio message

| MM element                                                        | Kit component                                  | Our use                   |
| ----------------------------------------------------------------- | ---------------------------------------------- | ------------------------- |
| "DRIVER MESSAGE": a light card with a portrait, a quote and Close | **RadioCard** (light, one action)              | ✅                        |
| "CRASHED" in red on a leaderboard row                             | **Leaderboard** row `status` tag               | ✅ sunk                   |
| Ship strip: tyre ring with %, fuel bar, pace ± with ▲▼            | **ShipStrip** › **Ring**, **Meter**, **Delta** | 🔁 hull, crew, ammunition |

## 039 Pit stop, repairs

| MM element                                                                                                                                           | Kit component                                                                 | Our use                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------- |
| Accordion steps with a status chip ("Unchanged ✓" / "Changed ✓" in orange)                                                                           | **Accordion** › `Chip`                                                        | ✅ pit call                   |
| Car schematic with a part tile at each part: %, a split condition bar, "Fix Part", a red broken-part icon on the worst ones, leader lines to the car | **Schematic** (a drawing with anchored **PartTile**s and **Connector** lines) | ✅ 6 parts on the ship's plan |
| "Time +0 SEC"                                                                                                                                        | **KeyValue** (tone)                                                           | ✅                            |
| "Total Estimated Pitstop Time 0 SECS" red big figure with a timer icon                                                                               | **BigFigure**                                                                 | ✅                            |
| Driver header: portrait, position, sector pips, a rank chip, pace, tyre ring, fuel, "Lap 20/21", progress                                            | **ShipHeader** (ShipStrip, large)                                             | ✅                            |
| Minimap with Show All / Rivals / Just Yours                                                                                                          | **Minimap** + **Segmented**                                                   | ✅                            |
| Driver in front / behind cards: big position and a quote                                                                                             | **QuoteRow** (big figure + quote)                                             | 🔁 who you'll come out near   |
| Stints table                                                                                                                                         | **Table**                                                                     | ❌                            |
| "⚠ Warning: You have no changes queued!" red line above the footer                                                                                  | **Notice** (danger)                                                           | ✅                            |
| Footer: Cancel + Continue (disabled)                                                                                                                 | **ModalFooter**                                                               | ✅                            |

## 040 Pit stop, fuel and tyres

| MM element                                                                   | Kit component                                     | Our use                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| Current → New: two tall cards with a vertical fill gauge, a figure and a tag | **CompareCards** (from › to) + vertical **Meter** | 🔁 hull or ammunition before and after |
| "23 Laps Remaining (After Pit Stop)" red banner                              | **Stamp** (wide, danger)                          | ✅                                     |
| Stepper "− 14 Laps +"                                                        | **Stepper**                                       | ✅                                     |
| "1 Lap of Fuel = 0.134 Secs Per Lap" with a highlighted value                | **KeyValue** (inline, highlighted value)          | ✅                                     |
| "New" tags under the header gauges                                           | **Tag**                                           | ✅                                     |

## 041 Team orders

| MM element                                                                                                        | Kit component                          | Our use                                |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------- |
| "RACE ENDING, Waiting for 14 cars to finish" with chequered flags                                                 | **Banner** (thin, centred)             | ✅ storm closing / last ships          |
| Status tags in red: "Retired", "Crashed"                                                                          | **Leaderboard** row `status`           | ✅ sunk                                |
| Team orders: Race / Allow Team Mate Through                                                                       | **Segmented**                          | ✅ race calls                          |
| Driving style and engine modes: lists with an icon, a name, a pip rating (▲▲▲▲) at the right, the current row lit | **OptionList** (icon, label, **Pips**) | ✅ `CALLS` free / attack / hold / form |
| Gap strip: "5 +0.094 ⋯ car ⋯ +5.048 3"                                                                            | **GapStrip**                           | 🔁 nearest rival                       |
| Commentary ticker: "Chequered Flag! Kaluza wins…"                                                                 | **Ticker**                             | ✅ main's feed                         |
| Speed control with x2 x4 x12                                                                                      | **SpeedControl**                       | 🔁                                     |

## 042 Podium

| MM element                                                                                                                                          | Kit component                              | Our use                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------- |
| Three stepped podium cards: flag, portrait, name, time, big position, "+20 PTS", team logo; the winner's card tinted and raised under "RACE WINNER" | **PodiumCard** ×3 (raised, tinted by team) | ✅                            |
| Team principal strip: portrait, flag, name, team, logo                                                                                              | **PersonChip** (wide)                      | ✅ you                        |
| 3D trophy                                                                                                                                           | **SceneWindow**                            | 🔁 a 3D prize from the planet |

## 043 Post-race team report

| MM element                                                                                           | Kit component                             | Our use                         |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------- |
| A card per driver: role heading, flag, portrait, helmet, age, name, stars; "Finishing Position 2nd"  | **PersonCard**                            | ✅ 3 captains                   |
| Driver stats with changes: label, a small tile bar with the value inside, a change % in green or red | **StatBar** (inline StatTile) + **Delta** | ✅                              |
| Morale and mechanic relationship rows with changes                                                   | **KeyValue** + **Delta**                  | ✅                              |
| Chairman card: race results "Expected 5th / You came 1st"; stats with changes; a marketability meter | **PersonCard** + **KeyValue** + **Meter** | 🔁 owner's report (no chairman) |

## 044 Race results

| MM element                                                                                            | Kit component                      | Our use                    |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------- |
| Header with "ON TARGET 9th or above" and a "$350,000" green chip                                      | **StampGroup**                     | ✅                         |
| Result table: change ▲▼ with a count, stops, time, gap, penalty icons, points with a fastest-lap icon | **Table** + **Delta** + icon cells | ✅ kills, survival, points |
| Sponsor objective threshold row                                                                       | **ThresholdRow**                   | ✅                         |
| Penalty tooltip: "Demoted – … broken the GMA rules" with an amber outline                             | **Popover** (warn)                 | ✅ Admiralty inspection    |

## 045 GMA vote result

| MM element                                                                                                                  | Kit component                                                 | Our use      |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------ |
| Modal: body logo; proposal title and text on a lighter box                                                                  | **Modal** + **Callout**                                       | ✅ Admiralty |
| "Vote Concluded" over a big green "APPROVED"                                                                                | **Verdict** (label + big toned word)                          | ✅           |
| Three columns: Against / No Vote / For; voter portraits ringed in the vote's colour, "x2" / "+1" weight badges; vote counts | **VoteColumns** (**PortraitStack** + `Badge` + **BigFigure**) | ✅ `Vote`    |
| Continue                                                                                                                    | **Button**                                                    | ✅           |

## 046 Proposed rule change

| MM element                                                                                       | Kit component                                     | Our use      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------ |
| Modal: logo, proposal box                                                                        | **Modal** + **Callout**                           | ✅           |
| President portrait and name                                                                      | **PersonChip** (stacked)                          | ✅ Admiralty |
| "Will benefit: …" / "Will not benefit: …" with team names as orange links                        | body text + **InlineLink**                        | ✅           |
| Currently supporting: Against (red box) / Undecided (grey) / For (green), with portraits in each | **VoteColumns** (toned boxes + **PortraitStack**) | ✅           |
| Voting power "− 2 +"                                                                             | **Stepper**                                       | ✅ `Lobby`   |
| Vote Against / Abstain / Vote For, with a note under it                                          | **Segmented** + hint text                         | ✅ `Vote`    |

## 047 Main menu

| MM element                                                                                                                         | Kit component                                   | Our use                              |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------ |
| Large mode cards: an icon and a title strip, a caption, a big picture with a caption plate ("3 CHAMPIONSHIPS, 16 World Locations") | **MenuCard** (icon, title, caption, art, plate) | ✅ career / battle royale / settings |
| Wide strip buttons: icon, title, line of text                                                                                      | **MenuCard** (strip)                            | ✅ load, settings                    |
| Footer link bar                                                                                                                    | **BottomNav** (links)                           | ❌                                   |
| Version line                                                                                                                       | small text                                      | ✅                                   |

## 048 Create manager

| MM element                                                     | Kit component                               | Our use                               |
| -------------------------------------------------------------- | ------------------------------------------- | ------------------------------------- |
| Text fields: label above, underlined field                     | **TextField**                               | ✅ name                               |
| Date dropdowns                                                 | **Dropdown**                                | ❌                                    |
| Continent dropdown and a country list with flags, selected lit | **Dropdown** + **SelectList**               | 🔁 colony                             |
| Portrait with a flag, name                                     | **PersonHeader**                            | ✅                                    |
| Backstory pager ‹ Financial ›, its effect in green             | **Pager** + **Notice** (good)               | ✅                                    |
| Appearance rows: label, ‹ value › pager or a swatch row        | **FormRow** with **Pager** or **SwatchRow** | ❌ faces (you said they matter least) |
| Auto Generate                                                  | **Button**                                  | ✅                                    |

## 049 Choose series

| MM element                                                                                              | Kit component                                          | Our use               |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------- |
| Three hexagonal tier badges with art, a tier label plate, joined by a tree; the chosen one ringed green | **TierPicker** (hex **Token** + label + **Connector**) | ✅ 3 tiers            |
| Series header and description; "Championship Rules VIEW"                                                | **SceneHeader** + **Button**                           | ✅                    |
| "10 EVENTS, 6 Locations" green plate over the car picture                                               | **Stamp** (plate) over **SceneWindow**                 | ✅                    |
| Quality of championship columns with icon labels and a team-average column                              | **ColumnChart**                                        | ✅                    |
| Car specifications: label over an amber value                                                           | **KeyValue** (stacked, accent)                         | ✅ ship specification |
| Laurel medallion picture                                                                                | art                                                    | 🔁 main's `laurel`    |

## 050 Create team identity

| MM element                                                                   | Kit component                   | Our use                    |
| ---------------------------------------------------------------------------- | ------------------------------- | -------------------------- |
| Accordion of steps each ending in ✓ (name and origin, logo, uniform, livery) | **Accordion**                   | ✅ `Found`                 |
| Base / Livery pack                                                           | **Segmented**                   | ✅                         |
| "‹ LIVERY 5 ›" pager and numbered round chips 1–9                            | **Pager** + **ChipPicker**      | ✅ livery patterns         |
| Colour swatches with labels; Random; Auto Generate                           | **Swatch** + **Button**         | ✅ dyes (main has `dyeOn`) |
| Team owner card: portrait, age, flag, name, logo                             | **PersonChip** (wide) + `Crest` | ✅ you                     |
| Full-screen 3D car                                                           | **SceneWindow**                 | ✅ ship                    |

## 051 Investor offers

| MM element                                                                                                       | Kit component                                        | Our use                            |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| Modal: title, intro paragraph                                                                                    | **Modal**                                            | ✅                                 |
| Five offer cards: logo, name, "Bonus" text, green perk lines, "Pressure LOW / MEDIUM / HIGH" stamp, Accept Offer | **OfferCard** (logo, body, perks, **Stamp**, action) | 🔁 a starting backer (no chairman) |
| Close (grey)                                                                                                     | **Button** (neutral)                                 | ✅                                 |

---

# The kit

Taken from all 45 screens above. Many names in the tables were one-off; below they're merged so the kit stays small. A screen may use only what's here: no CSS, pixel sizes or colours of its own.

## 1. Tokens

| Token set     | Values (from MM)                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Surface**   | backdrop scrim; panel; panel raised (cards in panels); panel inset (rows, callouts); light sheet (letters, radio messages); modal |
| **Ink**       | text, text muted, text faint; rule lines                                                                                          |
| **Tone**      | primary (MM's teal buttons), good (green), warn (amber), bad (red), special (purple), gold (Continue, spec parts)                 |
| **Rarity**    | 5 steps: average, good, great, epic, legendary (green, teal, blue, purple, orange). Main's `RARITY` maps here                     |
| **Stat band** | 4 bands on 0–20: bad, warn, fair, good                                                                                            |
| **Team**      | each team's colour, for row edges and podium tints                                                                                |
| **Type**      | title (panel caps), heading, body, label (small caps), figure (big numbers, tabular), mono-digits for tables                      |
| **Space**     | one scale from `--k` (main's size rule): 1, 2, 3, 4, 6, 8 steps; gutters and panel padding take only these                        |
| **Shape**     | panel edge, card edge, chip radius, hexagon, round portrait                                                                       |
| **Motion**    | fade, slide, fill (bars grow), count (figures roll)                                                                               |
| **Icons**     | one line-icon set: parts, buildings, roles, calls, statuses, nav                                                                  |

## 2. Primitives (28)

| #   | Primitive      | Variants and states                                                                                                                                | Used on (examples)                     |
| --- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | **Panel**      | title, caption, `info`, `aside`; raised, inset, floating; `Unavailable` overlay; empty state                                                       | every screen                           |
| 2   | **Button**     | primary, neutral, danger, accent, gold; icon; full width; busy; disabled with a reason                                                             | every screen                           |
| 3   | **IconButton** | plain, toggle, with `Badge`                                                                                                                        | shell, pagers, improvement toggles     |
| 4   | **MenuButton** | opens up or down; with count                                                                                                                       | 017, 033                               |
| 5   | **Segmented**  | tabs, filter, person switcher, large (series); outlined choice row                                                                                 | 002, 009, 011, 016, 023, 046           |
| 6   | **Pager**      | ‹ value ›; arrows only                                                                                                                             | 004, 016, 048, 050                     |
| 7   | **Dropdown**   | top-bar, inline                                                                                                                                    | 001, 015, 048                          |
| 8   | **Checkbox**   | plain, with label ("Add")                                                                                                                          | 011, 024, 028, 034                     |
| 9   | **Stepper**    | − figure +; ‹ pick ›; with unit                                                                                                                    | 011, 040, 046                          |
| 10  | **Slider**     | single; split (two departments); with a band                                                                                                       | 023, 024                               |
| 11  | **TextField**  | single line                                                                                                                                        | 048                                    |
| 12  | **Swatch**     | colour chip; row; numbered chip picker                                                                                                             | 050                                    |
| 13  | **Tag**        | tone; rarity (`RarityTag`); status chip ("Unchanged ✓"); pill ("45 weeks together"); count `Badge`                                                 | most screens                           |
| 14  | **Stamp**      | boxed word in a tone (VERY SECURE, UNEMPLOYED, ON TARGET, SPEC PART); plate; group of stamps; big verdict (APPROVED)                               | 001, 010, 021, 031, 044, 045           |
| 15  | **Figure**     | big figure (label + value + tone); `Delta` (▲▼ and ±%); fraction (0/4)                                                                             | 013, 016, 022, 039, 043                |
| 16  | **KeyValue**   | rows; inline pair; stacked; with icon; split value; compare tick; highlighted value                                                                | every profile and card                 |
| 17  | **Table**      | sortable; your rows lit; team colour edge; threshold row; grouped rows; dense numeric; cells: flag, logo, stars, token, bar, delta, button, status | 001, 009, 015, 016, 023, 032, 035, 044 |
| 18  | **Bar**        | one primitive with layers: fill, segments (pips), target band, markers (▲ current best, ✓ nodes), split red-zone/good, vertical                    | 004, 017, 021, 022, 023, 030, 040      |
| 19  | **StatTile**   | value out of 20 in a band colour, potential strip, trait mark, trend; range ("10 – 15"); inline bar row (`StatBar`)                                | 004, 006, 008, 010, 028, 043           |
| 20  | **StarRating** | 0–5 in halves; range as outline; potential ghost; input ("at least")                                                                               | 004, 005, 009, 019, 024                |
| 21  | **Gauge**      | half-dial with end labels; ring with %                                                                                                             | 001, 004, 013, 029, 038                |
| 22  | **Chart**      | columns with reference markers and an icon axis, hatched (spec); line or area with projection; bump (positions by lap); timeline row               | 001, 004, 013, 017, 019, 034, 036      |
| 23  | **Token**      | round or hex; rarity ring; icon or art; filled / empty / locked; part-filled (wear)                                                                | 006, 022, 049                          |
| 24  | **Portrait**   | round; with flag, role badge, rating badge; vote ring; stack                                                                                       | 001, 007, 045, 046                     |
| 25  | **Crest**      | team logo or monogram; series logo                                                                                                                 | shell, tables, podium                  |
| 26  | **Popover**    | tooltip; rich card (part, unlock, penalty); warn outline                                                                                           | 008, 023, 044                          |
| 27  | **Notice**     | one line with ⚠ in a tone; inline effect ("Payments −5%")                                                                                         | 021, 039, 040, 048                     |
| 28  | **Legend**     | swatches or tokens with names                                                                                                                      | 001, 004, 022, 035                     |

## 3. Composites (24), made only from primitives

| #   | Composite                                              | Made of                                                                         | Screens                           |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------- |
| 1   | **PersonHeader** (large / compact / chip / row / wide) | Portrait, name, flag, age, StarRating, role heading, Pager                      | 004–011, 028, 034, 042, 043, 050  |
| 2   | **PersonCard**                                         | PersonHeader + KeyValue + Buttons                                               | 005, 007, 043                     |
| 3   | **StatGrid**                                           | StatTiles in a 3×N grid inside a Panel                                          | 004, 006, 008, 010                |
| 4   | **BondTrack**                                          | Tag + Bar (markers) + Tokens (locked levels) + Popover                          | 004, 007, 008                     |
| 5   | **ChipList**                                           | Tags with icons; temporary / permanent legend                                   | 004                               |
| 6   | **MessageRow**                                         | Portrait, sender, Tag, subject, preview, time                                   | 002                               |
| 7   | **Letter**                                             | light sheet: header, Portrait, body, ChoiceBar                                  | 002                               |
| 8   | **TermRow**                                            | label, Stepper(s), Checkbox, MoodCard (face + quote)                            | 011                               |
| 9   | **PartCard**                                           | Token (part icon), name, stat, RarityTags, Bars, KeyValue, Stamp (spec), Notice | 021                               |
| 10  | **ComponentCard**                                      | hex Token, effect lines, risk mark, locked                                      | 022                               |
| 11  | **SlotGrid**                                           | Tokens or cards: empty / filled / locked, header strip, footer figure           | 006, 012, 022, 023, 025           |
| 12  | **DesignBoard**                                        | SlotGrid + connector + PartTile + Bars (range, red zone) + KeyValue             | 022                               |
| 13  | **ActionCard**                                         | title, caption, status Tag, Button                                              | 019                               |
| 14  | **ProgressRow**                                        | striped fill Bar, label, days, Buttons                                          | 001                               |
| 15  | **NewsCard**                                           | art, heading, body, Button                                                      | 001                               |
| 16  | **ChoiceCard** / **OfferCard**                         | art or logo, body, perks, Stamp, Button; selected                               | 013, 051                          |
| 17  | **MenuCard**                                           | icon + title strip, caption, art with a plate; strip variant                    | 047                               |
| 18  | **Accordion**                                          | header strip, chevron, status Tag or ✓, body                                    | 024, 025, 039, 050                |
| 19  | **WorldLabel**                                         | label pinned to a 3D point: icon, name, level; rich ship bubble                 | 017, 029, 031                     |
| 20  | **SceneWindow**                                        | live 3D or a still with a caption plate and header                              | 001, 012, 015, 017, 019, 042, 050 |
| 21  | **Schematic**                                          | ship plan with PartTiles anchored to points by connector lines                  | 039                               |
| 22  | **VoteColumns**                                        | toned boxes with PortraitStacks, counts, Verdict                                | 045, 046                          |
| 23  | **PodiumCard**                                         | Portrait, name, time, big position, points, Crest; raised winner                | 042                               |
| 24  | **RadioCard**                                          | quote, 1–2 Buttons; amber or light                                              | 031, 038, 041                     |

## 4. Shell (6)

| #   | Piece              | Variants                                                                                                                                                                                 |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **TopBar**         | office (crest, title, BalancePill, standings, next race, Admiralty, bell, menu); design phase (StepChips); race (context items with meters, sponsor target Stamp); event ("In progress") |
| 2   | **BottomNav**      | office tabs with badges and progress stripes; race-day tabs; footer only (Cancel + Continue)                                                                                             |
| 3   | **ContinueButton** | go; must respond; with a second line; disabled                                                                                                                                           |
| 4   | **Modal**          | title, body, footer; over a scrim                                                                                                                                                        |
| 5   | **Columns**        | the 2-, 3- and 4-column panel layouts MM uses; one grid, sized by `--k`                                                                                                                  |
| 6   | **Backdrop**       | dimmed live 3D (no blur)                                                                                                                                                                 |

## 5. Race HUD pieces (battle royale; reuse main's where it has them)

| Piece                                                                         | Main has             |
| ----------------------------------------------------------------------------- | -------------------- |
| **Leaderboard** (dense rows, ▲▼, status, threshold rows)                      | ✅ in the HUD        |
| **Minimap** with filters                                                      | ✅ `minimap.ts`      |
| **Ticker** (feed)                                                             | ✅                   |
| **ShipStrip** / **ShipHeader** (Portrait, position, Gauge, Bars, MenuButtons) | partly (`vitals.ts`) |
| **RaceClock** + **SpeedControl**                                              | —                    |
| **OptionList** (calls with pip ratings)                                       | —                    |
| **GapStrip**                                                                  | —                    |
| **Banner** (session, race ending)                                             | partly (`ends.ts`)   |

## Totals

- **Tokens:** 11 sets.
- **Primitives:** 28.
- **Composites:** 24.
- **Shell:** 6.
- **Race HUD:** 8, about half already on main.

**66 pieces in all (not counting tokens), covering every MM screen that maps to our mechanics.** Screens MM has that we don't need (practice, car setup, tyre sets, date pickers, face editors) add nothing to the kit.
