# M0 — 2D 피벗 구현 계획 (Revision 5 · 순수 3줄 닷지 반영 · 최종)

> 기준: `최종기획및설계서.md`(승인 후 v3.1로 갱신) + `에셋소싱.md`. 채택안 = **클린 스윕(B)**. 1·2·3차 리뷰(A#1~A#8, C#1~C#6, N1~N3) 전부 반영 + **의도 정합(순수 3줄 닷지, 가로)** 반영.

## Intent Reconciliation (사용자 확정)
- **점프/슬라이드 제거 → 순수 3줄 닷지**: 모든 위협은 **위/아래 줄 이동만으로 회피**. (사용자 선택 B.)
  - 파급: 장애물 4타입(LOW/HIGH/PIT/BLOCK)→**줄 블로커(BLOCK/MOVER)** 통합, **동시 최대 2줄 점유(안전 줄 ≥1)**, 보스 `wave`(구 점프회피)·`scream`(구 슬라이드회피)→**줄 회피형 재설계**, 튜토리얼 6→4단계, 데이터 모델 `hopY/isJumping/isSliding` 제거, config 점프/슬라이드/중력/코요테 제거.
  - **부수 효과(리뷰 이슈 소멸)**: 점프 없음 → A#6(입력 disambiguation)·A#8(jumpPeak 물리 SoT)·점프/줄이동 시각 분리(그림자)·PIT 자동 점프 보조가 **전부 불필요**해짐(계획 단순화).
- **화면 가로(Landscape) 우선 확정**.

## 개정 로그 (v3 → v5)
- **[S0 신설]** 실행 첫 단계로 **`최종기획및설계서.md`→v3.1 + `에셋소싱.md` 갱신**(순수 3줄 닷지·가로). 문서가 ground truth이므로 코드 이관 전에 동기화. (ralplan 승인 전에는 문서도 mutation 금지 → 실행 S0에서 수행.)
- **[닷지화]** run에서 jumpAirTime/gravity/slideDuration/jumpPeak 제거, accessibility.coyoteTime·player.jumpBonusPerLevel 제거, lanes.spacing→render.laneSpacingPx, obstacles.damage→{BLOCK,MOVER}+maxBlockedLanes:2, 패턴 P1~P8, tutorial steps ['run','lane','autofire','skill'].
- **[입력 단순화]** Input은 위/아래 줄 이동만(+스킬·pause). 점프/슬라이드 키·홀드·스와이프 길이 판정 전부 제거(A#6 무효).
- **[보스]** wave=줄 순차 덮기(안전 줄 이동), scream=자동사격 봉인+대상 줄 음파(안전 줄 이동), walls=줄점유(P0 가드) — 전부 줄 회피.

## 개정 로그 (v1→v3, 유지)
- [A#1] enemyProjHalfY + enemyProjHalfZ S4까지 별칭 후 삭제. [A#2/N1] shim 표(scene/mesh/cameraCtl.camera/enemyProjHalfZ/laneX·월드 spacing) S6 삭제. [A#3/C#5] THREE 잔존 모듈 단계 귀속(Combat→S4, Boss→S5, HUD.floatTextWorld/Progression/main/package→S6). [A#4] worldToScreenX 기준점=camera.scrollWorldX 단일화. [A#7/C#1] Models.ts 삭제+rules.test laneX 동기(S6). [C#4] §21 6버튼 매핑. [C#6] pickThreatLanes 표기. [N2] laneSpacingPx 가산+월드 spacing S5까지 존치(S6 fail-loud). [N3] Environment.ts:32 소비처 S2 소멸 명기.

---

## RALPLAN-DR 요약

### Principles
1. 컨셉 불변, 기술+조작만 전환(6월드·몬스터18·보스12·스킬4·성장·꾸미기·i18n·월드별 최고점수·튜토리얼·체크포인트 로직 보존).
2. 단일 소스 좌표 헬퍼 — `laneY(lane)`·`worldToScreenX(worldX, scrollWorldX)`. 기준점 SoT=camera.scrollWorldX. 세로 위치는 `lane` 정수로 완전 결정(점프 연속 Y 없음).
3. view-logic 분리 — 엔티티 `draw(ctx, sx, baseY, opts)` 프리미티브. 스프라이트 교체는 draw 내부.
4. 컴파일 그린 유지 — 각 단계 `pnpm build`+`vitest` 통과. 공유 커플링(scene/mesh/cameraCtl.camera/enemyProjHalfZ/laneX/월드 spacing) 소비처 이관까지 shim/존치, S6 최종 제거.
5. 밸런스 수치 보존(§20) — 축 회전·닷지화 외 불변.

### Decision Drivers (top 3)
- 컴파일 붕괴 최소화(THREE가 core+entities+Combat/Progression/HUD 전반).
- 좌표축 회전 정확성(Z→worldX, X레인→Y줄) — 기준점 SoT 확정.
- 회귀 방지(rules 순수로직 보존; 보스 walls 줄점유로 P0 동시 해소; 안전 줄 ≥1 불변식).

### Viable Options
- (A) 점진 스트랭글러 — 부적합(서브웨이+Z↔사이드러너+X 좌표 의미 상이, 이중 좌표계 복잡도만↑).
- **(B) 클린 스윕 [채택]** — 문서 동기(S0)→좌표헬퍼→렌더골격→엔티티 draw→배선→보스 줄패턴→three 제거. 이중 좌표계 없음, 목표 구조 직행. 중간 시각 미완은 단계 게이트+shim으로 통제.
- (C) 병행 재작성 — 과함(재사용 자산 복제 비용 초과).

---

## 전이기 shim / 존치 규율 (S2 착수 전 확정)
| 항목 | 유지 이유 | 삭제 단계 |
|---|---|---|
| `Game.scene` + 엔티티 `.mesh`/`.position`(THREE) | Combat(S4)·Boss(S5) 소비 | WebGL 렌더 S2 중단, 필드 S6 |
| `cameraCtl.camera`(PerspectiveCamera stub) | HUD.floatTextWorld(HUD.ts:313) S6 의존 | S6(HUD 재시그니처와 동시) |
| `CONFIG.combat.enemyProjHalfZ`(별칭) | Combat.ts:176 | S4 |
| `laneX()` + 월드 `CONFIG.lanes.spacing`(2.0) | rules.test·Boss.ts:744 월드공간 | S5 이관→S6 삭제(fail-loud) |
> S2 'three가 렌더 경로에서 사라짐'=WebGL 렌더 호출 제거. 데이터 필드는 shim 잔존(컴파일 그린).

---

## 파일별 변경 계획

### 문서 (S0)
- **최종기획및설계서.md → v3.1**: §5(러닝 액션 위/아래만), §6(장애물=줄 블로커·패턴 P1~P8·안전 줄 ≥1), §9(wave/scream 줄 회피, walls 줄점유), §13(PIT 보조 제거·자동 회피 보조), §14(4단계), §19(데이터 모델), §20(config), §21(수용기준), §26(조작 결정) 갱신. 초안 준비됨.
- **에셋소싱.md**: 플레이어 애니메이션 점프/슬라이드 프레임 제거(달리기/줄이동/피격/사망), 장애물=줄 블로커 표기.

### src/data
- **config.ts**: `laneY(lane)` + `worldToScreenX(worldX, scrollWorldX)` 신설. `render`(logical960×540/ppu24/anchorX0.24/trackCenterY0.60/**laneSpacingPx96**/pixelRatioMax2). `run`={speedStart12,speedMax24,accel0.5,hitInvuln0.5} (점프/슬라이드/중력 제거). `combat.enemyProjHalfY` 추가+`enemyProjHalfZ` 별칭(S4 삭제). `obstacles.damage`={BLOCK15,MOVER15}+`maxBlockedLanes:2`, 패턴 램프 P1~P8. `accessibility`에서 coyoteTime 제거. `player.jumpBonusPerLevel` 제거. **월드 `lanes.spacing`·`laneX()`는 S5까지 존치(S6 삭제)**. 밸런스 그 외 불변.
- **worlds.ts**: 데이터 보존. `BossDef.visual`→2D draw 파라미터. 패턴 정의 축/줄 재해석(wave/scream 줄 회피), 수치 불변.
- **i18n.ts**: 조작 힌트(위/아래 회피, 점프/슬라이드 문구 삭제). 키 구조 불변.

### src/core
- **Renderer.ts (신설)**: Canvas 2D. 리사이즈(DPR≤2, 960×540 letterbox), clear, 레이어(원경→근경→3줄 트랙→그림자(선택)→줄 역순 엔티티→이펙트), worldToScreenX(_,camera.scrollWorldX)/laneY. 인터페이스 resize/begin/drawWorld/end.
- **Camera.ts**: scrollWorldX lerp + 셰이크. follow=player.worldX(즉시), boss/title/셰이크 lerp. `camera`(PerspectiveCamera) shim S6까지. THREE import S6 제거.
- **Environment.ts**: 3D 세그먼트→패럴럭스+3줄 트랙. S2 전면 재작성(기존 lanes.spacing/2 소비 소멸). THREE S2/S6 제거.
- **Game.ts**: THREE import S6 제거. S2 WebGL 렌더→Renderer+Camera(scroll)(scene/mesh shim). 고정 타임스텝·상태머신·체크포인트·저장/해금 불변. visibilitychange 자동 pause. 스폰/충돌 좌표 worldX/lane.
- **Input.ts**: **위/아래 줄 이동만**(↑/↓·W/S·수직 스와이프·줄 탭) + 스킬 Q/E/R/F + pause. `Action` up/down. 점프/슬라이드 입력·홀드·스와이프 길이 판정 제거. 입력 버퍼·큐 보존.
- **Tutorial.ts**: **4단계(run/lane/autofire/skill)**. 점프·슬라이드 단계 삭제, 2단계=줄 이동 회피.
- **rules.ts / rules.test.ts**: 순수 로직 보존. `pickThreatLanes` 안전줄 ≥1 보장 확장. **rules.test laneX(L4/L92-98)→laneY/worldToScreenX 교체를 S6(laneX 삭제)와 동기**.

### src/entities (공통: THREE 제거는 소비처 단계; z→worldX, lane(Y줄), 점프/슬라이드 상태 없음; `draw(ctx,sx,baseY,opts)`)
- **Player.ts**: 캡슐+얼굴+그림자(선택). 달리기/줄이동(laneMoveTimer 보간)/피격/사망. hopY·isJumping·isSliding 제거, laneMoveTimer·invulnTimer 추가. 꾸미기 부착.
- **Monster.ts**: 18종 도형+빨간눈+흔들림. 직진형=자기 줄 좌측, 위빙형=인접 줄 상하, 탱커=느린 접근.
- **Boss.ts**: 패턴 축/줄 전환. 투사체 -worldX·대상 줄(안전 줄 ≥1). **wave=줄 순차 덮기(안전 줄 이동)**. **scream=자동사격 봉인+대상 줄 음파(안전 줄 이동)+경직**. **walls=`player.lane===w.lane` 줄점유(벽당 1회 hitDone; 현행 Boss.ts:744 x/레인-근접 교체)**. chase/rush=예고 줄 회피. 경직/페이즈/체력바 보존. buildBody 3D→2D, scene.add 제거 S5.
- **Obstacle.ts**: **줄 블로커(kind: BLOCK/MOVER)** 2D 도형+월드 테마. LOW/HIGH/PIT 제거. MOVER는 lane 이동(슬라럼).
- **Pickup/Projectile.ts**: 2D 도형(픽업 coin/gem/heal.webp drawImage 옵션). 탄 ±worldX.

### src/systems
- **Combat.ts (S4 THREE 제거)**: 자동사격=우측 전방 같은 줄 우선 최근접. 명중=worldX 근접+줄 일치. 적 탄 vs 플레이어=enemyProjHalfX+enemyProjHalfY(점프/슬라이드 회피 없음). blast 링 FX(Combat.ts:19-20,419,scene.remove)→ctx draw. 자동회피 위협스캔→worldX + **자동 회피=안전 줄 이동/무적 대시**(PIT 자동 점프 제거). m.position/boss.position→worldX/lane. 스킬 4종 보존.
- **Spawner.ts**: spawnAhead(worldX+45), despawnBehind(worldX-14). **P1~P8 줄 배치, maxBlockedLanes 2·안전 줄 ≥1**, 동시위협4. pickThreatLanes 재사용.
- **Progression.ts (S6)**: THREE.Vector3(L34) 제거→worldX/lane. levelUp 불변.
- **Inventory/Cosmetics/Sound**: 로직 불변. Cosmetics 2D draw. **Sound: 줄이동/자동사격/피격/BGM(run·boss) 전수 배선**(점프/슬라이드 사운드 제거, v2.0 P2 재발 방지).
- **Models.ts**: 고아 3D 빌더 삭제(S6 grep 게이트).

### src/ui (DOM 오버레이 유지)
- **HUD.ts (S6)**: DOM/CSS 유지. `floatTextWorld`(HUD.ts:313 camera.project)→(worldX,lane)+worldToScreenX/laneY 재시그니처+호출부+cameraCtl.camera stub 삭제. REWARD 진입 HUD 숨김(v2.0 P1). 가로 세이프존.
- **Screens.ts/icons.ts**: 기존 아이콘22+이미지13 WebP 재사용, 불변.

### 루트
- **main.ts (S6)**: three 부트스트랩 제거→`<canvas>`+Renderer.
- **package.json (S6)**: three·@types/three 제거.
- **index.html**: 단일 캔버스, favicon 1줄. **style.css**: 가로 letterbox·세이프존.
- **public/assets/models/**: 삭제.

---

## 작업 순서 (위상 정렬 · 각 단계 pnpm build + vitest 그린)
- **S0 문서 동기** — 최종기획및설계서.md→v3.1 + 에셋소싱.md 갱신(순수 3줄 닷지·가로). *exit*: 문서 정합(코드 이관 근거 확정).
- **S1 좌표·config 기반** — laneY/worldToScreenX(scrollWorldX)/render(+laneSpacingPx96)/run 정리(점프/슬라이드 제거)/obstacles(BLOCK,MOVER,maxBlockedLanes2,P1~P8)/tutorial 4단계/enemyProjHalfY(Z 별칭). 월드 spacing·laneX 존치. *exit*: `pnpm build`+`vitest` 그린.
- **S2 렌더 골격** — Renderer.ts·Camera(scrollWorldX; camera stub)·main 캔버스. Game WebGL 렌더→Renderer(scene/mesh shim). Environment 재작성(3줄+패럴럭스). *exit*: 3줄 트랙+우측 달리는 플레이어 사각형 실행, tsc 그린, **좌표 기준점 검증(anchorX 고정·월드 정렬)**.
- **S3 엔티티 draw 이식** — Player(줄이동 보간)/Obstacle(BLOCK,MOVER)/Pickup/Projectile/Monster THREE→draw(ctx). z→worldX, lane 정수. laneY 사용. *exit*: tsc 그린 + 각 엔티티 타입 화면 표시 + 줄 위치/이동 수동 확인.
- **S4 러닝 닷지 + Combat THREE 제거** — 스폰(P1~P8·안전 줄)·입력(위/아래)·Combat(자동사격·충돌·blast FX ctx·enemyProjHalfY·Z 삭제·자동 회피=줄이동/대시)·픽업·성장. *exit*: RUNNING_1 줄 회피·처치·수집·레벨업 동작, 안전 줄 보장, Combat THREE import 0.
- **S5 보스 줄 패턴** — Boss 9종 축/줄 전환 + **walls 줄점유·wave 줄 순차·scream 줄 회피**, 아레나(스크롤 정지), 스킬 4종, 경직/페이즈, Boss scene.add·월드 spacing/laneX 소비처 이관. *exit*: 1월드 중간·최종보스 정상, **walls 데미지 발생(P0 가드)**, wave/scream 줄 회피 동작, Boss THREE import 0, 월드 spacing 직접읽기 0.
- **S6 마감·3D 제거** — HUD.floatTextWorld 재시그니처+cameraCtl.camera stub 삭제, Progression Vector3 제거, main/package.json three 제거, Models.ts·models/ 삭제, laneX·월드 lanes.spacing 삭제(→laneSpacingPx fail-loud), rules.test laneX→laneY 교체, Environment 폴리시, visibilitychange, Sound 전수 배선, scene/mesh/enemyProjHalfZ shim 삭제. *exit*: `grep -r "three"` import 0건, `pnpm build`+`vitest` 그린.
- **S7 검증** — tsc+vitest, 1월드 풀 사이클 수동 e2e, fps/드로우콜, §21 각 항목 pass 기록. *exit*: §21 전항 pass(실기기 프레임레이트만 유예).

---

## 위험 / 롤백
- three 제거 붕괴 → shim/존치 규율 + S6 최종 제거 + 단계별 커밋.
- 안전 줄 미보장(3줄 동시 점유) → Spawner/Boss에 maxBlockedLanes 2 하드 가드 + integration 단언.
- 보스 패턴 축/줄 회귀 → 패턴별 안전 줄 표 고정 + walls/wave/scream 우선 수동검증 + integration.
- 밸런스 체감 → 수치 불변, QA 후 조정.

## 프리모템 (deliberate · 3 시나리오)
1. **화면 텅 빔/어긋남** — worldToScreenX 기준점 불일치. 방지: SoT=camera.scrollWorldX + S2 좌표 검증 게이트.
2. **walls 또 무데미지** — 줄점유 미적용/hitDone 조기소진. 방지: integration '같은 줄 시 정확히 1회 데미지'(P0 가드).
3. **회피 불가 상황(3줄 봉쇄)** — 패턴/보스가 안전 줄 미보장. 방지: maxBlockedLanes 2 가드 + pickThreatLanes 안전줄 ≥1 unit 테스트.

## 확장 테스트 계획
- **unit(vitest, rules.ts)**: 스킬 해금(연사3/회복5), 점수 공식, **pickThreatLanes 안전줄 ≥1(3줄 동시 점유 금지)**, 보스 페이즈 인덱스, 레거시 최고점수 이관. rules.test laneX 블록→laneY/worldToScreenX(S6 동기).
- **integration**: P1~P8 안전 줄 존재(동시 ≤2), **walls 줄점유 1회 데미지(P0)**, wave/scream 안전 줄 존재, 충돌 축(worldX±half, 줄 일치).
- **e2e(수동)**: 1월드 전체 사이클 + 줄이동 회피/자동사격/스킬/부활.
- **observability**: fps·드로우콜, visibilitychange pause, 장시간 세션.

---

## 수용 기준 매핑 (설계서 §21)
- 문서 v3.1 동기 → S0 · three 제거·Canvas 2D → S2,S6 · 우측 달리기·좌측 스크롤 → S2,S4 · **위/아래 3줄 회피(점프/슬라이드 없음)·안전 줄 ≥1 → S1,S3,S4**
- 전체 사이클·6월드·해금 → S4,S5,S7 · 타이틀 6버튼+잠금 → S4(Screens)/S7 · 자동사격+스킬(기본2+해금2) → S4,S5
- 몬스터18·보스12 → S3,S5 · **walls 정상 데미지(P0)·wave/scream 줄 회피 → S5+integration** · 성장/픽업/점수 → S4 · 보상 외형/영속 → S5,S6
- 장애물 P1~P8 램프·안전 줄 → S4 · 4단계 튜토리얼 → S4/S5 · 자동스킬+자동 회피 보조 → S4,S5 · 보스 약점 피드백 → S5
- 체크포인트 부활 → S4(보존) · i18n → S1(문구) · 월드별 최고점수 → S4(보존) · 스테이지 인트로·visibilitychange → S2,S6
- 사운드 인터페이스+전수 배선 → S6 · HUD 구성 → S2,S6 · 기존 WebP 35 재사용 → 전 단계 유지 · 실기기 프레임레이트 → S7(QA 유예)

---

## ADR (Architecture Decision Record)
- **결정**: Three.js 2.5D 서브웨이서퍼 → HTML5 Canvas 2D **우측 사이드스크롤 · 순수 3줄 닷지** 러너로 클린 스윕 전환. 게임 컨셉/시스템 보존.
- **드라이버**: 컴파일 붕괴 최소화, 좌표축 회전 정확성, 회귀 방지(P0 walls·안전 줄 불변식), 6~12세 조작 단순화.
- **고려한 대안**: (A) 점진 스트랭글러 — 좌표 의미 상이로 부적합. (C) 병행 재작성 — 재사용 자산 복제 과함. 점프/슬라이드 유지안 — 사용자가 순수 닷지 선택으로 기각.
- **선택 이유**: 이중 좌표계 없이 목표 구조 직행 + 단계 게이트/shim으로 컴파일 그린 보장 + 닷지화로 조작·시각·리뷰 복잡도 동시 감소.
- **결과(Consequences)**: 렌더러 신설·three 제거, 엔티티 draw 이식, 보스 패턴 줄 회피 재설계, 튜토리얼/문서 갱신. 단기 시각 미완(도형)은 M2~ 스프라이트로 해소.
- **후속(Follow-ups)**: M1 밸런스/테스트 마감, M2~ 스프라이트 교체, 실기기 프레임레이트 QA(S7 유예 항목).
