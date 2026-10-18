Create from scratch a fully interactive 3D browser game called Portolan: a naval strategy campaign set on a small ocean planet, a world so small that its curve is always visible on the horizon. It takes place in the Age of Discovery, around 1500 to 1650, and the world should feel like an explorer's chart come to life.

The crews of every ship in the world are gone. The ships remain, and they are alive. They wake, sail, trim their own canvas, fear, grieve, and fight. The player is one of these ships: a weathered pinnace that wakes in a coral lagoon beside an empty village whose chimneys are still smoking. Over a campaign of six to eight hours it charts the planet, claims the sea, builds harbours and lighthouses, gathers a fleet of companion ships, contends with six rival powers, and grows, refit by refit, into the grandest ship on the planet. At the end it crosses the storm wall at the south pole during a total solar eclipse and lights the beacon the crews left behind. The game never explains in words where the crews went or why the ships woke. The world shows it.

The visual style should be cinematic and richly stylized rather than photorealistic, while still being exceptionally rich, detailed, polished, and visually sophisticated. The final result should feel like a premium, high-production AAA game, not a prototype, technical demo, or low-quality scene. Every frame, in every region, at every hour, and in every weather, must survive an independent, unbelievably harsh critic who has played the best-looking and best-designed games ever shipped and forgives nothing. There is no secondary lighting state, no lesser hour, no lesser region, and no lesser ship. Dawn, the storm, the new-moon night, the ash haze of the volcanic islands, and the polar twilight must reach the same standard as the signature golden-hour look. The same critic judges the play: every system must give the player real decisions, and no hour of the campaign may feel like filler.

Build the planet, ocean, swell, surf, tides, currents, seabed, reefs, islands, terrain, cliffs, beaches, rocks, ice, palms, forests, mangroves, ground cover, villages, harbours, lighthouses, forts, quarries, mines, timber camps, spice groves, stilt huts, piers, the polar beacon, all sixteen ship designs, rigging, sails, guns, damage, fire, wrecks, territory, survey lines, trade routes, sky, clouds, atmosphere, sun, moon, moon phases, the eclipse, stars, aurora, lighting, materials, water, reflections, spray, foam, mist, smoke, embers, ash, particles, weather, a full day-and-night cycle, sound, an adaptive score, animation, camera work, composition, atmospheric depth, the chart HUD, the living chart and globe, the campaign, the rival powers, the economy, the fleet, naval combat, saving, and colour grading.

Start from a completely blank project. Do not reuse or depend on any previous project or scene.

This document is long because the game is large. Every section is a requirement. Where a section gives a target number, build to that number and verify it in the acceptance checks. Where two requirements seem to pull against each other, the order of priority below decides.

## Priorities

When a trade-off must be made, protect these in this order. Never sacrifice one to gain something lower on the list.

1. **The bans.** No humans, no animals, and no text beyond the two allowed items. All 3D geometry is generated in code.
2. **Determinism.** The simulation is exact, repeatable, and independent of rendering.
3. **The ships.** They are the heart of the game: their geometry, their rigging, their sails, how they move, and how they show what they feel.
4. **The water.** It is the stage for everything.
5. **Frame rate.** A steady 60 frames per second at Retina resolution in the worst case.
6. **The play.** Every system offers real decisions, and the campaign is paced to its targets.
7. **Everything else** in this document, all of which is still required.

## Mandatory requirements

### No humans and no animals

There are no humans and no animals anywhere in the game: no crews, figures, faces, birds, fish, whales, insects, or creatures of any kind, alive, dead, carved, painted, or implied by silhouette. Life in the world comes from wind, water, weather, light, sails, flags, smoke, fire, and the ships themselves.

This reaches into the ornament:
- **Figureheads and carving:** no lions, dragons, mermaids, cherubs, putti, saints, busts, or masks. Use scrollwork, acanthus, knots, waves, sunbursts, crescents, stars, compass roses, lanterns, crowns, keys, columns, and geometric strapwork.
- **Heraldry:** no animal or human charges on any flag, sail, shield, or banner.
- **The ships:** they never get faces or eyes. They show that they are beings only through how they move, trim, and behave.
- **Traces:** abandoned boats, warm hearths, lit windows, and smoking chimneys may show that people lived here. Footprints, clothing, and bones may not.

### Procedural geometry

All 3D geometry is generated procedurally in code. That includes the planet, islands, terrain, rocks, ice, vegetation, ships, rigging, sails, guns, buildings, structures, debris, ocean, and sky. Do not import any 3D models. You may source high-quality open-source textures, lighting environments, and instrument samples yourself.

### Text: the complete allowed list

The game contains almost no text. Exactly two kinds may appear:

1. **The title wordmark.** *Portolan* is hand-lettered in period calligraphy on the opening papyrus. It inks itself in again as the closing image after the ending.
2. **Region names.** Each of the seven regions has a Latin name, given in the region descriptions below. It is inked onto the chart in calligraphy, following the curve of the globe, the moment the player first discovers that region.

Nothing else may appear anywhere: no numbers or numerals, labels, other names, logos, descriptions, credits, tooltips, tutorial text, key glyphs, or control instructions, in any language. That holds for the loading screen, the HUD, the chart, the globe, and every other screen. Every other indicator must be purely graphic. Both allowed kinds of text are drawn as ink on papyrus, in the same hand, with the same ink-bleed into the fibres as the chart's coastlines. They must look like part of the chart, never like an interface font laid on top of it.

### Build and delivery

- **One command.** The game runs locally from a single command.
- **A static site.** It builds to a static site that can be hosted for free with no server.
- **Fully bundled.** Bundle every dependency and asset into the build. The game must make no runtime requests to external CDNs or any other host.
- **Code layout.** Organize the code into modules by domain: the simulation, the world data, the ships, the ocean, the sky, the interface, the audio, and so on. A module may be large. Do not create trivial files or split a domain without a real reason.

### A handcrafted world

The planet is authored, not generated from a seed. Every region, island, landmark, harbour site, reef channel, and rival capital is placed by design, and is the same in every new campaign. Procedural techniques may build the geometry of that world, such as terrain detail, rock strata, foliage scatter, and planking, but the layout is fixed and deliberate.

### Determinism and saving

- **Determinism.** The whole campaign is deterministic. Given the same player inputs, a new campaign always unfolds identically.
- **Autosave.** The campaign autosaves to browser storage whenever the player's flagship moors in one of its own harbours, and every three minutes of play.
- **One voyage.** There is a single voyage slot. Starting a new voyage is a papyrus pictogram that must be confirmed with a deliberate second gesture.
- **Exact resume.** Loading a save resumes exactly where play stopped, even in the middle of a battle. From that tick, the campaign continues identically to a run that was never saved.

## The planet

### Scale and curvature

The planet is a small sphere of ocean, scattered with archipelagos. It must feel like one continuous, believable world.

- **Size.** Choose its radius so that a race-built galleon on a broad reach in a fair wind sails once round the equator in about eight minutes.
- **The curve.** From sea level the horizon visibly curves away, and distant islands and ships sink below it hull first, with the masts the last thing to drop from view.
- **From above.** From high above, the whole planet reads at once, wrapped in a glowing atmospheric rim. The day-night terminator is a true line across its surface. The climate bands read as bands of colour: white atoll sand and turquoise at the equator, deep green in the temperate bands, black and ember red in the volcanic south, grey-white storm cloud over the Roaring Belt, and blue-white ice at both caps.

### Sea floor and depth

The seafloor rises from dark open deep water through blue shelves to turquoise lagoons and pale sandbars. Through the shallows you can see coral heads, rock, sand ripples, and swaying kelp. Every coastline has a shelf, so no island rises sheer out of black water unless the region description calls for it.

### Climate by latitude

| Band | Climate and islands |
|---|---|
| Equator | Coral atolls with ring lagoons and white beaches; high jungle islands |
| Northern temperate | Green, forested islands with cliffs, waterfalls, and fjords |
| Southern subtropics | The volcanic chain |
| Southern temperate | The permanent storm of the Roaring Belt |
| Both poles | Dark basalt sea stacks, drifting ice floes, calving bergs. The south pole lies inside a ring of storm and ice |

### Wind field

One planetary wind field is part of the simulation. It sets the base wind everywhere:
- **Trade winds** blow steadily from the east across the tropics.
- **The contrary belt.** Between about 15° and 25° north, a band of hard northerly wind blocks the way to the Green Reaches.
- **Westerlies** blow in both temperate bands. In the south they rise into the gale of the Roaring Belt.
- **Polar easterlies** blow around both caps.
- **Inside the storm wall** at the south pole, the sea lies in a dead calm.

Roaming storms travel on top of this field (see the weather section). Gusts and lulls ripple across it constantly. One shared, gusting wind drives everything that moves: the ships, the foliage, the clouds, the swell direction, the spray, the smoke, the flags, the rain, and the ash.

### Currents

The simulation carries ocean currents that push ships:
- an equatorial current setting west
- a warm current running south along the Fire Archipelago
- a strong eastward current under the Roaring Belt
- a slow drift of ice floes around the north cap

Currents show on the water as subtle streaks of foam and drift lines, drifting kelp rafts, and the set of moored buoys.

### Tides

The moon raises two tides a day.
- **Height.** The sea visibly rises and falls by about one and a half metres at the scale of the ships.
- **What moves with it.** Sandbars and reef flats are covered and exposed. Tide pools fill and drain. The surf line climbs and retreats on every beach. Ships at piers rise and fall against their moorings. Marker poles carry a dark weed line that shows the high-water mark.
- **Reef channels.** Certain channels, called out in the regions below, can be sailed by deep-hulled ships only near high tide. The shallow-draft galliot can always cross them.
- **Determinism.** The tide is computed by the simulation from the moon's position, so it is deterministic.

### Time

- **The day.** A full day-and-night cycle takes twelve minutes of play at normal speed. A full campaign spans roughly thirty-five days.
- **The moon.** It runs through its phases over eight days, from new to full and back.
- **Eclipses.** Every new moon, the moon passes across the sun, and the eclipse is total over the storm wall and the Quiet Pole. Totality lasts about two minutes, long enough for a ship already waiting at the wall to sail through it.
- **Determinism.** The positions of the sun and moon, the phase, the tide, and the eclipse are all computed by the simulation from the tick count.

## The seven regions

The planet has seven regions, each a fully authored place with its own geography, light, weather, palette, sound, ruling power, and role in the campaign. They are listed in the order the player reaches them. Every region has signature vistas: specific framings that the game must make look extraordinary, and that are required captures. A region is finished only when a player could tell where they are from any one frame, with no text, by its land, sea, sky, and architecture alone.

Each region's empty settlements belong to its ruling power's architecture. Their chimneys still smoke, their windows light at dusk, bells sway in the wind, and cranes and windlasses turn by themselves when that power's ships moor. They are always empty.

### 1. The Cradle (*Cunae*)

**Place.** On the equator, at the longitude where the campaign begins. This is the player's home waters.

**Play.**
- This is where the campaign begins, and where Act I teaches everything without words.
- **The lagoon.** The great atoll's lagoon is the player's starting territory. It is anchored by a dormant lighthouse that the player lights in the first minutes.
- **The first harbour.** The empty stilt village's pier becomes the player's first harbour.
- **Resources.** The Cradle yields a little spice and a little timber, enough to build the first lighthouse and the first companion.
- **The atoll channel.** The single channel through the reef is passable at any tide by the pinnace and caravel, but only near high tide by a carrack or larger.
- No rival power holds the Cradle. The Lantern Company's fluyts pass through on trade routes.

**Look.**
- **The great atoll.** A ring of coral islets of white sand around a sheltered lagoon of graded turquoise, with a single deep channel through the reef. Wooden cask buoys and marker poles mark the channel. They lean, bob, and ring in the swell.
- **The village.** An empty fishing village of stilt huts with thatched roofs, a timber pier, drying nets on frames, smoking chimneys, moored skiffs, and racks of drying spice.
- **The dormant lighthouse.** A stone tower on the atoll's one rocky headland, crowned with an unlit iron brazier.
- **Vegetation.**
  - Hero palms placed by hand, with curved, leaning trunks and ringed bark. Some overhang the water, and their fronds trail shadows on the lagoon floor.
  - Beach grass and scrub on the dunes, flowering shrubs, driftwood, and tide pools on the reef flats.
- **Longboats.** The first of the Cradle's three empty longboats lies beached by the village above the high-tide line, its bow pointing south.

**Light and weather.** Crisp, clear trade-wind weather, with towers of fair-weather cumulus. Morning is this region's signature hour: vivid turquoise shallows and sharp caustics on white sand.

