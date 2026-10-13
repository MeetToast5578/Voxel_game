# Voxel Game

A Minecraft-like voxel sandbox that runs in the browser, built with TypeScript, Vite and three.js.

- Endless procedural terrain: hills, mountains, beaches, lakes, trees and caves
- Walk, sprint, jump, fly and swim, with block collisions
- Break and place 14 block types, 9-slot hotbar, pick-block
- Day/night cycle, sky and block lighting (glowstone), clouds, simple sound effects
- Start/pause menu with render distance, field of view and mouse sensitivity
- Automatic saving to `localStorage`
- Terrain generation and meshing run in Web Workers

All textures and sounds are generated in code; there are no asset files.

## Run

Requires Node.js 20+.

    npm install
    npm run dev        # then open http://localhost:5173 and click Play

## Controls

| Input | Action |
|-------|--------|
| Mouse | Look |
| W A S D | Move |
| Space | Jump / fly up / swim up |
| Left Shift | Sprint / fly down |
| F | Toggle flying |
| Left click | Break block (hold to repeat) |
| Right click | Place block (hold to repeat) |
| Middle click | Pick the targeted block into the hotbar |
| 1–9, mouse wheel | Select hotbar slot |
| F3 or ` | Debug overlay |
| Esc | Pause menu |

The pause menu has a **New world** button that deletes the save and generates a new random world.

## URL parameters

| Parameter | Effect |
|-----------|--------|
| `?seed=123` | Play a specific world (does not load or overwrite your save) |
| `?nosave=1` | Never read or write the save |
| `?autostart=1` | Skip the menu (used by the automated tests) |
| `?workers=0` | Generate and mesh on the main thread instead of Web Workers |

## Development

    npm run check      # typecheck + unit tests + production build
    npm run smoke      # headless Chromium test; writes screenshots to screenshots/

`npm run smoke` needs a Chromium for Playwright; run `npx playwright install chromium` once if it is missing.

CI (GitHub Actions) runs `npm run check` and `npm run smoke` on every pull request and every push to `main`.

### Layout

| Folder | Contents |
|--------|----------|
| `src/core` | math, seeded random numbers, coordinates, fixed-timestep loop |
| `src/world` | blocks, chunks, terrain generator, chunk streaming, lighting, day/night |
| `src/render` | mesher (face culling + ambient occlusion), textures, three.js renderer, clouds |
| `src/player` | physics, player controller, raycast, interaction rules, hotbar |
| `src/ui`, `src/input`, `src/audio`, `src/storage` | HUD, menu, debug overlay, input, sounds, saves and settings |
| `src/workers` | Web Worker pool for generation and meshing |
| `tests` | Vitest unit tests for all logic modules |
