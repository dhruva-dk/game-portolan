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
- **Perk:** Fast Refill. You use shields and repairs about 30% faster.
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

### Pass 1: done when

Pass 1 takes every item to **blocked out**. An item is done only when every line in its list is true. One thing is pulled forward from the Playable rung on purpose: screens are built from the shared parts from the start, so later passes don't have to rebuild them.

**The base and the planet, done when:**
- **The base runs:** `npm run typecheck` and `npm test` pass on the restored base at the new size.
- **The size is right:** the radius is about 554 m, and a lap of the equator at 14.5 m/s takes about 4 minutes.
- **The layout matches "Layout":**
  - a cap at each pole and two staggered rings of seven, in the listed order;
  - each ring region touches two regions in the other ring;
  - the equator is the seam between the rings.
- **The regions tile the sphere:** every point belongs to exactly one region. A test that samples at least 100,000 points finds none unassigned.
- **A landmark is always in view:** from at least 95% of sampled sea points, at 8 m up, a landmark or a beacon is above the horizon, by day and by night.

**Every region (all 16), done when:**
1. Its terrain comes from its own module, `src/sim/world/regions/<id>.ts`. That module is the region's own code, not a shared height function with different numbers or tints.
2. Its shapes read as the skyline in its portrait (see the table below), at blockout fidelity and at real size. This is judged from an orbit capture and from a capture 8 m up at each border.
3. Land, shallows or features spread across the whole region, from border to border. Outside the current lanes, every straight course meets land, shallows, cover or loot at least every 217 m, which is 15 s at top speed. A test reports the longest gap.
4. It blends into every neighbour across a band at least 100 m wide, where both regions' landforms appear mixed. The band is never a seam, a wall, a trench or a flat strip of open water.
5. Its currents work:
   - The Great Current is a closed loop around the equator, and every ring region touches it.
   - At least one smaller current crosses from the region into a neighbour.
   - Ships on any current go measurably faster than in still water nearby.
6. It has 6 or more loot spots, all in water a ship can reach.
7. Its landmark exists as a simple shape at real size. It is about 50 m or taller, or it carries a light. It can be seen over the curve of the planet from every point of each border it shares with a neighbour.
8. Its beacon exists as a position and a placeholder light.
9. It renders on the sphere with a placeholder material set. Sets may be shared between regions at this rung, but each region picks its own, and they blend at borders.

| Region | Blocked-out shapes |
|---|---|
| The Ice Crown | Rings of floes around a crown of ice spires at the pole, with lanes between the rings. |
| The Fjords | Tall U-shaped valley walls around narrow fjords. A cliff at the head of the main fjord carries the falls, with a sailable gap behind the curtain. |
| Mistwood | Giant cedar trunks rising above a fog line, on low, flat islands with rooty shores, separated by still channels. The fallen Hollow Cedar is a log you can sail through, and it carries a light so neighbours can see it. |
| The Spires | A cluster of sheer needles rising from the sea. The Needle is the tallest landmark in the north, and it can be seen from every region that borders the Spires. |
| The Narrows | Two long, continuous walls with a slot between them. The Gorge has one way in and one way out. |
| The Basalt Stacks | Column cliffs and sea stacks, with a natural arch you can sail under. |
| The Kelp Shallows | Low islets on wide shallows. The Kelp Cathedral's columns rise above the surface. |
| Blossom Run | Rolling hills cut by a wide, sailable river valley. The Great Cherry stands on a hilltop. |
| The Glass Sea | A wide, open sea with a few low isles and sand shallows. Glasswater is a ringed pool at the heart. |
| The Jade Shoals | Sandbars and low dunes cut by channels, with one tall dune for the beacon. |
| The Coral Atolls | Rings of low islets around lagoons. The Great Reef is the biggest ring, with gaps. |
| The Spice Isles | Rounded hills with a sheltered cove under the tallest one. |
| The Fire Archipelago | A volcanic cone with a caldera you can sail into, surrounded by smaller black islands. |
| The Weeping Isle | One huge dome-shaped island with steep cliffs that fills most of the region, so its cliff feet come near every border, with rocks and pools between. |
| The Mangrove Labyrinth | A low maze of root islands cut by narrow channels, under a low canopy you sail beneath. The Root Gate is an arch you sail through. |
| The Maelstrom | A ring of cliffs around a wide whirlpool basin, with the Eye standing at the centre. The whirlpool is a working current that spirals ships toward the Eye. |

**Mechanics, done when each works in the simulation, with debug visuals where it can't be seen yet:**
- **Sailing:**
  - Ships sail great circles on the sphere at up to 14.5 m/s.
  - Speed follows the point of sail. Sailing upwind is at most 25% slower.
  - Ships turn, and they run aground on land and shallows.
  - Currents carry ships.
- **The gust:** every ship has it. It gives a burst of speed and a hop off the water, then recharges.
- **Wind:** wind varies over the planet. It is calm in the lee of islands, and weather systems bend it.
- **Tides:**
  - The sea level rises and falls during a match.
  - At least one passage opens and closes in each of four regions:
    - the Basalt Stacks: the passage behind the arch;
    - the Jade Shoals: bars and channels;
    - the Coral Atolls: reef gaps;
    - the Mangrove Labyrinth: root channels.
- **Day and night:**
  - A match starts at a random hour, and the sun moves about 4 hours during it.
  - The tilt changes from match to match.
  - Half the planet is always dark.
- **Weather:**
  - 3–5 systems drift over the planet.
  - Each of the 6 kinds applies its one effect from the weather table.
  - Regions tend toward their own weather: most systems over a region are its listed kinds.
  - Snow appears only near the Ice Crown, and ash only downwind of the Fire Archipelago.
- **Night:** at night, enemies beyond about 150 m are flagged as lantern-only, with no name or health bar.
- **Weapons:**
  - 6 classes × 5 rarities, all aimed.
  - Projectiles have flight time. Ammo and reloads work.
  - Ranges are tuned to the sightline of about 240 m.
  - The broadside fires from both sides at once.
- **The hotbar:** 5 slots, with select, swap and drop.
- **Shield and hull:**
  - Ships start with no shield, and damage takes the shield first.
  - The Storm damages only the hull.
  - Breaking the shield raises a break event.
  - Damage events say how much went to the shield and how much to the hull.
- **Consumables:**
  - The 4 kinds use the values, caps, use times and stack sizes in this file.
  - Using one takes time, and the use can be interrupted.
- **Loot:**
  - Each match fills the loot spots with items, by rarity.
  - Sinking ships drop their items.
  - Ships pick items up.
- **Territory:**
  - Water a ship sails through takes its colour.
  - Ships slowly repair in their own water.
  - Holding a landmark gives the holder that region's perk.
  - At least the four perks the rewrite had work, in their new regions:
    - Fast Reload (the Basalt Stacks);
    - Fast Repair (the Fjords);
    - Cheap Deliveries (the Glass Sea);
    - Fire Shot (the Fire Archipelago).
- **Coins and gull deliveries:**
  - Coins are earned in play and spent on deliveries.
  - The gull flies each delivery to the ship.
  - Coins reset when the match ends.
- **The Gale:**
  - The fleet is carried high over the planet.
  - Each captain picks a region and dives into it.
- **The Storm:**
  - The first safe zone covers half the planet, and the Storm closes over 7 phases.
  - The final circle lies wholly within one region and contains some of its land, never only open water.
  - Over 1,600 seeds, each region hosts within ±30% of 1/16 of the finales.
- **20 ships:**
  - 19 bot captains sail, loot, fight, use consumables and flee the Storm.
  - A full headless match runs to a winner with no errors. This is a crash test only.
- **Abilities:**
  - Every ship carries one active ability (on a button with a cooldown) and one passive.
  - The starter pair, Repair and Salvage, works.
  - All 16 abilities in `src/sim/abilities.ts` work in the simulation.
- **The whale:**
  - It surfaces and dives along its routes.
  - The giant whale breach event can lift and flip ships.
- **Rotating rule changes:** chosen by the date, with at least three working.
- **Determinism:** a match replayed from its seed and inputs ends with the same state hash in Node, Chromium and WebKit.

**The renderer, done when:**
- **The planet is a real sphere on screen:**
  - Terrain comes from `heightAt`. Each region picks a placeholder material set through the rewrite's ported material system. Sets may be shared at this rung, and they blend at borders.
  - The water is a sphere with waves and a colour that changes with depth.
  - The sky has the sun, moon and stars, placed from the hour and the tilt. The dark half of the planet is dark.
- **The rewrite's look carries over:** high dynamic range, bloom and the colour grade.
- **The chase camera keeps the local up.** Another ship's mast drops below the horizon at about 240 m.
- **An orbit view shows the whole planet,** for the Gale and the lobby.
- **The rewrite's caravel sails on the sphere,** rolling and pitching, with the shield aura as a shell around it.
- **The rewrite's effects work on the sphere:** projectiles, splashes, impacts and wakes.
- **The gull and the whale render.**
- **Nights are readable:** at night, every lantern within 240 m and every beacon shows in captures.
- **Weather systems show** as simple cloud formations and fog.

**Every screen, done when it exists, can be reached and left, is built from the shared parts, and shows this real data:**
- **Title:** the game's name, then a tap to start, after the loading progress.
- **Lobby:**
  - It sits over the live 3D planet, with your ship on the water and your cosmetics on.
  - It shows your level and rank, and has the play button.
  - It links to every menu screen.
