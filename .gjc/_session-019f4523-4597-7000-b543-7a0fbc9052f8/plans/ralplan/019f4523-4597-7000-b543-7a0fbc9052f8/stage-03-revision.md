# M0 — 2D 피벗 구현 계획 (Revision 2 · Architect/Critic 반영)

> 기준: `최종기획및설계서.md` v3.0 + `에셋소싱.md` v3.0. stage-02-planner를 대체하는 개정판. 채택안 = **클린 스윕(B)** 유지. Architect(WATCH/COMMENT 8건)·Critic(ITERATE 6건) 지적 전부 반영.

## 개정 로그 (v1 → v2)
- **[A#1]** S1 `enemyProjHalfZ→Y`가 Combat.ts:176 고아화 → **enemyProjHalfY를 추가하고 enemyProjHalfZ는 S4까지 별칭 유지**(S4에서 Combat 이관 후 삭제).
- **[A#2]** 전이기 shim 규율을 laneX뿐 아니라 **`Game.scene`·엔티티 `.mesh`/`.position`·`enemyProjHalfZ`·`laneX`** 전체로 확장 명시(§전이기 shim).
- **[A#3/C#5]** THREE 잔존 모듈 인벤토리 추가·단계 귀속: **Combat(blast 링 FX, m.position, scene.add/remove)→S4**, **Boss.scene.add→S5**, **HUD.floatTextWorld(camera.project) 재시그니처·Progression Vector3·main·package.json→S6**.
- **[A#4]** `worldToScreenX` 기준점 = **camera.scrollWorldX 단일 소스**. follow에서 `scrollWorldX==player.worldX`(수평 lerp 없음), lerp/shake는 boss/title/셰이크 전용. config 시그니처 `worldToScreenX(worldX, scrollWorldX)`로 확정.
- **[A#5]** `CONFIG.lanes.spacing`(2.0 월드) → **`laneSpacingPx`(96)로 개명**(stale 월드단위 읽기가 소리내어 실패). 소비처 전수: Boss.ts:30 waveGeo, config laneX. wave 세로 폭 = `2*laneSpacingPx`.
- **[A#6]** 입력 disambiguation 규칙표 확정(§입력). `Action` 유니언 `left/right`→`up/down`.
- **[A#7/C#1]** `systems/Models.ts`(고아 3D 빌더) 삭제 명시+S6 grep 게이트 포함. `rules.test.ts`의 laneX import·describe 블록을 laneY/worldToScreenX 검증으로 교체(laneX 삭제 단계 exit).
- **[A#8]** `jumpPeak`는 (gravity,airTime) 파생값으로 문서화(실측 peak≈1.5u≈37px). 분리 불변식 `laneSpacingPx 96 > 점프px`는 여전히 안전.
- **[C#2/C#3]** S3·S7 exit 구체화. **[C#4]** §21 매핑에 '타이틀 월드선택 6버튼+잠금' 추가. **[C#6]** 순수함수명 `pickThreatLanes`(Boss.pickLanes는 래퍼)로 표기 정정.

---

## RALPLAN-DR 요약

### Principles
1. 컨셉 불변, 기술만 전환(6월드·몬스터18·보스12·스킬4·성장·꾸미기·i18n·월드별 최고점수·튜토리얼·체크포인트 로직 보존).
2. 단일 소스 좌표 헬퍼 — 모든 화면 좌표는 `laneY(lane)`·`worldToScreenX(worldX, scrollWorldX)`로만 유도. **기준점 SoT = camera.scrollWorldX**.
3. view-logic 분리 — 엔티티는 `draw(ctx, sx, baseY, opts)` 프리미티브만. 스프라이트 교체는 draw 내부 교체.
4. 컴파일 그린 유지 — 각 단계 종료 시 `pnpm build`(tsc && vite build)+`vitest` 통과. **공유 커플링(scene/mesh/enemyProjHalfZ/laneX/laneSpacingPx)은 소비처 이관 완료까지 shim 유지**, 최종 제거는 S6.
5. 밸런스 수치 보존(§20) — 축 회전 외 불변. ppu/spacing/속도 조정은 QA 후.

### Decision Drivers (top 3)
- 컴파일 붕괴 최소화(THREE가 core+entities+Combat/Progression/HUD 전반).
- 좌표축 회전 정확성(Z→worldX, X레인→Y줄, 점프Y→hopY) — 기준점 SoT 확정이 관건.
- 회귀 방지(rules 순수로직 보존; 보스 walls 줄점유로 P0 동시 해소).

### Viable Options
- (A) 점진 스트랭글러 — three/canvas 공존 어댑터. **부적합**: 서브웨이(+Z)↔사이드러너(+X) 좌표 의미가 달라 어댑터 이득 없음, 이중 좌표계 복잡도만 증가.
- **(B) 클린 스윕 [채택]** — 좌표 헬퍼→렌더 골격→엔티티 draw→배선→보스 축→three 제거 마감. pros: 이중 좌표계 없음, 목표 구조 직행. cons: 중간 시각 미완(도형만) — 단계별 tsc/실행 게이트로 통제. **전이기 shim 규율로 컴파일 그린 보장**.
- (C) 병행 재작성 — 신규 트리. **과함**: 재사용 자산(데이터/순수로직/UI DOM) 복제 비용 초과.

---

## 전이기 shim 규율 (A#1·A#2 — S2 착수 전 확정)
S2~S5 동안 아래 3D 커플링을 **deprecated shim으로 유지**하고 S6에서 일괄 제거한다. 각 shim은 소비처 이관 완료 단계에서 삭제:
| shim | 유지 이유 | 이관/삭제 |
|---|---|---|
| `Game.scene` + 엔티티 `.mesh`/`.position`(THREE) | Combat(S4)·Boss(S5) 소비 | WebGL 렌더는 S2에서 중단(Renderer가 대체), 필드/타입은 S6 삭제 |
| `CONFIG.combat.enemyProjHalfZ`(별칭) | Combat.ts:176 소비 | S4에서 `enemyProjHalfY`로 이관 후 삭제 |
| `laneX()` | rules.test.ts·잔여 | S3/S4에서 `laneY` 이관, 삭제 단계에서 rules.test.ts 동기 교체 |
> S2 'three가 Game/main 렌더 경로에서 사라짐'은 **WebGL 렌더 호출 제거**를 의미하며, scene/mesh 데이터 필드는 shim으로 잔존(컴파일 그린 유지). 명확화.

---

## 파일별 변경 계획

### src/data
- **config.ts**: `laneX` 삭제(shim으로 S3까지 유지) → `laneY(lane)` + `worldToScreenX(worldX, scrollWorldX)`(기준점=scrollWorldX). `render` 블록 신설(logicalWidth960/logicalHeight540/ppu24/playerAnchorX0.24/trackCenterY0.60/pixelRatioMax2). `lanes.spacing`→**`laneSpacingPx:96`** 개명. `run.jumpPeak`(=(gravity,airTime) 파생, 문서 주석). `combat`에 `enemyProjHalfY` 추가 + `enemyProjHalfZ` 별칭(S4 삭제). 밸런스 그 외 불변.
- **worlds.ts**: 데이터 보존. `BossDef.visual`(3D part) → 2D draw 파라미터(색/도형종류) 의미 재해석(필드 유지). 패턴 수치 불변.
- **i18n.ts**: 조작 힌트 키 문구만 갱신(좌우→위아래, 탭=점프, 슬라이드). 키 구조 불변.

### src/core
- **Renderer.ts (신설)**: Canvas 2D. 캔버스 생성/리사이즈(DPR≤2, 논리 960×540 letterbox), clear, 레이어 draw(원경→근경→3줄 트랙→그림자→줄 역순 엔티티→이펙트), `worldToScreenX(_, camera.scrollWorldX)`/`laneY` 사용, 셰이크. 인터페이스 `resize()/begin()/drawWorld(scene,camera)/end()`.
- **Camera.ts**: 3D 오프셋 lerp → `scrollWorldX` lerp + 셰이크. 모드 title/follow/boss. **follow: scrollWorldX=player.worldX(즉시, 수평 lerp 없음)**; boss/title/셰이크만 lerp. Renderer의 worldToScreenX 기준점 제공.
- **Environment.ts**: 3D 세그먼트 → 패럴럭스(원경0.2~0.4×/근경0.6×)+3줄 트랙 바닥/구분선. 테마색 적용, 수평 무한 스크롤.
- **Game.ts**: `import * as THREE` 제거는 S6. S2에서 WebGL renderer3D/camera3D 렌더 경로→Renderer+Camera(scroll)로 교체(scene/mesh 필드는 shim 잔존). 고정 타임스텝 루프·상태머신·체크포인트·저장/해금 불변. 신규 `visibilitychange`→hidden 시 자동 pause. 스폰/충돌 헬퍼 좌표 worldX/lane 이관.
- **Input.ts**: `Action` `left/right`→`up/down` 개명. 입력 disambiguation 규칙(§입력) 구현. 버퍼·코요테·큐 보존.
- **Tutorial.ts**: 6단계 보존, 2단계(좌우→위아래)·3단계(점프 입력) 문구/대상 줄만.
- **rules.ts / rules.test.ts**: 순수 로직 보존('안전 레인'→'안전 줄' 명칭). **rules.test.ts: laneX import(L4)·describe('laneX')(L92-98) → laneY/worldToScreenX 검증으로 교체**(laneX 삭제 단계 exit). `pickThreatLanes` 안전줄 ≥1 테스트 확장.

### src/entities (공통: THREE 메시 제거는 소비처 이관 단계; 상태 z→worldX, lane(Y줄), y→hopY; `draw(ctx,sx,baseY,opts)`)
- **Player.ts**: 캡슐+얼굴+**그림자(줄 기준선 고정)**. 달리기/점프(hopY: gravity-25·airtime0.7 물리 유지, jumpPeak 파생)/슬라이드(히트박스 축소). 꾸미기 부착.
- **Monster.ts**: 18종 도형+빨간눈+흔들림. 직진형=자기 줄 좌측 접근, 위빙형=인접 줄 상하, 탱커=느린 접근.
- **Boss.ts**: 패턴 축 전환. 투사체 -worldX·대상 줄. wave 전 줄 바닥 좌측 쓸기(세로폭=2*laneSpacingPx). **walls 줄점유 판정**(같은 줄 시 벽당 1회 hitDone; 현행 z-거리 L745 교체). chase 줄 추적→락→강타. rush 돌진. scream 봉인→슬라이드. 경직/페이즈/체력바 보존. `buildBody` 3D→2D. scene.add 제거는 S5.
- **Obstacle.ts / Pickup.ts / Projectile.ts**: 2D 도형(픽업은 coin/gem/heal.webp drawImage 옵션). 탄 축 ±worldX.

### src/systems
- **Combat.ts (S4에서 THREE 제거)**: 자동사격 = 우측 전방(worldX+fireRange) 같은 줄 우선 최근접. 명중 = worldX 근접+줄 일치. 적 탄 vs 플레이어 = `enemyProjHalfX`+`enemyProjHalfY`+점프/슬라이드 회피. **blast 링 FX(ringGeo/ringMat/scene.remove)→ctx draw**. 자동회피 위협스캔(현 z-거리)→worldX 이관. m.position/boss.position→worldX/lane. 스킬 4종 로직 보존.
- **Spawner.ts**: spawnAhead(worldX+45) 배치, despawnBehind(worldX-14) 제거. P1~P10 줄 재배치, 안전경로·동시위협4 보존. `pickThreatLanes` 재사용.
- **Progression.ts (S6)**: `new THREE.Vector3`(L34) 제거→worldX/lane. levelUp 로직 불변.
- **Inventory/Cosmetics/Sound**: 로직 불변. Cosmetics 3D부착→2D draw. **Sound: 점프/슬라이드/줄이동/BGM(run·boss) 호출 지점 전수 배선**(v2.0 P2 재발 방지).
- **Models.ts**: 고아 3D 빌더 → **삭제**(S6 grep 게이트 포함).

### src/ui (DOM 오버레이 유지)
- **HUD.ts (S6)**: DOM/CSS 유지. **`floatTextWorld`가 camera.project()(THREE PerspectiveCamera, L313) 사용 → (worldX,lane,hopY)+worldToScreenX/laneY로 재시그니처, 전 호출부(Combat 등) 갱신**. REWARD 진입 시 HUD 숨김(v2.0 P1). 가로 세이프존.
- **Screens.ts / icons.ts**: 기존 아이콘22+이미지13 WebP 재사용, 불변.

### 루트
- **main.ts (S6)**: three 부트스트랩 제거 → `<canvas>` 생성+Renderer 주입.
- **package.json (S6)**: `three`·`@types/three` 제거.
- **index.html**: 단일 캔버스, favicon 1줄(404 제거).
- **style.css**: 가로 레이아웃·letterbox·세이프존.
- **public/assets/models/**: 삭제.

---

## 입력 disambiguation 규칙 (A#6 확정)
| 입력 | 키보드 | 터치 | 판정 |
|---|---|---|---|
| 줄 위/아래 | ↑/↓ (W/S) keydown 즉시 | 수직 스와이프 | keydown 즉시 줄 이동(우선) |
| 점프 | Space/K | 탭(짧은 터치) | hopY 물리 |
| 슬라이드 | J(전용, 기본) 또는 ↓ 홀드 임계 | 아래 홀드 | 홀드 임계(예 0.12s) 초과 시 슬라이드; 미만이면 줄내림 |
- '짧은 위 스와이프=점프' 오버로드 제거(탭=점프로 단일화). 오입력 방지 위해 슬라이드 전용키 J 기본.

---

## 작업 순서 (위상 정렬 · 각 단계 pnpm build + vitest 그린)
- **S1 좌표·config 기반** — laneY/worldToScreenX(scrollWorldX)/render/jumpPeak 추가, laneSpacingPx 개명(+소비처 Boss.ts:30/laneX 동시 수정 or shim), enemyProjHalfY 추가(enemyProjHalfZ 별칭 유지). *exit*: `pnpm build`+`vitest` 그린(별칭/ shim으로 소비처 무붕괴).
- **S2 렌더 골격** — Renderer.ts·Camera(scrollWorldX, follow=player.worldX)·main 캔버스. Game WebGL 렌더 경로→Renderer(scene/mesh 필드 shim 잔존). Environment 3줄+패럴럭스 최소. *exit*: 3줄 트랙+우측 달리는 플레이어 사각형 실행, tsc 그린, **좌표 기준점 검증(플레이어가 anchorX에 고정·월드 정렬)**.
- **S3 엔티티 draw 이식** — Player/Obstacle/Pickup/Projectile/Monster THREE→draw(ctx). z→worldX,y→hopY. 그림자/점프/슬라이드 시각. laneX 소비처 laneY 이관. *exit*: tsc 그린 + 각 엔티티 타입 화면 표시 + worldX/hopY/그림자 수동 확인.
- **S4 러닝 플레이 배선 + Combat THREE 제거** — Game 스폰·입력(up/down/점프/슬라이드 규칙)·Combat(자동사격·충돌 축·blast FX ctx·enemyProjHalfY 이관·enemyProjHalfZ 삭제·위협스캔 이관)·픽업·성장. *exit*: RUNNING_1 장애물 회피·몬스터 처치·수집·레벨업 동작, 안전경로 보장, Combat THREE import 0.
- **S5 보스·스킬 축 전환** — Boss 패턴 9종 축 회전 + **walls 줄점유**, 아레나(스크롤 정지), 스킬 4종, 경직/페이즈, Boss scene.add 제거. *exit*: 1월드 중간·최종보스 정상, **walls 데미지 발생(P0 회귀가드)**, Boss THREE import 0.
- **S6 마감·3D 제거** — HUD.floatTextWorld 재시그니처+호출부, Progression Vector3 제거, main/package.json three 제거, Models.ts 삭제, models/ 삭제, Environment 폴리시, visibilitychange, Sound 전수 배선, laneX/scene/mesh/enemyProjHalfZ shim 삭제, rules.test.ts laneX→laneY 교체. *exit*: `grep -r "three"` import 0건, `pnpm build`+`vitest` 그린.
- **S7 검증** — tsc+vitest, 1월드 풀 사이클 수동 e2e, fps/드로우콜, §21 24항 각각 pass 기록. *exit*: §21 전항 pass(실기기 프레임레이트만 유예).

---

## 위험 / 롤백
- three 제거 붕괴 → shim 규율 + S6 최종 제거 + 단계별 커밋.
- 점프↔줄이동 혼동 → laneSpacingPx96>점프px + 기준선 그림자; 애매 시 점프 스케일업/그림자 축소.
- 보스 패턴 축 회귀 → 패턴별 회피축 표 고정 + walls/wave/scream 우선 수동검증 + integration 가드.
- 밸런스 체감 → 수치 불변, QA 후 조정.
- 입력 오발 → disambiguation 규칙표 + 전용 슬라이드키.

## 프리모템 (deliberate · 3 시나리오)
1. **화면 텅 빔/어긋남** — worldToScreenX 기준점 불일치. 방지: 기준점 SoT=camera.scrollWorldX 계약(A#4) + S2 좌표 검증 게이트.
2. **walls 또 무데미지** — 줄점유 미적용/hitDone 조기소진. 방지: integration '같은 줄 점유 시 정확히 1회 데미지' 단언(P0 가드).
3. **방치 시 즉사** — 자동대시 줄회피 안함+PIT. 방지: PIT 자동 점프 보조 축 이관 확인(검토의견 §4-1).

## 확장 테스트 계획
- **unit(vitest, rules.ts)**: 스킬 해금(연사3/회복5), 점수 공식, `pickThreatLanes` 안전줄 ≥1, 보스 페이즈 인덱스 전환, 레거시 최고점수 이관. **rules.test.ts laneX 블록→laneY/worldToScreenX 검증 교체**.
- **integration**: P1~P10 안전경로 존재, **보스 walls 줄점유 1회 데미지(P0 가드)**, 충돌 축(worldX±half, 줄 일치, 점프/슬라이드 회피).
- **e2e(수동)**: 1월드 전체 사이클 완주 + 줄이동/점프/슬라이드/자동사격/스킬/부활.
- **observability**: fps·드로우콜(개발 HUD), visibilitychange pause, 장시간 세션(Canvas 2D dispose 부담↓).

---

## 수용 기준 매핑 (설계서 §21, 24항)
- three 제거·Canvas 2D → S2,S6 · 우측 달리기·좌측 스크롤 → S2,S4 · 3줄+점프+슬라이드+시각분리 → S1,S3,S4
- 전체 사이클·6월드·해금 → S4,S5,S7 · **타이틀 월드선택 6버튼+잠금 → S4(Screens 검증)/S7** · 자동사격+스킬(기본2+해금2) → S4,S5
- 몬스터18·보스12 → S3,S5 · **walls 정상 데미지(P0) → S5+integration** · 성장/픽업/점수 → S4 · 보상 외형/영속 → S5,S6
- 장애물 P1~P10 램프·안전경로 → S4 · 튜토리얼 6단계 → S4/S5 · 자동스킬+PIT 보조 → S4,S5 · 보스 약점 피드백 → S5
- 체크포인트 부활 → S4(보존) · i18n → S1(문구) · 월드별 최고점수 → S4(보존) · 스테이지 인트로·visibilitychange → S2,S6
- 사운드 인터페이스+전수 배선 → S6 · HUD 구성 → S2,S6 · 에셋소싱 2D 문서 → 완료 · 실기기 프레임레이트 → S7(QA 유예)
