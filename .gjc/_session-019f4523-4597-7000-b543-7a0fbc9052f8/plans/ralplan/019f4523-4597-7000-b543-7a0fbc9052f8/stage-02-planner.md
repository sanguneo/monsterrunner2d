# M0 — 2D 피벗 구현 계획 (Planner)

> 기준: `최종기획및설계서.md` v3.0 + `에셋소싱.md` v3.0. 목표: Three.js 2.5D 서브웨이서퍼 → HTML5 Canvas 2D **우측 사이드스크롤 러너**. 게임 컨셉/시스템 100% 보존, 축만 회전.

## RALPLAN-DR 요약

### Principles
1. **컨셉 불변, 기술만 전환** — 6월드·몬스터18·보스12·스킬4·성장·꾸미기·i18n·월드별 최고점수·튜토리얼·체크포인트는 로직 보존. 변경은 렌더링·좌표축·입력에 국한.
2. **단일 소스 좌표 헬퍼** — 모든 화면 좌표는 `laneY()`·`worldToScreenX()` 두 함수로만 유도. 엔티티는 월드 좌표(`worldX`,`lane`,`hopY`)만 보유, 화면 변환은 렌더 단계에서.
3. **view-logic 분리 유지** — 엔티티는 `draw(ctx, sx, baseY, ...)` 프리미티브만 그림. 스프라이트 교체는 draw 내부 교체만으로.
4. **컴파일 그린 유지** — 각 단계 종료 시 `tsc` 통과 + 실행 가능. three 제거는 소비처 이관 후 마지막에.
5. **밸런스 수치 보존** — config 밸런스 값은 축 회전 외 불변(§20). 시각/체감 조정은 QA 후.

### Decision Drivers (top 3)
- **컴파일 붕괴 위험 최소화**: `import * as THREE`가 core+entities 전반에 퍼져 있어, 제거 순서를 잘못 잡으면 수십 개 에러 동시 폭발.
- **좌표축 회전의 정확성**: Z(전진)→worldX, X(레인)→Y(줄), 점프 Y→hopY(줄 기준선 위). 충돌·스폰·보스 패턴 전부 이 축을 공유 → 헬퍼 우선 확립이 관건.
- **회귀 방지**: rules.ts 순수 로직/테스트는 축과 무관하므로 최대 보존. 보스 walls는 이번에 줄점유 판정으로 교체(v2.0 P0 무데미지 버그 동시 해소).

### Viable Options
- **(A) 점진 스트랭글러** — `Renderer` 추상화 뒤 three와 canvas를 한동안 공존. **pros**: 단계마다 대조 가능. **cons**: 3D↔2D 이중 좌표계 동시 유지로 복잡도 급증, 서브웨이서퍼↔사이드러너는 좌표 의미 자체가 달라 어댑터 이득이 거의 없음. **부적합**.
- **(B) 클린 스윕 [채택]** — 좌표 헬퍼 먼저 교체 → Renderer/Camera 골격 → 엔티티 draw 일괄 이식 → Game 배선 → 보스 축 전환 → three 제거 마감. **pros**: 이중 좌표계 없음, 목표 구조로 직행, three 제거가 자연스러운 종착점. **cons**: 중간 단계에서 시각이 잠시 미완(도형만). 단계별 tsc/실행 게이트로 통제.
- **(C) 병행 재작성(신규 트리)** — src2에서 새로 짜고 스왑. **pros**: 기존 코드 오염 없음. **cons**: worlds.ts/rules/systems 대량 재사용 자산을 도로 복제, 머지 지옥. **과함**.

> 대안 무효화: (A)는 사이드러너 좌표가 서브웨이서퍼와 근본적으로 달라 어댑터 공존 이득 없음. (C)는 재사용 자산(데이터/순수로직/UI DOM)이 커서 복제 비용이 이득 초과.

---

## 파일별 변경 계획

### src/data
- **config.ts**: `laneX()` 삭제 → `laneY(lane)`(0=위/1=중간/2=아래, 화면 Y) + `worldToScreenX(worldX, playerWorldX)` 신설. `render` 블록 신설(`logicalWidth:960, logicalHeight:540, ppu:24, playerAnchorX:0.24, trackCenterY:0.60, pixelRatioMax:2`). `lanes.spacing` 2.0(월드) → 96(px, 세로). `run.jumpPeak:2.2`(월드) 신설. `combat.enemyProjHalfZ` → `enemyProjHalfY`. **그 외 밸런스 수치 전부 동일**.
- **worlds.ts**: 데이터 보존. 보스 `BossDef.visual`(3D part 조립) → 2D `draw` 파라미터(색/도형 종류)로 의미 재해석(필드 유지, 소비처만 변경). 패턴 정의(projectile/wave/walls/…) 수치 불변, 축 해석만 변경.
- **i18n.ts**: 조작 힌트 키(스와이프 방향·점프/슬라이드) 문구만 갱신(좌우→위아래, 탭 점프). 키 구조 불변.