- **Abilities:** all 16, with locked and unlocked states and the level each unlocks at. You pick one active and one passive.
- **Locker:** about 100 cosmetics by kind, with locked and unlocked states and their unlock rules. You equip them on your ship.
- **Rivals:** about 40 captains with their emblems and temperaments, and your record against each one.
- **Career and chart:**
  - Matches played, wins, top 5s and kills.
  - The chart of the 16 regions, with the ones you've sailed filled in.
- **Rank:** your rank and step, progress to the next, and every rank from Iron to Legend.
- **Settings:** sound volumes, haptics, quality and controls. Changes apply at once and are saved.
- **The HUD:**
  - shield and hull;
  - the hotbar;
  - the ability and gust buttons with their cooldowns;
  - the map;
  - the Storm timer;
  - ships left and kills;
  - hit markers, and damage numbers in blue for shield and white for hull.
- **Gale drop:** the globe with its day and night halves, the regions you can pick, the time left to dive, and the dive itself.
- **Death and spectating:** who sank you and how, then spectating the ship that did, with a way back to results.
- **Victory:** a full-screen win moment.
- **Results:** this match's placement, kills and XP gained, plus level and rank progress, with new unlocks.

**The shared interface parts, done when:**
- **One set of tokens exists:** colours, type sizes, spacing, corner radii and shadows.
- **The parts exist:** buttons, cards, tabs, panels, rarity frames, progress bars, toasts and pop-ups.
- **A gallery page shows every part** at iPad and iPhone sizes.

**The career, done when:**
- **The league:**
  - About 40 captains, each with a temperament and an emblem.
  - Each match draws 19 of them near your skill. Rivals are drawn more often.
  - Captains learn your habits and hold grudges.
- **Skill and rank:**
  - The hidden skill rating updates after every match.
  - Rank comes from the rating: six tiers of three steps each, then Admiral and Legend.
  - You never drop below a tier you've reached.
- **Levels:** XP earns levels. The 16 abilities unlock across roughly the first 40 levels.
- **The catalogue:** about 100 cosmetics are defined, and each has an unlock rule.
- **The record:**
  - The rivals record and the chart of sailed regions are kept.
  - Everything is saved between sessions.

**Sound, done when:**
- Every mechanic above has a placeholder sound.
- Every region has an ambience bed.
- There is no music.

**Integration, done when:**
- **The loop runs end to end:** title → lobby → Gale → match → death or victory → results → lobby, with the career updated after each match.
- **It runs on devices:** `npm run ios` builds, and it runs on an iPad.
- **The capture tools work.** From a seed, they produce:
  - frame strips of a scripted moment, with a log of every sound and screen effect that fired;
  - fixed scenes in each region at dawn, midday, dusk and night;
  - blind-test shots;
  - lap-test frames;
  - interface transition strips at iPad and iPhone sizes.
- **Performance is measured** on a device or the simulator, and the numbers are recorded in the backlog.

### Who owns what in pass 1

Agents build in parallel. Each owns its paths and touches nothing else, so pushes to main rarely collide. The rewrite's flat game, at `src/main.ts`, `src/*.ts` and `src/gfx/`, keeps running until the integration step replaces it. Port from it; don't break it.

| Owner | Paths | Delivers |
|---|---|---|
| World | `src/sim/world/**`, `src/render/regions/**`, `dev/world.html` | The 16 regions on the sphere through the API in `src/sim/world/index.ts`, and their landmark meshes |
| Simulation | `src/sim/**` except `world/`, `tests/sim/**` | Every mechanic in the list above, deterministic, on the sphere |
| Planet renderer | `src/render/**` except `actors/` and `regions/`, `dev/planet.html` | Terrain, water, sky, light, weather, the grade and the cameras on the sphere |
| Actors and effects | `src/render/actors/**`, `dev/actors.html` | The hero ship, the shield aura, projectiles and effects, the gull and the whale |
| Interface | `src/ui/**`, `dev/ui.html` | The shared parts and every screen, driven by view models |
| Career | `src/career/**`, `tests/career/**` | The league, skill, ranks, levels, abilities and cosmetics catalogue, and saving |
| Sound | `src/audio/**`, `dev/audio.html` | Synthesised and recorded sound for every mechanic and region, with no music |
| Integration | `src/main.ts`, `src/app/**`, `index.html`, `tests/capture/**` | Wiring it all together, and the reviewer's capture tools |

**Asset libraries started early at the owner's direction.** Each is self-contained with its own dev page. Regions take them up when they reach the Good rung. Their credits are all in CREDITS.md, and new credits go straight there.

| Owner | Paths |
|---|---|
| Flora A–D (four regions each) | `src/render/flora/**`, `public/tex/flora/<a–d>/`, `dev/flora-<a–d>.html` |
| Rocks | `src/render/rocks/**`, `public/tex/rocks/`, `dev/rocks.html` |
| Materials North and South | `src/render/materials/**`, `public/tex/regions/**`, `dev/materials-*.html` |
| Cosmetics | `src/render/cosmetics/**`, `public/tex/cosmetics/`, `dev/cosmetics.html` |
| Icons | `src/icons/**`, `dev/icons.html` |
| Weather effects | `src/render/weather/**`, `dev/weather.html` |
| Juice | `src/juice/**`, `dev/juice.html` |
| Beacons | `src/render/beacons/**`, `dev/beacons.html` |
| Landmarks North and South (queued) | `src/render/landmarks/**`, `public/tex/landmarks/`, `dev/landmarks-*.html` |
| Water looks (queued) | `src/render/waterlooks/**`, `dev/waterlooks.html` |

Contracts between owners:
- **`src/sim/world/index.ts` is the only way into the world.** Its exported names and signatures stay stable. Additions are fine.
- **The renderer, the interface and the sound each define the view model or events they consume.** Integration adapts the simulation's state into them. The simulation never imports from them.
- **Shared files** (PLAN.md, package.json, CREDITS.md and tests/run.ts) change only when needed. Rebase before pushing, and never force-push.

### Pass 2: done when

Pass 2 takes every item to **playable**: it plays as intended, with rough visuals. The core loop comes first, starting with what pass 1 left in the match. An item is done only when every line in its list is true. The independent reviewer checked this list's coverage before the work began, and its gaps and sharper wordings are folded in.

The owner hasn't played pass 1 on an iPad yet, and the plan asks for that before the next pass starts. Pass 2 began on the owner's overnight instruction, "go with your best judgements and do not stop". The owner should confirm that this covers starting before the playtest.

**What pass 1 left failing, done when:**
- **Mistwood:** giant cedar trunks rise above a fog line across the region, as placeholder shapes. Ships can't sail through the trunks, and the trunks block sight.
- **The Mangrove Labyrinth:** a low canopy covers its channels, as placeholder shapes, and ships sail beneath it.
- **The no-humans check passes on re-review,** judged from orbit, border and night captures, for:
  - the Hollow Cedar's new stump;
  - the Eye's tip light;
  - the Hollow Cedar's log seen end-on;
  - the Coral Atolls' columns.
- **The Needle** is re-judged, and can be seen from every point of its borders with the Ice Crown, Mistwood, the Narrows, the Spice Isles and the Coral Atolls.
- **It runs on a real iPad** (see Integration).

**The match, done when:**
- **Matches last 10–12 minutes:** over 20 headless bot matches, the median is 10–12 minutes, and none is under 8 or over 14. *Done: over 80 seeds of an all-captain fleet, in four sets of 20, the medians are 11.7, 11.9, 11.9 and 11.7 minutes, and every match ends 10.1–12.9 minutes in. Matches had run 4.4–6.4 minutes. The Storm's phases are longer, so it closes about 13 minutes in (the first waits 95 s and closes over 65; the last waits and closes over 30 each). Captains also hold back early on: their will to fight falls by 0.5 in the first two phases, and by less in each after, down to nothing in the last. While it does, they fire only in a fight they chose, or back at a ship close by that has just shot them, and they let a ship sailing away from them go once she is 90 m off. With three ships or fewer afloat they hold back 0.4 more and leave the Storm to bring on the end. A captain no longer stops to mend with a foe within 70 m. tests/sim/captains.test.ts sails four whole matches.*
- **Ram damage is capped:** one collision takes at most 45 off a ship, whatever passives, perks and abilities stack on it. *Done: tests/sim/match.test.ts drives a gusting Ram on a light hull into a ship sailing at her.*
- **Landmarks are solid:**
  - Ships run into every landmark's shape. That includes the Kelp Cathedral's columns: you sneak through the kelp between them, not through them.
  - The ones you sail through or under are solid only at their sides: the Hollow Cedar, Moonbow Arch, the Root Gate and the Fjords' curtain.
  - The ones you sail into keep their mouths open: Cinder Peak's caldera, the Gorge, Glasswater's pool and Spice Cove.
  - The Ice Crown's floes are solid, and one riding into a ship shoulders her aside.

  *Done: tests/sim/sailing.test.ts sails a ship at a column in every region that has them, at the Hollow Cedar's log from abeam, and parks one in a floe's path. Arches and curtains are never solid, and the open mouths are terrain the solid shapes leave alone.*
