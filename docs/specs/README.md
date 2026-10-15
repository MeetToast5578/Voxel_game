# Specs: Phase 1 (Foundation)

Phase 1 of [the roadmap](../ROADMAP.md): the new scale, cubic chunks with no height limit, 16-bit block states, and a save that can grow. Each spec gives the goal, requirements, acceptance criteria and test cases. None of them contain implementation code.

| # | Spec | Size | Built by | Depends on |
|---|------|------|----------|------------|
| 1 | [CI](01-ci.md) | small | Haiku | — |
| 2 | [World scale](02-world-scale.md) | small | Haiku | 1 |
| 3 | [Auto step-up](03-step-up.md) | medium | Haiku | 2 |
| 4 | [16-bit block states](04-block-states.md) | medium | Claude | 1 |
| 5 | [Cubic chunks: data model](05-cubic-chunks-data.md) | large | Claude | 4 |
| 6 | [Cubic chunks: light and mesher](06-cubic-light-mesh.md) | large | Claude | 5 |
| 7 | [Cubic chunks: streaming](07-cubic-streaming.md) | large | Claude | 6 |
| 8 | [Save v2 in IndexedDB](08-save-v2.md) | medium | Haiku | 4, 5 |
| 9 | [Meter-based world scale and realistic trees](09-meter-scale-world.md) | large | Claude | 2, 6 |

**Order.**
- Spec 1 comes first.
- Specs 2–3 and specs 4–7 are two independent tracks. They both touch `src/config.ts`, so merge one before rebasing the other.
- Spec 8 comes last.
- Specs 5–7 may share one branch, because the game doesn't run between them.

**Retired.** The old spec 2 (save hotbar and time) is folded into spec 8. The old spec 4 (chunk-edge trees) is replaced by the phase 3 feature system, whose canopies are seamless by construction.

Written against `main` at commit `c44d94e`.

## Rules for every spec

- **One spec per branch and per pull request,** except specs 5–7 as noted. Don't mix specs, and don't refactor code the spec doesn't mention.
- **Don't change dependencies.** Don't add, remove or upgrade packages. In particular, do not move Vitest to 4.1.x, because `npm install` crashes on it. `package.json` and `package-lock.json` should not appear in the diff.
- **Pure modules stay pure.** `src/core`, `src/world`, `src/player`, `src/render/mesher.ts`, `src/storage` (except the IndexedDB implementation) and `src/ui/debugText.ts` must not import three or touch the DOM. They are unit-tested in Node.
- **Tunable numbers live in `src/config.ts`.** Import them; never hard-code them elsewhere. Distances and speeds are written in meters and converted there (from spec 2 on).
- **Tests go in `tests/`**, using the existing Vitest style. Note that `toEqual` treats −0 and 0 as different.
- **Ported tests keep their intent.** When a spec changes a layout or a scale, update the existing tests that encode it, and list each change in the pull request. Never delete an assertion to make a test pass.
- **Update `README.md`** when behaviour a player can notice changes.
- **Definition of done:**
  - `npm run check` passes (typecheck, all unit tests, build).
  - `npm run smoke` passes.
  - Every test case the spec lists exists and passes.
  - The pull request describes what changed and how it was verified, including any measurements the spec asks for.
- **Stop and ask** if a spec is unclear or contradicts the code. Don't guess.