### src/core
- **Renderer.ts (신설)**: Canvas 2D 렌더러. 책임 — 캔버스 생성/리사이즈(DPR≤2, 논리 960×540 letterbox `ctx.setTransform`), 프레임 clear, 레이어 draw 순서(배경 원경→근경→3줄 트랙→그림자→줄 역순 엔티티(위줄 먼저)→이펙트), `worldToScreenX`/`laneY` 사용, 스크린 셰이크 적용. 인터페이스: `resize()`, `begin()`, `drawWorld(scene, camera)`, `end()`. three 렌더러/씬/지오/머티리얼 전면 대체.
- **Camera.ts**: 3D 오프셋 `(0,+4,-7)` lerp → **수평 스크롤 오프셋**(`scrollWorldX` = player.worldX 추적) lerp + 셰이크. 모드 `title`/`follow`/`boss`(boss=스크롤 고정). 반환값을 Renderer가 worldToScreenX 기준점으로 사용.
- **Environment.ts**: 3D 세그먼트 풀 → 2D 패럴럭스(원경 0.2~0.4×, 근경 0.6×) + 3줄 트랙 바닥/구분선. 월드 테마 색(`WorldTheme.bg/bgDark/track/line`) 적용, 수평 무한 스크롤(worldX mod).
- **Game.ts**: `import * as THREE` 및 scene/renderer3D/camera3D 제거 → `Renderer`+`Camera(scroll)` 사용. 고정 타임스텝 루프·상태머신·체크포인트·저장/해금 **불변**. 신규: `visibilitychange`→hidden 시 `togglePause` 자동 호출(백그라운드 슬로모션 방지). 스폰/충돌 헬퍼의 좌표를 worldX/lane 기준으로 이관. 엔티티 렌더는 Renderer에 위임(3D add/remove 제거).
- **Input.ts**: 키 매핑 — 줄 이동 ↑/↓(W/S)·스와이프 상하, 점프 Space/K·짧은 위 스와이프/탭, 슬라이드 ↓홀드/J·아래 홀드. 입력 버퍼·코요테·액션 큐 로직 보존. 스와이프 방향/길이·홀드 판정 추가.
- **Tutorial.ts**: 6단계 시퀀스 보존, 2단계 힌트(좌우→위아래)·3단계(점프 입력) 문구/대상 줄만 갱신.
- **rules.ts / rules.test.ts**: 순수 로직(해금·점수·안전줄 선택·페이즈 인덱스)은 축과 무관 → **보존**. "안전 레인"→"안전 줄" 명칭만. 테스트 최대 재사용 + walls 줄점유·축 변환용 케이스 추가.

### src/entities (공통: THREE 메시 제거 → `draw(ctx, sx, baseY, opts)`; 상태 `z→worldX`, `lane`(Y줄 인덱스 유지), 점프 `y→hopY`)
- **Player.ts**: 캡슐 도형 + 얼굴 + **그림자(줄 기준선 고정)**. 달리기/점프(hopY 물리 gravity -25·airtime 0.7·jumpPeak 2.2)/슬라이드(히트박스 축소) 렌더. 꾸미기 부착(색 도형).
- **Monster.ts**: 18종 shape/color 프리미티브 + 빨간 눈 + 흔들림. 행동 재해석 — 직진형=자기 줄 왼쪽 접근, 위빙형=인접 줄 상하 오감, 탱커=느린 접근.
- **Boss.ts**: 범용 패턴 엔진 축 전환. 투사체=오른쪽에서 왼쪽(-worldX) 진행·대상 줄. wave=전 줄 바닥 왼쪽 쓸기(점프 회피). **walls=줄점유(row-occupancy) 판정**: 벽이 선 뒤 같은 줄이면 벽당 1회 데미지(`hitDone` 래치) — z-거리 비교 제거(v2.0 P0 해소). chase=플레이어 줄 추적→락→강타. rush=본체 돌진(줄/전체). scream=자동사격 봉인→슬라이드 회피. 경직/페이즈/체력바 로직 보존. `buildBody` 3D→2D draw.
- **Obstacle.ts**: LOW/HIGH/PIT/BLOCK 2D 도형 + 월드 테마 색. 회피 판정 축을 줄/점프/슬라이드로.
- **Pickup.ts**: 동전/보석/회복 도형(옵션: `coin/gem/heal.webp` drawImage).
- **Projectile.ts**: 플레이어 탄 +worldX(우측), 적 탄 -worldX(좌측). 2D 도형.

