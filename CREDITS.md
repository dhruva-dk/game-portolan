# Credits

Third-party libraries and tools bundled with or used to build and test the game.
Licences: MIT = https://opensource.org/license/mit · Apache-2.0 = https://www.apache.org/licenses/LICENSE-2.0
Every texture, mesh, letter, sound and note is generated in code; the game bundles no image, model, font or audio
files. To add an entry, append one line: `- <name> — <source URL> — <author> — <licence> (<use>)`.

## Libraries

- three — https://threejs.org — three.js authors — MIT (runtime)
- vite — https://vite.dev — Evan You and Vite contributors — MIT (build)
- @capacitor/app — https://capacitorjs.com/docs/apis/app — Ionic and Capacitor contributors — MIT (runtime: the app going to the background and back, to save and resume the match)
- typescript — https://www.typescriptlang.org — Microsoft — Apache-2.0 (dev)
- playwright — https://playwright.dev — Microsoft — Apache-2.0 (tests)
- @types/three, @types/node — https://github.com/DefinitelyTyped/DefinitelyTyped — DefinitelyTyped contributors — MIT (dev)
- Chromium and WebKit browser builds for Playwright (`npx playwright install chromium webkit`) — https://playwright.dev/docs/browsers — The Chromium Authors; Apple and the WebKit contributors — BSD-3-Clause; LGPL-2.1 and BSD-2-Clause (tests: Chromium for the harness, WebKit as the iOS engine in the determinism vectors)