**Signature vistas.**
- The pinnace waking at dawn in the lagoon, with the village behind it and mist on the water.
- The first lighthouse catching fire as the colour floods across the lagoon.
- The atoll from above at midday, a turquoise ring on deep blue.
- The channel at low tide, with surf breaking on both sides of the reef.

### 2. The Spice Isles (*Insulae Aromatum*)

**Place.** Along the equator, east of the Cradle.

**Play.**
- **Resources.** The richest spice on the planet, and good timber.
- **The Lantern Company.** Their capital and dense web of trade routes are here. They are the player's first contact and first trading partner.
- **Reef channels.** Many reef channels are tide-gated, so the shallow-draft galliot earns its place here. Mangrove channels wind into the islands' hearts, where spice groves and hidden anchorages lie.
- Open to the player from the start.

**Look.**
- **Islands.** High jungle islands of folded green ridges, steaming after rain. Waterfalls pour off the ridges into the mangroves.
- **Groves.** Terraced spice groves of ordered rows of shrubs, with drying sheds and stone terrace walls.
- **The capital.** The Company's harbour town of steep-gabled warehouses with hoisting beams, a long stone quay, and a lantern on every corner. The lanterns are lit at dusk, so the town glows across the water.
- **Vegetation.**
  - Broadleaf jungle in layers: emergent trees, canopy, vines, ferns, and giant-leaved understorey.
  - Mangroves with arching roots standing in the tide. Their roots are exposed at low tide and drowned at high.
  - Palms on the beaches.
- **Sea and seabed.** Turquoise shallows full of coral heads and kelp, dropping to a deep blue trench between islands.

**Light and weather.**
- **Hours.** Humid haze softens every distance. Afternoon squalls roll in, short and heavy. Golden hour is gold-green through the steam.
- **At night.** The Company's lanterns, the bioluminescence in the mangrove channels, and the glow from the drying sheds light the water.

**Signature vistas.**
- A mangrove channel at high tide, with roots arching overhead and the galliot slipping through.
- The Company capital at blue hour, every lantern lit and reflected in the harbour.
- A squall line marching across the islands with sunlight still on the near shore.

### 3. The Fire Archipelago (*Ignea*)

**Place.** In the southern subtropics, south-west of the Cradle.

**Play.**
- **Resources.** Iron, mined from the old lava fields, and stone.
- **The Ember Corsairs.** Their raiding harbour is here, hidden in a flooded caldera. Corsair xebecs hold the approaches.
- **The gate.** Open from the start, but an unarmed pinnace cannot survive here. The player needs an armed caravel.
- **The current.** The warm southbound current speeds ships heading south and slows them heading north.
- **Volcanic hazards.** Lava entering the sea makes zones of boiling water and steam that damage hulls, and their position shifts with the volcano's activity. Falling ash slowly dirties sails until rain washes them clean.

**Look.**
- **The great volcano.** A volcanic island with a smoking caldera, black-sand beaches, and old lava flows running into the sea. One live flow glows orange at night and hisses into the surf in a column of steam.
- **The corsair harbour.** In a flooded secondary caldera with a single narrow entrance. Its stone mole carries brazier towers and a chain boom that can be raised across the mouth.
- **Mines.** Mine heads with timber headframes, spoil heaps, and ore chutes down to the water.
- **Vegetation.** Sparse and tough: scrub, dry grass, wind-bent trees on the older islands. The new lava is bare black rock, glassy at its edges.
- **Sea and seabed.** Black sand under green water shades to dark blue. The rock is scattered with pumice rafts.

**Light and weather.** Ash haze tints every hour warm. The undersides of clouds glow red from the lava at night. Embers and ash drift downwind of the caldera. The sunsets are the most violent on the planet, burning through the ash.

**Signature vistas.**
- The volcano at night: the caldera glowing, the lava flow entering the sea, steam lit from below, and embers streaming downwind.
- The corsair harbour mouth with the chain boom raised and xebecs sliding out.
- A black-sand beach at golden hour, with surf foam bright against the black.

### 4. The Green Reaches (*Sylvae*)

**Place.** The northern temperate band. It is reached through the contrary-wind belt north of the Cradle.

**Play.**
- **The gate.** The contrary belt's hard northerly wind stops square-rigged ships. A pinnace cannot make way through it. A caravel, with its lateen rig, can beat up through it.
- **Resources.** The richest timber on the planet, and stone from the cliffs.
- **Two powers.** The Gilded Crown holds the west of the region and the Serene Republic the east. They are rivals, and their war in Act II is the player's chance to tip the balance.
- **Fjords.** Their cliffs cut off the wind, so ships must work in on the tide or by oar, which favours the Republic's galleass.

**Look.**
- **Islands.** Green, forested islands with grey cliffs layered in strata. Deep fjords. Waterfalls plunging from cliffs straight into the sea, throwing up mist and rainbows at the base.
- **The waterfall island.** A forested island with a waterfall that drops from its highest cliff straight into the sea. It is this region's landmark.
- **The sea arch.** A great sea arch on the western headlands, with a cluster of tall stacks.
- **The Crown's capital.** A fortified harbour of crenellated stone, with a citadel, bastioned forts at the harbour mouth, and a great stepped stone quay. Bastions are painted with the Crown's emblem on the gate towers.
- **The Republic's capital.** A lagoon city of empty palaces with arcaded fronts, standing on piles. Canals are lined with moored oared boats. A tall campanile serves as its lighthouse.
- **Vegetation.**
  - Mixed oak and beech forest down to the cliff edges.
  - Wind-sculpted pines on the exposed headlands.
  - Ferns, moss on every boulder, and vines on the ruins.
- **Sea and seabed.** Clear green water over kelp forests and rock.

**Light and weather.** Golden hour is this region's signature look, and the signature look of the game: a low, warm sun, long shadows across the water, god rays through the forest canopy, sails, and waterfall mist, backlit canvas and foliage, and a warm haze that softens the horizon. Mornings bring mist lying in the fjords.

**Signature vistas.**
- The waterfall island at golden hour, with the rainbow in the mist and a carrack in silhouette.
- The Republic's lagoon city at dusk, with the campanile's beacon lighting.
- The sea arch with a galleon passing through its frame.
- Dawn mist lying in a fjord, with mastheads above it.

### 5. The Roaring Belt (*Mare Tempestatum*)

**Place.** The southern temperate band, encircling the planet. Beyond it lie the storm wall and the Quiet Pole.

**Play.**
- **The gate.** The swell here is so high that a pinnace or caravel is thrown on its beam ends and driven back. A carrack or larger can hold its course.
- **The Jade Armada.** They hold a great fortified harbour on the only large island in the belt, behind a ring of stacks and forts.
- **Fighting in a gale.** The eastward current and the westerly gale make sailing east fast and west slow. That shapes every campaign and every battle here: a fleet that goes east cannot easily come back.
- **Resources.** Stone and iron on the scattered islands, in places that are hard to hold.

**Look.**
- **The sea.** Huge, long-period swell with breaking crests, spray streaming off every crest. Whitecaps to the horizon.
- **Islands.** Scattered islands of dark rock, sea stacks, and sea caves that boom in the swell.
- **The Armada's harbour.** Behind a breakwater of fitted stone blocks. Pagoda-roofed watchtowers serve as lighthouses. Long slipways hold great junks. A harbour wall carries rows of wooden fenders and ironbound gates.
- **Vegetation.** Tussock grass and lichen on the rocks. Low, flattened scrub, combed by the gale.
- **The storm wall.** Visible on the southern horizon as a dark vertical bank of cloud, rain, and spray, lit by lightning, standing over the ice ring around the pole.

**Light and weather.** The sky is permanently overcast, with rare breaks where shafts of sunlight sweep across the sea. The air is full of spray haze. Rain curtains are always in sight. At night the sky stays dark between lightning flashes, and the lanterns and the bioluminescence in the breaking crests carry the light.

**Signature vistas.**
- A galleon riding up the face of a great swell, with spray bursting over its bow.
- A shaft of sunlight sweeping across the grey sea onto a fleet in line astern.
- The storm wall at the horizon, lit by lightning from inside.
- The Jade Armada's harbour with its pagoda towers lit at blue hour.

### 6. The Northern Ice (*Glacies Borealis*)

**Place.** The north polar cap and its fringe, north of the Green Reaches.

**Play.**
- **The gate.** The pack ice crushes an ordinary hull. The player needs the ice-bow refit, on any hull from caravel upwards, or a polar bark in the fleet.
- **The Iron Turtle.** It holds the ice fringe from a fortress harbour cut into a basalt cliff, and pushes outwards behind forts.
- **Resources.** Iron and stone.
- **The ice is alive.** Floes drift with the polar current, closing and opening leads of open water, so a route that is open now may be shut ten minutes later. Bergs calve from the glacier fronts with a roar and a surge wave that rocks nearby ships.

**Look.**
- **Rock.** Dark basalt sea stacks and columnar cliffs.
- **Ice.** Drifting ice floes and small bergs. Glacier fronts of blue-white ice with crevasses and meltwater streams.
- **The Turtle's fortress.** Cut into a columnar basalt cliff, with iron-strapped gates, stone gun casemates, and a lighthouse inside a stone drum tower.
- **Vegetation.** Wind-sculpted pines on the fringe islands, thinning to moss, lichen, and bare rock.
- **Sea and seabed.** Dark green-black water, with the white undersides of floes visible below the surface.

**Light and weather.**
- **Day.** The sun stays low all day, so long shadows and blue twilight dominate. Snow squalls blow through in place of rain.
- **Night.** The aurora hangs over the cap in slow green and violet curtains, and its light reflects on the water and the ice.

**Signature vistas.**
- The aurora over a field of floes, with a single ship's stern lanterns below.
- A berg calving, with the surge wave rolling out.
- The Turtle's fortress in a snow squall, its casemate guns run out.
- A lead of open water opening ahead of the ice bow at low sun.

### 7. The Quiet Pole (*Polus Silens*)

**Place.** The south pole, inside the storm wall.

**Play.**
- **The ending.** No power holds this place, and it is where the campaign ends.
- **The storm wall.** It stands over the ice ring around the pole. It parts only during the totality of a solar eclipse, which comes every new moon.
- **Only the grand flagship can cross.** Lesser ships, including every companion, refuse at the edge. They luff, back their sails, and will not go on, so the flagship enters alone. A lesser flagship that tries is driven back and crippled by the wall.
- **Territory.** It cannot be claimed or surveyed.

**Look.**
- **The sea inside.** A glassy, windless sea ringed by ice cliffs. The only movement is a faint breath of wind toward the centre.
- **The beacon.** At the centre, a basalt island crowned by a great unlit beacon: an iron brazier on a tall stone tower, older and larger than any lighthouse on the planet.
- **The longboats.** Hundreds of empty longboats lie beached around its shore, all pointing toward the tower.

**Light and weather.** Polar twilight. During the eclipse, the sky darkens to deep blue at noon, the stars and the sun's corona appear, and the horizon glows orange all around.

**Signature vistas.**
- The storm wall parting at totality, with the corona overhead and the grand flagship at the edge.
- The glass-calm sea inside, with the beacon on the horizon.
- The ring of longboats on the ice shore.
- The beacon lit, its light rising from the pole, seen from orbit.

## The ships

The ships are the centre of the game. There are sixteen designs, all built from one shared procedural shipwright kit, and every one of them is a distinct, beautifully crafted ship of the age. They belong to one coherent family of period construction, so a carrack and a junk look like neighbours on the same sea, not like assets from different games. Ships are the player's character, companions, enemies, and the visible record of progress, so they receive more geometric and material detail than anything else in the world.

### The shipwright kit

Build one shared kit for ship construction. It defines hull lines with:
- parametric frames, sheer, rocker, deadrise, and tumblehome
- carvel planking laid as individual strakes
- wales, castles, galleries, gunports, and channels
- mast and spar sets
- a grammar for rigs: square, lateen, sprit, gaff, and battened lug
- standing and running rigging solved between real belaying points
- a library of carving and ornament
- sail cloth
- paint, gilding, and weathering

Every design below is a configuration of this kit plus its own bespoke parts. The kit makes variants cheap, and that must never make them generic: each design must be recognizable in silhouette alone, at any distance, from any angle.

### Standards for every ship

