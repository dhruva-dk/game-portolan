Create from scratch a fully interactive 3D browser game set on a tiny ocean planet, a world so small that its curve is always visible on the horizon. It takes place in the Age of Discovery, around 1500 to 1650, and the world should feel like an explorer's chart come to life. The player sails a ship across the planet and competes against 20 computer-controlled ships to claim territory. Sailing out from your own territory and back again closes a loop, and the sea inside floods with your colour. Crossing a ship's open trail sinks that ship. The visual style should be cinematic and richly stylized rather than photorealistic, while still being exceptionally rich, detailed, polished, and visually sophisticated.

Build the planet, ocean, swell, surf, seabed, reefs, islands, terrain, cliffs, beaches, rocks, palms, forests, mangroves, ground cover, lighthouses, stilt huts, piers, ships, rigging, sails, territory, trails, sky, clouds, atmosphere, sun, moon, stars, lighting, materials, water, reflections, spray, foam, mist, smoke, embers, particles, weather, a full day-and-night cycle, sound, animation, camera work, composition, atmospheric depth, the chart HUD, the globe menu, and colour grading. The final result should feel like a premium, high-production AAA game, not a prototype, technical demo, or low-quality scene. Every frame, at every hour and in every weather, must survive an independent, unbelievably harsh critic who has played the best-looking games ever shipped and forgives nothing. There is no secondary lighting state and no lesser hour. Dawn, the storm, and the night must reach the same standard as the signature look.

Start from a completely blank project. Do not reuse or depend on any previous project or scene.

Mandatory requirements:

There are no humans and no animals anywhere in the game: no crews, figures, birds, fish, whales, insects, or creatures of any kind. Life in the world comes from wind, water, weather, light, sails, flags, smoke, and fire.

All 3D geometry is generated procedurally in code. That includes the planet, islands, terrain, rocks, vegetation, ships, buildings, ocean, and sky. Do not import any 3D models. You may source high-quality open-source textures and lighting environments yourself.

No text of any kind may appear anywhere in the game. That includes the loading screen, the HUD, and the globe menu. No titles, names, numbers, logos, descriptions, credits, labels, or control instructions in any language. Every indicator must be purely graphic.

The game runs locally from a single command and builds to a static site that can be hosted for free with no server. Keep the project to a small number of substantial files. Do not split it into many small files without a real reason. Bundle every dependency and asset into the build. The game must make no runtime requests to external CDNs.

The whole game is seeded. The same seed always produces the same planet, the same islands, the same ships, and, given the same player inputs, the same match.

The planet must feel like one continuous, believable world. It is a small sphere of ocean, scattered with archipelagos. The seafloor rises from dark open deep water through blue shelves to turquoise lagoons and pale sandbars, and you can see coral heads, rock, and swaying kelp through the shallows. Climate changes with latitude:
- The equator has coral atolls with ring lagoons and white beaches.
- The temperate bands have green, forested islands with cliffs and waterfalls.
- The polar caps have dark basalt sea stacks, drifting ice floes, and small bergs.

From sea level the horizon visibly curves away, and distant islands sink below it hull first. From high above, the whole planet reads at once, wrapped in a glowing atmospheric rim.

Build these landmarks across the planet:
- A volcanic island with a smoking caldera, black-sand beaches, and old lava flows running into the sea.
- A great atoll with a sheltered lagoon and a single channel through the reef.
- A sea arch and a cluster of tall stacks.
- A forested island with a waterfall plunging from a cliff straight into the sea.
- Several stone lighthouse towers on rocky headlands, crowned with beacon fires.
- An empty fishing village of stilt huts, with a timber pier, drying nets, smoking chimneys, and moored skiffs.
- Wooden cask buoys and marker poles that lean, bob, and ring in the swell.

For vegetation, place hero palms by hand. Give them curved, leaning trunks with ringed bark, and let some overhang the water. Add mangroves with arching roots standing in the tide, broadleaf jungle, wind-sculpted pines on the colder islands, and scrub on the dunes. Cover the ground with beach grass, ferns, flowering shrubs, vines, mossy boulders, driftwood, and tide pools. All foliage must move in one shared, gusting wind that also drives the clouds, the swell direction, the spray, the smoke, and the flags. Leaves and fronds must glow when backlit.

