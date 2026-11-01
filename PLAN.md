# Portolan: the plan

This is the only design document for Portolan. It records what the owner decided in a long design interview. It also says how the game gets built. Any change to a decision here needs the owner's OK.

## Rules that come before everything else

- **Never delete or rewrite a working system without asking the owner first.** The last rewrite threw away about 50,000 lines and two weeks of work without asking. Port, adapt and extend instead.
- **No humans, and no sign that people ever lived here.** That means no buildings, masonry, ruins, harbours, docks, lighthouses or crews. Ships sail themselves, and their captains are spirits. Landmarks and beacons are natural.
- **All geometry is generated in code.** Textures and recorded sounds come from free libraries, and every one is credited in CREDITS.md.
- **No reference images.** The world is described in words in this file, so that a few photos can't stand in for the whole brief.
- **Commit and push to main often.**

## What the game is

Portolan is a battle royale at sea: Fortnite's feel, on one hand-built planet that you learn over many matches. It's single-player and offline. You fight 19 bot captains inside a career that remembers you.

- **Devices:** landscape only. The main device is an iPad with an M1 or newer. iPhone 15 Pro and newer is also supported, and both layouts are designed, not scaled.
- **The look:** the world is cinematic and photographic, with scanned materials, real atmosphere, high dynamic range, bloom and a colour grade. Parchment and ink appear only in the interface, the chart and the title.
- **Names:** anything the player has to understand gets a plain name: ranks, items, abilities, currency and stats. Places, captains and cosmetics get evocative ones.
- **Juice before performance.** Make it feel great first. Performance is checked at the end of each pass (see "How it gets built").

## The planet

### Size and shape

- **A real sphere in the simulation,** about 554 m in radius. Ships sail great circles, regions sit at real latitudes and longitudes, and the planet has poles and a true horizon.
- **A lap of the equator takes about 4 minutes** at the top speed of 14.5 m/s. The surface is about 3.9 km².
- **The horizon:** from the chase camera (about 8 m up), another ship's 18 m mast drops below the horizon at about 240 m. Weapon ranges are tuned to that sightline, and ships rising over the horizon is part of every fight.

### One cohesive world

The planet must read as one continuous world, never as islands of content separated by empty water.
- **Regions tile the whole planet.** Every metre of sea belongs to a region and carries its character: kelp beds, coral heads, ice floes, ash-stained water, drifting petals, mist. There is no unassigned ocean.
- **Land spreads through each region from border to border.** That means island chains, stacks, reefs, bars and shallows, never one lump in the middle. A region covers about 2½ times the area of one of the rewrite's places, so each needs several islands and features, not one.
- **Borders blend.** Where two regions meet, their traits mix over a wide band. Pines thin into cedar fog, petals drift out into the lagoon, black sand creeps into basalt. The light and water colour change as you cross, so you feel the move.
- **Landmarks can be seen from their neighbours.** Each landmark is tall enough (roughly 50 m or more) or bright enough at night to be seen from the border with each neighbour. From almost anywhere you can see at least one landmark or beacon.
- **Currents tie the world together.** The Great Current runs around the equator, and every region except the poles touches it. Smaller currents cross between the regions. Currents are the fast lanes.
- **Never more than about 15 seconds of nothing.** Outside the current lanes, no stretch of water takes more than about 15 seconds to cross without something to use or look at: cover, loot, shallows, a fight or a landmark in view.
- **One sky over everything.** The weather and the light are planet-wide and cross borders freely.

### Layout

This is the starting layout, to be tuned in the first pass. The 16 regions are a cap at each pole and two rings of seven. The rings are staggered, so each ring region touches two in the other ring. Climate warms from north to south.

- **North pole:** the Ice Crown.
- **Northern ring, cool (in order around the planet):** the Fjords, Mistwood, the Spires, the Narrows, the Basalt Stacks, the Kelp Shallows, Blossom Run.
- **Southern ring, warm (in order around the planet):** the Glass Sea, the Jade Shoals, the Coral Atolls, the Spice Isles, the Fire Archipelago, the Weeping Isle, the Mangrove Labyrinth.
- **South pole:** the Maelstrom.
- **The equator** is the seam between the rings, and it carries the Great Current.

### What every region has

- A **landmark** that gives its own perk to whoever holds it.
- An **event** that changes the region during a match.
- A **natural beacon**, such as a glowing stone, bioluminescence, a vent or a crystal. It's the region's light at night.
- **6 or more loot spots.**
- **2 or more plants found nowhere else.**
- **4 or more scanned materials of its own.**
- Its **own terrain code.** Regions must not come from one shared height function with different textures or tints. That's exactly why the rewrite's world looked the same everywhere.
- Its **own water:** colour, clarity and motion.
- Its **own sound.**
- **Weather it tends toward.**