**Hull.**
- **Geometry.** Every hull has real thickness and tumblehome where the type has it. Planking seams run in true strakes that taper and converge at bow and stern, never as a flat texture. Treenails dot the planking. The wales stand proud of the hull.
- **Gunports** have lids hinged at the top. They swing open when the guns run out and close when they run in. Guns sit on visible carriages behind each port, of bronze or iron by type.
- **Bow.** A beakhead or cutwater as the type demands, with head gratings and carved head rails.
- **Stern.** A carved stern gallery with lantern-lit windows, and a rudder hung on pintles and gudgeons, with its tiller or whipstaff. There are no ship's wheels: they belong to a later age.
- **The waterline.** Weed and barnacle growth, and a band of paler wear where the hull meets the water.

**Masts, spars, and rigging.**
- **Masts** carry yards, tops with gratings, crosstrees, caps, and topmasts fidded in place.
- **Shrouds** set up with deadeyes and lanyards to chain plates on the channels. Ratlines are seized across the shrouds.
- **Stays and running rigging.** Stays lead forward to the stem or bowsprit. Halyards, braces, sheets, tacks, clewlines, buntlines, and bowlines each lead from a block to a belaying point on a pin rail or bitt.
- **Lashings.** Every lashing, seizing, and served eye is modelled.
- **No clipping.** Rigging must never pass through sails, spars, or hull, at any yard angle, any heel, and any state of damage.

**Sails and colours.**
- **Canvas.** Sails are canvas cloths sewn in panels, with visible seams, bolt ropes, reef points, and laced bonnets on the courses as the period used.
- **How they move.** They fill, luff, flog, and snap with the wind, and their shape follows the true wind angle and the yard's brace angle.
- **Dye and emblem.** Each sail is dyed or painted with its owner's colour and emblem.
- **Flags.** Pennants and ensigns stream from every masthead and the ensign staff.

**Lanterns.** Each ship carries stern lanterns, and they light at dusk.

**Materials and weathering.** Weathered paint, salt bloom, sun-bleached canvas, tarred standing rigging, and lighter manila running rigging.

**The ships sail themselves.** They have no crew. The tiller or whipstaff swings, yards brace round, sheets ease and haul, sails furl themselves onto the yards with gaskets when a ship moors, anchors and cables run out, and guns run out and in. All of this is animated, physically consistent, and in time with what the simulation says the ship is doing.

### Ships as beings

The ships are alive. They never get faces. They show what they feel through motion, and that motion is driven by simulation state that the player can learn to read at a glance.

| State | What it looks like |
|---|---|
| **Waking** | The sails shake loose from their gaskets one by one, the lanterns flicker on, the ensign climbs the staff, and the hull settles and lifts on the swell |
| **At rest** | At a mooring, it sways and turns to its anchor, and lifts and lowers its yards as if breathing. Now and then it trims a sheet |
| **Fear** | Morale is low. The ship luffs, hesitates on its turns, sags off the wind, and turns for home. Its pennant droops |
| **Courage** | Morale is high. It presses in on the wind with sails drawing hard and pennants streaming high |
| **Grief** | Passing a wreck of its own power, it half-masts its pennant and slows |
| **Loyalty** | Companions hold formation in a storm, close up when the flagship is damaged, and come about to cover it when it is crippled |
| **Striking colours** | The ensign comes down, the ship comes up into the wind, and the sails shiver and hang |
| **Changing allegiance** | The new owner's colour bleeds into the canvas from the head of each sail downward, like ink spreading in water, over about ten seconds |

**Veterancy.** Ships remember. Every battle leaves permanent scars on the hull and rig:
- patched canvas in mismatched panels
- shot-scarred planks with lighter replacement strakes
- a scorched band where fire was put out
- a mast that was fished, splinted with wooldings, after it cracked

Repairs restore function but not appearance, so a ship's history is written on it.

**Lanterns are the ships' eyes.** A ship with lanterns lit sees further at night and is seen from far away. A ship with lanterns doused is nearly invisible, but blind to rocks and shoals until they are close.

### The player's flagship line

The player's flagship grows through five tiers over the campaign. Each tier is a different hull, not a reskin. The first four can also be built as fleet companions. The grand flagship is unique to the player.

**At every tier:**
- **Colours.** The player's sails are dyed ultramarine with a white compass-star emblem. The flagship begins with sun-bleached, undyed canvas, and the ultramarine first bleeds into it when the first lighthouse is lit.
- **Moving up a tier** happens at a harbour. The old hull is hauled up the slipway. The new frames rise around it in a scaffold of poles, the new planking closes over them, the rig goes up, and the new ship launches down the slipway in a burst of spray with its sails shaking out and filling. The ship is the same being in a new body: its veteran scars carry over into the new hull as patched canvas and its oldest pennant.

**1. Pinnace** (about 16 m on deck). Where the game begins.
- **Hull.** A small, open-waisted hull with one deck, a low quarterdeck, and a square transom.
- **Rig.** Two masts, a square-rigged fore and main, with a small spritsail on the bowsprit.
- **Guns.** None at the start. Four light swivel guns once armed.
- **Handling.** Quick to turn, light in the swell, poor upwind.
- **How it looks at the start.** Salt-stained, sun-bleached planking, patched canvas, a frayed pennant, a single small stern lantern.

**2. Caravel** (about 22 m). The explorer's ship.
- **Hull.** A low, fine-lined hull with a raised stern, a sweeping sheer, and a rounded bow.
- **Rig.** Three lateen masts with long, raking yards in several pieces fished together. The lateen rig lets it point higher into the wind than any square-rigger, which is how it crosses the contrary belt.
- **Guns.** Eight small guns on carriages along the waist.
- **Handling.** Quick and weatherly. Light in heavy seas.

**3. Carrack** (about 34 m).
- **Hull.** Deep, round-sterned, and capacious. A high forecastle overhangs the stem and a stepped aftercastle rises over the stern.
- **Rig.** Four masts: a square-rigged fore and main with tops and topsails, and lateen mizzen and bonaventure masts.
- **Guns.** Twenty, on one main gun deck with ports through the wales.
- **Handling.** Steady in heavy seas, enough to cross the Roaring Belt. Slow to turn, and leewardly.

**4. Race-built galleon** (about 44 m).
- **Hull.** Long and fast, with low castles. The forecastle is set back from the stem behind a long beakhead with head gratings. A square tuck stern carries a two-tier gallery.
- **Rig.** Four masts, fore and main carrying three square sails each, and two lateen masts aft.
- **Guns.** Forty, on two gun decks.
- **Handling.** The best all-round ship of the age: fast on a reach, steady, and well armed.

**5. The grand flagship** (about 60 m on deck, 72 m with the beakhead). Unique to the player, and the reward at the end of the campaign.
- **Hull.**
  - **Decks.** Three gun decks, a forecastle, a quarterdeck, and a poop.
  - **Stern.** A three-tier stern gallery with domed quarter galleries.
  - **Paint.** Ultramarine hull bands between the wales, with gilded friezes of compass stars, rhumb lines, waves, sunbursts, and acanthus running the full length.
- **Rig.** Fore, main, and mizzen masts carry courses, topsails, topgallants, and royals, with a lateen sail on the bonaventure mast and a spritsail topmast on the bowsprit.
- **Lanterns.** Three great stern lanterns, each as tall as a pinnace's mast is thick around. Their light catches the gilding.
- **Guns.** One hundred, in three tiers of ports.
- **How it looks.** It must make every other ship on the planet look small. Every surface carries carving or gilt, and no square metre of it is plain.

### Refits

Between tiers, the flagship is improved by refits at a harbour. Every refit is visible geometry and material on the ship, and also a change in how the ship plays. A refit carries forward to every later tier.

| Refit | What changes on the ship | What it does |
|---|---|---|
| **Copper sheathing** | Copper plates in overlapping rows below the waterline, each with its nail pattern. Bright when new, it dulls to brown and then streaks with verdigris over hours of sailing | Faster, and no damage from scraping reefs |
| **Ice bow** | Doubled oak sheathing across the bow, iron straps, an iron-shod cutwater | Opens the Northern Ice; breaks thin ice |
| **Upper battery** | A new row of ports cut in the upper bulwark, with guns behind them | A heavier broadside |
| **Topgallants** | Topgallant masts and sails set above the topsails | More speed in moderate wind; a greater risk of losing the topmasts in a storm |
| **Chase guns** | Two long guns in new ports beside the bow and at the stern | Fire ahead and astern without turning |
| **Chain-shot lockers** | Racks of chain and bar shot on deck by the guns | Unlocks chain shot |
| **Shot furnace** | A brick furnace amidships with an iron chimney that glows and smokes when lit | Unlocks heated shot |
| **Gilded carving** | Gold leaf over the stern, quarter galleries, and beakhead | Steadies the morale of companions nearby |
| **Great stern lanterns** | Larger lanterns with iron frames and more glass | Greater sight at night |

On a tier change, the new hull carries every refit already earned, rebuilt to the new hull's scale.

### Fleet specialists

These five can be built at harbours as companions, alongside the first four flagship tiers.

**Fluyt** (about 28 m). The trader.
- **Hull.** Pear-shaped, with extreme tumblehome. A narrow deck over a broad hold, a rounded stern rising to a tall, narrow transom with a painted panel.
- **Rig.** Tall masts with a light rig.
- **Guns.** Six small guns.
- **Cargo is visible.** As the cargo grows, the deck load of barrels, bales, timber, stone blocks, iron bars, and spice sacks grows on deck and the hull sits deeper.
- **Handling.** Slow and economical. Fat and placid; it never wants to fight.

**Jacht** (about 18 m). The scout.
- **Hull.** Long, low, and fine-lined, with leeboards on its sides that swing down when it sails close to the wind. A carved transom.
- **Rig.** Sprit mainsail and jibs.
- **Handling.** The fastest hull on the planet. Its sight radius is the largest of any ship, so it extends the chart.

**Galliot** (about 20 m). The shallow-draft raider.
- **Hull.** Flat-bottomed and bluff-bowed, with leeboards.
- **Rig.** A tall mainmast and a short mizzen.
- **Guns.** A few swivel guns.
- **Handling.** It crosses reef flats, sandbars, and tide-gated channels at any tide, and follows prey into lagoons where deep ships cannot.

**Polar bark** (about 26 m). The icebreaker.
- **Hull.** Heavy-built with doubled planking and an iron-strapped bow.
- **Rig.** A short, stout three-masted rig.
- **Handling.** It opens leads in the pack ice for the rest of the fleet. Slow, but nothing in the north can stop it.

**Fireship.** Any hull of caravel size or smaller, converted.
- **The conversion.** Its ports are cut open. The hold is packed with brushwood and tar barrels. Grapnels hang from its yard arms.
- **When ordered in**, it flies a long pennant at the masthead, sails onto its target, grapples, and ignites. Flame erupts through every port and the fire spreads to whatever it holds.
- **The cost.** The fireship is lost. Ordering a being to its end is a grave choice: companions half-mast their pennants afterwards.

### Rival flagships

Each of the six rival powers sails one unique flagship, drawn from its maritime tradition. Rival powers also sail the shared classes, with their own rig details, carving, paint, and heraldry. Any rival flagship that strikes its colours can be captured. It joins the player's fleet, keeps its architecture, and takes the player's colours.

**Great carrack** (the Gilded Crown, about 50 m).
- **Hull.** A towering four-deck forecastle overhanging the stem, and a stepped aftercastle rising higher still. Painted pavisade shields line the rails, each carrying the Crown's radiant crown. The castles are crimson, with gold leaf on every moulding.
- **Rig.** Four masts.
- **Guns.** A huge broadside.
- **Handling.** Slow, and poor to windward.

**Galleass** (the Serene Republic, about 50 m).
- **Hull.** A long, low hull with a raised forecastle battery and a stern pavilion with purple awnings. An outrigger carries thirty oars a side.
- **The oars** sweep in perfect unison by themselves. It is the only ship that can move with power in a dead calm, and the fastest in the fjords.
- **Rig.** Three lateen masts.
- **Lanterns.** Three great carved stern lanterns.

**East Indiaman** (the Lantern Company, about 45 m).
- **Hull.** Broad and tall, teal and cream. A square stern with a painted panel and two tiers of windows.
- **Rig.** Three masts, square-rigged.
- **Lanterns.** More lanterns than any other ship: stern, quarter, and masthead lanterns. Lit at dusk, it glows like a town.
- **Handling.** Its cargo is huge and its guns moderate. It leads convoys.

**Xebec** (the Ember Corsairs, about 30 m).
- **Hull.** A narrow black hull with a sharply overhanging beak at the bow and a long stern platform overhanging the rudder.
- **Rig.** Three lateen masts carrying saffron sails.
- **Handling.** Very fast, shallow, and agile. It hunts.