- **Everything you can do, you can do on touch.** Each action has a HUD control of at least 44 points at every supported size, and no action needs a keyboard. The actions are:
  - steer, and set the throttle from full sail down to a stop;
  - aim, fire and reload;
  - select, swap and drop on the hotbar, and take loot;
  - use a consumable;
  - gust, and use the ability;
  - call a gull delivery;
  - pick a region in the Gale, and dive.
- **The captains' Storm habit is learnt in the simulation's own units,** and `setupFrom` keeps it. *Done: the career and the simulation both keep it as the seconds the player stays out in the Storm each time it catches them. `setupFrom` carries it, and the run habit, into the match on the simulation's 0–1 confidence scale (it had been passing the career's 0–1000). The app now measures the run habit too, which it never had. A captain sure the player lingers waits for them just inside the edge (tests/sim/captains.test.ts, tests/app/habits.test.ts).*
- **The Gale spreads out:**
  - At the moment each captain leaves the Gale, no more than 3 ships are within 100 m of it.
  - No region gets more than a quarter of the captains' picks in a match.

  *Done: a captain takes the least-picked region, starting with the first circle, once its own pick is full. Once it is bound to leave, it holds on while 3 ships that have left are still close. Captains whose drop lies past the Gale's end start taking turns 2.5 s apiece before it blows out. Ships still riding don't count toward the 3. They sit in the Gale's own 36 × 27 m block, so they are always within 100 m. Over 12 seeds of an all-captain fleet the worst is 2 ships near a leaver, and 59 of 60 captains still land in the region they picked (tests/sim/match.test.ts). Over 80 seeds of a measuring script, one captain in one match is still held when the Gale blows out, and lands beside 3 others and an idle player.*
- **A pick near the Gale works:** a pick within 600 m of the ship glides down to that pick instead of leaving the Gale at once. *Done: a ship can only glide once it has left the Gale, so leaving at once is right for a pick inside glide reach (1,120 m). What matters is that it then glides for the pick's centre and dives once within 120 m of it, and it does. Four near picks come down 9–51 m from the centre. A pick further along rides on, leaves near it, and comes down inside it (tests/app/pick.test.ts).*
- **The rivals are realistic:** in the fixtures, at most a third of the captains are tagged Rival. *Done: the fixture measures rivalry as the career does, from grudges and sinkings either way, and tags at the career's 0.3. It plays a mid-career record, which tags 12 of the 40 (tests/app/fixtures.test.ts).*
- **Grounded ships slide:** a ship pressed against a slanting shore slides along it instead of freezing. *Done: a stopped move now slides along whatever stopped it, easing 0.3 m/s off it. If the bank bends into her slide, she slides along that in turn, up to three times a tick. Run at shores 50° from straight in all over the planet, 44 of 46 slide 10 m or more along them, up from 38 (tests/sim/sailing.test.ts). Without columns near, the misses are a hull pointing straight into a nook, and she has to turn out of it. At 35° and 65° the freezes fall from 21 of 45 to 11, and from 15 of 48 to 3. Most of what's left is wedged between a column and the bank.*
- **Bots don't get stuck:** over 20 headless matches, no bot stays aground for more than 10 s. *Done: over the same 80 seeds the longest any captain stays aground is 9.2 s; in three of the four sets it is under 9. A captain aground and dragging at a grounded ship's 2 m/s for a second stops making for its mark and works off the way the water deepens. It goes by the highest ground it would cross in the next 14 m each way, so it never makes for deep water over a spit. With the deep water astern it holds the turn it is in instead of swinging from side to side. One crawling with shoal water 4 m off her bow does the same, which gets her out of a pool the falling tide has closed round her. Two faults in the sailing came to light: on a bar lying dead flat the push off toward deeper water had no slope to follow and pushed against the ship's own way, and a captain mending could not work off the ground at all. tests/sim/captains.test.ts checks four seeds that once failed.*

**Every region (all 16), done when:**
1. **Its event works in the simulation.**
   - It happens at least once in every match, at a time drawn from the seed.
   - It warns 5–10 seconds before it starts, runs, and then ends. The table below says what each one does.
   - Each tide event moves the region's water beyond the planet's tide range while it runs, so its passages open or close even at the opposite tide.
2. **You see and hear its event:**
   - a basic visual in the world that you can see from inside the region;
   - a sound;
   - a banner with the event's name (the table's banner column) when you're in the region or within 240 m of its border;
   - a marker on the map while it runs.
3. **Bots react to its event,** as the table says:
   - In the event's scripted moment, a bot that starts in the danger leaves it within 20 s of the warning, or a bot within 300 m reaches the reward within 20 s.
   - Over 20 headless matches, bots spend less time in the danger while the event runs than in the same span before it.
4. **Its perk works, and you can see it working:**
   - Holding the landmark gives the perk.
   - The HUD shows the perks you hold. Gaining or losing one gets a banner and a sound.
   - Each perk shows itself working, as the perk table below says.
5. **Its beacon works:**
   - It is lit at night and dim by day.
   - Its colour is one that no neighbouring region's beacon shares.
   - It shows at night from every border the region shares.
6. **Its mechanics work, and bots use them,** as the table's mechanics column says.
7. **Weather and light apply:**
   - The region's weather kinds form over it and show as their own clouds, fog, rain, snow or ash. The regions capture adds a midday frame of each region under each of its kinds.
   - Their effects work there.
   - Dawn, midday, dusk and night each light it differently. A test checks that the four times differ in the sun's direction and colour, and that at night the light comes only from the moon, the beacons and the lanterns.
   - Placeholder materials are fine.

| Region | Event in the simulation | Banner | What you see and hear | What bots do | Its mechanics, which bots use |
|---|---|---|---|---|---|
| The Ice Crown | The floe rings turn faster, so lanes open and close. | Floes Turning | Floes on the move; cracking ice. | Steer round the floes. | The floes, which knock hulls. |
| The Fjords | A flood surge: a strong current runs out of the main fjord. | Flood Surge | The falls swell, with foam on the outflow; a rising roar. | Ride the surge out, and don't fight their way up it. | Hiding behind the curtain. |
| Mistwood | A fog surge: a fog system rolls out over the region. | Fog Surge | A fog bank moves in; the sound goes muffled. | Use the fog to hide or to get away. | The Hollow Cedar, and the trunks as cover. |
| The Spires | A spire topples into a channel and blocks it for the rest of the match. | Spire Falling | The spire falls and lies across the channel, with a crash and a splash. | Route round it. | The slalom between the needles. |
| The Narrows | A rockfall blocks one end of the Gorge for a while. | Rockfall | A pile of rock in the gorge mouth; a rumble and a crash. | Route round it while it's there. | The Gorge's single way in and out. |
| The Basalt Stacks | A low tide opens the hidden passage behind the arch. | Low Tide at the Arch | The sea level drops at the arch; surf booms. | Use the passage while it's open. | The arch and its tidal passage. |
| The Kelp Shallows | A bloom: kelp spreads over the water and slows every ship in it. | Kelp Bloom | Kelp mats on the surface; kelp brushing the hull. | Steer round the bloom. | The shallows, and the Cathedral's columns. |
| Blossom Run | A spring flood: the river's current runs much faster. | Spring Flood | Fast water and petals streaming down the river; the river's rush. | Ride it downstream. | The river current. |
| The Glass Sea | The giant whale breaches. | Whale Rising | The whale rises and breaches, lifting and flipping ships (pass 1). | Get clear of the rising whale. | The whale road and the sand shallows. |
| The Jade Shoals | The tide falls: bars rise and channels close. | Falling Tide | The bars show above the water; gentle surf. | Keep to the channels. | The bars and channels, with Shallow Draft. |
| The Coral Atolls | The tide closes some reef gaps and opens others. | Reef Tide | Reef flats show or drown at the gaps; surf on the reef. | Use the gaps that are open. | The reef gaps. |
| The Spice Isles | A pearl bloom: a clam bed opens with rare loot. | Pearl Bloom | Glowing clams on the water; a chime. | Go for it, and fight over it. | The cove. |
| The Fire Archipelago | An eruption: lava bombs fall round the cone, and an ash cloud forms downwind. | Eruption | The plume flares; bombs fall with trails and burst; a rumble and booms. | Get away from the cone and out of the ash. | Sailing into the caldera. |
| The Weeping Isle | A cloudburst: rain sets in over the region, and mist rolls out to sea. | Cloudburst | Rain and mist around the isle; heavier falling water. | Use the mist to hide or to get away. | The cliff-foot rocks. |
| The Mangrove Labyrinth | The tide rises and floods new channels through the roots. | Flood Tide | The water rises among the roots; frogs and drips. | Use the new channels. | The channels, the Root Gate and the canopy. |
| The Maelstrom | The vortex strengthens and pulls harder toward the Eye. | Vortex Rising | The spiral foam turns faster; the roar rises. | Keep clear of the Eye. | The spiral and the Eye. |

A ship pulled into the Maelstrom's Eye runs aground on its rocks, and the pull holds her there until she sails out against it. (Settled overnight in the owner's absence; the owner may change it.)