### Making the world rich, not samey

The rewrite's world looked decent but samey. All nine of its biomes came from one noise height function recoloured by a texture map, with the same 8 tree types, the same water and one sky mood. Each place got different paint on the same shapes. These rules prevent that:

- **Distinct skylines.** No two regions share a skyline shape, a dominant colour or a water colour (see the portraits below).
- **Three depths in every view:** something in the foreground (rocks, plants, surf, a passing ship), the middle distance (coastline, islands, stacks) and the horizon (a landmark, a weather system, the curve of the world). An empty frame is a failure.
- **Detail at every distance.**
  - At 300 m you recognise a region by its skyline and colour.
  - At 50 m you see its plants, rock forms and shoreline.
  - At 10 m you see wet rock, foam, moss, sand ripples and kelp blades.
- **Living water:** foam where waves hit rock, wakes, reflections, caustics in the shallows, changing colour with depth.
- **Things move:** plants in the wind, birds, spray, mist, falling petals, floating ice, steam, lava glow.
- **Light carries the mood.** The same region at dawn, midday, dusk and night should look like four different paintings. The painterly feel comes from light, atmosphere and composition, not from line drawing.
- **The blind test** (see "How it gets built") is the check: a region that can't be told apart from another fails.

### Day and night

- **There is one sun, so half the planet is always dark.**
- **Each match starts at a random hour,** and the sun moves about 4 hours during it, so you can watch dusk cross a region. The Gale opening shows the lit and dark halves of the globe.
- **The planet's tilt changes from match to match.** Sometimes the Ice Crown has midnight sun, sometimes polar night.
- **Night is never murky.** Moonlight, glowing wakes, natural beacons and a spirit lantern on every ship keep it readable.
- **Night changes fights.** Beyond about 150 m, enemies show only as a lantern glow, with no name or health bar.

### Weather

Weather systems drift across the planet, 3–5 at a time, and you can see them coming as real cloud formations. Each kind has one clear effect:

| Weather | Effect |
|---|---|
| Fog | Shorter sightline. Ships inside drop off the map. |
| Rain | Gusty wind and rough water. |
| Thunder | Lightning strikes ships in the open, after a warning glow. |
| Calm | The wind dies. |
| Snow | Near the Ice Crown: ice builds on the rigging and slows your turning. |
| Ash | Downwind of the Fire Archipelago: embers slowly burn ships that stay in it. |

The rewrite's moods (misty dawn, golden hour, starlit night) now come from the hour plus the weather. They aren't picked for the match.

### Wind and tides

- **Wind:** the old game's wind field over the planet, with gusts and calm water behind islands. Sailing into the wind is at most 25% slower, so you're never stuck. The wind shows on the water and the sails, and weather systems bend it.
- **Tides:** tides rise and fall during a match. They open and close shallows, reef gaps and channels.

### Creatures

There are only two creatures, both built to hero quality:
- **The gull** brings deliveries. Flocks also follow ships and gather at cliffs.
- **The whale** surfaces, blows and dives along its routes. The rewrite's leviathan event becomes a giant whale breaching, which can flip and lift ships.

## The 16 regions

Each portrait describes what the region must feel like, without dictating numbers. Landmark names, perks and events are starting ideas, to be tuned in playtests. Each region is built mostly from what the old game and the rewrite already made. Where both versions had a region, it takes the better-built mechanic and the rewrite's look.

### The Ice Crown (north pole)
*From the old Ice Crown and the rewrite's Frost Hollow.*
- **Skyline:** flat white floes that turn slowly around a crown of blue-white ice spires at the pole.
- **Colour and light:** white, pale blue and steel. Low sun at long angles. Aurora at night.
- **Water:** steel blue-grey, thick with slush and broken floes that knock against hulls.
- **Shores and ground:** snow over blue ice, pressure ridges, glassy refrozen leads, snow firs at the outer edge.
- **Plants:** snow-laden firs at the rim and frost-white lichen.
- **Landmark:** the Crown, an ice citadel with a light at its heart.
- **Event:** the rings of floes turn, and lanes open and close.
- **Perk:** Frost Shot. Your hits slow ships for a moment.
- **Sound:** creaking ice, wind across the snow, the boom of cracking floes.
- **Weather:** snow, fog.
- **Remembered for:** threading moving lanes through the ice under the aurora.
- **Next to its neighbours:** the only white region, and the only one whose water is full of solid ice.

