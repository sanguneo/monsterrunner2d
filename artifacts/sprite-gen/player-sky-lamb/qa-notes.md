# Player Sky Lamb sprite-gen QA

- Base Lock Gate: **pass** — `base-source.png` is the accepted full-body, right-facing three-quarter idle anchor for the supplied white-and-blue lamb-rabbit adventurer.
- Pipeline: component-row extraction with a manual magenta key; `fringe_unmix_reach: 16` removed generator edge tint without leaving chroma-adjacent pixels.
- Extraction: **pass** — declared counts recovered exactly: `run` 6, `jump` 3, `hit` 2.
- Atlas: **pass** — 1536×768 alpha atlas with 256×256 manifest-owned frames.
- Motion verdicts: `run` **pass (experimental locomotion)**; alternating gait and scarf/tail rhythm read continuously. `jump` **pass**; crouch, airborne, landing progression is clear. `hit` **pass**; braced stance to attached-body recoil reads clearly, with no detached effects.
- Runtime: `public/assets/sprites/player_atlas.png` and transparent `player_idle.png` replaced. The live game render showed the new running player at the expected in-game size.