**Great junk** (the Jade Armada, about 64 m).
- **Hull.** Broad and flat-floored, jade green with vermilion trim and cloud-scroll carving on a towering transom stern. A huge rudder can be raised and lowered in its trunk.
- **Rig.** Seven masts carrying battened lug sails of matting, fanned and ribbed. The battens let it reef instantly in a gale, which is why the Armada rules the Roaring Belt.
- **Bulkheads.** Its hold is divided by watertight bulkheads, so flooding damage is contained to one compartment.

**Turtle-backed warship** (the Iron Turtle, about 36 m).
- **Hull.** A low hull under a domed deck of overlapping hexagonal iron plates set with iron spikes.
- **The bow.** A plain iron smoke vent that pours sulphur smoke in battle. Not a creature's head.
- **Rig.** Two masts with battened sails that can be struck down flat in battle.
- **Guns and oars.** Gunports on every side, including the bow and stern. Oars through ports along both sides.
- **Handling.** Impervious to chain shot, very hard to set alight, and it breaks thin ice. Slow.

### The character of each design

Every design is also a temperament. Its idle motion, how it takes a turn, and how it shows fear and courage are tuned to its kind, so a player learns to read a ship's class and mood from its movement alone, at a distance.

| Design | Temperament |
|---|---|
| Pinnace | Eager and skittish. It bobs quickly on the swell, overcorrects its turns, and startles at gunfire |
| Caravel | Curious and quick. It points high into the wind and swings its long lateen yards across smartly on every tack |
| Carrack | Proud and ponderous. It leans heavily into turns and settles deep and slow into troughs |
| Race-built galleon | Poised and purposeful. Clean turns, little wasted motion, a steady roll |
| Grand flagship | Majestic. Slow, deliberate motion. In its presence, other ships of its fleet hold station more tightly |
| Fluyt | Placid and stubborn. It wallows under its deck load, and is the first to turn away from trouble |
| Jacht | Restless and darting. It ranges ahead of the fleet and circles back |
| Galliot | Sly. It noses into shallows, its leeboards rising and falling as it feels the bottom |
| Polar bark | Dogged. It shoulders into the ice with a shudder and never hesitates |
| Fireship | Solemn. It sails straight and quiet to its end, its long pennant streaming |
| Great carrack | Haughty. It wallows, but it never gives way to a smaller ship |
| Galleass | Precise. Its oars beat in exact time, and it turns on the spot under oars |
| East Indiaman | Watchful. It keeps its distance and shadows any fight |
| Xebec | Predatory. It slips along the lee of islands and darts out on a sudden reach |
| Great junk | Calm and immense. All its battened sails reef as one, and it moves in formation like a single body |
| Turtle-backed warship | Implacable. It is slow, unhurried by fire, and it closes to ram |

### Damage, fire, and sinking

**Damage.** It is local, visible, and changes how the ship handles.
- **Hull sections.** Bow, waist, and stern on each side take damage separately. Shot holes punch through planking with splintered edges. A holed section below the waterline floods: the ship settles and lists toward it.
- **Masts and yards** crack and can fall, dragging their sails and rigging over the side. That slows the ship and pulls its head round until the wreckage is cut away; it cuts itself free after a few seconds.
- **Sails** tear into holes that flog in the wind and draw less.
- **The rudder** can be shot away. The ship then steers poorly by trimming its sails.
- **Fire** starts from heated shot, fireships, and burning wreckage. It spreads along tarred rigging and dry canvas, and up through hatches. Smoke pours downwind. A burning ship that is not put out by rain, by flooding, or by its own effort in time burns to the waterline.

**Sinking is dramatic.**
- The ship lists, ships water, and its masts topple.
- Sails tear loose as the hull goes down in spray and bubbles.
- Planks, barrels, and spars are left floating in a spreading slick.
- Its open survey line, if it was a flagship, dissolves into foam.

**Wrecks remain.** In shallow water the wreck stays visible on the seabed, with its masts breaking the surface at low tide. In deep water, floating debris drifts for several minutes. Every wreck is marked on the chart with an inked broken-mast glyph, and can be salvaged once for timber and iron by sailing slowly over it.

**Floating cargo.** A sunk or plundered ship spills barrels, crates, and bales that ride the swell. Any ship sailing through them collects them.

## The rival powers

Six rival powers share the planet with the player. All six are invented: their heraldry, colours, and architecture are inspired by real maritime traditions of the age, but none copies any real nation's flag, arms, or name. Each power has a capital harbour, a home region, a flagship, a fleet of shared-class ships in its own style, a doctrine, and an arc across the campaign.

**What every power shares:**
- **One brain, one set of controls.** Every power runs on the same strategic layer, which decides where to expand, what to build, and whom to trade with or fight. Every ship runs the same ship-level layer, which steers, trims, and fires. A power acts only by sending each of its ships the same inputs a player's ship accepts: helm, sail setting, broadside, shot type, lanterns, and signal flags.
- **Readable at a glance.** The doctrines differ in their parameters and priorities, not in privileged rules, and each must be recognizable from how its ships sail.
- **Imperfect.** Powers see danger and react to it, but they are not perfect. They hesitate, gamble, panic, overreach, misjudge the wind, and sometimes break truces they meant to keep.
- **They fight each other too.** The world moves on without the player. A power can be crippled or destroyed by its neighbours.
- **Collapse.** When a power loses its capital and every other harbour, it collapses. Its surviving ships strike their colours and drift as masterless ships, which any power, the player included, can claim by coming alongside.
- **Attitude.** Each power holds an attitude toward every other power, made of fear, grievance, and trust. Events move it: surveys broken, routes raided, ships sunk, struck ships spared, truces kept or broken, and trade that profits both sides.

### The Gilded Crown

- **Inspired by:** Iberian powers.
- **Colours:** crimson and gold. **Emblem:** a radiant crown.
- **Home:** the western Green Reaches.
- **Architecture:** a fortified stone harbour with a citadel and bastions, gate towers, and a great stepped quay.
- **Flagship:** the great carrack.
- **Doctrine: greedy expander.** The Crown's flagship flies the largest survey loops on the planet, sweeping wide and often caught out. It builds more forts than lighthouses. Its fleets sail in big, slow squadrons.
- **How you recognize it:** long, looping crimson survey lines far from home, and heavy ships wallowing to leeward.
- **Its arc:** In Act II it overreaches into the Republic's waters and opens war. Late in Act II it turns on whichever power leads the planet, forming a coalition against it. If the player leads, that is the player.

### The Serene Republic

- **Inspired by:** Venice.
- **Colours:** purple and gold. **Emblem:** a gilded column under an arch.
- **Home:** the eastern Green Reaches.
- **Architecture:** a lagoon city of arcaded palaces on piles, with canals and a campanile lighthouse.
- **Flagship:** the galleass.
- **Doctrine: cautious expander and diplomat.** It takes small, tight survey loops, never far from its anchored waters. It offers truces and trade pacts readily, and it keeps them.
- **How you recognize it:** short, careful purple loops hugging its borders, and galleass oars working in the calms.
- **Its arc:** Attacked by the Crown in Act II, it seeks an ally. If the player answers, it becomes the player's most dependable partner. Later it allies with whoever is weaker than the Crown.

### The Lantern Company

- **Inspired by:** the Dutch East India Company.
- **Colours:** teal and cream. **Emblem:** a lantern within a ring.
- **Home:** the Spice Isles.
- **Architecture:** gabled warehouses with hoisting beams, a long quay, and lanterns everywhere.
- **Flagship:** the East Indiaman.
- **Doctrine: trader and opportunist.** It runs more trade routes than any power, offers trade pacts to everyone, and raids neighbours only when they are weakened by someone else.
- **How you recognize it:** fluyt convoys on fixed routes, and an East Indiaman shadowing any battle at a distance, waiting.
- **Its arc:** It is the player's first contact and is friendly. Its fluyts show the player in Act I what a trade route is. It turns hostile if the player competes for the Spice Isles' groves.

### The Ember Corsairs

- **Inspired by:** the Barbary corsairs.
- **Colours:** black and saffron. **Emblem:** a crescent over a flame.
- **Home:** the Fire Archipelago.
- **Architecture:** a flooded-caldera harbour with brazier towers and a chain boom.
- **Flagship:** the xebec.
- **Doctrine: hunter.** It stalks open survey lines and breaks them. It raids trade routes and takes ships that strike their colours. It seldom builds.
- **How you recognize it:** fast saffron lateens cutting across other powers' survey lines, and xebecs waiting in ambush in the lee of islands.
- **Its arc:** The first real threat. Corsairs raid the player's first trade route at the end of Act I. They grow with the plunder they take, so a corsair power left alone becomes a scourge by Act III. They accept a truce only from a power far stronger than themselves.

### The Jade Armada

- **Inspired by:** the Ming treasure fleets.
- **Colours:** jade and vermilion. **Emblem:** a jade disc ringed with cloud scrolls.
- **Home:** the Roaring Belt.
- **Architecture:** a breakwater of fitted stone, pagoda-roofed watchtower lighthouses, long slipways, and an ironbound harbour gate.
- **Flagship:** the great junk.
- **Doctrine: isolationist defender.** It rarely expands. It patrols its borders in force and anchors everything it holds. Its trade pacts are few but long. Anyone who breaks its surveys, raids its routes, or crosses into its anchored waters at war meets a counter-attack of overwhelming force that does not stop at the border.
- **How you recognize it:** squadrons of junks circling their own waters in perfect formation, and battened sails reefing in a single motion as a squall hits.
- **Its arc:** A wall in the Roaring Belt that the player must decide whether to go around, ally with, or break. Provoked, it is the most dangerous force on the planet.

### The Iron Turtle

- **Inspired by:** the Joseon navy.
- **Colours:** slate and white. **Emblem:** a hexagon of six smaller hexagons.
- **Home:** the Northern Ice.
- **Architecture:** a fortress cut into a basalt cliff, with stone casemates, iron-strapped gates, and a drum-tower lighthouse.
- **Flagship:** the turtle-backed warship.
- **Doctrine: fortifier.** It creeps outward behind forts. It builds a fort or lighthouse at the edge of its waters, anchors the new sea, and then pushes again. It besieges rather than raids.
- **How you recognize it:** a slow, steady stain of slate spreading from the north, and forts appearing on every headland at its border.
- **Its arc:** Left alone, it slowly takes the whole north and pushes into the Green Reaches by Act III.

### The player's power

- **Colours:** ultramarine and white. **Emblem:** a compass star.
- **Architecture.** The player's structures grow from the Cradle's own style: timber, thatch, and coral stone, raised on stilts at the waterline. As the player expands into other regions, they take on that region's stone and timber.

## Gameplay systems

### Sailing and controls

**Always under way.** The flagship can never stop dead at sea. In open water it never sits motionless; only mooring in a harbour brings it to rest. If it is put head to wind, it falls off by itself onto a tack.

**Controls.**

| Input | Action |
|---|---|
| Mouse | The flagship steers for the sea under the cursor. Keeping the cursor near the ship holds the course |
| A/D or ←/→ | Turn to port or starboard. A tap nudges the helm; holding swings it hard over |
| W/S or ↑/↓ | Set more or less sail, through four settings (below) |
| Click | When the guns are run out, fire the broadside on the side nearest the cursor. A click is a press and release that moves the cursor less than a few pixels |
| Q/E | Fire the port or starboard broadside |
| 1/2/3 | Choose round, chain, or heated shot, once each is unlocked |
| Hold Space | Open the ring of signal flags |
| L | Douse or light the lanterns |
| M | Open or close the chart |
| N | Mute or unmute |
| Hold T | Run time fast, only while moored in one of your own harbours |
| Drag | Orbit the camera |
| Wheel | Zoom from deck level to the whole planet |

**Sail settings.**

| Setting | Effect |
|---|---|
| **Reefed** | Slowest. The tightest turns and the lowest silhouette at night. Safe in any storm |
| **Plain sail** | Balanced |
| **Full sail** | Faster, with wider turns |
| **Crowded** | Every sail the ship carries. Fastest, with the widest turns. In strong wind it risks springing a topmast or splitting a sail |

**Points of sail.**
- **Every rig has its own curve of speed against wind angle.** Square rigs make the most of a broad reach and cannot point within about 67° of the wind. Lateen rigs point to about 55°. Battened lug rigs point to about 60° and lose the least speed when reefed.
- **Oars.** Oared ships keep a modest speed in any wind, including a dead calm.
- **Readable on screen.** The sails show the point of sail truthfully: full and drawing on a reach, flattened and hard on the wind, shivering at the edge of the no-go zone, and billowing forward on a run.

