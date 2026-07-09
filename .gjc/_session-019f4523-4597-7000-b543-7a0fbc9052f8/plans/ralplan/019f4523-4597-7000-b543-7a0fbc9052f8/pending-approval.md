# M0 — 2D 피벗 구현 계획 (FINAL · 승인 대기 / pending approval)

> **합의**: Architect **WATCH/APPROVE** + Critic **OKAY** (stage-07-revision 기준). 리뷰 4라운드(A#1~A#8, C#1~C#6, N1~N3, MOVER 블로커, 장애물 유니온 shim) 전부 반영. 채택안 = **클린 스윕(B)**.
> **상태**: 이 계획은 **승인 전(pending approval)**. 실행 승인 전에는 제품 소스/문서 변경·커밋·실행 금지.
> 기준: `최종기획및설계서.md`(승인 후 실행 S0에서 v3.1로 갱신) + `에셋소싱.md`.

## Intent Reconciliation (사용자 확정)
- **점프/슬라이드 제거 → 순수 3줄 닷지**: 모든 위협은 **위/아래 줄 이동만으로 회피**. (사용자 선택 B.)
  - 파급: 장애물 4타입(LOW/HIGH/PIT/BLOCK)→**줄 블로커(BLOCK/MOVER)** 통합, **동시 최대 2줄 점유(안전 줄 ≥1)**, 보스 `wave`(구 점프회피)·`scream`(구 슬라이드회피)→**줄 회피형 재설계**, 튜토리얼 6→4단계, 데이터 모델 점프/슬라이드 상태 제거, config 점프/슬라이드/중력/코요테 제거.
  - **부수 효과(리뷰 이슈 소멸)**: 점프 없음 → A#6(입력 disambiguation)·A#8(jumpPeak 물리 SoT)·점프/줄이동 시각 분리(그림자)·PIT 자동 점프 보조가 **전부 불필요**.
- **화면 가로(Landscape) 우선 확정**.

---

## RALPLAN-DR 요약

### Principles
1. 컨셉 불변, 기술+조작만 전환(6월드·몬스터18·보스12·스킬4·성장·꾸미기·i18n·월드별 최고점수·튜토리얼·체크포인트 보존).
2. 단일 소스 좌표 헬퍼 — `laneY(lane)`·`worldToScreenX(worldX, scrollWorldX)`. 기준점 SoT=camera.scrollWorldX. 세로 위치=`lane` 정수(연속 Y 없음).
3. view-logic 분리 — 엔티티 `draw(ctx, sx, baseY, opts)` 프리미티브. 스프라이트 교체는 draw 내부.
4. 컴파일 그린 유지 — 각 단계 `pnpm build`+`vitest` 통과. 공유 커플링(scene/mesh/cameraCtl.camera/enemyProjHalfZ/laneX·월드 spacing/ObstacleType·obstacles.damage 구 키/**Player 수직상태 y·sliding·jumping·airborne·vy**)은 소비처 이관까지 shim/가산, 이관 완료 단계에서 fail-loud 삭제.
5. 밸런스 수치 보존(§20) — 축 회전·닷지화 외 불변.

### Decision Drivers (top 3)
- 컴파일 붕괴 최소화(THREE + 장애물 유니온 + Player 수직상태가 core+entities+Combat/Boss/Progression/HUD 전반).
- 좌표축 회전 정확성(Z→worldX, X레인→Y줄) — 기준점 SoT 확정.
- 회귀 방지(rules 순수로직 보존; walls 줄점유 P0; 안전 줄 ≥1 불변식(정적+MOVER 동적)).

### Viable Options
- (A) 점진 스트랭글러 — 부적합(서브웨이+Z↔사이드러너+X 좌표 의미 상이).
- **(B) 클린 스윕 [채택]** — 문서 동기(S0)→좌표헬퍼→렌더골격→엔티티 draw→배선→보스 줄패턴→three/구 유니온 제거. 이중 좌표계 없음, 단계 게이트+shim/가산으로 컴파일 그린.
- (C) 병행 재작성 — 과함(재사용 자산 복제 비용 초과).

---

## 전이기 shim / 가산·존치 규율 (S2 착수 전 확정)
| 항목 | 유지 이유 | 삭제 단계 |
|---|---|---|
| `Game.scene` + 엔티티 `.mesh`/`.position`(THREE) | Combat(S4)·Boss(S5) 소비 | WebGL 렌더 S2 중단, 필드 S6 |
| `cameraCtl.camera`(PerspectiveCamera stub) | HUD.floatTextWorld(HUD.ts:313) S6 의존 | S6(HUD 재시그니처와 동시) |
| `CONFIG.combat.enemyProjHalfZ`(별칭) | Combat.ts:176 | S4 |
| `laneX()` + 월드 `CONFIG.lanes.spacing`(2.0) | rules.test·Boss.ts:744 월드공간 | S5 이관→S6 삭제(fail-loud) |
| `ObstacleType`(LOW/HIGH/PIT 유니온) + `obstacles.damage` 구 키 | Obstacle.ts:92·Spawner 리터럴·Combat.ts:380·Tutorial 스폰·worlds obsLow/obsHigh/obsBlock | S1 가산(BLOCK/MOVER 추가·구 유니온/키 유지) → S4 이관 후 fail-loud 삭제 |
| **Player 수직상태 `y/sliding/jumping/airborne/vy`** | Combat(S4: p.y·airborne·tryAction('jump'))·Boss(S5: player.y@622·sliding@645)·Obstacle.hits(@73-74) 소비 | **S3 no-op 잔존(y=0/sliding=false/airborne=false) → Boss 이관(S5) 후 fail-loud 삭제** |
> S2 'three가 렌더 경로에서 사라짐'=WebGL 렌더 호출 제거. 데이터 필드는 shim 잔존(컴파일 그린).

## MOVER 동적 안전-줄 규칙
> MOVER = 줄을 옮겨다니는 이동 블로커(슬라럼). `maxBlockedLanes:2`·`pickThreatLanes`는 '스폰/선택 시점' 기준이므로 MOVER 매 프레임 점유를 별도 규정.
1. **순간 점유 산입**: MOVER 점유는 매 프레임 '현재 순간 줄' 기준으로 `maxBlockedLanes` 예산에 산입(정적과 합산).
2. **전이 히트박스(보수적)**: 레인 전이 구간에는 **출발+도착 2줄**을 위협 계산, 그 순간 **다른 위협 배치 금지** → 항상 안전 줄 ≥1.
3. **안전 줄 침범 금지**: MOVER는 마지막 남은 안전 줄로 진입 금지.
4. **검증**: integration에서 MOVER 궤적 전 구간(per-frame) 안전 줄 ≥1(동시 ≤2) 단언.

---

## 파일별 변경 계획

### 문서 (S0)
- **최종기획및설계서.md → v3.1**: §5(위/아래만)·§6(줄 블로커·P1~P8·안전 줄 ≥1·MOVER)·§9(wave/scream 줄 회피, walls 줄점유)·§13(PIT 보조 제거·자동 회피 보조)·§14(4단계)·§19·§20·§21·§26 갱신.
- **에셋소싱.md**: 플레이어 애니메이션 점프/슬라이드 프레임 제거, 장애물=줄 블로커(BLOCK/MOVER) 표기.

### src/data
- **config.ts**: `laneY`/`worldToScreenX(worldX, scrollWorldX)` 신설. `render`(logical960×540/ppu24/anchorX0.24/trackCenterY0.60/laneSpacingPx96/pixelRatioMax2). `run`={speedStart12,speedMax24,accel0.5,hitInvuln0.5}. `combat.enemyProjHalfY` 추가+`enemyProjHalfZ` 별칭(S4). `obstacles.damage`에 BLOCK/MOVER **가산**(구 키 S4까지)+`maxBlockedLanes:2`. `PatternId` P1~P8 축소+램프 풀 P9/P10 제거. `accessibility.coyoteTime`·`player.jumpBonusPerLevel` 제거. 월드 `lanes.spacing`·`laneX()` S5까지 존치. `tutorial.steps`=['run','lane','autofire','skill']. 밸런스 그 외 불변.
- **worlds.ts**: 데이터 보존. `BossDef.visual`→2D draw. wave/scream 줄 회피 재해석, 수치 불변. `WorldTheme.obsLow/obsHigh/obsBlock`→S4 BLOCK/MOVER 색 스킴(applyObstacleTheme 동반).
- **i18n.ts**: 조작 힌트(위/아래), `tut.jump`/`tut.slide` 삭제. 키 구조 불변.

### src/core
- **Renderer.ts (신설)**: Canvas 2D. 리사이즈(DPR≤2, 960×540 letterbox)·clear·레이어(원경→근경→3줄 트랙→그림자(선택)→줄 역순 엔티티→이펙트)·worldToScreenX(_,camera.scrollWorldX)/laneY. resize/begin/drawWorld/end.
- **Camera.ts**: scrollWorldX lerp+셰이크. follow=player.worldX(즉시), boss/title/셰이크 lerp. camera(PerspectiveCamera) shim S6. THREE S6.
- **Environment.ts**: 패럴럭스+3줄 트랙. S2 전면 재작성(lanes.spacing/2 소비 소멸). THREE S2/S6.
- **Game.ts**: THREE import S6. S2 WebGL 렌더→Renderer+Camera(scroll)(scene/mesh shim). 루프·상태머신·체크포인트·저장/해금 불변. visibilitychange 자동 pause. 스폰/충돌 worldX/lane.
- **Input.ts**: 위/아래 줄 이동만(+스킬·pause). `Action` up/down. 점프/슬라이드 입력·홀드·스와이프 길이 제거. 버퍼·큐 보존.
- **Tutorial.ts (S1)**: 4단계. `switch case 'jump'/'slide'`·`p.y`/`p.sliding`·`spawnObstacle('LOW'/'HIGH')` 제거를 config.steps와 동일 S1에서(TS2678 방지). 2단계=줄 이동 회피.
- **rules.ts / rules.test.ts**: 순수 로직 보존. `pickThreatLanes` 안전줄 ≥1(+MOVER 전이 산입). rules.test laneX(L4/L92-98)→laneY/worldToScreenX 교체 S6 동기.

### src/entities (THREE 제거는 소비처 단계; z→worldX, lane 정수; `draw(ctx,sx,baseY,opts)`)
- **Player.ts**: 캡슐+얼굴+그림자(선택). 달리기/줄이동(laneMoveTimer)/피격/사망. 수직상태 필드 `jumping/sliding/vy/y/slideTimer/jumpVelocity()/coyote`는 **S3 no-op shim → S5 이관 후 삭제**(위 shim 표). laneMoveTimer·invulnTimer 추가.
- **Monster.ts**: 18종 도형+빨간눈+흔들림. 직진형=자기 줄 좌측, 위빙형=인접 줄 상하, 탱커=느린 접근.
- **Boss.ts (S5)**: 패턴 축/줄 전환. 투사체 -worldX·대상 줄. **wave=줄 순차 덮기**·**scream=봉인+대상 줄 음파**·**walls=`player.lane===w.lane` 줄점유(벽당 1회 hitDone)**. chase/rush=예고 줄 회피. player.y/sliding 소비처 이관. 경직/페이즈/체력바 보존. buildBody 2D, scene.add 제거.
- **Obstacle.ts**: 줄 블로커(kind BLOCK/MOVER). S1 유니온 가산, S3 draw는 kind, S4 구 유니온·damage 구 키·Obstacle.ts:92 인덱싱·hits() 정리. MOVER §규칙.
- **Pickup/Projectile.ts**: 2D 도형(픽업 coin/gem/heal.webp drawImage 옵션). 탄 ±worldX.

### src/systems
- **Combat.ts (S4 THREE 제거)**: 자동사격=우측 전방 같은 줄 우선. 명중=worldX 근접+줄. 적 탄=enemyProjHalfX+enemyProjHalfY. blast 링 FX→ctx. **Combat.ts:380 PIT auto-jump 제거**→자동 회피=안전 줄/대시. p.y/airborne 소비 정리. 스킬 4종 보존.
- **Spawner.ts (S4)**: spawnAhead/despawnBehind. P1~P8·maxBlockedLanes2·안전 줄 ≥1(MOVER 동적). P9/P10 케이스 제거(S1 정합). pickThreatLanes 재사용.
- **Progression.ts (S6)**: THREE.Vector3 제거→worldX/lane. levelUp 불변.
- **Inventory/Cosmetics/Sound**: 로직 불변. Cosmetics 2D draw. Sound: 줄이동/자동사격/피격/BGM(run·boss) 전수 배선(점프/슬라이드 제거).
- **Models.ts**: 삭제(S6 grep).

### src/ui / 루트
- **HUD.ts (S6)**: DOM 유지. floatTextWorld→(worldX,lane)+worldToScreenX/laneY 재시그니처+cameraCtl.camera stub 삭제. REWARD HUD 숨김. 가로 세이프존.
- **Screens.ts/icons.ts**: 기존 WebP 35 재사용, 불변.
- **main.ts(S6)**: `<canvas>`+Renderer. **package.json(S6)**: three·@types/three 제거. **index.html**: 캔버스+favicon. **style.css**: 가로 letterbox. **public/assets/models/**: 삭제.

---

## 작업 순서 (위상 정렬 · 각 단계 pnpm build + vitest 그린)
- **S0 문서 동기** — 최종기획및설계서.md→v3.1 + 에셋소싱.md. *exit*: 문서 정합.
- **S1 좌표·config·타입** — laneY/worldToScreenX/render(laneSpacingPx96)/run 정리/obstacles(BLOCK·MOVER 가산·maxBlockedLanes2·PatternId P1~P8+램프 P9/P10 제거)/tutorial 4단계+Tutorial.ts switch·p.y·p.sliding·LOW/HIGH 스폰 제거/enemyProjHalfY(Z 별칭). ObstacleType BLOCK/MOVER 가산. 월드 spacing·laneX 존치. *exit*: `pnpm build`+`vitest` 그린, P9/P10 잔여 0.
- **S2 렌더 골격** — Renderer/Camera(scrollWorldX; camera stub)/main 캔버스. Game WebGL→Renderer(scene/mesh shim). Environment 재작성. *exit*: 3줄 트랙+우측 달리는 플레이어 사각형 실행, tsc 그린, 좌표 기준점 검증.
- **S3 엔티티 draw** — Player(줄이동·수직상태 no-op shim)/Obstacle(kind)/Pickup/Projectile/Monster THREE→draw. z→worldX, lane 정수. *exit*: tsc 그린 + 각 엔티티 표시 + 줄 이동 확인.
- **S4 러닝 닷지 + Combat/장애물 정리** — 스폰(P1~P8·안전 줄·MOVER)·입력(위/아래)·Combat(자동사격·충돌·blast FX ctx·enemyProjHalfY·Z 삭제·PIT auto 제거·자동 회피)·픽업·성장 + 구 ObstacleType/damage 구 키/worlds theme fail-loud 정리. *exit*: RUNNING_1 줄 회피·처치·수집·레벨업, 안전 줄 보장(MOVER 포함), Combat THREE 0, 구 장애물 유니온 참조 0.
- **S5 보스 줄 패턴** — Boss 9종 축/줄 + walls 줄점유·wave 줄 순차·scream 줄 회피, 아레나, 스킬 4종, 경직/페이즈, Boss scene.add·player.y/sliding·월드 spacing/laneX 소비처 이관. *exit*: 1월드 보스 정상, walls 데미지(P0), wave/scream 줄 회피, Boss THREE 0, 월드 spacing/player 수직상태 직접읽기 0.
- **S6 마감·제거** — HUD 재시그니처+camera stub 삭제, Progression Vector3 제거, main/package.json three 제거, Models.ts·models/ 삭제, laneX·월드 spacing·Player 수직상태 shim 삭제(fail-loud), rules.test laneX→laneY, Environment 폴리시, visibilitychange, Sound 전수 배선, scene/mesh/enemyProjHalfZ shim 삭제. *exit*: `grep -r "three"` import 0건, `pnpm build`+`vitest` 그린.
- **S7 검증** — tsc+vitest, 1월드 풀 사이클 수동 e2e, fps/드로우콜, §21 각 항목 pass 기록. *exit*: §21 전항 pass(실기기 프레임레이트만 유예).

---

## 위험 / 롤백
- three/구 유니온/Player 수직상태 제거 붕괴 → shim/가산 규율 + 소비처 이관 후 fail-loud + 단계별 커밋.
- 안전 줄 미보장(3줄 동시, 정적+MOVER) → maxBlockedLanes 2 하드 가드 + §MOVER + per-frame integration.
- 보스 패턴 축/줄 회귀 → 안전 줄 표 고정 + walls/wave/scream 수동검증 + integration.
- 밸런스 체감 → 수치 불변, QA 후 조정.

## 프리모템 (deliberate · 3 시나리오)
1. 화면 텅 빔/어긋남 — 기준점 불일치. 방지: SoT=camera.scrollWorldX + S2 좌표 검증.
2. walls 무데미지 — 줄점유 미적용. 방지: integration '같은 줄 1회 데미지'(P0 가드).
3. 회피 불가(3줄 봉쇄) — 정적/MOVER 조합. 방지: maxBlockedLanes 2 + §MOVER + per-frame integration.

## 확장 테스트 계획
- **unit(vitest, rules.ts)**: 스킬 해금(연사3/회복5), 점수 공식, pickThreatLanes 안전줄 ≥1, 보스 페이즈 인덱스, 레거시 최고점수 이관. rules.test laneX→laneY(S6).
- **integration**: P1~P8 안전 줄(동시 ≤2), **MOVER per-frame 안전 줄 ≥1**, **walls 1회 데미지(P0)**, wave/scream 안전 줄, 충돌 축.
- **e2e(수동)**: 1월드 전체 사이클 + 줄이동 회피/자동사격/스킬/부활.
- **observability**: fps·드로우콜, visibilitychange pause, 장시간 세션.

## 수용 기준 매핑 (설계서 §21)
- 문서 v3.1 → S0 · three 제거·Canvas 2D → S2,S6 · 우측 달리기·좌측 스크롤 → S2,S4 · 위/아래 3줄 회피·안전 줄 ≥1 → S1,S3,S4
- 전체 사이클·6월드·해금 → S4,S5,S7 · 타이틀 6버튼+잠금 → S4/S7 · 자동사격+스킬(2+2) → S4,S5
- 몬스터18·보스12 → S3,S5 · walls(P0)·wave/scream 줄 회피 → S5+integration · 성장/픽업/점수 → S4 · 보상 외형/영속 → S5,S6
- 장애물 P1~P8·안전 줄(정적+MOVER per-frame) → S4+integration · 4단계 튜토리얼(구조 S1/행위 S4~S5) · 자동스킬+자동 회피 → S4,S5 · 보스 약점 → S5
- 체크포인트 부활 → S4 · i18n → S1 · 월드별 최고점수 → S4 · 스테이지 인트로·visibilitychange → S2,S6
- 사운드 전수 배선 → S6 · HUD → S2,S6 · 기존 WebP 35 재사용 → 전 단계 유지 · 실기기 프레임레이트 → S7(QA 유예)

---

## ADR (Architecture Decision Record)
- **Decision**: Three.js 2.5D 서브웨이서퍼 → HTML5 Canvas 2D **우측 사이드스크롤 · 순수 3줄 닷지** 러너로 클린 스윕 전환. 게임 컨셉/시스템 보존.
- **Drivers**: 컴파일 붕괴 최소화, 좌표축 회전 정확성, 회귀 방지(P0 walls·안전 줄 불변식), 6~12세 조작 단순화.
- **Alternatives considered**: (A) 점진 스트랭글러 — 좌표 의미 상이로 부적합. (C) 병행 재작성 — 재사용 자산 복제 과함. 점프/슬라이드 유지안 — 사용자가 순수 닷지 선택으로 기각.
- **Why chosen**: 이중 좌표계 없이 목표 구조 직행 + 단계 게이트/shim/가산으로 컴파일 그린 + 닷지화로 조작·시각·리뷰 복잡도 동시 감소.
- **Consequences**: 렌더러 신설·three 제거, 엔티티 draw 이식, 장애물 유니온 재편(BLOCK/MOVER)+MOVER 동적 규칙, Player 수직상태 제거, 보스 패턴 줄 회피 재설계, 튜토리얼/문서 갱신. 단기 시각 미완(도형)은 M2~ 스프라이트로 해소.
- **Follow-ups**: M1 밸런스/테스트 마감, M2~ 스프라이트 교체, 실기기 프레임레이트 QA(S7 유예).
