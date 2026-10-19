# Mini Loop Sorter

A small 3D tilt-tray loop sorter simulator that runs in the browser (Three.js).

- A robot arm picks parcels from a pallet and places them on the infeed.
- The infeed weighs each parcel, scans its label and measures it with a light grid.
- Parcels merge onto the loop at 45°, go round and are tipped into chute A or B according to their label.
- You can change the sorter speed, close or empty chutes, and click a parcel to follow it.

## Run

The page uses JavaScript modules, which browsers don't load from a file opened directly, so serve the folder:

```sh
npx serve          # or: python3 -m http.server
```

Then open the address it prints. It needs an internet connection to load Three.js from a CDN. There is no build step.

## Test

```sh
npm test
```

Run `npm install` once first: it installs TypeScript and the type definitions for Three.js and Node,
which are only used for checking. Needs Node 22 or newer.

`npm test` first type-checks all the JavaScript (`npm run typecheck` does only that), then runs the tests:

- The type check uses the JSDoc type comments in the code and the settings in `tsconfig.json`
  (`checkJs`, `strict`). Nothing is compiled: the browser and Vercel serve the `.js` files as they are.
  The main types are `Parcel` in `js/parcels.js`, `Carrier` and `Chute` in `js/sorter.js` and the
  robot's `Pose` and job steps in `js/robot.js`.
- `tests/layout.test.js` checks the loop geometry in Node.
- `tests/sim.test.js` runs scenarios from `tests/sim.html` in headless Chrome and checks the outcome: parcels pass all three infeed stations and reach the right chute, a closed chute makes parcels go round again, a full bin stops taking parcels, and nothing moves onto the loop when the sorter is stopped.
- `tests/ui.test.js` loads the real page in `tests/ui.html` and uses its controls: the speed slider, clicking the belt and a parcel, the robot's queue limit, auto-feed, and closing, emptying and reopening chutes. It checks what the panels show after each step.

The browser tests share `tests/browser.js`, which serves the project and runs Chrome. They need Chrome (set `CHROME_PATH` if it isn't in the usual place; without Chrome they are skipped) and an internet connection for Three.js.

GitHub runs `npm test` on every push and pull request (`.github/workflows/test.yml`); the result shows next to each commit on GitHub.

## Code

| File | What it holds |
| --- | --- |
| `index.html` | Page structure and the import map for Three.js |
| `style.css` | Styles for the panels |
| `js/layout.js` | Dimensions and the loop's path (no Three.js, so it can be tested on its own) |
| `js/scene.js` | Renderer, camera, lights, floor, shared materials |
| `js/state.js` | Settings from the control panel (the one shared object) |
| `js/parcels.js` | Parcel size, weight, label data and the carton mesh; the parcel list (`addParcel`, `removeParcel`, `allParcels`) |
| `js/sorter.js` | Loop frame, trays, chutes and bins, and parcels from the tray onwards (`chuteInfo`, `setChuteOpen`, `emptyChute`, `sortStats`, tray hand-over for the infeed) |
| `js/infeed.js` | Belt, merge belt, scale, label scanner, light grid and the merge onto a tray (`onInfeed` for station readings) |
| `js/robot.js` | Robot arm and pallet (`requestPick`, `robotStatus`) |
| `js/ui.js` | Control panel, parcel information panel, clicking in the 3D view |
| `js/simulation.js` | One simulation step, shared by the animation loop and the tests |
| `js/main.js` | Startup and the animation loop |
| `tests/` | `npm test` (not deployed; see `.vercelignore`) |

Each module keeps its own data private and offers a few functions instead; the main ones are named above.
Only `settings` is shared directly, because the control panel writes it and the simulation reads it.
Parcel objects are passed between modules as plain records.
