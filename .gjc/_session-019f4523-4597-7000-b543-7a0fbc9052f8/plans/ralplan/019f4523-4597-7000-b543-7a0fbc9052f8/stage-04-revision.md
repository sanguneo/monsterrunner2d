# M0 — 2D 피벗 구현 계획 (Revision 3 · Architect N1/N2/N3 + Critic 폴리시 반영)

> 기준: `최종기획및설계서.md` v3.0 + `에셋소싱.md` v3.0. stage-02-planner 대체. 채택안 = **클린 스윕(B)**. 1차(A#1~A#8, C#1~C#6)·2차(N1/N2/N3) 리뷰 전부 반영.

## 개정 로그 (v2 → v3)
- **[N1]** shim 표에 **`cameraCtl.camera`(PerspectiveCamera stub)** 추가 — HUD.floatTextWorld(HUD.ts:313 `project()`)가 S6까지 의존하므로 **S6에서 HUD.floatTextWorld 재시그니처와 함께 stub 삭제**(caller 무변경으로 S2~S5 컴파일 그린 유지).
- **[N2]** `laneSpacingPx`는 **S1에서 가산(additive) 화면상수**로 도입(`render` 블록에 위치). 월드 `lanes.spacing`(2.0)은 **월드공간 소비처(laneX shim, Boss.ts:744 walls 판정, rules.test.ts) 이관 완료(S5)까지 존치**. "개명=fail-loud(월드단위 직접읽기 0)"는 **S6에서** 적용(월드 spacing·laneX 동시 제거). → S1 컴파일/테스트 그린 + walls 월드의미 무붕괴 동시 달성.
- **[N3]** wave 세로폭 = **`2*laneSpacingPx + 엔티티폭`(가장자리 커버)**. `Environment.ts:32`(`lanes.spacing/2`) 소비처는 **S2 전면 재작성으로 소멸**로 명기(소비처 목록 정합).
- **[C-폴리시]** walls 변경 기술을 **`player.lane===w.lane` 줄점유 판정**으로 재기술(현행은 z-거리가 아니라 `Math.abs(player.x−laneX(w.lane))<0.85` x/레인-근접 — 표현 정정, 대상줄·hitDone 의도는 동일). Camera.ts/Environment.ts THREE import 제거를 인벤토리에 명시(S2 재작성+S6 grep 게이트).

## 개정 로그 (v1 → v2, 유지)
- [A#1] enemyProjHalfY 추가 + enemyProjHalfZ S4까지 별칭 후 삭제. [A#2] shim 규율 확장. [A#3/C#5] THREE 잔존 모듈 단계 귀속(Combat→S4, Boss→S5, HUD/Progression/main/package→S6). [A#4] worldToScreenX 기준점=camera.scrollWorldX 단일화. [A#5] laneSpacingPx 개명(→v3에서 가산+존치로 정정). [A#6] 입력 disambiguation 규칙표+Action up/down. [A#7/C#1] Models.ts 삭제+rules.test laneX 동기. [A#8] jumpPeak 물리 파생. [C#2/C#3] S3/S7 exit 구체화. [C#4] §21 6버튼 매핑. [C#6] pickThreatLanes 표기.

---

## RALPLAN-DR 요약

### Principles
1. 컨셉 불변, 기술만 전환(6월드·몬스터18·보스12·스킬4·성장·꾸미기·i18n·월드별 최고점수·튜토리얼·체크포인트 로직 보존).
2. 단일 소스 좌표 헬퍼 — 화면 좌표는 `laneY(lane)`·`worldToScreenX(worldX, scrollWorldX)`로만. **기준점 SoT = camera.scrollWorldX**.
3. view-logic 분리 — 엔티티 `draw(ctx, sx, baseY, opts)` 프리미티브. 스프라이트 교체는 draw 내부.
4. 컴파일 그린 유지 — 각 단계 종료 시 `pnpm build`+`vitest` 통과. **공유 커플링(scene/mesh/cameraCtl.camera/enemyProjHalfZ/laneX/월드 lanes.spacing)은 소비처 이관 완료까지 shim/존치**, 최종 제거 S6.
5. 밸런스 수치 보존(§20) — 축 회전 외 불변.

### Decision Drivers (top 3)
- 컴파일 붕괴 최소화(THREE가 core+entities+Combat/Progression/HUD 전반).
- 좌표축 회전 정확성(Z→worldX, X레인→Y줄, 점프Y→hopY) — 기준점 SoT 확정이 관건.
- 회귀 방지(rules 순수로직 보존; 보스 walls 줄점유로 P0 동시 해소).

### Viable Options
- (A) 점진 스트랭글러 — **부적합**(서브웨이+Z↔사이드러너+X 좌표 의미 상이, 어댑터 이득 없음, 이중 좌표계 복잡도만↑).
- **(B) 클린 스윕 [채택]** — 좌표헬퍼→렌더골격→엔티티 draw→배선→보스축→three 제거. 이중 좌표계 없음, 목표 구조 직행. 중간 시각 미완은 단계 게이트+shim 규율로 통제.
- (C) 병행 재작성 — **과함**(재사용 자산 복제 비용 초과).

---

## 전이기 shim / 존치 규율 (S2 착수 전 확정)
S2~S5 동안 아래 3D/월드 커플링을 유지, 소비처 이관 완료 단계에서 삭제:
| 항목 | 유지 이유 | 이관/삭제 단계 |
|---|---|---|
| `Game.scene` + 엔티티 `.mesh`/`.position`(THREE) | Combat(S4)·Boss(S5) 소비 | WebGL 렌더는 S2 중단, 필드/타입 S6 삭제 |
| **`cameraCtl.camera`(PerspectiveCamera stub)** | HUD.floatTextWorld(HUD.ts:313 project) S6까지 의존 | **S6** — HUD.floatTextWorld 재시그니처와 동시 삭제 |
| `CONFIG.combat.enemyProjHalfZ`(별칭) | Combat.ts:176 소비 | S4에서 enemyProjHalfY 이관 후 삭제 |
| `laneX()` + 월드 `CONFIG.lanes.spacing`(2.0) | rules.test.ts·Boss.ts:744 walls 등 월드공간 소비 | S5 소비처 이관 완료 → **S6 동시 삭제**(이때 fail-loud) |
> S2 'three가 Game/main 렌더 경로에서 사라짐' = **WebGL 렌더 호출 제거**. scene/mesh/cameraCtl.camera 데이터 필드는 shim 잔존(컴파일 그린 유지).

---

## 파일별 변경 계획

### src/data
- **config.ts**: `laneY(lane)` + `worldToScreenX(worldX, scrollWorldX)`(기준점=scrollWorldX) 신설. `render` 블록 신설(logicalWidth960/logicalHeight540/ppu24/playerAnchorX0.24/trackCenterY0.60/pixelRatioMax2, **`laneSpacingPx:96` 여기 배치**). `run.jumpPeak`((gravity,airTime) 파생, 주석). `combat.enemyProjHalfY` 추가 + `enemyProjHalfZ` 별칭(S4 삭제). **월드 `lanes.spacing`(2.0)·`laneX()`는 S5까지 존치**(S6 삭제). 밸런스 그 외 불변.
- **worlds.ts**: 데이터 보존. `BossDef.visual`→2D draw 파라미터 재해석(필드 유지). 패턴 수치 불변.
- **i18n.ts**: 조작 힌트 문구만(좌우→위아래, 탭=점프). 키 구조 불변.

### src/core
- **Renderer.ts (신설)**: Canvas 2D. 리사이즈(DPR≤2, 논리 960×540 letterbox), clear, 레이어 draw(원경→근경→3줄 트랙→그림자→줄 역순 엔티티→이펙트), `worldToScreenX(_, camera.scrollWorldX)`/`laneY` 사용, 셰이크. 인터페이스 resize/begin/drawWorld/end.
- **Camera.ts**: PerspectiveCamera 렌더용도 → `scrollWorldX` lerp + 셰이크. 모드 title/follow/boss. **follow: scrollWorldX=player.worldX(즉시)**; boss/title/셰이크만 lerp. **`camera`(PerspectiveCamera) 필드는 shim으로 S6까지 잔존**(HUD 의존). THREE import는 S6 제거(grep 게이트).
- **Environment.ts**: 3D 세그먼트 → 패럴럭스+3줄 트랙. 테마색, 수평 무한 스크롤. **S2 전면 재작성**(기존 `lanes.spacing/2` 소비 자연 소멸). THREE import S2/S6 제거.
- **Game.ts**: `import * as THREE` 제거 S6. S2에서 WebGL 렌더 경로→Renderer+Camera(scroll)(scene/mesh 필드 shim). 고정 타임스텝 루프·상태머신·체크포인트·저장/해금 불변. 신규 visibilitychange→hidden 자동 pause. 스폰/충돌 좌표 worldX/lane 이관.
- **Input.ts**: `Action` left/right→up/down 개명. disambiguation 규칙(§입력). 버퍼·코요테·큐 보존.
- **Tutorial.ts**: 6단계 보존, 2·3단계 문구/대상 줄만.
- **rules.ts / rules.test.ts**: 순수 로직 보존. **rules.test.ts laneX import(L4)·describe(L92-98) → laneY/worldToScreenX 검증 교체를 S6(laneX/월드 spacing 삭제)와 동기**. `pickThreatLanes`(rules.ts:51) 안전줄 ≥1 테스트 확장(Boss.pickLanes L501은 래퍼).

### src/entities (공통: THREE 제거는 소비처 이관 단계; z→worldX, lane(Y줄), y→hopY; `draw(ctx,sx,baseY,opts)`)
- **Player.ts**: 캡슐+얼굴+**그림자(줄 기준선 고정)**. 달리기/점프(hopY: gravity-25·airtime0.7)/슬라이드(히트박스 축소). 꾸미기 부착.
- **Monster.ts**: 18종 도형+빨간눈+흔들림. 직진형=자기 줄 좌측, 위빙형=인접 줄 상하, 탱커=느린 접근.
- **Boss.ts**: 패턴 축 전환. 투사체 -worldX·대상 줄. **wave 전 줄 바닥 좌측 쓸기(세로폭 = 2*laneSpacingPx + 엔티티폭)**. **walls: `player.lane===w.lane` 줄점유 판정**(같은 줄 시 벽당 1회 hitDone; 현행 x/레인-근접 `Math.abs(player.x−laneX(w.lane))<0.85`(Boss.ts:744)를 줄 인덱스 일치로 교체 → P0 해소). chase 줄 추적→락→강타. rush 돌진. scream 봉인→슬라이드. 경직/페이즈/체력바 보존. `buildBody` 3D→2D, scene.add 제거 S5.
- **Obstacle/Pickup/Projectile.ts**: 2D 도형(픽업 coin/gem/heal.webp drawImage 옵션). 탄 축 ±worldX.

### src/systems
- **Combat.ts (S4 THREE 제거)**: 자동사격=우측 전방(worldX+fireRange) 같은 줄 우선 최근접. 명중=worldX 근접+줄 일치. 적 탄 vs 플레이어=enemyProjHalfX+enemyProjHalfY+점프/슬라이드 회피. **blast 링 FX(ringGeo/ringMat Combat.ts:19-20,419, scene.remove)→ctx draw**. 자동회피 위협스캔(현 z-거리)→worldX. m.position/boss.position→worldX/lane. floatTextWorld 호출 인자는 S6 재시그니처 시 갱신(그 전엔 shim camera로 무변경). 스킬 4종 보존.
- **Spawner.ts**: spawnAhead(worldX+45), despawnBehind(worldX-14). P1~P10 줄 재배치, 안전경로·동시위협4 보존. pickThreatLanes 재사용.
- **Progression.ts (S6)**: `new THREE.Vector3`(L34) 제거→worldX/lane. levelUp 불변.
- **Inventory/Cosmetics/Sound**: 로직 불변. Cosmetics 2D draw. **Sound: 점프/슬라이드/줄이동/BGM(run·boss) 전수 배선**(v2.0 P2 재발 방지).
- **Models.ts**: 고아 3D 빌더 → 삭제(S6 grep 게이트).

### src/ui (DOM 오버레이 유지)
- **HUD.ts (S6)**: DOM/CSS 유지. **`floatTextWorld`(HUD.ts:313 `projVec.project(cameraCtl.camera)`) → (worldX,lane,hopY)+worldToScreenX/laneY 재시그니처, 전 호출부 갱신, cameraCtl.camera stub 동시 삭제**. REWARD 진입 시 HUD 숨김(v2.0 P1). 가로 세이프존.
- **Screens.ts/icons.ts**: 기존 아이콘22+이미지13 WebP 재사용, 불변.

### 루트
- **main.ts (S6)**: three 부트스트랩 제거 → `<canvas>`+Renderer.
- **package.json (S6)**: `three`·`@types/three` 제거.
- **index.html**: 단일 캔버스, favicon 1줄. **style.css**: 가로 letterbox·세이프존.
- **public/assets/models/**: 삭제.

---

## 입력 disambiguation 규칙
| 입력 | 키보드 | 터치 | 판정 |
|---|---|---|---|
| 줄 위/아래 | ↑/↓ (W/S) keydown 즉시 | 수직 스와이프 | keydown 즉시 줄 이동(우선) |
| 점프 | Space/K | 탭(짧은 터치) | hopY 물리 |
| 슬라이드 | J(전용, 기본) 또는 ↓ 홀드(임계 0.12s) | 아래 홀드 | 홀드 임계 초과 시 슬라이드; 미만이면 줄내림 |
- '짧은 위 스와이프=점프' 오버로드 제거(탭=점프 단일화).

---

## 작업 순서 (위상 정렬 · 각 단계 pnpm build + vitest 그린)
- **S1 좌표·config 기반** — laneY/worldToScreenX(scrollWorldX)/render(+laneSpacingPx96)/jumpPeak 추가, enemyProjHalfY 추가(Z 별칭 유지). **월드 lanes.spacing(2.0)·laneX·laneSpacingPx 병존(가산)**. *exit*: `pnpm build`+`vitest` 그린(월드 소비처·rules.test 무붕괴).
- **S2 렌더 골격** — Renderer.ts·Camera(scrollWorldX; camera stub 잔존)·main 캔버스. Game WebGL 렌더→Renderer(scene/mesh shim). Environment 전면 재작성(3줄+패럴럭스). *exit*: 3줄 트랙+우측 달리는 플레이어 사각형 실행, tsc 그린, **좌표 기준점 검증(플레이어 anchorX 고정·월드 정렬)**.
- **S3 엔티티 draw 이식** — Player/Obstacle/Pickup/Projectile/Monster THREE→draw(ctx). z→worldX,y→hopY. 그림자/점프/슬라이드 시각. laneY 사용(laneX shim 잔존). *exit*: tsc 그린 + 각 엔티티 타입 화면 표시 + worldX/hopY/그림자 수동 확인.
- **S4 러닝 플레이 + Combat THREE 제거** — 스폰·입력(up/down/점프/슬라이드 규칙)·Combat(자동사격·충돌 축·blast FX ctx·enemyProjHalfY 이관·Z 삭제·위협스캔 이관)·픽업·성장. *exit*: RUNNING_1 회피·처치·수집·레벨업 동작, 안전경로 보장, Combat THREE import 0.
- **S5 보스·스킬 축 전환** — Boss 패턴 9종 축 회전 + **walls 줄점유(lane 일치)**, wave 폭, 아레나(스크롤 정지), 스킬 4종, 경직/페이즈, Boss scene.add 제거. Boss 월드 spacing/laneX 소비처 이관. *exit*: 1월드 중간·최종보스 정상, **walls 데미지 발생(P0 가드)**, Boss THREE import 0, 월드단위 spacing 직접읽기 0.
- **S6 마감·3D 제거** — HUD.floatTextWorld 재시그니처+cameraCtl.camera stub 삭제+호출부, Progression Vector3 제거, main/package.json three 제거, Models.ts·models/ 삭제, laneX·월드 lanes.spacing 삭제(→laneSpacingPx fail-loud), rules.test.ts laneX→laneY 교체, Environment 폴리시, visibilitychange, Sound 전수 배선, scene/mesh/enemyProjHalfZ shim 삭제. *exit*: `grep -r "three"` import 0건, `pnpm build`+`vitest` 그린.
- **S7 검증** — tsc+vitest, 1월드 풀 사이클 수동 e2e, fps/드로우콜, §21 24항 각각 pass 기록. *exit*: §21 전항 pass(실기기 프레임레이트만 유예).

---

## 위험 / 롤백
- three 제거 붕괴 → shim/존치 규율 + S6 최종 제거 + 단계별 커밋.
- 점프↔줄이동 혼동 → laneSpacingPx96>점프px(~37) + 기준선 그림자.
- 보스 패턴 축 회귀 → 회피축 표 고정 + walls/wave/scream 우선 수동검증 + integration 가드.
- 밸런스 체감 → 수치 불변, QA 후 조정.
- 입력 오발 → disambiguation 규칙표 + 전용 슬라이드키.

## 프리모템 (deliberate · 3 시나리오)
1. **화면 텅 빔/어긋남** — worldToScreenX 기준점 불일치. 방지: 기준점 SoT=camera.scrollWorldX + S2 좌표 검증 게이트.
2. **walls 또 무데미지** — 줄점유 미적용/hitDone 조기소진. 방지: integration '같은 줄 시 정확히 1회 데미지' 단언(P0 가드).
3. **방치 시 즉사** — 자동대시 줄회피 안함+PIT. 방지: PIT 자동 점프 보조 축 이관 확인(검토의견 §4-1).

## 확장 테스트 계획
- **unit(vitest, rules.ts)**: 스킬 해금(연사3/회복5), 점수 공식, pickThreatLanes 안전줄 ≥1, 보스 페이즈 인덱스, 레거시 최고점수 이관. **rules.test laneX 블록→laneY/worldToScreenX(S6 동기)**.
- **integration**: P1~P10 안전경로 존재, **walls 줄점유 1회 데미지(P0)**, 충돌 축(worldX±half, 줄 일치, 점프/슬라이드 회피).
- **e2e(수동)**: 1월드 전체 사이클 + 줄이동/점프/슬라이드/자동사격/스킬/부활.
- **observability**: fps·드로우콜, visibilitychange pause, 장시간 세션.

---

## 수용 기준 매핑 (설계서 §21, 24항)
- three 제거·Canvas 2D → S2,S6 · 우측 달리기·좌측 스크롤 → S2,S4 · 3줄+점프+슬라이드+시각분리 → S1,S3,S4
- 전체 사이클·6월드·해금 → S4,S5,S7 · **타이틀 월드선택 6버튼+잠금 → S4(Screens)/S7** · 자동사격+스킬(기본2+해금2) → S4,S5
- 몬스터18·보스12 → S3,S5 · **walls 정상 데미지(P0) → S5+integration** · 성장/픽업/점수 → S4 · 보상 외형/영속 → S5,S6
- 장애물 P1~P10 램프·안전경로 → S4 · 튜토리얼 6단계 → S4/S5 · 자동스킬+PIT 보조 → S4,S5 · 보스 약점 피드백 → S5
- 체크포인트 부활 → S4(보존) · i18n → S1(문구) · 월드별 최고점수 → S4(보존) · 스테이지 인트로·visibilitychange → S2,S6
- 사운드 인터페이스+전수 배선 → S6 · HUD 구성 → S2,S6 · 에셋소싱 2D 문서 → 완료 · 실기기 프레임레이트 → S7(QA 유예)
