# Specs: Polish batch

Four small, independent tasks written to be implemented one at a time (for example by Claude Haiku).
Each spec gives the goal, requirements, acceptance criteria and test cases. None of them contain implementation code.

| # | Spec | Size | Main files |
|---|------|------|------------|
| 1 | [CI](01-ci.md) | small | `.github/workflows/ci.yml`, `README.md` |
| 2 | [Save hotbar and time of day](02-save-hotbar-time.md) | small | `src/storage/save.ts`, `src/game.ts`, `src/debugApi.ts`, `scripts/smoke.mjs` |
| 3 | [Auto step-up onto 1-block ledges](03-step-up.md) | medium | `src/player/physics.ts`, `src/player/player.ts`, `src/config.ts` |
| 4 | [Trees at chunk borders](04-chunk-edge-trees.md) | medium | `src/world/generator.ts`, `tests/trees.test.ts` |

Do spec 1 first so the other three get CI. Specs 2, 3 and 4 touch different files and can be done in any order.

Written against `main` at commit `04dbb25`. Re-checked on 2026-10-23: the code is unchanged since then, so the specs still match it.

## Rules for every spec

- **One spec per branch and per pull request.** Don't mix specs, and don't refactor code the spec doesn't mention.
- **Don't change dependencies.** Don't add, remove or upgrade packages. In particular, do not move Vitest to 4.1.x, because `npm install` crashes on it. `package.json` and `package-lock.json` should not appear in the diff.
- **Pure modules stay pure.** `src/core`, `src/world`, `src/player`, `src/render/mesher.ts`, `src/storage` and `src/ui/debugText.ts` must not import three or touch the DOM. They are unit-tested in Node.
- **Tunable numbers live in `src/config.ts`.** Import them; never hard-code them elsewhere.
- **Tests go in `tests/`**, using the existing Vitest style. Note that `toEqual` treats −0 and 0 as different.
- **Update `README.md`** when behaviour a player can notice changes.
- **Definition of done:**
  - `npm run check` passes (typecheck, all unit tests, build).
  - `npm run smoke` passes.
  - Every test case the spec lists exists and passes.
  - The pull request describes what changed and how it was verified.
- **Stop and ask** if a spec is unclear or contradicts the code. Don't guess.