Ships:

There are 21 ships. The hero ship is the player's. Each one is a distinct, beautifully crafted Age of Discovery sailing ship in its own team colour. They come from one coherent family of designs, such as caravels with lateen sails, carracks with high castles, full-rigged galleons, pinnaces, and fluyts.

Every hull needs real thickness, tumblehome, planking seams, wales, gunports, a beakhead, a carved stern gallery with lantern-lit windows, and a rudder. Masts carry yards, tops, and shrouds with ratlines. The standing and running rigging must be properly lashed. Sails are canvas, painted or dyed with each ship's colour and emblem, and they fill, luff, and snap with the wind. Pennants and ensigns stream from every masthead. Each ship carries stern lanterns, and they light at dusk.

The ships have no crew. They sail themselves: the helm turns, the sails trim, and the yards swing on their own. Rigging must never pass through sails, spars, or hull.

Gameplay:

Each ship starts with a small home territory around its spawn point. While a ship is inside its own territory, it is safe. When it leaves, it lays an open trail across the sea. When it returns to its own territory, the loop closes. The enclosed region, together with any territory that region surrounds, becomes the ship's territory. That includes territory taken from other ships and any islands caught inside. On a sphere every loop splits the world in two, so the ship claims the smaller side.

Rules for sinking and respawning:
- A ship that crosses another ship's open trail sinks the trail's owner.
- A ship that crosses its own open trail sinks itself.
- A ship whose territory is reduced to nothing sinks.
- A sunk ship loses all its territory, which returns to neutral sea, and it respawns after a short delay at a fresh spot with a new home territory.

Islands are solid. Ships cannot pass through them, and ships bounce off each other physically. A ship's score is its share of the planet's surface.

Territory and trails are part of the world, not decals on top of it. Claimed sea is tinted in its owner's colour, but it still reads completely as water. Its waves, reflections, foam, and depth colour all continue through the tint.

Territory borders are crisp and follow the sphere without seams, stretching, or pinching. That holds everywhere, including at the poles. Each border has a faint luminous edge and a line of foam.

An open trail is a living ribbon laid on the water behind the ship. It glows, ripples with the swell, and is clearly dangerous.

When a loop closes, the colour floods inward from the loop as a visible wave front. When territory changes hands, the new colour overtakes the old one in a sweep.

A sinking is dramatic:
- The ship lists, ships water, and its masts topple.
- Sails tear loose as the hull goes down in spray and bubbles.
- Planks, barrels, and spars are left floating in a spreading slick.
- Its trail dissolves into foam.
- Its territory drains away to open sea.

A respawn is just as polished. The ship surges up out of a burst of spray with its sails filling.

The 20 bots must feel like distinct rivals, not copies. Give them clearly different strategies, each readable at a glance from how they sail:
- Cautious expanders that take small, safe bites.
- Greedy expanders that take huge risky loops.
- Hunters that stalk open trails.
- Defenders that patrol their borders.
- Opportunists that raid weakened neighbours.

Bots see danger and react to it, but they are not perfect. They hesitate, gamble, panic, and sometimes misjudge. Bots act only by sending the same steering inputs a player sends.

Interface:

The only interface during play is a round HUD in the top-right corner. It is styled as a piece of aged papyrus: visible reed fibres, a darkened, frayed rim, and ink-wash and watercolour territories that bleed slightly into the fibres. It looks like a fragment of an explorer's chart, framed by a fine engraved compass ring. It shows the surrounding sea, nearby territories in their owners' colours, the open trails, nearby ships as small inked ship marks, and the player's ship and heading. It rotates so the player's heading is always up.

Pressing M opens the globe menu, and pressing M again closes it. The menu is a large papyrus sheet that unrolls across the screen. It is decorated with compass roses, rhumb lines, and inked sea-chart ornament, but contains no lettering.

In its centre is a beautiful, fully lit 3D render of the whole planet as it stands right now. It shows every territory painted in its owner's colour, every island, and every ship's position as a tiny rendered ship, and it has the atmosphere rim and the live day-night terminator. The globe turns slowly, and the viewer can drag to spin it.

Beside the globe is the leaderboard: a ranked column of painted pennants in each ship's colour. Each pennant's length shows that ship's share of the planet, and the player's pennant is clearly distinguished.