**Feel.**
- **Physics.** Steering needs momentum, turning inertia, water drag, and a heel into turns and under a press of sail. The ship lifts on swells, drops into troughs, and drives its bow through chop.
- **Collisions.** Islands and other ships push it back physically. A hard collision damages both bows a little. Only the turtle-backed warship's ram bow deals real damage by ramming.
- **Pace.** Movement must feel fast, responsive, and weighty, never sluggish and never artificially slow.
- **Determinism.** Wind, swell, current, and tide affect ships only through the simulation, so they stay deterministic.

### Territory and surveying

**Rules.**
- **Claiming.** Territory is claimed in two ways: by lighting a lighthouse, and by closing a survey loop.
- **Lighthouses.** When a lighthouse is lit, all open, unclaimed sea within its beam radius becomes the builder's.
- **Surveys.** Only flagships survey: the player's, and each rival power's.
  - **Laying the line.** When a flagship leaves its own territory, it lays an open survey line across the sea behind it.
  - **Closing the loop.** When it returns to any part of its own territory, the loop closes. The enclosed region becomes the flagship's power's territory, together with everything that region surrounds: open sea, islands, and any other power's territory that is not anchored. On a sphere every loop splits the world in two, so the claim takes the smaller side.
  - **Anchored territory is protected.** Another power's anchored territory inside the loop stays theirs and remains as a hole in the claim.
  - **Breaking a survey.** Any ship of another power that crosses an open survey line breaks it. The player's flagship crossing its own open line breaks it too. A broken line dissolves into foam outward from the break, the survey is lost, and the flagship must return to its own territory before it can begin a new one.
  - **Crippling.** A flagship that is crippled loses its open survey.
- **Anchoring.** Territory within a structure's anchoring radius is anchored. A harbour anchors a medium radius, a lighthouse its beam radius, and a fort a small radius around its guns. Anchored territory cannot be taken by a survey loop. To take it, capture or silence the structure first.
- **Fading.** Unanchored territory holds for ten minutes after it is claimed. Then it fades back to open sea over one minute, unless a structure anchoring it has been built in the meantime. Through the last two minutes before the fade, its colour visibly thins and its border foam weakens.
- **Score.** A power's score is its share of the planet's surface.
- **No territory at the start.** The player holds none. Lighting the Cradle's dormant lighthouse makes the first claim.

**How territory looks.**
- **It is part of the world, not a decal on top of it.** Claimed sea is tinted in its owner's colour, but it still reads completely as water. Its waves, reflections, foam, caustics, and depth colour all continue through the tint.
- **Borders** are crisp and follow the sphere without seams, stretching, or pinching. That holds everywhere, including at the poles and around every island. Each border has a faint luminous edge and a line of foam.
- **Diplomatic state shows on the border.** Where two powers' territories meet, the border's foam and edge show their state: a jagged, broken edge for war, a dashed edge for truce, and a braided double edge for a trade pact.
- **The open survey line** is a living ribbon laid on the water behind the flagship. It glows in its owner's colour, ripples with the swell, and is clearly vulnerable. In a storm it frays, and the rain beats through it.
- **Claims and changes of hands.**
  - **Closing a loop.** The colour floods inward from the loop as a visible wave front.
  - **Lighting a lighthouse.** The colour races outward from the beacon in a ring.
  - **Changing hands.** The new colour overtakes the old one in a sweep.
  - **Fading.** The colour drains away to open sea.

### Charting and sight

**The chart begins blank.** At waking, the player's chart is blank papyrus except for the Cradle's lagoon.

**Inking.**
- **Coastlines.** The first time a coastline, reef, or shoal comes within sight of any of the player's ships or structures, its outline inks itself onto the chart in quick pen strokes, followed by a watercolour wash.
- **Region names.** The first time the flagship enters a region, the region's name is inked across it in calligraphy.

**Sight.** Every ship has a sight radius, and so does every structure.
- **By type.** The jacht's is the largest. A lighthouse's beam carries sight far at night.
- **Shrinking.** Sight shrinks at night, more on a new moon than a full one. It shrinks further in storms, rain, snow squalls, ash haze, and sea mist.
- **Lanterns.** Lit lanterns restore some of the night sight, but make the ship visible to others from twice as far.

**What the HUD and chart show.**
- **Inside current sight:** everything, live.
- **Outside sight:**
  - Coastlines and wrecks stay inked forever.
  - Structures and territory borders are drawn in faded ink as they were last seen.
  - Ships are not drawn at all.

**The veil.** The 3D world never lies. At sea level the player sees whatever the curve allows. Seen from orbit, regions the chart has not inked lie under a persistent veil of high cloud and haze that thins as the chart fills, so the orbital view never spoils a region before the player reaches it.

### Economy

**Resources.** There are four. Each has one clear purpose. There is no currency.

| Resource | Where it comes from | What it pays for |
|---|---|---|
| **Timber** | Temperate and tropical islands | Ships, repairs, and the frames of structures |
| **Stone** | Cliffs and basalt | Lighthouses, forts, and harbours |
| **Iron** | Volcanic and polar islands | Guns, refits, and the larger hulls |
| **Spice** | Tropical islands | Wealth. While spice is in stock, it is spent to double the speed of construction at harbours. The grand refits require it: gilded carving, the galleon, and the grand flagship |

**Extraction.**
- **Where.** Each island is authored with one or two resources. An island inside the player's territory can take an extraction site for each.
- **What gets built.**
  - **Timber camp:** saw pits, a log slide to the water, charcoal kilns.
  - **Quarry:** stepped cuts in the rock, a derrick crane swinging blocks to a loading stage.
  - **Mine:** a headframe, an ore chute to the water, and a smelting furnace that glows at night.
  - **Spice grove:** terraces, drying sheds.
- **They work by themselves.** Saws turn, cranes swing, kilns smoke, and furnaces glow.

**Delivery.**
- **By skiff.** If a sea path that stays entirely inside the player's territory connects a site to one of the player's harbours, crewless skiffs ferry its goods there automatically. They are visible, small, and constant.
- **By fluyt.** If no such path exists, the goods move only when a fluyt runs a trade route between the site and a harbour.
- **Why it matters.** Contiguous territory is valuable.
- **Losses.** Skiffs and fluyts that are sunk spill their cargo into the sea.

**The stockpile.**
- **Shared.** All of the player's harbours share one stockpile.
- **Physical.** Each harbour shows it as real piles on the quay: stacked logs, stone blocks, iron bars, and spice sacks, growing and shrinking as they are used.
- **On the HUD and chart:** four short rows of ink pips, one per resource, each led by its pictogram: a log, a block, an ingot, a sack. Never a number.

**Other ways to get goods.**
- **Trade pacts.** Under a pact with another power, a fluyt route to that power's harbour exchanges the player's most abundant resource for the one the player is shortest of, at every delivery. Both sides profit, and trust rises.
- **Plunder and salvage.** Floating cargo and wrecks give goods to whoever collects them.

### Structures and building

**The four structures.**

| Structure | What it does |
|---|---|
| **Harbour** | The heart of a claim. A quay, cranes, warehouses, a slipway, and a shore battery. It builds ships, performs tier rebuilds and refits, repairs moored ships, holds the stockpile, anchors a medium radius, and defends itself with its battery |
| **Lighthouse** | A stone tower crowned with a beacon fire. Lit, it claims open sea within its beam and anchors its beam radius. It gives the widest sight, especially at night. It has no guns |
| **Fort** | A bastioned battery on a headland or island. It covers a channel with long-range guns that fire on any ship at war with its owner, and anchors a small radius |
| **Extraction site** | As described under the economy |

**Build sites.**
- Each kind of structure can be built only at authored sites: harbours in sheltered coves, lighthouses and forts on headlands and islets, extraction sites on resource islands.
- The site must lie inside or touching the player's territory.

**Building.**
- **The request.** The player chooses a build from the chart (see the interface). A ship of the player's must anchor at the site, and the stockpile must hold the cost.
- **Construction animates in the world.** Poles rise and lash into scaffolding, timber frames swing up, stones settle course on course, and then the scaffolding falls away.
- **Time.** About a minute and a half for a lighthouse or fort, and three minutes for a harbour, halved while spice is spent.
- **Interruption.** If the anchoring ship is driven off, construction pauses and the half-built scaffold waits.
- **Launching ships.** New ships, the player's and every rival power's, are built on a harbour's slipway in the same way, with frames rising and planking closing, and launch down it in a burst of spray with their sails shaking out and filling. A power replaces its losses only by building, so every new ship in the world arrives this way.

**Capture.**
- **Fort or harbour.** Silence its guns first. Every gun position can be dismounted, and its walls show breaches. Then hold its waters for thirty seconds, with only the capturing power's ships inside its anchoring radius.
- **Lighthouse.** Hold its waters for thirty seconds while no enemy fort's guns cover it.
- **What happens on capture.** The owner's banner comes down, the new owner's banner rises, the beacon gutters and relights, and the anchored territory sweeps to the new colour.
- **Extraction sites** change hands with the territory around their island.
- **Architecture stays.** Captured structures keep their original power's style under the new banner.

### Naval combat

**Guns.**
- **Running out.** Guns run out by themselves, ports swinging open, when a ship at war with their owner comes within gun range. They run in when no enemy is near.
- **Broadsides.** A broadside fires every gun on one side in a ripple over half a second, from bow to stern. Then that side reloads. Reload time depends on the class, and heated shot reloads more slowly.
- **Chase guns** fire ahead and astern on their own reload.

**Shot is simulated.**
- **Ballistics.** Every ball is a simulated projectile with a muzzle velocity, gravity, and a flight time.
- **Elevation comes from the roll.** A ship's roll at the moment of firing sets the elevation. Fired on the up-roll, shot flies high into the rigging. Fired on the down-roll, it strikes the hull.
- **Timing it.** The player can learn to time a broadside to the swell, and the HUD shows the roll so it can be timed.

| Shot | Effect |
|---|---|
| **Round** | The longest range. Strikes hulls and guns |
| **Chain** | Short range. Tears sails, cuts rigging, and brings down yards and masts |
| **Heated** | Starts fires on ships and structures |

**The wind gauge.**
- **The windward ship** chooses whether to close or to escape. It heels away from its enemy, which lifts its guns for range. Its smoke blows down onto its enemy and blinds it.
- **The leeward ship** heels toward its enemy. In strong wind, its lower lee ports must stay closed or flood, so it cannot fire its lowest deck.
- **This is the defining tactic.** Bot captains must contest the wind gauge, and the autopilot must use it.

**Smoke.** Gun smoke hangs and drifts downwind. While it lingers, it blocks sight and aim through it.

**Morale.**
- **Every ship has morale.**
  - **Falls with** damage, fire, the sinking of its own power's ships nearby, being outnumbered, and its flagship being crippled nearby.
  - **Rises with** victories, its flagship close by, the player's gilded carving nearby, and veterancy.
- **Low morale** shows as fear, and the ship tries to break away.
- **Broken morale** makes a ship strike its colours. The player's flagship never strikes.

**Struck ships.**
- **They wait.** A struck ship stays struck until it is captured or sunk, or until a ship of its own power comes within range and rallies it.
- **Capture.** A ship captures a struck ship by coming alongside, within a ship's length, and holding there for five seconds. The struck ship changes allegiance and joins the fleet, if there is room.
- **The choice.** The player may capture a struck ship, sink it, or sail away. Capturing it or sailing away counts as sparing it. Sinking it counts as killing it.

**The crippled flagship.**
- **When it would sink**, the player's flagship is crippled instead:
  - Every mast but a jury-rigged spar goes over the side, and a scrap of sail is set on the spar.
  - Its cargo spills into the sea and its open survey is lost.
  - Control passes to the ship itself. It limps to the nearest of the player's harbours, escorted by any companions.
- **Sea mercy.** No ship fires on a crippled flagship.
- **At the harbour**, the flagship is repaired at a cost in timber. It keeps new scars, and control returns.

**Sieges.** Forts and harbour batteries outrange ships and fire heated shot. To silence them, ships bombard each gun position and must stay within the fort's reach while they do.

### Fleet and orders

**The fleet.**
- **Size.** The player can command up to eight companions. Fluyts count toward the eight, so trade and war compete for the same places.
- **Joining.** Companions are built at harbours, captured when they strike, recruited when masterless (come alongside and hold for five seconds), or taken as a rival flagship.
- **Formation.** Companions sail in line astern behind the flagship when following. In battle they engage what the flagship engages and hold the line.

