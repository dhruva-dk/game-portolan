// The management game: pure, headless, deterministic (no DOM, no three, no Date, no Math.random). It imports only
// itself, world/random.ts, race.ts, office.ts and kinds.ts (tests/architecture.test.ts LAYERS). It never runs a race:
// it says which are due (race.ts RaceCard) and takes their results (RaceResult); the screens read it through office.ts.

export {};