### src/systems
- **Combat.ts**: 자동사격 타겟 = 우측 전방 사정거리(worldX+fireRange) 내 같은 줄 우선 최근접. 명중 판정 = worldX 근접 + 줄 일치(monsterHitRadius/bossHitRadius). 적 탄 vs 플레이어 = `enemyProjHalfX`(worldX) + `enemyProjHalfY`(줄) + 점프/슬라이드 회피 반영. 스킬 4종(blast 우측 범위/dash/rapidFire/healPulse) 로직 보존. 자동 스킬·PIT 자동 점프 보조 축 이관.
- **Spawner.ts**: `spawnAhead`(worldX+45)에 패턴 배치, `despawnBehind`(worldX-14) 제거. 패턴 템플릿 P1~P10 줄 기준 재배치, **안전 경로 보장**·동시위협 상한 4 보존. `pickLanes` 안전줄 로직 재사용.
- **Progression/Inventory/Cosmetics/Sound.ts**: 로직 불변. Cosmetics만 3D 부착→2D draw 레이어. Sound는 인터페이스 유지 + **점프/슬라이드/줄이동/BGM(run·boss) 호출 지점 전수 배선**(v2.0 P2 미배선 재발 방지).

### src/ui (DOM 오버레이 — 유지)
- **HUD.ts / Screens.ts**: DOM/CSS 그대로. 기존 아이콘 22 + 이미지 13 WebP 재사용. REWARD 진입 시 HUD 숨김(v2.0 P1 반영). 가로 모드 세이프존 여백 점검.
- **icons.ts**: 불변.