**Orders.**

| Order | What the companion does |
|---|---|
| **Follow** | Takes station in the line astern of the flagship |
| **Guard** | Patrols around a chosen structure or stretch of sea and engages intruders |
| **Trade route** | Sails between two chosen points, a harbour and a site or another harbour, carrying goods |
| **Hunt** | Patrols a chosen area, engages enemies, and breaks rival surveys there |

**Giving an order.**
1. **Pick the ship.** Click a companion in the world or on the chart to address it alone (its pennant flashes), or address no one to give the order to every companion.
2. **Pick the order.** Hold Space. The ring of signal flags opens around the flagship, and the mouse picks a flag.
3. **Pick the target.** Click the target in the world or on the chart.
4. **The world answers.** The flagship hoists the flag on its signal halyard, and each addressed companion answers by dipping its pennant and coming about to obey.

There is no box selection and no unit panel.

**Autonomy.** Companions act as beings. A companion whose morale falls low breaks off, sails for the nearest harbour to repair, and returns to its order afterwards. Companions never follow the flagship through the storm wall.

### Diplomacy

**The states.** Every pair of powers is in one of three states:

| State | Meaning |
|---|---|
| **War** | They fire on each other and break each other's surveys |
| **Truce** | They hold fire and avoid each other's survey lines |
| **Pact** | A truce plus trade |

**Starting states.**
- A power the player has not met is unmet. On first sighting it becomes a truce.
- The Ember Corsairs begin at war with everyone.

**Signals.** Diplomacy is done with signal flags.
- **Making an offer.** When a rival ship is in sight, the ring of signal flags gains an outer ring of three flags: Truce, Pact, and War. The player picks a flag and clicks the rival ship.
- **The answer.** The rival answers by hoisting the same flag to accept, or its war flag to refuse.
- **Offers to the player.** Rivals also signal the player. A rival ship approaches and hoists a flag. Hoisting the same flag back accepts. Ignoring it for thirty seconds refuses.

**Breaches.** Firing on a power, breaking its survey, or raiding its route while at truce or pact is a breach. It means war, and a lasting grievance against the power that broke faith.

### Weather, night, tide, and calm as tactics

- **Storms.**
  - **Sight and speed.** Sight shrinks. The wind rises, so running before it is fast and beating into it slow.
  - **Rigging risk.** Crowded sail risks the topmasts.
  - **Surveys.** An open survey line frays: if the flagship does not close it before the storm passes, the line breaks.
  - **Lightning** can strike the tallest mast in open water and set the rigging alight. It is rare and deterministic.
- **Night.** Sight shrinks and lanterns matter. A fleet that douses its lanterns on a new moon can close on an enemy unseen, but risks the shoals.
- **Tide.** High water opens the reef channels to deep hulls, and low water closes them. A battle that drives a ship into a closing channel strands it on the falling tide.
- **Calm.** In lulls and dead calms, sailing ships drift and oared ships rule.

## The campaign

**Shape.** The campaign is one continuous voyage of six to eight hours, in three acts.
- **What drives it.** Its structure comes from the regions' gates, the flagship's tiers, and the rival powers' arcs. Each act ends at a milestone in the world, never at a timer.
- **Determinism.** Authored events are triggered by deterministic world state, so a recorded campaign replays exactly.
- **The rivals adapt.** Every power keeps playing its doctrine the whole time, so no two campaigns played by different hands unfold alike.

### Act I: Waking (target: 60 to 100 minutes)

1. **Waking.** Dawn on the first day. The pinnace wakes in the Cradle's lagoon beside the empty village, with mist on the water. The chart is blank but for the lagoon.
2. **The first light.** The dormant lighthouse on the headland glows faintly. Anchoring at its foot for a few seconds lights the beacon. The ultramarine floods outward across the lagoon, and the same colour bleeds into the pinnace's sails.
3. **The first survey.** A dotted ink line on the HUD suggests a loop around the nearest islet. Closing it floods the colour inward and inks the islet's coast.
4. **The first harbour.** Mooring at the village pier makes it the player's first harbour, at no cost. The piers and cranes stir.
5. **The first salvage.** An old wreck in the Cradle's shallows gives the first iron.
6. **The first goods.** The first spice grove goes up on a Cradle islet, and its skiffs begin to run.
7. **The world teaches.**
   - A Lantern Company fluyt convoy passes through the Cradle on a route, showing what a route is.
   - A Corsair xebec breaks a Company survey line within sight, showing that surveys can break.
   - A Company lighthouse lit on the horizon floods its colour, showing that others claim too.
8. **The Spice Isles.** The player discovers them and meets the Lantern Company, which offers a truce at first sighting and a pact soon after.
9. **The first companion.** The player builds or recruits a first companion, usually a jacht or fluyt.
10. **The caravel.** The flagship is rebuilt as a caravel, with timber and spice, and armed with iron from salvage or trade.
11. **The raid.** Corsair xebecs raid the player's first trade route. The first real battle follows.

**Act I ends** when the flagship is a caravel and the first Corsair raid is over, whether driven off or survived.

### Act II: Reaching (target: two to three hours)

- **New waters.** The caravel beats through the contrary belt into the Green Reaches. The Fire Archipelago's iron is now within reach of an armed flagship.
- **The war in the Reaches.** The Crown and the Republic go to war on the day the player first enters the Green Reaches, or on the tenth day if the player has not arrived. The player can ally with either, exploit both, or stay out.
- **Growth.** The fleet grows and the economy spreads across regions. The flagship becomes a carrack, which opens the Roaring Belt and first contact with the Jade Armada, and then a galleon.
- **The coalition.** In the last phase of Act II, the Crown forms a coalition against whichever power has led the planet's share for the past day.

**Act II ends** when the flagship is a galleon and has entered the Roaring Belt.

### Act III: Dominion (target: two to three hours)

- **The north.** The ice-bow refit or a polar bark opens the Northern Ice and the Iron Turtle.
- **War in the south.** War in the Roaring Belt, and sieges of rival capitals.
- **The grand flagship.** It is built at a harbour from the largest cost in the game, the only one that takes all four resources in quantity.
- **The crossing.** With the grand flagship at the storm wall at a new moon, the eclipse comes. The wall parts at totality. The companions refuse at the edge, and the flagship enters alone.

**Act III ends** when the beacon is lit.

**How each act announces itself, without words.** At each act boundary, the camera rises to the orbital view at the next dawn for a few seconds, then returns. The papyrus of the HUD and the chart gains a new ornament band: a plain frayed rim in Act I, a rhumb-line rose border in Act II, a gilded compass ring in Act III.

### The mystery of the crews

- **The longboats.** Empty longboats lie beached across the planet, three in each region, each with its bow pointing toward the south pole.
- **On the chart.** Each longboat the player sights is inked as a small boat glyph with a fine rhumb line drawn from it toward its bearing. As more are found, the lines visibly converge on the south pole.
- **The other traces.** Every empty settlement shows that it was left recently: warm hearths, lit windows at dusk, nets still wet on their frames.
- **Never resolved.** Nothing explains this in words. The ring of beached longboats around the beacon at the Quiet Pole is the answer the game gives, and it gives no other.

### The ending

1. **The beacon catches.** Inside the wall, the grand flagship moors beneath the beacon. Its three stern lanterns flare, and the flame climbs the tower's iron chain to the brazier.
2. **The light rises.** It goes up from the pole as a column. Seen from orbit, a ring of light spreads from the south pole across the whole planet.
3. **Every ship answers.** Every ship on the planet, of every power, turns its bow toward the pole and dips its ensign as the ring passes.
4. **The colours.**
   - **Mercy.** If the player spared at least as many struck ships as their ships sank, and kept more truces than they broke, every power's territory takes on bands of all the powers' colours, braided outward from the pole.
   - **Conquest.** Otherwise, the player's ultramarine sweeps every territory not anchored, and the beacon's light carries it to the horizon.
5. **The close.** The camera holds on the orbital view through a full day and night, then the papyrus sheet unrolls over it and the wordmark inks itself in.
6. **Free play.** The game then continues: the wall stays calm, the beacon keeps burning, and the rival powers play on.

### Teaching without text

**Act I is the tutorial**, and the world teaches.

**Guidance on the HUD.** Two guidance glyphs appear, used sparingly: a dotted ink line that suggests a path, and a pulsing ink ring that marks a place. They appear in Act I and again only when a new mechanic first becomes useful.

**Mouse first.** Steering and sailing must be discoverable within thirty seconds, with the mouse alone.

**The keyboard diagram.** The first time a keyboard action becomes useful, a small ink diagram of a keyboard appears on the HUD rim. Its keys are blank, with no letters, and the relevant key's position is filled with ink. It fades once the action has been used.

| Key | First shown |
|---|---|
| Sail setting | At the first squall |
| Broadside keys | At the first battle |
| Space | When the first companion joins |
| L | At the first night |
| M | Once the chart has content |
| T | At the first mooring at night |

**Failure teaches.** Crossing its own survey line breaks it in front of the player, gently, early in Act I.

## The interface

The interface is part of the world's visual language: aged papyrus, iron-gall ink, watercolour, and engraved brass. It must feel as finished and as premium as the world itself. Every indicator is graphic.

### The pictogram vocabulary

One consistent family of ink pictograms is drawn in the same hand as the chart. It covers:

| Group | Pictograms |
|---|---|
| Resources | Log, stone block, iron ingot, spice sack |
| Structures | Harbour, lighthouse, fort, timber camp, quarry, mine, spice grove |
| Fleet orders | Follow, guard, trade route, hunt |
| Diplomacy | Truce, pact, war |
| Shot | Round ball, chain shot, glowing heated ball |
| Sail settings | Four sail shapes, from reefed to crowded |
| The chart | Wreck (a broken mast), longboat, guidance line, guidance ring |
| Ship classes | A silhouette mark for each of the sixteen ship designs |

The signal flags of the order ring are real flag designs, geometric and colour-coded, and they fly on the flagship's halyard exactly as drawn on the ring.

### The HUD

The only interface during ordinary play is a round HUD in the top-right corner.

**The papyrus.**
- **Material.** It is styled as a piece of aged papyrus: visible reed fibres, a darkened, frayed rim, and ink-wash and watercolour territories that bleed slightly into the fibres.
- **The frame.** It looks like a fragment of an explorer's chart, framed by a fine engraved compass ring.
- **Orientation.** It rotates so the player's heading is always up.

**What it shows.**
- the surrounding sea, with coastlines and shoals as charted
- nearby territories in their owners' colours, with their borders drawn to show war, truce, or pact
- open survey lines
- nearby ships, as inked silhouette marks of their class in their owner's colour
- companions, each with its order flag
- the player's ship, its heading, and its sail-setting mark
- the guidance glyphs

**The compass ring carries:**
- **The wind.** A feathered arrow on the rim shows where the wind blows from. Its length shows the strength, and its streamers flick with the gusts.
- **The hour.** A small sun or moon disc travels the outer rim. The moon is drawn in its current phase.
- **The tide.** A wave mark on the rim rises and falls with it.
- **The broadsides.**
  - **Reload.** Two arcs flank the player's ship mark, port and starboard. Each fills with ink as that side reloads.
  - **Roll.** A fine tick swings across the arcs with the ship's roll, so the up-roll and down-roll can be timed.
  - **Shot.** The current shot pictogram sits on the arcs.

**The player's ship mark shows its condition:** torn-sail strokes, a scorched stain when burning, and a tilt when listing. Companion marks droop their pennants when their morale is low.

**Weather and light on the HUD.**
- **Rain** beads and runs on the papyrus during storms, and the watercolour bleeds wider.
- **At night** the HUD is lit as if by a lantern from one side. It stays fully readable.

**The harbour card.** While the flagship is moored in one of the player's harbours, a second, smaller papyrus card unrolls beside the HUD. It shows:
- the ship classes and refits that harbour can build
- each one's cost as small piles of resource pictograms
- the stockpile as four rows of pips
- a pictogram to hasten construction with spice

Choices the stockpile cannot pay for are smudged and greyed. The card does not pause the game.

### The chart

**Opening and closing.**
- Pressing M opens the chart, and pressing M again closes it. The chart is a large papyrus sheet that unrolls across the screen.
- It is decorated with compass roses, rhumb lines, inked sea-chart ornament, and the current act's border ornament.
- Its only lettering is the region names the player has discovered.
- Opening the chart pauses the campaign. Closing it resumes exactly where play stopped.