Opening the menu pauses the match. Closing it resumes exactly where play stopped. The HUD and the menu must feel as finished and as premium as the world itself.

The water must be the centrepiece. It needs:
- Accurate reflections of everything above it.
- Refraction and depth-based colour absorption, with reef, sand, and rock visible in the shallows.
- A rolling swell that follows the wind and that ships visibly ride, pitching and rolling over each crest.
- Breaking surf on beaches and reefs, with foam that washes up the sand and drains back.
- White foam collars around rocks, stacks, buoys, and piers.
- A convincing wake behind every ship: a bow wave, V-shaped arms, a churned band astern, and spray that bursts over the bow in chop.
- Caustics dancing on the shallow seabed.

Fill the planet with life and particles:
- Smoke rises from the volcano and the village chimneys and bends in the wind.
- Embers and ash drift from the caldera.
- The waterfall throws up mist and rainbows.
- Dust motes glow only inside the sunbeams.
- Banks of low sea mist drift across the water.
- Spray blows off the wave crests in strong wind.
- Driftwood and kelp rafts ride the swell.
- Ice floes calve and drift near the poles.
- At night, bioluminescence lights up in every wake, surf line, and splash.

Run a continuous day-and-night cycle of several minutes that loops: dawn, morning, midday, an afternoon thunderstorm, golden hour, sunset, blue hour, moonlit night, pre-dawn. The planet is lit by one sun, so the sun travels a real arc across the player's sky. The day-night terminator is a true line on the planet, visible from high above and in the globe menu. The moon takes over as the key light at night, and shadows follow whichever one is lit. Sky colour, clouds with silver-gold linings, fog, ambient light, exposure, and the colour grade all change with the hour. At night, show stars, a faint Milky Way band, and a cratered moon that also lights a glittering path on the sea.

Every hour has its own fully realised look:
- **Dawn:** cool pastels and mist lying low on the lagoons.
- **Morning:** crisp, clear light and vivid turquoise shallows.
- **Midday:** a high, hard sun, deep blue water, and sharp caustics.
- **Golden hour:** the signature look. A low, warm sun, long shadows across the water, god rays through the palms, sails, and spray, backlit canvas and foliage, and a warm haze that softens the horizon.
- **Sunset:** a burning sky reflected across the whole ocean.
- **Blue hour:** deep indigo, with the first stern lanterns and beacon fires appearing.
- **Night:** moonlit silver water, lit by bioluminescence, lanterns, and beacon fires.
- **Pre-dawn:** a faint glow building on the curved horizon.

A weather system rolls across the planet, and a storm passes over the play area every cycle. Clouds thicken into a dark, towering overcast, and the swell rises into whitecaps. Rain sweeps through in visible curtains with splash crowns on the sea. Branching lightning lights the clouds and the whole ocean. Decks, sails, rocks, and foliage turn wet and glossy, then dry slowly through sunset. Heavier seas make ships roll harder and throw more spray.

After dusk:
- Stern lanterns, the beacon fires on the lighthouses, and the windows of the stilt village glow.
- Territory borders shimmer softly on the dark water.
- Open trails glow brighter, so danger stays readable at night.
- Every light source lights the water, mist, sails, and hulls around it and appears in the reflections.

Add a synthesized soundscape of swell, surf, wind in the rigging, rain, and thunder that rolls in after each flash. Add creaking timbers, cracking canvas, the rush of a closing loop, and the deep groan of a sinking. Include a keyboard toggle to mute it.

Controls and feel:

The ship is always under way. The player steers its heading with the mouse or with WASD or the arrow keys. Steering needs momentum, turning inertia, water drag, and a heel into turns. The ship lifts on swells, drops into troughs, and drives its bow through chop. Islands and other ships push it back physically. Movement must feel fast, responsive, and weighty, never sluggish and never artificially slow.

A third-person chase camera follows the ship. It sits low enough that the horizon visibly curves and high enough that nearby territory and trails read clearly. The viewer can drag to orbit and scroll to zoom, all the way from deck level up to an orbital view that shows the whole planet. A slow cinematic drift keeps it alive. The camera must never dip below the water surface, pass into an island, or lose sight of the player's ship. Holding a key fast-forwards the time of day without affecting the match.

