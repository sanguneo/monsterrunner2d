# Stage-1 boss visual follow-up (2026-07-13)

## Decision

The original `boss_ghostTeacher.png` and `boss_ghostGirl.png` had a flatter, more vector-like finish than the painterly player/mob set, and their runtime silhouettes read too small. The v2 candidates were rejected because they preserved that tone.

## Accepted assets

| Asset | Source run | Runtime contract | Result |
|---|---|---|---|
| `boss_ghostTeacher_atlas.png` | `boss_ghostTeacher_v3` | `idle`, 3 frames, 6 fps | accepted |
| `boss_ghostGirl_atlas.png` | `boss_ghostGirl_v4` | `idle`, 3 frames, 6 fps | accepted |

Both rows use the player anchor and were verified through extraction, atlas composition, transparent-bound inspection, preview, and scoring (`overall_score: 100.0`). The original static PNGs remain available as fallback source art.

## Runtime size correction

`src/entities/Boss.ts` now uses a `1.28` height multiplier for the two stage-1 bosses and `1.18` for later bosses, applied to the collision-derived visual bounds. This keeps the stage-1 silhouettes prominent while giving the other bosses a smaller normalization bump.

## Remaining review scope

The other 10 bosses still use their static fallback art until their own component-row runs are generated. They should be reviewed against the same player-anchor tone and size tiers when P4 expansion resumes.