**The globe.**
- **A live render.** In the centre is a beautiful, fully lit 3D render of the whole planet as it stands right now. It shows:
  - every charted territory painted in its owner's colour
  - every charted island
  - every ship within sight as a tiny rendered ship
  - the atmosphere rim and the live day-night terminator
- **Moving it.** The globe turns slowly. The player can drag to spin it and scroll to zoom it.
- **Ink on the globe.** It is painted as well as rendered. The charted coastlines are inked onto its surface, and the region names are lettered along its curve.
- **The uncharted surface** is blank papyrus. Where charted meets uncharted, the watercolour bleeds softly into the fibres.
- **What else it carries:**
  - trade routes as dotted ink lines
  - wreck and longboat glyphs, with the longboats' converging rhumb lines
  - structure pictograms, with their anchoring radii as faint hatched rings
  - the storm wall as a dark band around the south pole

**The leaderboard.** Beside the globe is a ranked column of painted pennants, one per power.
- **Length.** Each pennant's length shows that power's share of the planet.
- **Powers not yet met** appear as undyed, blank pennants.
- **The player's pennant** is clearly distinguished: ultramarine, with the compass star and a gilded edge.
- **Diplomacy shows on the pennant tails:** a ragged swallow-tail for war, a plain tail for truce, and a braided cord at the hoist for a pact.

**The fleet.** Below the leaderboard, each companion appears as a small rendered portrait of itself, scars included, with its order flag. Clicking a portrait addresses that companion. Orders are then given with the flag ring and a click on the globe, exactly as at sea.

**Building.** Build sites the player can use show on the globe as small open circles.
- **Choosing.** Clicking a site opens a ring of the structure pictograms that fit it, each with its cost as a pile of pictograms.
- **Assigning a ship.** Choosing one marks the site with a scaffold glyph and sends the nearest idle companion to anchor there. A dotted ink line runs from that ship to the site. If no companion is free, the site waits for the flagship.

**The stockpile** sits in the sheet's lower corner as four rows of pips.

**Mute.** A small bell pictogram with a stroke through it mirrors the N key.

### The opening screen

The game opens on papyrus.
- **The wordmark.** It inks itself in.
- **Loading.** While the game loads, a rhumb line draws itself across the sheet to show progress.
- **The two choices,** as pictograms:
  - **Continue** (a ship under sail) appears only if a save exists.
  - **New voyage** (a ship on a slipway) is confirmed by holding: ink fills a ring around it while it is held.

The sheet then rolls away into the waking scene with no cut to black.

### The cursor

In the world, the cursor is a small inked heading mark on the water. It turns into a broadside mark when the guns are run out.

## The living world

### Vegetation and ground

**Palms.** Place hero palms by hand. Give them curved, leaning trunks with ringed bark, and let some overhang the water.

**Every vegetation type the regions call for:**
- mangroves with arching roots standing in the tide
- broadleaf jungle in layers
- terraced spice shrubs
- oak and beech forest
- wind-sculpted pines on the colder islands
- scrub on the dunes
- tussock grass
- moss and lichen on the polar rock

**Ground cover:** beach grass, ferns, flowering shrubs, vines, mossy boulders, driftwood, pumice, and tide pools.

**Standards.**
- **One wind.** All foliage moves in the one shared, gusting wind, and gusts visibly travel across a hillside as a wave of turning leaves.
- **Backlight.** Leaves and fronds glow when backlit.
- **Wet and dry.** Foliage darkens and gleams when wet.
- **Grounded.** Every plant stands on the ground at the right density for its slope and soil: none on sheer rock, dense in the valleys, sparse on ridges.

### The water

The water must be the centrepiece. It needs:
- **Reflections.** Accurate reflections of everything above it, including every light source, sail, and beacon.
- **Refraction and depth.** Refraction and depth-based colour absorption, with reef, sand, and rock visible in the shallows.
- **Swell.** A rolling swell that follows the wind and that ships visibly ride, pitching and rolling over each crest. Its height and period change by region and weather, from the glassy calm of the Quiet Pole to the great swell of the Roaring Belt.
- **Surf.** Breaking surf on beaches and reefs, with foam that washes up the sand and drains back. The surf line follows the tide.
- **Foam collars.** White foam around rocks, stacks, buoys, piers, ice floes, and moored hulls.
- **Wakes.** A convincing wake behind every ship: a bow wave, V-shaped arms, a churned band astern, and spray that bursts over the bow in chop. Oar strokes leave rows of swirls. Leeboards and rudders cut their own small wakes.
- **Caustics** dancing on the shallow seabed.
- **Battle effects on the water.** Shot plumes where balls strike the sea. Burning wreckage reflected and flickering on the swell. A spreading slick of debris over a sinking.
- **Ice.** Floes that ride the swell and grind together, with dark water in the leads between them.
- **Lava and steam.** Water that boils and steams where lava enters the sea, its surface lit orange from below at night.

### Life and particles

**Particles.**
- Smoke rises from the volcano, the chimneys, the kilns, the furnaces, burning ships, and gun batteries, and bends in the wind.
- Embers and ash drift from the caldera.
- The waterfalls throw up mist and rainbows.
- Dust motes glow only inside the sunbeams.
- Banks of low sea mist drift across the water.
- Spray blows off the wave crests in strong wind.
- Driftwood, kelp rafts, and pumice ride the swell.
- Ice floes calve and drift near the poles.
- Snow blows through the northern squalls.
- **At night,** bioluminescence lights up in every wake, surf line, oar stroke, shot splash, and splash.

**Machines and fixtures in motion.** Buoys ring. Harbour cranes swing. Windlasses turn. Bells sway in their towers. Banners stream. Nets dry on their frames and flap in the wind.

### Sky, light, and the day

**The cycle.** A continuous day-and-night cycle of twelve minutes loops: dawn, morning, midday, afternoon, golden hour, sunset, blue hour, night, and pre-dawn.

**One sun and one moon.**
- **The sun.** The planet is lit by one sun, so the sun travels a real arc across the player's sky. That arc changes with latitude: high at the equator, low and long in the north.
- **The terminator** is a true line on the planet, visible from high above and on the globe.
- **The moon.** It takes over as the key light at night, and shadows follow whichever one is lit.
- **What changes with the hour:** sky colour, clouds with silver-gold linings, fog, ambient light, exposure, and the colour grade.

**The night sky.**
- **Stars,** a faint Milky Way band, and a cratered moon in its correct phase. A full moon lights a glittering path on the sea.
- **New moon.** The moon is absent and the Milky Way at its brightest, so the lanterns, beacons, and bioluminescence carry the scene.
- **Aurora.** In the north, it hangs in slow curtains and lights the ice.

**The eclipse.** The moon's disc crosses the sun. The light dims and cools, and then at totality:
- the sky drops to deep blue and the stars come out at noon
- the corona stands around the black disc
- the horizon glows orange all the way round
- the temperature of the light visibly shifts across the sea

**Every hour has its own fully realised look:**
- **Dawn:** cool pastels, and mist lying low on the lagoons.
- **Morning:** crisp, clear light and vivid turquoise shallows.
- **Midday:** a high, hard sun, deep blue water, and sharp caustics.
- **Afternoon:** building cumulus, deepening colour, and the first slant in the shadows.
- **Golden hour:** the signature look. A low, warm sun, long shadows across the water, god rays through the palms, forests, sails, and spray, backlit canvas and foliage, and a warm haze that softens the horizon.
- **Sunset:** a burning sky reflected across the whole ocean.
- **Blue hour:** deep indigo, with the first stern lanterns, harbour windows, and beacon fires appearing.
- **Night:** moonlit silver water, lit by bioluminescence, lanterns, and beacon fires.
- **Pre-dawn:** a faint glow building on the curved horizon.

**Each region shapes its hours.** Every hour must look right in every region:
- humid haze over the Spice Isles
- ash-tinted light and red-lit cloud bases at night in the Fire Archipelago
- golden-hour glory in the Green Reaches
- grey light with sweeping shafts of sun in the Roaring Belt
- low sun and blue twilight in the Northern Ice
- polar twilight at the Quiet Pole

### Weather

**Storms roam.** Storm cells form in the trade winds and the westerlies and travel with the prevailing wind, so most days the player sails into or through one. In a storm:
- Clouds thicken into a dark, towering overcast, and the swell rises into whitecaps.
- Rain sweeps through in visible curtains, with splash crowns on the sea.
- Branching lightning lights the clouds and the whole ocean.
- Decks, sails, rocks, and foliage turn wet and glossy, then dry slowly over the following hours.
- Heavier seas make ships roll harder and throw more spray.

**Smaller and permanent weather.**
- **Squalls.** Short, sharp rain bands in the tropics.
- **Snow squalls** in the north.
- **Sea mist** at dawn in the fjords and lagoons.
- **The Roaring Belt** is a permanent storm.
- **The storm wall** at the south pole is a standing ring of storm over the ice, lit from within by lightning.

**All weather is simulation state.** Its position and intensity affect sailing, sight, and surveys, and it is deterministic.

### After dusk

- **What lights up.** Stern lanterns, the beacon fires on the lighthouses, the windows of every empty settlement, the furnaces of the mines, and the glow of the lava.
- **Borders** shimmer softly on the dark water.
- **Open survey lines** glow brighter, so they stay readable at night.
- **Every light lights its surroundings.** Each source lights the water, mist, sails, hulls, and rock around it and appears in the reflections.
- **Battles at night.** Muzzle flashes light the smoke from inside. Burning ships light the whole sea around them.

### Animation and feel

- **Everything moves naturally.** The water, ships, sails, rigging, oars, foliage, smoke, particles, territory, structures, and camera must all be animated naturally and smoothly. Avoid artificial slow motion or sluggish movement.
- **Ships move like one body.** Their motion is coupled: the hull's pitch and roll, the masts' whip, the sails' fill, the yards' brace, and the flags' stream all answer the same wind and swell together.
- **Damage changes motion.** A dismasted ship rolls more and steers worse. A ship that has lost its rudder yaws. A flooding ship settles and wallows.

### Camera

- **The chase camera.** A third-person chase camera follows the flagship. It sits low enough that the horizon visibly curves, and high enough that nearby territory, survey lines, and enemy ships read clearly.
- **The player's control.** The player can drag to orbit and scroll to zoom, all the way from deck level up to an orbital view that shows the whole planet. A slow cinematic drift keeps the camera alive.
- **Hard limits.** The camera must never dip below the water surface, pass into an island, ice, or a ship, or lose sight of the player's flagship.
- **Battle.** When the flagship engages, the chase camera widens and rises slightly so both ships are in frame. The player keeps control.
- **Discovery.** When a region or landmark is first sighted, the camera eases for a few seconds toward framing it while the player keeps steering. Any drag cancels this at once.
- **Cinematics.** Only these take the camera away from the player, and each lasts no more than a few seconds, except the ending:
  - an act boundary
  - a tier launch
  - the capture of a rival capital
  - the eclipse crossing
  - the ending
- **Fast-forward.** Holding T while moored in one of the player's own harbours runs the simulation fast. The world goes on and the rivals act, so it is a real choice, not a free skip. The camera eases to a wide view of the harbour while time runs.

### Geometry, materials, and lighting

**No primitive shapes.**
- **Shaping.** Do not rely on primitive geometric shapes as the finished result. The islands, rocks, ice, vegetation, ships, structures, and settlements need carefully shaped geometry and clearly visible small-scale detail.
- **Small-scale detail,** including:
  - bark rings, palm fronds, and rock strata
  - columnar basalt, ice crevasses, and lava ropes
  - planking, treenails, rope lashings, deadeyes, blocks, and belaying pins
  - sail seams, reef points, and bonnets
  - carved stern ornament, gilding, and weathered paint
  - copper plate nails, iron straps, battens, and oar looms
  - masonry coursing, thatch, terracotta tiles, and lead roofs
- **Textures.** Use detailed, scanned, or high-quality textures for rock, sand, bark, wood, iron, copper, canvas, matting, rope, masonry, thatch, ice, and papyrus.

**Everything rests.** Everything must rest on the ground or ride the water. Nothing may float, and no objects may intersect.

**Lighting.**
- **Revealing.** Lighting must reveal the geometry and materials clearly at every hour, in every region, and in every weather.
- **The tools.** Use soft shadows, ambient occlusion in crevices and under hulls, light shafts, bloom, and a filmic grade.
- **Never crushed.** Shadow sides must stay readable and never crush to black, even at night on a new moon, in the storm, and inside the eclipse.

### Sound and music