The water, ships, sails, rigging, foliage, smoke, particles, territory, and camera must all be animated naturally and smoothly. Avoid artificial slow motion or sluggish movement.

Do not rely on primitive geometric shapes as the finished result. The islands, rocks, vegetation, ships, and buildings need carefully shaped geometry and clearly visible small-scale detail: bark rings, palm fronds, rock strata, planking, treenails, rope lashings, deadeyes, sail seams and reef points, carved stern ornament, and weathered paint. Use detailed, scanned, or high-quality textures for rock, sand, bark, wood, iron, canvas, and papyrus. Everything must rest on the ground or ride the water. Nothing may float, and no objects may intersect.

Lighting must reveal the geometry and materials clearly at every hour. Use soft shadows, ambient occlusion in crevices and under hulls, light shafts, bloom, and a filmic grade. Shadow sides must stay readable, never crushed to black, even at night and during the storm.

Maintain a strong balance between visual quality and real-time performance, including on high-density (Retina) displays. Keep a smooth 60 frames per second on a recent laptop with all 21 ships, the full cycle, the storm, and every effect running, without making an obvious sacrifice in quality.

Architecture:

All game rules live in one deterministic simulation with no rendering code: movement, trails, loop closing, claims, sinkings, respawns, and scores. It runs on a fixed timestep with a seeded random generator and never reads the wall clock or the frame rate. It can run headless, with no renderer at all. The renderer, HUD, and menu only read simulation state. The player and the bots act only by sending inputs to it. Wind and swell may affect the ships only through the simulation, so they stay deterministic.

Every line of code must earn its place. Write no dead code, duplication, or speculative features, and prefer deleting to adding. This never justifies lower quality. Carefully built procedural geometry that takes more code is preferred to a shortcut that looks worse.

Automatically use the most appropriate skills, tools, libraries, techniques, and available assets needed to achieve the best result, within the procedural-geometry rule above. Do not wait for me to specify which technologies to use. Log every third-party texture, lighting environment, and library with its source and licence.

Acceptance checks:

These define done. You may add tests, but you may not weaken, skip, or remove any of these.

1. **Territory geometry.** A scripted ship sails a loop around a known circle of latitude at angle θ from the pole. The claimed area must match the spherical cap area 2πR²(1 − cos θ) within a tolerance you state and justify.
2. **Determinism.** Run the same seed and the same recorded player inputs twice: once headless and once in the browser with full rendering at a different frame rate. Both runs must end with an identical hash of territory ownership.
3. **Distinct bots.** Run a tournament of 50 seeded headless matches and report each strategy's average claimed area and number of sinkings caused. Every strategy must show a clearly distinct profile, and the hunters must lead in sinkings.
4. **Performance.** Measure the frame rate in a desktop browser at Retina resolution through a full day-and-night cycle including the storm, with every ship and effect active. It must hold 60 frames per second.

Actually test the finished result in a desktop web browser. Capture screenshots of:
- The day-and-night cycle: dawn, morning, midday, the storm, golden hour, sunset, blue hour, night, and pre-dawn.
- Gameplay moments: the opening moments, an open trail, a loop closing and flooding with colour, a sinking, a respawn, a crowded fight between several ships, and the orbital view of the whole planet.
- The interface: a close view of the papyrus HUD, and the globe menu open both by day and by night.

Judge every screenshot as that unbelievably harsh critic would. Any capture the critic would not accept as AAA is a failure to fix, not a note to leave. Inspect the browser console for errors, and fix every visible or technical issue you find. That includes:
- Distorted geometry, seams, stretching, or pinching on the sphere or at the poles.
- Flickering or z-fighting at territory borders.
- Gaps in trails.
- Black screens or failed asset loading.
- Broken animation.
- Poor composition.
- Rendering artifacts, aliasing shimmer, or banding in the sky.
- Floating or intersecting objects, or rigging and sails clipping through anything.
- Camera problems.
- Shadows crushed to black.
- Any human or animal form appearing anywhere.
- Any frame that looks unfinished.

Repeat the capture-and-fix loop until every capture passes.

At the end, verify that the game starts from one command and builds to a working static site. Verify that it contains no text whatsoever, that all four acceptance checks pass, and that there are no remaining runtime or loading errors. Then finish the task with only a brief response.