### The Fjords
*From the old Fjords and Great Falls, and the rewrite's Thunder Falls.*
- **Skyline:** tall U-shaped valley walls of grey granite, with a white ribbon of water falling hundreds of metres.
- **Colour and light:** granite grey, dark pine green, heather purple. Light comes into the valleys in shafts.
- **Water:** milky glacial turquoise, streaked with foam below the falls.
- **Shores and ground:** wet granite slabs, scree, heather slopes, pine forest.
- **Plants:** tall pines and heather.
- **Landmark:** Thunder Falls, a great cascade into the head of the main fjord. You can hide behind the curtain.
- **Event:** a flood surge. The falls swell and push a strong current out of the fjord.
- **Perk:** Fast Repair. You repair twice as fast in your own water.
- **Sound:** the roar of the falls, echoing off the walls.
- **Weather:** fog, rain.
- **Remembered for:** sailing up a narrow fjord toward a thundering wall of white.
- **Next to its neighbours:** grey and vertical, where Mistwood is soft fog and trees and Blossom Run is pink and rolling.

### Mistwood
*From the rewrite's Mistwood.*
- **Skyline:** giant cedars rising out of a permanent fog bank, with only their dark tops showing.
- **Colour and light:** deep blue-green cedar, silver fog, light diffused into god rays.
- **Water:** a still black-green mirror under the fog.
- **Shores and ground:** moss-covered roots, ferns, fallen giants lying half in the water.
- **Plants:** giant cedars, sword ferns and hanging moss.
- **Landmark:** the Hollow Cedar, a fallen giant whose hollow trunk you can sail through.
- **Event:** a fog surge rolls out of the forest and swallows the region.
- **Perk:** Fog Sight. You see at full range through fog and at night.
- **Sound:** dripping, muffled silence, a distant creak of wood.
- **Weather:** fog.
- **Remembered for:** ships appearing and vanishing in the fog between trunks.
- **Next to its neighbours:** the darkest and softest region in the north.

### The Spires
*From the rewrite's Spires.*
- **Skyline:** a cluster of pale limestone needles rising straight from the sea, each crowned with dark pines.
- **Colour and light:** pale limestone and dark pine, with hard shadows between the towers.
- **Water:** teal over pale rock, with a white ring of foam at the base of every tower.
- **Shores and ground:** sheer weathered limestone, ferns in the clefts, sea caves.
- **Plants:** crown pines and cleft ferns.
- **Landmark:** the Needle, the tallest spire, visible from far across the north.
- **Event:** a spire topples into a channel and changes the routes through.
- **Perk:** Spotter. Ships you hit show on the map for a few seconds.
- **Sound:** wind whistling between the towers and gulls on the ledges.
- **Weather:** rain, thunder.
- **Remembered for:** a slalom between towers, ambushes around every corner.
- **Next to its neighbours:** vertical needles where the Narrows has continuous walls.

### The Narrows
*From the rewrite's Narrows.*
- **Skyline:** two long walls of ochre and red sandstone with a dark slot between them.
- **Colour and light:** warm ochre and rust, a bright strip of sky above and deep shadow inside.
- **Water:** deep bottle green in shadow.
- **Shores and ground:** banded sandstone cliffs, ledges and overhangs, scree fans at the mouths.
- **Plants:** junipers clinging to the cliffs and hanging ivy.
- **Landmark:** the Gorge, with one way in and one way out.
- **Event:** a rockfall blocks one end of the gorge for a while.
- **Perk:** Long Range. Your weapons reach about 15% further.
- **Sound:** echoes. Every shot booms back off the walls.
- **Weather:** calm, rain.
- **Remembered for:** a tense run through a gorge, knowing someone may be waiting at the other end.
- **Next to its neighbours:** the only warm-coloured rock in the north.

### The Basalt Stacks
*From the old Basalt Stacks and the Arch, and the rewrite's Moonbow Arch.*
- **Skyline:** black columnar basalt cliffs and stacks under green turf, crossed by a great natural arch.
- **Colour and light:** black rock, vivid green turf, white surf, a grey sea sky.
- **Water:** slate grey-green with a heavy swell and big surf.
- **Shores and ground:** hexagonal columns stepping into the sea, boulder beaches, turf tops.
- **Plants:** wind-bent grass and sea pinks.
- **Landmark:** Moonbow Arch, a natural arch you sail under. At night, a moonbow forms in its spray.
- **Event:** a low tide opens a hidden passage behind the arch.
- **Perk:** Fast Reload. You reload about 30% faster.
- **Sound:** surf booming in caves, wind over turf.
- **Weather:** fog, rain.
- **Remembered for:** the arch, and the geometry of the columns.
- **Next to its neighbours:** black and green, where the Kelp Shallows is gold and low.