*Simulation side done (parts 1 and 3); the visuals, sounds, banners and map markers come next. src/sim/regionEvents.ts runs the programme: each region's event once a match, the far side of the planet from where the Storm closes first, 27 s apart from 45 s in, warned 5–10 s ahead (the whale's own 6 s rising for the Glass Sea), and all over by about 540 s. What each one does to the sea lives in environment.ts, so sailing, the weather and the captains' chart all see it. The four tide events lift or drop the region's own water by 2.4–3 m round their spots, more than the planet's 1 m tide, so their passages open or close at either tide. tests/sim/events.test.ts checks each event's effect, the programme over six seeds, and determinism with the events in. In the scripted moments a captain clears a falling spire and the erupting cone well within 20 s, and one 300 m off reaches the pearls. Over 20 all-captain matches (tests/tools/events.ts), ship-seconds in each danger from warning to end against the same span before it: Spires 1 against 4, Narrows 0 against 35, the whale 1 against 6, Cinder Peak 31 against 55, the kelp bloom 53 against 212, the Maelstrom 3 against 34. No ship is hit by a falling rock, and 23 of 1,260 lava bombs hit someone.*

*Part 2 done: every event has a banner (its name, a line on what to do, and a countdown, shown in the region or within 240 m of its border), a marker on the map while it is warned and runs, a sound at its spot, and a shake and haptic for the dangers. In the world: the Ice Crown's floes ride faster; Mistwood's fog bank and the Weeping Isle's rain and mist roll in as weather; the four tide events visibly raise or draw down their own water, and the sea floor and shallows with it (src/render/lift.ts); the Spires' spire leans as it is warned, falls with a crash and a splash, and lies across the run; the Narrows' rock pours down the wall and heaps in the Gorge mouth, then settles away when the event ends; the Basalt Stacks' tunnel has a roof of columns and turf you sail under; Cinder Peak's plume flares and its bombs arc out with trails and burst on land or water; the whale rises (pass 1); the pearls come up as loot. `npm run capture -- moment events` frames all 16 from open water in the region with a clear line to the spot (src/app/moments.ts). The Kelp Shallows' bloom spreads rafts of kelp over the water as far as the simulation holds ships back, riding the swell (src/render/regions/eventKelp.ts). Water running faster than the Great Current, in the Fjords' surge, Blossom Run's flood and the Maelstrom's whirl, carries foam streaks downstream (src/render/fastWater.ts). Moment strips step exactly one beat a frame and draw their last 24 ticks at 30 frames a second, so what builds over time shows as it would in play.*

