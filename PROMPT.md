# Portolan

Portolan is a naval battle royale for iPhone and iPad, set on a hand-built ocean planet that looks like an explorer's chart come to life. It takes place in an Age of Discovery that never had people in it. The ships are the characters. They are alive, they sail themselves, they have names and reputations, and the player is one of them. Ten ships ride a great ocean current across the planet, peel off into the region of their choosing, and fight to be the last one afloat while a storm closes in. Along the way they claim the sea itself: a ship that sails out of its own waters and back again closes a loop, and the sea inside floods with its colour. Held sea repairs, pays, and protects the ship that owns it. Doubloons earned on the water buy chests from the player's companion gull, and chests bring fittings, weapons, and consumables that turn a weak little pinnace into a terror within one match. Between matches the player climbs a league of thirty rival ships, grows its gull, inks its own chart of the world, and meets captains that remember how it plays.

Everything in the game is drawn as ink, hatching, and watercolour on parchment: the planet, the sea, the ships, the sky, the interface, and the lettering. Every image, sound, letter, and note is generated in code.

This document describes the finished game. Everything in it is required. Build all of it, to the standard described below.

## The standard

The game is judged by an unbelievably harsh critic who has played the best-looking and best-designed games ever made and forgives nothing. The critic judges two things with equal weight.

- **The art.** Every frame, in every region, at every hour and in every weather, looks like a page from one master illustrator's hand: a living portolan chart, drawn with confidence, rich in detail, perfectly composed, and readable at a glance on a phone held at arm's length. There is no lesser region, no lesser hour, no lesser ship, and no lesser screen. The storm, the night, and the menus meet the same standard as the signature shot of a loop flooding with colour.
- **The play.** Every system gives the player real decisions. Every match has a rhythm of calm, tension, and payoff. The controls feel immediate and weighty under a thumb. The captains are worth outwitting. The player always understands why it won or lost, and wants another match.