### 루트
- **main.ts**: three 부트스트랩 제거 → `<canvas>` 생성 + Renderer 주입 + 루프 시작.
- **package.json**: `three`, `@types/three` 의존성 제거. `sharp`(이미지 도구)는 유지 판단.
- **index.html**: 단일 캔버스 컨테이너 확인, favicon 1줄 추가(404 제거).
- **style.css**: 가로 레이아웃·캔버스 letterbox·세이프존 조정.
- **public/assets/models/**: 삭제(빈 디렉터리·용도 제거).

---

## 작업 순서 (위상 정렬 · 각 단계 컴파일 그린)

- **S1 좌표·config 기반** — config.ts에 `laneY`/`worldToScreenX`/`render`/`jumpPeak` 추가, `enemyProjHalfZ→Y`, spacing 96. (laneX 소비처가 아직 있으면 임시 유지 후 S2~S3에서 제거.) *exit*: `pnpm build` 통과(임시 미사용 경고 허용), vitest 통과.
- **S2 렌더 골격** — Renderer.ts(Canvas 2D)·Camera(scroll)·main.ts 캔버스 부트스트랩. Game 렌더 경로를 Renderer로 교체, Environment 3줄+패럴럭스 최소. three가 Game/main에서 사라짐. 화면에 3줄 트랙 + 우측 달리는 플레이어 사각형. *exit*: 빈 러닝 화면 실행, tsc 그린.
- **S3 엔티티 draw 이식** — Player/Obstacle/Pickup/Projectile/Monster의 THREE→draw(ctx). 상태 z→worldX, y→hopY. 그림자·점프·슬라이드 시각. *exit*: 엔티티가 도형으로 렌더·이동.
- **S4 러닝 플레이 배선** — Game 스폰(Spawner)·입력(Input 상하/점프/슬라이드)·충돌(Combat)·자동사격·픽업·성장. 한 구간이 플레이 가능. *exit*: RUNNING_1에서 장애물 회피·몬스터 처치·수집·레벨업 동작, 안전경로 보장.
- **S5 보스·스킬 축 전환** — Boss.ts 패턴 9종 축 회전 + **walls 줄점유 판정**, 보스 아레나(스크롤 정지), Combat 스킬 4종, 경직/페이즈. *exit*: 1월드 중간·최종보스 전투 정상, walls 데미지 발생.
- **S6 마감·3D 제거** — Environment 패럴럭스 폴리시, HUD/Screens 검증(REWARD 숨김), visibilitychange 자동 일시정지, Sound 배선 전수, package.json three 제거, models 삭제, 잔여 THREE import 0. *exit*: `grep import.*three` 0건, `pnpm build` 그린.
- **S7 검증** — tsc+vitest, 1월드 풀 사이클 수동 e2e, fps/드로우콜 체크, §21 매핑 확인. *exit*: 수용 기준 충족.

---

## 위험 / 롤백
- **three 제거 컴파일 붕괴**: 소비처(S2~S5) 완료 전 의존성 제거 금지 → three 삭제는 S6 마지막. 단계별 커밋으로 롤백 지점 확보.
- **점프↔줄이동 시각 혼동**: `laneSpacingPx 96 > 점프px ~53` + 기준선 그림자 유지로 분리. 애매하면 점프 시 살짝 스케일업/그림자 축소로 강화.
- **보스 패턴 축 회전 회귀**: 패턴별 회피 축(줄 이동/점프/슬라이드)을 표로 고정하고 walls/wave/scream을 우선 수동 검증.
- **밸런스 체감 변화**: 수치 불변 원칙, ppu/spacing/속도는 QA 후에만 조정.

## 프리모템 (deliberate · 3 시나리오)
1. **"three는 지웠는데 화면이 텅 빔"** — Renderer 좌표 매핑(worldToScreenX 기준점=camera.scrollWorldX) 오류. 방지: S2에서 플레이어 사각형+3줄만 먼저 띄워 좌표계 검증 후 진행.
2. **"보스 walls가 또 무데미지"** — 줄점유 판정 미적용/hitDone 조기 소진. 방지: integration 테스트로 같은 줄 점유 시 정확히 1회 데미지 단언(P0 회귀 가드).
3. **"방치 시 즉사"** — 자동 대시가 줄 회피 안 함 + PIT 데미지. 방지: PIT 자동 점프 보조 축 이관 확인, 검토의견 §4-1 반영.

## 확장 테스트 계획
- **unit(vitest, rules.ts)**: 스킬 해금 판정(연사3/회복5), 점수 공식, 안전줄 ≥1 보장(`pickLanes`), 보스 페이즈 인덱스 전환, 레거시 최고점수 이관. 기존 rules.test.ts 재사용 + 축 무관 확인.
- **integration**: 스폰 패턴 P1~P10 안전경로 존재, 보스 walls 줄점유 1회 데미지, 충돌 축(worldX±half, 줄 일치, 점프/슬라이드 회피).
- **e2e(수동)**: 1월드 TITLE→(TUTORIAL)→RUNNING_1→MIDBOSS→RUNNING_2→FINALBOSS→REWARD→RESULT 완주. 줄이동/점프/슬라이드/자동사격/스킬/부활 확인.
- **observability**: fps·드로우콜(개발 HUD), visibilitychange pause 동작, GPU 부담(장시간 세션) — Canvas 2D라 dispose 부담 감소.

---

## 수용 기준 매핑 (설계서 §21)
- three 제거·Canvas 2D 렌더 → **S2, S6**
- 우측 자동 달리기·좌측 스크롤·우측 접근 → **S2, S4**
- 3줄 이동+점프+슬라이드+시각분리 → **S1(좌표), S3, S4**
- 전체 사이클 완주·6월드·해금 → **S4, S5, S7**
- 자동사격+스킬(기본2+해금2) → **S4, S5**
- 몬스터18·보스12 패턴 → **S3, S5**
- 보스 walls 정상 데미지(P0 방지) → **S5** + integration
- 성장/레벨업, 픽업/점수 → **S4**
- 보상 장비 외형/영속 → **S5, S6**(Cosmetics 2D)
- 장애물 P1~P10 램프·안전경로 → **S4**
- 튜토리얼 6단계 → **S4/S5**(Tutorial 문구)
- 자동스킬 토글+PIT 보조 → **S4, S5**
- 보스 약점 피드백 → **S5**
- 체크포인트 부활 → 보존(**S4**)
- i18n 전환 → 보존(**S1 i18n 문구**)
- 월드별 최고점수 → 보존(**S4**)
- 스테이지 인트로·visibilitychange pause → **S2, S6**
- 사운드 인터페이스+전수 배선 → **S6**
- HUD 구성 → **S2, S6**
- 에셋소싱 2D 문서 → 완료(문서)
- 실기기 프레임레이트 → **S7**(QA 대기)
