# M0 S4 (G003) 순수 3줄 닷지 게임플레이 QA/레드팀 리포트

## 빌드/테스트 (leader 직접 실행, 커밋 ede9212)
- `pnpm build` (tsc && vite build): exit 0, 30 modules, 타입오류 0, index-*.js 252KB.
- `pnpm test` (vitest): 21/21 passed (config.test.ts 5 + rules.test.ts 16). 회귀 없음.

## grep 검증 (leader search)
- Combat.ts / HUD.ts / Camera.ts: `import * as THREE`·`THREE.` = 0.
- config.ts / Input.ts: jump·slide·coyote·gravity·'left'·'right'·LOW·HIGH·PIT·P9·P10 = 0.
- ObstacleType = BLOCK|MOVER, PatternId = P1~P8, tutorial.steps 4단계.

## 안전-줄 불변식 (executor 17-QaExecS4)
| 검사 | 방법 | 결과 |
|------|------|------|
| pickThreatLanes 안전 줄 ≥1 | count=min(n,laneCount-1), 경계 n=0..≥4 손계산 | PASS(최소 여유 safe=1) |
| Spawner P1~P8 동시 ≤2줄 | buildPattern 8 case 소스 리뷰 | PASS(전 패턴 ≤2줄, maxBlockedLanes 2<count 3) |
| MOVER 단일 줄 점유 | Obstacle lane 스칼라+이산 이동 리뷰 | PASS(항상 1줄) |
| Combat 충돌 축 점프/슬라이드 잔재 | src 전수 검색 | 0건 |
| Input up/down만 | Input/Player.tryAction 리뷰 | PASS |

## Architect (16-QaArchS4)
- architectureStatus / productStatus / codeStatus 전부 CLEAR, recommendation APPROVE. blockers 0.
- LOW 4건(비차단): enemyProjHalfY dead config, obsLow dead theme 필드, findTarget '같은 줄 우선' 문언 편차(기능 정상), Boss wave/scream S5 shim(항상 회피실패로 평가 — G004 축 전환 예정).

## 한계
- 브라우저(Chromium) 스폰 불가 → 라이브 GUI 플레이 실측은 S7/실기기 QA 유예. 본 게이트는 build+typecheck+unit+안전줄 정적 검증+grep으로 검증.
- 패턴레벨 안전줄·MOVER per-frame·walls 1회 integration 테스트는 S7(G005 검증) 범위.
