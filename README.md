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

There is nothing to install: it uses Node's built-in test runner (Node 20 or newer).

- `tests/layout.test.js` checks the loop geometry in Node.
- `tests/sim.test.js` serves the project, runs scenarios from `tests/sim.html` in headless Chrome and checks the outcome: parcels pass all three infeed stations and reach the right chute, a closed chute makes parcels go round again, a full bin stops taking parcels, and nothing moves onto the loop when the sorter is stopped. It needs Chrome (set `CHROME_PATH` if it isn't in the usual place; without Chrome these tests are skipped) and an internet connection for Three.js.

## Code

| File | What it holds |
| --- | --- |
| `index.html` | Page structure and the import map for Three.js |
| `style.css` | Styles for the panels |
| `js/layout.js` | Dimensions and the loop's path (no Three.js, so it can be tested on its own) |
| `js/scene.js` | Renderer, camera, lights, floor, shared materials |
| `js/state.js` | Settings from the control panel and running totals |
| `js/parcels.js` | Parcel size, weight, label data and the carton mesh |
| `js/sorter.js` | Loop frame, trays, chutes and bins, and parcels from the tray onwards |
| `js/infeed.js` | Belt, merge belt, scale, label scanner, light grid and the merge onto a tray |
| `js/robot.js` | Robot arm and pallet |
| `js/ui.js` | Control panel, parcel information panel, clicking in the 3D view |
| `js/simulation.js` | One simulation step, shared by the animation loop and the tests |
| `js/main.js` | Startup and the animation loop |
| `tests/` | `npm test` (not deployed; see `.vercelignore`) |