**A soundscape, synthesized in code:**
- **The sea and weather.** Swell, surf, and wind in the rigging that rises in pitch as the wind strengthens. Rain. Thunder that rolls in after each flash, delayed by the distance of the strike.
- **The ships.** Creaking timbers and cracking canvas. Every ship class creaks and sounds in its own way, from the galleass's oars to the junk's battens clattering as it reefs.
- **The ships as beings.** They never use voices. They speak through their timbers and canvas: a deep groan of strain when afraid, a bright crack of canvas filling when they press in.
- **Territory.** The rush of a closing loop. The roar of a beacon catching. The deep groan of a sinking.
- **Battle.** Broadsides as a ripple of reports, muffled and delayed with distance. The whistle of shot overhead, the whirr of chain shot, splintering timber, and the roar of fire.
- **The world.** Ringing buoys, swinging cranes, the boom of calving ice, the hiss of lava in the sea, and the hush of the eclipse.

**An adaptive score.**
- **Samples.** It is built from bundled open-licence instrument samples (CC0 or CC-BY): viols, lute, recorders, shawm, sackbut, drums, drones, and bowed glass.
- **Composition.** It is composed procedurally from authored motifs in period modes.
- **Each region has its own instrumentation and motif:**

| Region | Instrumentation |
|---|---|
| The Cradle | Lute and recorder |
| The Spice Isles | Plucked strings over drones and metallophone colour |
| The Fire Archipelago | Drums and shawm |
| The Green Reaches | A consort of viols |
| The Roaring Belt | Low drones and sackbut |
| The Northern Ice | Sparse recorder and bowed glass |
| The Quiet Pole | Near silence, resolving into one sustained chord as the beacon catches |

- **States.** The score moves smoothly between exploration, tension when an enemy is in sight, battle, aftermath, a short discovery phrase, and the act transitions.

**Mute.** A keyboard toggle (N) mutes everything.

### Performance

- **The target.** Keep a smooth 60 frames per second on a recent laptop at Retina resolution in the worst case, without making an obvious sacrifice in quality. The worst case is a battle of twenty or more ships in the Roaring Belt, in a storm, at night, with fire and smoke.
- **Scale.**
  - **Ships.** Forty to sixty ships are active across the planet at once.
  - **Distance detail.** Ship geometry reduces with distance, but silhouettes are preserved at every level: sails keep their shape, and rigging thins into fine lines rather than vanishing.
  - **Streaming.** Regions stream their detail in by distance.
- **No hitches.** There must be no hitch at region boundaries, at autosave, or when the chart opens.
- **Load time.** The game loads to the opening screen in under ten seconds.

## Architecture

### One deterministic simulation

All game rules live in one deterministic simulation with no rendering code. That includes:
- movement, wind, swell, current, tide, weather, and the positions of the sun and moon
- sight and charting
- survey lines, claims, anchoring, and fading
- the economy, construction, and capture
- ballistics, damage, fire, morale, sinking, and crippling
- the fleet and its orders
- diplomacy
- every rival power's strategic and ship-level decisions
- the campaign's events and act milestones
- the score

**How it runs.**
- **Fixed timestep.** It runs on a fixed timestep with a seeded random generator and never reads the wall clock or the frame rate.
- **Identical everywhere.** It must produce identical results headless in Node and in the browser. Where the platform's built-in math functions could differ between environments, the simulation uses its own implementations.
- **Headless.** It can run with no renderer at all, and faster than real time.
- **A state hash.** It exposes a hash of its complete state at any tick.

**Who reads and who writes.**
- **Reading.** The renderer, HUD, chart, audio, and camera only read simulation state.
- **Writing.** The player, every rival ship, and the autopilot act only by sending inputs.
- **Pausing and fast-forward.** Opening the chart stops the simulation from advancing. Fast-forward advances more ticks per frame.

**Saving.** A save is the serialized simulation state at a tick. Saving must not drop a frame.

### The autopilot captain

Build an autopilot captain for testing. It plays the player's flagship and fleet through exactly the same inputs as the player, with its own seeded choices. It has two doctrines:
- **War-led:** it expands and wins mainly by combat and capture.
- **Trade-led:** it expands mainly by charting, lighthouses, extraction, pacts, and trade, and fights only to defend.

### Code quality

- **Every line must earn its place.** Write no dead code, duplication, or speculative features, and prefer deleting to adding.
- **This never justifies lower quality.** Carefully built procedural geometry that takes more code is preferred to a shortcut that looks worse.
- **Data and code.** The authored world is data: islands, sites, routes, and events. The simulation and renderer read that data rather than hard-coding it into logic.

### Tools and credits

- **Choose for yourself.** Automatically use the most appropriate skills, tools, libraries, techniques, and available assets needed to achieve the best result, within the procedural-geometry rule above. Do not wait for me to specify which technologies to use.
- **Credits.** Log every third-party texture, lighting environment, instrument sample, and library with its source and licence. The log lives in the repository and never appears in the game.

## Acceptance checks

These define done. You may add tests, but you may not weaken, skip, or remove any of these.

### 1. Territory geometry

A scripted flagship surveys a loop around a known circle of latitude at angle θ from the pole. Run this twice:
- **On a test world.** In the headless simulation on an open-ocean test world, which has the same rules with the islands and the storm wall removed.
- **On the real planet.** At a latitude you choose that is open water, where any island area inside the cap counts as claimed, as the rules require.

**Pass:** in both runs, the claimed area matches the spherical cap area 2πR²(1 − cos θ) within a tolerance you state and justify.

### 2. Determinism

- **Across renderers.** Run the same campaign start and the same recorded player inputs for at least thirty minutes of play twice: once headless, and once in the browser with full rendering at a different frame rate, with the chart opened and closed along the way. Both runs must end with an identical state hash at the same tick.
- **Across a save.** Save in the middle of a battle. Load that save in a fresh page and continue with the same recorded inputs. The state hash must match an uninterrupted run at every later checkpoint.

### 3. The autopilot campaign

Run the war-led autopilot through the whole campaign headless, ten times with different autopilot seeds. Every run must reach the ending.

**Pass:** the act durations must fall within these bands, measured as median play time:
- Act I: 60 to 100 minutes
- Act II: two to three hours
- Act III: two to three hours

Report every run's milestone times: each region's discovery, each flagship tier, each act boundary, and the ending.

### 4. Viable strategies and distinct powers

Run twenty headless campaigns with each autopilot doctrine.

**Pass conditions:**
- **Peace is viable.** The trade-led doctrine reaches the ending with a median time no more than 1.4 times the war-led median.
- **No dominant rival.** Across all forty runs, every rival power finishes as the largest rival at least once, and none does so in more than half the runs.
- **Distinct profiles.** Report each power's mean final share, mean survey-loop area, surveys broken, routes raided, ships sunk, ships captured, structures built by kind, trade volume, and truces kept and broken. Each power must lead or trail clearly on its signature measure:

| Power | Signature measure |
|---|---|
| Gilded Crown | The largest mean survey-loop area |
| Serene Republic | The most truces kept |
| Lantern Company | The most trade volume |
| Ember Corsairs | The most surveys broken and routes raided |
| Jade Armada | The fewest surveys, and the most ships sunk per war it fights |
| Iron Turtle | The most forts built |

### 5. Performance

Measure the frame rate in a desktop browser at Retina resolution, device pixel ratio 2, in a production build.

**What to measure:**
- every region at every one of the nine hours
- a storm in every region but the Quiet Pole
- the eclipse crossing
- a battle of twenty or more ships in the Roaring Belt, in a storm, at night, with ships burning

**Pass:**
- It must hold 60 frames per second throughout. Report the mean, the 1% low, and the worst frame for each case.
- Measure load time to the opening screen. It must be under ten seconds.

### 6. Text audit

**What to check:**
- every required capture
- a sweep of the opening screen, the HUD, the harbour card, and the chart at each act
- the page's DOM

**How:** run optical character recognition over the captures and the sweep, and inspect the DOM.

**Pass:** the only text found anywhere is the wordmark on the opening and closing papyrus, and the region names on the chart and globe.

## Captures

Actually test the finished result in a desktop web browser. Script and capture every screenshot below. Each one names what it proves, and passes only if it proves it.

**The day in one place.** Take these in the Cradle: dawn, morning, midday, afternoon, golden hour, sunset, blue hour, full-moon night, new-moon night, and pre-dawn. They prove every hour has a fully realised look.

**Storms.** A storm at midday and a storm at night in open sea. They prove rain curtains, lightning, whitecaps, wet surfaces, and readable shadows.

**The regions.** Every signature vista listed in the seven region descriptions, each at its stated hour and conditions. They prove each region is identifiable from a single frame.

**The planet.**
- The orbital view early in Act I, with the veil over unknown regions.
- The orbital view late in Act III, unveiled.
- Proof of the curve: distant islands and ships sinking below the horizon.

**The ships.**
- A hero shot of each of the sixteen designs, in close, at golden hour. Each proves construction detail and a distinct silhouette.
- A close shot of rigging under heel, proving lashings, deadeyes, and ratlines, and that nothing clips.
- Each of the nine refits on the flagship, proving each is visible.
- A veteran companion's scars.
- A tier rebuild: the scaffold, then the launch.
- Each ship-as-being state: waking, fear, courage, grief, striking colours, and the change of allegiance as colour bleeds into the canvas.

**Territory.**
- The first lighthouse lit, with the colour racing outward.
- An open survey line by day and by night.
- A loop closing and flooding with colour.
- A survey broken and dissolving into foam.
- Territory changing hands in a sweep.
- Unanchored territory fading.
- Borders in all three diplomatic states.
- A border crossing the pole, proving no seams or pinching.

**The economy and building.**
- A structure under construction.
- Each extraction site working.
- Skiffs running inside territory.
- A fluyt convoy, loaded deep.
- A harbour's stockpile piles.
- A captured fort under its new banner.

**Combat.**
- A broadside exchange, showing the ripple of fire and drifting smoke.
- Chain shot bringing a mast down.
- Heated shot and a fire spreading through the rig.
- A fireship grappling and igniting.
- A siege of a fort.
- A night battle lit by muzzle flashes and burning ships.
- A crowded fight between several ships.
- A ship striking its colours.
- A companion sinking: the full sequence of list, toppling masts, torn sails, spray and bubbles, the debris slick, and the survey line dissolving.
- A wreck in the shallows at low tide.
- The flagship crippled under its jury rig.

**The fleet.**
- The fleet in line astern.
- The signal ring open, with the matching flags hoisted on the flagship's halyard.
- Companions answering an order by dipping their pennants.
- Companions refusing at the storm wall.

**Tides and conditions.**
- The same reef channel at high and at low tide.
- Floes closing a lead in the Northern Ice.
- Lava entering the sea at night.
- A galleass moving under oars in a dead calm.

**The ending.**
- Eclipse totality.
- The wall parting.
- The longboat ring.
- The beacon catching.
- The ring of light seen from orbit.
- The mercy ending and the conquest ending.

**The interface.**
- The opening screen while loading.
- A close view of the HUD by day, at night, and in rain.
- The harbour card.
- The chart at the start of Act I, mostly blank.
- The chart in Act III, mostly inked, by day and by night.
- The converging longboat lines on the globe.
- The leaderboard showing every diplomatic state.
- A keyboard diagram teaching a key.

### The fix loop

**The standard.** Judge every screenshot as that unbelievably harsh critic would. Any capture the critic would not accept as AAA is a failure to fix, not a note to leave.

**The console.** Inspect the browser console for errors.

**Fix every visible or technical issue you find.** That includes:
- Distorted geometry, seams, stretching, or pinching on the sphere or at the poles.
- Flickering or z-fighting at territory borders.
- Gaps in survey lines.
- Black screens or failed asset loading.
- Broken animation, or motion out of step with the simulation.
- Poor composition.
- Rendering artifacts, aliasing shimmer, or banding in the sky.
- Floating or intersecting objects.
- Rigging and sails clipping through anything.
- Camera problems.
- Shadows crushed to black.
- Any human or animal form, face, or figurative carving appearing anywhere.
- Any text beyond the two allowed items.
- Any ship whose silhouette cannot be told from another's.
- Any region that cannot be identified from its frame.
- Any frame that looks unfinished.

**Repeat** the capture-and-fix loop until every capture passes.

## Finishing

At the end, verify all of the following:
- the game starts from one command and builds to a working static site with no requests to other hosts
- a campaign can be saved, closed, reopened, and resumed
- the text audit passes
- all six acceptance checks pass
- there are no remaining runtime or loading errors

Then finish the task with only a brief response.