Decisions made for the events (Settled overnight in the owner's absence; the owner may change it.):
- The Basalt Stacks' hidden passage is a sea-cave tunnel under the arch: its roof stands below 8 m and the water under it is shut at any tide, until the event drops the sea there by 3 m. Its cave hoard of 3 items spills out as it opens.
- The Spice Isles' clam bed spills 5 pearls rolled three rarities richer than usual. Captains go for them for the first 30 s.
- The Jade Shoals ebb 2.5 m, the Mangrove Labyrinth floods 2.5 m, and the Coral Atolls' tide runs 2.4 m up at one gap and down at the other.
- Captains keep clear of Cinder Peak's drifting ash cloud as well as its cone. Leaving the cone, they look past its dry flanks to the water beyond, and swing round the danger rather than out of the Storm's calm.
- A danger event whose spot the Storm's calm would have closed round by its end (leaving less than 60 m of calm clear of it) swaps slots with the latest earlier event that fits. Without this, a finale at Cinder Peak trapped ships between the eruption and the Storm.
- The spire that falls stands on a low stump (3 m, 40 m from the run's middle along its fall) all match, and the stump stays when it breaks. The fallen spire, the Narrows' scree and the tunnel roof are meshes drawn by the stage (src/render/regions/eventRocks.ts), not terrain, so the planet's height field stays the same all match.
- The event strips look on the event from open water in its own region with nothing standing between, and use one of the region's other spots when the match's own can't be seen. The Narrows' north mouth has almost no open water round it.

**The independent review of part 2** (at `3fee5d7`, from `npm run capture -- moment events` and the layout capture):
- **10 regions pass:** the Ice Crown, Mistwood, the Spires, the Narrows, the Basalt Stacks, the Kelp Shallows, the Glass Sea, the Coral Atolls, the Weeping Isle and the Mangrove Labyrinth.
- **6 fail:**
  - **The Fjords:** no falls in view, and the outflow foam looks the same before and during the surge.
  - **Blossom Run:** foam streaks, but no petals.
  - **The Jade Shoals and the Fire Archipelago:** the strip is filmed from the next region (the region tag reads the Glass Sea and the Basalt Stacks).
  - **The Spice Isles:** no glowing clams on the water.
  - **The Maelstrom:** no spiral foam turning faster, and the strip looks away from the Eye.
- **No strip shows the banner from outside a region,** so "within 240 m of its border" is unproven for all 16.
- **No-humans:** the Basalt Stacks' tunnel roof reads as a flat block with a square, door-like opening, and a stepped stack beside it as a ziggurat. The Coral Atolls' square columns read as pillars again. A grey drum of loot floating at Blossom Run reads as a pipe.
- **Borderline:**
  - A neighbouring event's banner fades out under a new warning, and then stays gone while its event still runs.
  - The Glass Sea's banner goes while the whale is still in the air.
  - The Basalt Stacks' warning says the cave is open before it opens.
  - Hard-edged pale shapes on the water: a tan band at Mistwood's fog edge, a flat white wall of mist at the Weeping Isle, a pale slab with a hard top over the Mangrove Labyrinth's risen water, and a pink sheet in the Maelstrom.
  - The Jade Shoals' surf plays at a gain of 0.02, barely heard, and it and the Coral Atolls share one sound.
- Foam marks fast water only where it runs faster than the Great Current (4.4 m/s), full white from 8 m/s. Tracers ride the current within 115 m of the camera's focus and write foam into the water's wake map, so the streaks follow the real flow.
- The kelp rafts are one instanced mesh laid where the simulation slows ships, and the Kelp Shallows' strip looks on from inside the bloom.

*Revision 1 of the six failed strips, checked in their captures:*
- **The Fjords:** the strip lies on the outflow 200 m from the falls, looking up the fjord at them. The falls are rebuilt as a streaming sheet poured off the cliff's own lip (found by sampling the ground toward the head wall) and arching out to the water, with mist rolling off the plunge. Through the surge the sheet widens by up to three quarters, runs whiter and thicker, and its mist billows (`swollen()` in src/render/regions/landmarks.ts). Foam streaks the outflow while the surge runs.
- **Blossom Run:** drifts of cupped pink petals ride the river's current wherever it runs over 1.2 m/s, a scatter at any time and thick through the Spring Flood (src/render/regions/eventPetals.ts).
- **The Jade Shoals and the Fire Archipelago:** filmed from inside their own region. The strip's spot must be over 0.8 inside the region, and the dune or cone being looked at no longer counts as standing in the way. The Jade Shoals are filmed 290 m from the dune and Cinder Peak 260 m from its cone, so the plume and bombs are in frame.
- **The Spice Isles:** a bed of nine giant clams comes up round the spot while it is warned, gapes open as the bloom starts with a glowing pearl in each, and closes and sinks once it is over (src/render/regions/eventClams.ts).
- **The Maelstrom:** filmed 80 m from the Eye, looking at it, so the spiral foam builds round the ship as she is drawn in.

Decisions (Settled overnight in the owner's absence; the owner may change it.):
- The falls drop from where the cliff stands, about 105 m, not the 146 m the head wall reaches further back.
- The clams only show where the bed is. The pearls the simulation spills are still the loot.
- The petals are drawn round the camera only, out to 120 m, and are not in the simulation.

The banner within 240 m of a border is checked by tests/app/banner.test.ts rather than a strip: for every region, with only its event warned, the banner shows at its landmark, 120 m and 220 m past its border on up to three bearings, and not at the first point beyond with none of the region's water within 260 m.

*Revision 1 of the no-humans shapes, checked in their captures:*
- **The Basalt Stacks' tunnel roof:** each roof is now a rough natural arch, a lumpy rock vault. Its inner curve rises to the roof's 8 m clearance over the water, its outer face falls to the sea on both sides, and its ends are broken off unevenly. Turf grows over its top (src/render/regions/eventRocks.ts).
- **The stepped stack:** this was the Moonbow Blowhole beacon, whose column heights fell away in even rings.
  - It is now a sheer-faced stack of columns standing behind a low causeway of broken columns round the blowhole.
  - *Revision 2:* the first reshape had a flat top with evenly snapped columns that read as battlements. Now the top leans from one end to the other in lumps, and the columns snap off in clusters of uneven width (src/render/beacons/looks/basaltStacks.ts).
- **The Moonbow Arch's legs** stand in bundles of hexagonal columns of uneven heights, turf on their tops. The bundles also hide the shaved ground round the legs' feet.
- **The Coral Atolls' columns** are now knobbly coral heads. Each pinches in at a waist, leans a little and domes at the top. It is painted face by face, from deep red at the foot to pale coral, with bleached and violet patches (`coralTower()` in src/render/regions/landmarks.ts).

Decisions (Settled overnight in the owner's absence; the owner may change it.):
- The ziggurat was a beacon, so it is reshaped in the beacon's own look. Its spray, blowhole and moonbow are unchanged.
- Backlog: from 150 m the column tops still read square-cut.

*Revision 1 of the loot "pipe" and three borderline items:*
- **The grey drum at Blossom Run** was the broadside's loot token, its short gun lying alone on the water. Hiding the scene's groups one at a time found it. That token now sits on a ship's truck carriage: two cheeks on a bed, on four small wheels. Every other gun token stands on its deck mount with its barrel cocked up. The repair tokens are bellied casks with hoops, not plain cylinders (src/render/actors/loot.ts).
- **The banner hand-over:** a second, smaller banner sits under the first. Your own region's event takes the first. Then events already running beside you come before those only warned, so a new warning never hides an event still running next door. `eventsOf` in src/app/matchModels.ts; tested in tests/app/banner.test.ts.
- **The Basalt Stacks' warning** now reads "The cave opens: sail in for its hoard.", so it no longer says the cave is open before it is.
- **The Jade Shoals' sound:** the falling tide has a sound of its own, `tideDraw`: a long hiss of water running off the sand that falls away, with gurgles as the channels empty. The tide coming back in keeps the flood surge. The events that fill a whole region play all round you while you are in that region, not from their spot 300 m off: the Mistwood fog, the Spring Flood, both tides, the cloudburst and the Mangrove flood (`WIDE` in src/app/sounds.ts). Checked as rendered buffers only, since the captures run muted.
- **The Glass Sea's banner** went at 4 s, while the whale was still in the air: its leap takes 4.8 s to come down. That event now runs 7 s (`REGION_EVENT.run` in src/sim/tables.ts), so the banner holds through the leap and the wall of water and leaves once the sea is calm again. Checked in the event-glassSea capture.

*Revisions of the hard-edged pale shapes, checked in their captures and in the regions and borders captures:*
- **The Maelstrom's pink sheet, and the pale slabs over the water in general:**
  - The planet is small, so an eye 8 m up looks down through the sea short of the horizon and out of it again, to land beyond that the curve should hide. The water is see-through, so that land showed through it as pale ghosts with a hard edge where it met the waterline.
  - That was the Maelstrom's sheet: its far ring wall, 220 m off. The same ghosts stood under the horizon elsewhere: the lower halves of the coral columns and the spires, the Spice Isles' hill below its own waterline, and the slabs in the Maelstrom's and the Basalt Stacks' dusk frames.
  - Now the sea takes such a line as it does a floor at the line's lowest point, as the sky already did where no floor is drawn, and the air ends where the line enters the sea (`underSea` and `seaEntry` in src/render/planet.ts).
  - Seabed seen down through the water is unchanged. Against the last commit, the shallows' frames move under 0.03% of their pixels (the Glass Sea's 0.4%, round the whale), and the orbit views barely at all.
  - *Revision 1 was dropped:* it lengthened the path through the water at glancing looks. That muddied the clear shallows, and once the captures waited for the terrain it did not remove the sheet. This is revision 2.
- **The Weeping Isle's white wall of mist:**
  - The cloudburst's fog puffs lay low on the water. Where the isle's cliffs came up through a puff, the land cut it with a hard edge, and a puff low on the sea met the water along a hard line.
  - Now the puffs thin out over their last 5 m above the water. The ones over the shore rise clear of the land under them and cap the hills instead (`landUnder` in src/render/weather.ts).
- **The Mangrove Labyrinth's slab** did not show in this pass's capture of its flood.
- **Mistwood's tan band** is the territory ink: the pen line of the ship that holds that water, drawn at the fog's edge.
- **The moment captures** now wait for the terrain round the camera to load before each frame is shot, on still frames that move nothing on (tests/capture/moment.ts). Before, a ship that had moved was shot over the coarse chunks still standing in for the fine ones.

Decisions (Settled overnight in the owner's absence; the owner may change it.):
- Mistwood's band stays as it is. It is the territory ink doing its job, not a slab of mist.
- Backlog: a cliff face turned from the sun at close range reads as a flat, near-black slab (the Weeping Isle's cloudburst frames from t+30, lower left). It is the rock's own colour under the sky's light alone, crushed by the grade's ACES toe, and the cloudburst doesn't soften the light the way an overcast sky would. That is a lighting and grade change for every region, so it waits for its own pass.

**The independent review of the revisions** (at `e2d8532`, from the 16 event strips, the regions capture, the Gale's layout capture, and the whale-breach and broadside moments): **3 of its 7 items pass.** They are the Gale globe's names (inside the rim and clear of one another at all four sizes), the event banners (the hand-over next door, and the Glass Sea's held through the leap and the splash), and the career tips (all 22 come up through their own triggers, once each, and the save is written, read back and cleared).
- **The region events fail, on one region of 16.** The Narrows' strip looks at a rock wall a few metres off in all 16 frames, so the rock heaping in the Gorge mouth never shows. Only the shake, the sound and the banner do. The other 15 show their event from inside the region.
- **No humans is borderline.** The Basalt Stacks' tunnel roofs now read as natural arches. Three shapes still read as built:
  - the Moonbow Blowhole's stack, whose square-cut column tops stand at stepped heights like a ruined, crenellated wall;
  - thin, flat-topped grey cylinders behind a coral head, which read as pilings;
  - the smooth pale block the Fjords' Glowfall pours off, which reads as a concrete dam.
- **Pale slabs over the water fail.** The review found five:
  - a flat, untextured light-grey plane over the bottom of the Ice Crown's midday frame;
  - the Fjords' pale block;
  - a grey, stair-stepped band beside the Jade Shoals' bars and the Coral Atolls' reef flat as their tides fall;
  - the broadside's loot gun at Blossom Run, drawn flat grey with no shading;
  - a white dome with a hard outline on the Mangrove Labyrinth's horizon in every frame.
- **The juice checklist is borderline.**
  - **The broadside:** its effect log has every layer, on firing and on each hit, but the screen doesn't show them. The target is hidden behind your own stern, so the hit marker sits on your own ship and reads as if you were hit. No damage number shows, the splinters can't be seen, the flashes are faint, and nothing winds up before the shot.
  - **The whale breach:** it has its wind-up, a rumble, the spray, a rainbow, a haptic and its sound. It has no flash, no hit-stop and no interface response, and only one sound layer. The whale stays mostly off the edge of the frame, and the strip ends 0.4 s after the trigger, so the leap is never seen.

New problems it found, to the backlog unless a revision below takes them:
- The Ice Crown's spires render as rust-red rock, not ice.
- Mistwood's water is bright turquoise, with no fog and no cedar trunks, and the Hollow Cedar shows at dusk as a pale grey spire with a jagged top.
- The Great Cherry is grey at midday.
- The Maelstrom's water is calm in the regions capture, with no spiral foam.
- Cyan surf-glow smudges float above the water in the Basalt Stacks' midday and dusk frames. The far sea stack there is a flat, unshaded tan at dusk, and the blowhole's spray is one large, flat white oval.
- Close sails show a dot-grid dither.
- At Cinder Peak the eruption plays at a gain of 0.045 and the bombs at about 0.03, and the shake is skipped as out of range though the camera is in the region.
- Five events share the flood-surge sound: the Fjords, the Basalt Stacks, Blossom Run, the Coral Atolls and the Mangrove Labyrinth.
- The own ship's lantern glow washes out her hull on the Ice Crown's nights.
- A ship hangs in the sky in two frames (Mistwood's t−30 and the whale's t+6).
- A dark, hard-edged square patch sits on the water in the Maelstrom's event frames, and a lighter hard-edged wedge in the Jade Shoals' first frame.
- The Glass Sea's banner is gone while the splash's spray still hangs.
- The Gale globe drops the names of the Mangrove Labyrinth and the Coral Atolls, which sit near its rim.

*Revision 1 of the four items that failed or were borderline, checked in their captures:*
- **The Narrows:** the strip waits off the Gorge mouth, 90 m back from where the rock comes down, looking straight in. Nothing may stand in the way short of the last 10 m (`facing()`'s `bare` in src/app/moments.ts), so the wall tops the rock falls from and the heap in the slot of water are in frame.
- **No humans:**
  - **The Moonbow Blowhole's stack** (its second reshape): the columns meet with no sky between them. Each breaks off on its own slant with a corner chipped away, and the high top is under a mantle of turf that follows its lean and lumps, so the skyline is a rounded green brow (src/render/beacons/looks/basaltStacks.ts).
  - **The "pilings" behind the coral head** are clumps of leaning antler coral. Each branch thins to a blunt tip and forks into tines near its top (src/render/regions/landmarks.ts).
  - **The Fjords' "dam":** the Glowfall's slab is a granite crag. Its sides break into strata that undercut and step back to mossy shelves, vertical joints split it into blocks, a talus apron runs down under the water, and the water leaves through a notch in the lip (src/render/beacons/looks/fjords.ts).
- **Pale slabs over the water:**
  - **The Ice Crown's flat plane** was its floes. They are now the rock library's broken floes in blue-white sea ice: a ragged rim, a snow-crusted top and rafted slabs pushed up onto it, built a little wider to cover the water the simulation's floe does. They hold less light as the day goes (src/render/regions/floes.ts, src/render/rocks/skins.ts). The captures now wait for every rock texture to load (`rockTexturesReady` in src/render/rocks/material.ts), so a still is never shot of untextured rock.
  - **The Fjords' block** is the crag above.
  - **The stair-stepped band at the Jade Shoals and the Coral Atolls** was the sky's drawn floor where the eye's line only grazes the sea. It stood at the mean sea level, so when the tide fell it showed as a band above the water. It now sits at the sea's top as the events have moved it (src/render/sky.ts).
  - **The broadside's loot gun** is iron with enough of a matt skin for the sun to model it, and the rarity's glow rims its edges instead of filling it in flat (src/render/actors/loot.ts).
  - **The Mangrove Labyrinth's white dome** was a fog bank. Its puffs now fade from their middles out, so where the bank ends it frays, and thin upward into wisps, so from afar its top fades into the air (src/render/weather.ts).
  - **The Ice Crown's rust-red spires** (from the new problems): the region's cliffs are snow-dusted ice, tinted blue (src/render/ground.ts).
- **The broadside's juice:**
  - In a scripted moment that aims (the duels), the view turns toward the aim only until the aim is 0.7 rad off the view (`scriptLook` in src/app/session.ts). The target then sits beside the ship. Looked at straight, it was behind her own sails.
  - The hit marker goes on the hit where the screen shows it, kept inside the screen's margins. It falls back to the crosshair only when the hit is off the screen (`onScreen` in src/app/app.ts, `ctx` in src/app/juice.ts).
  - The interface's number over the target adds a broadside's four balls into one. The world's numbers no longer also show the hits the player lands, which drew each ball's 16 again (src/render/actors/index.ts).
  - The muzzle and hit flashes are brighter and hold two frames. The flash limiter adds the flashes already showing in the same blend to a new one, so a broadside's hits landing together count as one big flash, as the eye sees them (src/juice/screen.ts, src/juice/recipes.ts).
  - Checked: in the broadside strip the target stands to the right of the ship, the four markers sit on it, one "64" floats over it, and splinters and fire show on its hull. The cannon-hit strip keeps its framing, with its marker on the target.
- **The whale breach's juice:**
  - The renderer times the breach's beats from what it draws: the whale bursts out a second after the trigger and slams down four seconds after it. It handed those beats out as juice that the app never took. The app now plays them (`world()` in src/app/juice.ts). The eruption gives a rumble and a 1.8° widening of the view. The slam gives a heavy shake, a 4.6° widening, a cold white flash, a 55 ms hit-stop and a heavy haptic, all scaled by distance. A gull dropping your crate gives its small shake too. Juice that the renderer reports with a cause (hits and shots) is left to the moments' recipes.
  - The whale rises 33 m off, ahead to starboard, inside the 35 m lift. It leaps across the view to port, and the script aims at it, so the view turns to it. Before, it rose 26 m off at the frame's edge, too close for a leap of 62 m.
  - The strip runs from 1.2 s before the trigger to 4.6 s after, a frame every 0.2 s, through the leap, the slam and the wall of spray.
  - Its sound is one sound of six layers: the water rushing up, sheets of water off its back, a thump, a blast, a splash and a scatter of droplets. The log names it once. The dive sound follows at the slam.

Decisions (Settled overnight in the owner's absence; the owner may change it.):
- A scripted moment's view turns partway to what it aims at, not all the way.
- Hit markers go on the hit's point on the screen.
- The world's damage numbers skip the hits the player lands, since the interface's number covers those.
- Flashes of one blend that show together count as one flash for the limiter.
- The whale's beats play as direct camera, flash, hit-stop and haptic calls with the renderer's numbers. The `whaleBreach` recipe stays unused.
- The breach gets no interface response beyond the whale tip and, in the Glass Sea, the banner. It happens to the sea, not to your ship.

Backlog from this revision:
- The floes go dark at dusk and dawn, and the Ice Crown's pillars still read pink in low light.
- The Glowfall's granite should come from the rock library.
- src/render/weather/ is not used by the stage.
- A distant cloud deck ends in a firm edge (the Mangrove Labyrinth's first frame).
- The blowhole's spray is a flat white column.
- The juice library's particle and sound hooks are not wired (`hooked: false` in every log).
- Nothing winds up before the broadside. Making it wait for its gunports to open, or delaying the shot in the simulation, is the owner's call.
- The render ripples the broadside's muzzle flashes along the aimed side only, while the simulation fires both sides.
- The sun's glint on the sea blows out to a large white blob, sown with sparkles, when the view faces the sun (the broadside strip).
- In a match the chase camera has no shoulder offset, so a target straight ahead hides behind your own sails.
- Up close the whale's pectoral fins show as flat dark planes edge-on, and at the top of its leap it rises out of the top of the frame for about half a second.

**The perks, done when each shows itself working:**

| Perk | How you see it working |
|---|---|
| Frost Shot | A ship you hit frosts over and visibly slows while it lasts. |
| Fast Repair | Home repair ticks twice as fast on the hull bar. |
| Fog Sight | Names and bars show at full range in fog and at night. |
| Spotter | Ships you hit show on the map for a few seconds. |
| Long Range | Your aim reaches 15% further, and hits land at that range. |
| Fast Reload | The reload ring fills about 30% faster. |
| Hidden Wake | Your wake doesn't draw, and you're off other ships' maps. |
| Quick Gust | The gust button recharges faster. |
| Cheap Deliveries | The delivery price on the HUD is about 30% lower. |
| Shallow Draft | You cross a sandbar that grounds other ships. |
| Loot Sense | Nearby loot shows on your map. |
| Better Loot | Loot you open comes out in the next rarity's colour. |
| Fire Shot | A ship you hit burns, with flames and burn damage numbers. |
| Fast Refill | The use bar fills about 30% faster. |
| Tight Turns | Your turning circle is visibly tighter, as the map track shows. |
| Current Rider | You go faster on a current than a ship without the perk. |

**Mechanics, done when each has basic visuals and sound, and bots use it.** Every line names its sound, and the moments' effect logs show each one firing. "Bots use it" is shown by a bot-behaviour report over 20 seeded headless matches: it counts each behaviour named here, and every count is above zero. The scripted moments show each one in frames. The report is evidence that bots use a mechanic, not of how well.
- **Sailing:**
  - The sails fill with the wind. Ships leave a wake. The hull has a sound that follows its speed. Running aground has a scrape.
  - Bots sail with the wind and route round land.
- **The gust:** a burst on the water and a whoosh. Bots gust to close in, to run and to reach the circle.
- **Wind:** it shows on the water and the sails, and it has a sound. Weather systems bend it.
- **Currents:**
  - The Great Current and every smaller current show on the water as streaks or foam moving with the flow, and on the map.
  - Riding one has a sound.
  - Bots ride currents that go their way.
- **Tides:**
  - The sea visibly rises and falls.
  - The HUD shows the tide and which way it's going.
  - A passage closing or opening has a sound.
  - Bots don't steer into a passage the tide has closed.
- **Day and night:** the light follows the hour. Every ship's lantern shows at night, and wakes glow.
- **Weather:**
  - Each of the 6 kinds shows in the world and has its own sound.
  - Each kind's effect shows:
    - **Fog:** ships inside drop off the map, and the sightline shortens.
    - **Rain:** the water roughens, and gusts show on the sails.
    - **Thunder:** it warns with a glow, and a strike hits with a bolt, a crack and its damage numbers.
    - **Calm:** the water goes glassy and the sails slacken.
    - **Snow:** ice shows on the rigging, and the HUD shows your turning slowed.
    - **Ash:** embers show on a ship that stays in it, with burn damage numbers.
  - The HUD names the weather you're in.
  - Bots get out of thunder and ash.
- **Night:**
  - Enemies beyond about 150 m show only as a lantern glow, with no name or health bar, both in the world and on the map.
  - Bots see by the same rules. They don't target or chase a ship they can't see: one beyond 150 m at night (apart from her lantern), one in fog, one with Hidden Wake, or one behind smoke.
- **Weapons:**
  - Each of the 6 classes has its own projectile, muzzle flash, fire sound and impact.
  - Reloading and running out of ammo show on the hotbar, and each has a sound.
  - Bots fire all six.
- **The hotbar:** select, swap and drop each animate and have a sound. Bots swap and drop.
- **Shield and hull:**
  - The aura fills, ripples where it's hit, and shatters when it breaks, with a sound for each.
  - A ship whose hull runs out sinks, with a visual and a sound. Her items float as crates in their rarity's colours, and the kill goes to the HUD.
  - Bots heal when they're hurt.
- **Consumables:**
  - Using one shows its progress and has a sound. Being interrupted shows and sounds different.
  - Bots use all four.
- **Loot:** crates float with their rarity's colour, and picking one up has a sound. Bots loot.
- **Territory:**
  - Water you hold shows your colour.
  - Repairing at home shows.
  - Claims, cuts and taking the lead each get a banner and a sound.
  - Bots claim water.
  - Bots go for landmarks and hold them. Over 20 headless matches, each of the 16 perks is held by a bot at least once, and territory-holder captains hold landmarks longer than the others.
- **Coins and gull deliveries:**
  - Coins count up on the HUD. The gull flies the delivery in, and the drop has a sound.
  - Bots call deliveries.
- **The Gale:**
  - You pick a region on the globe and dive into it, with a sound for the dive.
  - Bots spread their picks (see the match list).
- **The Storm:**
  - Its wall shows on the water and on the map. Being inside it tints the screen and has a sound.
  - Bots get out of it.
- **20 ships:** a full headless match runs to a winner with no errors. This is a crash test only.
- **Abilities:**
  - All 8 actives have a visual and a sound when they fire.
  - Each passive shows where it acts:
    - **Salvage:** a shield shimmer when you sink a ship.
    - **Quick Reload and Quick Hands:** the faster ring or bar.
    - **Light Hull and Wind Reader:** the speed readout.
    - **Storm Walker:** smaller Storm damage numbers.
    - **Deep Hold:** the larger stack count on the hotbar.
    - **Steady Aim:** a tighter crosshair spread while turning.
  - Bots use all 8 actives.
- **The whale:**
  - It blows when it surfaces, with a sound, and its rising shows a warning.
  - Bots get clear of a rising whale.
- **Region events:** see the regions above.
- **Rotating rule changes:** the rule of the day shows in the lobby and when the match starts.
- **Determinism:** a match replayed from its seed and inputs ends with the same state hash in Node, Chromium and WebKit, with the region events in.

**The renderer, done when:**
- **No pale slabs stand over the water** in any region capture.
- **Polar nights are dark:** with the sun 18° or more under the horizon, no part of the sky glows red. The regions capture shows each pole's night at the strongest tilt a match can draw, not with `nightTilt`.
- **Lantern bloom doesn't wash out the view:** in the night and spectate captures, a lantern's bloom at 30 m covers less than 5% of the frame, and the ship's hull and sails can be made out under it.
- **Each weather kind has a placeholder look:** fog, rain, a thunder flash, calm glassy water, snow and ash.
- **The Fjords:** a ship behind the curtain of Thunder Falls can't be seen or shot from outside it, and drops off the map.

**Every screen, done when it is built only from the shared parts, and works on iPad and iPhone:**
- **Built only from the shared parts:** a test finds no colour, font size, corner radius or shadow in `src/ui/screens/**` that doesn't come from the tokens.
- **On every supported size:**
  - No text is clipped.
  - Nothing sits under the safe areas.
  - Every button is at least 44 points.
  - No two touch targets overlap.
  - In a match, the controls used in a fight (fire, gust, ability, reload and the sails) have their centres in the bottom 60% of the screen, and within 40% of the screen's width from the left or the right edge. The hotbar, the gull and the drop sit along the bottom, where a thumb moves to tap them between fights.
  - `npm run capture -- layout` checks all of this on every screen and fails on a break. It runs at the smallest and the largest supported size of each device, each with its safe areas: an iPhone 15 Pro (852×393), an iPhone Pro Max (956×440), an 11-inch M1 iPad (1180×820) and a 13-inch iPad (1376×1032).
- **Title, lobby, abilities, rank and settings:** as in pass 1, at every size.
- **Locker:** the camera shows the whole sail.
- **Rivals:** as in pass 1, with the realistic spread of tags.
- **Career and chart:** as in pass 1.
- **The HUD:**
  - The shield and hull bars have icons.
  - The map shows the land.
  - The HUD shows the perks you hold.
  - It shows the weather you're in and the tide.
  - It shows the throttle on touch.
  - Region events get a banner, and a marker on the map.

  *Done for the icons, the land, the perks, the weather and the tide: the bars carry a shield and a hull. The minimap samples the planet's height round the ship and paints the land, its inked coast, the shallows and the deeps at the tide of the moment (`LandLayer` in src/ui/screens/chart.ts); it resamples a few rows a frame once the ship has sailed an eighth of the map's reach. A row under the region tag holds a chip for the weather you're in, a tide chip with its level and its way, and a gold chip for each perk held, named on hover. The layout capture's `hud-perks` shot shows them with rain and three perks, and a tip under the row.* Decisions (Settled overnight in the owner's absence; the owner may change it.):
  - The perk chips show only the perk's icon, in gold, so a long hold fits; the landmark tip and the hover name them.
  - The weather chip shows once you are 0.4 deep in a system, as the tips do.
  - The tide chip shows the sea's level from low to high water as a small gauge, and an arrow for rising or falling.
  - The minimap samples 144 by 144 points over 1.25 times its reach.
  - A first-time tip on the HUD sits under the row however many lines it wraps to.
- **Gale drop:** as in pass 1. The globe shows the weather systems as clouds, and a pick near the Gale glides there.
- **Death and spectating:** as in pass 1, with the lantern bloom held back.
- **Results:** as in pass 1.

**The independent review of the screens** (at `3fee5d7`) fails "no text is clipped": on the Gale globe, the rim cuts "…ngrove Labyrinth" and "The Coral At…" at all four sizes, and the layout check misses it. "The Glass Sea" and "The Jade Shoals" also run into each other. Everything else in the layout check holds on all 64 screens. Lists cut at their scrolling edge (Rank, Settings, Abilities, the locker) are fine as long as they scroll.

*Revision 1:* the globe's labels are measured and kept inside the rim, nudged up or down off one another, and a sea with no room left is not named (the sea you pick always is). In the layout capture, no label touches the rim or another at any size.

**The shared parts, done when:** any part added in this pass (such as the event banner or the perk chip) comes from the same tokens and is in the gallery at every size.

**The career, done when:**
- **The first match is gentle:** every captain in it is gentle.
- **Short tips** appear the first time each of these happens:
  - the Gale (pick a region and dive);
  - your first weapon, and your first shot;
  - the gust, and your ability;
  - the shield breaks;
  - you pick up loot;
  - you use a consumable;
  - you earn coins and can call a gull;
  - your water starts to repair you;
  - you hold a landmark;
  - the Storm closes in;
  - the tide closes a passage;
  - you sail into each kind of weather;
  - night falls;
  - a region event starts;
  - the whale rises.

  Each appears only once, and is saved.

  *Done: src/app/tips.ts offers each of these, and the card (`tipCard`, a shared part) shows it under the vitals on the HUD and above Dive on the Gale. tests/app/tips.test.ts checks the save, the Gale's tip, and the first tips at sea; the layout capture has `hud-tip` and `gale-tip` at all four sizes.* Decisions (Settled overnight in the owner's absence; the owner may change it.):
  - The tips seen are saved under their own key in the browser's storage (`portolan.tips`), not in the career, so clearing them never touches a career.
  - One tip shows at a time, for 7 s, with a short pause between. The first ones at sea wait 3 s after landing.
  - "Your first weapon" is the starter weapon, named on the card. "The tide closes a passage" fires while the tide is falling and water within 40 m that is open now will be shut 20 s on. Each weather kind fires once its depth where you are passes 0.4; the whale, once it comes up within 260 m.
  - The capture tools start with tips off, so frames show only what they arrange; the hook turns them on (`h.tips(true)`).

  **The independent review** (at `3fee5d7`) passed the card itself: readable, unclipped, clear of the safe areas and the fight controls, on the HUD and the Gale at all four sizes. The item still fails on its evidence: only six of the tips are ever shown, and the save is tested only as parsed, never written and read back.

  *Revision 1:* tests/app/tips.test.ts now writes the save, reads it back in a new session (the tip stays hidden), and clears it (the tip shows again). It also brings on every one of the 22 tips through its own trigger at sea (a shot, the shield breaking, a pickup, a consumable, coins for a gull, mending in your own water, a landmark held, the Storm, a falling tide on open water, each weather kind, night, a region event, the whale) and checks that the 18 with a trigger stay hidden when it is not brought on.
- **Skill shows:** over 20 headless matches, captains drawn at a higher skill finish higher on average than captains drawn lower.

**Sound, done when:**
- Every mechanic and every region event has a sound (see the mechanics list).
- There is still no music.

**Integration, done when:**
- The loop runs end to end, on the web and on a real iPad.
- The capture tools also show the region events: `npm run capture -- events` frames each region's event, with a log of every sound and screen effect that fired.
- **`npm run capture -- moments` has a scripted moment for every mechanic line in this list,** each with its frame strip and effect log:
  - each of the 6 weapon classes firing and hitting;
  - select, swap and drop;
  - a consumable used, and one interrupted;
  - a loot pick-up;
  - a claim, a cut, and taking the lead;
  - a perk gained and lost, and each of the 16 perks working;
  - the tide closing a passage;
  - each of the 6 weather kinds, and a lightning strike;
  - an enemy crossing the 150 m night line;
  - each of the 16 abilities;
  - the whale surfacing and blowing;
  - the rule of the day at the start of a match;
  - a ship running aground.
- **The beacons' heights match their looks:** each beacon's height in the simulation is the height of its look's light. The landmark-in-view test still finds a landmark or beacon above the horizon from at least 95% of sea points by night, at those heights.
- **The border views work on all 42 borders:** each one searches the whole border for open water, or steps back from the land, and no frame faces land closer than 50 m.
- **The night captures can fail:**
  - They place ships at 50, 150 and 240 m on fixed bearings, whether or not their lights are in sight.
  - Every region's night frame has ships in it.
  - A test finds that every ship within 240 m, with any part of her above the horizon, shows a lantern or masthead light.
- **The lap test's path goes round the islands,** and no frame shows the ship on land.
- **The blend tests cover all 42 borders,** current lanes included, with a mix threshold of at least 5%.
- **Performance is measured on a real iPad and a real iPhone 15 Pro or newer,** in an autoplayed full match, against the rule of 30 fps that never drops. If it misses, it gets the one focused fix pass now. The numbers before and after go in the backlog.
- **The owner has played pass 1 and pass 2 on an iPad,** and their notes are in the backlog.

**Carried from the backlog, at the Good rung.** These are about how things look and sound, so a miss on one doesn't hold an item back from Playable:
- **Ships reflect their surroundings:** they have an environment map, so varnish and metal aren't flat.
- **The shield aura takes the planet's light:** it gets the sun and fog uniforms, and it darkens at night.
- **The far sea keeps its colour** up to the horizon, instead of turning sky-white.
- **The chart's region borders are smooth,** not blocky.
- **Victory:** the ceremony's first second has one flash, not two.
- **The surf bed hears only real shores:** it is silent where the nearest land within 35 m stands over water deeper than 3 m, and plays where a beach or reef flat is that close.
- **The title and the lobby hear the sea, the wind and the weather** at the spot they show.

## Backlog

### The owner's decisions after pass 1

The owner asked the agent to go with its recommendations on the open questions:
- **The Needle:** it stays 150 m, the tallest landmark in the north. A Needle seen from every northern ring region would have to stand about 390 m, most of the planet's radius, so the rule now asks for every region that borders the Spires (the Ice Crown, Mistwood, the Narrows, the Spice Isles and the Coral Atolls).
- **`legacy/` is deleted.** Nothing built against it. Its files are still in git at `9db96ab` (`git show 9db96ab:legacy/<path>`), and the old game itself at `2025e68`.
- **`credits/` is deleted.** Every line was already in CREDITS.md.
- **The Weeping Isle's perk is now Fast Refill** (shields and repairs about 30% faster). The passive ability keeps the name Quick Hands. The two still stack.

### From pass 1 (blocked out)

What pass 1 left, found while building it. Each needs a fix in a later pass.

The root page (`index.html`) and the iOS build now run the new app. The rewrite's flat game still runs at `dev/flat.html`, and its smoke test drives it there.

**The independent review** (at `bdfefa7`): **31 of the 36 items pass**, up from 16 at the first review. The ones that came through since are 13 regions, Death and spectating, and Victory. These five still fail:
- **Mistwood:** no giant cedar trunks over a fog line (the flora and mist libraries, below).
- **The Spires:** the Needle. Settled since by the owner's decision above, so it passes the new rule.
- **The Mangrove Labyrinth:** no low canopy over the channels (the flora library, below).
- **The renderer:** pale slabs still stand over the water. Fixed since: they were land past the horizon seen through the sea (the review's revisions, above). Not yet re-judged.
- **Integration:** no real iPad has run it yet (Performance, below).

Its no-humans check passed the Eye, the Kelp Cathedral and the Root Gate. It failed the Hollow Cedar's stump, whose four even pinnacles read as a steeple. The stump is now a ragged, slanting break with uneven splinters; that change came after the review, so it is not yet re-judged. It called three shapes borderline: the Eye's blue light on its tip at night (a little like a lighthouse), the Hollow Cedar's log seen end-on (a pipe; its bark and ends are now rough), and the Coral Atolls' flat-topped columns.

The last blind test named 33 of the 48 frames. The Glass Sea got none of its three, taken for the Ice Crown or the Jade Shoals. The Ice Crown, the Coral Atolls and the Weeping Isle got one each, and the Ice Crown and the Coral Atolls were both taken for the Spires. The blind test is a Good-rung check, so this is where to start at that rung.

**The renderer:**
- The ships have no environment map, so their varnish and metal look flat.
- The shield aura's material doesn't get the planet's uniforms (sun, fog), so it doesn't darken at night.
- The far sea turns sky-white near the horizon.
- ~~Pale slabs still stand over the water in some frames, such as the bottom right of the Maelstrom's dusk frame.~~ They were land past the horizon seen through the sea, and are gone (the review's revisions, above).
- A cliff face turned from the sun at close range reads as a flat, near-black slab. The sky's light alone leaves the rock too dark, the grade's ACES toe crushes it, and a cloudburst doesn't soften the light as an overcast sky would.
- A polar night glows red over the horizon unless the sun is far under it. On a planet this small the sunset is only a few hundred metres off, and the sky still catches it with the sun 45° under. A match draws its tilt from ±26°, so the poles' nights always glow. The regions capture tilts the planet so the sun stands 70° under at every midnight, as at the equator (`nightTilt` in `src/app/scenes.ts`). Find what catches the sunset and let it go dark.
- The lanterns' bloom is too hot at night. It's worst in the spectate view, which it washes out.
- "Nights are readable" passes in the captures, but only just. Past about 180 m a ship's stern lantern drops under the curve, and only her masthead light shows; it reaches about 238 m. The captures place a ship only where her masthead is in sight, so they can't show a failure. The Fire Archipelago's night and beacon frames find nowhere to put a ship at all.
- The chart's region mask is coarse, so its borders look blocky.

**The regions' looks:**
- The flora and mist libraries aren't on the stage yet; regions take them up at the Good rung. Until then the Mangrove Labyrinth has no canopy but the Root Gate's own tree, and Mistwood has no cedar trunks rising over a fog line, so neither skyline matches its portrait.
- The Weeping Isle's Moss Spring barely shows from the sea. It sits on the crown's plateau, and the rim hides all but the glow of its cloud cap. Both of this pass's revisions are used.
- The Fire Archipelago's steam shows as a red smear behind the caldera rim, not a column lit from below. Both of this pass's revisions are used.
- The Spice Isles' Ember Swarm reads as an orange blur, and from the sea a hill hides most of it.
- The Moonbow Arch's beacon is an overexposed white blob under the arch, with no spray column and no moonbow.
- Blossom Run's beacon shows as two pink smudges. There's no firefly spiral, and the blossom isn't lit.
- The Coral Atolls' pipes and Mistwood's rings only just read.
- The Maelstrom's foam round the vortex has a small brownish stain on one side, seen in the event's frames.
- The gun tokens on their deck mounts were checked by their sizes only, not seen up close in a capture. The broadside's carriage was seen.
- The simulation's beacon heights don't match the looks. The Fjords' says 140 m, but its look glows about 12 m up. The captures frame each beacon from its look's height instead (`beaconView` in `src/app/hook.ts`). Set the specs' heights from the looks. The landmark-in-view test uses the specs' heights and passes 98.5% of spots by night. At the looks' heights it's 80.0% for the core light alone, 92.7% at 0.6 of the height, and 98.7% for the full glow.

**The interface:**
- The minimap shows the Storm, the next circle and the ships, but no land. Port the rewrite's.
- The HUD's shield and hull bars have no icons.
- In the locker, the camera crops the top of the sail.
- The win's lens flash lands over the victory ceremony's own flash, so the ceremony's first second is washed out twice.

**The sound:**
- The surf bed listens for land on eight bearings 35 m out, so a cliff over deep water sounds like a beach.
- The title and the lobby hear a fixed mix for their spot: no surf, and a fair breeze.

**The tools:**
- The lap rings follow a line of latitude straight through land, so many frames show the ship on a hillside or inside a cliff. Route the lap round the islands, or leave out the frames over land.
- The border views (`npm run capture -- borders`) look for open water on each border with 150 m of clear sea towards the landmark they face. Few borders have it, because land stands near most of them. Ten have no open water within 240 m of the middle at all: the Ice Crown with the Fjords, Mistwood, the Narrows and Blossom Run; the Fjords with Mistwood; the Jade Shoals with the Glass Sea, the Coral Atolls and the Maelstrom; and the Mangrove Labyrinth with the Weeping Isle and the Maelstrom. Some of those frames face a cliff a few metres off. Search the whole border, or step back from the land.
- The blend tests cover only 24 of the 42 borders, because their transects skip the current lanes. Their mix threshold of 2% is weak; the least mixed border tested is at 5.8%.

**Performance** (measured at the end of pass 1):
- **Chromium on the Mac** (M1 Pro, `npm run capture -- perf`): every region holds 60 fps (16.7 ms a frame, the worst 95th percentile 18.4 ms) with 0.43–0.87 million triangles and 165–339 draw calls. A match view is 0.99 million triangles and 396 calls.
- **The iOS simulator** (iPad Pro 13-inch (M5), iOS 27, on the same Mac): the title holds about 47 fps at a render scale of 0.92 (0.44 million triangles, 216 calls). An autoplayed match (`VITE_AUTOPLAY=1`, 6 minutes logged) **misses the 30 fps rule there**. It holds 31–36 fps for the first minute, at a render scale of 0.84–0.92. By the third minute the scale is down at its floor of 0.60. From then on the view fills as the fleet closes in (0.76–1.52 million triangles, 276–527 calls), and the frame rate slides to 22–33 fps. 31 of the 72 five-second windows are under 30 fps. In most windows the worst frame is 40–80 ms. Nine hold a spike of 130–250 ms, four of them in the first minute, which looks like shaders compiling and terrain loading, but it has not been profiled. The simulation's tick stays under 0.35 ms, so the cost is in drawing. The simulator draws through the Mac's GPU, so these numbers don't say what an iPad does. They do say where to look first: triangles and draw calls in a busy late-match view. The boot is slow there: the title was still loading 25 seconds after launch.
- **No real iPad or iPhone has run it yet.** The iOS build logs a `perf` line every 5 seconds to the app's console, and `VITE_AUTOPLAY=1 npm run ios` builds one that sails a match by itself (on the web, `?autoplay`).