### The Kelp Shallows
*From the old Kelp Shallows and the Kelp Cathedral.*
- **Skyline:** low grassy islets. The drama is in the water, not on the land.
- **Colour and light:** olive and gold, with sunlight slanting into the water.
- **Water:** olive-gold, with the kelp canopy floating on the surface and kelp columns visible below.
- **Shores and ground:** low rocky islets, tide pools, grassy tops.
- **Plants:** giant kelp and eelgrass.
- **Landmark:** the Kelp Cathedral, a forest of giant kelp so tall it rises above the surface in columns.
- **Event:** a bloom. The kelp spreads and slows everyone.
- **Perk:** Hidden Wake. Your wake doesn't show, and you drop off the map.
- **Sound:** soft water, kelp brushing the hull, seabirds.
- **Weather:** clear, calm.
- **Remembered for:** sneaking through the kelp, unseen.
- **Next to its neighbours:** the only region whose richness is mostly underwater.

### Blossom Run
*From the rewrite's Blossom Run.*
- **Skyline:** rolling hills of pink and gold, cut by a wide river valley.
- **Colour and light:** cherry pink, spring green, warm soft light.
- **Water:** clear soft blue, carpeted with drifting petals.
- **Shores and ground:** meadow banks, river stones, gentle slopes.
- **Plants:** cherry trees in bloom and red maples.
- **Landmark:** the Great Cherry, an ancient tree on a hilltop whose pink crown is visible from far away.
- **Event:** a spring flood. The river runs fast, making a current to ride.
- **Perk:** Quick Gust. Your gust recharges faster.
- **Sound:** birdsong, river rush, petals on the wind.
- **Weather:** clear, rain.
- **Remembered for:** racing down a river of petals.
- **Next to its neighbours:** the softest, warmest colours on the planet, which drift south into the Glass Sea.

### The Glass Sea
*From the old Glass Sea and Whale Road, and the rewrite's Glasswater.*
- **Skyline:** almost none. A wide, mirror-calm sea with a few low, glassy isles.
- **Colour and light:** sky-coloured. The sea mirrors whatever the sky is doing.
- **Water:** crystal clear and mirror-still. In the shallows you see the white sand floor.
- **Shores and ground:** white sand, low palms.
- **Plants:** low palms and sea grape.
- **Landmark:** Glasswater, a crystal pool over white sand at the heart of the sea.
- **Event:** the giant whale breaches.
- **Perk:** Cheap Deliveries. Gull deliveries cost about 30% less.
- **Sound:** near silence, then the whale's breath.
- **Weather:** calm, clear.
- **Remembered for:** sailing across a mirror, with the whale beneath you.
- **Next to its neighbours:** the emptiest skyline, on purpose. Its richness is the water and the whales. It still obeys the 15-second rule through shallows, isles and the whale route.

### The Jade Shoals
*From the old Amber Shoals and the rewrite's Jade Shallows.*
- **Skyline:** flat amber sandbars and dunes, with one tall dune carrying the beacon.
- **Colour and light:** amber sand and jade water, bright and high-key.
- **Water:** pale jade over golden sand, with channels of darker blue between bars.
- **Shores and ground:** sandbars, dunes, rippled sand flats.
- **Plants:** dune grass and beach morning glory.
- **Landmark:** the Sandbar Light, a natural beacon of glowing glass sand on the highest dune.
- **Event:** the tide falls, bars rise and channels close.
- **Perk:** Shallow Draft. You can cross sandbars without running aground.
- **Sound:** gentle surf, wind over dunes.
- **Weather:** clear, calm.
- **Remembered for:** reading the shallows, and chasing someone into water too shallow for them.
- **Next to its neighbours:** the brightest, flattest region.

