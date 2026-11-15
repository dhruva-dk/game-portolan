Every decision recorded here was made by an AI agent working autonomously on the manager brief (#56). None was
made or approved by the owner, and none is binding: the owner may overturn any of them. The owner's settled
decisions are in #56, section 2.

## 2026-11-15, Phase 0 (#57)

- **Question:** `ship/hull.ts` has a `TIERS` (the transom's panels between its rails), unrelated to the rank's wax
  tiers; the acceptance wants `grep TIERS src/` empty. **Choice:** renamed it `PANELS`, nothing else changed. There is
  no `seal` in `ship/hull.ts`. **Why:** meets the grep with the least change; the name is truer to what it counts.
- **Question:** what the lobby and the end panel show once the career plate is gone. **Choice:** the lobby keeps the
  wheel (top right) and PLAY (bottom right) only; the end panel keeps her place, what sank her and the sea she held,
  its band narrowed to them and centred; the won panel keeps the sunburst and the sea held. Nothing replaces the plate.
  **Why:** D6 deletes the career level; Phase C's `home` and `result` replace these screens.
- **Question:** the `menu.rank` glyph in `ui/glyphs.ts`. **Choice:** kept. **Why:** it is an icon of the UI kit
  (section 3.2 keeps the kit), not the rank screen, and #57 does not list it.
- **Question:** D26 says the world is drawn at 1.0 × CSS size. **Choice:** `frame.ts` `SCALE` 1.5 → 1, and every tool
  that opens a page (`budget`, `hitch`, `audio --cpu`, `capture`, `hero`) now opens the iPad Air's 1180 × 820 at 2
  pixels a CSS pixel (`tools/launch.ts` `DEVICE`), so the gates measure the device's page. **Why:** D26, and the
  gates stand in for the iPad (section 0.2). 1180 × 820 at 1 is within 2% of the pixels 956 × 440 at 1.5 drew.
- **Question:** how the match HUD is laid out for the new page. **Choice:** its pieces keep their CSS sizes and
  corners (anchored to the safe area as before); the sheets (title, lobby, settings, the end) are redrawn in the
  1180 × 820 page, each piece in its present corner. **Why:** #57 asks for each piece in its present corner; CSS px on
  the iPad are about the size they were on the phone, so the HUD's touch targets keep their size.
- **Question:** what file each empty folder holds. **Choice:** `career/career.ts`, `store/store.ts` and
  `campus/campus.ts`, each a comment on what the folder is for and `export {}`. **Why:** the layers test needs a file
  to see; naming no type or table leaves Phases A, B and D free to build theirs.
- **Question:** which `LAYERS` rows to add. **Choice:** `career/`, `race.ts`, `office.ts`, `store/` and `campus/` as
  section 4.1 gives them (`campus/` as `land/`'s row), and now also `race.ts` for `sim/` and `play/`, `office.ts` and
  `race.ts` for `ui/` (section 4.1); test `i2` counts `campus/` as a render folder; test `g` covers `career/`.
  **Why:** section 4.1 states them; adding them once here keeps Phases A and B off the same lines of the test.
- **Question:** the test `j` table of stand-ins once `play/placeholder.ts` is gone. **Choice:** removed `STAND_INS`;
  test `j` now holds for every file in `src`. **Why:** nothing stands in for anything any more.
- **Question:** how to reserve the playtest switches (D42). **Choice:** `debug.ts` names them in its header and in a
  `PLAYTEST` table with whether each is built; asking for one not yet built logs a line saying so. `?screen` is built.
  **Why:** the names are taken in one place, and a playtester is told plainly when a switch does nothing yet.
- **Question:** what counts as an element of the UI layer for `tools/capture.ts`'s page check. **Choice:** every HTML
  element, every sheet's `<svg>`, and every press-able region drawn inside one, with a box; it must lie within the
  page (0.5 px slack). Shapes inside an `<svg>` are clipped by it, so only the regions a finger must reach are checked
  among them (the title's rhumb lines run past the page on purpose). **Why:** that is what can be lost off the page.
