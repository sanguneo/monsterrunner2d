# Player sprite-gen QA

- Base Lock Gate: `y` — `public/assets/sprites/player_idle.png` is a complete right-facing full-body idle with the final proportions, palette, outline, sword, and child-friendly Halloween style. The accepted audit copy is `references/anchors/idle-right.png`.
- Reference stack for every row: accepted `idle-right.png` identity anchor + the matching `references/layout-guides/<state>.png`. `base-source.png` was not attached to final action rows.
- Chroma: manual green `#00FF00`; extraction reports zero chroma-adjacent pixels in every frame.
- Extraction: component-based; declared counts recovered exactly (`run` 6, `jump` 3, `hit` 2); no errors or warnings.
- Atlas: component-row atlas report passes; 1536x768 sheet with 256x256 cells and manifest-owned absolute rectangles.

## Motion verdicts

- `run`: **pass (experimental locomotion reviewed)** — six visibly distinct alternating gait phases, stable right-facing identity, consistent sword hand, clear body/tail rhythm, and a readable frame 6 → frame 1 return. No extra/missing limbs or hard identity drift observed.
- `jump`: **pass** — compact anticipation, airborne peak, and landing-ready descent read clearly as start/middle/end; non-loop behavior is appropriate.
- `hit`: **pass** — braced stance to backward recoil reads immediately; the warm red accent stays attached to the body, with no gore or detached effect.
- Independent visual QA: **PASS / HIGH confidence** from both runtime-integrity and visual-fidelity reviewers; no blocking findings.

## Runtime handoff

- Game atlas: `public/assets/sprites/player_atlas.png`.
- Game manifest: `public/assets/sprites/player.json`.
- Static fallback remains: `public/assets/sprites/player_idle.png`.
- P2 is now wired separately from this atlas: `player.json` contains idle/run/jump/hit `head`/`back` sockets, and `Player.ts` draws `attach_hat_*`/`attach_cape_*` at those points before falling back to the legacy full-body overlays.