### The Coral Atolls
*From the old Coral Atolls.*
- **Skyline:** rings of low palm islets around inner lagoons.
- **Colour and light:** coral pink and orange, white sand, strong tropical sun.
- **Water:** ultramarine outside the reef and electric turquoise inside, with a sharp line between them.
- **Shores and ground:** coral rubble beaches, reef flats, sand spits.
- **Plants:** coconut palms and coral gardens.
- **Landmark:** the Great Reef, the biggest atoll ring, with a few gaps in it.
- **Event:** the tide closes some reef gaps and opens others.
- **Perk:** Loot Sense. Nearby loot shows on your map.
- **Sound:** surf on the reef edge, calm inside.
- **Weather:** clear, rain.
- **Remembered for:** fights at the reef gaps.
- **Next to its neighbours:** the strongest blue-to-turquoise contrast on the planet.

### The Spice Isles
*From the old Spice Isles.*
- **Skyline:** rounded jungle hills topped with flowering trees.
- **Colour and light:** deep jungle green splashed with flame red and orange, humid warm light.
- **Water:** warm emerald.
- **Shores and ground:** red earth, jungle to the water's edge, black rock points.
- **Plants:** jungle canopy and flame trees in bloom.
- **Landmark:** Spice Cove, a natural cove under the tallest flame trees.
- **Event:** a pearl bloom. A giant clam bed opens with rare loot and draws a fight.
- **Perk:** Better Loot. Loot you open rolls one rarity higher.
- **Sound:** insects, jungle birds, warm rain.
- **Weather:** rain, thunder.
- **Remembered for:** red and green colour, and the scramble at the pearl bloom.
- **Next to its neighbours:** the hottest colours in the south apart from lava.

### The Fire Archipelago
*From the old Fire Archipelago and Caldera, and the rewrite's Cinder Peak.*
- **Skyline:** a smoking volcanic cone with a plume, surrounded by smaller black islands.
- **Colour and light:** black, ember red and ash grey. The plume lights orange from below at night.
- **Water:** near-black, with steaming patches and sulphur-yellow stains.
- **Shores and ground:** black sand, fresh lava rock, glowing flows reaching the sea.
- **Plants:** ash-grey scrub and red blossoms on old lava.
- **Landmark:** Cinder Peak, a caldera you can sail into.
- **Event:** an eruption. Lava bombs fall and ash spreads downwind.
- **Perk:** Fire Shot. Your hits set ships burning.
- **Sound:** rumbling, hissing steam, cracking rock.
- **Weather:** ash.
- **Remembered for:** fighting in the light of an eruption.
- **Next to its neighbours:** the only black and red region.

### The Weeping Isle
*From the old Weeping Isle.*
- **Skyline:** one huge dome-shaped island draped in cloud, its cliffs streaming with hundreds of thin falls.
- **Colour and light:** emerald moss, white water, soft grey cloud light.
- **Water:** deep sapphire, dimpled by rain and falling water.
- **Shores and ground:** mossy cliffs, wet black rock, pools at the cliff feet.
- **Plants:** cloud forest and tree ferns.
- **Landmark:** the Isle itself, ringed by its weeping cliffs.
- **Event:** a cloudburst. Every fall doubles and mist rolls out to sea.
- **Perk:** Quick Hands. You use consumables about 30% faster.
- **Sound:** endless falling water at every distance.
- **Weather:** rain, fog.
- **Remembered for:** circling a weeping green giant.
- **Next to its neighbours:** one giant island instead of many small ones.

### The Mangrove Labyrinth
*Designed in the old game, never drawn. Built last.*
- **Skyline:** a low, dense wall of mangrove canopy cut by dark channels.
- **Colour and light:** olive and brown, dappled green light under the canopy.
- **Water:** tea-brown, still, full of reflections.
- **Shores and ground:** mud flats, arching roots, no real shore.
- **Plants:** mangroves and hanging moss.
- **Landmark:** the Root Gate, a great arch of tangled roots at the heart of the maze.
- **Event:** the tide rises and floods new channels through the roots.
- **Perk:** Tight Turns. You turn much more sharply.
- **Sound:** frogs, drips, creaking roots, close silence.
- **Weather:** rain, fog.
- **Remembered for:** a maze fight where you hear ships before you see them.
- **Next to its neighbours:** the only region where you sail under a canopy.

### The Maelstrom (south pole)
*Designed in the old game, never drawn. Built last.*
- **Skyline:** a ring of dark storm-beaten cliffs around a vast whirlpool.
- **Colour and light:** dark navy, slate and white foam, under a heavy sky.
- **Water:** dark navy, streaked with white spiral foam that sweeps toward the eye.
- **Shores and ground:** storm-cut slate cliffs and boulder shelves.
- **Plants:** storm-flattened grass and sea kale.
- **Landmark:** the Eye, a spire of rock standing in the calm centre of the vortex.
- **Event:** the vortex strengthens and pulls harder toward the eye.
- **Perk:** Current Rider. Currents push you about 50% harder.
- **Sound:** a constant roar of rushing water, rising toward the centre.
- **Weather:** rain, thunder.
- **Remembered for:** riding the spiral, and the risk of being pulled in.
- **Next to its neighbours:** the darkest, most violent water on the planet.