Every capture listed in [Captures](#captures) is judged against this document. Each must be impressive on its own: a frame worth putting on the App Store page.

## The world

### The planet

The world is a single ocean planet, hand-built and the same in every match and every career. Its curve is always visible: from deck level the horizon bends away, and distant islands, lighthouses, and ships sink below it hull first, the mastheads the last thing to drop from view. Its size is set so that a caravel under plain sail in a fair wind sails once round the equator in about six minutes.

Twelve regions sit at the twelve vertices of an icosahedron: one at each pole and two rings of five between them, the rings offset so every region borders five others at an equal distance. Open sea runs between the regions, broad and deep, crossed by currents and wind. That open water is where the greediest loops are drawn.

Every island, reef, channel, landmark, harbour, and lighthouse is placed by design. The geometry that realises the design (terrain detail, rock strata, foliage, planking, ice) is generated in code, and its layout is fixed. The world is described as data that names what stands where, and the generators build it.

### The regions

Each region has its own palette of pigments, its own landforms, its own wildlife, its own way of playing, and one landmark. Enclosing a region's landmark inside your own waters grants that landmark's perk for as long as you hold it.

| | Region | What it looks like | How it plays | Landmark and perk |
|---|---|---|---|---|
| 1 | **The Ice Crown** (north pole) | Pack ice, tilted bergs, blue-white and silver inks, aurora at night, seals hauled out on the floes | Floes drift on a slow rotation, so lanes open and close. Ships move slowly among them. | **The Crown Light**, a lighthouse on an ice-bound skerry. Every ship inside its beam is marked on your chart. |
| 2 | **The Fjords** | Sheer cliffs streaked with falls, dark pine, deep green water, mist | Long narrow channels: chokepoints where trails are broken and ambushes are laid | **The Great Falls.** Your hull repairs twice as fast inside your waters. |
| 3 | **The Basalt Stacks** | Hexagonal columns, sea arches, puffin colonies, drifting fog banks | A maze of pillars for ambush and escape | **The Arch.** Your weapons reload a third faster. |
| 4 | **The Kelp Shallows** | Golden-green kelp forests swaying under clear water, otters, rocky islets | Kelp slows any ship inside it and hides it from ships outside it | **The Kelp Cathedral**, a grove of towering kelp. Your ship does not show on rival charts while it is in your waters. |
| 5 | **The Amber Shoals** | Tidal flats and sandbars in warm gold light, wading birds, rippled sand | A visible tide opens and closes passages on a fixed rhythm | **The Sandbar Light.** Your gull's chests arrive twice as fast. |
| 6 | **The Weeping Isle** | One towering cloud-forest mountain, cascades falling into the sea all around it | A single great island whose enclosure is the largest claim in the world | **The island itself.** Enclosing it doubles your territory income. |
| 7 | **The Coral Atolls** | Ring lagoons, white sand, palms, turquoise shallows, sea turtles | Reef mazes with single channels. A lagoon is a fortress for whoever holds its entrance. | **The Great Lagoon.** Inside it you repair at harbour speed and rivals cannot fire on you. |
| 8 | **The Spice Isles** | Dense jungle, flowering trees, ochre and vermilion | The richest loot and the most crowded landfall | **Spice Harbour.** Calling your gull costs half. |
| 9 | **The Fire Archipelago** | A smoking volcano, lava meeting the sea in steam, black sand, falling ash | Hot water and embers damage hulls. Loot here is the most lucrative in the world. | **The Caldera.** It erupts on a rhythm, raining doubloons into your waters. |
| 10 | **The Mangrove Labyrinth** | Arching roots, shaded green channels, still water, herons | Tight twisting waterways and close-quarters fights | **The Root Gate.** Rivals in your waters are slowed twice as much. |
| 11 | **The Glass Sea** | A vast calm mirror under open sky, whales surfacing, glowing blue-green with bioluminescence at night | Open water with no cover at all | **The Whale Road.** Your ship sails a fifth faster everywhere. |
| 12 | **The Maelstrom** (south pole) | A great whirlpool, spiral currents, spray, a sky that turns with it | Currents fling ships round the vortex, a slingshot for the bold and a trap for the careless | **The Eye.** Leaving the vortex under your own colour launches you at full speed. |

Each landmark is the most beautiful thing in its region and reads clearly on the chart from orbit.

### Lighthouses and harbours

Lighthouses stand on headlands throughout the world, and each region has at least one harbour. They are of unknown origin and the world treats them as entirely natural: well kept, warmly lit, and beautiful, never ruined, spooky, or haunted. Lighthouse beams turn at night and are part of how the player navigates. There are no settlements, houses, villages, or any sign that people ever lived here.

### Life

There are no humans anywhere in the world. Its life comes from animals, wind, water, weather, light, and the ships.

Animals live in their regions: gulls everywhere, puffins on the stacks, seals on the ice, otters in the kelp, wading birds on the shoals, turtles in the atolls, herons in the mangroves, whales in the Glass Sea, and dolphins that run alongside ships in open water. They are drawn in the same ink as the world, read clearly by silhouette and motion, and react to ships: flocks lift as a ship approaches, dolphins come to ride a bow wave, whales sound when cannon fire starts.

### Wind, currents, tides, and time

- **Wind.** One planetary wind field, shifting slowly through each match, drives the clouds, the swell, the spray, the smoke, the flags, and the foliage. It changes a ship's speed by up to fifteen percent with its point of sail, and the sails always show the truth: full and drawing on a reach, flattened close to the wind, billowing forward on a run.
- **Currents.** Visible fast lanes of foam and ink streaks run between regions. They carry any ship along them.
- **Tides.** Tides rise and fall on a visible rhythm. They matter most on the Amber Shoals and in the Atolls, where they open and close passages.
- **Weather.** Each match's seed sets its weather, which drifts across the planet with the wind and can be seen coming on the horizon and on the chart. Fog banks hide every ship and trail inside them from anyone outside, and trails laid in fog never show on rival charts. Rain squalls bring stronger, gusting wind, a rougher sea, and shorter sight. Calms drop the wind, slow every ship, and lay the sea flat as a mirror. Between them the weather is fair. Each region has its tendencies: fog in the Fjords and the Basalt Stacks, squalls on the open sea, calms on the Glass Sea and the Amber Shoals. The storm is separate from the weather and always comes.
- **Time of day.** Each match starts at an hour its seed sets, and the sun keeps moving through the match, so ten minutes of play cover a visible stretch of the day: afternoon into dusk, the blue hour into night, dawn into morning.

## Being a ship

The player is a ship, and so is every rival. Ships never have faces or eyes. They show what they feel through their bodies:

- **Movement.** A ship heels into turns and under a press of sail, lifts on swells, drives its bow through chop, and surges when a gust fills its canvas.
- **Sails and flags.** Sails tighten when the ship is eager, shiver when it is hit, hang slack and torn when it is badly damaged. Pennants stream in the wind.
- **Light.** Stern lanterns glow brighter in battle and gutter when the hull is low.
- **Damage.** Holes, splintered rails, smoke, fire, and a list that deepens as the hull fails.
- **Sinking.** A sinking ship rolls, fills, and slips beneath the surface, with its pennant last to go. The sea closes over it in rings of ink.

The player's ship is its own body. Fittings become part of that body and change how it looks: copper sheathing glints at the waterline, a ram bow juts from the stem, swivel guns line the rails.

### Ship forms

As the player climbs the ranks, its ship can grow into new forms. Before each match the player chooses which unlocked form to sail. Captains choose theirs by temperament.

| Form | Unlocked at | Speed | Turning | Hull | Guns | Purse |
|---|---|---|---|---|---|---|
| **Pinnace** | The start | Fastest | Tightest | Lightest | One light gun a side | Smallest |
| **Caravel** | Levante (tier 2) | Fast | Tight, and points closest to the wind under its lateen rig | Light | Two a side | Small |
| **Carrack** | Ostro (tier 4) | Steady | Wide | Heavy | Three a side, and a heavy stern castle | Large |
| **Galleon** | Ponente (tier 6) | Slowest | Widest | Heaviest | Four a side | Largest |

Each form is built by the same procedural shipwright with its own hull lines, rig, castles, and ornament. Every ship has planking, wales, gunports, deadeyes, shrouds, ratlines, sail seams, reef points, and carved stern ornament of scrollwork, knots, waves, and sunbursts. The rigging never clips through the sails.

### The companion gull

Every ship has a companion gull, and the player's gull is its partner through the whole career. It is a herring gull drawn in ink and grey wash with black wingtips. It rides the masthead when idle, wheels overhead when the ship is in danger, and calls when it spots something.

In a match the player calls the gull by spending doubloons. The gull flies off over the horizon and returns carrying a chest, circles the ship, and drops it onto the deck. A chest takes seconds to arrive. Rivals that can see the gull can see where it is going, and a ship that sinks before its chest lands loses the chest to the sea for anyone to take.

Across the career the gull grows. Treasure brought home from matches buys its upgrades in the harbour:

| Trait | What it does | Levels |
|---|---|---|
| **Talons** | The rarest pigment tier the gull can carry, from verdigris up to gold leaf | 4 |
| **Wings** | How fast a called chest arrives | 4 |
| **Eye** | The gull scouts ahead and marks loot sites and ships beyond the horizon, at a growing range | 4 |
| **Beak** | When a rival breaks your trail, the gull snatches back a growing share of your spilled purse | 3 |
| **Dive** | A dive at the nearest rival that reveals it and slows it for a moment, on a cooldown that shortens with each level | 3 |

The gull's plumage records its history: every level adds marks in the pigment of that tier, and a gull at the top of every trait has gold-leaf wingtips.

## A match

### Overview

A match is ten ships: the player and nine captains drawn from the league near the player's rank. It lasts about ten minutes. Each ship has one life. The last ship afloat wins. Every ship is ranked by the order in which it sank, and the player earns rank points from its finishing position, the sea it claimed, and the ships it sank. A match is fully determined by the career state, the match seed, and the player's inputs.

### The Great Current

Every match opens with all ten ships riding a fast, glowing current that sweeps across the planet along a route the seed sets, passing through several regions. At the same moment the storm's origin is revealed on the chart and on the horizon as a dark bruise of wet ink.

The player swipes up to break off, and its ship peels out of the current into whatever region it is passing. Each captain breaks off where its temperament and its knowledge of the player tell it to, and the player sees them go. A ship that rides to the end of the route is thrown off there. Where a ship slows after breaking off, a small disc of home waters inks itself around it.

The opening is spectacular: the ships race side by side under full sail, regions sweep past and over the curve, and the camera settles low and close for the break-off. The current remains for the rest of the match as a fast highway that everyone knows the route of.

### Territory

- **Home waters.** The sea a ship owns, washed in its colour, with an inked border in its pigment.
- **Laying a trail.** A ship that leaves its waters lays an open trail behind it, drawn as a pen stroke in its colour and pattern.
- **Closing a loop.** When the ship returns to its own waters, the loop closes. Everything enclosed by the trail and the old border becomes its sea, including sea that belonged to rivals, and its purse is banked.
- **Breaking a trail.** A rival crossing an open trail breaks it. The trail washes away, the trail's owner loses the loop it was building, and its unbanked purse spills into the sea as floating coins at the break. The ship itself takes no damage. Crossing your own trail does nothing.
- **What home waters give.** Inside its own waters a ship repairs slowly, sails a tenth faster, and calls its gull for less. Held sea pays a steady income. Rivals inside a ship's waters are slowed and are marked on that ship's chart.
- **Landmarks.** Enclosing a landmark grants its perk while the landmark stays inside your waters.
- **The storm.** Sea swallowed by the storm loses its owner and its colour runs and washes out.
- **Leading.** The ship holding the most sea flies a gold-leaf pennant that can be seen from far away. Sinking it pays double.

### Doubloons

| Source | How |
|---|---|
| **Sailing** | Distance sailed on an open trail fills the purse. The purse is banked only when the loop closes, so the longer the trail, the more there is to lose. |
| **Territory** | Held sea pays a steady income straight into the bank. |
| **Plunder** | A sunk ship spills its purse and pays a bounty to the ship that sank it. |
| **Finds** | Wrecks, flotsam, drifting bottles, and caches on islands. Sail through flotsam to scoop it. Hold position beside a wreck or cache for a few seconds to take it. Richer regions hold richer finds. |

Doubloons in a match buy gull calls. At the end of the match, a share of the banked doubloons, multiplied by finishing position, comes home as treasure.

### Chests and loot

Rarity follows the precious pigments of a manuscript illuminator, and a chest's tier is readable before it lands by the colour of its glow and the gull's effort carrying it:

1. **Iron-gall** (black)
2. **Verdigris** (green)
3. **Ultramarine** (blue)
4. **Vermilion** (red)
5. **Gold leaf**

Opening a chest offers three items, and the player chooses one. A fitting replaces the one in its slot, and the old one is dropped as a chest for anyone. A consumable joins the three consumable slots, stacking with its kind.

A sunk ship drops its purse and one of its fittings as a chest.

### Fittings

Fittings last for the rest of the match. A ship has six slots, and every form has all six.

| Slot | Fittings |
|---|---|
| **Bow** | **Stem post** (the starting ram: weak), **iron ram** (heavy ramming damage), **cutwater** (ramming also breaks the target's open trail, and the target cannot lay a new one for a few seconds) |
| **Broadside** | **Light guns** (the starting guns: short range), **long guns** (long range, slow reload), **swivel guns** (rapid fire, short range), **chain shot** (tears sails and slows the target), **heated shot** (sets fires that burn the hull over time) |
| **Stern** | **Stern chasers** (fire astern at pursuers), **powder kegs** (dropped astern, explode under pursuers), **mortar** (lobs shells over islands at a point you choose) |
| **Rig** | **Spare canvas** (faster), **lateen mizzen** (tighter turns), **storm sails** (no speed loss in the storm or in high wind) |
| **Hull** | **Copper sheathing** (faster, and immune to the Fire Archipelago's hot water), **doubled planking** (more hull), **pumps** (repair slowly anywhere) |
| **Lookout** | **Stern glass** (a rear-view inset showing the sea astern, framed as a spyglass lens), **crow's nest** (raises the camera to see farther over the curve), **lookout** (ink marks at the screen's edge pointing to ships out of view) |

Every fitting comes in the five pigment tiers, and its tier scales its strength. Higher tiers enter the loot pool as the player rises in rank.

### Consumables

| Consumable | Effect |
|---|---|
| **Patch kit** | Restores hull over three seconds |
| **Ward** | A shimmering aura of St Elmo's fire that absorbs damage and makes your open trail unbreakable for a few seconds |
| **Gust** | A burst of speed |
| **Fog flask** | Hides your ship and trail from every rival chart and lookout for a while |
| **Flare** | Reveals every ship within a wide radius, to you alone |

### Combat

Ships have hull points according to their form and fittings. Hull is lost to cannon fire, ramming, fire, reefs and rocks struck at speed, the Fire Archipelago's hot water, and the storm. Ramming damage scales with closing speed, and the rammer takes a little damage too.

Broadsides fire on their own whenever a rival is inside a side's arc and range, so the player's job is to bring the ship to bear. Fittings that need a target (the mortar, the gull's dive) aim themselves with a tap and can be aimed by hand with a drag.

Cannon fire is drawn as ink: muzzle smoke in grey wash, shot as small dark strokes, splashes as rings and spray, hits as splinters and a shiver through the target's sails.

### The storm

The storm starts at the origin its seed sets, which can be anywhere on the planet, and closes in phases toward a final calm sea that can be anywhere too. Each phase is announced on the chart and shown on the horizon before it moves, then sweeps across the sea and holds. Inside the storm, ships lose hull at a rate that rises each phase, sails labour, and visibility drops. The storm swallows territory as it goes. The final calm is small enough that the last ships must fight.

The storm is beautiful: a wall of wet, bleeding ink and driving pen-stroke rain, lit by gold-leaf lightning, with the sea beneath it heaving and grey.

### Sinking and the end

When the player's ship sinks, the camera rises to watch the sea close over it, then the match plays out on the chart, and the player can skip straight to the results, with the rest of the match resolved at once. When one ship remains, it is the winner.

### The results

The results screen explains the match. It shows:
- the finishing position, sea claimed, ships sunk, and treasure brought home
- a short timeline of the moments that decided the match: where the player broke off the current, the loops it closed, the trails it lost, the chests it chose, the fights, and how it sank or won
- the rank points gained or lost, inked onto the wind rose
- the league table moving to its new order

It ends with the next match: the nine captains the player will face, each with its card.

## The career

### Rank

Rank climbs the eight winds of the portolan wind rose, clockwise from the north-east to the north. Each tier inks one point of the rose. The top of the rose is the top of the league.

1. **Greco**
2. **Levante**
3. **Scirocco**
4. **Ostro**
5. **Libeccio**
6. **Ponente**
7. **Maestro**
8. **Tramontana**

Each tier holds 100 rank points. Points rise and fall with each match, but a tier, once reached, is never lost. Each new tier unlocks higher pigment tiers in the loot pool and, at Levante, Ostro, and Ponente, a new ship form.

### The league

The league is thirty named captains and the player. Each match draws the nine captains nearest the player's rank. Between matches, the captains' own results against one another are resolved from the career state, so the table keeps moving and captains rise and fall on their own.

A captain's rank shows in how well it plays and what it carries. Higher-ranked captains react faster, lead their shots better, judge loops and the storm more shrewdly, use their items at the right moment, and start with better fittings and stronger gulls.

### The captains

Every captain is a ship with a name, a temperament, a preferred form, two pigments, and an emblem on its mainsail. Temperament decides how it sails:

- **Hunters** stalk open trails and wounded ships.
- **Expanders** claim great sweeps of sea with patient loops.
- **Raiders** break trails for purses and run.
- **Turtles** hold rich home waters and punish anyone who enters them.
- **Opportunists** wait at the edge of fights and take what is left.
- **Gamblers** draw enormous loops and chase gold-leaf chests.

| Captain | Meaning | Temperament | Form | Pigments | Emblem |
|---|---|---|---|---|---|
| **Saetta** | Arrow | Hunter | Caravel | Vermilion, black | Arrowhead |
| **Lanza** | Lance | Hunter | Carrack | Iron grey, gold | Crossed lances |
| **Astore** | Goshawk | Hunter | Pinnace | Umber, white | Feather |
| **Fiera** | Wild beast | Hunter | Galleon | Crimson, ochre | Sunburst |
| **Morsa** | Vice | Hunter | Carrack | Black, verdigris | Iron knot |
| **Meridiana** | Meridian | Expander | Galleon | Ultramarine, gold | Meridian arc |
| **Marea** | Tide | Expander | Carrack | Teal, cream | Waves |
| **Aurora** | Dawn | Expander | Caravel | Rose madder, gold | Rising sun |
| **Lontana** | Far away | Expander | Galleon | Indigo, silver | Eight-point star |
| **Rosa dei Venti** | Wind rose | Expander | Carrack | Ochre, ultramarine | Wind rose |
| **Gazza** | Magpie | Raider | Pinnace | Black, white | Diamond |
| **Volpe** | Fox | Raider | Caravel | Orange, umber | Crescent |
| **Rapina** | Plunder | Raider | Pinnace | Vermilion, white | Key |
| **Scheggia** | Splinter | Raider | Caravel | Ash, verdigris | Lightning stroke |
| **Ladra** | Thief | Raider | Pinnace | Purple, gold | Coin |
| **Testuggine** | Tortoise | Turtle | Galleon | Moss green, ochre | Hexagon |
| **Rocca** | Fortress | Turtle | Galleon | Stone grey, vermilion | Tower |
| **Ancora** | Anchor | Turtle | Carrack | Navy, white | Anchor |
| **Bastia** | Bastion | Turtle | Carrack | Brick red, cream | Battlement |
| **Quieta** | The still one | Turtle | Galleon | Sage, silver | Circle |
| **Pazienza** | Patience | Opportunist | Carrack | Slate, ochre | Hourglass |
| **Ombra** | Shadow | Opportunist | Caravel | Charcoal, indigo | Eclipse |
| **Gufo** | Owl | Opportunist | Caravel | Umber, cream | Two rings |
| **Avvoltoio** | Vulture | Opportunist | Galleon | Black, bone | Broken wheel |
| **Sorniona** | The sly one | Opportunist | Pinnace | Verdigris, gold | Spiral |
| **Fortuna** | Fortune | Gambler | Galleon | Gold, vermilion | Wheel of fortune |
| **Azzardo** | Hazard | Gambler | Caravel | Crimson, black | Die |
| **Tempesta** | Storm | Gambler | Carrack | Storm blue, white | Thunderbolt |
| **Cometa** | Comet | Gambler | Pinnace | Gold, indigo | Comet |
| **Sirocchia** | Sister | Gambler | Caravel | Saffron, teal | Flame |

Every captain sails in a way the player can learn to recognise: its course, its loops, its distance from fights, and the moment it runs.

### How captains think

A captain decides each tick from what it can actually see, its temperament, its rank, its memory of the player, and the match's seeded randomness. It sees only what its own ship and its own gull could see: nothing beyond the horizon unless its gull has scouted there. It follows exactly the same rules as the player and acts only through the same controls.

Captains telegraph their intent. A hunter's course visibly bends toward an open trail before it strikes. A gambler visibly commits to its loop. A turtle turns to face an intruder. On the chart, ships in sight carry a short inked arrow of where they are heading.

### Captains learn the player

The career keeps a profile of how the player plays: where it breaks off the current, how large its loops are, how often it raids trails, how low its hull gets before it runs, which fittings it favours, and how it handles the storm. Each captain learns from the matches it shares with the player, and adapts. If the player always draws huge loops, hunters patrol beyond its border. If it always breaks off into the Spice Isles, more captains break off there. If it always runs when wounded, they press when it is wounded.

What a captain has learned is visible. Its card before a match says it in one line, such as *"Has learned you break off at the volcano."* Then it shows in how the captain sails. Learning fades over matches, so a player that changes its style outwits the captains until they catch up.

Captains also remember being sunk. A captain the player sank hunts the player harder in their next match together, and its card shows its record against the player.

### The career chart

The player keeps its own portolan of the world. A new career's chart is mostly blank parchment with the coastlines barely sketched. As the player sails, the chart inks in what it has seen: coastlines, reefs, currents, lighthouses, harbours, landmarks, wrecks, and caches. Loot sites the player has discovered are marked on its chart in later matches. Each region's name is lettered onto the chart in calligraphy the first time the player enters it. A finished chart, every region fully inked, is a beautiful thing to own.

### The harbour

Between matches the player's ship rests in a harbour, and the harbour is the menu: a calm, lamp-lit scene drawn on parchment with the ship at its mooring and the gull on the masthead. From here the player:
- chooses its ship form
- spends treasure on the gull
- reads the league table
- reads the cards of the nine captains it will face
- unrolls its career chart
- sets sound, music, haptics, and reduced motion
- sets sail

### The first voyage

A new career begins with a guided first match against the nine lowest captains, sailing at their gentlest. It teaches through play, with a few words of lettering at the right moments: breaking off the current, steering, closing a first loop, calling the gull and choosing from a chest, firing a broadside, and running from the storm. The first loop always succeeds. From the second match on, the player is on its own.

### Saving

The career saves on the device after every match. A match in progress is saved whenever the app goes to the background and resumes exactly where it stopped. From that tick it continues identically to a match that was never interrupted.

## Controls

The game is played in landscape on iPhone and iPad, entirely by touch.

- **Steering.** The left thumb lands anywhere on the left half of the screen and a stick appears beneath it. Pushing left or right turns the ship, and the ship answers with the momentum and turning circle of its form. Flicking the stick up or down steps the sails between reefed, plain, and full: full is faster with wider turns, reefed is slower with the tightest turns.
- **Actions.** The right side holds the gull call with its price, the three consumable slots, the button for any fitting that needs aiming, and the **head home** button. Tap to use. Drag from a button to aim by hand.
- **Head home.** Holding it sails the ship by the shortest safe route back to its own waters, to close the loop. The route is predictable, and rivals know it.
- **The chart.** Tapping the compact chart pauses the match and zooms out into the full chart in one continuous move. Drawing a course on the chart with a finger sets the ship's route. Tapping the chart's edge zooms back down to the deck, the match resumes, and the ship sails the drawn course until the player touches the stick again.
- **The camera.** A chase camera sits behind and above the ship and swings with its turns. Pinching moves it between low over the deck and high behind the masts. Pinching out further pauses the match and lifts the camera off the sea entirely and into the chart, and pinching back in returns to the deck and resumes.
- **Breaking off the current.** A swipe up.
- **Haptics** mark every important moment: closing a loop (scaled to its size), a rival touching your open trail, a hit taken, a broadside fired, a chest landing, the storm's edge, crossing into your own waters, and sinking.

## The interface

### The match screen

Every element is drawn as ink on scraps of parchment, sits inside the safe areas, and stays out of the centre of the frame.

- **Top left:** the hull bar as a drawn rope that frays as it empties, with the ward's glow around it when active. The stern glass inset sits below it when fitted.
- **Top centre:** ships still afloat, and the storm's next move as a dial.
- **Top right:** the compact chart, a round portolan inset showing your waters, nearby rivals in sight, loot your gull has marked, and the storm.
- **Lower right:** the gull call, the purse (a pouch that swells with unbanked doubloons), the bank, the consumable slots, the aimed-fitting button, and the head home button.
- **Lower left:** the floating stick and the current sail setting.
- **Edges:** lookout marks pointing to ships out of view, when fitted, and a darkening ink vignette on the side a threat is coming from.
- **Along the bottom:** the six fittings as small inked icons in their pigment tiers.

### Lettering

All text in the game is hand lettering generated in code. The alphabet is a complete Italian chancery hand of the sixteenth century, the cancelleresca: upper and lower case, numerals, and punctuation. Each glyph is defined as pen strokes and rendered with a simulated broad-edged nib at a fixed angle, so thick and thin follow the stroke direction, and the ink bleeds slightly into the paper fibres. The same hand letters the title, region names on the chart, captain names, numbers on the interface, and the few words of the first voyage. It is crisp and legible at the smallest size it is used on an iPhone. Text is sparing, and every indicator that can be graphic is graphic.

### The title

The game opens on the planet turning slowly over parchment while *Portolan* letters itself in, stroke by stroke, then the harbour.

## The look

The whole world is a living portolan chart: the work of a master illustrator in iron-gall ink, hatching, and watercolour on parchment, set in motion. It is rich, detailed, confident, and warm. References: Pentiment's manuscript illumination, Okami's brush and paper, Sable's line art over flat colour, Return of the Obra Dinn's discipline of shading by line, and the margins and wind roses of sixteenth-century Italian and Catalan portolan charts.

### The rendering

- **Paper.** Every surface sits on parchment: a grain of fibres, gentle stains and foxing, and a deckle of darker tone at the frame's edge. The paper is anchored to the world, never painted across the screen, so nothing swims through it when the camera moves.
- **Ink lines.** Every silhouette and crease is outlined in ink. Line weight swells on silhouettes, thins on interior detail, and fades with distance so the far horizon stays delicate.
- **Hatching.** Shadow is drawn, not darkened: parallel hatching deepens into cross-hatching as light falls away, following the form of the surface.
- **Watercolour.** Colour is laid as flat washes of pigment, darker where it pools at the edges, with granulation in the deeper washes and soft bleed where washes meet.
- **Pigments.** The palette is the illuminator's: iron-gall black, sepia, umber, ochre, verdigris, malachite, ultramarine, indigo, vermilion, rose madder, lead white, and gold leaf. Gold leaf is the only thing in the world that shines, and it catches the light as the camera moves.
- **One style module.** Every material, every effect, and the interface draw on one shared definition of the palette, the line rules, the hatching, and the washes, so the whole frame is one illustrator's hand.

### The sea

The sea carries the style. Open water is bare parchment washed with depth: deep indigo, through ultramarine shelves, to verdigris shallows and pale lagoons. Coastlines are traced by rings of fine parallel lines spreading outward from the shore, as on the old charts. Waves are small animated pen strokes that ride the swell in the direction of the wind. Foam is lead white laid with a dry brush at coasts, reefs, bows, and wakes. Shallows show their floor in hatched rock, coral, sand ripples, and swaying kelp.

### Territory and trails

- **Trails** are pen strokes laid live behind each ship, with the pressure and slight wobble of a nib. Each team's trail has a pattern as well as a colour: solid, dashed, dotted, double, and so on, so every ship is distinguishable without colour.
- **Closing a loop** is the signature moment. The enclosed sea floods with the owner's pigment as a watercolour wash blooming inward from the trail, wet edges spreading, granulating, then drying to a flat tint. It plays with a rising chord, a burst of coins into the purse, a haptic, and a camera that pulls back in proportion to the size of the claim.
- **Borders** are inked lines in the owner's pigment with a narrow band of hatching inside.
- **Broken trails** wash away in runs of ink.

### Sky, light, and weather

- **The sky** is a painted wash, deepening toward the zenith, with clouds outlined in ink and shaded by hatching. The sun is a gold-leaf disc with drawn rays, as on a chart's border.
- **Each hour** has its own hand-picked palette: rose and pale gold at dawn, clear ultramarine at midday, amber and vermilion at golden hour, violet at the blue hour.
- **Night** is drawn as if by candlelight: indigo washes, silver-ink highlights, gold-leaf stars, a moon in silver, warm lantern and lighthouse glows. Every ship and coast stays readable.
- **Weather.** Fog is paper left unpainted. Rain is fine diagonal pen strokes. Spray is flicked lead white. Smoke and ash are grey wash. Lightning is a crack of gold leaf.
- **The aurora** over the Ice Crown is ribbons of verdigris and rose madder. **Bioluminescence** in the Glass Sea traces wakes and whales in glowing blue-green ink.

### From deck to chart

Opening the chart pauses the match, and the world holds still mid-motion like a finished illustration: spray hangs in the air, smoke stops curling, the gull's wings stay spread. Then the camera lifts smoothly from behind the ship to high above the planet, and the illustrated world becomes the chart: the planet unrolls onto parchment in a portolan projection, with rhumb lines radiating from wind roses, coastlines in ink, region names in calligraphy, territory as coloured washes, ships as small inked silhouettes, and the storm as a bruise of wet ink. Closing the chart plays the same move in reverse, and the world comes back to life the moment the camera reaches the deck. The globe and the chart are the same world drawn two ways, in one unbroken zoom with no cut, fade, or loading. The match stays paused the whole time the chart is open.

### Readability

Every team's colour stays distinct against parchment and sea at every hour and in the storm. Threats are readable at a glance on an iPhone: ships by silhouette, trails by pattern, chests by glow, the storm by its edge.

## Sound and music

Every sound and every note is synthesized in code.

- **The sea and the ship.** Wind in the rigging that rises with speed, the hull's creak, the bow wave, canvas filling and flogging, rain, surf on reefs, ice grinding, steam hissing at the volcano, the Maelstrom's roar.
- **Life.** Gull calls, puffins, seals, whale song in the Glass Sea.
- **Combat.** Cannon, splashes, splinters, fire, the long groan of a sinking.
- **Reward.** Coins with a pitch that rises as they stream in, the chord of a loop closing, the chest landing on deck.
- **The score** is period music played on synthesized instruments: lute, recorder, viol, psaltery, and frame drum. Each region has its own mode and motif. The score adapts in layers to calm sailing, danger nearby, battle, the storm's advance, the final calm, victory, and defeat, and changes between them on the beat.

Audio starts on the first touch.

## Performance and platform

- **Delivery.** The game is a TypeScript, three.js, and Vite web game, wrapped as an iOS app with Capacitor. `npm start` runs it locally in the browser. One command builds the iOS app and runs it in the iOS Simulator.
- **Offline.** It runs entirely on the device with no network.
- **Generated, not imported.** Every texture, mesh, letter, sound, and note is generated in code. There are no image, model, font, or audio files in the game's source code or its build.
- **Devices.** iPhone 13 and newer, and iPads with an A14 or M1 chip or newer.
- **Frame rate.** A steady 60 frames per second through a full match, with every ship, effect, and the storm active, without thermal throttling. Generated textures are made once at startup, not every frame.
- **Startup.** From launch to the title in under five seconds on the oldest supported device.
- **Screens.** Every screen fits every supported iPhone and iPad in landscape and respects the safe areas around the notch, Dynamic Island, and home indicator.

## Architecture

All game rules live in one deterministic simulation with no rendering code: sailing, wind, weather, currents, tides, territory, trails, doubloons, chests, fittings, consumables, combat, the storm, captains' decisions, sinkings, and the end of the match. It runs on a fixed timestep with a seeded random generator, never reads the wall clock or the frame rate, and produces bit-identical results in Node and in every browser. It runs headless with no renderer at all. The renderer, interface, and audio only read its state. The player and the captains act on it only through the same inputs.

The career (rank, league, captains' memories and learned profiles, the gull, the career chart, treasure) is plain saved state. Between matches it is updated deterministically from the match's result, so the same career state, seed, and inputs always produce the same match and the same career afterwards.

## How to work

- **Code.** Every line of code earns its place. No dead code, no duplication, no speculative features. Create a file only when it is needed, and split code by domain only when the split makes it clearer. Never write less code at the cost of a better game: carefully built procedural geometry, shaders, captains, and systems that take more code are always preferred to shortcuts that make the game worse.
- **Tools.** Use whatever skills, tools, libraries, and techniques best achieve this result without being asked. Every library is listed in `CREDITS.md` with its source and licence.

## Acceptance checks

These define done. More may be added. None may be weakened, skipped, or removed.

1. **Territory geometry.** A scripted ship sails a loop around a known circle of latitude at angle θ from the pole. The claimed area matches the spherical cap area 2πR²(1 − cos θ) within a stated, justified tolerance.
2. **Determinism.** The same career state, seed, and recorded inputs, run once headless in Node and once in Chromium with full rendering at a different frame rate, with a background-and-resume in the middle, end with identical hashes of the match state and of the career state afterwards.
3. **Captains.** In a headless tournament of 200 seeded matches:
   - each of the six temperaments shows a clearly distinct profile of sea claimed, trails broken, ships sunk, loot taken, and finishing position, and hunters lead in ships sunk
   - higher-ranked captains finish ahead of lower-ranked captains by a clear, stated margin
   - a scripted player that always breaks off into one region and draws large loops is measurably countered within five matches, and the counter fades within five matches after the script changes its habits
4. **Pacing.** Across 200 seeded matches, matches end in nine to eleven minutes, every region is chosen as a break-off point by someone, and the storm's final calm falls in every region with roughly equal frequency.
5. **Touch.** A complete career (the first voyage, three more matches, a gull upgrade, and a form change) is played through touch input alone in Chromium with touch emulation, on an iPhone viewport and an iPad viewport.
6. **Budgets.** A full match, measured in Chromium with GPU acceleration at the resolution of the largest supported iPad, holds its frame time within budget with the CPU throttled to approximate the oldest supported device. Draw calls, triangles, and texture memory stay within stated per-frame budgets chosen for that device, and the simulation tick stays within its budget throughout.
7. **Generated assets.** The game's source code and its build contain no image, model, font, or audio files, and every string on screen is drawn in the generated hand. The screenshots in `progress/` are outside the game.
8. **iOS.** The app builds with Capacitor, launches in the iOS Simulator on an iPad booted headless through `xcrun simctl`, and plays from the title through the harbour, a full match, and the results. Every capture is also taken there with `simctl io`, and the iPad captures match their Chromium counterparts.

## Testing

Test the game in headless Chromium first: scripted touch input, seeded matches found headless and replayed in the browser, iPhone and iPad landscape viewports, and the console checked for errors and warnings. Then test the iOS app in the iPad Simulator, booted headless.

## Captures

Every capture is scripted and seeded so it can be retaken exactly. Each one is taken at both the iPhone landscape resolution and the iPad resolution. Each capture is judged for composition, palette, line, light, mood, and readability.

| Name | What it shows |
|---|---|
| `01-title` | *Portolan* half-lettered in calligraphy over the slowly turning planet on parchment, at golden hour |
| `02-harbour` | The player's caravel at its mooring in a lamp-lit harbour at dusk, gull on the masthead, the form choice and the cards of the next nine captains laid out on parchment |
| `03-current` | Riding the Great Current at full sail, low chase camera, rival ships racing alongside, a region's islands sweeping past over the curve, the storm's bruise on the far horizon |
| `04-break-off` | The player peeling off the current into the Coral Atolls, turquoise lagoons ahead, two rivals peeling off behind it |
| `05-open-trail` | Far out on the Glass Sea with a long open trail astern, the purse swollen, a hunter's course bending toward the trail, the full iPhone interface |
| `06-loop-closing` | The signature shot: a large loop closing, the enclosed sea flooding with vermilion watercolour, coins streaming, camera pulled back |
| `07-gull-drop` | The gull, wings spread, releasing an ultramarine chest onto the deck, the chest glowing |
| `08-chest-choice` | The three-item choice on parchment: a vermilion fitting, an ultramarine fitting, and a verdigris consumable |
| `09-broadside` | Two ships exchanging broadsides among the Basalt Stacks in fog, smoke in grey wash, splashes, splinters |
| `10-sinking` | A galleon rolling under, its gold-leaf pennant last to go, flotsam and a chest floating up |
| `11-storm` | The storm wall advancing over held sea, the territory's colour running and washing out, rain in pen strokes, gold-leaf lightning |
| `12-final-calm` | The last three ships in a small calm circle with the storm on every side |
| `13-chart` | The full chart, opened mid-match: the planet unrolled onto parchment, rhumb lines, wind roses, territories as washes, ships, the storm, region names |
| `14-results` | The results screen: the wind rose with a new point inking in, the league table moving, the timeline of the match |
| `15-career-chart` | A career chart two-thirds inked, five regions named in calligraphy, the rest faint sketch |
| `16-night` | Night on the Glass Sea: bioluminescent wakes, a whale surfacing in glowing ink, lighthouse beams turning, gold-leaf stars |
| `17-ice-crown` | The Ice Crown under aurora, the Crown Light on its skerry, floes and seals |
| `18-fjords` | Deep in a fjord at morning, cliffs and falls on both sides, a rival in ambush |
| `19-basalt-stacks` | The Arch and the columns in late afternoon, puffins wheeling |
| `20-kelp-shallows` | The Kelp Cathedral seen through clear water at midday, otters, a ship half-hidden in kelp |
| `21-amber-shoals` | The shoals at low tide in gold light, the Sandbar Light, wading birds |
| `22-weeping-isle` | The Weeping Isle at dawn, cascades falling all round it, a ship tracing the loop that encloses it |
| `23-coral-atolls` | The Great Lagoon from a low camera at midday, turtles, the single channel through the reef |
| `24-spice-isles` | Spice Harbour at golden hour, flowering jungle, several ships crowding in |
| `25-fire-archipelago` | The Caldera erupting at dusk, lava steaming into the sea, ash falling, gold raining into a ship's waters |
| `26-mangrove-labyrinth` | A shaded mangrove channel, herons, a ship rounding a root arch into a rival |
| `27-glass-sea` | The Glass Sea at noon, a mirror to the horizon, whales, a single trail across it |
| `28-maelstrom` | The Maelstrom from high behind a ship riding its outer spiral, spray and the turning sky |
| `29-weather` | A rain squall crossing open sea at the blue hour, pen-stroke rain, a fog bank beyond it hiding a ship's lantern |

## Review

Each review is done by an independent reviewer agent with fresh context: it has not seen the code, the conversation, or any earlier review. It receives only this document, the captures, and the running game, which it plays through scripted touch input. It is the harsh critic described in [The standard](#the-standard). It judges every capture against this document, and judges the play by playing. It reports every flaw it finds, including:

- anything that breaks the illustrated style: realistic shading, screen-space textures, inconsistent line, off-palette colour
- unreadable frames, team colours that blur together, interface elements over the action
- distorted geometry, seams or pinching on the sphere, floating or intersecting objects, rigging clipping through sails
- flicker at territory borders, gaps in trails, broken animation, camera problems
- text not drawn in the generated hand, illegible lettering
- any human form or sign of human settlement
- controls that feel slow, vague, or unfair
- captains that feel stupid, unfair, or indistinguishable
- matches that drag, end abruptly, or leave the player unsure why it lost
- console errors and warnings

Every flaw is fixed. Then a new reviewer with fresh context reviews again. The game is done when a fresh reviewer finds nothing to fix and every acceptance check passes.
