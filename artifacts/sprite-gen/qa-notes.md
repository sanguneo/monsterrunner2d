# sprite-gen 후속 QA (2026-07-13)

## 범위

- P2: `player.json` run/jump/hit sockets + `attach_cape_*` 2종 + `attach_hat_*` 4종.
- P3 전체 18종: 기존 대표 9종과 `mob_sea_pufferfish`, `mob_sea_sharkFin`, `mob_sea_jellyfish`, `mob_dracula_ghoul`, `mob_dracula_wolf`, `mob_dracula_bat`, `mob_skull_boneGolem`, `mob_skull_skeletonSoldier`, `mob_skull_skullBird`.
- P4 stage-1 대표: `boss_ghostTeacher_v3`, `boss_ghostGirl_v4`.
- v2 candidates were rejected because they retained the old flat/vector tone. The accepted rows use the player anchor and are copied to the runtime boss atlases.
- The six earlier P3 rows and nine final P3 rows were generated from the same sprite-gen prompt and layout-guide contracts through built-in imagegen after the local codex provider subprocess returned Windows `WinError 5`; no local drawing or fixed-grid reconstruction was used. Three targeted edge-pixel corrections were completed after OAuth re-authentication.

## 파이프라인 결과

기존 대표 5개 run은 `prepare_sprite_run.py` → Codex `generate_sprite_image.py` →
`extract_sprite_row_frames.py` → `compose_sprite_atlas.py` 순서로 실행했다. 신규 P3 15개 run은 같은 request/layout/row 계약을 built-in imagegen으로 생성한 뒤 동일한 추출·합성·inspect·score 파이프라인을 적용했다.
모든 canonical run에서 `inspect_sprite_run.py`와 `score_sprite_run.py`가 `ok: true`, `overall_score: 100.0`을 반환했고, 보정 3종도 `edge_pixels: 0`으로 확정했다.

| run | state | frames | fps | inspect | score |
|---|---|---:|---:|---|---:|
| mob_school_bookGhost | walk | 4 | 9 | pass | 100 |
| mob_zombie_zombieDog | walk | 4 | 9 | pass | 100 |
| mob_lab_drone_v2 | walk | 4 | 9 | pass | 100 (edge correction) |
| mob_school_paperGhost | walk | 4 | 9 | pass | 100 |
| mob_zombie_crow | walk | 4 | 9 | pass | 100 |
| mob_lab_sparkBot | walk | 4 | 9 | pass | 100 |
| mob_school_pencilGhost_v4 | walk | 4 | 9 | pass | 100 (v4 safe-edge correction) |
| mob_zombie_zombie | walk | 4 | 9 | pass | 100 |
| mob_lab_wireGolem | walk | 4 | 9 | pass | 100 |
| mob_sea_pufferfish | walk | 4 | 9 | pass | 100 |
| mob_sea_sharkFin | walk | 4 | 9 | pass | 100 (motion correction) |
| mob_sea_jellyfish | walk | 4 | 9 | pass | 100 |
| mob_dracula_ghoul | walk | 4 | 9 | pass | 100 |
| mob_dracula_wolf_v3 | walk | 4 | 9 | pass | 100 (edge correction) |
| mob_dracula_bat | walk | 4 | 9 | pass | 100 |
| mob_skull_boneGolem | walk | 4 | 9 | pass | 100 |
| mob_skull_skeletonSoldier | walk | 4 | 9 | pass | 100 |
| mob_skull_skullBird_v2 | walk | 4 | 9 | pass | 100 (edge correction) |
| boss_ghostTeacher_v3 | idle | 3 | 6 | pass | 100 |
| boss_ghostGirl_v4 | idle | 3 | 6 | pass | 100 |

## 런타임 확인

- 아틀라스 이름은 모두 `<group>_atlas.png`이며 정적 `<group>.png`와 충돌하지 않는다.
- `mob_school_pencilGhost`는 v4 `walk` 0번 프레임을 정적 `mob_school_pencilGhost.png` 폴백으로 승격해 애니메이션·폴백 외형을 일치시켰다.
- stage-1 보스도 v3/v4 `idle` 0번 프레임을 정적 폴백으로 승격해 보스 아틀라스·정적 PNG·base-source 외형과 크기를 일치시켰다.
- `mob_school_pencilGhost_v3`와 `_v5`는 정체성/스타일 또는 안전 여백 보정 후보로만 남겼으며 런타임에 배포하지 않았다. 최종본은 `_v4`다.
- 매니페스트의 `game_input`/`degraded_static_fallback`/`animation`/`frame_layout` 원본은 각 run 폴더에 보존했다.
- `player.json` 소켓 배열 길이는 idle 1 / run 6 / jump 3 / hit 2로 프레임 수와 일치한다.
- Vite dev server에서 대표 JSON·PNG 및 `attach_hat_zombie.png` HTTP 200 확인.
- `Player.ts`는 `animFrameAt`로 현재 프레임을 먼저 계산해 망토(소켓/색상 폴백) → 몸 → 모자 순서를 보장하며, `Game.ts`는 월드 시작 시 애니 매니페스트도 preload한다.
- `pnpm test` 32/32, `pnpm build`, `pnpm lint` 통과.

## 잔여

몹 18종은 동일 SSoT와 매니페스트 변환 규칙으로 QA를 완료했다. 나머지 10종 보스는 아직 정적 폴백 경로를 유지한다.

부착물 6종은 기존 검증 완료된 소형 RGBA 원본(`cape_*`/`hat_*`)을 `attach_*` 런타임 명칭으로 보존한 carry-forward 자산이며, 별도 component-row 재생성은 하지 않았다.

## 코딩에이전트 최종 통합 검증 (2026-07-13)

- 최종 아틀라스 21개(몹 18 + 보스 stage-1 2 + 플레이어 1) 드롭인 상태에서 게임 코드 연동을 실측했다.
- 매니페스트 `image` 참조/정적 폴백 존재 여부와 아틀라스 픽셀 크기 대 프레임 레이아웃 포함 여부를 전수 검사 → problems=0.
- Edge 헤드리스 런타임에서 플레이어 애니 렌더·env 패럴럭스·장애물·픽업·몹 스폰/접촉피해·보스(ghostTeacher) 생성/상태진행을 확인했다.
- `tsc` 클린 · vitest 32/32 · eslint 클린 · `vite build`(106KB) 통과.