## A match

### The flow

- **20 ships, 10–12 minutes.**
- **The Gale opening:** the Gale carries the fleet high over the planet, showing the globe with its day and night halves and its weather. You dive into the region you pick.
- **The Storm closes:**
  - The first safe zone covers half the planet, so it's never more than a minute's sail away. About half the regions are in play each match.
  - It closes over 7 phases. The final circle always lands inside a region, never on open sea.
  - Over many matches, every region hosts the finale about equally often.
  - The Storm damages the hull directly and ignores the shield.
- **Rotating rule changes** are picked by the date, so they work offline: for example night only, harpoons only or a double-speed Storm.

### The ship

- **One ship type,** the way Fortnite has one body shape. It's the rewrite's 18 m caravel, rebuilt as a hero model, using whatever detail the old ship builder did better.
- **Ships differ only in cosmetics:** sail colour and pattern, hull paint, figurehead, emblem and wake trail.
- **The old game's four ship forms are parked** for later.
- **Every ship carries a spirit lantern.**

### Combat

- **Aimed weapons in 6 classes:** cannon, harpoon, mortar, repeater, scatter and broadside. The broadside fires from both sides at once.
- **Five rarities** for each class.
- **Ranges are tuned to the sightline of about 240 m.**
- **A 5-slot hotbar.**
- **Hit markers.**
- **Damage numbers:** blue for shield and white for hull.

### Shield and hull

- **The shield is an aura around the ship.** It's a translucent shell that brightens as it fills, ripples where it's hit, and shows cracks as it weakens.
- **Breaking it is one of the juiciest moments in the game:** a shatter of shards, a flash, a glassy crack sound, a short hit-stop, a camera kick and a haptic.
- **Refilling it shimmers** the aura back into place.
- **Ships start each match with no shield.**

| Item | Effect | Use time | Stack |
|---|---|---|---|
| Small Shield | +25 shield, up to 50 | 1.0 s | 6 |
| Big Shield | +50 shield, up to 100 | 2.6 s | 3 |
| Repair Kit | +15 hull, up to 75 | 1.8 s | 8 |
| Full Repair | Full hull | 5.0 s | 2 |

Use times are a starting point, to be tuned in playtests.

### Moves and abilities

- **The gust is a basic move everyone has,** like sprinting. It's a burst of wind and a hop off the water.
- **You bring two abilities into each match:** one active, on a button with a cooldown, and one passive.
- **Everyone starts with the same solid pair,** so new players are never weaker. Later abilities are different, never stronger.
- **About 16 abilities in all,** unlocked across roughly the first 40 levels.
- **Plain names.** Starting ideas:
  - Active: Smoke Screen, Ram, Repair, Reveal, Hard Turn, Decoy, Wave.
  - Passive: Quick Reload, Salvage, Quick Hands, Light Hull, Wind Reader, Storm Walker.
- **Bots choose abilities too,** so you learn which ones each rival brings.

### Territory, perks and Coins

- **Water you hold takes your colour.** In your own water you slowly repair.
- **Holding a region's landmark gives you that region's perk** for as long as you hold it.
- **Coins exist only inside a match.** You earn them in play, spend them on gull deliveries, and they reset when the match ends.

## The career

### The league

- **About 40 named captains,** each with a temperament such as hunter, looter, territory holder or ambusher.
- **Each captain is a spirit,** shown by a sail emblem, never a face.
- **Every match draws 19 captains** near your skill. Your rivals turn up more often.
- **Captains learn your habits and hold grudges,** as in the old game.
- **A rivals page** tracks your record against each one.

### Skill and rank

- **A hidden skill rating** updates after every match. The bots are tuned so you finish top 5 about half the time and win about 1 match in 6. It finds your level within your first ~10 matches.
- **Your first match is against gentle captains.** Short tips appear the first time each thing happens. There's no separate tutorial.
- **Ranks:** Iron, Bronze, Silver, Gold, Platinum and Diamond, three steps each, then Admiral and Legend.
  - Your rank follows your skill rating, so climbing means beating harder captains.
  - You never drop below a tier once you've reached it.

### Unlocks

- **XP earns levels.**
- **Levels unlock abilities and cosmetics.**
- **Rank unlocks show-off cosmetics,** such as sail colours and wake trails.
- **No shop and no currency between matches.**
- **The chart fills in with the regions you've sailed.**

## Interface

The interface should feel like a polished, big-budget mobile game, in the menus as much as in the match. Big-budget games feel expensive because everything moves, sounds and responds, and big moments get a ceremony.

- **Parchment and ink are the material,** but the interface behaves like a modern mobile game: bold readable type, big thumb-sized buttons and strong rarity colours.
- **Shared parts:**
  - These are built once, from one set of colours, type sizes, spacing, corner radii and shadows: buttons, cards, tabs, panels, rarity frames, progress bars, toasts and pop-ups.
  - Every screen uses them, and no screen invents its own.
- **Every tap responds:** a press animation, a sound and a haptic.
- **Nothing pops in:**
  - Every screen change animates.
  - Lists stagger in.
  - Numbers count up.
  - Rewards fly into their counters.
  - There are no blank frames, no layout jumps and no unstyled loading states.
- **The lobby is the live 3D planet.** Your ship sits on the water at the current hour with your cosmetics on, and the menus sit over it.
- **Big moments get a full-screen ceremony,** with camera, particles, sound and haptics: winning, levelling up, ranking up, unlocking an ability, and the shield break in a match.
- **The HUD is minimal,** and the important things are big:
  - shield and hull;
  - the hotbar;
  - the ability and gust buttons;
  - the map;
  - the Storm timer;
  - how many ships are left;
  - kills.
- **iPad and iPhone layouts are each designed,** respecting safe areas and thumb reach.
- **Screens.** Each one gets its own "done when":
  - title;
  - lobby;
  - abilities;
  - locker (cosmetics);
  - rivals;
  - career and chart;
  - rank;
  - settings;
  - the HUD;
  - the Gale drop;
  - death and spectating;
  - victory;
  - results with XP and rank progress.

## Sound

- **No music, anywhere.** The match sounds like the sea, the wind, the weather and the guns.
- **Sound effects can be synthesized or recorded** from free libraries. Each recording is credited.
- **Every region has its own ambience,** and every mechanic layers its sound (see the juice checklist).

## Assets

- **All geometry is generated in code.**
- **Textures:** for each material, use the best scanned or Substance-built version from ambientCG or Poly Haven. Never use ambientCG materials tagged "Approximated".
- **Credits:** every texture and sound is credited in CREDITS.md.
- **The build can be up to 2 GB.**

## Content targets

These replace any line-count goal. The code grows to whatever these need.

| Content | Target |
|---|---|
| Regions | 16, each with everything in "What every region has" |
| Weather kinds | 6 |
| Weapons | 6 classes × 5 rarities |
| Consumables | 4 |
| Abilities | about 16 |
| Region perks | 16 |
| Captains | about 40 |
| Creatures | 2: the gull and the whale |
| Cosmetics | about 100 |
| Screens | every screen in "Interface" |

## Later, or out

- **Later:**
  - A free voyage mode on the same planet, with no Storm and no timer.
  - 48 secrets to find, 3 per region. Secrets that pay off in matches come with it.
- **Parked:** other ship types.
- **Out:**
  - Trading.
  - Music.
  - Online play. The simulation stays deterministic, so it could be added later without a rewrite.

## The code

### Where to start

- **The base is the old game at commit 2025e68.** Bring back:
  - its deterministic simulation, bit-identical across Node, Chromium and WebKit;
  - the sphere;
  - the wind field, currents, the Great Current, tides, weather systems and the Storm;
  - captains that learn;
  - the league and career.

  Read old files with `git show 2025e68:<path>`.
- **The rewrite (the code at commit 32b509e) contributes:**
  - the renderer: high dynamic range, bloom, the colour grade, water, sky, land materials and effects;
  - the interface;
  - weapons, rarities, loot, consumables, territory, gull deliveries and the Gale;
  - the feel of combat;
  - the ship model;
  - the gull and the leviathan, which becomes the whale.
- **Goes away:**
  - the old drawn rendering style (glaze, pigments, hatching), replaced by the rewrite's photographic renderer adapted to the sphere;
  - the rewrite's flat map and its fake globe warp.
- **Keeps its shapes:** the old region shape generators (basalt columns, the arch, reef rims, cones, kelp, floes, the vortex) and the old ship builder's detail get the new materials.

### Ground truths

- **Units:** game units are metres. The old game's units were about 4.09 m each, so its 200-unit planet was about 818 m. The new planet is about 554 m.
- **Top speed:** 14.5 m/s.
- **Commands:** `npm test` runs the test suite (`tests/run.ts`), `npm run typecheck` checks types, and `npm run ios` builds the app for the iOS Simulator.

## How it gets built

### Passes over the whole game

Everything climbs the same ladder together:
- **Blocked out:** it exists and works in its simplest form.
- **Playable:** it plays as intended, with rough visuals.
- **Good:** it looks, sounds and feels right.
- **Final:** it's polished and signed off.

Nothing moves up a rung until everything in the pass has reached the current one. The core loop comes first in every pass, because you feel it every second: sailing, shooting, hits, the shield, the drop and the Storm.

What each rung means for each kind of item:

| | Region | Mechanic | Screen |
|---|---|---|---|
| Blocked out | Terrain shapes, coastline, currents, loot spots, the landmark as a simple shape, placed on the sphere with blended borders | Works in the simulation with debug visuals | Exists, can be navigated, shows real data |
| Playable | Event, perk, beacon and mechanics work. Weather and light apply. Placeholder materials are fine | Basic visuals and sound. Bots use it | Uses the shared parts. Works on iPad and iPhone |
| Good | Its own materials, plants, water and sound. Passes the blind test | Everything on the juice checklist is there | Motion, sound and haptics on every interaction |
| Final | Everything in its portrait, with detail at 10 m and polished borders | Tuned with the owner, readable at phone size | Nothing left on the interface checklist, and the owner signs off |

### "Done when" comes first

At the start of each pass, the agent writes a "done when" list into this file for every item in the pass, drawn from its portrait, the juice checklist or the interface checklist. The reviewer checks that the list covers everything before work starts. Anything missing from the finished work is a fail. This stops agents from cutting the brief down to a few easy examples.

### The independent reviewer

A separate agent with fresh context passes or fails each item. It gets this file and the evidence, never the author's reasoning.
- **Mechanics:** the deterministic simulation replays a scripted moment. The reviewer gets a strip of frames across it, plus a log of every sound and screen effect that fired. It judges them against the juice checklist.
- **The world:**
  - Fixed scenes in every region, at dawn, midday, dusk and night, are judged against the portrait.
  - **The blind test:** the reviewer gets unlabelled screenshots from fixed spots and must name each region using only the portraits. Any region mistaken for another fails.
  - **The lap test:** frames every few seconds along a full lap of the planet. Any stretch that reads as empty water fails the cohesion rules.
- **Interface:** frame strips of each transition, at iPad and iPhone sizes, judged against the interface checklist: press feedback, motion, no clipped text, thumb reach and consistent shared parts.

### Juice checklist (for every mechanic)

- **Wind-up:** you see and hear it coming.
- **Impact:** a hit-stop, a flash and a clear hit marker.
- **The camera responds:** kick, shake or zoom, scaled to the size of the moment.
- **Particles:** splinters, spray, smoke or sparks.
- **Sound:** several layers, such as a crack, a boom and a tail.
- **The interface responds:** numbers, bars and markers.
- **A haptic.**
- **It reads at a glance at phone size.**

### Capped retries

- **Each item gets at most two revisions per pass.**
- **Whatever is still wrong goes into the backlog** at the end of this file for the next pass, and the agent moves on.
- **This stops polish loops** on one thing while the rest of the game waits.

### Other checks

- **Headless bot matches are crash tests only:** a match must run to the end with no errors. They never count as evidence of quality.
- **Performance is measured on a real device at the end of each pass.** The rule is 30 fps that never drops during a match, with resolution allowed to scale down to hold it. If it misses, it gets one focused fix pass, not a loop.
- **The owner plays each pass on an iPad** before the next one starts.

### The first pass

This pass gets everything to blocked out, with the core loop first.
1. Restore the old game's simulation, sphere and career from 2025e68 as the base, keeping the rewrite's code available to port from.
2. Port the rewrite's renderer onto the real sphere: water, sky, land materials, the grade and effects.
3. Set the planet to the new size, and lay out and block out all 16 regions with blended borders, currents and loot spots.
4. Port the core loop:
   - sailing with wind and the gust;
   - weapons and the hotbar;
   - shield and hull;
   - consumables;
   - loot;
   - territory;
   - the Gale;
   - the Storm on the sphere;
   - 20 ships with bot captains.
5. Port the interface and create every screen.
6. Wire up the career at its simplest: the league, the skill rating, ranks, levels and abilities.

## Backlog

Nothing yet.
